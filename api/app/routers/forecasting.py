from __future__ import annotations

import asyncio
from typing import Any, Literal
from uuid import UUID

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from ..core.auth import get_current_user
from ..core.data_limits import LoadMode, get_user_data_limits
from ..core.rate_limit import limiter
from ..services.activity_logs import log_user_activity
from ..services.credits import CreditAction, require_credits
from ..services.dataframe_io import load_for_user
from ..services.forecasting import ForecastRequestOptions, detect_forecast_columns, run_forecast
from ..services.jobs import enqueue_processing_job, should_enqueue_background_job
from ..services.supabase import rest_list, rest_patch, storage_download
from ..services.workspaces import is_workspace_member
from ..core.config import get_settings


router = APIRouter(prefix="/forecasting", tags=["forecasting"])
_rate = get_settings().rate_limit_per_minute


class ForecastRunRequest(BaseModel):
    date_column: str = Field(min_length=1)
    target_column: str = Field(min_length=1)
    horizon: int = Field(30, ge=1, le=365)
    frequency: Literal["auto", "minute", "hourly", "daily", "weekly", "monthly"] = "auto"
    aggregation: Literal["sum", "average"] = "sum"
    source: Literal["raw", "cleaned", "engineered", "latest"] = "raw"


async def _get_dataset(dataset_id: UUID) -> dict[str, Any]:
    rows = await rest_list(
        "datasets",
        query=(
            f"dataset_id=eq.{dataset_id}"
            f"&select=dataset_id,user_id,organization_id,storage_path,original_file_name,original_extension,"
            f"analysis_json,analyzed_at,cleaned_storage_path,engineered_storage_path,forecast_json,forecasted_at"
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


async def _load_forecast_frame(dataset: dict[str, Any], user_id: str, source: str) -> pd.DataFrame:
    path = _storage_path_for_source(dataset, source)
    raw = await storage_download("datasets", path)
    limits = await get_user_data_limits(user_id)
    extension = dataset["original_extension"] if path == dataset.get("storage_path") else "csv"
    return load_for_user(limits, raw, extension, LoadMode.PIPELINE)


@router.get("/{dataset_id}/schema")
@limiter.limit(_rate)
async def forecast_schema(
    request: Request,
    dataset_id: UUID,
    source: Literal["raw", "cleaned", "engineered", "latest"] = "raw",
    user=Depends(get_current_user),
) -> dict[str, Any]:
    user_id = user["user_id"]
    dataset = await _get_dataset(dataset_id)
    if not await _user_can_access_dataset(dataset, user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    df = await _load_forecast_frame(dataset, user_id, source)
    schema = await asyncio.to_thread(detect_forecast_columns, df)
    analysis_ready = bool(dataset.get("analyzed_at") or dataset.get("analysis_json"))
    return {
        "dataset_id": str(dataset_id),
        "source": source,
        "analysis_ready": analysis_ready,
        "analyzed_at": dataset.get("analyzed_at"),
        "columns": [{"name": str(c)} for c in df.columns],
        **schema,
        "saved_forecast": dataset.get("forecast_json"),
        "forecasted_at": dataset.get("forecasted_at"),
    }


@router.post("/{dataset_id}/run")
@limiter.limit(_rate)
async def run_dataset_forecast(
    request: Request,
    dataset_id: UUID,
    payload: ForecastRunRequest,
    user=Depends(get_current_user),
) -> dict[str, Any]:
    user_id = user["user_id"]
    dataset = await _get_dataset(dataset_id)
    if not await _user_can_access_dataset(dataset, user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    if not (dataset.get("analyzed_at") or dataset.get("analysis_json")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Run dataset analysis first so forecasting can use a verified column profile.",
        )

    if await should_enqueue_background_job(user):
        return await enqueue_processing_job(
            user_id=str(user_id),
            action="forecast",
            dataset_id=str(dataset_id),
            payload=payload.model_dump(),
            idempotency_key=request.headers.get("x-idempotency-key"),
        )

    await require_credits(user_id, CreditAction.FORECAST, dataset_id=str(dataset_id))
    df = await _load_forecast_frame(dataset, user_id, payload.source)
    result = await asyncio.to_thread(
        run_forecast,
        df,
        ForecastRequestOptions(
            date_column=payload.date_column,
            target_column=payload.target_column,
            horizon=payload.horizon,
            frequency=payload.frequency,
            aggregation=payload.aggregation,
        ),
    )
    result = {
        "dataset_id": str(dataset_id),
        "source": payload.source,
        "generated_at": pd.Timestamp.utcnow().isoformat(),
        **result,
    }

    await rest_patch(
        "datasets",
        where_query=f"dataset_id=eq.{dataset_id}&select=dataset_id",
        payload={
            "forecast_json": result,
            "forecasted_at": result["generated_at"],
            "updated_at": result["generated_at"],
            "error": None,
        },
    )
    await log_user_activity(
        user_id=str(user_id),
        action="forecast_generated",
        dataset_id=str(dataset_id),
        metadata={
            "date_column": payload.date_column,
            "target_column": payload.target_column,
            "horizon": result["horizon"],
            "frequency": result["frequency"],
        },
    )
    return result
