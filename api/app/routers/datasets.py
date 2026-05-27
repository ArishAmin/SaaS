from __future__ import annotations

import io
import logging
import time
import asyncio
from typing import Any, Literal
from uuid import UUID, uuid4

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import MinMaxScaler, OneHotEncoder, OrdinalEncoder, StandardScaler
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor
from sklearn.utils.validation import check_is_fitted

from ..core.auth import get_current_user
from ..core.config import get_settings
from ..core.rate_limit import limiter
from ..services.dataset_pdf_report import build_dataset_report_pdf
from ..services.export_bundle import build_export_bundle_zip
from ..services.full_training_export import build_full_training_python_script
from ..services.activity_logs import log_user_activity
from ..services.training_runs import log_dataset_event, record_instant_training_run
from ..services.app_logs import log_to_supabase
from ..services.feature_generator import generate_features, apply_features
from ..services.supabase import (
    rest_insert,
    rest_list,
    rest_patch,
    rest_delete,
    storage_download,
    storage_remove,
    storage_upload,
    storage_list,
)
from ..core.billing import get_user_plan_limits
from ..core.data_limits import LoadMode, PREVIEW_MAX_ROWS, enforce_file_size, get_user_data_limits
from ..services.credits import CreditAction, check_dataset_slot, refund_credits, require_credits
from ..services.dataframe_io import load_for_user, read_tabular_bytes, sample_for_preview

router = APIRouter(prefix="/datasets", tags=["datasets"])
_rate = get_settings().rate_limit_per_minute
logger = logging.getLogger(__name__)


AllowedExtension = Literal["csv", "json", "xls", "xlsx", "parquet"]


class CreateDatasetRequest(BaseModel):
    dataset_id: UUID
    storage_path: str = Field(min_length=1)
    original_file_name: str = Field(min_length=1)
    original_extension: AllowedExtension
    file_size_bytes: int = Field(ge=0)
    mime_type: str | None = None


class AnalyzeRequest(BaseModel):
    mode: Literal["instant"] = "instant"


class CleaningRequest(BaseModel):
    mode: Literal["simple", "advanced"] = "simple"
    target_column: str = Field(min_length=1)

    # Advanced options
    missing_strategy: Literal["none", "mean", "median", "drop"] = "mean"
    encoding: Literal["none", "label", "one-hot"] = "none"
    scaling: Literal["none", "standard", "min-max"] = "none"


class TrainQuickRequest(BaseModel):
    target_column: str | None = None


class FeatureEngineerRequest(BaseModel):
    """
    Feature selection based on decision tree importances.
    Works on the cleaned dataset stored in `cleaned_storage_path`.
    """

    top_k: int | None = 20
    importance_threshold: float | None = None
    dry_run: bool = False


class FeatureGenerationApplyRequest(BaseModel):
    features: list[dict[str, Any]]


class RecommendRequest(BaseModel):
    # If omitted, we use `datasets.cleaned_target_column` when available.
    target_column: str | None = None
    sample_max_rows: int | None = None


class ModelSuggestion(BaseModel):
    name: str
    explanation: str


class RecommendResponse(BaseModel):
    dataset_id: str
    problem_type: Literal["classification", "regression"]
    target_column: str
    target_unique_count: int
    target_missing_percent: float
    suggestions: list[ModelSuggestion]
    notes: list[str] = []


class ExportFormat(str):
    # This is just for typing; FastAPI will still treat query params as str.
    pass


def _validate_storage_path(user_id: str, storage_path: str) -> None:
    # Enforce that the user can only create datasets under their own folder.
    if not storage_path.startswith(f"{user_id}/datasets/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="storage_path must be under your user folder.",
        )


def _detect_column_type(series: pd.Series) -> str:
    # Order matters: numeric/bool/datetime should win over generic object.
    if pd.api.types.is_bool_dtype(series):
        return "boolean"

    if pd.api.types.is_datetime64_any_dtype(series):
        return "datetime"

    if pd.api.types.is_numeric_dtype(series):
        return "number"

    # Heuristic: try datetime parsing
    if series.dtype == "object":
        parsed_dt = pd.to_datetime(series, errors="coerce", utc=True)
        dt_ratio = float(parsed_dt.notna().mean()) if len(parsed_dt) else 0.0
        if dt_ratio >= 0.9:
            return "datetime"

        parsed_num = pd.to_numeric(series, errors="coerce")
        num_ratio = float(parsed_num.notna().mean()) if len(parsed_num) else 0.0
        if num_ratio >= 0.9:
            return "number"

    return "string"


def _analyze_dataframe(df: pd.DataFrame) -> dict[str, Any]:
    from ..core.data_limits import MAX_COLUMNS

    df = df.copy()
    df = df.iloc[:, :MAX_COLUMNS]

    column_types: list[dict[str, Any]] = []
    missing_values: list[dict[str, Any]] = []
    unique_values: list[dict[str, Any]] = []
    basic_stats: list[dict[str, Any]] = []

    for col in df.columns:
        series = df[col]
        missing_percent = float(series.isna().mean() * 100) if len(series) else 0.0

        col_type = _detect_column_type(series)
        column_types.append({"column": str(col), "type": col_type})
        missing_values.append({"column": str(col), "missing_percent": missing_percent})
        unique_values.append({"column": str(col), "unique_count": int(series.nunique(dropna=True))})

        # Basic numeric stats for numeric-like columns.
        if col_type == "number":
            numeric = pd.to_numeric(series, errors="coerce")
            non_missing = int(numeric.notna().sum())
            if non_missing >= 2:
                stats_row: dict[str, Any] = {
                    "column": str(col),
                    "dtype": "number",
                    "count": non_missing,
                    "missing_percent": missing_percent,
                    "mean": float(numeric.mean()) if non_missing else None,
                    "std": float(numeric.std(ddof=1)) if non_missing else None,
                    "min": float(numeric.min()) if non_missing else None,
                    "max": float(numeric.max()) if non_missing else None,
                }
                basic_stats.append(stats_row)

    return {
        "column_types": column_types,
        "missing_values": missing_values,
        "unique_values": unique_values,
        "basic_stats": basic_stats,
    }


def _schema_dataframe(df: pd.DataFrame) -> dict[str, Any]:
    from ..core.data_limits import MAX_COLUMNS

    df = df.iloc[:, :MAX_COLUMNS]
    return {
        "column_types": [
            {"column": str(col), "type": _detect_column_type(df[col])}
            for col in df.columns
        ]
    }


def _parse_file_bytes(data: bytes, extension: AllowedExtension, max_rows: int) -> pd.DataFrame:
    """Backward-compatible wrapper; prefer load_for_user() for plan-aware caps."""
    return read_tabular_bytes(data, extension, max_rows)


async def _load_dataset_bytes(
    user_id: str,
    raw: bytes,
    extension: AllowedExtension,
    mode: LoadMode = LoadMode.PIPELINE,
) -> pd.DataFrame:
    udl = await get_user_data_limits(user_id)
    return load_for_user(udl, raw, extension, mode)


async def _get_dataset(dataset_id: UUID) -> dict[str, Any]:
    rows = await rest_list(
        "datasets",
        query=(
            f"dataset_id=eq.{dataset_id}"
            f"&select=dataset_id,user_id,storage_path,original_file_name,original_extension,mime_type,"
            f"analysis_json,status,created_at,updated_at,analyzed_at,error,"
            f"cleaned_storage_path,cleaned_params,cleaned_target_column,cleaned_at,"
            f"engineered_storage_path,engineered_params,engineered_at,"
            f"quick_evaluation_json,quick_trained_at"
        ),
    )
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    return rows[0]


def _quick_evaluation_is_displayable(quick: Any) -> bool:
    """Reject stale/placeholder quick evaluations that have no usable model metrics."""
    if not quick or not isinstance(quick, dict):
        return False
    models = quick.get("models")
    if not isinstance(models, list) or len(models) == 0:
        return False
    metric_keys = ("accuracy", "f1", "r2", "rmse", "mae")
    for model in models:
        metrics = model.get("metrics") if isinstance(model, dict) else None
        if not isinstance(metrics, dict):
            continue
        for key in metric_keys:
            val = metrics.get(key)
            if isinstance(val, (int, float)) and not np.isnan(float(val)) and not np.isinf(float(val)):
                return True
    return False


def _ensure_quick_model_results(
    results_models: list[dict[str, Any]],
    X: pd.DataFrame,
    y: pd.Series,
    *,
    classification_like: bool,
) -> list[dict[str, Any]]:
    """Guarantee at least one model result; used when advanced models fail on tiny datasets."""
    if results_models:
        return results_models

    from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor
    from sklearn.metrics import accuracy_score, f1_score, mean_absolute_error, r2_score, root_mean_squared_error

    feature_names = list(X.columns)

    def safe_float(v: float) -> float:
        try:
            f = float(v)
            return 0.0 if np.isnan(f) or np.isinf(f) else f
        except Exception:
            return 0.0

    try:
        X_train, X_test, y_train, y_test = _safe_train_test_split(
            X,
            y,
            test_size=0.25,
            random_state=42,
            stratify=y if classification_like and y.nunique() > 1 else None,
        )
    except Exception:
        X_train, X_test, y_train, y_test = X, X, y, y

    if classification_like:
        model = DecisionTreeClassifier(random_state=42, max_depth=6)
        model.fit(X_train, y_train)
        pred = model.predict(X_test)
        metrics = {
            "accuracy": safe_float(accuracy_score(y_test, pred)),
            "precision": safe_float(accuracy_score(y_test, pred)),
            "recall": safe_float(accuracy_score(y_test, pred)),
            "f1": safe_float(f1_score(y_test, pred, average="weighted", zero_division=0)),
        }
        name = "Decision Tree (fallback)"
    else:
        y_num = pd.to_numeric(y, errors="coerce").fillna(0)
        X_train, X_test, y_train, y_test = _safe_train_test_split(X, y_num, test_size=0.25, random_state=42)
        model = DecisionTreeRegressor(random_state=42, max_depth=6)
        model.fit(X_train, y_train)
        pred = model.predict(X_test)
        metrics = {
            "r2": safe_float(r2_score(y_test, pred)),
            "mae": safe_float(mean_absolute_error(y_test, pred)),
            "rmse": safe_float(root_mean_squared_error(y_test, pred)),
        }
        name = "Decision Tree (fallback)"

    importances = getattr(model, "feature_importances_", None)
    top_features: list[dict[str, Any]] = []
    if importances is not None:
        pairs = sorted(zip(feature_names, importances), key=lambda p: p[1], reverse=True)
        top_features = [{"feature": str(f), "importance": safe_float(float(i))} for f, i in pairs[:20]]

    return [{"name": name, "metrics": metrics, "top_features": top_features}]


def _safe_train_test_split(X, y, test_size=0.25, random_state=42, stratify=None):
    if len(X) == 0:
        raise ValueError("Dataset is empty after preprocessing.")
    if len(X) < 2:
        return X, X, y, y
    
    eff_test_size = max(1, int(len(X) * test_size)) / len(X)
    if eff_test_size >= 1.0:
        eff_test_size = 0.5 # fallback

    if stratify is not None:
        try:
            return train_test_split(X, y, test_size=eff_test_size, random_state=random_state, stratify=stratify)
        except Exception:
            pass
    return train_test_split(X, y, test_size=eff_test_size, random_state=random_state, stratify=None)


def _prepare_training_matrix(df: pd.DataFrame, target_column: str) -> tuple[pd.DataFrame, pd.Series]:
    if target_column not in df.columns:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Target column not found")

    df = df.dropna(subset=[target_column]).copy()
    if df.empty:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Target column contains all missing rows.")

    y = df[target_column]
    X = df.drop(columns=[target_column])
    if X.empty:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No feature columns available for training.")

    bool_cols = X.select_dtypes(include=["bool"]).columns.tolist()
    if bool_cols:
        X[bool_cols] = X[bool_cols].astype(int)

    datetime_cols = [c for c in X.columns if pd.api.types.is_datetime64_any_dtype(X[c])]
    for col in datetime_cols:
        X[col] = X[col].view("int64") / 1e9

    numeric_cols = X.select_dtypes(include=["number"]).columns.tolist()
    categorical_cols = [c for c in X.columns if c not in numeric_cols]

    from sklearn.impute import SimpleImputer

    if numeric_cols:
        X[numeric_cols] = SimpleImputer(strategy="median").fit_transform(X[numeric_cols])
    if categorical_cols:
        X[categorical_cols] = SimpleImputer(strategy="most_frequent").fit_transform(X[categorical_cols].astype(str))
        X = pd.get_dummies(X, columns=categorical_cols, drop_first=True, dummy_na=False)

    X = X.apply(pd.to_numeric, errors="coerce")
    if X.isna().any().any():
        X = pd.DataFrame(
            SimpleImputer(strategy="median").fit_transform(X),
            columns=X.columns,
            index=X.index,
        )

    return X, y


@router.post("")
@limiter.limit(_rate)
async def create_dataset_record(request: Request, 
    req: CreateDatasetRequest,
    user: dict = Depends(get_current_user),
):
    user_id = user["user_id"]
    dataset_id = req.dataset_id
    storage_path = req.storage_path

    # Plan: dataset slot limit (Business = unlimited)
    existing_datasets = await rest_list("datasets", f"user_id=eq.{user_id}&select=dataset_id")
    await check_dataset_slot(user_id, len(existing_datasets))

    # 2) Validation
    _validate_storage_path(user_id, storage_path)

    # Strictly avoid trusting client-provided mime types; only extension is used to parse.
    if req.original_extension not in ("csv", "json", "xls", "xlsx", "parquet"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file extension")

    data_limits = await get_user_data_limits(user_id)
    enforce_file_size(req.file_size_bytes, data_limits)

    try:
        created = await rest_insert(
            "datasets",
            payload=[
                {
                    "dataset_id": str(req.dataset_id),
                    "user_id": user_id,
                    "storage_path": req.storage_path,
                    "original_file_name": req.original_file_name,
                    "original_extension": req.original_extension,
                    "mime_type": req.mime_type,
                    "status": "uploaded",
                    "analysis_json": None,
                    "error": None,
                }
            ],
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to create dataset: {e}")

    await log_user_activity(
        user_id=str(user_id),
        action="dataset_created",
        dataset_id=str(req.dataset_id),
        metadata={"original_file_name": req.original_file_name, "extension": req.original_extension},
    )
    return {"dataset_id": str(created.get("dataset_id", req.dataset_id))}


@router.get("")
@limiter.limit(_rate)
async def list_datasets(
    request: Request,
    user=Depends(get_current_user),
) -> list[dict[str, Any]]:
    """
    Lists datasets for the current user (most recent first).
    """
    user_id = user["user_id"]
    rows = await rest_list(
        "datasets",
        query=(
            f"user_id=eq.{user_id}"
            f"&select=dataset_id,original_file_name,original_extension,status,created_at,updated_at,cleaned_at,engineered_at,quick_trained_at"
            f"&order=updated_at.desc"
        ),
    )
    return rows


@router.get("/{dataset_id}")
@limiter.limit(_rate)
async def get_single_dataset(
    request: Request,
    dataset_id: UUID,
    user=Depends(get_current_user),
) -> dict[str, Any]:
    """
    Get basic dataset metadata by ID.
    """
    dataset = await _get_dataset(dataset_id)
    user_id = user["user_id"]
    if str(dataset["user_id"]) != str(user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    quick = dataset.get("quick_evaluation_json")
    return {
        "dataset_id": str(dataset["dataset_id"]),
        "original_file_name": dataset.get("original_file_name"),
        "original_extension": dataset.get("original_extension"),
        "status": dataset.get("status"),
        "created_at": dataset.get("created_at"),
        "updated_at": dataset.get("updated_at"),
        "analyzed_at": dataset.get("analyzed_at"),
        "cleaned_at": dataset.get("cleaned_at"),
        "cleaned_storage_path": dataset.get("cleaned_storage_path"),
        "cleaned_params": dataset.get("cleaned_params"),
        "cleaned_target_column": dataset.get("cleaned_target_column"),
        "engineered_at": dataset.get("engineered_at"),
        "engineered_storage_path": dataset.get("engineered_storage_path"),
        "engineered_params": dataset.get("engineered_params"),
        "quick_trained_at": dataset.get("quick_trained_at"),
        "has_quick_evaluation": bool(_quick_evaluation_is_displayable(quick)),
    }


@router.delete("/{dataset_id}")
@limiter.limit(_rate)
async def delete_dataset(
    request: Request,
    dataset_id: UUID,
    user=Depends(get_current_user),
) -> dict[str, Any]:
    """
    Production-grade delete:
    - Verifies ownership
    - Deletes all storage objects under {user_id}/datasets/{dataset_id}/
    - Deletes any model artifacts referenced by training runs
    - Deletes DB row (cascades training_runs/shared_reports via FK on delete)
    """
    user_id = user["user_id"]

    ds_rows = await rest_list(
        "datasets",
        query=(
            f"dataset_id=eq.{dataset_id}"
            f"&select=dataset_id,user_id,storage_path,cleaned_storage_path,engineered_storage_path"
        ),
    )
    if not ds_rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    ds = ds_rows[0]
    if str(ds["user_id"]) != str(user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    # Delete dataset folder objects (raw/cleaned/engineered + anything else).
    prefix = f"{user_id}/datasets/{dataset_id}/"
    try:
        objs = await storage_list("datasets", prefix, limit=1000, offset=0)
        for o in objs:
            name = o.get("name")
            if name:
                await storage_remove("datasets", str(name))
    except Exception:
        # Best effort: still attempt direct known paths.
        for key in ("storage_path", "cleaned_storage_path", "engineered_storage_path"):
            p = ds.get(key)
            if p:
                try:
                    await storage_remove("datasets", str(p))
                except Exception:
                    pass

    # Remove model artifacts referenced by training runs for this dataset.
    run_rows = await rest_list(
        "training_runs",
        query=f"dataset_id=eq.{dataset_id}&select=run_id,user_id,results_json,status",
    )
    for r in run_rows:
        if str(r.get("user_id")) != str(user_id):
            continue
        results = r.get("results_json") or {}
        model_path = results.get("model_storage_path")
        if model_path:
            try:
                await storage_remove("datasets", str(model_path))
            except Exception:
                pass

    # Delete dataset row. FK cascades will remove training_runs/shared_reports.
    await rest_delete("datasets", where_query=f"dataset_id=eq.{dataset_id}")

    await log_user_activity(
        user_id=str(user_id),
        action="dataset_deleted",
        dataset_id=str(dataset_id),
    )
    return {"dataset_id": str(dataset_id), "deleted": True}


@router.post("/{dataset_id}/analyze")
@limiter.limit(_rate)
async def analyze_dataset(
    request: Request,
    dataset_id: UUID,
    payload: AnalyzeRequest,
    user=Depends(get_current_user),
) -> dict[str, Any]:
    if payload.mode != "instant":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported analyze mode")

    settings = get_settings()
    user_id = user["user_id"]
    limits = await get_user_plan_limits(user_id)
    await require_credits(user_id, CreditAction.ANALYZE, dataset_id=str(dataset_id))

    dataset = await _get_dataset(dataset_id)
    if str(dataset["user_id"]) != str(user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    raw = await storage_download("datasets", dataset["storage_path"])
    df = await _load_dataset_bytes(user_id, raw, dataset["original_extension"], LoadMode.PIPELINE)
    analysis = await asyncio.to_thread(_analyze_dataframe, df)

    # Persist analysis for subsequent UI fetch.
    await rest_patch(
        "datasets",
        where_query=f"dataset_id=eq.{dataset_id}&select=dataset_id",
        payload={
            "status": "completed",
            "analysis_json": analysis,
            "analyzed_at": pd.Timestamp.utcnow().isoformat(),
            "error": None,
        },
    )

    if settings.auto_delete_after_analysis:
        try:
            await storage_remove("datasets", dataset["storage_path"])
        except Exception:
            # Auto-delete is best-effort and should not fail analysis response.
            pass

    await log_user_activity(
        user_id=str(user_id),
        action="dataset_analyzed",
        dataset_id=str(dataset_id),
        metadata={"mode": payload.mode},
    )
    return {"dataset_id": str(dataset_id), "status": "completed", "analysis": analysis}


@router.post("/{dataset_id}/analysis")
@limiter.limit(_rate)
async def get_analysis(
    request: Request,
    dataset_id: UUID,
    payload: AnalyzeRequest | None = None,
    user=Depends(get_current_user),
) -> dict[str, Any]:
    dataset = await _get_dataset(dataset_id)
    user_id = user["user_id"]
    if str(dataset["user_id"]) != str(user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    analysis_json = dataset.get("analysis_json")
    if not analysis_json:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis not ready yet")

    await log_user_activity(
        user_id=str(user_id),
        action="eda_generated",
        dataset_id=str(dataset_id),
    )
    return {
        "dataset_id": str(dataset_id),
        "columns": analysis_json,
    }


@router.get("/{dataset_id}/schema")
@limiter.limit(_rate)
async def get_dataset_schema(
    request: Request,
    dataset_id: UUID,
    user=Depends(get_current_user),
) -> dict[str, Any]:
    dataset = await _get_dataset(dataset_id)
    user_id = user["user_id"]
    if str(dataset["user_id"]) != str(user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    analysis_json = dataset.get("analysis_json")
    if isinstance(analysis_json, dict) and analysis_json.get("column_types"):
        return {
            "dataset_id": str(dataset_id),
            "columns": {"column_types": analysis_json.get("column_types") or []},
            "source": "analysis",
        }

    raw = await storage_download("datasets", dataset["storage_path"])
    df = await _load_dataset_bytes(user_id, raw, dataset["original_extension"], LoadMode.PIPELINE)
    return {
        "dataset_id": str(dataset_id),
        "columns": _schema_dataframe(df),
        "source": "raw",
    }


@router.post("/{dataset_id}/eda")
@limiter.limit(_rate)
async def get_eda_report(
    request: Request,
    dataset_id: UUID,
    user=Depends(get_current_user),
) -> dict[str, Any]:
    """
    Auto EDA report:
    - Numeric distributions (histogram bins) for up to 4 numeric columns
    - Correlation matrix for up to N numeric columns (heatmap-ready)
    - Text insights for highly correlated pairs
    """
    settings = get_settings()
    user_id = user["user_id"]

    dataset = await _get_dataset(dataset_id)
    if str(dataset["user_id"]) != str(user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    raw = await storage_download("datasets", dataset["storage_path"])
    df = await _load_dataset_bytes(user_id, raw, dataset["original_extension"], LoadMode.PIPELINE)

    numeric_cols: list[str] = []
    numeric_series: dict[str, pd.Series] = {}
    for col in df.columns:
        s_num = pd.to_numeric(df[col], errors="coerce")
        non_na_ratio = float(s_num.notna().mean()) if len(s_num) else 0.0
        if non_na_ratio >= 0.8:
            # Avoid constant columns (correlation is degenerate).
            if float(s_num.nunique(dropna=True)) >= 2:
                numeric_cols.append(str(col))
                numeric_series[str(col)] = s_num
        if len(numeric_cols) >= 20:
            break

    if not numeric_cols:
        return {
            "dataset_id": str(dataset_id),
            "numeric_columns": [],
            "distributions": [],
            "correlation": {"columns": [], "matrix": []},
            "insights": ["No numeric columns detected for EDA within configured limits."],
        }

    numeric_df = pd.DataFrame({c: numeric_series[c] for c in numeric_cols})

    # Distributions for first 4 numeric columns.
    distributions: list[dict[str, Any]] = []
    for col in numeric_cols[:4]:
        values = numeric_df[col].dropna().values
        if len(values) == 0:
            continue
        counts, edges = np.histogram(values, bins=20)
        distributions.append(
            {
                "column": col,
                "bins": [
                    {"from": float(edges[i]), "to": float(edges[i + 1]), "count": int(counts[i])}
                    for i in range(len(counts))
                ],
            }
        )

    corr = numeric_df.corr(numeric_only=True).fillna(0.0)
    corr_values = corr.round(4).values.tolist()

    # Text insights for highly correlated pairs.
    insights: list[str] = []
    pairs: list[tuple[float, str, str]] = []
    cols = numeric_cols[: min(len(numeric_cols), 15)]
    for i in range(len(cols)):
        for j in range(i + 1, len(cols)):
            c = float(corr.loc[cols[i], cols[j]])
            if abs(c) >= 0.7:
                pairs.append((c, cols[i], cols[j]))
    pairs.sort(key=lambda t: abs(t[0]), reverse=True)
    for c, a, b in pairs[:6]:
        direction = "positive" if c >= 0 else "negative"
        insights.append(f"Column {a} has a strong {direction} correlation with {b} (corr={c:.2f}).")

    await log_user_activity(
        user_id=str(user_id),
        action="quality_scored",
        dataset_id=str(dataset_id),
    )
    return {
        "dataset_id": str(dataset_id),
        "numeric_columns": numeric_cols,
        "distributions": distributions,
        "correlation": {"columns": numeric_cols[:15], "matrix": [row[:15] for row in corr_values[:15]]},
        "insights": insights if insights else ["No strong correlations found at the default threshold (|corr| >= 0.7)."],
    }


@router.post("/{dataset_id}/quality")
@limiter.limit(_rate)
async def get_dataset_quality(
    request: Request,
    dataset_id: UUID,
    user=Depends(get_current_user),
) -> dict[str, Any]:
    """
    Dataset quality score (0â€“100):
    - Penalizes overall missingness
    - Penalizes duplicates ratio
    - Returns actionable improvements
    """
    settings = get_settings()
    user_id = user["user_id"]

    dataset = await _get_dataset(dataset_id)
    if str(dataset["user_id"]) != str(user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    raw = await storage_download("datasets", dataset["storage_path"])
    df = await _load_dataset_bytes(user_id, raw, dataset["original_extension"], LoadMode.PIPELINE)

    if df.empty:
        return {
            "dataset_id": str(dataset_id),
            "score": 0,
            "improvements": ["Dataset appears empty within configured limits."],
            "notes": [],
        }

    missing_by_col = df.isna().mean() * 100.0
    avg_missing = float(missing_by_col.mean()) if len(missing_by_col) else 100.0

    # Duplicates ratio on a best-effort basis.
    dup_ratio = 0.0
    try:
        dup_ratio = float(df.duplicated().mean())
    except Exception:
        dup_ratio = 0.0

    # Base scoring
    score = 100.0 - (avg_missing * 0.75) - (dup_ratio * 30.0)
    score = max(0.0, min(100.0, score))

    improvements: list[str] = []
    notes: list[str] = []

    if avg_missing >= 30:
        improvements.append(f"Overall missingness is high (~{avg_missing:.1f}%). Consider imputing or dropping missing values.")
    else:
        notes.append(f"Overall missingness looks manageable (~{avg_missing:.1f}%).")

    high_missing = missing_by_col.sort_values(ascending=False).head(3)
    high_missing = high_missing[high_missing >= 30]
    if len(high_missing) > 0:
        cols = ", ".join([str(c) for c in high_missing.index.tolist()])
        improvements.append(f"High-missing columns: {cols}. Consider cleaning these first.")

    if dup_ratio >= 0.1:
        improvements.append(f"Dataset has many duplicates (~{dup_ratio*100:.1f}%). Consider deduplicating.")

    # Signal whether there are numeric columns.
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    if len(numeric_cols) < 2:
        notes.append("Limited numeric signal detected; models may need stronger preprocessing.")

    return {
        "dataset_id": str(dataset_id),
        "score": round(score, 2),
        "improvements": improvements[:5],
        "notes": notes[:5],
        "avg_missing_percent": round(avg_missing, 2),
        "duplicate_ratio": round(dup_ratio, 4),
    }


def _get_dataset_extension(dataset: dict[str, Any]) -> AllowedExtension:
    ext = dataset.get("original_extension")
    if ext not in ("csv", "json", "xls", "xlsx", "parquet"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid dataset extension")
    return ext  # type: ignore[return-value]


def _build_preprocessor(
    *,
    numeric_cols: list[str],
    categorical_cols: list[str],
    missing_strategy: Literal["none", "mean", "median", "drop"],
    encoding: Literal["none", "label", "one-hot"],
    scaling: Literal["none", "standard", "min-max"],
) -> ColumnTransformer:
    # Strategy mapping (drop is handled by dropping rows earlier)
    numeric_impute = "median" if missing_strategy in ("median", "drop") else "mean"

    numeric_steps: list[tuple[str, Any]] = []
    if missing_strategy != "none":
        numeric_steps.append(("imputer", SimpleImputer(strategy=numeric_impute)))
    if scaling == "standard":
        numeric_steps.append(("scaler", StandardScaler()))
    elif scaling == "min-max":
        numeric_steps.append(("scaler", MinMaxScaler()))
    numeric_pipeline: Any = Pipeline(numeric_steps) if numeric_steps else "passthrough"

    if encoding == "label":
        # OrdinalEncoder is robust to unknown categories.
        cat_steps: list[tuple[str, Any]] = []
        if missing_strategy != "none":
            cat_steps.append(("imputer", SimpleImputer(strategy="most_frequent")))
        cat_steps.append(("encoder", OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1)))
        cat_pipeline: Any = Pipeline(cat_steps)
    elif encoding == "one-hot":
        cat_steps = []
        if missing_strategy != "none":
            cat_steps.append(("imputer", SimpleImputer(strategy="most_frequent")))
        cat_steps.append(("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False)))
        cat_pipeline = Pipeline(cat_steps)
    elif missing_strategy != "none":
        cat_pipeline = Pipeline([("imputer", SimpleImputer(strategy="most_frequent"))])
    else:
        cat_pipeline = "passthrough"

    transformers: list[tuple[str, Any, list[str]]] = []
    if numeric_cols:
        transformers.append(("num", numeric_pipeline, numeric_cols))
    if categorical_cols:
        transformers.append(("cat", cat_pipeline, categorical_cols))

    if not transformers:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No features found to clean")

    return ColumnTransformer(transformers=transformers, remainder="drop")


def _extract_cleaned_features_and_names(
    preprocessor: ColumnTransformer,
    X_transformed: Any,
    numeric_cols: list[str],
    categorical_cols: list[str],
) -> tuple[pd.DataFrame, list[str]]:
    feature_names = list(preprocessor.get_feature_names_out())

    # Remove transformer prefixes for readability
    cleaned_names: list[str] = []
    for name in feature_names:
        cleaned_names.append(name.replace("num__", "").replace("cat__", ""))

    X_df = pd.DataFrame(X_transformed, columns=cleaned_names)
    return X_df, cleaned_names


@router.post("/{dataset_id}/clean")
@limiter.limit(_rate)
async def clean_dataset(
    request: Request,
    dataset_id: UUID,
    payload: CleaningRequest,
    user=Depends(get_current_user),
) -> dict[str, Any]:
    settings = get_settings()
    user_id = user["user_id"]
    await require_credits(user_id, CreditAction.CLEAN, dataset_id=str(dataset_id))

    logger.info("clean_dataset start dataset_id=%s user_id=%s", dataset_id, user_id)
    dataset = await _get_dataset(dataset_id)
    if str(dataset["user_id"]) != str(user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    target_column = payload.target_column

    logger.info("clean_dataset download_raw dataset_id=%s storage_path=%s", dataset_id, dataset.get("storage_path"))
    raw = await storage_download("datasets", dataset["storage_path"])
    udl = await get_user_data_limits(user_id)
    if len(raw) > udl.max_file_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large for cleaning (max {udl.max_dataset_size_mb} MB on your plan).",
        )
    logger.info(
        "clean_dataset parse_raw dataset_id=%s extension=%s raw_bytes=%s",
        dataset_id,
        dataset.get("original_extension"),
        len(raw),
    )
    df = await _load_dataset_bytes(user_id, raw, _get_dataset_extension(dataset), LoadMode.PIPELINE)
    logger.info("clean_dataset parsed dataset_id=%s rows=%s cols=%s", dataset_id, len(df), len(df.columns))

    if target_column not in df.columns:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Target column not found")

    # Normalize column types for sklearn
    for col in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[col]):
            # Convert to epoch seconds
            df[col] = df[col].view("int64") / 1e9
        elif pd.api.types.is_bool_dtype(df[col]):
            df[col] = df[col].astype(int)

    feature_cols = [c for c in df.columns if c != target_column]
    if not feature_cols:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No features available")

    # Model training requires labels with no missing values.
    # Rows with missing target are dropped for all strategies.
    df = df.dropna(subset=[target_column])

    if payload.mode == "simple":
        # Simple defaults: only fill missing values; leave encoding and scaling unchanged.
        missing_strategy: Literal["none", "mean", "median", "drop"] = "mean"
        encoding: Literal["none", "label", "one-hot"] = "none"
        scaling: Literal["none", "standard", "min-max"] = "none"
    else:
        missing_strategy = payload.missing_strategy
        encoding = payload.encoding
        scaling = payload.scaling

    if missing_strategy == "drop":
        df = df.dropna(subset=feature_cols + [target_column])

    # Re-evaluate if target/feature dropped all rows
    if df.empty:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="All rows removed after cleaning")

    numeric_cols: list[str] = []
    categorical_cols: list[str] = []
    for col in feature_cols:
        if df[col].dtype == "object" or str(df[col].dtype).startswith("category"):
            categorical_cols.append(col)
        else:
            numeric_cols.append(col)

    # Ensure numeric columns are numeric
    for col in numeric_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    X = df[feature_cols]
    y = df[target_column]

    preprocessor = _build_preprocessor(
        numeric_cols=numeric_cols,
        categorical_cols=categorical_cols,
        missing_strategy=missing_strategy,
        encoding=encoding,
        scaling=scaling,
    )

    logger.info(
        "clean_dataset transform dataset_id=%s rows=%s numeric_cols=%s categorical_cols=%s mode=%s missing=%s encoding=%s scaling=%s",
        dataset_id,
        len(df),
        len(numeric_cols),
        len(categorical_cols),
        payload.mode,
        missing_strategy,
        encoding,
        scaling,
    )
    X_transformed = await asyncio.to_thread(preprocessor.fit_transform, X)
    X_df, _ = _extract_cleaned_features_and_names(
        preprocessor, X_transformed, numeric_cols, categorical_cols
    )

    cleaned_df = pd.concat([X_df, y.reset_index(drop=True)], axis=1)
    cleaned_df.columns = list(X_df.columns) + [target_column]

    def _to_csv_bytes(df: pd.DataFrame) -> bytes:
        return df.to_csv(index=False).encode("utf-8")

    csv_bytes = await asyncio.to_thread(_to_csv_bytes, cleaned_df)
    logger.info("clean_dataset csv_ready dataset_id=%s cleaned_bytes=%s", dataset_id, len(csv_bytes))
    if len(csv_bytes) > settings.cleaned_max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Cleaned dataset too large to export (max {settings.cleaned_max_bytes} bytes).",
        )

    cleaned_storage_path = f"{user_id}/datasets/{dataset_id}/cleaned.csv"

    # Upload cleaned dataset to private storage (service role).
    logger.info("clean_dataset upload_cleaned dataset_id=%s cleaned_path=%s", dataset_id, cleaned_storage_path)
    await storage_upload(
        "datasets",
        cleaned_storage_path,
        content=csv_bytes,
        content_type="text/csv",
    )

    logger.info("clean_dataset patch_metadata dataset_id=%s", dataset_id)
    await rest_patch(
        "datasets",
        where_query=f"dataset_id=eq.{dataset_id}&select=dataset_id",
        payload={
            "status": "cleaned",
            "cleaned_storage_path": cleaned_storage_path,
            "cleaned_params": {
                "mode": payload.mode,
                "missing_strategy": missing_strategy,
                "encoding": encoding,
                "scaling": scaling,
                "target_column": target_column,
            },
            "cleaned_target_column": target_column,
            "cleaned_at": pd.Timestamp.utcnow().isoformat(),
            "error": None,
        },
    )

    if settings.auto_delete_after_cleaning:
        try:
            await storage_remove("datasets", dataset["storage_path"])
        except Exception:
            # Auto-delete is best-effort and should not fail cleaning response.
            pass

    logger.info("clean_dataset completed dataset_id=%s", dataset_id)
    await log_user_activity(
        user_id=str(user_id),
        action="dataset_cleaned",
        dataset_id=str(dataset_id),
        metadata={
            "mode": payload.mode,
            "target_column": target_column,
            "missing_strategy": missing_strategy,
            "encoding": encoding,
            "scaling": scaling,
        },
    )
    return {"dataset_id": str(dataset_id), "status": "cleaned", "cleaned_storage_path": cleaned_storage_path}


@router.post("/{dataset_id}/train-quick")
@limiter.limit(_rate)
async def train_quick(
    request: Request,
    dataset_id: UUID,
    payload: TrainQuickRequest,
    user=Depends(get_current_user),
) -> dict[str, Any]:
    started = time.perf_counter()
    run_id = str(uuid4())
    settings = get_settings()
    user_id = user["user_id"]
    await require_credits(user_id, CreditAction.TRAIN_INSTANT, dataset_id=str(dataset_id))

    await log_to_supabase(
        level="info",
        event="train_quick_start",
        message="Instant training started",
        metadata={"dataset_id": str(dataset_id), "run_id": run_id},
    )

    dataset = await _get_dataset(dataset_id)
    if str(dataset["user_id"]) != str(user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    engineered_path = dataset.get("engineered_storage_path")
    cleaned_only_path = dataset.get("cleaned_storage_path")
    if engineered_path:
        data_source = "engineered"
    elif cleaned_only_path:
        data_source = "cleaned"
    else:
        data_source = "raw"
    cleaned_path = engineered_path or cleaned_only_path
    cleaned_target_column = dataset.get("cleaned_target_column")

    target_column = payload.target_column or cleaned_target_column
    if not target_column:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You must specify a target_column to train on uncleaned data.",
        )

    udl = await get_user_data_limits(user_id)
    if not cleaned_path:
        raw = await storage_download("datasets", dataset["storage_path"])
        df = read_tabular_bytes(
            raw,
            dataset["original_extension"],
            PREVIEW_MAX_ROWS,
            udl.max_columns,
        )
        if target_column not in df.columns:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected target column not found in raw dataset")

        df = df.dropna(subset=[target_column])
        if df.empty:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Target column contains all missing rows.")

        from sklearn.impute import SimpleImputer
        num_cols = df.select_dtypes(include=["number", "bool"]).columns.tolist()
        cat_cols = df.select_dtypes(exclude=["number", "bool"]).columns.tolist()
        if target_column in num_cols:
            num_cols.remove(target_column)
        if target_column in cat_cols:
            cat_cols.remove(target_column)

        if num_cols:
            df[num_cols] = SimpleImputer(strategy="median").fit_transform(df[num_cols])
        if cat_cols:
            df[cat_cols] = SimpleImputer(strategy="most_frequent").fit_transform(df[cat_cols])
            df = pd.get_dummies(df, columns=cat_cols, drop_first=True, dummy_na=False)
    else:
        raw = await storage_download("datasets", cleaned_path)
        if len(raw) > settings.cleaned_max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Cleaned dataset too large to load (max {settings.cleaned_max_bytes // (1024 * 1024)} MB).",
            )
        df = read_tabular_bytes(raw, "csv", PREVIEW_MAX_ROWS, udl.max_columns)
        if target_column not in df.columns:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Target column not found in cleaned data")

    df = sample_for_preview(df, PREVIEW_MAX_ROWS)
    X, y = _prepare_training_matrix(df, target_column)
    feature_names = list(X.columns)

    is_numeric = pd.api.types.is_numeric_dtype(y)
    unique_count = y.nunique()

    classification_like = (not is_numeric) or (unique_count <= 20)

    # ── Plan-based model filtering ──────────────────────────────────────
    plan_limits = await get_user_plan_limits(str(user_id))
    allowed = plan_limits.allowed_models  # e.g. ["linear_regression", "logistic_regression", "decision_tree"] or ["all"]

    # Map display model names → plan config keys
    _MODEL_KEY_MAP: dict[str, str] = {
        "Linear Regression": "linear_regression",
        "Logistic Regression": "logistic_regression",
        "Decision Tree": "decision_tree",
        "Random Forest": "random_forest",
        "Gradient Boosting": "gradient_boosting",
        "XGBoost": "xgboost",
        "Linear SVC": "svm",
        "Linear SVR": "svm",
        "Naive Bayes": "naive_bayes",
        "K-Nearest Neighbors": "knn",
    }

    def _plan_allows(model_display_name: str) -> bool:
        if "all" in allowed:
            return True
        key = _MODEL_KEY_MAP.get(model_display_name, model_display_name.lower().replace(" ", "_"))
        return key in allowed
    # ────────────────────────────────────────────────────────────────────

    await log_to_supabase(
        level="info",
        event="train_quick_type_detected",
        message=f"Detected {'classification' if classification_like else 'regression'} task",
        metadata={
            "dataset_id": str(dataset_id),
            "is_numeric": is_numeric,
            "unique_count": int(unique_count),
        },
    )

    if classification_like:
        # Label encode target if needed
        # Dynamically cleanup
        await log_to_supabase(
            level="info",
            event="train_quick_preprocess",
            message="Applying automatic median cleaning",
            metadata={"dataset_id": str(dataset_id)},
        )
        from sklearn.preprocessing import LabelEncoder

        if not is_numeric:
            le = LabelEncoder()
            y_enc = le.fit_transform(y.astype(str))
            class_labels = [str(c) for c in le.classes_]
        else:
            # Numeric labels can still be treated as classes
            le = LabelEncoder()
            y_enc = le.fit_transform(y)
            class_labels = [int(c) if pd.api.types.is_integer(c) else float(c) if pd.api.types.is_float(c) else str(c) for c in le.classes_]

        try:
            X_train, X_test, y_train, y_test = _safe_train_test_split(
                X, y_enc, test_size=0.25, random_state=42, stratify=y_enc if len(set(y_enc)) > 1 else None
            )
        except Exception as e:
            await log_to_supabase(
                level="error",
                event="train_quick_split_failed",
                message=str(e),
                metadata={"dataset_id": str(dataset_id)},
            )
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Data splitting failed: {str(e)}")

        def safe_float(v) -> float:
            try:
                f = float(v)
                return 0.0 if np.isnan(f) or np.isinf(f) else f
            except Exception:
                return 0.0

        def metrics(y_true, y_pred) -> dict[str, float]:
            return {
                "accuracy": safe_float(accuracy_score(y_true, y_pred)),
                "precision": safe_float(precision_score(y_true, y_pred, average="weighted", zero_division=0)),
                "recall": safe_float(recall_score(y_true, y_pred, average="weighted", zero_division=0)),
                "f1": safe_float(f1_score(y_true, y_pred, average="weighted", zero_division=0)),
            }

        try:
            from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
            from sklearn.svm import LinearSVC
            from sklearn.naive_bayes import GaussianNB
            from sklearn.neighbors import KNeighborsClassifier
            
            models_to_run = [
                ("Logistic Regression", LogisticRegression(max_iter=5000)),
                ("Decision Tree", DecisionTreeClassifier(random_state=42)),
                ("Random Forest", RandomForestClassifier(n_estimators=100, random_state=42)),
                ("Gradient Boosting", GradientBoostingClassifier(random_state=42)),
                ("Linear SVC", LinearSVC(dual=False, random_state=42)),
                ("Naive Bayes", GaussianNB()),
                ("K-Nearest Neighbors", KNeighborsClassifier())
            ]
        except Exception as e:
            await log_to_supabase(
                level="error",
                event="train_quick_model_import_failed",
                message=str(e),
                metadata={"dataset_id": str(dataset_id)},
            )
            raise HTTPException(status_code=500, detail=f"Machine learning model setup failed: {str(e)}")
        try:
            from xgboost import XGBClassifier
            models_to_run.append(("XGBoost", XGBClassifier(n_estimators=100, random_state=42, use_label_encoder=False, eval_metric="logloss")))
        except ImportError:
            pass

        # Filter models by plan
        models_to_run = [(n, m) for n, m in models_to_run if _plan_allows(n)]

        if len(X) < 30:
            models_to_run = [
                ("Logistic Regression", LogisticRegression(max_iter=5000)),
                ("Decision Tree", DecisionTreeClassifier(random_state=42, max_depth=6)),
            ]

        def _fit_and_evaluate_models_clf(models, X_tr, y_tr, X_te, y_te, f_names):
            res_models = []
            b_f1 = -1.0
            b_name = ""
            for n, m in models:
                try:
                    m.fit(X_tr, y_tr)
                    p = m.predict(X_te)
                    mets = metrics(y_te, p)
                    
                    imps = getattr(m, "feature_importances_", None)
                    if imps is None and hasattr(m, "coef_"):
                        c = m.coef_
                        imps = np.abs(c[0] if c.ndim > 1 else c)
                        
                    t_features = []
                    if imps is not None:
                        prs = list(zip(f_names, imps))
                        prs.sort(key=lambda p: p[1], reverse=True)
                        t_features = [{"feature": str(f), "importance": safe_float(i)} for f, i in prs[:20]]
                    
                    res_models.append({"name": n, "metrics": mets, "top_features": t_features})
                    if mets["f1"] > b_f1:
                        b_f1 = mets["f1"]
                        b_name = n
                except Exception as e:
                    res_models.append({"name": n, "error": str(e)})
            return res_models, b_name

        try:
            results_models, best_model_name = await asyncio.to_thread(
                _fit_and_evaluate_models_clf, models_to_run, X_train, y_train, X_test, y_test, feature_names
            )
            # Log any errors caught during fitting
            for rm in results_models:
                if "error" in rm:
                    await log_to_supabase(
                        level="warning",
                        event="train_quick_model_failed",
                        message=f"Model {rm['name']} failed: {rm['error']}",
                        metadata={"dataset_id": str(dataset_id)},
                    )
            results_models = [rm for rm in results_models if "error" not in rm]
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Model training failed: {str(e)}")

        results_models = _ensure_quick_model_results(
            results_models, X, pd.Series(y_enc), classification_like=True
        )
        if results_models and not best_model_name:
            best_model_name = results_models[0]["name"].replace(" (fallback)", "")

        results = {
            "task_type": "classification",
            "target_column": target_column,
            "class_labels": class_labels,
            "models": results_models,
            "best_model": best_model_name if best_model_name else "Decision Tree",
        }
    else:
        # Regression quick mode
        y_num = pd.to_numeric(y, errors="coerce")
        y_num = y_num.fillna(y_num.median())

        X_train, X_test, y_train, y_test = _safe_train_test_split(
            X, y_num, test_size=0.25, random_state=42
        )

        def safe_float(v) -> float:
            try:
                f = float(v)
                return 0.0 if np.isnan(f) or np.isinf(f) else f
            except Exception:
                return 0.0

        def get_metrics(y_true, y_pred) -> dict[str, float]:
            from sklearn.metrics import mean_absolute_error, r2_score, root_mean_squared_error
            rmse = safe_float(root_mean_squared_error(y_true, y_pred))
            return {
                "r2": safe_float(r2_score(y_true, y_pred)),
                "mae": safe_float(mean_absolute_error(y_true, y_pred)),
                "rmse": rmse,
            }

        from sklearn.linear_model import LinearRegression
        from sklearn.tree import DecisionTreeRegressor
        from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
        from sklearn.svm import LinearSVR
        from sklearn.neighbors import KNeighborsRegressor
        
        models_to_run = [
            ("Linear Regression", LinearRegression()),
            ("Decision Tree", DecisionTreeRegressor(random_state=42)),
            ("Random Forest", RandomForestRegressor(n_estimators=100, random_state=42)),
            ("Gradient Boosting", GradientBoostingRegressor(random_state=42)),
            ("Linear SVR", LinearSVR(dual=False, random_state=42)),
            ("K-Nearest Neighbors", KNeighborsRegressor())
        ]
        
        try:
            from xgboost import XGBRegressor
            models_to_run.append(("XGBoost", XGBRegressor(n_estimators=100, random_state=42)))
        except ImportError:
            pass

        # Filter models by plan
        models_to_run = [(n, m) for n, m in models_to_run if _plan_allows(n)]

        if len(X) < 30:
            models_to_run = [
                ("Linear Regression", LinearRegression()),
                ("Decision Tree", DecisionTreeRegressor(random_state=42, max_depth=6)),
            ]
            
        def _fit_and_evaluate_models_reg(models, X_tr, y_tr, X_te, y_te, f_names):
            res_models = []
            b_rmse = float('inf')
            b_name = ""
            for n, m in models:
                try:
                    m.fit(X_tr, y_tr)
                    p = m.predict(X_te)
                    mets = get_metrics(y_te, p)
                    
                    imps = getattr(m, "feature_importances_", None)
                    if imps is None and hasattr(m, "coef_"):
                        imps = np.abs(m.coef_)
                        if imps.ndim > 1:
                            imps = imps[0]
                        
                    t_features = []
                    if imps is not None:
                        prs = list(zip(f_names, imps))
                        prs.sort(key=lambda p: p[1], reverse=True)
                        t_features = [{"feature": str(f), "importance": safe_float(i)} for f, i in prs[:20]]
                    
                    res_models.append({"name": n, "metrics": mets, "top_features": t_features})
                    if mets["rmse"] < b_rmse:
                        b_rmse = mets["rmse"]
                        b_name = n
                except Exception as e:
                    res_models.append({"name": n, "error": str(e)})
            return res_models, b_name

        try:
            results_models, best_model_name = await asyncio.to_thread(
                _fit_and_evaluate_models_reg, models_to_run, X_train, y_train, X_test, y_test, feature_names
            )
            # Log any errors caught during fitting
            for rm in results_models:
                if "error" in rm:
                    await log_to_supabase(
                        level="warning",
                        event="train_quick_model_failed",
                        message=f"Model {rm['name']} failed: {rm['error']}",
                        metadata={"dataset_id": str(dataset_id)},
                    )
            results_models = [rm for rm in results_models if "error" not in rm]
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Model training failed: {str(e)}")

        results_models = _ensure_quick_model_results(
            results_models, X, y_num, classification_like=False
        )
        if results_models and not best_model_name:
            best_model_name = results_models[0]["name"].replace(" (fallback)", "")

        results = {
            "task_type": "regression",
            "target_column": target_column,
            "class_labels": [],
            "models": results_models,
            "best_model": best_model_name if best_model_name else "Linear Regression",
        }

    if not results.get("models"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not train any models on this dataset. Try cleaning first or pick a different target column.",
        )

    duration_ms = int((time.perf_counter() - started) * 1000)
    sample_rows = int(len(df))

    await rest_patch(
        "datasets",
        where_query=f"dataset_id=eq.{dataset_id}&select=dataset_id",
        payload={
            "quick_evaluation_json": results,
            "quick_trained_at": pd.Timestamp.utcnow().isoformat(),
            "error": None,
        },
    )

    await record_instant_training_run(
        run_id=run_id,
        user_id=str(user_id),
        dataset_id=str(dataset_id),
        results_json=results,
        target_column=target_column,
        data_source=data_source,
        sample_rows=sample_rows,
        duration_ms=duration_ms,
        status="completed",
    )
    await log_dataset_event(
        user_id=str(user_id),
        dataset_id=str(dataset_id),
        event_type="train_instant_preview",
        status="completed",
        duration_ms=duration_ms,
        metadata={
            "run_id": run_id,
            "target_column": target_column,
            "data_source": data_source,
            "task_type": results.get("task_type"),
            "best_model": results.get("best_model"),
            "sample_rows": sample_rows,
        },
    )

    await log_user_activity(
        user_id=str(user_id),
        action="quick_training_completed",
        dataset_id=str(dataset_id),
        metadata={
            "run_id": run_id,
            "target_column": target_column,
            "task_type": results.get("task_type"),
            "data_source": data_source,
        },
    )
    return {
        "dataset_id": str(dataset_id),
        "run_id": run_id,
        "status": "completed",
        "quick_evaluation": results,
    }


@router.post("/{dataset_id}/feature-generation/suggest")
@limiter.limit(_rate)
async def suggest_generative_features(
    request: Request,
    dataset_id: UUID,
    user=Depends(get_current_user),
) -> dict[str, Any]:
    dataset = await _get_dataset(dataset_id)
    user_id = user["user_id"]
    if str(dataset["user_id"]) != str(user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    await require_credits(user_id, CreditAction.FEATURE_SUGGEST, dataset_id=str(dataset_id))

    cleaned_path = dataset.get("cleaned_storage_path")
    if not cleaned_path:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Dataset must be cleaned first")
    
    raw = await storage_download("datasets", cleaned_path)
    df = await _load_dataset_bytes(user_id, raw, "csv", LoadMode.PIPELINE)
    udl = await get_user_data_limits(user_id)

    target_column = dataset.get("cleaned_target_column")

    try:
        suggestions = generate_features(df, target_col=target_column, max_rows=udl.pipeline_max_rows)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Feature generation failed: {e}")
        
    return {
        "dataset_id": str(dataset_id),
        "target_column": target_column,
        "suggested_features": suggestions,
    }


@router.post("/{dataset_id}/feature-generation/apply")
@limiter.limit(_rate)
async def apply_generative_features(
    request: Request,
    dataset_id: UUID,
    payload: FeatureGenerationApplyRequest,
    user=Depends(get_current_user),
) -> dict[str, Any]:
    dataset = await _get_dataset(dataset_id)
    user_id = user["user_id"]
    if str(dataset["user_id"]) != str(user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    # No extra credits: saving engineered CSV is included in FEATURE_SUGGEST.

    cleaned_path = dataset.get("cleaned_storage_path")
    if not cleaned_path:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Dataset must be cleaned first")

    raw = await storage_download("datasets", cleaned_path)
    df = await _load_dataset_bytes(user_id, raw, "csv", LoadMode.PIPELINE)

    try:
        df_augmented = apply_features(df, payload.features, target_col=dataset.get("cleaned_target_column"))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to apply features: {e}")

    # Re-save the dataset
    out_csv = df_augmented.to_csv(index=False).encode("utf-8")
    engineered_path = f"{user_id}/datasets/{dataset_id}/engineered.csv"
    
    await storage_upload(
        "datasets",
        engineered_path,
        content=out_csv,
        content_type="text/csv",
    )
    
    await rest_patch(
        "datasets",
        where_query=f"dataset_id=eq.{dataset_id}&select=dataset_id",
        payload={
            "engineered_storage_path": engineered_path,
            "engineered_at": pd.Timestamp.utcnow().isoformat(),
            "engineered_params": {"generative_features": payload.features},
            "status": "engineered",
            "updated_at": pd.Timestamp.utcnow().isoformat(),
        },
    )

    await log_user_activity(
        user_id=str(user_id),
        action="generative_features_applied",
        dataset_id=str(dataset_id),
        metadata={"num_features_added": len(payload.features)}
    )

    engineered_at = pd.Timestamp.utcnow().isoformat()
    return {
        "dataset_id": str(dataset_id),
        "status": "engineered",
        "engineered_storage_path": engineered_path,
        "engineered_at": engineered_at,
        "features_added": len(payload.features),
    }

@router.get("/{dataset_id}/quick-evaluation")
@limiter.limit(_rate)
async def get_quick_evaluation(
    request: Request,
    dataset_id: UUID,
    user=Depends(get_current_user),
) -> dict[str, Any]:
    dataset = await _get_dataset(dataset_id)
    user_id = user["user_id"]
    if str(dataset["user_id"]) != str(user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    quick = dataset.get("quick_evaluation_json")
    if not _quick_evaluation_is_displayable(quick):
        quick = None
    return {
        "dataset_id": str(dataset_id),
        "quick_evaluation": quick,
        "quick_trained_at": dataset.get("quick_trained_at"),
    }


@router.get("/{dataset_id}/report/pdf")
@limiter.limit(_rate)
async def download_dataset_pdf_report(
    request: Request,
    dataset_id: UUID,
    sections: str | None = Query(None, description="Comma-separated list of sections to include (e.g. 'analysis,cleaning,training')."),
    user=Depends(get_current_user),
) -> Response:
    """
    Comprehensive PDF report for sharing: metadata, analysis summary table, cleaning/engineering
    parameters, quick evaluation JSON, and async training run summaries.
    """
    dataset = await _get_dataset(dataset_id)
    user_id = user["user_id"]
    if str(dataset["user_id"]) != str(user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    await require_credits(user_id, CreditAction.EXPORT_PDF, dataset_id=str(dataset_id))

    try:
        runs = await rest_list(
            "training_runs",
            query=(
                f"dataset_id=eq.{dataset_id}"
                f"&select=run_id,status,created_at,error,results_json,target_column,data_source,sample_rows,duration_ms"
                f"&order=created_at.desc&limit=25"
            ),
        )
    except Exception:
        runs = []

    sections_list = [s.strip().lower() for s in sections.split(",")] if sections else None
    try:
        pdf_bytes = build_dataset_report_pdf(dataset=dataset, training_runs=runs, sections=sections_list)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PDF generation failed: {exc}",
        ) from exc
    filename = f"acutize-report-{dataset_id}.pdf"
    await log_user_activity(
        user_id=str(user_id),
        action="pdf_report_downloaded",
        dataset_id=str(dataset_id),
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _build_cleaning_python_script(dataset: dict[str, Any], target: str | None) -> str | None:
    if not target:
        return None
    params = dataset.get("cleaned_params") or {}
    engineered_params = dataset.get("engineered_params") or {}
    keep_features = engineered_params.get("keep_features") or []
    missing_strategy = params.get("missing_strategy", "median")
    encoding = params.get("encoding", "one-hot")
    scaling = params.get("scaling", "standard")
    keep_features_py = repr([str(x) for x in keep_features]) if keep_features else "None"
    return f"""import pandas as pd
import numpy as np

from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import OneHotEncoder, OrdinalEncoder, StandardScaler, MinMaxScaler, LabelEncoder
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score

# Acutize export
RAW_DATA_PATH = r\"your_raw_dataset.csv\"
TARGET_COLUMN = {target!r}
MISSING_STRATEGY = {missing_strategy!r}
ENCODING = {encoding!r}
SCALING = {scaling!r}
KEEP_FEATURES = {keep_features_py}

def load_dataset(path: str) -> pd.DataFrame:
    lower = path.lower()
    if lower.endswith('.csv'):
        return pd.read_csv(path)
    if lower.endswith('.json'):
        try:
            return pd.read_json(path)
        except ValueError:
            return pd.read_json(path, lines=True)
    if lower.endswith(('.xls', '.xlsx')):
        return pd.read_excel(path)
    if lower.endswith('.parquet'):
        return pd.read_parquet(path)
    raise ValueError('Unsupported file type. Use CSV, JSON, XLS, XLSX, or Parquet.')

def build_preprocessor(numeric_cols, categorical_cols):
    numeric_impute = 'median' if MISSING_STRATEGY in ('median', 'drop') else 'mean'
    num_steps = []
    if MISSING_STRATEGY != 'none':
        num_steps.append(('imputer', SimpleImputer(strategy=numeric_impute)))
    if SCALING == 'standard':
        num_steps.append(('scaler', StandardScaler()))
    elif SCALING == 'min-max':
        num_steps.append(('scaler', MinMaxScaler()))
    num_pipe = Pipeline(num_steps) if num_steps else 'passthrough'
    if ENCODING == 'label':
        cat_steps = []
        if MISSING_STRATEGY != 'none':
            cat_steps.append(('imputer', SimpleImputer(strategy='most_frequent')))
        cat_steps.append(('encoder', OrdinalEncoder(handle_unknown='use_encoded_value', unknown_value=-1)))
        cat_pipe = Pipeline(cat_steps)
    elif ENCODING == 'one-hot':
        cat_steps = []
        if MISSING_STRATEGY != 'none':
            cat_steps.append(('imputer', SimpleImputer(strategy='most_frequent')))
        cat_steps.append(('encoder', OneHotEncoder(handle_unknown='ignore', sparse_output=False)))
        cat_pipe = Pipeline(cat_steps)
    elif MISSING_STRATEGY != 'none':
        cat_pipe = Pipeline([('imputer', SimpleImputer(strategy='most_frequent'))])
    else:
        cat_pipe = 'passthrough'
    transformers = []
    if numeric_cols:
        transformers.append(('num', num_pipe, numeric_cols))
    if categorical_cols:
        transformers.append(('cat', cat_pipe, categorical_cols))
    return ColumnTransformer(transformers=transformers, remainder='drop')

def metrics(y_true, y_pred):
    return {{
        'accuracy': float(accuracy_score(y_true, y_pred)),
        'precision': float(precision_score(y_true, y_pred, average='weighted', zero_division=0)),
        'recall': float(recall_score(y_true, y_pred, average='weighted', zero_division=0)),
        'f1': float(f1_score(y_true, y_pred, average='weighted', zero_division=0)),
    }}

df = load_dataset(RAW_DATA_PATH)
df = df.dropna(subset=[TARGET_COLUMN])
feature_cols = [c for c in df.columns if c != TARGET_COLUMN]
if MISSING_STRATEGY == 'drop':
    df = df.dropna(subset=feature_cols + [TARGET_COLUMN])
X = df[feature_cols]
y_raw = df[TARGET_COLUMN]
if KEEP_FEATURES:
    X = X[KEEP_FEATURES]
numeric_cols = [c for c in X.columns if pd.api.types.is_numeric_dtype(X[c])]
categorical_cols = [c for c in X.columns if c not in numeric_cols]
preprocessor = build_preprocessor(numeric_cols, categorical_cols)
X_transformed = preprocessor.fit_transform(X)
le = LabelEncoder()
y = le.fit_transform(y_raw.astype(str) if not pd.api.types.is_numeric_dtype(y_raw) else y_raw)
X_train, X_test, y_train, y_test = train_test_split(X_transformed, y, test_size=0.25, random_state=42)
lr = LogisticRegression(max_iter=5000).fit(X_train, y_train)
dt = DecisionTreeClassifier(random_state=42).fit(X_train, y_train)
print('Logistic Regression:', metrics(y_test, lr.predict(X_test)))
print('Decision Tree:', metrics(y_test, dt.predict(X_test)))
"""


@router.get("/{dataset_id}/export/cleaned")
@limiter.limit(_rate)
async def export_cleaned(
    request: Request,
    dataset_id: UUID,
    format: str = "csv",
    source: str = Query("latest", description="latest | cleaned | engineered"),
    user=Depends(get_current_user),
) -> Any:
    dataset = await _get_dataset(dataset_id)
    user_id = user["user_id"]
    if str(dataset["user_id"]) != str(user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    cleaned_path = dataset.get("cleaned_storage_path")
    engineered_path = dataset.get("engineered_storage_path")
    cleaned_params = dataset.get("cleaned_params") or {}
    cleaned_target_column = dataset.get("cleaned_target_column")

    src = (source or "latest").lower()
    if src == "engineered":
        storage_path = engineered_path
        if not storage_path:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No engineered dataset found. Apply generated features first.",
            )
    elif src == "cleaned":
        storage_path = cleaned_path
        if not storage_path or not cleaned_target_column:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cleaned dataset not available")
    else:
        storage_path = engineered_path or cleaned_path
        if not storage_path:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No processed dataset available. Run cleaning first.")

    raw = await storage_download("datasets", storage_path)

    if format == "csv":
        await log_user_activity(
            user_id=str(user_id),
            action="cleaned_csv_exported",
            dataset_id=str(dataset_id),
        )
        return Response(content=raw, media_type="text/csv", headers={"Content-Disposition": f'attachment; filename=\"cleaned.csv\"'})

    if format == "python-code":
        code = _build_cleaning_python_script(dataset, cleaned_target_column)
        if not code:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cleaned dataset not available")
        from fastapi.responses import PlainTextResponse

        await log_user_activity(
            user_id=str(user_id),
            action="python_export_generated",
            dataset_id=str(dataset_id),
        )
        return PlainTextResponse(code, media_type="text/plain")

    if format == "train-full":
        code = build_full_training_python_script(dataset)
        if not code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Run instant preview on Train models first, then export the full-training script.",
            )
        from fastapi.responses import PlainTextResponse

        await log_user_activity(
            user_id=str(user_id),
            action="full_training_script_exported",
            dataset_id=str(dataset_id),
            metadata={"best_model": (dataset.get("quick_evaluation_json") or {}).get("best_model")},
        )
        return PlainTextResponse(
            code,
            media_type="text/plain",
            headers={"Content-Disposition": 'attachment; filename="train_full_model.py"'},
        )

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown format")


@router.get("/{dataset_id}/export/bundle")
@limiter.limit(_rate)
async def export_bundle(
    request: Request,
    dataset_id: UUID,
    user=Depends(get_current_user),
) -> Response:
    """ZIP with PDF report, available CSVs, and cleaning script."""
    dataset = await _get_dataset(dataset_id)
    user_id = user["user_id"]
    if str(dataset["user_id"]) != str(user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    await require_credits(user_id, CreditAction.EXPORT_BUNDLE, dataset_id=str(dataset_id))

    cleaned_path = dataset.get("cleaned_storage_path")
    engineered_path = dataset.get("engineered_storage_path")
    if not cleaned_path and not engineered_path and not dataset.get("analysis_json"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nothing to export yet. Run at least analysis or cleaning on this dataset.",
        )

    cleaned_csv: bytes | None = None
    engineered_csv: bytes | None = None
    if cleaned_path:
        cleaned_csv = await storage_download("datasets", cleaned_path)
    if engineered_path:
        engineered_csv = await storage_download("datasets", engineered_path)

    cleaning_script = _build_cleaning_python_script(dataset, dataset.get("cleaned_target_column"))
    training_script = build_full_training_python_script(dataset)

    zip_bytes = build_export_bundle_zip(
        dataset={**dataset, "dataset_id": str(dataset_id)},
        cleaned_csv=cleaned_csv,
        engineered_csv=engineered_csv,
        cleaning_script=cleaning_script,
        training_script=training_script,
    )
    filename = f"acutize-export-{str(dataset_id)[:8]}.zip"
    await log_user_activity(
        user_id=str(user_id),
        action="export_bundle_downloaded",
        dataset_id=str(dataset_id),
    )
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{dataset_id}/feature-importance")
@limiter.limit(_rate)
async def get_feature_importance(
    request: Request,
    dataset_id: UUID,
    user=Depends(get_current_user),
) -> dict[str, Any]:
    """
    Feature importance:
    Extracts Decision Tree top_features from `quick_evaluation_json`.
    """
    dataset = await _get_dataset(dataset_id)
    user_id = user["user_id"]
    if str(dataset["user_id"]) != str(user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    quick = dataset.get("quick_evaluation_json")
    if not quick:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quick evaluation not found yet")

    models = quick.get("models") or []
    dt = None
    for m in models:
        if m.get("name") == "Decision Tree":
            dt = m
            break

    if not dt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Decision Tree results not available")

    top_features = dt.get("top_features") or []
    # Normalize types
    normalized = [
        {"feature": str(item.get("feature", "")), "importance": float(item.get("importance", 0.0))}
        for item in top_features
        if item.get("feature")
    ]
    normalized.sort(key=lambda x: x["importance"], reverse=True)
    return {
        "dataset_id": str(dataset_id),
        "model_name": "Decision Tree",
        "top_features": normalized,
    }


@router.post("/{dataset_id}/feature-engineer")
@limiter.limit(_rate)
async def feature_engineer(
    request: Request,
    dataset_id: UUID,
    payload: FeatureEngineerRequest,
    user=Depends(get_current_user),
) -> dict[str, Any]:
    """
    Feature engineering: select top features using decision tree importances.
    Operates on the cleaned dataset stored in `cleaned_storage_path`.
    """
    settings = get_settings()
    user_id = user["user_id"]

    dataset = await _get_dataset(dataset_id)
    if str(dataset["user_id"]) != str(user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    cleaned_path = dataset.get("cleaned_storage_path")
    target_column = dataset.get("cleaned_target_column")

    if not cleaned_path or not target_column:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cleaned dataset not available")

    if not payload.dry_run:
        await require_credits(user_id, CreditAction.FEATURE_ENGINEER, dataset_id=str(dataset_id))

    raw = await storage_download("datasets", cleaned_path)
    udl = await get_user_data_limits(user_id)
    if len(raw) > settings.cleaned_max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Cleaned dataset too large to feature-engineer (max {settings.cleaned_max_bytes // (1024 * 1024)} MB).",
        )

    df = await _load_dataset_bytes(user_id, raw, "csv", LoadMode.PIPELINE)
    if target_column not in df.columns:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Target column missing in cleaned dataset")

    df = df.dropna(subset=[target_column])

    feature_cols = [c for c in df.columns if c != target_column]
    if not feature_cols:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No feature columns found")

    # Ensure feature values are numeric for sklearn.
    for c in feature_cols:
        df[c] = pd.to_numeric(df[c], errors="coerce")

    df = df.dropna(subset=feature_cols + [target_column])
    if df.empty:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No rows available after dropping missing values")

    y_raw = df[target_column]

    unique_count = y_raw.nunique(dropna=True)
    is_numeric = pd.api.types.is_numeric_dtype(y_raw)
    classification_like = (not is_numeric) or (unique_count <= 20)

    X = df[feature_cols].values

    if classification_like:
        from sklearn.preprocessing import LabelEncoder

        le = LabelEncoder()
        if is_numeric:
            y_enc = le.fit_transform(y_raw)
        else:
            y_enc = le.fit_transform(y_raw.astype(str))

        dt = DecisionTreeClassifier(random_state=42)
        dt.fit(X, y_enc)
    else:
        y_num = pd.to_numeric(y_raw, errors="coerce")
        y_num = y_num.fillna(y_num.median())
        dt = DecisionTreeRegressor(random_state=42)
        dt.fit(X, y_num.values)

    importances = getattr(dt, "feature_importances_", None)
    if importances is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to compute feature importances")

    pairs = list(zip(feature_cols, importances))
    pairs.sort(key=lambda p: p[1], reverse=True)

    feature_importance = [{"feature": f, "importance": float(i)} for f, i in pairs]
    max_imp = max((p["importance"] for p in feature_importance), default=0.0)
    if max_imp <= 0:
        # Degenerate case: keep everything.
        keep_features = feature_cols
        dropped_features: list[str] = []
    else:
        keep_features: list[str] = []
        if payload.top_k is not None:
            if payload.top_k <= 0:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="top_k must be > 0")
            keep_features = [f for f, _ in pairs[: min(payload.top_k, len(pairs))]]
        elif payload.importance_threshold is not None:
            thr = float(payload.importance_threshold)
            keep_features = [f for f, imp in pairs if imp >= thr]
        else:
            keep_features = feature_cols

        dropped_features = [f for f in feature_cols if f not in set(keep_features)]

        if not keep_features:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No features selected; adjust threshold/top_k")

    engineered_df = df[keep_features + [target_column]].copy()

    response: dict[str, Any] = {
        "dataset_id": str(dataset_id),
        "target_column": target_column,
        "keep_features": keep_features,
        "dropped_features": dropped_features,
        "feature_importance": feature_importance,
        "max_importance": max_imp,
        "applied": False,
    }

    if payload.dry_run:
        await log_user_activity(
            user_id=str(user_id),
            action="feature_engineering_dry_run",
            dataset_id=str(dataset_id),
            metadata={"top_k": payload.top_k, "importance_threshold": payload.importance_threshold},
        )
        return response

    engineered_storage_path = f"{user_id}/datasets/{dataset_id}/engineered.csv"
    csv_bytes = engineered_df.to_csv(index=False).encode("utf-8")
    if len(csv_bytes) > settings.cleaned_max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Engineered dataset too large to save (max {settings.cleaned_max_bytes} bytes).",
        )

    await storage_upload(
        "datasets",
        engineered_storage_path,
        content=csv_bytes,
        content_type="text/csv",
    )

    await rest_patch(
        "datasets",
        where_query=f"dataset_id=eq.{dataset_id}&select=dataset_id",
        payload={
            "status": "feature_engineered",
            "engineered_storage_path": engineered_storage_path,
            "engineered_params": {
                "top_k": payload.top_k,
                "importance_threshold": payload.importance_threshold,
                "keep_features": keep_features,
                "dropped_features": dropped_features,
            },
            "engineered_at": pd.Timestamp.utcnow().isoformat(),
            "error": None,
        },
    )

    response["applied"] = True
    response["engineered_storage_path"] = engineered_storage_path
    await log_user_activity(
        user_id=str(user_id),
        action="feature_engineering_applied",
        dataset_id=str(dataset_id),
        metadata={"selected_features": len(keep_features), "dropped_features": len(dropped_features)},
    )
    return response


@router.post("/{dataset_id}/recommend")
@limiter.limit(_rate)
async def recommend_models(
    request: Request,
    dataset_id: UUID,
    payload: RecommendRequest,
    user=Depends(get_current_user),
) -> RecommendResponse:
    """
    Model recommendations from target-column heuristics and dataset missingness.
    """
    settings = get_settings()
    user_id = user["user_id"]
    await require_credits(user_id, CreditAction.RECOMMEND, dataset_id=str(dataset_id))

    dataset = await _get_dataset(dataset_id)
    if str(dataset["user_id"]) != str(user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    raw = await storage_download("datasets", dataset["storage_path"])
    udl = await get_user_data_limits(user_id)
    cap = min(payload.sample_max_rows or udl.pipeline_max_rows, udl.pipeline_max_rows)
    df = load_for_user(udl, raw, dataset["original_extension"], LoadMode.PIPELINE)
    if len(df) > cap:
        df = df.head(cap)

    # Determine target column (prefer cleaned_target_column from cleaning step)
    target_column = payload.target_column or dataset.get("cleaned_target_column")
    if not target_column or not isinstance(target_column, str):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="target_column is required (send it or run cleaning first)")

    if target_column not in df.columns:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="target_column not found in dataset")

    target = df[target_column]

    target_missing_percent = float(target.isna().mean() * 100.0) if len(target) else 100.0
    target_unique_count = int(target.nunique(dropna=True))

    # Heuristic:
    # - If numeric with low cardinality => classification
    # - If numeric with high cardinality => regression
    # - If non-numeric => classification
    is_numeric = pd.api.types.is_numeric_dtype(target)
    if is_numeric:
        problem_type: Literal["classification", "regression"] = (
            "classification" if target_unique_count <= 20 else "regression"
        )
    else:
        problem_type = "classification"

    suggestions: list[ModelSuggestion] = []

    feature_missing_by_col = df.drop(columns=[target_column]).isna().mean().sort_values(ascending=False)
    top_missing_features = [str(idx) for idx in feature_missing_by_col.head(3).index.tolist() if float(feature_missing_by_col.loc[idx]) > 0]

    if problem_type == "classification":
        suggestions.append(
            ModelSuggestion(
                name="Logistic Regression",
                explanation="A strong baseline for classification; benefits when the target has a linear relationship with features.",
            )
        )
        suggestions.append(
            ModelSuggestion(
                name="Decision Tree",
                explanation="Captures non-linear splits and gives interpretable feature importance signals (useful for feature selection).",
            )
        )
        suggestions.append(
            ModelSuggestion(
                name="Random Forest (if available)",
                explanation="Improves generalization over a single tree; typically handles noise and mixed feature types well.",
            )
        )
        suggestions.append(
            ModelSuggestion(
                name="XGBoost (if available)",
                explanation="Often boosts accuracy for tabular classification when tuned; recommended if you can run full-mode jobs.",
            )
        )

        if target_missing_percent > 10:
            suggestions.append(
                ModelSuggestion(
                    name="Preprocessing first",
                    explanation="Your target has meaningful missingness; run cleaning with a missing-value strategy to improve training stability.",
                )
            )

        extra_notes: list[str] = []
        if top_missing_features:
            extra_notes.append(f"High-missing features detected: {', '.join(top_missing_features)}")

    else:
        suggestions.append(
            ModelSuggestion(
                name="Linear Regression",
                explanation="Baseline for continuous targets; effective when relationships are approximately linear.",
            )
        )
        suggestions.append(
            ModelSuggestion(
                name="Random Forest Regressor (if available)",
                explanation="Captures non-linearities and interactions for regression targets; robust against noise.",
            )
        )
        suggestions.append(
            ModelSuggestion(
                name="XGBoost (if available)",
                explanation="Often yields strong performance for tabular regression when trained in full-mode.",
            )
        )
        if target_missing_percent > 10:
            suggestions.append(
                ModelSuggestion(
                    name="Preprocessing first",
                    explanation="Your target has meaningful missingness; apply an imputation/drop strategy during cleaning.",
                )
            )
        extra_notes = []
        if top_missing_features:
            extra_notes.append(f"High-missing features detected: {', '.join(top_missing_features)}")

    await log_user_activity(
        user_id=str(user_id),
        action="model_recommendation_generated",
        dataset_id=str(dataset_id),
        metadata={"problem_type": problem_type, "target_column": target_column},
    )
    return RecommendResponse(
        dataset_id=str(dataset_id),
        problem_type=problem_type,
        target_column=target_column,
        target_unique_count=target_unique_count,
        target_missing_percent=round(target_missing_percent, 2),
        suggestions=suggestions,
        notes=extra_notes,
    )
