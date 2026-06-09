from __future__ import annotations

import warnings
from typing import Any

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

SEGMENT_HINTS = (
    "customer",
    "client",
    "segment",
    "plan",
    "product",
    "category",
    "region",
    "country",
    "city",
    "market",
    "channel",
    "status",
    "department",
    "team",
    "industry",
)

OPERATION_HINTS = ("ticket", "support", "issue", "complaint", "case", "delay", "return", "churn", "risk")
IDENTIFIER_HINTS = ("id", "uuid", "key", "hash", "token", "code", "ref")


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


def _score(name: str, hints: tuple[str, ...]) -> int:
    lower = name.lower()
    return sum(3 for token in hints if token in lower)


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


def _is_identifier_column(name: str, series: pd.Series) -> bool:
    lower = name.lower().replace("-", "_").replace(" ", "_")
    parts = [p for p in lower.split("_") if p]
    name_says_identifier = (
        lower.endswith("_id")
        or lower.endswith("_number")
        or lower == "id"
        or any(part in IDENTIFIER_HINTS for part in parts)
        or any(token in lower for token in ("customerid", "userid", "orderid", "transactionid", "invoiceid"))
    )
    non_null = series.dropna()
    if len(non_null) < 3:
        return name_says_identifier
    numeric = pd.to_numeric(non_null, errors="coerce")
    mostly_sequential = bool(
        numeric.notna().mean() >= 0.95
        and numeric.nunique(dropna=True) == len(numeric)
        and numeric.sort_values().diff().dropna().abs().median() in (1, 1.0)
    )
    return name_says_identifier or mostly_sequential


def _numeric_columns(df: pd.DataFrame) -> list[str]:
    cols: list[str] = []
    for col in df.columns:
        lower = str(col).lower()
        if pd.api.types.is_datetime64_any_dtype(df[col]) or any(token in lower for token in ("date", "time", "timestamp", "created_at", "updated_at")):
            continue
        numeric = pd.to_numeric(df[col], errors="coerce")
        if (pd.api.types.is_numeric_dtype(df[col]) or numeric.notna().mean() >= 0.75) and not _is_identifier_column(str(col), df[col]):
            cols.append(str(col))
    return cols


def _category_columns(df: pd.DataFrame, numeric_cols: list[str]) -> list[str]:
    cols: list[str] = []
    row_count = max(len(df), 1)
    for col in df.columns:
        if str(col) in numeric_cols:
            continue
        unique = int(df[col].nunique(dropna=True))
        if 2 <= unique <= min(60, max(2, row_count // 2)):
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
            _score(col, BUSINESS_NUMERIC_HINTS),
            pd.to_numeric(df[col], errors="coerce").notna().sum(),
            abs(pd.to_numeric(df[col], errors="coerce").mean(skipna=True) or 0),
        ),
    )


def _choose_segment_column(df: pd.DataFrame, category_cols: list[str]) -> str | None:
    if not category_cols:
        return None
    return max(
        category_cols,
        key=lambda col: (
            _score(col, SEGMENT_HINTS),
            min(int(df[col].nunique(dropna=True)), 25),
            -int(df[col].nunique(dropna=True)),
        ),
    )


def _choose_operation_numeric(numeric_cols: list[str]) -> str | None:
    scored = [(col, _score(col, OPERATION_HINTS)) for col in numeric_cols]
    scored = [item for item in scored if item[1] > 0]
    return max(scored, key=lambda item: item[1])[0] if scored else None


def _chart(title: str, description: str, items: list[dict[str, Any]], value_suffix: str = "", chart_type: str = "bar") -> dict[str, Any]:
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
        "type": chart_type,
        "value_suffix": value_suffix,
        "items": cleaned[:12],
    }


def _histogram_chart(series: pd.Series, title: str, description: str) -> dict[str, Any] | None:
    values = pd.to_numeric(series, errors="coerce").dropna()
    if len(values) < 5:
        return None
    bins = min(8, max(4, int(np.sqrt(len(values)))))
    counts, edges = np.histogram(values, bins=bins)
    items = []
    for idx, count in enumerate(counts):
        start = _fmt_num(float(edges[idx]))
        end = _fmt_num(float(edges[idx + 1]))
        items.append({"label": f"{start} to {end}", "value": int(count), "hint": f"{int(count)} records"})
    return _chart(title, description, items, chart_type="histogram")


def _insight(title: str, summary: str, reasoning: str) -> dict[str, str]:
    return {"title": title, "summary": summary, "reasoning": reasoning}


def _kpi(label: str, value: str, detail: str) -> dict[str, str]:
    return {"label": label, "value": value, "detail": detail}


def run_business_insights(df: pd.DataFrame) -> dict[str, Any]:
    if df.empty:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This dataset is empty, so business insights cannot run.")

    df = df.copy()
    row_count = int(len(df))
    column_count = int(len(df.columns))
    numeric_cols = _numeric_columns(df)
    category_cols = _category_columns(df, numeric_cols)
    date_cols = _date_columns(df)
    primary_metric = _choose_business_numeric(df, numeric_cols)
    primary_segment = _choose_segment_column(df, category_cols)
    operation_metric = _choose_operation_numeric(numeric_cols)

    charts: list[dict[str, Any]] = []
    insights: list[dict[str, str]] = []
    kpis: list[dict[str, str]] = []

    if numeric_cols:
        totals = []
        for col in sorted(numeric_cols, key=lambda c: _score(c, BUSINESS_NUMERIC_HINTS), reverse=True)[:12]:
            s = pd.to_numeric(df[col], errors="coerce")
            total = _safe_float(s.sum())
            if total is not None:
                totals.append({"label": col, "value": abs(total), "hint": f"Total {_fmt_num(total)}"})
        if totals:
            charts.append(_chart("Business metric totals", "Compares the largest measurable business values in the dataset.", totals))

    if primary_metric:
        metric = pd.to_numeric(df[primary_metric], errors="coerce")
        usable_metric = metric.dropna()
        if len(usable_metric):
            total = float(usable_metric.sum())
            avg = float(usable_metric.mean())
            distribution = _histogram_chart(
                usable_metric,
                f"{primary_metric} distribution",
                "Shows whether most records are low, mid-range, or high value.",
            )
            if distribution:
                charts.append(distribution)
            kpis.append(_kpi(f"Total {primary_metric}", _fmt_num(total), "Overall business value across usable records."))
            kpis.append(_kpi(f"Average {primary_metric}", _fmt_num(avg), "Typical value per record."))
            insights.append(
                _insight(
                    "Main business value",
                    f"{primary_metric} totals {_fmt_num(total)} across the dataset.",
                    f"The app selected {primary_metric} because its name and values look business-relevant. The total shows business scale, while the average of {_fmt_num(avg)} shows the typical value per record.",
                )
            )

            top_count = max(1, int(len(usable_metric) * 0.1))
            top_share = float(usable_metric.sort_values(ascending=False).head(top_count).sum() / max(abs(total), 1e-9) * 100)
            kpis.append(_kpi("Top value concentration", _pct(top_share), f"Share of {primary_metric} from the top records."))
            insights.append(
                _insight(
                    "Value concentration",
                    f"The top {top_count:,} records contribute {_pct(top_share)} of total {primary_metric}.",
                    f"The app sorted {primary_metric} from highest to lowest and measured how much the largest records contribute. A high share means a small group of customers, orders, products, or accounts may be driving most of the business value.",
                )
            )

            if operation_metric and operation_metric != primary_metric:
                joined = pd.DataFrame(
                    {
                        "value": metric,
                        "operation": pd.to_numeric(df[operation_metric], errors="coerce"),
                    }
                ).dropna()
                if len(joined) >= 3:
                    corr = _safe_float(joined["value"].corr(joined["operation"]))
                    if corr is not None:
                        direction = "rise together" if corr > 0.25 else "move in opposite directions" if corr < -0.25 else "do not show a strong movement together"
                        insights.append(
                            _insight(
                                "Operational pressure",
                                f"{primary_metric} and {operation_metric} {direction}.",
                                f"The app compared {primary_metric} with {operation_metric}. This helps reveal whether higher business value is linked with more support work, risk, returns, complaints, or other operational load.",
                            )
                        )

    if category_cols:
        selected_category = primary_segment or category_cols[0]
        counts = df[selected_category].astype(str).replace({"nan": "Unknown"}).value_counts(dropna=False).head(10)
        if len(counts):
            top_label = str(counts.index[0])
            top_share = float(counts.iloc[0] / max(row_count, 1) * 100)
            charts.append(
                _chart(
                    f"Top groups in {selected_category}",
                    "Shows which segment appears most often in the business records.",
                    [{"label": idx, "value": val, "hint": f"{val} records"} for idx, val in counts.items()],
                    chart_type="pie",
                )
            )
            kpis.append(_kpi("Largest segment", top_label, f"{_pct(top_share)} of records."))
            insights.append(
                _insight(
                    "Largest business segment",
                    f"{top_label} is the largest group in {selected_category}, representing {_pct(top_share)} of records.",
                    f"The app counted each value in {selected_category}. This group has the largest visible presence, so it may deserve focused reporting, retention review, sales analysis, or operational planning.",
                )
            )

    if primary_metric and category_cols:
        metric = pd.to_numeric(df[primary_metric], errors="coerce")
        best_segment: tuple[str, str, float, int] | None = None
        weakest_segment: tuple[str, str, float, int] | None = None
        categories_to_check = [primary_segment] if primary_segment else []
        categories_to_check.extend([c for c in category_cols[:12] if c not in categories_to_check])

        for cat in categories_to_check:
            work = pd.DataFrame({"segment": df[cat].astype(str), "value": metric}).dropna()
            if work.empty:
                continue
            grouped = work.groupby("segment")["value"].agg(["mean", "count"]).query("count >= 2").sort_values("mean", ascending=False)
            if grouped.empty:
                continue
            top_name = str(grouped.index[0])
            top_value = float(grouped.iloc[0]["mean"])
            top_count = int(grouped.iloc[0]["count"])
            if best_segment is None or top_value > best_segment[2]:
                best_segment = (cat, top_name, top_value, top_count)
            low_name = str(grouped.index[-1])
            low_value = float(grouped.iloc[-1]["mean"])
            low_count = int(grouped.iloc[-1]["count"])
            if weakest_segment is None or low_value < weakest_segment[2]:
                weakest_segment = (cat, low_name, low_value, low_count)

        if best_segment:
            cat, segment, value, count = best_segment
            kpis.append(_kpi("Best performing segment", segment, f"Highest average {primary_metric}: {_fmt_num(value)}."))
            charts.append(
                _chart(
                    f"{primary_metric} by {cat}",
                    "Highlights which segment has the highest average business value.",
                    [
                        {"label": idx, "value": val, "hint": f"Average {_fmt_num(val)}"}
                        for idx, val in pd.DataFrame({"segment": df[cat].astype(str), "value": metric})
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
                    f"{segment} has the highest average {primary_metric} within {cat}.",
                    f"The app compared average {primary_metric} across groups in {cat}. {segment} leads with an average of {_fmt_num(value)} across {count:,} usable rows, making it a useful segment to study for pricing, retention, sales, or operational focus.",
                )
            )
        if weakest_segment:
            cat, segment, value, count = weakest_segment
            insights.append(
                _insight(
                    "Lowest value segment",
                    f"{segment} has the lowest average {primary_metric} within {cat}.",
                    f"The app compared group averages inside {cat}. {segment} averages {_fmt_num(value)} across {count:,} usable rows, so it may need pricing review, better onboarding, product changes, or targeted support depending on your business context.",
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
                    "Strongest business metric relationships",
                    "Higher bars mean two measurable business fields move together more often.",
                    [{"label": f"{a} / {b}", "value": v * 100, "hint": f"{_pct(v * 100)} relationship strength"} for a, b, v in pairs[:10]],
                    "%",
                )
            )
            a, b, value = pairs[0]
            insights.append(
                _insight(
                    "Strongest metric relationship",
                    f"{a} and {b} move together the most among measurable fields.",
                    f"The app compared numeric business fields pair by pair. This pair had the strongest relationship at {_pct(value * 100)}, which may point to a business driver, dependency, or duplicated measurement worth investigating.",
                )
            )

    if date_cols:
        date_name, dates = max(date_cols, key=lambda item: int(item[1].notna().sum()))
        usable = dates.dropna().sort_values()
        if len(usable):
            daily = usable.dt.tz_convert("UTC").dt.tz_localize(None).dt.floor("D").value_counts().sort_index()
            charts.append(
                _chart(
                    f"Business activity over time ({date_name})",
                    "Shows when records are concentrated across the available timeline.",
                    [{"label": idx.date().isoformat(), "value": val, "hint": f"{val} records"} for idx, val in daily.tail(12).items()],
                    chart_type="line",
                )
            )
            insights.append(
                _insight(
                    "Business timeline",
                    f"Business activity is visible from {usable.iloc[0].date().isoformat()} to {usable.iloc[-1].date().isoformat()}.",
                    f"The app read {date_name} as the strongest timeline field. This date range helps teams understand whether the dataset covers a recent campaign, sales period, customer lifecycle, or operational window.",
                )
            )
            if len(daily) >= 4:
                window = max(2, min(7, len(daily) // 2))
                recent = float(daily.tail(window).mean())
                previous = float(daily.iloc[:-window].tail(window).mean())
                if previous:
                    change = (recent - previous) / previous * 100
                    direction = "higher" if change > 5 else "lower" if change < -5 else "similar"
                    kpis.append(_kpi("Recent activity movement", _pct(change), "Change in recent activity versus the previous comparable window."))
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
                f"The dataset supports comparisons across {len(category_cols)} business grouping fields.",
                "These fields can help teams compare customers, products, plans, regions, channels, or operational groups instead of only looking at totals. The most useful next dashboard view is usually the one that combines a business metric with one of these segments.",
            )
        )

    if len(numeric_cols) >= 2:
        insights.append(
            _insight(
                "Metric dashboard potential",
                f"{len(numeric_cols)} measurable business fields can support KPI cards, trend views, and segment comparisons.",
                "Numeric fields can be used for totals, averages, rankings, and performance monitoring. These are the main building blocks for business dashboards.",
            )
        )

    while len(insights) < 10:
        title = [
            "Decision support",
            "Dashboard focus",
            "Next action",
            "Business review area",
            "Operational planning",
        ][len(insights) % 5]
        insights.append(
            _insight(
                title,
                "This dataset has enough structure to support a business review, but the most useful decision depends on your business goal.",
                "The app found fields that can be grouped, counted, or summarized. Use the strongest charts above to decide whether the next step should be segment deep-dives, forecasting, pricing review, retention analysis, or operational planning.",
            )
        )

    return {
        "row_count": row_count,
        "column_count": column_count,
        "numeric_columns": len(numeric_cols),
        "category_columns": len(category_cols),
        "date_columns": len(date_cols),
        "primary_metric": primary_metric,
        "primary_segment": primary_segment,
        "kpis": kpis[:4],
        "charts": charts[:8],
        "insights": insights[:12],
        "warnings": [],
    }
