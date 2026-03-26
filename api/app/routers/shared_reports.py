from __future__ import annotations

from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from ..core.auth import get_current_user
from ..core.config import get_settings
from ..core.rate_limit import limiter
from ..services.supabase import rest_insert, rest_list

router = APIRouter(prefix="/shared", tags=["shared"])
_rate = get_settings().rate_limit_per_minute


class CreateShareResponse(BaseModel):
    token: str


@router.post("/datasets/{dataset_id}", response_model=CreateShareResponse)
@limiter.limit(_rate)
async def create_shared_report(
    request: Request,
    dataset_id: UUID,
    user=Depends(get_current_user),
) -> CreateShareResponse:
    """
    Creates a share token and stores a snapshot of current dataset outputs.
    The public viewer can fetch this snapshot without login.
    """
    user_id = user["user_id"]

    # Fetch dataset outputs via service role and then verify ownership.
    ds_rows = await rest_list(
        "datasets",
        query=(
            f"dataset_id=eq.{dataset_id}"
            f"&select=dataset_id,user_id,status,analysis_json,cleaned_params,cleaned_target_column,"
            f"engineered_params,quick_evaluation_json"
        ),
    )
    if not ds_rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    ds = ds_rows[0]
    if str(ds["user_id"]) != str(user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    token = uuid4()

    snapshot = {
        "dataset_id": str(dataset_id),
        "status": ds.get("status"),
        "analysis": ds.get("analysis_json"),
        "cleaned": {
            "params": ds.get("cleaned_params"),
            "target_column": ds.get("cleaned_target_column"),
        },
        "engineered": {
            "params": ds.get("engineered_params"),
        },
        "quick_evaluation": ds.get("quick_evaluation_json"),
    }

    await rest_insert(
        "shared_reports",
        payload=[
            {
                "token": str(token),
                "user_id": user_id,
                "dataset_id": str(dataset_id),
                "snapshot_json": snapshot,
            }
        ],
    )

    return CreateShareResponse(token=str(token))


@router.get("/{token}")
@limiter.limit(_rate)
async def get_shared_report(
    request: Request,
    token: UUID,
) -> dict:
    """
    Public (no-auth) read-only shared report view by token.
    """
    rows = await rest_list(
        "shared_reports",
        query=f"token=eq.{token}&select=token,snapshot_json,created_at",
    )
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shared report not found")

    row = rows[0]
    return {
        "token": str(row["token"]),
        "created_at": row.get("created_at"),
        "snapshot": row.get("snapshot_json"),
    }

