from __future__ import annotations

from typing import Any

from ..core.config import get_settings
from .supabase import rest_insert


async def log_to_supabase(
    *,
    level: str,
    event: str,
    message: str | None = None,
    user_id: str | None = None,
    method: str | None = None,
    path: str | None = None,
    status_code: int | None = None,
    duration_ms: int | None = None,
    request_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    error: dict[str, Any] | None = None,
) -> None:
    settings = get_settings()
    if not settings.supabase_log_enabled:
        return

    payload: dict[str, Any] = {
        "level": level,
        "event": event,
        "message": message,
        "user_id": user_id,
        "method": method,
        "path": path,
        "status_code": status_code,
        "duration_ms": duration_ms,
        "request_id": request_id,
        "metadata": metadata,
        "error": error,
    }
    clean_payload = {k: v for k, v in payload.items() if v is not None}

    try:
        await rest_insert("app_logs", [clean_payload])
    except Exception:
        # Logging must never break main request lifecycle.
        return
