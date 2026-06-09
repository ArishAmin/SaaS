import logging
import hashlib
import time
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from jose import jwt
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
import asyncio
from contextlib import asynccontextmanager

from .routers.health import router as health_router
from .routers.datasets import router as datasets_router
from .routers.training_runs import router as training_runs_router
from .routers.shared_reports import router as shared_reports_router
from .routers.assistant import router as assistant_router
from .routers.telemetry import router as telemetry_router
from .routers.billing import router as billing_router
from .routers.profiles import router as profiles_router
from .routers.admin import router as admin_router
from .routers.support import router as support_router
from .routers.forecasting import router as forecasting_router
from .routers.business_insights import router as business_insights_router
from .core.config import get_settings
from .core.rate_limit import limiter
from .core.http_client import HTTPClient
from .middleware.security import SecurityHeadersMiddleware
from .services.app_logs import log_to_supabase, reset_log_context, set_log_context
from .services.credits import begin_credit_tracking, end_credit_tracking, refund_tracked_credits

logger = logging.getLogger(__name__)


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()
    return request.client.host if request.client else None


def _hash_ip(ip: str | None) -> str | None:
    if not ip:
        return None
    return hashlib.sha256(ip.encode("utf-8")).hexdigest()[:32]


def _user_id_from_auth_header(request: Request) -> str | None:
    auth_header = request.headers.get("Authorization") or ""
    if not auth_header.lower().startswith("bearer "):
        return None
    token = auth_header.split(" ", 1)[1].strip()
    try:
        claims = jwt.get_unverified_claims(token)
        sub = claims.get("sub")
        return str(sub) if sub else None
    except Exception:
        return None


def _should_log_request(method: str, path: str, status_code: int) -> bool:
    # Always keep failures, even for otherwise noisy endpoints.
    if status_code >= 400:
        return True
    if method.upper() == "OPTIONS":
        return False
    if path in {
        "/health",
        "/profiles/me",
        "/telemetry/client-log",
    }:
        return False
    return True


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize connection pool
    HTTPClient.get_client()
    yield
    # Cleanup on shutdown
    await HTTPClient.close()

app = FastAPI(title="Acutize API", version="0.1.0", lifespan=lifespan)

# 1. Base App Middlewares (Inner layers)
app.include_router(health_router)
app.include_router(datasets_router)
app.include_router(training_runs_router)
app.include_router(shared_reports_router)
app.include_router(assistant_router)
app.include_router(telemetry_router)
app.include_router(billing_router)
app.include_router(profiles_router)
app.include_router(admin_router)
app.include_router(support_router)
app.include_router(forecasting_router)
app.include_router(business_insights_router)

@app.exception_handler(RateLimitExceeded)
def rate_limit_handler(_request, _exc):
    return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded. Please try again later."})

# 2. Performance & Logging Layer
@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    request_id = str(uuid4())
    start = time.perf_counter()
    credit_token = begin_credit_tracking()
    user_id = _user_id_from_auth_header(request)
    user_agent = request.headers.get("user-agent")
    ip_hash = _hash_ip(_client_ip(request))
    session_id = request.headers.get("x-acutize-session-id")
    log_token = set_log_context(
        request_id=request_id,
        source="api",
        method=request.method,
        path=request.url.path,
        user_id=user_id,
        user_agent=user_agent,
        ip_hash=ip_hash,
        session_id=session_id,
    )

    try:
        response = await call_next(request)
        route = request.scope.get("route")
        path_template = getattr(route, "path", None)
        if response.status_code >= 400:
            await refund_tracked_credits(reason=f"http_{response.status_code}")
        duration_ms = int((time.perf_counter() - start) * 1000)
        response.headers["X-Request-ID"] = request_id
        if _should_log_request(request.method, request.url.path, response.status_code):
            asyncio.create_task(
                log_to_supabase(
                    level="info",
                    event="http_request",
                    message="Request completed",
                    method=request.method,
                    path=request.url.path,
                    status_code=response.status_code,
                    duration_ms=duration_ms,
                    request_id=request_id,
                    user_id=user_id,
                    user_agent=user_agent,
                    ip_hash=ip_hash,
                    session_id=session_id,
                    path_template=path_template,
                    metadata={
                        "query": request.url.query,
                    },
                )
            )
        return response
    except Exception as exc:
        await refund_tracked_credits(reason="unhandled_exception")
        duration_ms = int((time.perf_counter() - start) * 1000)
        route = request.scope.get("route")
        path_template = getattr(route, "path", None)
        logger.exception(
            "Unhandled API error request_id=%s method=%s path=%s duration_ms=%s",
            request_id,
            request.method,
            request.url.path,
            duration_ms,
        )
        asyncio.create_task(
            log_to_supabase(
                level="error",
                event="http_request_error",
                message=str(exc),
                method=request.method,
                path=request.url.path,
                status_code=500,
                duration_ms=duration_ms,
                request_id=request_id,
                user_id=user_id,
                user_agent=user_agent,
                ip_hash=ip_hash,
                session_id=session_id,
                error={"type": exc.__class__.__name__, "detail": str(exc)},
                path_template=path_template,
                metadata={"query": request.url.query},
            )
        )
        # Ensure we return a JSONResponse that Starlette can handle.
        # Note: CORS headers will be added by the CORSMiddleware layer which wraps this.
        settings = get_settings()
        detail = "Internal server error occurred."
        if settings.app_env != "production":
            detail = str(exc)
        return JSONResponse(
            status_code=500,
            content={
                "detail": detail,
                "request_id": request_id,
            },
        )
    finally:
        reset_log_context(log_token)
        end_credit_tracking(credit_token)

# 3. Rate Limiting layer (Middle)
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)

# 4. Local Dev Private Network Handling
# Removed from inner layer to be added as an outermost layer.

def _cors_origins() -> list[str]:
    settings = get_settings()
    origins = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]
    if settings.app_env != "production":
        for local in (
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ):
            if local not in origins:
                origins.append(local)
    return origins


# 5. CORS Layer (Outermost)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

class PNAMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if request.method == "OPTIONS":
            response.headers["Access-Control-Allow-Private-Network"] = "true"
        return response

app.add_middleware(SecurityHeadersMiddleware)

# 6. PNA Layer (Absolute Outermost)
app.add_middleware(PNAMiddleware)
