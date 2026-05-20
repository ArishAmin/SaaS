"""
Professional multi-section PDF report for a dataset project.
Structured for presentation to technical and non-technical stakeholders.
"""

from __future__ import annotations

import json
import unicodedata
from datetime import datetime, timezone
from typing import Any

from fpdf import FPDF


def _pdf_safe(text: str, max_len: int = 24_000) -> str:
    if text is None:
        return ""
    s = str(text)
    if len(s) > max_len:
        s = s[: max_len - 40] + "\n\n[... truncated ...]"
    # fpdf core fonts are Latin-1 only; strip other characters (filenames, metrics, etc.)
    s = unicodedata.normalize("NFKD", s)
    s = s.encode("ascii", "ignore").decode("ascii")
    return s.replace("\r", " ").strip() or "-"


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def _fmt_ts(v: Any) -> str:
    if not v:
        return "Not completed"
    return _pdf_safe(str(v))


def _best_from_run(results: Any) -> str:
    if isinstance(results, dict):
        return str(results.get("best_model") or "-")
    return "-"


def _metric_labels(task_type: str) -> list[tuple[str, str]]:
    if task_type == "regression":
        return [("R2", "r2"), ("MAE", "mae"), ("RMSE", "rmse")]
    return [("Accuracy", "accuracy"), ("Precision", "precision"), ("Recall", "recall"), ("F1", "f1")]


def _fmt_metric(task_type: str, key: str, value: Any) -> str:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return "-"
    if task_type != "regression" and key in ("accuracy", "precision", "recall", "f1"):
        return f"{v * 100:.2f}%"
    return f"{v:.4f}"


class _ReportPDF(FPDF):
    def footer(self) -> None:
        self.set_y(-12)
        self.set_font("helvetica", "I", 8)
        self.set_text_color(100, 100, 100)
        self.cell(0, 8, _pdf_safe(f"DataPilot AI  |  Page {self.page_no()}"), align="C")

    def section_title(self, title: str, number: int | None = None) -> None:
        self.ln(4)
        self.set_font("helvetica", "B", 13)
        self.set_text_color(20, 20, 20)
        prefix = f"{number}. " if number is not None else ""
        self.cell(0, 9, _pdf_safe(f"{prefix}{title}"), new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(40, 40, 40)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.ln(4)

    def body_text(self, text: str) -> None:
        self.set_font("helvetica", "", 10)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 5, _pdf_safe(text))

    def bullet(self, text: str) -> None:
        self.set_font("helvetica", "", 9)
        safe = _pdf_safe(text)
        if len(safe) > 110:
            safe = safe[:107] + "..."
        self.cell(0, 5, f"  - {safe}", new_x="LMARGIN", new_y="NEXT")

    def key_value_table(self, rows: list[tuple[str, str]]) -> None:
        self.set_font("helvetica", "", 9)
        col_w = (self.w - self.l_margin - self.r_margin) / 2
        for label, value in rows:
            self.set_font("helvetica", "B", 9)
            self.cell(col_w, 6, _pdf_safe(label), border=0)
            self.set_font("helvetica", "", 9)
            self.cell(col_w, 6, _pdf_safe(value), new_x="LMARGIN", new_y="NEXT")


def build_dataset_report_pdf(
    *,
    dataset: dict[str, Any],
    training_runs: list[dict[str, Any]] | None = None,
    sections: list[str] | None = None,
) -> bytes:
    runs = training_runs or []

    include = lambda name: not sections or name in sections or "all" in sections

    pdf = _ReportPDF()
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.set_margins(left=16, top=16, right=16)

    # --- Cover ---
    pdf.add_page()
    pdf.set_font("helvetica", "B", 22)
    pdf.set_text_color(15, 15, 15)
    pdf.cell(0, 12, "DataPilot AI", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("helvetica", "", 14)
    pdf.cell(0, 8, "Machine Learning Project Report", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)
    pdf.set_font("helvetica", "B", 12)
    name = dataset.get("original_file_name") or "Dataset"
    pdf.multi_cell(0, 7, _pdf_safe(name))
    pdf.ln(4)
    pdf.set_font("helvetica", "", 10)
    pdf.set_text_color(60, 60, 60)
    pdf.cell(0, 6, _pdf_safe(f"Report generated: {_now_iso()}"), new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, _pdf_safe(f"Dataset ID: {dataset.get('dataset_id', '')}"), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(8)

    pdf.set_font("helvetica", "I", 9)
    pdf.multi_cell(
        0,
        5,
        _pdf_safe(
            "This document summarizes the end-to-end workflow performed in DataPilot AI: "
            "data profiling, cleaning, optional feature engineering, and instant model comparison. "
            "Metrics reflect a sample-based preview for directional guidance, not a production deployment."
        ),
    )

    # --- Executive summary ---
    pdf.add_page()
    pdf.section_title("Executive summary", 1)
    steps = [
        ("Data analysis", dataset.get("analyzed_at")),
        ("Cleaning & encoding", dataset.get("cleaned_at")),
        ("Generated features applied", dataset.get("engineered_at")),
        ("Instant model preview", dataset.get("quick_trained_at")),
    ]
    pdf.set_font("helvetica", "B", 9)
    pdf.cell(70, 7, "Pipeline step", border=1)
    pdf.cell(80, 7, "Status / timestamp", border=1)
    pdf.ln()
    pdf.set_font("helvetica", "", 9)
    for label, ts in steps:
        status = "Completed" if ts else "Not run"
        pdf.cell(70, 6, _pdf_safe(label), border=1)
        pdf.cell(80, 6, _pdf_safe(f"{status}  ({_fmt_ts(ts)})" if ts else status), border=1)
        pdf.ln()

    quick = dataset.get("quick_evaluation_json") or {}
    if isinstance(quick, dict) and quick.get("best_model"):
        pdf.ln(4)
        pdf.body_text(
            f"Best performing model (instant preview): {quick.get('best_model')}  |  "
            f"Task: {quick.get('task_type', '-')}  |  Target: {quick.get('target_column', '-')}"
        )

    if include("analysis") or include("cleaning") or include("training"):
        # --- Project metadata ---
        pdf.section_title("Project metadata", 2)
        pdf.key_value_table(
            [
                ("Original file", f"{dataset.get('original_file_name')} ({dataset.get('original_extension')})"),
                ("Workflow status", str(dataset.get("status") or "-")),
                ("Created", _fmt_ts(dataset.get("created_at"))),
                ("Last updated", _fmt_ts(dataset.get("updated_at"))),
                ("Target column", str(dataset.get("cleaned_target_column") or "-")),
            ]
        )

    if include("analysis"):
        analysis = dataset.get("analysis_json") or {}
        pdf.section_title("Data analysis profile", 3)
        pdf.body_text(
            "Column-level summary from instant analysis: inferred types, missingness, and cardinality."
        )
        col_types = analysis.get("column_types") or []
        missing = {m.get("column"): m.get("missing_percent") for m in (analysis.get("missing_values") or []) if isinstance(m, dict)}
        unique = {u.get("column"): u.get("unique_count") for u in (analysis.get("unique_values") or []) if isinstance(u, dict)}
        if col_types:
            pdf.set_font("helvetica", "B", 8)
            pdf.cell(52, 6, "Column", border=1)
            pdf.cell(22, 6, "Type", border=1)
            pdf.cell(28, 6, "Missing %", border=1)
            pdf.cell(28, 6, "Unique", border=1)
            pdf.ln()
            pdf.set_font("helvetica", "", 8)
            for row in col_types[:60]:
                if not isinstance(row, dict):
                    continue
                c = str(row.get("column", ""))[:24]
                t = str(row.get("type", ""))[:10]
                mp = missing.get(row.get("column"))
                uc = unique.get(row.get("column"))
                pdf.cell(52, 5, _pdf_safe(c), border=1)
                pdf.cell(22, 5, _pdf_safe(t), border=1)
                pdf.cell(28, 5, _pdf_safe(f"{mp:.1f}" if mp is not None else "-"), border=1)
                pdf.cell(28, 5, _pdf_safe(str(uc) if uc is not None else "-"), border=1)
                pdf.ln()
            if len(col_types) > 60:
                pdf.body_text(f"... and {len(col_types) - 60} additional columns.")
        else:
            pdf.body_text("Analysis has not been run for this dataset.")

    if include("cleaning"):
        pdf.section_title("Cleaning & preprocessing", 4)
        params = dataset.get("cleaned_params") or {}
        pdf.key_value_table(
            [
                ("Cleaned at", _fmt_ts(dataset.get("cleaned_at"))),
                ("Missing values", str(params.get("missing_strategy", "-"))),
                ("Categorical encoding", str(params.get("encoding", "-"))),
                ("Numeric scaling", str(params.get("scaling", "-"))),
            ]
        )
        eng = dataset.get("engineered_params") or {}
        if dataset.get("engineered_at"):
            pdf.ln(3)
            pdf.set_font("helvetica", "B", 10)
            pdf.cell(0, 6, "Feature engineering (selection / generation)", new_x="LMARGIN", new_y="NEXT")
            pdf.set_font("helvetica", "", 9)
            pdf.cell(0, 5, _pdf_safe(f"Engineered at: {_fmt_ts(dataset.get('engineered_at'))}"), new_x="LMARGIN", new_y="NEXT")
            keep = eng.get("keep_features") or []
            dropped = eng.get("dropped_features") or []
            if keep:
                pdf.body_text(f"Columns kept ({len(keep)}): " + ", ".join(str(x) for x in keep[:40]))
            if dropped:
                pdf.body_text(f"Columns dropped ({len(dropped)}): " + ", ".join(str(x) for x in dropped[:40]))
            gen = eng.get("generative_features") or eng.get("generated_features") or eng.get("applied_features")
            if gen and isinstance(gen, list):
                pdf.ln(2)
                pdf.body_text("Generated features applied:")
                for feat in gen[:25]:
                    if isinstance(feat, dict):
                        pdf.bullet(
                            _pdf_safe(
                                f"{str(feat.get('name', '?'))[:40]}: {str(feat.get('formula', feat.get('type', '')))[:60]}"
                            )
                        )

    if include("training"):
        quick = dataset.get("quick_evaluation_json") or {}
        pdf.section_title("Model comparison (instant preview)", 5)
        pdf.body_text(
            "Several algorithms were trained on a random sample (up to 5,000 rows or 5% of data). "
            "Results are indicative; validate on held-out production data before deployment."
        )
        if not isinstance(quick, dict) or not quick.get("models"):
            pdf.body_text("Instant preview has not been run.")
        else:
            task = str(quick.get("task_type") or "classification")
            pdf.key_value_table(
                [
                    ("Task type", task),
                    ("Target column", str(quick.get("target_column") or "-")),
                    ("Best model", str(quick.get("best_model") or "-")),
                    ("Preview run at", _fmt_ts(dataset.get("quick_trained_at"))),
                ]
            )
            pdf.ln(3)
            labels = _metric_labels(task)
            pdf.set_font("helvetica", "B", 8)
            pdf.cell(42, 6, "Model", border=1)
            for lbl, _ in labels:
                pdf.cell(24, 6, _pdf_safe(lbl), border=1)
            pdf.ln()
            pdf.set_font("helvetica", "", 8)
            for m in quick.get("models") or []:
                if not isinstance(m, dict):
                    continue
                name = str(m.get("name", ""))[:20]
                is_best = name == str(quick.get("best_model", ""))[:20]
                if is_best:
                    pdf.set_font("helvetica", "B", 8)
                pdf.cell(42, 5, _pdf_safe(name + (" *" if is_best else "")), border=1)
                metrics = m.get("metrics") or {}
                for _, key in labels:
                    pdf.cell(24, 5, _pdf_safe(_fmt_metric(task, key, metrics.get(key))), border=1)
                pdf.ln()
                pdf.set_font("helvetica", "", 8)
            pdf.ln(2)
            pdf.set_font("helvetica", "I", 8)
            pdf.cell(0, 5, _pdf_safe("* Best model by primary score (F1 for classification, R2 for regression)."))

            # Top features for best model
            best_name = quick.get("best_model")
            for m in quick.get("models") or []:
                if isinstance(m, dict) and m.get("name") == best_name:
                    tops = m.get("top_features") or []
                    if tops:
                        pdf.ln(4)
                        pdf.set_font("helvetica", "B", 10)
                        pdf.cell(0, 6, _pdf_safe(f"Top drivers - {best_name}"), new_x="LMARGIN", new_y="NEXT")
                        pdf.set_font("helvetica", "", 8)
                        for row in tops[:15]:
                            if isinstance(row, dict):
                                feat = str(row.get("feature", ""))[:80]
                                pdf.bullet(_pdf_safe(f"{feat}: {float(row.get('importance', 0)):.4f}"))
                    break

        if runs:
            pdf.ln(4)
            pdf.set_font("helvetica", "B", 10)
            pdf.cell(0, 6, "Preview run history", new_x="LMARGIN", new_y="NEXT")
            pdf.set_font("helvetica", "", 8)
            for r in runs[:15]:
                rid = str(r.get("run_id", ""))[:8]
                st = r.get("status")
                ds = r.get("data_source") or "-"
                sr = r.get("sample_rows")
                ms = r.get("duration_ms")
                best = _best_from_run(r.get("results_json"))
                pdf.bullet(
                    _pdf_safe(
                        f"{rid}... {st} | source={ds} | rows={sr} | {ms}ms | best={best} | {_fmt_ts(r.get('created_at'))}"
                    )
                )

    # --- Appendix (optional detail) ---
    if include("analysis"):
        pdf.add_page()
        pdf.section_title("Appendix - technical parameters", None)
        pdf.set_font("helvetica", "B", 9)
        pdf.cell(0, 6, "Cleaning parameters (JSON)", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("courier", "", 7)
        pdf.multi_cell(0, 3.5, _pdf_safe(json.dumps(dataset.get("cleaned_params") or {}, indent=2, default=str), max_len=8000))
        pdf.ln(2)
        pdf.set_font("helvetica", "B", 9)
        pdf.cell(0, 6, "Engineering parameters (JSON)", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("courier", "", 7)
        pdf.multi_cell(0, 3.5, _pdf_safe(json.dumps(dataset.get("engineered_params") or {}, indent=2, default=str), max_len=8000))

    return bytes(pdf.output())
