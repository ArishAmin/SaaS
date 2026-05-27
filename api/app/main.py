import logging
import time
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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
from .core.config import get_settings
from .core.rate_limit import limiter
from .core.http_client import HTTPClient
from .middleware.security import SecurityHeadersMiddleware
from .services.app_logs import log_to_supabase
from .services.credits import begin_credit_tracking, end_credit_tracking, refund_tracked_credits

logger = logging.getLogger(__name__)


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

@app.exception_handler(RateLimitExceeded)
def rate_limit_handler(_request, _exc):
    return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded. Please try again later."})

# 2. Performance & Logging Layer
@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    request_id = str(uuid4())
    start = time.perf_counter()
    credit_token = begin_credit_tracking()

    try:
        response = await call_next(request)
        if response.status_code >= 400:
            await refund_tracked_credits(reason=f"http_{response.status_code}")
        duration_ms = int((time.perf_counter() - start) * 1000)
        response.headers["X-Request-ID"] = request_id
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
                metadata={"query": request.url.query},
            )
        )
        return response
    except Exception as exc:
        await refund_tracked_credits(reason="unhandled_exception")
        duration_ms = int((time.perf_counter() - start) * 1000)
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
                error={"type": exc.__class__.__name__, "detail": str(exc)},
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
