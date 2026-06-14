from __future__ import annotations

from datetime import datetime, timedelta, timezone

from celery.utils.log import get_task_logger

from ..core.config import get_settings
from ..services.app_logs import log_to_supabase
from ..services.supabase import rest_delete, rest_list, storage_list, storage_remove
from ..worker.celery_app import celery_app

logger = get_task_logger(__name__)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    # PostgREST expects an ISO8601 timestamp; keep timezone.
    return dt.isoformat()


async def run_ttl_cleanup() -> dict:
    settings = get_settings()
    if not settings.ttl_cleanup_enabled:
        return {"ok": True, "skipped": "disabled"}

    now = _utc_now()
    dataset_cutoff = now.replace(microsecond=0)  # keep queries stable
    dataset_cutoff = dataset_cutoff - timedelta(hours=settings.dataset_ttl_hours)

    deleted_datasets = 0
    skipped_busy = 0
    deleted_objects = 0
    deleted_models = 0
    skipped_cleanup_errors = 0

    # List candidate datasets that haven't been updated recently.
    # We only need a small selection; storage deletion uses prefix listing.
    ds_rows = await rest_list(
        "datasets",
        query=(
            f"updated_at=lt.{_iso(dataset_cutoff)}"
            f"&select=dataset_id,user_id,updated_at"
            f"&order=updated_at.asc"
            f"&limit=200"
        ),
    )

    for ds in ds_rows:
        dataset_id = ds["dataset_id"]
        user_id = ds["user_id"]

        runs = await rest_list(
            "training_runs",
            query=f"dataset_id=eq.{dataset_id}&select=run_id,status,results_json,user_id",
        )
        if any(r.get("status") in ("queued", "running") for r in runs):
            skipped_busy += 1
            continue

        cleanup_failed = False

        # Delete model artifacts referenced by runs.
        for r in runs:
            results = r.get("results_json") or {}
            model_path = results.get("model_storage_path")
            if model_path:
                try:
                    await storage_remove("datasets", str(model_path))
                    deleted_models += 1
                except Exception as e:
                    cleanup_failed = True
                    logger.warning("Failed to delete model artifact %s for dataset %s: %s", model_path, dataset_id, e)

        # Delete all objects in the dataset prefix.
        prefix = f"{user_id}/datasets/{dataset_id}/"
        try:
            offset = 0
            while True:
                objs = await storage_list("datasets", prefix, limit=1000, offset=offset)
                if not objs:
                    break
                for o in objs:
                    name = o.get("name")
                    if not name:
                        continue
                    object_path = str(name)
                    if not object_path.startswith(prefix):
                        object_path = f"{prefix}{object_path}"
                    try:
                        await storage_remove("datasets", object_path)
                        deleted_objects += 1
                    except Exception as e:
                        cleanup_failed = True
                        logger.warning("Failed to delete dataset object %s: %s", object_path, e)
                if len(objs) < 1000:
                    break
                offset += 1000
        except Exception as e:
            cleanup_failed = True
            logger.warning("Failed to list storage objects for dataset %s: %s", dataset_id, e)

        if cleanup_failed:
            skipped_cleanup_errors += 1
            continue

        # Delete dataset row (cascades runs + shared reports).
        try:
            await rest_delete("datasets", where_query=f"dataset_id=eq.{dataset_id}")
            deleted_datasets += 1
        except Exception as e:
            logger.warning("Failed to delete dataset %s: %s", dataset_id, e)

    # Optional: expire old share links even if dataset stays.
    try:
        share_cutoff = now.replace(microsecond=0) - timedelta(hours=settings.shared_report_ttl_hours)
        await rest_delete("shared_reports", where_query=f"created_at=lt.{_iso(share_cutoff)}")
    except Exception:
        pass

    await log_to_supabase(
        level="info",
        event="worker_ttl_cleanup_completed",
        message="TTL cleanup cycle completed",
        metadata={
            "deleted_datasets": deleted_datasets,
            "skipped_busy": skipped_busy,
            "skipped_cleanup_errors": skipped_cleanup_errors,
            "deleted_dataset_objects": deleted_objects,
            "deleted_models": deleted_models,
        },
    )

    return {
        "ok": True,
        "deleted_datasets": deleted_datasets,
        "skipped_busy": skipped_busy,
        "skipped_cleanup_errors": skipped_cleanup_errors,
        "deleted_dataset_objects": deleted_objects,
        "deleted_models": deleted_models,
    }


@celery_app.task(name="acutizeai.cleanup_ttl", bind=True)
def cleanup_ttl(self) -> dict:
    import asyncio
    return asyncio.run(run_ttl_cleanup())


def _await(coro):
    import asyncio

    if asyncio.iscoroutine(coro):
        return asyncio.run(coro)
    return coro
