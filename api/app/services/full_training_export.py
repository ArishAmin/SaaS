"""Generate a local full-training Python script from saved dataset + preview results."""

from __future__ import annotations

import json
from typing import Any


def _model_factory_code(task_type: str, best_model: str) -> tuple[str, str]:
    """Return (import_lines, model_instantiation_line)."""
    clf = {
        "Logistic Regression": (
            "from sklearn.linear_model import LogisticRegression",
            "LogisticRegression(max_iter=5000)",
        ),
        "Decision Tree": (
            "from sklearn.tree import DecisionTreeClassifier",
            "DecisionTreeClassifier(random_state=42)",
        ),
        "Random Forest": (
            "from sklearn.ensemble import RandomForestClassifier",
            "RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1)",
        ),
        "Gradient Boosting": (
            "from sklearn.ensemble import GradientBoostingClassifier",
            "GradientBoostingClassifier(random_state=42)",
        ),
        "Linear SVC": (
            "from sklearn.svm import LinearSVC",
            "LinearSVC(dual=False, random_state=42)",
        ),
        "Naive Bayes": (
            "from sklearn.naive_bayes import GaussianNB",
            "GaussianNB()",
        ),
        "K-Nearest Neighbors": (
            "from sklearn.neighbors import KNeighborsClassifier",
            "KNeighborsClassifier()",
        ),
        "XGBoost": (
            "from xgboost import XGBClassifier",
            "XGBClassifier(n_estimators=100, random_state=42, eval_metric='logloss')",
        ),
    }
    reg = {
        "Linear Regression": (
            "from sklearn.linear_model import LinearRegression",
            "LinearRegression()",
        ),
        "Decision Tree": (
            "from sklearn.tree import DecisionTreeRegressor",
            "DecisionTreeRegressor(random_state=42)",
        ),
        "Random Forest": (
            "from sklearn.ensemble import RandomForestRegressor",
            "RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1)",
        ),
        "Gradient Boosting": (
            "from sklearn.ensemble import GradientBoostingRegressor",
            "GradientBoostingRegressor(random_state=42)",
        ),
        "Linear SVR": (
            "from sklearn.svm import LinearSVR",
            "LinearSVR(dual=False, random_state=42)",
        ),
        "K-Nearest Neighbors": (
            "from sklearn.neighbors import KNeighborsRegressor",
            "KNeighborsRegressor()",
        ),
        "XGBoost": (
            "from xgboost import XGBRegressor",
            "XGBRegressor(n_estimators=100, random_state=42)",
        ),
    }
    table = reg if task_type == "regression" else clf
    if best_model in table:
        return table[best_model]
    # Fallback
    if task_type == "regression":
        return reg["Random Forest"]
    return clf["Random Forest"]


def build_full_training_python_script(dataset: dict[str, Any]) -> str | None:
    target = dataset.get("cleaned_target_column")
    quick = dataset.get("quick_evaluation_json")
    if not target or not quick or not isinstance(quick, dict):
        return None
    if not quick.get("best_model") or not quick.get("models"):
        return None

    task_type = str(quick.get("task_type") or "classification")
    best_model = str(quick.get("best_model"))
    model_import, model_ctor = _model_factory_code(task_type, best_model)

    params = dataset.get("cleaned_params") or {}
    missing_strategy = params.get("missing_strategy", "median")
    encoding = params.get("encoding", "one-hot")
    scaling = params.get("scaling", "standard")

    engineered_note = ""
    if dataset.get("engineered_storage_path"):
        engineered_note = (
            "# Tip: point DATA_PATH to data/engineered.csv from your export ZIP "
            "(includes generated features used in instant preview).\n"
        )

    metrics_block = (
        """def print_cls_metrics(y_true, y_pred):
    from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
    print("Accuracy:", accuracy_score(y_true, y_pred))
    print("Precision:", precision_score(y_true, y_pred, average="weighted", zero_division=0))
    print("Recall:", recall_score(y_true, y_pred, average="weighted", zero_division=0))
    print("F1:", f1_score(y_true, y_pred, average="weighted", zero_division=0))
"""
        if task_type != "regression"
        else """def print_reg_metrics(y_true, y_pred):
    from sklearn.metrics import r2_score, mean_absolute_error, root_mean_squared_error
    print("R2:", r2_score(y_true, y_pred))
    print("MAE:", mean_absolute_error(y_true, y_pred))
    print("RMSE:", root_mean_squared_error(y_true, y_pred))
"""
    )

    if task_type == "classification":
        y_encode = """le = LabelEncoder()
if pd.api.types.is_numeric_dtype(y_raw):
    y = le.fit_transform(y_raw.astype(int))
else:
    y = le.fit_transform(y_raw.astype(str))
"""
    else:
        y_encode = """y = pd.to_numeric(y_raw, errors="coerce")
y = y.fillna(y.median())
"""

    print_metrics = "print_cls_metrics(y_test, y_pred)" if task_type != "regression" else "print_reg_metrics(y_test, y_pred)"

    preview_json = json.dumps(
        {
            "best_model": best_model,
            "task_type": task_type,
            "target_column": target,
            "note": "Instant preview used a sample; this script trains on all rows in DATA_PATH.",
        },
        indent=2,
    )

    return f'''"""
DataPilot AI — Full local training script
=========================================
Generated for: {dataset.get("original_file_name", "your dataset")}

WHAT TO DO (only one required edit):
  1. Set DATA_PATH below to the CSV you want to train on.
  2. Run:  pip install -r requirements-train.txt
  3. Run:  python train_full_model.py

RECOMMENDED DATA_PATH (from export ZIP after unzip):
  - data/engineered.csv  — if you applied generated features
  - data/cleaned.csv     — if you only ran cleaning

You may also use your original raw file; set APPLY_DATAPILOT_CLEANING = True.

Instant preview winner: {best_model} ({task_type})
Target column: {target!r}

Output: datapilot_model.pkl (saved next to this script)
"""

import warnings
warnings.filterwarnings("ignore")

import joblib
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import OneHotEncoder, OrdinalEncoder, StandardScaler, MinMaxScaler, LabelEncoder

{model_import}

# =============================================================================
# STEP 1 — SET YOUR DATASET PATH (only edit required)
# =============================================================================
{engineered_note}DATA_PATH = r"C:\\path\\to\\your\\dataset.csv"

# Set True ONLY if DATA_PATH is your raw upload (before DataPilot cleaning).
# Set False if using data/cleaned.csv or data/engineered.csv from the export ZIP.
APPLY_DATAPILOT_CLEANING = False

TARGET_COLUMN = {target!r}
TASK_TYPE = {task_type!r}
BEST_MODEL_NAME = {best_model!r}
TEST_SIZE = 0.2
RANDOM_STATE = 42
MODEL_OUTPUT = "datapilot_model.pkl"

# Cleaning settings from DataPilot (used when APPLY_DATAPILOT_CLEANING = True)
MISSING_STRATEGY = {missing_strategy!r}
ENCODING = {encoding!r}
SCALING = {scaling!r}

# Preview snapshot (sample-based; this script uses the full file)
PREVIEW_SUMMARY = {preview_json!r}


def apply_datapilot_cleaning(df: pd.DataFrame) -> pd.DataFrame:
    df = df.dropna(subset=[TARGET_COLUMN])
    feature_cols = [c for c in df.columns if c != TARGET_COLUMN]
    if MISSING_STRATEGY == "drop":
        df = df.dropna(subset=feature_cols + [TARGET_COLUMN])
    X = df[feature_cols]
    y_holder = df[[TARGET_COLUMN]]
    numeric_cols = [c for c in X.columns if pd.api.types.is_numeric_dtype(X[c])]
    categorical_cols = [c for c in X.columns if c not in numeric_cols]
    numeric_impute = "median" if MISSING_STRATEGY in ("median", "drop") else "mean"
    scaler = StandardScaler() if SCALING == "standard" else MinMaxScaler()
    num_pipe = Pipeline([("imputer", SimpleImputer(strategy=numeric_impute)), ("scaler", scaler)])
    if ENCODING == "label":
        cat_pipe = Pipeline([
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("encoder", OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1)),
        ])
    else:
        cat_pipe = Pipeline([
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
        ])
    transformers = []
    if numeric_cols:
        transformers.append(("num", num_pipe, numeric_cols))
    if categorical_cols:
        transformers.append(("cat", cat_pipe, categorical_cols))
    preprocessor = ColumnTransformer(transformers=transformers, remainder="drop")
    X_t = preprocessor.fit_transform(X)
    try:
        cols = preprocessor.get_feature_names_out()
    except Exception:
        cols = [f"f{{i}}" for i in range(X_t.shape[1])]
    out = pd.DataFrame(X_t, columns=cols)
    out[TARGET_COLUMN] = y_holder[TARGET_COLUMN].values
    return out


{metrics_block}

def main():
    print("Loading:", DATA_PATH)
    df = pd.read_csv(DATA_PATH)
    if TARGET_COLUMN not in df.columns:
        raise ValueError(f"Target {{TARGET_COLUMN}} not in columns: {{list(df.columns)[:20]}}...")

    if APPLY_DATAPILOT_CLEANING:
        print("Applying DataPilot cleaning pipeline...")
        df = apply_datapilot_cleaning(df)

    y_raw = df[TARGET_COLUMN]
    X = df.drop(columns=[TARGET_COLUMN])

    {y_encode}

    stratify = y if TASK_TYPE == "classification" and len(np.unique(y)) > 1 else None
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=TEST_SIZE, random_state=RANDOM_STATE, stratify=stratify,
    )

    print(f"Training {{BEST_MODEL_NAME}} on {{len(X_train):,}} rows ({{X.shape[1]}} features)...")
    model = {model_ctor}
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)

    print("\\nHold-out metrics:")
    {print_metrics}

    joblib.dump({{"model": model, "target": TARGET_COLUMN, "task_type": task_type, "feature_columns": list(X.columns)}}, MODEL_OUTPUT)
    print(f"\\nSaved model to {{MODEL_OUTPUT}}")


if __name__ == "__main__":
    main()
'''
