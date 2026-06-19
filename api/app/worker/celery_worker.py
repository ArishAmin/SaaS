from ..core.config import get_settings
from .celery_app import celery_app


def _validate_worker_config() -> None:
    settings = get_settings()
    missing = [
        name
        for name, value in (
            ("SUPABASE_URL", settings.supabase_url),
            ("SUPABASE_SERVICE_ROLE_KEY", settings.supabase_service_role_key),
        )
        if not value
    ]
    if missing:
        raise RuntimeError(
            "Worker missing required env vars: "
            f"{', '.join(missing)}. "
            "In Render, open acutize-worker -> Environment and copy the same "
            "Supabase values used on acutize-api."
        )


_validate_worker_config()

__all__ = ["celery_app"]
