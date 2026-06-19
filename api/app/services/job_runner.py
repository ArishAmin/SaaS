from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from ..services.credits import refund_job_charge, reset_credits_precharged, set_credits_precharged
from ..services.jobs import complete_job, fail_job, log_job_event, serialize_job_result
from ..services.supabase import rest_list

logger = logging.getLogger(__name__)


async def execute_processing_job(job: dict[str, Any]) -> Any:
    action = str(job.get("action") or "")
    payload = job.get("payload") or {}
    dataset_id = UUID(str(job["dataset_id"])) if job.get("dataset_id") else None
    user = {"user_id": str(job["user_id"]), "claims": {}, "_job_worker": True}

    if action == "analyze":
        from ..routers import datasets

        return await datasets.analyze_dataset.__wrapped__(
            None,
            dataset_id,
            datasets.AnalyzeRequest(**payload),
            user,
        )
    if action == "clean":
        from ..routers import datasets

        return await datasets.clean_dataset.__wrapped__(
            None,
            dataset_id,
            datasets.CleaningRequest(**payload),
            user,
        )
    if action == "train_instant":
        from ..routers import datasets

        return await datasets.train_quick.__wrapped__(
            None,
            dataset_id,
            datasets.TrainQuickRequest(**payload),
            user,
        )
    if action == "recommend":
        from ..routers import datasets

        return await datasets.recommend_models.__wrapped__(
            None,
            dataset_id,
            datasets.RecommendRequest(**payload),
            user,
        )
    if action == "feature_suggest":
        from ..routers import datasets

        return await datasets.suggest_generative_features.__wrapped__(
            None,
            dataset_id,
            user,
        )
    if action == "eda":
        from ..routers import datasets

        return await datasets.get_eda_report.__wrapped__(
            None,
            dataset_id,
            user,
        )
    if action == "quality":
        from ..routers import datasets

        return await datasets.get_dataset_quality.__wrapped__(
            None,
            dataset_id,
            user,
        )
    if action == "feature_engineer":
        from ..routers import datasets

        return await datasets.feature_engineer.__wrapped__(
            None,
            dataset_id,
            datasets.FeatureEngineerRequest(**payload),
            user,
        )
    if action == "forecast":
        from ..routers import forecasting

        return await forecasting.run_dataset_forecast.__wrapped__(
            None,
            dataset_id,
            forecasting.ForecastRunRequest(**payload),
            user,
        )
    if action == "business_insights":
        from ..routers import business_insights

        return await business_insights.run_dataset_business_insights.__wrapped__(
            None,
            dataset_id,
            business_insights.BusinessInsightsRunRequest(**payload),
            user,
        )
    if action == "export_pdf":
        from ..routers import datasets

        return await datasets.download_dataset_pdf_report.__wrapped__(
            None,
            dataset_id,
            payload.get("sections"),
            user,
        )
    if action == "export_bundle":
        from ..routers import datasets

        return await datasets.export_bundle.__wrapped__(
            None,
            dataset_id,
            user,
        )
    raise RuntimeError(f"Unsupported job action: {action}")


async def run_claimed_processing_job(job_id: str) -> dict[str, Any]:
    rows = await rest_list("processing_jobs", f"job_id=eq.{job_id}&select=*")
    if not rows:
        await fail_job(job_id, "Job disappeared after claim")
        return {"job_id": job_id, "status": "failed", "error": "Job disappeared after claim"}

    job = rows[0]
    if job.get("status") == "canceled":
        logger.info("Job %s was canceled before execution", job_id)
        return job

    action = str(job.get("action") or "")
    await log_job_event(
        "job_started",
        job_id=job_id,
        organization_id=str(job.get("organization_id")),
        user_id=str(job.get("user_id")),
        dataset_id=str(job.get("dataset_id")) if job.get("dataset_id") else None,
        action=action,
    )
    precharge_token = None
    if job.get("credit_transaction_id"):
        precharge_token = set_credits_precharged(True)
    try:
        result = await execute_processing_job(job)
        latest = await rest_list(
            "processing_jobs",
            f"job_id=eq.{job_id}&select=status",
        )
        if latest and latest[0].get("status") == "canceled":
            logger.info("Job %s completed work but was canceled; discarding result", job_id)
            rows = await rest_list("processing_jobs", f"job_id=eq.{job_id}&select=*")
            return rows[0] if rows else job
        result_json = await serialize_job_result(job, result)
        await complete_job(job_id, result_json)
    except Exception as exc:
        logger.exception("Processing job failed job_id=%s action=%s", job_id, action)
        await fail_job(job_id, str(exc), log=False)
        await refund_job_charge(job, reason="job_failed")
        await log_job_event(
            "job_failed",
            job_id=job_id,
            organization_id=str(job.get("organization_id")),
            user_id=str(job.get("user_id")),
            dataset_id=str(job.get("dataset_id")) if job.get("dataset_id") else None,
            action=action,
            error={"type": exc.__class__.__name__, "detail": str(exc)},
        )
    finally:
        if precharge_token is not None:
            reset_credits_precharged(precharge_token)

    rows = await rest_list("processing_jobs", f"job_id=eq.{job_id}&select=*")
    return rows[0] if rows else job
