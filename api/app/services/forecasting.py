from __future__ import annotations

from dataclasses import dataclass
from datetime import timezone
from typing import Any, Literal

import numpy as np
import pandas as pd
from fastapi import HTTPException, status
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error


Frequency = Literal["auto", "minute", "hourly", "daily", "weekly", "monthly"]
Aggregation = Literal["sum", "average"]


@dataclass
class ForecastRequestOptions:
    date_column: str
    target_column: str
    horizon: int
    frequency: Frequency = "auto"
    aggregation: Aggregation = "sum"


def detect_forecast_columns(df: pd.DataFrame) -> dict[str, Any]:
    date_columns: list[dict[str, Any]] = []
    numeric_columns: list[dict[str, Any]] = []

    for col in df.columns:
        series = df[col]
        non_missing = int(series.notna().sum())
        if non_missing == 0:
            continue

        name_hint = _looks_like_date_name(str(col))
        parsed_dates = _parse_date_series(series, allow_numeric=name_hint)
        date_ratio = float(parsed_dates.notna().mean()) if len(parsed_dates) else 0.0
        date_columns.append(
            {
                "column": str(col),
                "valid_ratio": round(date_ratio, 3),
                "valid_rows": int(parsed_dates.notna().sum()),
            }
        )

        numeric = pd.to_numeric(series, errors="coerce")
        numeric_ratio = float(numeric.notna().mean()) if len(numeric) else 0.0
        if pd.api.types.is_numeric_dtype(series) or numeric_ratio >= 0.75:
            numeric_columns.append(
                {
                    "column": str(col),
                    "valid_ratio": round(numeric_ratio, 3),
                    "valid_rows": int(numeric.notna().sum()),
                }
            )

    return {"date_columns": date_columns, "numeric_columns": numeric_columns}


def _looks_like_date_name(name: str) -> bool:
    return any(token in name.lower() for token in ("date", "time", "day", "month", "year", "created", "updated", "timestamp"))


def _parse_date_series(series: pd.Series, *, allow_numeric: bool = False) -> pd.Series:
    if pd.api.types.is_numeric_dtype(series) and allow_numeric:
        numeric = pd.to_numeric(series, errors="coerce")
        candidates = [
            pd.to_datetime(numeric, errors="coerce", utc=True, unit="s"),
            pd.to_datetime(numeric, errors="coerce", utc=True, unit="ms"),
        ]
        best = max(candidates, key=lambda s: float(s.notna().mean()) if len(s) else 0.0)
        plausible = best.dt.year.between(1970, 2100)
        return best.where(plausible)
    if pd.api.types.is_numeric_dtype(series):
        return pd.Series(pd.NaT, index=series.index, dtype="datetime64[ns, UTC]")
    return pd.to_datetime(series, errors="coerce", utc=True)


def _freq_to_pandas(freq: Frequency, dates: pd.Series) -> tuple[str, str, list[str]]:
    warnings: list[str] = []
    if freq == "minute":
        return "min", "minute", warnings
    if freq == "hourly":
        return "h", "hourly", warnings
    if freq == "daily":
        return "D", "daily", warnings
    if freq == "weekly":
        return "W", "weekly", warnings
    if freq == "monthly":
        return "MS", "monthly", warnings

    sorted_dates = dates.dropna().sort_values()
    if len(sorted_dates) < 3:
        warnings.append("There are too few dates to confidently detect a rhythm, so daily forecasting was used.")
        return "D", "daily", warnings

    gaps_seconds = sorted_dates.diff().dropna().dt.total_seconds()
    median_seconds = float(gaps_seconds[gaps_seconds > 0].median()) if len(gaps_seconds[gaps_seconds > 0]) else 86400.0
    if median_seconds < 3600:
        return "min", "minute", warnings
    if median_seconds < 86400:
        return "h", "hourly", warnings
    median_gap = median_seconds / 86400
    if median_gap >= 25:
        return "MS", "monthly", warnings
    if median_gap >= 5:
        return "W", "weekly", warnings
    return "D", "daily", warnings


def _horizon_cap(label: str) -> int:
    if label == "minute":
        return 1440
    if label == "hourly":
        return 24 * 90
    if label == "monthly":
        return 36
    if label == "weekly":
        return 104
    return 365


def _safe_float(value: Any) -> float | None:
    try:
        f = float(value)
        if np.isnan(f) or np.isinf(f):
            return None
        return f
    except Exception:
        return None


def _make_features(index: pd.DatetimeIndex) -> np.ndarray:
    t = np.arange(len(index), dtype=float)
    day_of_year = np.array([d.timetuple().tm_yday for d in index], dtype=float)
    month = np.array([d.month for d in index], dtype=float)
    weekday = np.array([d.weekday() for d in index], dtype=float)
    return np.column_stack(
        [
            t,
            np.sin(2 * np.pi * day_of_year / 365.25),
            np.cos(2 * np.pi * day_of_year / 365.25),
            np.sin(2 * np.pi * month / 12),
            np.cos(2 * np.pi * month / 12),
            np.sin(2 * np.pi * weekday / 7),
            np.cos(2 * np.pi * weekday / 7),
            np.array([d.hour for d in index], dtype=float),
            np.array([d.minute for d in index], dtype=float),
        ]
    )


def _linear_forecast(train_y: np.ndarray, train_index: pd.DatetimeIndex, predict_index: pd.DatetimeIndex) -> np.ndarray:
    model = LinearRegression()
    combined_index = pd.DatetimeIndex(list(train_index) + list(predict_index))
    features = _make_features(combined_index)
    model.fit(features[: len(train_y)], train_y)
    return model.predict(features[len(train_y) :])


def _recent_average_forecast(train_y: np.ndarray, horizon: int, *, window: int) -> np.ndarray:
    window = min(max(1, window), len(train_y))
    return np.full(horizon, float(np.mean(train_y[-window:])))


def _exp_smoothing_forecast(train_y: np.ndarray, horizon: int, *, alpha: float) -> np.ndarray:
    level = float(train_y[0])
    for value in train_y[1:]:
        level = alpha * float(value) + (1 - alpha) * level
    return np.full(horizon, level)


def _forecast_candidates(train_y: np.ndarray, train_index: pd.DatetimeIndex, predict_index: pd.DatetimeIndex) -> list[tuple[str, np.ndarray]]:
    candidates = [
        ("recent average", _recent_average_forecast(train_y, len(predict_index), window=3)),
        ("wider recent average", _recent_average_forecast(train_y, len(predict_index), window=7)),
        ("smooth recent pattern", _exp_smoothing_forecast(train_y, len(predict_index), alpha=0.35)),
        ("responsive smoothing", _exp_smoothing_forecast(train_y, len(predict_index), alpha=0.65)),
    ]
    if len(train_y) >= 4:
        candidates.append(("trend and seasonality", _linear_forecast(train_y, train_index, predict_index)))
    return candidates


def _fmt_num(value: float | int | None) -> str:
    if value is None:
        return "-"
    v = float(value)
    if abs(v) >= 1_000_000:
        return f"{v:,.0f}"
    if abs(v) >= 100:
        return f"{v:,.1f}"
    return f"{v:,.2f}"


def _pct_change(start: float, end: float) -> float | None:
    if start == 0:
        return None
    return ((end - start) / abs(start)) * 100


def _generate_insights(
    *,
    series: pd.Series,
    forecast_values: list[float],
    frequency_label: str,
    target_column: str,
    metrics: dict[str, Any],
    filled_periods: int,
    model_name: str,
    horizon: int,
    target_mode: str,
) -> list[dict[str, str]]:
    insights: list[dict[str, str]] = []
    values = series.astype(float)
    last_actual = float(values.iloc[-1])
    first_actual = float(values.iloc[0])
    final_forecast = float(forecast_values[-1]) if forecast_values else last_actual
    avg_forecast = float(np.mean(forecast_values)) if forecast_values else last_actual
    history_change = _pct_change(first_actual, last_actual)
    future_change = _pct_change(last_actual, final_forecast)

    if future_change is not None:
        direction = "increase" if future_change > 3 else "decrease" if future_change < -3 else "stay broadly stable"
        subject = target_column if target_mode == "value" else f"activity for {target_column}"
        insights.append(
            {
                "title": "Expected direction",
                "summary": f"{subject} is expected to {direction} over the next {horizon} {frequency_label} periods.",
                "reasoning": (
                    f"The forecast compares the latest observed level ({_fmt_num(last_actual)}) with the final projected "
                    f"level ({_fmt_num(final_forecast)}), a change of about {future_change:.1f}%."
                ),
            }
        )

    if history_change is not None:
        trend = "upward" if history_change > 5 else "downward" if history_change < -5 else "mostly flat"
        insights.append(
            {
                "title": "Historical trend",
                "summary": f"The historical pattern looks {trend}.",
                "reasoning": (
                    f"The first usable period was {_fmt_num(first_actual)} and the latest period was {_fmt_num(last_actual)}, "
                    f"which is about {history_change:.1f}% different across the available history."
                ),
            }
        )

    recent_window = min(5, max(2, len(values) // 4))
    if len(values) >= recent_window * 2:
        recent = float(values.tail(recent_window).mean())
        previous = float(values.iloc[-recent_window * 2 : -recent_window].mean())
        recent_change = _pct_change(previous, recent)
        if recent_change is not None:
            mood = "stronger" if recent_change > 5 else "weaker" if recent_change < -5 else "similar"
            insights.append(
                {
                    "title": "Recent momentum",
                    "summary": f"Recent performance is {mood} than the period just before it.",
                    "reasoning": (
                        f"The last {recent_window} periods average {_fmt_num(recent)}, compared with {_fmt_num(previous)} "
                        f"for the previous {recent_window} periods."
                    ),
                }
            )

    if len(values) >= 8:
        volatility = float(values.std(ddof=1) / max(abs(values.mean()), 1e-9))
        if volatility >= 0.5:
            label = "high"
            advice = "use the forecast as a planning range rather than a fixed target"
        elif volatility >= 0.2:
            label = "moderate"
            advice = "review the forecast alongside recent business context"
        else:
            label = "low"
            advice = "the series has been comparatively steady"
        insights.append(
            {
                "title": "Planning reliability",
                "summary": f"Past values show {label} variation.",
                "reasoning": (
                    f"The typical spread around the average is about {volatility * 100:.1f}% of the average value, so {advice}."
                ),
            }
        )

    mape = _safe_float(metrics.get("mape"))
    if mape is not None:
        confidence = "high" if mape <= 10 else "medium" if mape <= 25 else "limited"
        insights.append(
            {
                "title": "Prediction confidence",
                "summary": f"Prediction confidence is {confidence}.",
                "reasoning": (
                    f"The forecast was checked against recent history and was off by about {mape:.1f}% on average. "
                    "Lower error means the future estimate is more useful for planning."
                ),
            }
        )

    if filled_periods > 0:
        insights.append(
            {
                "title": "Data completeness",
                "summary": f"{filled_periods} missing time periods were filled before forecasting.",
                "reasoning": (
                    "Forecasting needs a regular timeline. Missing periods were filled from nearby values so the model could "
                    "read the pattern consistently."
                ),
            }
        )

    insights.append(
        {
            "title": "Near-term planning level",
            "summary": f"The average projected value is {_fmt_num(avg_forecast)} per {frequency_label.rstrip('ly')} period.",
            "reasoning": (
                "This is the average of the future forecast points, useful for planning staffing, inventory, marketing, support, or revenue expectations."
            ),
        }
    )

    return insights[:7] if len(insights) >= 5 else insights


def run_forecast(df: pd.DataFrame, options: ForecastRequestOptions) -> dict[str, Any]:
    warnings: list[str] = []
    if df.empty:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This dataset is empty, so forecasting cannot run.")
    if options.date_column not in df.columns:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose a valid date column for forecasting.")
    if options.target_column not in df.columns:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose a valid target column to forecast.")
    if options.date_column == options.target_column:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Date column and value column must be different.")

    dates = _parse_date_series(df[options.date_column], allow_numeric=True)
    if int(dates.notna().sum()) < 4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The selected timeline column does not contain enough readable dates. Choose a column with real dates, months, or timestamps.",
        )

    target_raw = df[options.target_column]
    numeric_values = pd.to_numeric(target_raw, errors="coerce")
    numeric_ratio = float(numeric_values.notna().mean()) if len(numeric_values) else 0.0
    target_mode = "value" if pd.api.types.is_numeric_dtype(target_raw) or numeric_ratio >= 0.75 else "count"
    values = numeric_values if target_mode == "value" else target_raw.notna().astype(float)
    valid = pd.DataFrame({"date": dates, "value": values}).dropna()

    if len(valid) < 4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Forecasting needs at least 4 usable rows with a valid date and target value.",
        )

    dropped = len(df) - len(valid)
    if dropped:
        warnings.append(f"{dropped} rows were skipped because the selected timeline or target value was missing or invalid.")

    valid = valid.sort_values("date")
    freq_code, freq_label, freq_warnings = _freq_to_pandas(options.frequency, valid["date"])
    warnings.extend(freq_warnings)

    cap = _horizon_cap(freq_label)
    horizon = min(max(int(options.horizon), 1), cap)
    if horizon != options.horizon:
        warnings.append(f"The forecast horizon was capped at {cap} {freq_label} periods to keep results responsive.")

    valid["bucket"] = valid["date"].dt.tz_convert(timezone.utc).dt.tz_localize(None)
    if freq_code == "min":
        valid["bucket"] = valid["bucket"].dt.floor("min")
    elif freq_code == "h":
        valid["bucket"] = valid["bucket"].dt.floor("h")
    elif freq_code == "D":
        valid["bucket"] = valid["bucket"].dt.floor("D")
    elif freq_code == "W":
        valid["bucket"] = valid["bucket"].dt.to_period("W").dt.start_time
    else:
        valid["bucket"] = valid["bucket"].dt.to_period("M").dt.start_time

    grouped = valid.groupby("bucket")["value"]
    agg = grouped.sum() if target_mode == "count" or options.aggregation == "sum" else grouped.mean()
    agg = agg.sort_index()
    if len(agg) < 4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="After grouping by time period, there are fewer than 4 periods. Try a smaller timeline such as hourly or minute.",
        )

    full_index = pd.date_range(agg.index.min(), agg.index.max(), freq=freq_code)
    filled_periods = max(0, len(full_index) - len(agg))
    series = agg.reindex(full_index)
    if series.isna().any():
        series = series.interpolate(limit_direction="both")
    if filled_periods:
        warnings.append(f"{filled_periods} missing {freq_label} periods were filled to create a regular timeline.")
    if len(series) < 8:
        warnings.append("The history is short. Treat this forecast as an early directional estimate.")
    elif len(series) < 30:
        warnings.append("More history would improve confidence, especially if the business has seasonal swings.")

    y = series.astype(float).to_numpy()
    test_size = min(max(1, int(len(y) * 0.2)), max(1, len(y) // 3))
    train_end = len(y) - test_size
    if train_end < 3:
        train_end = len(y)
        test_size = 0

    future_index = pd.date_range(series.index[-1] + pd.tseries.frequencies.to_offset(freq_code), periods=horizon, freq=freq_code)

    if test_size:
        actual_test = y[train_end:]
        test_candidates = _forecast_candidates(
            y[:train_end],
            pd.DatetimeIndex(series.index[:train_end]),
            pd.DatetimeIndex(series.index[train_end:]),
        )
        model_name, backtest_pred = min(
            test_candidates,
            key=lambda item: float(mean_absolute_error(actual_test, item[1])),
        )
        mae = float(mean_absolute_error(actual_test, backtest_pred))
        full_candidates = _forecast_candidates(y, pd.DatetimeIndex(series.index), future_index)
        forecast_values = [
            float(v)
            for name, values_for_model in full_candidates
            if name == model_name
            for v in values_for_model
        ]
        actual_test = y[train_end:]
        mape = float(np.mean(np.abs((actual_test - backtest_pred) / np.maximum(np.abs(actual_test), 1e-9))) * 100)
        residual_std = float(np.std(actual_test - backtest_pred, ddof=1)) if len(actual_test) > 1 else mae
    else:
        model_name = "trend and seasonality" if len(y) >= 4 else "recent average"
        full_candidates = _forecast_candidates(y, pd.DatetimeIndex(series.index), future_index)
        forecast_values = [
            float(v)
            for name, values_for_model in full_candidates
            if name == model_name
            for v in values_for_model
        ]
        if not forecast_values:
            model_name = "recent average"
            forecast_values = [float(v) for v in _recent_average_forecast(y, horizon, window=3)]
        mae = None
        mape = None
        residual_std = float(np.std(y, ddof=1)) if len(y) > 1 else 0.0

    lower = [max(0.0, v - 1.64 * residual_std) for v in forecast_values]
    upper = [v + 1.64 * residual_std for v in forecast_values]
    metrics = {
        "mae": round(mae, 4) if mae is not None else None,
        "mape": round(mape, 2) if mape is not None else None,
        "backtest_periods": test_size,
    }

    insights = _generate_insights(
        series=series,
        forecast_values=forecast_values,
        frequency_label=freq_label,
        target_column=options.target_column,
        metrics=metrics,
        filled_periods=filled_periods,
        model_name=model_name,
        horizon=horizon,
        target_mode=target_mode,
    )

    actual_points = [
        {"date": idx.date().isoformat(), "value": round(float(val), 4)}
        for idx, val in series.tail(120).items()
    ]
    forecast_points = [
        {
            "date": idx.date().isoformat(),
            "predicted": round(float(pred), 4),
            "lower": round(float(lo), 4),
            "upper": round(float(hi), 4),
        }
        for idx, pred, lo, hi in zip(future_index, forecast_values, lower, upper)
    ]

    return {
        "date_column": options.date_column,
        "target_column": options.target_column,
        "target_mode": target_mode,
        "frequency": freq_label,
        "aggregation": "count" if target_mode == "count" else options.aggregation,
        "horizon": horizon,
        "model": model_name,
        "history_periods": int(len(series)),
        "metrics": metrics,
        "warnings": warnings,
        "actual": actual_points,
        "forecast": forecast_points,
        "insights": insights,
    }
