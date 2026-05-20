from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel

from ..core.auth import get_current_user
from ..core.config import get_settings
from ..core.rate_limit import limiter
from ..services.supabase import rest_list

router = APIRouter(prefix="/training-runs", tags=["training-runs"])

_rate = get_settings().rate_limit_per_minute


class TrainRunStatusResponse(BaseModel):
    run_id: str
    status: str
    target_column: str | None = None
    data_source: str | None = None
    sample_rows: int | None = None
    duration_ms: int | None = None
    results_json: dict | None = None
    error: str | None = None
    created_at: str | None = None


class TrainRunListItem(BaseModel):
    run_id: str
    status: str
    target_column: str | None = None
    data_source: str | None = None
    sample_rows: int | None = None
    duration_ms: int | None = None
    created_at: str | None = None
    error: str | None = None
    best_model: str | None = None


def _best_model_from_results(results: dict | None) -> str | None:
    if not results or not isinstance(results, dict):
        return None
    return results.get("best_model")


@router.get("")
@limiter.limit(_rate)
async def list_training_runs(
    request: Request,
    dataset_id: UUID = Query(...),
    user=Depends(get_current_user),
) -> list[TrainRunListItem]:
    """List instant-preview training runs for a dataset (newest first)."""
    rows = await rest_list(
        "training_runs",
        query=(
            f"dataset_id=eq.{dataset_id}"
            f"&select=run_id,user_id,status,error,created_at,target_column,data_source,"
            f"sample_rows,duration_ms,results_json"
            f"&order=created_at.desc"
            f"&limit=50"
        ),
    )
    user_rows = [r for r in rows if str(r.get("user_id")) == str(user["user_id"])]
    return [
        TrainRunListItem(
            run_id=str(r["run_id"]),
            status=str(r["status"]),
            target_column=r.get("target_column"),
            data_source=r.get("data_source"),
            sample_rows=r.get("sample_rows"),
            duration_ms=r.get("duration_ms"),
            created_at=r.get("created_at"),
            error=r.get("error"),
            best_model=_best_model_from_results(r.get("results_json")),
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
        query=(
            f"run_id=eq.{run_id}"
            f"&select=run_id,user_id,status,results_json,error,created_at,"
            f"target_column,data_source,sample_rows,duration_ms"
        ),
    )
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")
    run = rows[0]

    if str(run["user_id"]) != str(user["user_id"]):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    return TrainRunStatusResponse(
        run_id=str(run["run_id"]),
        status=str(run["status"]),
        target_column=run.get("target_column"),
        data_source=run.get("data_source"),
        sample_rows=run.get("sample_rows"),
        duration_ms=run.get("duration_ms"),
        results_json=run.get("results_json"),
        error=run.get("error"),
        created_at=run.get("created_at"),
    )
