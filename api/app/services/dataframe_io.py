"""Memory-conscious tabular loading (row/column caps per plan)."""

from __future__ import annotations

import io
import json
from typing import Literal

import pandas as pd
from fastapi import HTTPException, status

from ..core.data_limits import MAX_COLUMNS, PREVIEW_MAX_ROWS, UserDataLimits, LoadMode, row_cap

AllowedExtension = Literal["csv", "json", "xls", "xlsx", "parquet"]


def clip_columns(df: pd.DataFrame, max_columns: int = MAX_COLUMNS) -> pd.DataFrame:
    if df.shape[1] <= max_columns:
        return df
    return df.iloc[:, :max_columns].copy()


def read_tabular_bytes(
    data: bytes,
    extension: AllowedExtension,
    max_rows: int,
    max_columns: int = MAX_COLUMNS,
) -> pd.DataFrame:
    bio = io.BytesIO(data)

    if extension == "csv":
        df = pd.read_csv(bio, nrows=max_rows)
    elif extension == "json":
        df = _read_json_limited(data, max_rows=max_rows)
        if len(df) > max_rows:
            df = df.head(max_rows)
    elif extension in ("xls", "xlsx"):
        bio.seek(0)
        df = pd.read_excel(bio, nrows=max_rows)
    elif extension == "parquet":
        bio.seek(0)
        df = _read_parquet_limited(bio, max_rows=max_rows, max_columns=max_columns)
    else:
        raise ValueError("Unsupported extension")

    return clip_columns(df, max_columns)


def _read_json_limited(data: bytes, *, max_rows: int) -> pd.DataFrame:
    text = data.decode("utf-8-sig", errors="replace").strip()
    if not text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="JSON file is empty.")

    try:
        parsed = json.loads(text)
        df = _json_to_frame(parsed)
    except json.JSONDecodeError:
        try:
            df = pd.read_json(io.StringIO(text), lines=True)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not read this JSON file. Upload a JSON array of records, JSON-lines, or a JSON object containing rows.",
            ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    if not isinstance(df, pd.DataFrame) or df.empty:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="JSON did not contain any tabular rows to analyze.")
    return df.head(max_rows)


def _json_to_frame(parsed: object) -> pd.DataFrame:
    if isinstance(parsed, list):
        if not parsed:
            return pd.DataFrame()
        if all(isinstance(item, dict) for item in parsed):
            return pd.json_normalize(parsed)
        return pd.DataFrame({"value": parsed})

    if isinstance(parsed, dict):
        for key in ("data", "records", "rows", "items", "results"):
            value = parsed.get(key)
            if isinstance(value, list):
                return pd.json_normalize(value) if all(isinstance(item, dict) for item in value) else pd.DataFrame({key: value})

        if parsed and all(isinstance(value, list) for value in parsed.values()):
            return pd.DataFrame(parsed)

        if parsed and all(isinstance(value, dict) for value in parsed.values()):
            frame = pd.DataFrame.from_dict(parsed, orient="index").reset_index()
            return frame.rename(columns={"index": "record_key"})

        return pd.json_normalize([parsed])

    raise ValueError("JSON must contain an object, an array of records, or JSON-lines records.")


def _read_parquet_limited(
    bio: io.BytesIO,
    *,
    max_rows: int,
    max_columns: int,
) -> pd.DataFrame:
    import pyarrow.parquet as pq

    parquet_file = pq.ParquetFile(bio)
    columns = parquet_file.schema.names[:max_columns]
    frames: list[pd.DataFrame] = []
    remaining = max_rows

    for batch in parquet_file.iter_batches(batch_size=min(max_rows, 10_000), columns=columns):
        if remaining <= 0:
            break
        frame = batch.to_pandas()
        if len(frame) > remaining:
            frame = frame.head(remaining)
        frames.append(frame)
        remaining -= len(frame)

    if not frames:
        return pd.DataFrame(columns=columns)
    return pd.concat(frames, ignore_index=True)


def load_for_user(
    limits: UserDataLimits,
    data: bytes,
    extension: AllowedExtension,
    mode: LoadMode,
) -> pd.DataFrame:
    from ..core.data_limits import enforce_file_size

    enforce_file_size(len(data), limits)
    cap = row_cap(limits, mode)
    return read_tabular_bytes(data, extension, cap, limits.max_columns)


def sample_for_preview(df: pd.DataFrame, max_rows: int = PREVIEW_MAX_ROWS) -> pd.DataFrame:
    """Instant training: all plans use the same preview row cap."""
    if len(df) <= max_rows:
        return df
    return df.sample(n=max_rows, random_state=42).reset_index(drop=True)
