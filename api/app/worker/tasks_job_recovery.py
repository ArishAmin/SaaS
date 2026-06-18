from __future__ import annotations

import asyncio

from celery.utils.log import get_task_logger

from ..core.http_client import HTTPClient
from ..services.jobs import recover_stale_jobs
from ..worker.celery_app import celery_app

logger = get_task_logger(__name__)


@celery_app.task(name="acutizeai.recover_stale_jobs")
def recover_stale_jobs_task() -> dict:
    async def _run() -> dict:
        try:
            result = await recover_stale_jobs()
            if result.get("recovered"):
                logger.warning(
                    "Recovered %s stale jobs (%s refunded)",
                    result.get("recovered"),
                    result.get("refunded"),
                )
            return result
        finally:
            await HTTPClient.close()

    return asyncio.run(_run())
