from __future__ import annotations

from typing import Any
import warnings

import numpy as np
import pandas as pd
from fastapi import HTTPException, status


BUSINESS_NUMERIC_HINTS = (
    "revenue",
    "sales",
    "amount",
    "price",
    "total",
    "profit",
    "cost",
    "spend",
    "value",
    "income",
    "balance",
    "margin",
    "quantity",
    "orders",
    "tickets",
    "usage",
    "score",
    "rating",
)


def _fmt_num(value: float | int | None) -> str:
    if value is None:
        return "-"
    try:
        v = float(value)
    except Exception:
        return "-"
    if not np.isfinite(v):
        return "-"
    if abs(v) >= 1_000_000:
        return f"{v:,.0f}"
    if abs(v) >= 100:
        return f"{v:,.1f}"
    return f"{v:,.2f}"


def _pct(value: float | int | None) -> str:
    try:
        v = float(value)
    except Exception:
        return "-"
    if not np.isfinite(v):
        return "-"
    return f"{v:.1f}%"


def _safe_float(value: Any) -> float | None:
    try:
        v = float(value)
        return v if np.isfinite(v) else None
    except Exception:
        return None


def _business_score(name: str) -> int:
    lower = name.lower()
    return sum(3 for token in BUSINESS_NUMERIC_HINTS if token in lower)


def _parse_date_series(series: pd.Series) -> pd.Series:
    if pd.api.types.is_numeric_dtype(series):
        numeric = pd.to_numeric(series, errors="coerce")
        candidates = [
            pd.to_datetime(numeric, errors="coerce", utc=True, unit="s"),
            pd.to_datetime(numeric, errors="coerce", utc=True, unit="ms"),
        ]
        best = max(candidates, key=lambda s: float(s.notna().mean()) if len(s) else 0.0)
        plausible = best.dt.year.between(1970, 2100)
        return best.where(plausible)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        return pd.to_datetime(series, errors="coerce", utc=True)


def _column_kind(series: pd.Series) -> str:
    if pd.api.types.is_bool_dtype(series):
        return "Yes/no"
    numeric = pd.to_numeric(series, errors="coerce")
    if pd.api.types.is_numeric_dtype(series) or numeric.notna().mean() >= 0.75:
        return "Number"
    dates = _parse_date_series(series)
    if dates.notna().mean() >= 0.65:
        return "Date/time"
    return "Category"


def _chart(title: str, description: str, items: list[dict[str, Any]], value_suffix: str = "") -> dict[str, Any]:
    cleaned = [
        {
            "label": str(item.get("label") or "-")[:80],
            "value": round(float(item.get("value") or 0), 4),
            "hint": str(item.get("hint") or ""),
        }
        for item in items
        if _safe_float(item.get("value")) is not None
    ]
    return {
        "title": title,
        "description": description,
        "type": "bar",
        "value_suffix": value_suffix,
        "items": cleaned[:12],
    }


def _insight(title: str, summary: str, reasoning: str) -> dict[str, str]:
    return {"title": title, "summary": summary, "reasoning": reasoning}


def _numeric_columns(df: pd.DataFrame) -> list[str]:
    cols: list[str] = []
    for col in df.columns:
        numeric = pd.to_numeric(df[col], errors="coerce")
        if pd.api.types.is_numeric_dtype(df[col]) or numeric.notna().mean() >= 0.75:
            cols.append(str(col))
    return cols


def _category_columns(df: pd.DataFrame) -> list[str]:
    cols: list[str] = []
    row_count = max(len(df), 1)
    for col in df.columns:
        if str(col) in _numeric_columns(df):
            continue
        unique = int(df[col].nunique(dropna=True))
        if 2 <= unique <= min(50, max(2, row_count // 2)):
            cols.append(str(col))
    return cols


def _date_columns(df: pd.DataFrame) -> list[tuple[str, pd.Series]]:
    found: list[tuple[str, pd.Series]] = []
    for col in df.columns:
        dates = _parse_date_series(df[col])
        if dates.notna().mean() >= 0.55 and int(dates.notna().sum()) >= 3:
            found.append((str(col), dates))
    return found


def _choose_business_numeric(df: pd.DataFrame, numeric_cols: list[str]) -> str | None:
    if not numeric_cols:
        return None
    return max(
        numeric_cols,
        key=lambda col: (
            _business_score(col),
            pd.to_numeric(df[col], errors="coerce").notna().sum(),
            abs(pd.to_numeric(df[col], errors="coerce").mean(skipna=True) or 0),
        ),
    )


def _top_category_chart(df: pd.DataFrame, category_cols: list[str]) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    if not category_cols:
        return None, None
    best = max(category_cols, key=lambda c: min(df[c].nunique(dropna=True), 20))
    counts = df[best].astype(str).replace({"nan": "Missing"}).value_counts(dropna=False).head(10)
    chart = _chart(
        f"Top groups in {best}",
        "Shows which group values appear most often in the dataset.",
        [{"label": idx, "value": val, "hint": f"{val} rows"} for idx, val in counts.items()],
    )
    top_label = str(counts.index[0]) if len(counts) else "-"
    top_share = float(counts.iloc[0] / max(len(df), 1) * 100) if len(counts) else 0.0
    insight = _insight(
        "Largest customer or business group",
        f"{top_label} is the largest group in {best}, representing {_pct(top_share)} of rows.",
        f"The app counted each value in {best}. The most common value appears {int(counts.iloc[0]) if len(counts) else 0} times out of {len(df)} rows, making it the largest visible segment.",
    )
    return chart, insight


def run_business_insights(df: pd.DataFrame) -> dict[str, Any]:
    if df.empty:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This dataset is empty, so business insights cannot run.")

    df = df.copy()
    row_count = int(len(df))
    column_count = int(len(df.columns))
    missing_pct = float(df.isna().sum().sum() / max(row_count * max(column_count, 1), 1) * 100)
    duplicate_rows = int(df.duplicated().sum())

    numeric_cols = _numeric_columns(df)
    category_cols = _category_columns(df)
    date_cols = _date_columns(df)
    target_numeric = _choose_business_numeric(df, numeric_cols)

    kinds: dict[str, int] = {}
    for col in df.columns:
        kind = _column_kind(df[col])
        kinds[kind] = kinds.get(kind, 0) + 1

    charts: list[dict[str, Any]] = [
        _chart(
            "Column types",
            "A quick view of what kind of information the dataset contains.",
            [{"label": label, "value": value, "hint": f"{value} columns"} for label, value in kinds.items()],
            " cols",
        )
    ]

    missing_by_col = (df.isna().mean() * 100).sort_values(ascending=False)
    charts.append(
        _chart(
            "Missing data by column",
            "Columns with high missing values should be cleaned before important decisions.",
            [{"label": col, "value": pct, "hint": f"{_pct(pct)} empty"} for col, pct in missing_by_col.head(12).items()],
            "%",
        )
    )

    insights: list[dict[str, str]] = [
        _insight(
            "Dataset readiness",
            f"The dataset contains {row_count:,} rows and {column_count:,} columns.",
            "This gives a quick sense of the business coverage available for analysis. More rows usually mean patterns are more reliable, while many columns can provide more angles for segmentation and decision-making.",
        ),
        _insight(
            "Data completeness",
            f"About {_pct(missing_pct)} of all cells are missing.",
            "The app compared empty cells against the total number of cells in the dataset. Lower missingness usually means dashboards and decisions are less likely to be distorted by incomplete information.",
        ),
    ]

    if duplicate_rows:
        duplicate_pct = duplicate_rows / max(row_count, 1) * 100
        insights.append(
            _insight(
                "Duplicate record risk",
                f"{duplicate_rows:,} duplicate rows were found, equal to {_pct(duplicate_pct)} of the dataset.",
                "Duplicate rows can overstate revenue, activity, customer counts, support volume, or demand. Reviewing duplicates before reporting helps avoid inflated business numbers.",
            )
        )
    else:
        insights.append(
            _insight(
                "Duplicate record risk",
                "No fully duplicate rows were found.",
                "The app checked whether entire rows repeat exactly. This reduces the chance that totals or counts are inflated by repeated records.",
            )
        )

    high_missing = missing_by_col[missing_by_col >= 20]
    if len(high_missing):
        top_col = str(high_missing.index[0])
        insights.append(
            _insight(
                "Cleaning priority",
                f"{top_col} has the highest missing data at {_pct(float(high_missing.iloc[0]))}.",
                "This column should be reviewed first because heavily missing fields can weaken dashboards, segment comparisons, and any later modeling work.",
            )
        )

    if numeric_cols:
        numeric_summary_items: list[dict[str, Any]] = []
        for col in numeric_cols[:12]:
            s = pd.to_numeric(df[col], errors="coerce")
            mean = _safe_float(s.mean())
            if mean is not None:
                numeric_summary_items.append({"label": col, "value": abs(mean), "hint": f"Average {_fmt_num(mean)}"})
        charts.append(_chart("Numeric averages", "Compares average size across numeric business fields.", numeric_summary_items))

    if target_numeric:
        target = pd.to_numeric(df[target_numeric], errors="coerce").dropna()
        if len(target):
            total = float(target.sum())
            avg = float(target.mean())
            insights.append(
                _insight(
                    "Key numeric performance field",
                    f"{target_numeric} totals {_fmt_num(total)} with an average row value of {_fmt_num(avg)}.",
                    f"The app selected {target_numeric} because its name and values look business-relevant. Summing it gives the overall scale, while the average shows the typical value per record.",
                )
            )
            q1 = float(target.quantile(0.25))
            q3 = float(target.quantile(0.75))
            iqr = q3 - q1
            if iqr > 0:
                outliers = int(((target < q1 - 1.5 * iqr) | (target > q3 + 1.5 * iqr)).sum())
                outlier_pct = outliers / max(len(target), 1) * 100
                insights.append(
                    _insight(
                        "Unusual value check",
                        f"{outliers:,} unusual values were found in {target_numeric}.",
                        f"The app compared values against the normal middle range for {target_numeric}. Unusual values equal {_pct(outlier_pct)} of usable records and may represent premium customers, errors, one-off events, or special cases worth reviewing.",
                    )
                )

    cat_chart, cat_insight = _top_category_chart(df, category_cols)
    if cat_chart:
        charts.append(cat_chart)
    if cat_insight:
        insights.append(cat_insight)

    if target_numeric and category_cols:
        target_values = pd.to_numeric(df[target_numeric], errors="coerce")
        best_segment: tuple[str, str, float, int] | None = None
        for cat in category_cols[:12]:
            work = pd.DataFrame({"segment": df[cat].astype(str), "value": target_values}).dropna()
            if work.empty:
                continue
            grouped = work.groupby("segment")["value"].agg(["mean", "count"]).query("count >= 2").sort_values("mean", ascending=False)
            if grouped.empty:
                continue
            segment = str(grouped.index[0])
            value = float(grouped.iloc[0]["mean"])
            count = int(grouped.iloc[0]["count"])
            if best_segment is None or value > best_segment[2]:
                best_segment = (cat, segment, value, count)
        if best_segment:
            cat, segment, value, count = best_segment
            charts.append(
                _chart(
                    f"{target_numeric} by {cat}",
                    "Highlights which segment has the highest average business value.",
                    [
                        {"label": idx, "value": val, "hint": f"Average {_fmt_num(val)}"}
                        for idx, val in pd.DataFrame({"segment": df[cat].astype(str), "value": target_values})
                        .dropna()
                        .groupby("segment")["value"]
                        .mean()
                        .sort_values(ascending=False)
                        .head(10)
                        .items()
                    ],
                )
            )
            insights.append(
                _insight(
                    "Highest value segment",
                    f"{segment} has the highest average {target_numeric} within {cat}.",
                    f"The app compared average {target_numeric} across groups in {cat}. {segment} leads with an average of {_fmt_num(value)} across {count:,} usable rows, making it a useful segment to study for pricing, retention, sales, or operational focus.",
                )
            )

    if len(numeric_cols) >= 2:
        numeric_df = df[numeric_cols].apply(pd.to_numeric, errors="coerce")
        corr = numeric_df.corr(numeric_only=True).abs()
        pairs: list[tuple[str, str, float]] = []
        for i, col_a in enumerate(corr.columns):
            for col_b in corr.columns[i + 1 :]:
                value = _safe_float(corr.loc[col_a, col_b])
                if value is not None:
                    pairs.append((str(col_a), str(col_b), value))
        pairs.sort(key=lambda p: p[2], reverse=True)
        if pairs:
            charts.append(
                _chart(
                    "Strongest numeric relationships",
                    "Higher bars mean two numeric fields move together more often.",
                    [{"label": f"{a} / {b}", "value": v * 100, "hint": f"{_pct(v * 100)} relationship strength"} for a, b, v in pairs[:10]],
                    "%",
                )
            )
            a, b, value = pairs[0]
            insights.append(
                _insight(
                    "Strongest numeric relationship",
                    f"{a} and {b} move together the most among numeric fields.",
                    f"The app compared numeric fields pair by pair. This pair had the strongest relationship at {_pct(value * 100)}, which may point to a business driver, dependency, or duplicated measurement worth investigating.",
                )
            )

    if date_cols:
        date_name, dates = max(date_cols, key=lambda item: int(item[1].notna().sum()))
        usable = dates.dropna().sort_values()
        if len(usable):
            daily = usable.dt.tz_convert("UTC").dt.tz_localize(None).dt.floor("D").value_counts().sort_index()
            charts.append(
                _chart(
                    f"Activity over time ({date_name})",
                    "Shows when records are concentrated across the available timeline.",
                    [{"label": idx.date().isoformat(), "value": val, "hint": f"{val} records"} for idx, val in daily.tail(12).items()],
                )
            )
            insights.append(
                _insight(
                    "Timeline coverage",
                    f"The dataset runs from {usable.iloc[0].date().isoformat()} to {usable.iloc[-1].date().isoformat()}.",
                    f"The app read {date_name} as the strongest timeline field. Knowing the date range helps decide whether the dataset is recent enough for current planning or whether older records should be filtered.",
                )
            )
            if len(daily) >= 4:
                recent = float(daily.tail(max(2, min(7, len(daily) // 2))).mean())
                previous = float(daily.iloc[: -max(2, min(7, len(daily) // 2))].tail(max(2, min(7, len(daily) // 2))).mean())
                if previous:
                    change = (recent - previous) / previous * 100
                    direction = "higher" if change > 5 else "lower" if change < -5 else "similar"
                    insights.append(
                        _insight(
                            "Recent activity movement",
                            f"Recent record activity is {direction} than the period before it.",
                            f"The app compared the average number of records in the latest days against the previous comparable days. The change was about {_pct(change)}, which can help spot rising or falling business activity.",
                        )
                    )

    if len(category_cols) >= 2:
        insights.append(
            _insight(
                "Segmentation opportunity",
                f"{len(category_cols)} useful category fields were found for grouping customers, products, regions, or operations.",
                "Category fields are useful for business dashboards because they let teams compare groups instead of only looking at total numbers. These fields can support retention, pricing, regional, support, or product analysis depending on the dataset.",
            )
        )

    if len(numeric_cols) >= 2:
        insights.append(
            _insight(
                "Metric dashboard potential",
                f"{len(numeric_cols)} numeric fields were found for KPI cards, trend views, and segment comparisons.",
                "Numeric fields can be used for totals, averages, rankings, and performance monitoring. These are the main building blocks for business dashboards.",
            )
        )

    while len(insights) < 10:
        title = [
            "Decision support",
            "Dashboard readiness",
            "Next action",
            "Business review area",
            "Operational planning",
        ][len(insights) % 5]
        insights.append(
            _insight(
                title,
                "This dataset has enough structure to support a business review, but the most useful decision depends on your business goal.",
                "The app found columns that can be grouped, counted, or summarized. Use the strongest charts above to decide whether the next step should be cleaning, segmentation, forecasting, or model comparison.",
            )
        )

    return {
        "row_count": row_count,
        "column_count": column_count,
        "numeric_columns": len(numeric_cols),
        "category_columns": len(category_cols),
        "date_columns": len(date_cols),
        "missing_cells_percent": round(missing_pct, 2),
        "duplicate_rows": duplicate_rows,
        "charts": charts[:8],
        "insights": insights[:12],
        "warnings": [],
    }
