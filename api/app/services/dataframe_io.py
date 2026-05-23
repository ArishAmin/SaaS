"""Memory-conscious tabular loading (row/column caps per plan)."""

from __future__ import annotations

import io
from typing import Literal

import pandas as pd

from ..core.data_limits import MAX_COLUMNS, PREVIEW_MAX_ROWS, UserDataLimits, LoadMode, row_cap

AllowedExtension = Literal["csv", "json", "xls", "xlsx"]


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
    else:
        raise ValueError("Unsupported extension")

    return clip_columns(df, max_columns)


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
