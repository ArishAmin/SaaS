from __future__ import annotations

from typing import Any

from .app_logs import log_to_supabase


async def log_user_activity(
    *,
    user_id: str,
    action: str,
    dataset_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    payload_meta: dict[str, Any] = dict(metadata or {})
    if dataset_id:
        payload_meta["dataset_id"] = dataset_id

    await log_to_supabase(
        level="info",
        event="user_activity",
        user_id=user_id,
        message=action,
        metadata=payload_meta,
    )
