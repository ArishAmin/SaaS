import pandas as pd
import numpy as np
import time
from typing import Any
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor
from sklearn.model_selection import cross_val_score
from sklearn.preprocessing import LabelEncoder
import io
import json

def detect_column_types(df: pd.DataFrame) -> dict:
    types = {"numeric": [], "categorical": [], "datetime": [], "text": []}
    for col in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[col]):
            types["datetime"].append(col)
        elif pd.api.types.is_numeric_dtype(df[col]):
            # Check if it's actually categorical disguised as numeric
            if df[col].nunique() < 10 and len(df) > 100:
                types["categorical"].append(col)
            else:
                types["numeric"].append(col)
        elif pd.api.types.is_object_dtype(df[col]) or pd.api.types.is_string_dtype(df[col]):
            # Simple heuristic
            try:
                # Can it be datetime?
                pd.to_datetime(df[col].dropna().head(10), format="mixed", errors="raise")
                types["datetime"].append(col)
            except Exception:
                n_unique = df[col].nunique()
                if n_unique < 50 or (n_unique / len(df) < 0.1): 
                    types["categorical"].append(col)
                else:
                    types["text"].append(col)
    return types

def evaluate_feature(df: pd.DataFrame, target_col: str, feature_series: pd.Series, task: str) -> float:
    """Returns the performance delta (e.g., accuracy or R2) by adding the feature."""
    if feature_series.nunique() <= 1:
        return 0.0

    # Small datasets: skip strict CV (always returns 0 and filters everything out).
    if len(df) < 50:
        return 0.01

    valid_idx = df[target_col].notna() & feature_series.notna()
    if valid_idx.sum() < 20:
        return 0.01

    X_base = df.loc[valid_idx].select_dtypes(include=[np.number]).fillna(0)
    if target_col in X_base.columns:
        X_base = X_base.drop(columns=[target_col])
    
    X_new = X_base.copy()
    X_new["__test_feature__"] = feature_series.loc[valid_idx]

    y = df.loc[valid_idx, target_col]

    if task == "classification":
        model = DecisionTreeClassifier(max_depth=5, random_state=42)
        metric = "accuracy"
    else:
        model = DecisionTreeRegressor(max_depth=5, random_state=42)
        metric = "r2"

    try:
        score_base = np.mean(cross_val_score(model, X_base, y, cv=3, scoring=metric))
        score_new = np.mean(cross_val_score(model, X_new, y, cv=3, scoring=metric))
        return float(score_new - score_base)
    except Exception:
        return 0.0

def generate_features(
    df_full: pd.DataFrame,
    target_col: str | None = None,
    max_rows: int = 100_000,
) -> list[dict]:
    if len(df_full) > max_rows:
        df = df_full.sample(n=max_rows, random_state=42)
    else:
        df = df_full.copy()

    start_time = time.time()
    types = detect_column_types(df)
    suggestions = []

    # Determine task
    task = "regression"
    if target_col and target_col in df.columns:
        if df[target_col].nunique() < 20 or pd.api.types.is_object_dtype(df[target_col]):
            task = "classification"

    existing_cols = set(df.columns)

    # Helper to add feature
    def add_suggestion(name, formula, ftype, series, reason):
        # time limit check (10s max)
        if time.time() - start_time > 8:
            return
        
        # Avoid zero variance
        if series.nunique() <= 1:
            return
        
        # Avoid highly correlated with existing numeric features
        if pd.api.types.is_numeric_dtype(series):
            num_df = df.select_dtypes(include=[np.number])
            if not num_df.empty:
                corrs = num_df.corrwith(series).abs()
                if corrs.max() > 0.95:
                    return # Redundant

        impact = 0.0
        small_dataset = len(df) < 50
        if target_col and target_col in df.columns and name != target_col:
            impact = evaluate_feature(df, target_col, series, task)
            if not small_dataset and impact < 0.001:
                return

        # Format impact
        if target_col:
            metric_name = "accuracy" if task == "classification" else "R²"
            sign = "+" if impact >= 0 else ""
            impact_str = f"{sign}{(impact * 100):.2f}% {metric_name}"
        else:
            impact_str = "N/A"

        suggestions.append({
            "name": name,
            "formula": formula,
            "type": ftype,
            "expected_impact": impact_str,
            "impact_score": impact,
            "reason": reason
        })

    # A. Numeric Features
    for col in types["numeric"]:
        if col == target_col: continue
        series = df[col]
        
        # Skewness -> log
        try:
            skew = series.skew()
            if abs(skew) > 1.0 and (series >= 0).all():
                add_suggestion(
                    f"{col}_log", f"log({col})", "numeric_transform",
                    np.log1p(series), "reduces skewness for better model fit"
                )
        except Exception: pass

        # Scaling
        # To avoid clutter, we might just suggest standard scaling if std is very high
        if series.std() > 1000:
            add_suggestion(
                f"{col}_scaled", f"standard_scale({col})", "numeric_transform",
                (series - series.mean()) / (series.std() + 1e-9), "standardizes large range"
            )

    # Pairwise Numeric
    # Filter highly variant or highly correlated (with target) columns to pairs
    key_numerics = types["numeric"]
    if len(key_numerics) > 15:
        key_numerics = key_numerics[:15] # Cap pairs

    for i in range(len(key_numerics)):
        for j in range(i+1, len(key_numerics)):
            colA = key_numerics[i]
            colB = key_numerics[j]
            if colA == target_col or colB == target_col: continue

            # generate interactions
            add_suggestion(f"{colA}_plus_{colB}", f"{colA} + {colB}", "interaction", df[colA] + df[colB], f"captures sum of {colA} & {colB}")
            add_suggestion(f"{colA}_minus_{colB}", f"{colA} - {colB}", "interaction", df[colA] - df[colB], f"captures diff of {colA} & {colB}")
            add_suggestion(f"{colA}_mul_{colB}", f"{colA} * {colB}", "interaction", df[colA] * df[colB], f"captures magnitude interaction")
            
            # div
            div_series = df[colA] / df[colB].replace(0, np.nan)
            add_suggestion(f"{colA}_div_{colB}", f"{colA} / {colB}", "interaction", div_series, f"captures ratio of {colA} to {colB}")

    # B. Datetime Features
    for col in types["datetime"]:
        if col == target_col: continue
        try:
            dt_series = pd.to_datetime(df[col], errors="coerce")
            add_suggestion(f"{col}_year", f"year({col})", "datetime_extract", dt_series.dt.year, "extracts year trend")
            add_suggestion(f"{col}_month", f"month({col})", "datetime_extract", dt_series.dt.month, "extracts seasonality")
            add_suggestion(f"{col}_weekday", f"weekday({col})", "datetime_extract", dt_series.dt.weekday, "extracts day of week patterns")
        except Exception: pass

    # C. Categorical Features
    for col in types["categorical"]:
        if col == target_col: continue
        n_unique = df[col].nunique()
        if n_unique < 10:
            add_suggestion(f"{col}_freq_encoded", f"freq_encode({col})", "categorical_encode", 
                df[col].map(df[col].value_counts(normalize=True)), "replaces categories with their frequency")
        
        if target_col and task == "regression" and n_unique >= 2:
            try:
                mean_enc = df.groupby(col)[target_col].mean()
                add_suggestion(f"{col}_target_encoded", f"target_encode({col})", "categorical_encode",
                    df[col].map(mean_enc), "replaces categories with average target value")
            except Exception: pass

    # Sort by impact
    suggestions.sort(key=lambda x: x["impact_score"], reverse=True)
    
    # Remove duplicates by name
    seen = set()
    final_suggestions = []
    for s in suggestions:
        if s["name"] not in seen:
            seen.add(s["name"])
            final_suggestions.append(s)

    if not final_suggestions:
        # Always return helpful defaults for tiny or narrow datasets.
        for col in types["numeric"]:
            if col == target_col:
                continue
            series = df[col]
            if series.nunique() <= 1:
                continue
            final_suggestions.append({
                "name": f"{col}_scaled",
                "formula": f"standard_scale({col})",
                "type": "numeric_transform",
                "expected_impact": "Exploratory",
                "impact_score": 0.0,
                "reason": "Standardizes this numeric column for more stable model training.",
            })
            if len(final_suggestions) >= 3:
                break
        for col in types["categorical"]:
            if col == target_col:
                continue
            if df[col].nunique() >= 2:
                final_suggestions.append({
                    "name": f"{col}_freq_encoded",
                    "formula": f"freq_encode({col})",
                    "type": "categorical_encode",
                    "expected_impact": "Exploratory",
                    "impact_score": 0.0,
                    "reason": "Encodes category frequency — useful when categories repeat often.",
                })
            if len(final_suggestions) >= 5:
                break
        if not final_suggestions and len(df.columns) >= 2:
            cols = [c for c in df.columns if c != target_col][:2]
            if len(cols) == 2:
                c1, c2 = cols
                final_suggestions.append({
                    "name": f"{c1}_mul_{c2}",
                    "formula": f"{c1} * {c2}",
                    "type": "interaction",
                    "expected_impact": "Exploratory",
                    "impact_score": 0.0,
                    "reason": "Combines two columns — a simple interaction feature to try.",
                })

    return final_suggestions[:20]  # Top 20


def apply_features(df: pd.DataFrame, features: list[dict], target_col: str | None = None) -> pd.DataFrame:
    """Applies the parsed feature objects from JSON to the dataframe."""
    df_out = df.copy()

    for f in features:
        fname = f["name"]
        form = f["formula"]
        ftype = f["type"]
        
        try:
            if ftype == "numeric_transform":
                if form.startswith("log("):
                    col = form[4:-1]
                    df_out[fname] = np.log1p(df_out[col].clip(lower=0))
                elif form.startswith("sqrt("):
                    col = form[5:-1]
                    df_out[fname] = np.sqrt(df_out[col].clip(lower=0))
                elif form.startswith("standard_scale("):
                    col = form[15:-1]
                    df_out[fname] = (df_out[col] - df_out[col].mean()) / (df_out[col].std() + 1e-9)
            
            elif ftype == "interaction":
                # Very simple parsing: col1 op col2
                # Extract parts
                parts = form.split(" ")
                if len(parts) == 3:
                    c1, op, c2 = parts
                    if op == "+": df_out[fname] = df_out[c1] + df_out[c2]
                    elif op == "-": df_out[fname] = df_out[c1] - df_out[c2]
                    elif op == "*": df_out[fname] = df_out[c1] * df_out[c2]
                    elif op == "/": df_out[fname] = df_out[c1] / df_out[c2].replace(0, np.nan)
            
            elif ftype == "datetime_extract":
                if form.startswith("year("):
                    col = form[5:-1]
                    df_out[fname] = pd.to_datetime(df_out[col], errors="coerce").dt.year
                elif form.startswith("month("):
                    col = form[6:-1]
                    df_out[fname] = pd.to_datetime(df_out[col], errors="coerce").dt.month
                elif form.startswith("weekday("):
                    col = form[8:-1]
                    df_out[fname] = pd.to_datetime(df_out[col], errors="coerce").dt.weekday
            
            elif ftype == "categorical_encode":
                if form.startswith("freq_encode("):
                    col = form[12:-1]
                    freqs = df_out[col].value_counts(normalize=True)
                    df_out[fname] = df_out[col].map(freqs)
                elif form.startswith("target_encode(") and target_col:
                    col = form[14:-1]
                    means = df_out.groupby(col)[target_col].mean()
                    df_out[fname] = df_out[col].map(means)
        except Exception as e:
            print(f"Warning: Failed to apply feature {fname}. Error: {e}")
            pass
            
    return df_out
