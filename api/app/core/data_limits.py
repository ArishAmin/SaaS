from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from fastapi import HTTPException, status

from .billing import (
    PlanType,
    get_plan_limits,
    has_active_subscription,
    is_billing_enforcement_enabled,
)

PREVIEW_MAX_ROWS = 20_000
FREE_PIPELINE_MAX_ROWS = 20_000
PAID_PIPELINE_MAX_ROWS = 2_000_000
MAX_COLUMNS = 200


class LoadMode(str, Enum):
    PIPELINE = "pipeline"
    PREVIEW = "preview"


@dataclass(frozen=True)
class UserDataLimits:
    plan: str
    max_dataset_size_mb: int
    max_file_bytes: int
    pipeline_max_rows: int
    preview_max_rows: int
    max_columns: int
    uses_full_dataset: bool


async def get_user_data_limits(user_id: str) -> UserDataLimits:
    from ..services.supabase import rest_list

    if not is_billing_enforcement_enabled():
        plan_limits = get_plan_limits(PlanType.BUSINESS.value)
        return UserDataLimits(
            plan=PlanType.BUSINESS.value,
            max_dataset_size_mb=plan_limits.max_dataset_size_mb,
            max_file_bytes=plan_limits.max_dataset_size_mb * 1024 * 1024,
            pipeline_max_rows=PAID_PIPELINE_MAX_ROWS,
            preview_max_rows=PREVIEW_MAX_ROWS,
            max_columns=MAX_COLUMNS,
            uses_full_dataset=True,
        )

    rows = await rest_list("profiles", f"id=eq.{user_id}")
    if not rows:
        plan_name = PlanType.HOBBY.value
    else:
        plan_name = rows[0].get("plan", PlanType.HOBBY.value)
        sub_status = rows[0].get("subscription_status", "inactive")
        if plan_name != PlanType.HOBBY.value and not has_active_subscription(sub_status):
            plan_name = PlanType.HOBBY.value

    plan_limits = get_plan_limits(plan_name)

    paid = plan_name in (PlanType.PRO.value, PlanType.BUSINESS.value)

    return UserDataLimits(
        plan=plan_name,
        max_dataset_size_mb=plan_limits.max_dataset_size_mb,
        max_file_bytes=plan_limits.max_dataset_size_mb * 1024 * 1024,
        pipeline_max_rows=PAID_PIPELINE_MAX_ROWS if paid else FREE_PIPELINE_MAX_ROWS,
        preview_max_rows=PREVIEW_MAX_ROWS,
        max_columns=MAX_COLUMNS,
        uses_full_dataset=paid,
    )


def row_cap(limits: UserDataLimits, mode: LoadMode) -> int:
    return limits.preview_max_rows if mode == LoadMode.PREVIEW else limits.pipeline_max_rows


def enforce_file_size(byte_len: int, limits: UserDataLimits) -> None:
    if byte_len > limits.max_file_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                f"File exceeds your plan limit ({limits.max_dataset_size_mb} MB). "
                "Upgrade for larger uploads."
            ),
        )
