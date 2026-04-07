import time
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from .routers.health import router as health_router
from .routers.datasets import router as datasets_router
from .routers.training_runs import router as training_runs_router
from .routers.shared_reports import router as shared_reports_router
from .routers.assistant import router as assistant_router
from .routers.telemetry import router as telemetry_router
from .core.rate_limit import limiter
from .services.app_logs import log_to_supabase


app = FastAPI(title="DataPilot AI API", version="0.1.0")

# 1. Base App Middlewares (Inner layers)
app.include_router(health_router)
app.include_router(datasets_router)
app.include_router(training_runs_router)
app.include_router(shared_reports_router)
app.include_router(assistant_router)
app.include_router(telemetry_router)

@app.exception_handler(RateLimitExceeded)
def rate_limit_handler(_request, _exc):
    return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded. Please try again later."})

# 2. Performance & Logging Layer
@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    request_id = str(uuid4())
    start = time.perf_counter()

    try:
        response = await call_next(request)
        duration_ms = int((time.perf_counter() - start) * 1000)
        response.headers["X-Request-ID"] = request_id
        await log_to_supabase(
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
        return response
    except Exception as exc:
        duration_ms = int((time.perf_counter() - start) * 1000)
        await log_to_supabase(
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
        # Ensure we return a JSONResponse that Starlette can handle.
        # Note: CORS headers will be added by the CORSMiddleware layer which wraps this.
        return JSONResponse(
            status_code=500,
            content={
                "detail": "Internal server error occurred.",
                "request_id": request_id, 
                "type": exc.__class__.__name__
            }
        )

# 3. Rate Limiting layer (Middle)
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)

# 4. Local Dev Private Network Handling
# Removed from inner layer to be added as an outermost layer.

# 5. CORS Layer (Outermost)
# We add this LAST so it is the first to handle requests and the last to handle responses.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://localhost:3000",
        "https://127.0.0.1:3000",
    ],
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

# 6. PNA Layer (Absolute Outermost)
app.add_middleware(PNAMiddleware)
