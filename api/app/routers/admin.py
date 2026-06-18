from fastapi import APIRouter, Depends, HTTPException, Header, status
from ..worker.tasks_ttl_cleanup import run_ttl_cleanup
from ..services.app_logs import log_to_supabase
from ..services.supabase import rest_list
import os

router = APIRouter(prefix="/admin", tags=["admin"])

@router.post("/cleanup-ttl")
async def trigger_ttl_cleanup(authorization: str | None = Header(None)) -> dict:
    admin_token = os.environ.get("ADMIN_CLEANUP_TOKEN")
    
    if not admin_token:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="ADMIN_CLEANUP_TOKEN is not configured on the server."
        )

    expected_header = f"Bearer {admin_token}"
    if authorization != expected_header:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing admin token."
        )

    try:
        return await run_ttl_cleanup()
    except Exception as exc:
        await log_to_supabase(
            level="error",
            event="admin_ttl_cleanup_failed",
            message=str(exc),
            source="admin",
            error={"type": exc.__class__.__name__, "detail": str(exc)},
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="TTL cleanup failed. Check app_logs for admin_ttl_cleanup_failed.",
        ) from exc


@router.get("/scaling-health")
async def scaling_health(authorization: str | None = Header(None)) -> dict:
    admin_token = os.environ.get("ADMIN_CLEANUP_TOKEN")

    if not admin_token:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="ADMIN_CLEANUP_TOKEN is not configured on the server.",
        )

    if authorization != f"Bearer {admin_token}":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing admin token.",
        )

    jobs = await rest_list(
        "processing_jobs",
        "select=job_id,organization_id,action,status,error,queued_at,started_at,completed_at,attempts&order=queued_at.desc&limit=500",
    )
    negative_credit_orgs = await rest_list(
        "organizations",
        "credits_balance=lt.0&select=organization_id,name,credits_balance,plan&limit=50",
    )

    status_counts: dict[str, int] = {}
    action_counts: dict[str, int] = {}
    failed_jobs = []
    for job in jobs:
        status_name = str(job.get("status") or "unknown")
        action = str(job.get("action") or "unknown")
        status_counts[status_name] = status_counts.get(status_name, 0) + 1
        action_counts[action] = action_counts.get(action, 0) + 1
        if status_name == "failed":
            failed_jobs.append(job)

    return {
        "jobs_sample_size": len(jobs),
        "job_status_counts": status_counts,
        "job_action_counts": action_counts,
        "recent_failed_jobs": failed_jobs[:25],
        "negative_credit_orgs": negative_credit_orgs,
    }
