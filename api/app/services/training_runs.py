"""Persist instant-preview training runs and pipeline events to Supabase."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from .supabase import rest_insert


async def record_instant_training_run(
    *,
    user_id: str,
    dataset_id: str,
    results_json: dict[str, Any] | None,
    target_column: str,
    data_source: str,
    sample_rows: int,
    duration_ms: int,
    status: str = "completed",
    error: str | None = None,
    run_id: str | None = None,
) -> str:
    rid = run_id or str(uuid4())
    await rest_insert(
        "training_runs",
        [
            {
                "run_id": rid,
                "user_id": user_id,
                "dataset_id": dataset_id,
                "status": status,
                "results_json": results_json,
                "error": error,
                "target_column": target_column,
                "data_source": data_source,
                "sample_rows": sample_rows,
                "duration_ms": duration_ms,
            }
        ],
    )
    return rid


async def log_dataset_event(
    *,
    user_id: str,
    dataset_id: str,
    event_type: str,
    status: str = "completed",
    metadata: dict[str, Any] | None = None,
    error: str | None = None,
    duration_ms: int | None = None,
) -> str:
    event_id = str(uuid4())
    await rest_insert(
        "dataset_events",
        [
            {
                "event_id": event_id,
                "user_id": user_id,
                "dataset_id": dataset_id,
                "event_type": event_type,
                "status": status,
                "metadata": metadata or {},
                "error": error,
                "duration_ms": duration_ms,
            }
        ],
    )
    return event_id
