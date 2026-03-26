from __future__ import annotations

import io
from uuid import UUID

import pandas as pd
from celery.utils.log import get_task_logger
from joblib import dump as joblib_dump

from ..core.config import get_settings
from ..worker.celery_app import celery_app
from ..services.supabase import rest_list, rest_patch, storage_download, storage_remove, storage_upload
from ..routers import datasets as datasets_router

logger = get_task_logger(__name__)


@celery_app.task(name="datapilotai.train_full", bind=True)
def train_full_dataset(self, run_id: str) -> dict:
    """
    Full-mode async training task.

    - Supports classification and regression (heuristic based on target dtype/cardinality)
    - If cleaned preprocessing is missing, we derive from `datasets.cleaned_params`.
    """
    settings = get_settings()
    run_uuid = UUID(run_id)

    # Fetch training run
    run_rows = _get_run_sync(run_uuid)
    if not run_rows:
        return {"run_id": run_id, "status": "failed", "error": "Run not found"}
    run = run_rows

    try:
        user_id = run["user_id"]
        dataset_id = run["dataset_id"]
        _set_run_status(run_uuid, "running")

        # Fetch dataset
        dataset_rows = _get_dataset_sync(dataset_id)
        if not dataset_rows:
            raise RuntimeError("Dataset not found")
        dataset = dataset_rows

        cleaned_target_column = dataset.get("cleaned_target_column")
        cleaned_params = dataset.get("cleaned_params") or {}
        if not cleaned_target_column or not cleaned_params:
            raise RuntimeError("Cleaning params/target missing. Clean the dataset first.")

        missing_strategy = cleaned_params.get("missing_strategy", "median")
        encoding = cleaned_params.get("encoding", "one-hot")
        scaling = cleaned_params.get("scaling", "standard")

        # Download raw dataset and preprocess on full rows (guarded by limits)
        raw_bytes = _download_raw_sync(dataset)
        if len(raw_bytes) > settings.full_max_bytes:
            raise RuntimeError("Raw dataset too large for full training")

        df = datasets_router._parse_file_bytes(raw_bytes, dataset["original_extension"], settings.full_max_rows)

        # Normalize types similarly to the cleaning endpoint.
        for col in df.columns:
            if pd.api.types.is_datetime64_any_dtype(df[col]):
                df[col] = df[col].view("int64") / 1e9
            elif pd.api.types.is_bool_dtype(df[col]):
                df[col] = df[col].astype(int)

        target_column = cleaned_target_column
        if target_column not in df.columns:
            raise RuntimeError("Target column not found in dataset")

        feature_cols = [c for c in df.columns if c != target_column]

        if missing_strategy == "drop":
            df = df.dropna(subset=feature_cols + [target_column])
            if df.empty:
                raise RuntimeError("All rows removed after cleaning (drop strategy)")

        numeric_cols: list[str] = []
        categorical_cols: list[str] = []
        for col in feature_cols:
            if df[col].dtype == "object" or str(df[col].dtype).startswith("category"):
                categorical_cols.append(col)
            else:
                numeric_cols.append(col)

        for col in numeric_cols:
            df[col] = pd.to_numeric(df[col], errors="coerce")

        X = df[feature_cols]
        y = df[target_column]

        # Build preprocessing pipeline
        preprocessor = datasets_router._build_preprocessor(
            numeric_cols=numeric_cols,
            categorical_cols=categorical_cols,
            missing_strategy=missing_strategy,
            encoding=encoding,
            scaling=scaling,
        )

        X_transformed = preprocessor.fit_transform(X)
        X_df, _ = datasets_router._extract_cleaned_features_and_names(
            preprocessor, X_transformed, numeric_cols, categorical_cols
        )

        # Heuristic: classification vs regression
        unique_count = y.nunique(dropna=True)
        is_numeric = pd.api.types.is_numeric_dtype(y)
        classification_like = (not is_numeric) or (unique_count <= 20)
        from sklearn.model_selection import train_test_split

        results_models: list[dict] = []
        best_model_name = None
        best_model = None

        if classification_like:
            from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
            from sklearn.ensemble import RandomForestClassifier

            y_enc, class_labels = _encode_labels(y)

            X_train, X_test, y_train, y_test = train_test_split(
                X_df.values,
                y_enc,
                test_size=0.25,
                random_state=42,
                stratify=y_enc if len(set(y_enc)) > 1 else None,
            )

            models: list[tuple[str, object]] = []
            rf = RandomForestClassifier(n_estimators=300, random_state=42, n_jobs=-1)
            models.append(("Random Forest", rf))

            # XGBoost is optional
            try:
                from xgboost import XGBClassifier  # type: ignore

                xgb = XGBClassifier(
                    n_estimators=300,
                    learning_rate=0.05,
                    max_depth=6,
                    subsample=0.9,
                    colsample_bytree=0.9,
                    random_state=42,
                    eval_metric="logloss",
                )
                models.append(("XGBoost", xgb))
            except Exception:
                logger.info("xgboost not installed; skipping.")

            best_f1 = -1.0
            for name, model in models:
                model.fit(X_train, y_train)
                pred = model.predict(X_test)

                metrics = {
                    "accuracy": float(accuracy_score(y_test, pred)),
                    "precision": float(precision_score(y_test, pred, average="weighted", zero_division=0)),
                    "recall": float(recall_score(y_test, pred, average="weighted", zero_division=0)),
                    "f1": float(f1_score(y_test, pred, average="weighted", zero_division=0)),
                }

                top_features: list[dict] = []
                importances = getattr(model, "feature_importances_", None)
                if importances is not None:
                    pairs = list(zip(list(X_df.columns), importances))
                    pairs.sort(key=lambda p: p[1], reverse=True)
                    top_features = [{"feature": f, "importance": float(i)} for f, i in pairs[:20]]

                results_models.append({"name": name, "metrics": metrics, "top_features": top_features})

                if metrics["f1"] > best_f1:
                    best_f1 = metrics["f1"]
                    best_model_name = name
                    best_model = model

            task_type = "classification"
            target_meta = {"class_labels": class_labels}
        else:
            from sklearn.ensemble import RandomForestRegressor
            from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

            y_num = pd.to_numeric(y, errors="coerce")
            y_num = y_num.fillna(y_num.median())

            X_train, X_test, y_train, y_test = train_test_split(
                X_df.values,
                y_num.values,
                test_size=0.25,
                random_state=42,
            )

            models: list[tuple[str, object]] = []
            rf = RandomForestRegressor(n_estimators=400, random_state=42, n_jobs=-1)
            models.append(("Random Forest", rf))

            try:
                from xgboost import XGBRegressor  # type: ignore

                xgb = XGBRegressor(
                    n_estimators=400,
                    learning_rate=0.05,
                    max_depth=6,
                    subsample=0.9,
                    colsample_bytree=0.9,
                    random_state=42,
                )
                models.append(("XGBoost", xgb))
            except Exception:
                logger.info("xgboost not installed; skipping.")

            best_rmse = float("inf")
            for name, model in models:
                model.fit(X_train, y_train)
                pred = model.predict(X_test)
                rmse = float(mean_squared_error(y_test, pred, squared=False))
                metrics = {
                    "r2": float(r2_score(y_test, pred)),
                    "mae": float(mean_absolute_error(y_test, pred)),
                    "rmse": rmse,
                }

                top_features: list[dict] = []
                importances = getattr(model, "feature_importances_", None)
                if importances is not None:
                    pairs = list(zip(list(X_df.columns), importances))
                    pairs.sort(key=lambda p: p[1], reverse=True)
                    top_features = [{"feature": f, "importance": float(i)} for f, i in pairs[:20]]

                results_models.append({"name": name, "metrics": metrics, "top_features": top_features})

                if rmse < best_rmse:
                    best_rmse = rmse
                    best_model_name = name
                    best_model = model

            task_type = "regression"
            target_meta = {"class_labels": []}

        if best_model is None or best_model_name is None:
            raise RuntimeError("No models were trained")

        # Persist best model as .pkl for async jobs
        model_bytes = io.BytesIO()
        joblib_dump(best_model, model_bytes)
        model_bytes.seek(0)
        model_content = model_bytes.getvalue()

        model_storage_path = f"{user_id}/models/{run_id}/model.pkl"
        storage_upload_result = storage_upload(
            "datasets",
            model_storage_path,
            content=model_content,
            content_type="application/octet-stream",
        )
        # storage_upload is async; block by running in event loop is complex in celery.
        # We'll instead call the underlying coroutine via sync wrapper.
        _await_if_coroutine(storage_upload_result)

        results = {
            "task_type": task_type,
            "target_column": target_column,
            **target_meta,
            "models": results_models,
            "best_model": best_model_name,
            "model_storage_path": model_storage_path,
        }

        _set_run_results(run_uuid, results)

        if settings.auto_delete_after_full_training:
            # Delete raw dataset file if desired
            if dataset.get("storage_path"):
                _storage_remove_sync("datasets", dataset["storage_path"])

        return {"run_id": run_id, "status": "completed", "results": results}

    except Exception as e:
        logger.exception("Full training failed")
        _set_run_status(run_uuid, "failed", error=str(e))
        return {"run_id": run_id, "status": "failed", "error": str(e)}


def _encode_labels(y: pd.Series) -> tuple[list[int], list]:
    from sklearn.preprocessing import LabelEncoder

    le = LabelEncoder()
    if pd.api.types.is_numeric_dtype(y):
        y_enc = le.fit_transform(y)
    else:
        y_enc = le.fit_transform(y.astype(str))
    return list(y_enc), list(le.classes_)


def _await_if_coroutine(maybe_coro) -> None:
    # Celery tasks run in a normal thread; we need to drive async coroutines for our HTTP helpers.
    import asyncio

    if asyncio.iscoroutine(maybe_coro):
        asyncio.run(maybe_coro)


def _storage_remove_sync(bucket: str, object_path: str) -> None:
    _await_if_coroutine(storage_remove(bucket, object_path))


def _set_run_status(run_uuid: UUID, status: str, error: str | None = None) -> None:
    import asyncio

    async def _inner():
        await rest_patch(
            "training_runs",
            where_query=f"run_id=eq.{run_uuid}&select=run_id",
            payload={"status": status, "error": error},
        )

    asyncio.run(_inner())


def _set_run_results(run_uuid: UUID, results: dict) -> None:
    import asyncio

    async def _inner():
        await rest_patch(
            "training_runs",
            where_query=f"run_id=eq.{run_uuid}&select=run_id",
            payload={"status": "completed", "results_json": results, "error": None},
        )

    asyncio.run(_inner())


# These helpers keep the task logic compact.
def _get_run_sync(run_uuid: UUID) -> dict | None:
    import asyncio

    async def _inner():
        rows = await rest_list(
            "training_runs",
            query=f"run_id=eq.{run_uuid}&select=run_id,user_id,dataset_id,mode,status,results_json,error",
        )
        return rows[0] if rows else None

    return asyncio.run(_inner())


def _get_dataset_sync(dataset_id: UUID) -> dict | None:
    import asyncio

    async def _inner():
        rows = await rest_list(
            "datasets",
            query=(
                f"dataset_id=eq.{dataset_id}"
                f"&select=dataset_id,user_id,storage_path,original_extension,cleaned_params,cleaned_target_column"
            ),
        )
        return rows[0] if rows else None

    return asyncio.run(_inner())
def _download_raw_sync(dataset: dict) -> bytes:
    import asyncio

    async def _inner():
        return await storage_download("datasets", dataset["storage_path"])

    return asyncio.run(_inner())
