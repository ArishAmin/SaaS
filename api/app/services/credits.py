from __future__ import annotations

from contextvars import ContextVar, Token
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any

from fastapi import HTTPException, status

from ..core.billing import PLAN_CONFIGS, PlanType, get_plan_limits, has_active_subscription, is_billing_enforcement_enabled
from .supabase import rest_insert, rest_list, rest_patch


class CreditAction(str, Enum):
    ANALYZE = "analyze"
    CLEAN = "clean"
    FEATURE_SUGGEST = "feature_suggest"
    FEATURE_APPLY = "feature_apply"
    TRAIN_INSTANT = "train_instant"
    RECOMMEND = "recommend"
    EXPORT_PDF = "export_pdf"
    EXPORT_BUNDLE = "export_bundle"
    FEATURE_ENGINEER = "feature_engineer"


CREDIT_COSTS: dict[CreditAction, int] = {
    CreditAction.ANALYZE: 2,
    CreditAction.CLEAN: 3,
    CreditAction.FEATURE_SUGGEST: 4,
    CreditAction.FEATURE_APPLY: 0,
    CreditAction.TRAIN_INSTANT: 8,
    CreditAction.RECOMMEND: 2,
    CreditAction.EXPORT_PDF: 2,
    CreditAction.EXPORT_BUNDLE: 4,
    CreditAction.FEATURE_ENGINEER: 4,
}

CREDIT_ACTION_LABELS: dict[str, str] = {
    CreditAction.ANALYZE.value: "Analyze / profile",
    CreditAction.CLEAN.value: "Clean & encode",
    CreditAction.FEATURE_SUGGEST.value: "Generate features",
    CreditAction.FEATURE_APPLY.value: "Generate features (save)",
    CreditAction.TRAIN_INSTANT.value: "Instant model preview",
    CreditAction.RECOMMEND.value: "Model ideas",
    CreditAction.EXPORT_PDF.value: "PDF report",
    CreditAction.EXPORT_BUNDLE.value: "ZIP export bundle",
    CreditAction.FEATURE_ENGINEER.value: "Feature selection (apply)",
}

_request_credit_charges: ContextVar[list[dict[str, Any]] | None] = ContextVar(
    "request_credit_charges",
    default=None,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _effective_plan(profile: dict) -> str:
    plan_name = profile.get("plan", "hobby")
    status = profile.get("subscription_status", "inactive")
    if plan_name != "hobby" and not has_active_subscription(status):
        return PlanType.HOBBY.value
    return plan_name


def credits_refresh_mode(plan_name: str) -> str:
    """one_time = free starter pack; monthly = paid plans refresh every 30 days."""
    return "one_time" if plan_name == PlanType.HOBBY.value else "monthly"


async def _get_profile(user_id: str) -> dict:
    rows = await rest_list("profiles", f"id=eq.{user_id}")
    if not rows:
        raise HTTPException(status_code=404, detail="Profile not found")
    return rows[0]


async def _log_transaction(
    *,
    user_id: str,
    action: str,
    credits_delta: int,
    balance_after: int,
    dataset_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    try:
        await rest_insert(
            "credit_transactions",
            [
                {
                    "user_id": user_id,
                    "action": action,
                    "credits_delta": credits_delta,
                    "balance_after": balance_after,
                    "dataset_id": dataset_id,
                    "metadata": metadata or {},
                }
            ],
        )
    except Exception:
        pass


async def ensure_credits_period(user_id: str) -> dict:
    """Paid plans: refill credits every 30 days. Free (hobby): one-time pack, never auto-refill."""
    profile = await _get_profile(user_id)
    if not is_billing_enforcement_enabled():
        return profile

    plan_name = _effective_plan(profile)
    if plan_name == PlanType.HOBBY.value:
        return profile

    period_end = _parse_ts(profile.get("credits_period_end"))
    now = _utcnow()
    if period_end and now < period_end:
        return profile

    limits = get_plan_limits(plan_name)
    monthly_quota = int(profile.get("credits_monthly_quota") or limits.monthly_credits)
    new_period_end = (now + timedelta(days=30)).isoformat()
    payload = {
        "credits_balance": monthly_quota,
        "credits_monthly_quota": monthly_quota,
        "credits_period_end": new_period_end,
        "updated_at": now.isoformat(),
    }
    await rest_patch("profiles", f"id=eq.{user_id}", payload)
    await _log_transaction(
        user_id=user_id,
        action="monthly_refresh",
        credits_delta=monthly_quota - int(profile.get("credits_balance") or 0),
        balance_after=monthly_quota,
        metadata={"plan": plan_name, "credits_monthly_quota": monthly_quota},
    )
    return {**profile, **payload}


async def reset_credits_for_plan(user_id: str, plan_name: str, monthly_credits: int | None = None) -> None:
    limits = get_plan_limits(plan_name)
    quota = monthly_credits or limits.monthly_credits
    now = _utcnow()
    period_end = None if plan_name == PlanType.HOBBY.value else (now + timedelta(days=30)).isoformat()
    await rest_patch(
        "profiles",
        f"id=eq.{user_id}",
        {
            "credits_balance": quota,
            "credits_monthly_quota": quota,
            "credits_period_end": period_end,
            "updated_at": now.isoformat(),
        },
    )
    await _log_transaction(
        user_id=user_id,
        action="plan_upgrade",
        credits_delta=quota,
        balance_after=quota,
        metadata={"plan": plan_name, "credits_monthly_quota": quota},
    )


async def get_credits_summary(user_id: str) -> dict:
    if not is_billing_enforcement_enabled():
        limits = PLAN_CONFIGS[PlanType.BUSINESS]
        return {
            "credits_balance": limits.monthly_credits,
            "credits_quota": limits.monthly_credits,
            "credits_refresh_mode": "monthly",
            "credits_period_end": None,
            "credit_costs": {k.value: v for k, v in CREDIT_COSTS.items()},
            "credit_action_labels": CREDIT_ACTION_LABELS,
        }

    profile = await ensure_credits_period(user_id)
    plan_name = _effective_plan(profile)
    limits = get_plan_limits(plan_name)
    monthly_quota = int(profile.get("credits_monthly_quota") or limits.monthly_credits)
    mode = credits_refresh_mode(plan_name)
    return {
        "credits_balance": int(profile.get("credits_balance") or 0),
        "credits_quota": monthly_quota,
        "credits_refresh_mode": mode,
        "credits_period_end": profile.get("credits_period_end") if mode == "monthly" else None,
        "credit_costs": {k.value: v for k, v in CREDIT_COSTS.items()},
        "credit_action_labels": CREDIT_ACTION_LABELS,
    }


async def list_credit_transactions(user_id: str, limit: int = 50) -> list[dict]:
    rows = await rest_list(
        "credit_transactions",
        f"user_id=eq.{user_id}&order=created_at.desc&limit={limit}",
    )
    out = []
    for row in rows:
        action = row.get("action", "")
        out.append(
            {
                "id": row.get("id"),
                "action": action,
                "action_label": CREDIT_ACTION_LABELS.get(action, action.replace("_", " ").title()),
                "credits_delta": row.get("credits_delta"),
                "balance_after": row.get("balance_after"),
                "dataset_id": row.get("dataset_id"),
                "created_at": row.get("created_at"),
            }
        )
    return out


async def require_credits(
    user_id: str,
    action: CreditAction,
    *,
    dataset_id: str | None = None,
) -> int:
    if not is_billing_enforcement_enabled():
        return 0

    cost = CREDIT_COSTS[action]
    if cost <= 0:
        return 0

    profile = await ensure_credits_period(user_id)
    balance = int(profile.get("credits_balance") or 0)

    if balance < cost:
        plan_name = _effective_plan(profile)
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "code": "insufficient_credits",
                "message": (
                    f"This action needs {cost} credits but you have {balance} left. "
                    "Upgrade for more credits and higher limits."
                ),
                "required_credits": cost,
                "balance": balance,
                "plan": plan_name,
            },
        )

    new_balance = balance - cost
    await rest_patch(
        "profiles",
        f"id=eq.{user_id}",
        {
            "credits_balance": new_balance,
            "updated_at": _utcnow().isoformat(),
        },
    )
    await _log_transaction(
        user_id=user_id,
        action=action.value,
        credits_delta=-cost,
        balance_after=new_balance,
        dataset_id=dataset_id,
    )
    charges = _request_credit_charges.get()
    if charges is not None:
        charges.append(
            {
                "user_id": user_id,
                "action": action,
                "credits": cost,
                "dataset_id": dataset_id,
            }
        )
    return cost


async def refund_credits(
    user_id: str,
    action: CreditAction,
    credits: int,
    *,
    dataset_id: str | None = None,
    reason: str = "action_failed",
) -> None:
    if not is_billing_enforcement_enabled() or credits <= 0:
        return

    try:
        profile = await _get_profile(user_id)
        balance = int(profile.get("credits_balance") or 0)
        new_balance = balance + credits
        await rest_patch(
            "profiles",
            f"id=eq.{user_id}",
            {
                "credits_balance": new_balance,
                "updated_at": _utcnow().isoformat(),
            },
        )
        await _log_transaction(
            user_id=user_id,
            action=f"{action.value}_refund",
            credits_delta=credits,
            balance_after=new_balance,
            dataset_id=dataset_id,
            metadata={"reason": reason},
        )
    except Exception:
        # Refund logging must never hide the original action error.
        pass


def begin_credit_tracking() -> Token[list[dict[str, Any]] | None]:
    return _request_credit_charges.set([])


async def refund_tracked_credits(*, reason: str) -> None:
    charges = _request_credit_charges.get() or []
    while charges:
        charge = charges.pop()
        await refund_credits(
            str(charge["user_id"]),
            charge["action"],
            int(charge["credits"]),
            dataset_id=charge.get("dataset_id"),
            reason=reason,
        )


def end_credit_tracking(token: Token[list[dict[str, Any]] | None]) -> None:
    _request_credit_charges.reset(token)


async def check_dataset_slot(user_id: str, current_count: int) -> None:
    if not is_billing_enforcement_enabled():
        return
    from ..core.billing import get_user_plan_limits

    limits = await get_user_plan_limits(user_id)
    if limits.max_concurrent_datasets is None:
        return
    if current_count >= limits.max_concurrent_datasets:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "dataset_limit",
                "message": (
                    f"Your plan allows up to {limits.max_concurrent_datasets} active datasets. "
                    "Delete one or upgrade for higher limits."
                ),
            },
        )
