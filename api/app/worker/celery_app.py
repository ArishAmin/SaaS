from celery import Celery
import socket
from urllib.parse import urlparse

from ..core.config import get_settings

settings = get_settings()

redis_url = settings.redis_url


def _redis_reachable(url: str, timeout_s: float = 1.5) -> bool:
    """
    Local dev guardrail:
    - If Redis isn't running, Celery can’t enqueue async jobs.
    - We fall back to eager execution so the website can still be tested.
    """
    try:
        parsed = urlparse(url)
        host = parsed.hostname
        port = parsed.port or 6379
        if not host:
            return False
        with socket.create_connection((host, port), timeout=timeout_s):
            return True
    except Exception:
        return False


# Force Redis queue in production without eager fallback. True scalability relies on asynchronous brokers.
use_eager_fallback = False

broker_url = redis_url
backend_url = redis_url
celery_kwargs: dict[str, object] = {
    # Provide robust scaling properties to prevent memory hogs on huge datasets 
    "worker_prefetch_multiplier": 1,
    "task_acks_late": True
}

if use_eager_fallback:
    # Eager execution + in-memory transports allows local testing without Redis.
    broker_url = "memory://"
    backend_url = "cache+memory://"
    celery_kwargs["task_always_eager"] = True
    celery_kwargs["task_store_eager_result"] = False

celery_app = Celery("acutizeai", broker=broker_url, backend=backend_url)

# Sensible defaults for ML jobs
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    **celery_kwargs,
)

# Periodic jobs (Celery beat)
if settings.ttl_cleanup_enabled:
    celery_app.conf.beat_schedule = {
        "ttl-cleanup": {
            "task": "acutizeai.cleanup_ttl",
            "schedule": settings.ttl_cleanup_interval_minutes * 60,
        }
    }

# Ensure tasks are registered when running a worker/beat.
from . import tasks_full_training as _tasks_full_training  # noqa: E402,F401
from . import tasks_ttl_cleanup as _tasks_ttl_cleanup  # noqa: E402,F401

