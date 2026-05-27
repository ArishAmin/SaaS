"""Memory-conscious tabular loading (row/column caps per plan)."""

from __future__ import annotations

import io
from typing import Literal

import pandas as pd

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
        try:
            bio.seek(0)
            df = pd.read_json(bio)
        except Exception:
            bio.seek(0)
            df = pd.read_json(bio, lines=True)
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
