from __future__ import annotations

import json
from enum import Enum

from pydantic import BaseModel

from .config import get_settings


class PlanType(str, Enum):
    HOBBY = "hobby"
    PRO = "pro"
    BUSINESS = "business"


class PlanLimits(BaseModel):
    """Plan caps. max_concurrent_datasets=None means unlimited (Business only)."""

    max_dataset_size_mb: int
    max_concurrent_datasets: int | None
    monthly_credits: int
    allowed_models: list[str]
    max_compute_seconds: int
    support_priority: str
    price_usd: int | None = None  # None = free


PLAN_CONFIGS: dict[PlanType, PlanLimits] = {
    PlanType.HOBBY: PlanLimits(
        max_dataset_size_mb=10,
        max_concurrent_datasets=3,
        monthly_credits=200,
        allowed_models=["linear_regression", "logistic_regression", "decision_tree"],
        max_compute_seconds=300,
        support_priority="community",
        price_usd=0,
    ),
    PlanType.PRO: PlanLimits(
        max_dataset_size_mb=30,
        max_concurrent_datasets=12,
        monthly_credits=500,
        allowed_models=[
            "linear_regression",
            "logistic_regression",
            "decision_tree",
            "random_forest",
            "gradient_boosting",
            "xgboost",
            "svm",
            "naive_bayes",
            "knn",
        ],
        max_compute_seconds=1800,
        support_priority="email",
        price_usd=25,
    ),
    PlanType.BUSINESS: PlanLimits(
        max_dataset_size_mb=75,
        max_concurrent_datasets=None,
        monthly_credits=2500,
        allowed_models=["all"],
        max_compute_seconds=3600,
        support_priority="priority_email",
        price_usd=70,
    ),
}

UNRESTRICTED_PLAN_LIMITS = PlanLimits(
    max_dataset_size_mb=75,
    max_concurrent_datasets=None,
    monthly_credits=999_999,
    allowed_models=["all"],
    max_compute_seconds=7200,
    support_priority="dev",
    price_usd=None,
)


def get_custom_credit_price_ids() -> dict[int, dict[str, str]]:
    raw = get_settings().paddle_custom_credit_price_ids
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}

    out: dict[int, dict[str, str]] = {}
    if not isinstance(parsed, dict):
        return out
    for credits, intervals in parsed.items():
        try:
            credit_count = int(credits)
        except (TypeError, ValueError):
            continue
        if isinstance(intervals, dict):
            out[credit_count] = {
                "monthly": str(intervals.get("monthly") or ""),
                "yearly": str(intervals.get("yearly") or ""),
            }
    return out


def is_billing_enforcement_enabled() -> bool:
    return get_settings().billing_enforcement_enabled


def is_testing_mode() -> bool:
    return bool(get_settings().testing)


def get_plan_limits(plan_name: str) -> PlanLimits:
    if is_testing_mode():
        return PLAN_CONFIGS[PlanType.BUSINESS]
    if not is_billing_enforcement_enabled():
        return UNRESTRICTED_PLAN_LIMITS
    try:
        return PLAN_CONFIGS[PlanType(plan_name)]
    except (ValueError, KeyError):
        return PLAN_CONFIGS[PlanType.HOBBY]


def has_active_subscription(status: str) -> bool:
    if is_testing_mode():
        return True
    if not is_billing_enforcement_enabled():
        return True
    return status in ("active", "past_due", "trialing")


def plan_from_paddle_price_id(price_id: str) -> PlanType:
    settings = get_settings()
    business_ids = {
        settings.paddle_price_id_business,
        settings.paddle_price_id_business_yearly,
    }
    pro_ids = {
        settings.paddle_price_id_pro,
        settings.paddle_price_id_pro_yearly,
    }
    if price_id and price_id in {x for x in business_ids if x}:
        return PlanType.BUSINESS
    for intervals in get_custom_credit_price_ids().values():
        if price_id and price_id in {x for x in intervals.values() if x}:
            return PlanType.BUSINESS
    if price_id and price_id in {x for x in pro_ids if x}:
        return PlanType.PRO
    return PlanType.HOBBY


async def get_user_plan_limits(user_id: str) -> PlanLimits:
    if is_testing_mode():
        return PLAN_CONFIGS[PlanType.BUSINESS]
    if not is_billing_enforcement_enabled():
        return UNRESTRICTED_PLAN_LIMITS

    from ..services.supabase import rest_list
    from ..services.workspaces import get_active_workspace

    try:
        workspace = await get_active_workspace(user_id)
        plan_name = workspace.get("plan", "hobby")
        status = workspace.get("subscription_status", "inactive")
        if plan_name != "hobby" and not has_active_subscription(status):
            return PLAN_CONFIGS[PlanType.HOBBY]
        return get_plan_limits(plan_name)
    except Exception:
        pass

    profiles = await rest_list("profiles", f"id=eq.{user_id}")
    if not profiles:
        return PLAN_CONFIGS[PlanType.HOBBY]

    profile = profiles[0]
    plan_name = profile.get("plan", "hobby")
    status = profile.get("subscription_status", "inactive")

    if plan_name != "hobby" and not has_active_subscription(status):
        return PLAN_CONFIGS[PlanType.HOBBY]

    return get_plan_limits(plan_name)
