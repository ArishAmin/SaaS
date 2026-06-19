from __future__ import annotations

import asyncio

from celery.utils.log import get_task_logger

from ..core.http_client import HTTPClient
from ..services.job_runner import run_claimed_processing_job
from ..services.jobs import log_job_event, recover_stale_jobs, try_start_job
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

        job = await run_claimed_processing_job(job_id)
        return {
            "job_id": job_id,
            "status": str(job.get("status") or "unknown"),
            "action": job.get("action"),
            "error": job.get("error"),
        }

    async def _run_and_close() -> dict:
        try:
            return await _run()
        finally:
            await HTTPClient.close()

    return asyncio.run(_run_and_close())
