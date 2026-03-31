"""
Build a multi-section PDF report for a dataset (analysis, cleaning, training snapshot).
Uses fpdf2 with Latin-1-safe text (non-ASCII replaced) for broad compatibility.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from fpdf import FPDF


def _pdf_safe(text: str, max_len: int = 24_000) -> str:
    if text is None:
        return ""
    s = str(text)
    if len(s) > max_len:
        s = s[: max_len - 40] + "\n\n[... truncated for PDF size ...]"
    return s.encode("latin-1", "replace").decode("latin-1")


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def _summarize_results_json(results: Any) -> dict[str, Any] | None:
    if not results or not isinstance(results, dict):
        return None
    models = results.get("models") or []
    slim = []
    for m in models[:12]:
        if not isinstance(m, dict):
            continue
        slim.append({"name": m.get("name"), "metrics": m.get("metrics")})
    return {
        "task_type": results.get("task_type"),
        "target_column": results.get("target_column"),
        "best_model": results.get("best_model"),
        "models": slim,
        "model_storage_path": results.get("model_storage_path"),
    }


def build_dataset_report_pdf(*, dataset: dict[str, Any], training_runs: list[dict[str, Any]], sections: list[str] | None = None) -> bytes:
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=14)
    pdf.set_margins(left=14, top=14, right=14)
    pdf.add_page()
    pdf.set_font("helvetica", "B", 16)
    pdf.cell(0, 10, "DataPilot AI", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("helvetica", "", 11)
    pdf.cell(0, 8, "Dataset project report", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    pdf.set_font("helvetica", "", 9)
    pdf.cell(0, 5, _pdf_safe(f"Generated: {_now_iso()}"), new_x="LMARGIN", new_y="NEXT")
    pdf.cell(
        0,
        5,
        _pdf_safe(f"Original file: {dataset.get('original_file_name')} ({dataset.get('original_extension')})"),
        new_x="LMARGIN",
        new_y="NEXT",
    )
    pdf.cell(0, 5, _pdf_safe(f"Status: {dataset.get('status')}"), new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 5, _pdf_safe(f"Created: {dataset.get('created_at')}"), new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 5, _pdf_safe(f"Updated: {dataset.get('updated_at')}"), new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 5, _pdf_safe(f"Analyzed at: {dataset.get('analyzed_at')}"), new_x="LMARGIN", new_y="NEXT")
    if dataset.get("error"):
        pdf.set_font("helvetica", "I", 9)
        pdf.cell(0, 5, _pdf_safe(f"Last error: {dataset.get('error')}"), new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("helvetica", "", 9)
    pdf.ln(6)

    if not sections or "cleaning" in sections or "all" in sections:
        # --- Cleaning & engineering ---
        pdf.set_font("helvetica", "B", 12)
        pdf.cell(0, 8, "Cleaning & target", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("helvetica", "", 9)
        pdf.cell(0, 5, _pdf_safe(f"Target column: {dataset.get('cleaned_target_column') or '—'}"), new_x="LMARGIN", new_y="NEXT")
        pdf.cell(0, 5, _pdf_safe(f"Cleaned at: {dataset.get('cleaned_at')}"), new_x="LMARGIN", new_y="NEXT")
        pdf.cell(0, 5, _pdf_safe(f"Engineered at: {dataset.get('engineered_at')}"), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)
        pdf.set_font("helvetica", "B", 10)
        pdf.cell(0, 6, "Cleaning parameters (JSON)", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("courier", "", 8)
        pdf.multi_cell(0, 4, _pdf_safe(json.dumps(dataset.get("cleaned_params") or {}, indent=2, default=str)))
        pdf.ln(2)
        pdf.set_font("helvetica", "B", 10)
        pdf.cell(0, 6, "Feature engineering parameters (JSON)", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("courier", "", 8)
        pdf.multi_cell(0, 4, _pdf_safe(json.dumps(dataset.get("engineered_params") or {}, indent=2, default=str)))
        pdf.ln(4)

    if not sections or "analysis" in sections or "cleaning" in sections or "all" in sections:
        # --- Analysis snapshot ---
        analysis = dataset.get("analysis_json") or {}
        pdf.set_font("helvetica", "B", 12)
        pdf.cell(0, 8, "Instant analysis summary", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("helvetica", "", 9)

        col_types = analysis.get("column_types") or []
        missing = analysis.get("missing_values") or []
        unique = analysis.get("unique_values") or []
        if col_types:
            pdf.set_font("helvetica", "B", 9)
            pdf.cell(55, 6, "Column", border=1)
            pdf.cell(25, 6, "Type", border=1)
            pdf.cell(30, 6, "Missing %", border=1)
            pdf.cell(30, 6, "Unique", border=1)
            pdf.ln()
            pdf.set_font("helvetica", "", 8)
            miss_map = {m.get("column"): m.get("missing_percent") for m in missing if isinstance(m, dict)}
            uniq_map = {u.get("column"): u.get("unique_count") for u in unique if isinstance(u, dict)}
            for row in col_types[:55]:
                if not isinstance(row, dict):
                    continue
                c = str(row.get("column", ""))[:28]
                t = str(row.get("type", ""))[:12]
                mp = miss_map.get(row.get("column"))
                uc = uniq_map.get(row.get("column"))
                pdf.cell(55, 5, _pdf_safe(c), border=1)
                pdf.cell(25, 5, _pdf_safe(t), border=1)
                pdf.cell(30, 5, _pdf_safe(f"{mp:.2f}" if mp is not None else "—"), border=1)
                pdf.cell(30, 5, _pdf_safe(str(uc) if uc is not None else "—"), border=1)
                pdf.ln()
            if len(col_types) > 55:
                pdf.set_font("helvetica", "I", 8)
                pdf.cell(0, 5, _pdf_safe(f"... and {len(col_types) - 55} more columns (see appendix)."), new_x="LMARGIN", new_y="NEXT")
            pdf.ln(4)
        else:
            pdf.cell(0, 5, "No analysis_json stored yet.", new_x="LMARGIN", new_y="NEXT")
            pdf.ln(4)

    if not sections or "training" in sections or "all" in sections:
        # --- Quick evaluation ---
        pdf.set_font("helvetica", "B", 12)
        pdf.cell(0, 8, "Quick training evaluation", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("helvetica", "", 9)
        pdf.cell(0, 5, _pdf_safe(f"Quick trained at: {dataset.get('quick_trained_at')}"), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)
        pdf.set_font("courier", "", 8)
        pdf.multi_cell(0, 4, _pdf_safe(json.dumps(dataset.get("quick_evaluation_json") or {}, indent=2, default=str)))
        pdf.ln(4)

        # --- Full training runs ---
        pdf.set_font("helvetica", "B", 12)
        pdf.cell(0, 8, "Full training runs (async)", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("helvetica", "", 9)
        if not training_runs:
            pdf.cell(0, 5, "No full-mode runs recorded.", new_x="LMARGIN", new_y="NEXT")
        else:
            for r in training_runs[:20]:
                rid = r.get("run_id")
                st = r.get("status")
                created = r.get("created_at")
                err = r.get("error")
                pdf.set_font("helvetica", "B", 9)
                pdf.cell(0, 6, _pdf_safe(f"Run {rid} — {st} @ {created}"), new_x="LMARGIN", new_y="NEXT")
                if err:
                    pdf.set_font("helvetica", "I", 8)
                    pdf.multi_cell(0, 4, _pdf_safe(f"Error: {err}"))
                summ = _summarize_results_json(r.get("results_json"))
                if summ:
                    pdf.set_font("courier", "", 8)
                    pdf.multi_cell(0, 4, _pdf_safe(json.dumps(summ, indent=2, default=str)))
                pdf.ln(2)

    if not sections or "analysis" in sections or "cleaning" in sections or "all" in sections:
        # --- Appendix: truncated raw analysis ---
        pdf.add_page()
        pdf.set_font("helvetica", "B", 12)
        pdf.cell(0, 8, "Appendix: analysis JSON (truncated)", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("courier", "", 7)
        pdf.multi_cell(0, 3.5, _pdf_safe(json.dumps(analysis, indent=2, default=str), max_len=14_000))

    out = pdf.output()
    return bytes(out)
