from celery import Celery

from ..core.config import get_settings

settings = get_settings()

redis_url = settings.redis_url

celery_app = Celery(
    "datapilotai",
    broker=redis_url,
    backend=redis_url,
)

# Sensible defaults for ML jobs
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
)

# Periodic jobs (Celery beat)
if settings.ttl_cleanup_enabled:
    celery_app.conf.beat_schedule = {
        "ttl-cleanup": {
            "task": "datapilotai.cleanup_ttl",
            "schedule": settings.ttl_cleanup_interval_minutes * 60,
        }
    }

# Ensure tasks are registered when running a worker/beat.
from . import tasks_full_training as _tasks_full_training  # noqa: E402,F401
from . import tasks_ttl_cleanup as _tasks_ttl_cleanup  # noqa: E402,F401

