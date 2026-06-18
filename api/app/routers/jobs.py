from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from ..core.auth import get_current_user
from fastapi.responses import Response

from ..services.jobs import cancel_job, validate_job_id
from ..services.supabase import rest_list, storage_download
from ..services.workspaces import require_billing_access, require_workspace_admin

router = APIRouter(prefix="/jobs", tags=["jobs"])


async def _get_job_for_user(job_id: str, user_id: str) -> dict:
    valid_job_id = validate_job_id(job_id)
    rows = await rest_list(
        "processing_jobs",
        (
            f"job_id=eq.{valid_job_id}"
            "&select=job_id,organization_id,user_id,dataset_id,action,status,result_json,error,"
            "attempts,queued_at,started_at,completed_at,updated_at"
        ),
    )
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    job = rows[0]
    await require_workspace_member(str(job["organization_id"]), user_id)
    return job


@router.post("/{job_id}/cancel")
async def cancel_job_status(job_id: str, user: dict = Depends(get_current_user)) -> dict:
    user_id = str(user["user_id"])
    valid_job_id = validate_job_id(job_id)
    rows = await rest_list(
        "processing_jobs",
        f"job_id=eq.{valid_job_id}&select=organization_id&limit=1",
    )
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    await require_workspace_admin(str(rows[0]["organization_id"]), user_id)
    return await cancel_job(valid_job_id, user_id)


@router.get("/{job_id}")
async def get_job_status(job_id: str, user: dict = Depends(get_current_user)) -> dict:
    job = await _get_job_for_user(job_id, str(user["user_id"]))
    result = job.get("result_json")
    if isinstance(result, dict) and result.get("_artifact"):
        result = {
            "_artifact": True,
            "media_type": result.get("media_type"),
            "headers": result.get("headers"),
            "download_url": f"/jobs/{job_id}/download",
        }
    return {**job, "result_json": result}


@router.get("/{job_id}/download")
async def download_job_artifact(job_id: str, user: dict = Depends(get_current_user)):
    job = await _get_job_for_user(job_id, str(user["user_id"]))
    if job.get("status") != "completed":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Job is not completed yet")
    result = job.get("result_json")
    if not isinstance(result, dict) or not result.get("_artifact"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job has no downloadable artifact")
    artifact_path = result.get("artifact_path")
    if not artifact_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job artifact is missing")
    body = await storage_download("datasets", str(artifact_path))
    media_type = str(result.get("media_type") or "application/octet-stream")
    headers = result.get("headers") if isinstance(result.get("headers"), dict) else {}
    return Response(content=body, media_type=media_type, headers=headers)
