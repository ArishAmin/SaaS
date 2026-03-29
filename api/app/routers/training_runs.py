from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import Response
from pydantic import BaseModel

from ..core.auth import get_current_user
from ..core.config import get_settings
from ..core.rate_limit import limiter
from ..services.activity_logs import log_user_activity
from ..services.supabase import rest_list, storage_download

router = APIRouter(prefix="/training-runs", tags=["training-runs"])

_rate = get_settings().rate_limit_per_minute


class TrainRunStatusResponse(BaseModel):
    run_id: str
    status: str
    mode: str
    results_json: dict | None = None
    error: str | None = None


class TrainRunListItem(BaseModel):
    run_id: str
    status: str
    mode: str
    created_at: str | None = None
    error: str | None = None


@router.get("")
@limiter.limit(_rate)
async def list_training_runs(
    request: Request,
    dataset_id: UUID,
    user=Depends(get_current_user),
) -> list[TrainRunListItem]:
    """
    Lists training runs for a dataset (most recent first).
    """
    rows = await rest_list(
        "training_runs",
        query=(
            f"dataset_id=eq.{dataset_id}"
            f"&select=run_id,user_id,mode,status,error,created_at"
            f"&order=created_at.desc"
        ),
    )
    # Filter to user-owned runs (service role read bypasses RLS).
    user_rows = [r for r in rows if str(r.get("user_id")) == str(user["user_id"])]
    return [
        TrainRunListItem(
            run_id=str(r["run_id"]),
            status=str(r["status"]),
            mode=str(r["mode"]),
            created_at=r.get("created_at"),
            error=r.get("error"),
        )
        for r in user_rows
    ]


@router.get("/{run_id}")
@limiter.limit(_rate)
async def get_training_run(
    request: Request,
    run_id: UUID,
    user=Depends(get_current_user),
) -> TrainRunStatusResponse:
    rows = await rest_list(
        "training_runs",
        query=f"run_id=eq.{run_id}&select=run_id,user_id,mode,status,results_json,error",
    )
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    run = rows[0]

    if str(run["user_id"]) != str(user["user_id"]):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    return TrainRunStatusResponse(
        run_id=str(run["run_id"]),
        mode=str(run["mode"]),
        status=str(run["status"]),
        results_json=run.get("results_json"),
        error=run.get("error"),
    )


@router.get("/{run_id}/model")
@limiter.limit(_rate)
async def download_model(
    request: Request,
    run_id: UUID,
    user=Depends(get_current_user),
) -> Response:
    rows = await rest_list(
        "training_runs",
        query=f"run_id=eq.{run_id}&select=run_id,user_id,dataset_id,results_json,status,error",
    )
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    run = rows[0]

    if str(run["user_id"]) != str(user["user_id"]):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    if run.get("status") != "completed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Run not completed")

    results = run.get("results_json") or {}
    model_storage_path = results.get("model_storage_path")
    if not model_storage_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model file not available")

    model_bytes = await storage_download("datasets", model_storage_path)
    await log_user_activity(
        user_id=str(user["user_id"]),
        action="model_downloaded",
        dataset_id=str(run.get("dataset_id")) if run.get("dataset_id") else None,
        metadata={"run_id": str(run_id)},
    )

    return Response(
        content=model_bytes,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="model_{run_id}.pkl"'},
    )

