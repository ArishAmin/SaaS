from __future__ import annotations

import logging
from typing import Any
from datetime import datetime, timezone
from uuid import UUID

import httpx
from fastapi import HTTPException, status
from fastapi.responses import Response

from ..core.config import get_settings
from ..services.app_logs import log_to_supabase
from ..services.credits import (
    CreditAction,
    build_credit_idempotency_key,
    charge_credits,
    refund_job_charge,
)
from .supabase import rest_insert, rest_list, rest_patch, rest_rpc, storage_upload
from .workspaces import get_active_workspace

logger = logging.getLogger(__name__)

HEAVY_ACTIONS = {
    "analyze",
    "clean",
    "train_instant",
    "forecast",
    "business_insights",
    "export_pdf",
    "export_bundle",
    "recommend",
    "feature_suggest",
    "feature_engineer",
    "eda",
    "quality",
}

# User-facing features shown in company "Recent activity" (not analyze sub-steps like eda/quality).
FEATURE_ACTIVITY_ACTIONS = frozenset(
    {
        "analyze",
        "clean",
        "train_instant",
        "forecast",
        "business_insights",
        "export_pdf",
        "export_bundle",
        "recommend",
        "feature_suggest",
        "feature_engineer",
    }
)

JOB_ACTION_CREDITS: dict[str, CreditAction | None] = {
    "analyze": CreditAction.ANALYZE,
    "clean": CreditAction.CLEAN,
    "train_instant": CreditAction.TRAIN_INSTANT,
    "forecast": CreditAction.FORECAST,
    "business_insights": CreditAction.BUSINESS_INSIGHTS,
    "export_pdf": CreditAction.EXPORT_PDF,
    "export_bundle": CreditAction.EXPORT_BUNDLE,
    "recommend": CreditAction.RECOMMEND,
    "feature_suggest": CreditAction.FEATURE_SUGGEST,
    "feature_engineer": CreditAction.FEATURE_ENGINEER,
    "eda": None,
    "quality": None,
}


def should_enqueue_background_job(user: dict[str, Any] | None = None) -> bool:
    if user and user.get("_job_worker"):
        return False
    return bool(get_settings().background_jobs_enabled)


def job_response(job: dict[str, Any]) -> dict[str, Any]:
    status = str(job.get("status") or "queued")
    resp: dict[str, Any] = {
        "job_id": str(job["job_id"]),
        "status": status,
        "action": job.get("action"),
        "dataset_id": job.get("dataset_id"),
        "queued": status in ("queued", "running"),
    }
    if status == "completed" and job.get("result_json") is not None:
        resp["result_json"] = job.get("result_json")
    if status in ("failed", "canceled"):
        resp["error"] = job.get("error")
    return resp


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _find_job_by_idempotency(organization_id: str, idempotency_key: str) -> dict[str, Any] | None:
    rows = await rest_list(
        "processing_jobs",
        f"organization_id=eq.{organization_id}&idempotency_key=eq.{idempotency_key}&select=*",
    )
    return rows[0] if rows else None


async def create_processing_job(
    *,
    user_id: str,
    action: str,
    dataset_id: str | None,
    payload: dict[str, Any],
    idempotency_key: str | None = None,
    credit_transaction_id: str | None = None,
) -> dict[str, Any]:
    if action not in HEAVY_ACTIONS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported job action")

    workspace = await get_active_workspace(user_id)
    organization_id = str(workspace["organization_id"])
    settings = get_settings()

    queued = await rest_list(
        "processing_jobs",
        (
            f"organization_id=eq.{organization_id}"
            "&status=in.(queued,running)"
            "&select=job_id"
            f"&limit={settings.max_queued_jobs_per_workspace + 1}"
        ),
    )
    if len(queued) >= settings.max_queued_jobs_per_workspace:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="This workspace has too many queued jobs. Please wait for current jobs to finish.",
        )

    if idempotency_key:
        existing = await _find_job_by_idempotency(organization_id, idempotency_key)
        if existing:
            return existing

    try:
        row = await rest_insert(
            "processing_jobs",
            [
                {
                    "organization_id": organization_id,
                    "user_id": user_id,
                    "dataset_id": dataset_id,
                    "action": action,
                    "payload": payload,
                    "idempotency_key": idempotency_key,
                    "credit_transaction_id": credit_transaction_id,
                }
            ],
        )
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 409 and idempotency_key:
            existing = await _find_job_by_idempotency(organization_id, idempotency_key)
            if existing:
                return existing
        raise

    await log_job_event(
        "job_queued",
        job_id=str(row["job_id"]),
        organization_id=organization_id,
        user_id=user_id,
        dataset_id=dataset_id,
        action=action,
        metadata={
            "idempotency_key": idempotency_key,
            "credit_transaction_id": credit_transaction_id,
        },
    )
    return row


async def try_run_job_immediately(job_id: str) -> dict[str, Any] | None:
    started, reason = await try_start_job(job_id)
    if not started:
        logger.info("Job %s not started inline: %s", job_id, reason)
        return None

    from .job_runner import run_claimed_processing_job

    return await run_claimed_processing_job(job_id)


async def dispatch_processing_job(job_id: str) -> None:
    from ..worker.tasks_processing import process_job

    process_job.delay(job_id)


async def enqueue_processing_job(
    *,
    user_id: str,
    action: str,
    dataset_id: str | None,
    payload: dict[str, Any],
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    workspace = await get_active_workspace(user_id)
    organization_id = str(workspace["organization_id"])

    if idempotency_key:
        existing = await _find_job_by_idempotency(organization_id, idempotency_key)
        if existing:
            if existing.get("status") == "queued":
                finished = await try_run_job_immediately(str(existing["job_id"]))
                if finished:
                    return job_response(finished)
                await dispatch_processing_job(str(existing["job_id"]))
            return job_response(existing)

    credit_action = JOB_ACTION_CREDITS.get(action)
    credit_transaction_id: str | None = None

    if credit_action:
        credit_key = build_credit_idempotency_key(idempotency_key, credit_action, dataset_id)
        charge = await charge_credits(
            user_id,
            credit_action,
            dataset_id=dataset_id,
            idempotency_key=credit_key,
            source="job_enqueue",
        )
        credit_transaction_id = charge.transaction_id

    try:
        row = await create_processing_job(
            user_id=user_id,
            action=action,
            dataset_id=dataset_id,
            payload=payload,
            idempotency_key=idempotency_key,
            credit_transaction_id=credit_transaction_id,
        )
    except Exception:
        if credit_transaction_id:
            await refund_job_charge(
                {
                    "user_id": user_id,
                    "organization_id": organization_id,
                    "credit_transaction_id": credit_transaction_id,
                    "dataset_id": dataset_id,
                },
                reason="job_create_failed",
            )
        raise

    if row.get("status") != "queued":
        return job_response(row)

    job_id = str(row["job_id"])
    finished = await try_run_job_immediately(job_id)
    if finished:
        return job_response(finished)

    try:
        await dispatch_processing_job(job_id)
    except Exception as exc:
        logger.exception("Failed to enqueue Celery task for job_id=%s", job_id)
        await fail_job(job_id, "Job queue unavailable. Please try again.", log=True)
        await refund_job_charge(row, reason="enqueue_failed")
        await log_job_event(
            "job_enqueue_failed",
            job_id=job_id,
            organization_id=str(row.get("organization_id")),
            user_id=user_id,
            dataset_id=dataset_id,
            action=action,
            error={"type": exc.__class__.__name__, "detail": str(exc)},
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Background job queue is temporarily unavailable. Credits were refunded.",
        ) from exc

    return job_response(row)


async def cancel_job(job_id: str, user_id: str) -> dict[str, Any]:
    result = await rest_rpc("cancel_processing_job", {"p_job_id": job_id, "p_user_id": user_id})
    row = result[0] if isinstance(result, list) and result else {}
    if not row.get("canceled"):
        reason = str(row.get("reason") or "not_cancelable")
        if reason == "job_not_found":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
        if reason == "not_org_member":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Workspace access denied")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only queued jobs can be canceled.",
        )

    jobs = await rest_list("processing_jobs", f"job_id=eq.{job_id}&select=*")
    if jobs:
        await refund_job_charge(jobs[0], reason="job_canceled")
    await log_job_event(
        "job_canceled",
        job_id=job_id,
        user_id=user_id,
        metadata={"credit_transaction_id": row.get("credit_transaction_id")},
    )
    return {"job_id": job_id, "status": "canceled", "canceled": True}


async def recover_stale_jobs() -> dict[str, Any]:
    settings = get_settings()
    result = await rest_rpc(
        "recover_stale_processing_jobs",
        {"p_timeout_minutes": settings.job_stale_timeout_minutes},
    )
    rows = result if isinstance(result, list) else []
    refunded = 0
    for row in rows:
        if not isinstance(row, dict):
            continue
        job_id = str(row.get("job_id") or "")
        await log_job_event(
            "job_stale_recovered",
            job_id=job_id,
            organization_id=str(row.get("organization_id")) if row.get("organization_id") else None,
            user_id=str(row.get("user_id")) if row.get("user_id") else None,
            action=str(row.get("action")) if row.get("action") else None,
            metadata={"reason": row.get("reason")},
        )
        if row.get("credit_transaction_id"):
            await refund_job_charge(row, reason="stale_timeout")
            refunded += 1
    return {"recovered": len(rows), "refunded": refunded}


async def try_start_job(job_id: str) -> tuple[bool, str]:
    settings = get_settings()
    result = await rest_rpc(
        "try_start_processing_job",
        {
            "p_job_id": job_id,
            "p_worker_id": settings.worker_id,
            "p_stale_timeout_minutes": settings.job_stale_timeout_minutes,
        },
    )
    row = result[0] if isinstance(result, list) and result else {}
    return bool(row.get("started")), str(row.get("reason") or "unknown")


async def complete_job(job_id: str, result_json: dict[str, Any] | None = None) -> None:
    await rest_patch(
        "processing_jobs",
        f"job_id=eq.{job_id}&select=job_id",
        {
            "status": "completed",
            "result_json": result_json or {},
            "completed_at": _now(),
            "error": None,
        },
    )
    await log_job_event("job_completed", job_id=job_id, metadata={"result_keys": list((result_json or {}).keys())})


async def fail_job(job_id: str, error: str, *, log: bool = True) -> None:
    await rest_patch(
        "processing_jobs",
        f"job_id=eq.{job_id}&select=job_id",
        {
            "status": "failed",
            "error": error,
            "completed_at": _now(),
        },
    )
    if log:
        await log_job_event("job_failed", job_id=job_id, metadata={"error": error})


async def log_job_event(
    event: str,
    *,
    job_id: str,
    organization_id: str | None = None,
    user_id: str | None = None,
    dataset_id: str | None = None,
    action: str | None = None,
    metadata: dict[str, Any] | None = None,
    error: dict[str, Any] | None = None,
) -> None:
    try:
        await log_to_supabase(
            level="error" if error else "info",
            event=event,
            message=event.replace("_", " ").title(),
            user_id=user_id,
            dataset_id=dataset_id,
            action=action,
            metadata={"job_id": job_id, "organization_id": organization_id, **(metadata or {})},
            error=error,
            source="worker" if event.startswith("job_") else "api",
        )
    except Exception as log_exc:
        logger.warning("Failed to write job log event=%s job_id=%s: %s", event, job_id, log_exc)


def validate_job_id(value: str) -> str:
    return str(UUID(value))


async def serialize_job_result(job: dict[str, Any], result: Any) -> dict[str, Any]:
    if isinstance(result, Response):
        headers = dict(result.headers)
        job_id = str(job["job_id"])
        user_id = str(job["user_id"])
        extension = "bin"
        media_type = result.media_type or headers.get("content-type") or "application/octet-stream"
        if "pdf" in media_type:
            extension = "pdf"
        elif "zip" in media_type:
            extension = "zip"
        artifact_path = f"{user_id}/jobs/{job_id}/artifact.{extension}"
        await storage_upload(
            "datasets",
            artifact_path,
            content=result.body or b"",
            content_type=media_type,
        )
        return {
            "_artifact": True,
            "artifact_path": artifact_path,
            "media_type": media_type,
            "headers": headers,
        }
    if isinstance(result, dict):
        return result
    if hasattr(result, "model_dump"):
        return result.model_dump()
    return {"result": result}
