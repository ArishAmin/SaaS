from __future__ import annotations

import asyncio
from typing import Any, Literal
from uuid import UUID

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from ..core.auth import get_current_user
from ..core.config import get_settings
from ..core.data_limits import LoadMode, get_user_data_limits
from ..core.rate_limit import limiter
from ..services.activity_logs import log_user_activity
from ..services.business_insights import run_business_insights
from ..services.credits import CreditAction, require_credits
from ..services.dataframe_io import load_for_user
from ..services.jobs import enqueue_processing_job, should_enqueue_background_job
from ..services.supabase import rest_list, rest_patch, storage_download
from ..services.workspaces import is_workspace_member


router = APIRouter(prefix="/business-insights", tags=["business-insights"])
_rate = get_settings().rate_limit_per_minute


class BusinessInsightsRunRequest(BaseModel):
    source: Literal["raw", "cleaned", "engineered", "latest"] = "latest"


async def _get_dataset(dataset_id: UUID) -> dict[str, Any]:
    rows = await rest_list(
        "datasets",
        query=(
            f"dataset_id=eq.{dataset_id}"
            f"&select=dataset_id,user_id,organization_id,storage_path,original_file_name,original_extension,"
            f"analysis_json,analyzed_at,cleaned_storage_path,engineered_storage_path,"
            f"business_insights_json,business_insights_at"
        ),
    )
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    return rows[0]


async def _user_can_access_dataset(dataset: dict[str, Any], user_id: str) -> bool:
    if str(dataset.get("user_id")) == str(user_id):
        return True
    org_id = dataset.get("organization_id")
    return bool(org_id and await is_workspace_member(str(org_id), str(user_id)))


def _storage_path_for_source(dataset: dict[str, Any], source: str) -> str:
    if source == "engineered":
        path = dataset.get("engineered_storage_path")
        if not path:
            raise HTTPException(status_code=400, detail="No engineered dataset is available for this dataset.")
        return str(path)
    if source == "cleaned":
        path = dataset.get("cleaned_storage_path")
        if not path:
            raise HTTPException(status_code=400, detail="No cleaned dataset is available for this dataset.")
        return str(path)
    if source == "latest":
        return str(dataset.get("engineered_storage_path") or dataset.get("cleaned_storage_path") or dataset["storage_path"])
    return str(dataset["storage_path"])


async def _load_business_frame(dataset: dict[str, Any], user_id: str, source: str) -> pd.DataFrame:
    path = _storage_path_for_source(dataset, source)
    raw = await storage_download("datasets", path)
    limits = await get_user_data_limits(user_id)
    extension = dataset["original_extension"] if path == dataset.get("storage_path") else "csv"
    return load_for_user(limits, raw, extension, LoadMode.PIPELINE)


@router.get("/{dataset_id}/schema")
@limiter.limit(_rate)
async def business_insights_schema(
    request: Request,
    dataset_id: UUID,
    source: Literal["raw", "cleaned", "engineered", "latest"] = "latest",
    user=Depends(get_current_user),
) -> dict[str, Any]:
    user_id = user["user_id"]
    dataset = await _get_dataset(dataset_id)
    if not await _user_can_access_dataset(dataset, user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    df = await _load_business_frame(dataset, user_id, source)
    analysis_ready = bool(dataset.get("analyzed_at") or dataset.get("analysis_json"))
    return {
        "dataset_id": str(dataset_id),
        "source": source,
        "analysis_ready": analysis_ready,
        "analyzed_at": dataset.get("analyzed_at"),
        "columns": [{"name": str(c)} for c in df.columns],
        "row_count": int(len(df)),
        "saved_business_insights": dataset.get("business_insights_json"),
        "business_insights_at": dataset.get("business_insights_at"),
    }


@router.post("/{dataset_id}/run")
@limiter.limit(_rate)
async def run_dataset_business_insights(
    request: Request,
    dataset_id: UUID,
    payload: BusinessInsightsRunRequest,
    user=Depends(get_current_user),
) -> dict[str, Any]:
    user_id = user["user_id"]
    dataset = await _get_dataset(dataset_id)
    if not await _user_can_access_dataset(dataset, user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    if not (dataset.get("analyzed_at") or dataset.get("analysis_json")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Run dataset analysis first so business insights can use a verified column profile.",
        )

    if should_enqueue_background_job(user):
        return await enqueue_processing_job(
            user_id=str(user_id),
            action="business_insights",
            dataset_id=str(dataset_id),
            payload=payload.model_dump(),
            idempotency_key=request.headers.get("x-idempotency-key"),
        )

    await require_credits(user_id, CreditAction.BUSINESS_INSIGHTS, dataset_id=str(dataset_id))
    df = await _load_business_frame(dataset, user_id, payload.source)
    result = await asyncio.to_thread(run_business_insights, df)
    generated_at = pd.Timestamp.utcnow().isoformat()
    result = {
        "dataset_id": str(dataset_id),
        "source": payload.source,
        "generated_at": generated_at,
        **result,
    }

    await rest_patch(
        "datasets",
        where_query=f"dataset_id=eq.{dataset_id}&select=dataset_id",
        payload={
            "business_insights_json": result,
            "business_insights_at": generated_at,
            "updated_at": generated_at,
            "error": None,
        },
    )
    await log_user_activity(
        user_id=str(user_id),
        action="business_insights_generated",
        dataset_id=str(dataset_id),
        metadata={
            "source": payload.source,
            "charts": len(result.get("charts") or []),
            "insights": len(result.get("insights") or []),
        },
    )
    return result
