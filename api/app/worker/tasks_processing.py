from __future__ import annotations

import asyncio
from uuid import UUID

from celery.utils.log import get_task_logger

from ..core.http_client import HTTPClient
from ..services.credits import reset_credits_precharged, set_credits_precharged, refund_job_charge
from ..services.jobs import (
    complete_job,
    fail_job,
    log_job_event,
    recover_stale_jobs,
    serialize_job_result,
    try_start_job,
)
from ..services.supabase import rest_list
from ..worker.celery_app import celery_app

logger = get_task_logger(__name__)


@celery_app.task(name="acutizeai.process_job", bind=True, max_retries=None)
def process_job(self, job_id: str) -> dict:
    """
    Claims a processing_jobs row with database-side concurrency limits.
    Credits are charged at enqueue time; the worker skips re-charging.
    """

    async def _run() -> dict:
        started, reason = await try_start_job(job_id)
        if not started:
            logger.info("Job %s not started: %s", job_id, reason)
            if "concurrency_limit" in reason:
                await recover_stale_jobs()
                await log_job_event("job_waiting_for_capacity", job_id=job_id, metadata={"reason": reason})
                raise self.retry(countdown=15)
            return {"job_id": job_id, "started": False, "reason": reason}

        rows = await rest_list("processing_jobs", f"job_id=eq.{job_id}&select=*")
        if not rows:
            await fail_job(job_id, "Job disappeared after claim")
            return {"job_id": job_id, "status": "failed", "error": "Job disappeared after claim"}

        job = rows[0]
        if job.get("status") == "canceled":
            logger.info("Job %s was canceled before execution", job_id)
            return {"job_id": job_id, "status": "canceled"}

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
            result = await _execute_job(job)
            # Re-check status in case the job was canceled while running.
            latest = await rest_list(
                "processing_jobs",
                f"job_id=eq.{job_id}&select=status",
            )
            if latest and latest[0].get("status") == "canceled":
                logger.info("Job %s completed work but was canceled; discarding result", job_id)
                return {"job_id": job_id, "status": "canceled"}
            result_json = await serialize_job_result(job, result)
            await complete_job(job_id, result_json)
            return {"job_id": job_id, "status": "completed", "action": action}
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
            return {"job_id": job_id, "status": "failed", "action": action, "error": str(exc)}
        finally:
            if precharge_token is not None:
                reset_credits_precharged(precharge_token)

    async def _run_and_close() -> dict:
        try:
            return await _run()
        finally:
            await HTTPClient.close()

    return asyncio.run(_run_and_close())


async def _execute_job(job: dict):
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
