from __future__ import annotations

import io
from typing import Any, Literal
from uuid import UUID

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Request, status
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

router = APIRouter(prefix="/datasets", tags=["datasets"])
_rate = get_settings().rate_limit_per_minute


AllowedExtension = Literal["csv", "json", "xls", "xlsx"]


class CreateDatasetRequest(BaseModel):
    dataset_id: UUID
    storage_path: str = Field(min_length=1)
    original_file_name: str = Field(min_length=1)
    original_extension: AllowedExtension
    mime_type: str | None = None


class AnalyzeRequest(BaseModel):
    mode: Literal["instant"] = "instant"


class CleaningRequest(BaseModel):
    mode: Literal["simple", "advanced"] = "simple"
    target_column: str = Field(min_length=1)

    # Advanced options
    missing_strategy: Literal["mean", "median", "drop"] = "median"
    encoding: Literal["label", "one-hot"] = "one-hot"
    scaling: Literal["standard", "min-max"] = "standard"


class TrainQuickRequest(BaseModel):
    target_column: str | None = None


class TrainFullRequest(BaseModel):
    # Optional override; if omitted we use `datasets.cleaned_target_column`.
    target_column: str | None = None


class FeatureEngineerRequest(BaseModel):
    """
    MVP feature selection based on DecisionTree feature importances.
    Works on the cleaned dataset stored in `cleaned_storage_path`.
    """

    top_k: int | None = 20
    importance_threshold: float | None = None
    dry_run: bool = False


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
    mvp_notes: list[str] = []


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
    settings = get_settings()

    df = df.copy()
    df = df.iloc[:, : settings.instant_max_columns]

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


def _parse_file_bytes(data: bytes, extension: AllowedExtension, max_rows: int) -> pd.DataFrame:
    bio = io.BytesIO(data)

    if extension == "csv":
        return pd.read_csv(bio, nrows=max_rows)

    if extension == "json":
        # Try array/object JSON first; if it fails, fall back to JSON Lines.
        try:
            bio.seek(0)
            df = pd.read_json(bio)
        except Exception:
            bio.seek(0)
            df = pd.read_json(bio, lines=True)
        return df.head(max_rows)

    if extension in ("xls", "xlsx"):
        bio.seek(0)
        return pd.read_excel(bio, nrows=max_rows)

    raise ValueError("Unsupported extension")


async def _get_dataset(dataset_id: UUID) -> dict[str, Any]:
    rows = await rest_list(
        "datasets",
        query=(
            f"dataset_id=eq.{dataset_id}"
            f"&select=dataset_id,user_id,storage_path,original_extension,analysis_json,status,"
            f"cleaned_storage_path,cleaned_params,cleaned_target_column,cleaned_at,"
            f"engineered_storage_path,engineered_params,engineered_at,"
            f"quick_evaluation_json,quick_trained_at"
        ),
    )
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
    return rows[0]


@router.post("", status_code=status.HTTP_201_CREATED)
@limiter.limit(_rate)
async def create_dataset(
    request: Request,
    payload: CreateDatasetRequest,
    user=Depends(get_current_user),
) -> dict[str, Any]:
    settings = get_settings()
    user_id = user["user_id"]

    _validate_storage_path(user_id, payload.storage_path)

    # Strictly avoid trusting client-provided mime types; only extension is used to parse.
    if payload.original_extension not in ("csv", "json", "xls", "xlsx"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file extension")

    try:
        created = await rest_insert(
            "datasets",
            payload=[
                {
                    "dataset_id": str(payload.dataset_id),
                    "user_id": user_id,
                    "storage_path": payload.storage_path,
                    "original_file_name": payload.original_file_name,
                    "original_extension": payload.original_extension,
                    "mime_type": payload.mime_type,
                    "status": "uploaded",
                    "analysis_json": None,
                    "error": None,
                }
            ],
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to create dataset: {e}")

    return {"dataset_id": str(created.get("dataset_id", payload.dataset_id))}


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

    dataset = await _get_dataset(dataset_id)
    if str(dataset["user_id"]) != str(user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    # Download from private storage (service role access).
    raw = await storage_download("datasets", dataset["storage_path"])
    if len(raw) > settings.instant_max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large for instant analysis (max {settings.instant_max_bytes} bytes).",
        )
    df = _parse_file_bytes(raw, dataset["original_extension"], settings.instant_max_rows)
    analysis = _analyze_dataframe(df)

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
        await storage_remove("datasets", dataset["storage_path"])

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

    return {
        "dataset_id": str(dataset_id),
        "columns": analysis_json,
    }


@router.post("/{dataset_id}/eda")
@limiter.limit(_rate)
async def get_eda_report(
    request: Request,
    dataset_id: UUID,
    user=Depends(get_current_user),
) -> dict[str, Any]:
    """
    Auto EDA report (MVP):
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
    if len(raw) > settings.instant_max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large for EDA report (max {settings.instant_max_bytes} bytes).",
        )

    df = _parse_file_bytes(raw, dataset["original_extension"], settings.instant_max_rows)
    df = df.iloc[:, : settings.instant_max_columns]

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
            "insights": ["No numeric columns detected for EDA in the MVP limits."],
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

    return {
        "dataset_id": str(dataset_id),
        "numeric_columns": numeric_cols,
        "distributions": distributions,
        "correlation": {"columns": numeric_cols[:15], "matrix": [row[:15] for row in corr_values[:15]]},
        "insights": insights if insights else ["No strong correlations found at the MVP threshold (|corr| >= 0.7)."],
    }


@router.post("/{dataset_id}/quality")
@limiter.limit(_rate)
async def get_dataset_quality(
    request: Request,
    dataset_id: UUID,
    user=Depends(get_current_user),
) -> dict[str, Any]:
    """
    MVP dataset quality score (0-100):
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
    if len(raw) > settings.instant_max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large for quality scoring (max {settings.instant_max_bytes} bytes).",
        )

    df = _parse_file_bytes(raw, dataset["original_extension"], settings.instant_max_rows)
    df = df.iloc[:, : settings.instant_max_columns]

    if df.empty:
        return {
            "dataset_id": str(dataset_id),
            "score": 0,
            "improvements": ["Dataset appears empty within MVP limits."],
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
    if ext not in ("csv", "json", "xls", "xlsx"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid dataset extension")
    return ext  # type: ignore[return-value]


def _build_preprocessor(
    *,
    numeric_cols: list[str],
    categorical_cols: list[str],
    missing_strategy: Literal["mean", "median", "drop"],
    encoding: Literal["label", "one-hot"],
    scaling: Literal["standard", "min-max"],
) -> ColumnTransformer:
    # Strategy mapping (drop is handled by dropping rows earlier)
    numeric_impute = "median" if missing_strategy in ("median", "drop") else "mean"

    if scaling == "standard":
        scaler = StandardScaler()
    else:
        scaler = MinMaxScaler()

    numeric_steps: list[tuple[str, Any]] = [("imputer", SimpleImputer(strategy=numeric_impute))]
    numeric_steps.append(("scaler", scaler))
    numeric_pipeline = Pipeline(numeric_steps)

    if encoding == "label":
        # OrdinalEncoder is robust to unknown categories.
        cat_pipeline = Pipeline(
            [
                ("imputer", SimpleImputer(strategy="most_frequent")),
                (
                    "encoder",
                    OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1),
                ),
            ]
        )
    else:
        cat_pipeline = Pipeline(
            [
                ("imputer", SimpleImputer(strategy="most_frequent")),
                ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
            ]
        )

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

    dataset = await _get_dataset(dataset_id)
    if str(dataset["user_id"]) != str(user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    target_column = payload.target_column

    raw = await storage_download("datasets", dataset["storage_path"])
    if len(raw) > settings.cleaning_max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large for cleaning (max {settings.cleaning_max_bytes} bytes).",
        )

    df = _parse_file_bytes(raw, _get_dataset_extension(dataset), settings.cleaning_max_rows)

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
    # For MVP, we drop rows with missing targets across all strategies.
    df = df.dropna(subset=[target_column])

    if payload.mode == "simple":
        # One-click defaults: median imputation + one-hot + standard scaling.
        missing_strategy: Literal["mean", "median", "drop"] = "median"
        encoding: Literal["label", "one-hot"] = "one-hot"
        scaling: Literal["standard", "min-max"] = "standard"
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

    X_transformed = preprocessor.fit_transform(X)
    X_df, _ = _extract_cleaned_features_and_names(
        preprocessor, X_transformed, numeric_cols, categorical_cols
    )

    cleaned_df = pd.concat([X_df, y.reset_index(drop=True)], axis=1)
    cleaned_df.columns = list(X_df.columns) + [target_column]

    csv_bytes = cleaned_df.to_csv(index=False).encode("utf-8")
    if len(csv_bytes) > settings.cleaned_max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Cleaned dataset too large to export (max {settings.cleaned_max_bytes} bytes).",
        )

    cleaned_storage_path = f"{user_id}/datasets/{dataset_id}/cleaned.csv"

    # Upload cleaned dataset to private storage (service role).
    await storage_upload(
        "datasets",
        cleaned_storage_path,
        content=csv_bytes,
        content_type="text/csv",
    )

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
        await storage_remove("datasets", dataset["storage_path"])

    return {"dataset_id": str(dataset_id), "status": "cleaned", "cleaned_storage_path": cleaned_storage_path}


@router.post("/{dataset_id}/train-quick")
@limiter.limit(_rate)
async def train_quick(
    request: Request,
    dataset_id: UUID,
    payload: TrainQuickRequest,
    user=Depends(get_current_user),
) -> dict[str, Any]:
    settings = get_settings()
    user_id = user["user_id"]

    dataset = await _get_dataset(dataset_id)
    if str(dataset["user_id"]) != str(user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    engineered_path = dataset.get("engineered_storage_path")
    cleaned_path = dataset.get("cleaned_storage_path")
    cleaned_path = engineered_path or cleaned_path
    cleaned_target_column = dataset.get("cleaned_target_column")

    if not cleaned_path:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Dataset must be cleaned first")

    target_column = payload.target_column or cleaned_target_column
    if not target_column:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Target column is required")

    raw = await storage_download("datasets", cleaned_path)
    if len(raw) > settings.cleaned_max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Cleaned dataset too large for quick training (max {settings.cleaned_max_bytes} bytes).",
        )

    df = pd.read_csv(io.BytesIO(raw))
    if target_column not in df.columns:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Target column not found in cleaned data")

    y = df[target_column]
    X = df.drop(columns=[target_column])

    # Heuristic classification vs regression
    unique_count = y.nunique(dropna=True)
    is_numeric = pd.api.types.is_numeric_dtype(y)
    classification_like = (not is_numeric) or (unique_count <= 20)

    if classification_like:
        # Label encode target if needed
        from sklearn.preprocessing import LabelEncoder

        if not is_numeric:
            le = LabelEncoder()
            y_enc = le.fit_transform(y.astype(str))
            class_labels = list(le.classes_)
        else:
            # Numeric labels can still be treated as classes
            le = LabelEncoder()
            y_enc = le.fit_transform(y)
            class_labels = list(le.classes_)

        X_train, X_test, y_train, y_test = train_test_split(
            X.values, y_enc, test_size=0.25, random_state=42, stratify=y_enc if len(set(y_enc)) > 1 else None
        )

        lr = LogisticRegression(max_iter=5000)
        dt = DecisionTreeClassifier(random_state=42)

        lr.fit(X_train, y_train)
        dt.fit(X_train, y_train)

        lr_pred = lr.predict(X_test)
        dt_pred = dt.predict(X_test)

        def metrics(y_true, y_pred) -> dict[str, float]:
            return {
                "accuracy": float(accuracy_score(y_true, y_pred)),
                "precision": float(precision_score(y_true, y_pred, average="weighted", zero_division=0)),
                "recall": float(recall_score(y_true, y_pred, average="weighted", zero_division=0)),
                "f1": float(f1_score(y_true, y_pred, average="weighted", zero_division=0)),
            }

        lr_metrics = metrics(y_test, lr_pred)
        dt_metrics = metrics(y_test, dt_pred)

        # Feature importance from decision tree
        feature_names = list(X.columns)
        importances = getattr(dt, "feature_importances_", None)
        top_features: list[dict[str, Any]] = []
        if importances is not None:
            pairs = list(zip(feature_names, importances))
            pairs.sort(key=lambda p: p[1], reverse=True)
            top_features = [{"feature": f, "importance": float(i)} for f, i in pairs[:20]]

        results = {
            "task_type": "classification",
            "target_column": target_column,
            "class_labels": class_labels,
            "models": [
                {"name": "Logistic Regression", "metrics": lr_metrics},
                {"name": "Decision Tree", "metrics": dt_metrics, "top_features": top_features},
            ],
            "best_model": "Decision Tree" if dt_metrics["f1"] >= lr_metrics["f1"] else "Logistic Regression",
        }
    else:
        # Regression quick mode
        y_num = pd.to_numeric(y, errors="coerce")
        y_num = y_num.fillna(y_num.median())

        X_train, X_test, y_train, y_test = train_test_split(
            X.values, y_num.values, test_size=0.25, random_state=42
        )

        from sklearn.linear_model import LinearRegression
        from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
        from sklearn.tree import DecisionTreeRegressor

        lr = LinearRegression()
        dt = DecisionTreeRegressor(random_state=42)

        lr.fit(X_train, y_train)
        dt.fit(X_train, y_train)

        lr_pred = lr.predict(X_test)
        dt_pred = dt.predict(X_test)

        def metrics(y_true, y_pred) -> dict[str, float]:
            rmse = float(mean_squared_error(y_true, y_pred, squared=False))
            return {
                "r2": float(r2_score(y_true, y_pred)),
                "mae": float(mean_absolute_error(y_true, y_pred)),
                "rmse": rmse,
            }

        lr_metrics = metrics(y_test, lr_pred)
        dt_metrics = metrics(y_test, dt_pred)

        feature_names = list(X.columns)
        importances = getattr(dt, "feature_importances_", None)
        top_features: list[dict[str, Any]] = []
        if importances is not None:
            pairs = list(zip(feature_names, importances))
            pairs.sort(key=lambda p: p[1], reverse=True)
            top_features = [{"feature": f, "importance": float(i)} for f, i in pairs[:20]]

        best_model = "Decision Tree" if dt_metrics["rmse"] <= lr_metrics["rmse"] else "Linear Regression"

        results = {
            "task_type": "regression",
            "target_column": target_column,
            "class_labels": [],
            "models": [
                {"name": "Linear Regression", "metrics": lr_metrics},
                {"name": "Decision Tree", "metrics": dt_metrics, "top_features": top_features},
            ],
            "best_model": best_model,
        }

    await rest_patch(
        "datasets",
        where_query=f"dataset_id=eq.{dataset_id}&select=dataset_id",
        payload={
            "quick_evaluation_json": results,
            "quick_trained_at": pd.Timestamp.utcnow().isoformat(),
            "error": None,
        },
    )

    return {"dataset_id": str(dataset_id), "status": "completed", "quick_evaluation": results}


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
    if not quick:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quick evaluation not found yet")
    return {"dataset_id": str(dataset_id), "quick_evaluation": quick}


@router.get("/{dataset_id}/export/cleaned")
@limiter.limit(_rate)
async def export_cleaned(
    request: Request,
    dataset_id: UUID,
    format: str = "csv",
    user=Depends(get_current_user),
) -> Any:
    dataset = await _get_dataset(dataset_id)
    user_id = user["user_id"]
    if str(dataset["user_id"]) != str(user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    cleaned_path = dataset.get("cleaned_storage_path")
    cleaned_params = dataset.get("cleaned_params") or {}
    cleaned_target_column = dataset.get("cleaned_target_column")
    if not cleaned_path or not cleaned_target_column:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cleaned dataset not available")

    raw = await storage_download("datasets", cleaned_path)

    if format == "csv":
        from fastapi.responses import Response

        return Response(content=raw, media_type="text/csv", headers={"Content-Disposition": f'attachment; filename=\"cleaned.csv\"'})

    if format == "python-code":
        # Production-friendly: export a script that reproduces preprocessing from the RAW dataset,
        # using saved cleaning + feature-selection parameters.
        target = cleaned_target_column
        params = cleaned_params
        engineered_params = dataset.get("engineered_params") or {}
        keep_features = engineered_params.get("keep_features") or []

        missing_strategy = params.get("missing_strategy", "median")
        encoding = params.get("encoding", "one-hot")
        scaling = params.get("scaling", "standard")

        keep_features_py = repr([str(x) for x in keep_features]) if keep_features else "None"

        code = f"""import pandas as pd
import numpy as np

from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import OneHotEncoder, OrdinalEncoder, StandardScaler, MinMaxScaler, LabelEncoder
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score

# =========================
# DataPilot AI export (MVP)
# =========================
RAW_DATA_PATH = r\"your_raw_dataset.csv\"  # Update to your raw dataset path
TARGET_COLUMN = {target!r}

# Cleaning params captured from DataPilot AI
MISSING_STRATEGY = {missing_strategy!r}   # 'mean' | 'median' | 'drop'
ENCODING = {encoding!r}                  # 'label' | 'one-hot'
SCALING = {scaling!r}                    # 'standard' | 'min-max'

# Feature selection captured from DataPilot AI (if you applied feature engineering)
KEEP_FEATURES = {keep_features_py}       # list[str] or None

def build_preprocessor(numeric_cols, categorical_cols):
    numeric_impute = 'median' if MISSING_STRATEGY in ('median', 'drop') else 'mean'
    scaler = StandardScaler() if SCALING == 'standard' else MinMaxScaler()
    num_pipe = Pipeline([('imputer', SimpleImputer(strategy=numeric_impute)), ('scaler', scaler)])

    if ENCODING == 'label':
        cat_pipe = Pipeline([
            ('imputer', SimpleImputer(strategy='most_frequent')),
            ('encoder', OrdinalEncoder(handle_unknown='use_encoded_value', unknown_value=-1)),
        ])
    else:
        cat_pipe = Pipeline([
            ('imputer', SimpleImputer(strategy='most_frequent')),
            ('encoder', OneHotEncoder(handle_unknown='ignore', sparse_output=False)),
        ])

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

# Load data (CSV). If your raw file is Excel/JSON, adjust read_* accordingly.
df = pd.read_csv(RAW_DATA_PATH)
if TARGET_COLUMN not in df.columns:
    raise ValueError(f\"Target column not found: {{TARGET_COLUMN}}. Available: {{list(df.columns)[:20]}}...\")

# Drop rows with missing target.
df = df.dropna(subset=[TARGET_COLUMN])

feature_cols = [c for c in df.columns if c != TARGET_COLUMN]

if MISSING_STRATEGY == 'drop':
    df = df.dropna(subset=feature_cols + [TARGET_COLUMN])

X = df[feature_cols]
y_raw = df[TARGET_COLUMN]

# Optional: apply exported feature selection (post-cleaning, pre-encoding)
if KEEP_FEATURES:
    missing = [c for c in KEEP_FEATURES if c not in X.columns]
    if missing:
        raise ValueError(f\"KEEP_FEATURES includes unknown columns: {{missing[:10]}}...\")
    X = X[KEEP_FEATURES]

numeric_cols = [c for c in X.columns if pd.api.types.is_numeric_dtype(X[c])]
categorical_cols = [c for c in X.columns if c not in numeric_cols]

preprocessor = build_preprocessor(numeric_cols, categorical_cols)
X_transformed = preprocessor.fit_transform(X)

# Encode labels for classification.
le = LabelEncoder()
if pd.api.types.is_numeric_dtype(y_raw):
    y = le.fit_transform(y_raw)
else:
    y = le.fit_transform(y_raw.astype(str))

X_train, X_test, y_train, y_test = train_test_split(
    X_transformed, y, test_size=0.25, random_state=42,
    stratify=y if len(set(y)) > 1 else None
)

lr = LogisticRegression(max_iter=5000).fit(X_train, y_train)
dt = DecisionTreeClassifier(random_state=42).fit(X_train, y_train)

lr_pred = lr.predict(X_test)
dt_pred = dt.predict(X_test)

print('Logistic Regression:', metrics(y_test, lr_pred))
print('Decision Tree:', metrics(y_test, dt_pred))
"""
        from fastapi.responses import PlainTextResponse

        return PlainTextResponse(code, media_type="text/plain")

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown format")


@router.get("/{dataset_id}/feature-importance")
@limiter.limit(_rate)
async def get_feature_importance(
    request: Request,
    dataset_id: UUID,
    user=Depends(get_current_user),
) -> dict[str, Any]:
    """
    MVP feature importance:
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
    MVP feature engineering: select top features using DecisionTree feature importances.
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

    raw = await storage_download("datasets", cleaned_path)
    if len(raw) > settings.cleaned_max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Cleaned dataset too large to feature-engineer (max {settings.cleaned_max_bytes} bytes).",
        )

    df = pd.read_csv(io.BytesIO(raw))
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
    return response


@router.post("/{dataset_id}/train-full")
@limiter.limit(_rate)
async def train_full(
    request: Request,
    dataset_id: UUID,
    payload: TrainFullRequest,
    user=Depends(get_current_user),
) -> dict[str, Any]:
    """
    Schedules full-mode async training via Celery + Redis.
    """
    dataset = await _get_dataset(dataset_id)
    user_id = user["user_id"]
    if str(dataset["user_id"]) != str(user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    if not dataset.get("cleaned_params") or not dataset.get("cleaned_target_column"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Full training requires cleaned params/target. Run cleaning first.",
        )

    from uuid import uuid4

    run_id = uuid4()

    await rest_insert(
        "training_runs",
        payload=[
            {
                "run_id": str(run_id),
                "user_id": user_id,
                "dataset_id": str(dataset_id),
                "mode": "full",
                "status": "queued",
                "results_json": None,
                "error": None,
            }
        ],
    )

    # Enqueue Celery job
    from ..worker.tasks_full_training import train_full_dataset

    train_full_dataset.delay(str(run_id))

    return {"run_id": str(run_id), "status": "queued"}


@router.post("/{dataset_id}/recommend")
@limiter.limit(_rate)
async def recommend_models(
    request: Request,
    dataset_id: UUID,
    payload: RecommendRequest,
    user=Depends(get_current_user),
) -> RecommendResponse:
    """
    MVP model recommendation based on target column heuristics + dataset missingness.
    """
    settings = get_settings()
    user_id = user["user_id"]

    dataset = await _get_dataset(dataset_id)
    if str(dataset["user_id"]) != str(user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    raw = await storage_download("datasets", dataset["storage_path"])
    if len(raw) > settings.instant_max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large for recommendation (max {settings.instant_max_bytes} bytes).",
        )

    max_rows = payload.sample_max_rows or settings.instant_max_rows
    df = _parse_file_bytes(raw, dataset["original_extension"], max_rows)
    df = df.iloc[:, : settings.instant_max_columns]

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
                name="Random Forest",
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

        mvp_notes = []
        if top_missing_features:
            mvp_notes.append(f"High-missing features detected: {', '.join(top_missing_features)}")
        mvp_notes.append("MVP quick/full training currently focuses on classification; regression will be added next.")

    else:
        suggestions.append(
            ModelSuggestion(
                name="Linear Regression",
                explanation="Baseline for continuous targets; effective when relationships are approximately linear.",
            )
        )
        suggestions.append(
            ModelSuggestion(
                name="Random Forest Regressor",
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
        mvp_notes = ["MVP training endpoints currently implement classification models; regression training will be added next."]

    return RecommendResponse(
        dataset_id=str(dataset_id),
        problem_type=problem_type,
        target_column=target_column,
        target_unique_count=target_unique_count,
        target_missing_percent=round(target_missing_percent, 2),
        suggestions=suggestions,
        mvp_notes=mvp_notes,
    )

