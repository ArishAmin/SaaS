from __future__ import annotations

import json
import logging
from contextvars import ContextVar, Token
from typing import Any

from ..core.config import get_settings
from .supabase import rest_insert

logger = logging.getLogger(__name__)
_log_context: ContextVar[dict[str, Any]] = ContextVar("app_log_context", default={})

MAX_TEXT = 5000
MAX_JSON_TEXT = 20000


def set_log_context(**values: Any) -> Token[dict[str, Any]]:
    current = dict(_log_context.get() or {})
    current.update({k: v for k, v in values.items() if v is not None})
    return _log_context.set(current)


def reset_log_context(token: Token[dict[str, Any]]) -> None:
    _log_context.reset(token)


def _truncate_text(value: str | None, limit: int = MAX_TEXT) -> str | None:
    if value is None:
        return None
    return value if len(value) <= limit else value[: limit - 20] + "...[truncated]"


def _safe_json(value: dict[str, Any] | None) -> dict[str, Any] | None:
    if value is None:
        return None
    try:
        raw = json.dumps(value, default=str)
        if len(raw) > MAX_JSON_TEXT:
            return {"truncated": True, "preview": raw[: MAX_JSON_TEXT - 50]}
        return json.loads(raw)
    except Exception:
        return {"unserializable": str(value)[:MAX_TEXT]}


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
    source: str | None = None,
    action: str | None = None,
    dataset_id: str | None = None,
    session_id: str | None = None,
    user_agent: str | None = None,
    ip_hash: str | None = None,
    path_template: str | None = None,
    metadata: dict[str, Any] | None = None,
    error: dict[str, Any] | None = None,
) -> None:
    settings = get_settings()
    if not settings.supabase_log_enabled:
        return

    ctx = _log_context.get() or {}
    payload: dict[str, Any] = {
        "level": level,
        "event": event,
        "message": _truncate_text(message),
        "user_id": user_id or ctx.get("user_id"),
        "method": method or ctx.get("method"),
        "path": path or ctx.get("path"),
        "status_code": status_code,
        "duration_ms": duration_ms,
        "request_id": request_id or ctx.get("request_id"),
        "source": source or ctx.get("source") or "api",
        "action": action,
        "dataset_id": dataset_id or ctx.get("dataset_id"),
        "session_id": session_id or ctx.get("session_id"),
        "user_agent": _truncate_text(user_agent or ctx.get("user_agent"), 1000),
        "ip_hash": ip_hash or ctx.get("ip_hash"),
        "path_template": path_template or ctx.get("path_template"),
        "metadata": _safe_json(metadata),
        "error": _safe_json(error),
    }
    clean_payload = {k: v for k, v in payload.items() if v is not None}

    try:
        await rest_insert("app_logs", [clean_payload])
    except Exception as exc:
        # If production has not yet run the expanded app_logs migration, fall
        # back to the original table shape so logging continues.
        logger.warning(
            "app_logs expanded insert failed; using legacy fallback. error=%s",
            str(exc)[:500],
        )
        legacy_keys = {
            "level",
            "event",
            "message",
            "user_id",
            "method",
            "path",
            "status_code",
            "duration_ms",
            "request_id",
            "metadata",
            "error",
        }
        legacy_payload = {k: v for k, v in clean_payload.items() if k in legacy_keys}
        fallback_context = {
            k: v
            for k, v in clean_payload.items()
            if k
            in {
                "source",
                "action",
                "dataset_id",
                "session_id",
                "user_agent",
                "ip_hash",
                "path_template",
            }
        }
        if fallback_context:
            existing_metadata = legacy_payload.get("metadata")
            if not isinstance(existing_metadata, dict):
                existing_metadata = {}
            legacy_payload["metadata"] = {
                **existing_metadata,
                "_expanded_log_fallback": True,
                "_expanded_fields": fallback_context,
            }
        try:
            await rest_insert("app_logs", [legacy_payload])
        except Exception:
            return
        # Logging must never break main request lifecycle.
        return
