from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from .routers.health import router as health_router
from .routers.datasets import router as datasets_router
from .routers.training_runs import router as training_runs_router
from .routers.shared_reports import router as shared_reports_router
from .routers.assistant import router as assistant_router
from .core.rate_limit import limiter


app = FastAPI(title="DataPilot AI API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production using env-configured frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)

app.include_router(health_router)
app.include_router(datasets_router)
app.include_router(training_runs_router)
app.include_router(shared_reports_router)
app.include_router(assistant_router)


@app.exception_handler(RateLimitExceeded)
def rate_limit_handler(_request, _exc):
    return {"detail": "Rate limit exceeded. Please try again later."}

