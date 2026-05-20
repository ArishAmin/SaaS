from enum import Enum

from pydantic import BaseModel

from .config import get_settings


class PlanType(str, Enum):
    HOBBY = "hobby"
    PRO = "pro"
    BUSINESS = "business"


class PlanLimits(BaseModel):
    max_dataset_size_mb: int
    max_concurrent_datasets: int
    allowed_models: list[str]
    max_compute_seconds: int
    support_priority: str


PLAN_CONFIGS: dict[PlanType, PlanLimits] = {
    PlanType.HOBBY: PlanLimits(
        max_dataset_size_mb=2,
        max_concurrent_datasets=3,
        allowed_models=["linear_regression", "logistic_regression"],
        max_compute_seconds=300,
        support_priority="community",
    ),
    PlanType.PRO: PlanLimits(
        max_dataset_size_mb=100,
        max_concurrent_datasets=10,
        allowed_models=["linear_regression", "logistic_regression", "random_forest", "xgboost", "svm"],
        max_compute_seconds=1800,
        support_priority="email",
    ),
    PlanType.BUSINESS: PlanLimits(
        max_dataset_size_mb=1024,
        max_concurrent_datasets=50,
        allowed_models=[
            "linear_regression",
            "logistic_regression",
            "random_forest",
            "xgboost",
            "svm",
            "neural_network",
        ],
        max_compute_seconds=7200,
        support_priority="priority_email",
    ),
}

# Used when billing_enforcement_enabled=False (local QA / full feature testing).
UNRESTRICTED_PLAN_LIMITS = PlanLimits(
    max_dataset_size_mb=1024,
    max_concurrent_datasets=100,
    allowed_models=["all"],
    max_compute_seconds=7200,
    support_priority="dev",
)


def is_billing_enforcement_enabled() -> bool:
    return get_settings().billing_enforcement_enabled


def get_plan_limits(plan_name: str) -> PlanLimits:
    """Returns limits for a given plan name, defaults to Hobby if unknown."""
    if not is_billing_enforcement_enabled():
        return UNRESTRICTED_PLAN_LIMITS
    try:
        return PLAN_CONFIGS[PlanType(plan_name)]
    except (ValueError, KeyError):
        return PLAN_CONFIGS[PlanType.HOBBY]


def has_active_subscription(status: str) -> bool:
    """
    Checks if the subscription status allows for Pro/Business access.
    Includes 'past_due' for the user-requested grace period.
    """
    if not is_billing_enforcement_enabled():
        return True
    return status in ("active", "past_due", "trailing")


async def get_user_plan_limits(user_id: str) -> PlanLimits:
    """
    Fetch user's plan from DB and return the corresponding limits.
    When enforcement is disabled, everyone gets unrestricted limits.
    """
    if not is_billing_enforcement_enabled():
        return UNRESTRICTED_PLAN_LIMITS

    from ..services.supabase import rest_list

    profiles = await rest_list("profiles", f"id=eq.{user_id}")
    if not profiles:
        return PLAN_CONFIGS[PlanType.HOBBY]

    profile = profiles[0]
    plan_name = profile.get("plan", "hobby")
    status = profile.get("subscription_status", "inactive")

    if plan_name != "hobby" and not has_active_subscription(status):
        return PLAN_CONFIGS[PlanType.HOBBY]

    return get_plan_limits(plan_name)
