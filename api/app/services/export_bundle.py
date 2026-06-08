"""Build a ZIP archive with all exportable artifacts for a dataset project."""

from __future__ import annotations

import io
import zipfile
from typing import Any

from .dataset_pdf_report import build_dataset_report_pdf

TRAIN_REQUIREMENTS = """# Install before running scripts/train_full_model.py
pandas>=2.0
numpy>=1.24
scikit-learn>=1.3
joblib>=1.3
openpyxl>=3.1
xlrd>=2.0
pyarrow>=14.0
# Optional (only if XGBoost was your best model):
# xgboost>=2.0
"""


def _readme(dataset: dict[str, Any], *, has_train_script: bool) -> str:
    raw_id = str(dataset.get("dataset_id") or "").replace("-", "").upper()
    display_id = f"DS-{raw_id[:8]}" if raw_id else "-"
    lines = [
        "Project Export Bundle",
        "=====================",
        "",
        f"Dataset: {dataset.get('original_file_name')}",
        f"Dataset ID: {display_id}",
        "",
        "WHAT IS INSIDE THIS ZIP",
        "------------------------",
        "  README.txt                     - This file",
        "  report/project-report.pdf      - Full project report (analysis, cleaning, models, forecasts)",
        "  scripts/requirements-train.txt - Python packages for training script",
        "  scripts/cleaning_pipeline.py   - Reproduce cleaning on a new raw tabular file (optional)",
    ]
    if has_train_script:
        quick = dataset.get("quick_evaluation_json") or {}
        best = quick.get("best_model", "-")
        lines.append("  scripts/train_full_model.py    - Train the winning model on your machine")
        lines.append(f"       Preview winner: {best}")
    if dataset.get("cleaned_storage_path"):
        lines.append("  data/cleaned.csv               - Cleaned and encoded dataset")
    if dataset.get("engineered_storage_path"):
        lines.append("  data/engineered.csv            - Dataset with generated features applied")
    lines.extend(
        [
            "",
            "HOW TO RUN FULL TRAINING LOCALLY",
            "--------------------------------",
            "1. Unzip this folder.",
            "2. Open scripts/train_full_model.py in a text editor.",
            "3. Change ONLY this line near the top:",
            '     DATA_PATH = r"C:\\path\\to\\your\\dataset.csv"',
            "   Recommended:",
            "     - data/engineered.csv  (if you added features)",
            "     - data/cleaned.csv     (if you only cleaned)",
            "     - Or your own raw CSV, JSON, Excel, or Parquet file",
            "4. In a terminal:",
            "     pip install -r scripts/requirements-train.txt",
            "     python scripts/train_full_model.py",
            "5. Output: trained_model.pkl next to the script.",
            "",
            "PDF REPORT",
            "----------",
            "Open report/project-report.pdf for an executive summary suitable for sharing.",
            "",
            "Pipeline timestamps:",
            f"  Analyzed:    {dataset.get('analyzed_at') or '-'}",
            f"  Cleaned:     {dataset.get('cleaned_at') or '-'}",
            f"  Engineered:  {dataset.get('engineered_at') or '-'}",
            f"  Preview run: {dataset.get('quick_trained_at') or '-'}",
            f"  Forecast:    {dataset.get('forecasted_at') or '-'}",
            "",
            "Note: Instant preview in the app used a sample; full training uses every row in DATA_PATH.",
        ]
    )
    return "\n".join(lines)


def build_export_bundle_zip(
    *,
    dataset: dict[str, Any],
    cleaned_csv: bytes | None,
    engineered_csv: bytes | None,
    cleaning_script: str | None,
    training_script: str | None,
) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("README.txt", _readme(dataset, has_train_script=bool(training_script)))
        pdf = build_dataset_report_pdf(dataset=dataset, training_runs=None, sections=None)
        zf.writestr("report/project-report.pdf", pdf)
        zf.writestr("scripts/requirements-train.txt", TRAIN_REQUIREMENTS)
        if cleaned_csv:
            zf.writestr("data/cleaned.csv", cleaned_csv)
        if engineered_csv:
            zf.writestr("data/engineered.csv", engineered_csv)
        if cleaning_script:
            zf.writestr("scripts/cleaning_pipeline.py", cleaning_script)
        if training_script:
            zf.writestr("scripts/train_full_model.py", training_script)
    return buf.getvalue()
