from __future__ import annotations

import logging
from contextvars import ContextVar, Token
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any

from fastapi import HTTPException, status

from ..core.billing import PLAN_CONFIGS, PlanType, get_plan_limits, has_active_subscription, is_billing_enforcement_enabled
from .supabase import rest_insert, rest_list, rest_patch, rest_rpc, rpc_error_message
from .workspaces import get_active_workspace

logger = logging.getLogger(__name__)


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
    FORECAST = "forecast"
    BUSINESS_INSIGHTS = "business_insights"


CREDIT_COSTS: dict[CreditAction, int] = {
    CreditAction.ANALYZE: 7,
    CreditAction.CLEAN: 14,
    CreditAction.FEATURE_SUGGEST: 17,
    CreditAction.FEATURE_APPLY: 0,
    CreditAction.TRAIN_INSTANT: 37,
    CreditAction.RECOMMEND: 10,
    CreditAction.EXPORT_PDF: 7,
    CreditAction.EXPORT_BUNDLE: 20,
    CreditAction.FEATURE_ENGINEER: 0,
    CreditAction.FORECAST: 34,
    CreditAction.BUSINESS_INSIGHTS: 54,
}

CREDIT_ACTION_LABELS: dict[str, str] = {
    CreditAction.ANALYZE.value: "Analyze / profile",
    CreditAction.CLEAN.value: "Clean & encode",
    CreditAction.FEATURE_SUGGEST.value: "Generate features",
    CreditAction.FEATURE_APPLY.value: "Generate features (save)",
    CreditAction.TRAIN_INSTANT.value: "Model training",
    f"{CreditAction.TRAIN_INSTANT.value}_refund": "Model training (refund)",
    CreditAction.RECOMMEND.value: "Model ideas",
    CreditAction.EXPORT_PDF.value: "PDF report",
    CreditAction.EXPORT_BUNDLE.value: "ZIP export bundle",
    CreditAction.FEATURE_ENGINEER.value: "Feature selection (free)",
    CreditAction.FORECAST.value: "Forecast future values",
    CreditAction.BUSINESS_INSIGHTS.value: "Business insights",
}

_request_credit_charges: ContextVar[list[dict[str, Any]] | None] = ContextVar(
    "request_credit_charges",
    default=None,
)
_request_idempotency_key: ContextVar[str | None] = ContextVar(
    "request_idempotency_key",
    default=None,
)
_credits_precharged: ContextVar[bool] = ContextVar("credits_precharged", default=False)


@dataclass(frozen=True)
class CreditCharge:
    cost: int
    transaction_id: str | None
    already_processed: bool


def build_credit_idempotency_key(
    base_key: str | None,
    action: CreditAction,
    dataset_id: str | None,
) -> str | None:
    if not base_key:
        return None
    return f"{base_key}:{action.value}:{dataset_id or 'none'}"


def set_credits_precharged(value: bool) -> Token[bool]:
    return _credits_precharged.set(value)


def reset_credits_precharged(token: Token[bool]) -> None:
    _credits_precharged.reset(token)


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


def _rpc_first_row(result: Any) -> dict[str, Any] | None:
    if isinstance(result, list) and result:
        first = result[0]
        return first if isinstance(first, dict) else None
    if isinstance(result, dict):
        return result
    return None


def build_spend_organization_credits_payload(
    *,
    organization_id: str,
    user_id: str,
    action: CreditAction,
    cost: int,
    dataset_id: str | None = None,
    idempotency_key: str | None = None,
    source: str = "api",
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "p_organization_id": organization_id,
        "p_user_id": user_id,
        "p_action": action.value,
        "p_cost": cost,
        "p_metadata": {"source": source},
    }
    if dataset_id is not None:
        payload["p_dataset_id"] = dataset_id
    if idempotency_key is not None:
        payload["p_idempotency_key"] = idempotency_key
    return payload


def _http_detail_from_rpc_error(exc: Exception, *, cost: int, plan_name: str = "hobby") -> dict[str, Any] | None:
    detail = rpc_error_message(exc).lower()

    if "insufficient_credits:" in detail or "insufficient_credits" in detail:
        balance = 0
        try:
            tail = detail.split("insufficient_credits", 1)[1]
            parts = tail.replace('"', "").replace("'", "").split(":")
            balance = int(parts[1] if parts[0] == "" else parts[0])
        except Exception:
            pass
        return {
            "code": "insufficient_credits",
            "message": (
                f"This action needs {cost} credits but you have {balance} left. "
                "Upgrade for more credits and higher limits."
            ),
            "required_credits": cost,
            "balance": balance,
            "plan": plan_name,
        }

    if "not_org_member" in detail:
        return {
            "code": "workspace_access_denied",
            "message": "You are not an active member of this workspace. Switch workspace or ask your admin for access.",
        }

    if "organization_not_found" in detail:
        return {
            "code": "workspace_not_found",
            "message": "Workspace not found. Refresh the page or contact support.",
        }

    if "pgrst202" in detail or "could not find the function" in detail:
        return {
            "code": "billing_migration_required",
            "message": "Workspace billing is not fully configured yet. Please contact support.",
        }

    return None


def _http_status_from_rpc_error(exc: Exception) -> int:
    detail = _http_detail_from_rpc_error(exc, cost=0)
    if not detail:
        return status.HTTP_500_INTERNAL_SERVER_ERROR
    code = detail.get("code")
    if code == "insufficient_credits":
        return status.HTTP_402_PAYMENT_REQUIRED
    if code in ("workspace_access_denied", "billing_migration_required"):
        return status.HTTP_403_FORBIDDEN
    if code == "workspace_not_found":
        return status.HTTP_404_NOT_FOUND
    return status.HTTP_500_INTERNAL_SERVER_ERROR


async def _has_credit_transactions(user_id: str) -> bool:
    try:
        rows = await rest_list("credit_transactions", f"user_id=eq.{user_id}&select=id&limit=1")
        return bool(rows)
    except Exception:
        # If history cannot be checked, avoid granting corrective credits twice.
        return True


async def _has_org_credit_transactions(organization_id: str) -> bool:
    try:
        rows = await rest_list(
            "credit_transactions",
            f"organization_id=eq.{organization_id}&select=id&limit=1",
        )
        return bool(rows)
    except Exception:
        return True


async def _normalize_hobby_credits(
    *,
    user_id: str,
    record: dict,
    table: str,
    id_field: str,
    id_value: str,
) -> dict:
    """Ensure hobby accounts show the current starter pack (200/200) on workspace or profile rows."""
    limits = get_plan_limits(PlanType.HOBBY.value)
    target_quota = limits.monthly_credits
    stored_quota = int(record.get("credits_monthly_quota") or target_quota)
    balance = int(record.get("credits_balance") or 0)
    now = _utcnow()

    if stored_quota > target_quota or balance > target_quota:
        new_balance = min(balance, target_quota)
        payload = {
            "credits_balance": new_balance,
            "credits_monthly_quota": target_quota,
            "credits_period_end": None,
            "updated_at": now.isoformat(),
        }
        await rest_patch(table, f"{id_field}=eq.{id_value}", payload)
        return {**record, **payload}

    has_history = (
        await _has_org_credit_transactions(id_value)
        if table == "organizations"
        else await _has_credit_transactions(user_id)
    )
    legacy_start_balance = (
        stored_quota == target_quota
        and balance == 60
        and not has_history
    )
    unmigrated_starter = (
        stored_quota == target_quota
        and balance < target_quota
        and not has_history
    )
    if stored_quota < target_quota or legacy_start_balance or unmigrated_starter:
        old_quota = 60 if legacy_start_balance else stored_quota
        used_credits = max(0, old_quota - balance)
        new_balance = max(0, target_quota - used_credits)
        if unmigrated_starter and not legacy_start_balance and stored_quota >= target_quota:
            new_balance = target_quota
        payload = {
            "credits_balance": new_balance,
            "credits_monthly_quota": target_quota,
            "credits_period_end": None,
            "updated_at": now.isoformat(),
        }
        await rest_patch(table, f"{id_field}=eq.{id_value}", payload)
        return {**record, **payload}

    return record


async def ensure_workspace_hobby_credits(user_id: str, workspace: dict) -> dict:
    if not is_billing_enforcement_enabled():
        return workspace
    if _effective_plan(workspace) != PlanType.HOBBY.value:
        return workspace
    org_id = workspace.get("organization_id")
    if not org_id:
        return workspace
    workspace = await _normalize_hobby_credits(
        user_id=user_id,
        record=workspace,
        table="organizations",
        id_field="organization_id",
        id_value=str(org_id),
    )
    # Keep profile row aligned when workspace credits are corrected.
    try:
        profile = await _get_profile(user_id)
        await _normalize_hobby_credits(
            user_id=user_id,
            record=profile,
            table="profiles",
            id_field="id",
            id_value=user_id,
        )
    except HTTPException:
        pass
    return workspace


async def ensure_credits_period(user_id: str) -> dict:
    """Paid plans: refill credits every 30 days. Free (hobby): one-time pack, never auto-refill."""
    profile = await _get_profile(user_id)
    if not is_billing_enforcement_enabled():
        return profile

    plan_name = _effective_plan(profile)
    now = _utcnow()
    if plan_name == PlanType.HOBBY.value:
        limits = get_plan_limits(plan_name)
        target_quota = limits.monthly_credits
        stored_quota = int(profile.get("credits_monthly_quota") or target_quota)
        balance = int(profile.get("credits_balance") or 0)
        if stored_quota > target_quota or balance > target_quota:
            new_balance = min(balance, target_quota)
            payload = {
                "credits_balance": new_balance,
                "credits_monthly_quota": target_quota,
                "credits_period_end": None,
                "updated_at": now.isoformat(),
            }
            await rest_patch("profiles", f"id=eq.{user_id}", payload)
            await _log_transaction(
                user_id=user_id,
                action="free_quota_cap",
                credits_delta=new_balance - balance,
                balance_after=new_balance,
                metadata={"previous_quota": stored_quota, "new_quota": target_quota},
            )
            return {**profile, **payload}
        has_history = await _has_credit_transactions(user_id)
        legacy_start_balance = (
            stored_quota == target_quota
            and balance == 60
            and not has_history
        )
        unmigrated_starter = (
            stored_quota == target_quota
            and balance < target_quota
            and not has_history
        )
        if stored_quota < target_quota or legacy_start_balance or unmigrated_starter:
            old_quota = 60 if legacy_start_balance else stored_quota
            used_credits = max(0, old_quota - balance)
            new_balance = max(0, target_quota - used_credits)
            if unmigrated_starter and not legacy_start_balance and stored_quota >= target_quota:
                new_balance = target_quota
            payload = {
                "credits_balance": new_balance,
                "credits_monthly_quota": target_quota,
                "credits_period_end": None,
                "updated_at": now.isoformat(),
            }
            await rest_patch("profiles", f"id=eq.{user_id}", payload)
            await _log_transaction(
                user_id=user_id,
                action="free_quota_update",
                credits_delta=new_balance - balance,
                balance_after=new_balance,
                metadata={"previous_quota": stored_quota, "new_quota": target_quota},
            )
            return {**profile, **payload}
        return profile

    period_end = _parse_ts(profile.get("credits_period_end"))
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


async def reset_workspace_credits_for_plan(
    *,
    organization_id: str,
    user_id: str,
    plan_name: str,
    monthly_credits: int | None = None,
) -> None:
    limits = get_plan_limits(plan_name)
    quota = monthly_credits or limits.monthly_credits
    now = _utcnow()
    period_end = None if plan_name == PlanType.HOBBY.value else (now + timedelta(days=30)).isoformat()
    await rest_patch(
        "organizations",
        f"organization_id=eq.{organization_id}",
        {
            "credits_balance": quota,
            "credits_monthly_quota": quota,
            "credits_period_end": period_end,
            "updated_at": now.isoformat(),
        },
    )
    try:
        await rest_insert(
            "credit_transactions",
            [
                {
                    "organization_id": organization_id,
                    "user_id": user_id,
                    "action": "plan_upgrade",
                    "credits_delta": quota,
                    "balance_after": quota,
                    "metadata": {"plan": plan_name, "credits_monthly_quota": quota},
                }
            ],
        )
    except Exception:
        pass


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

    try:
        workspace = await get_active_workspace(user_id)
        workspace = await ensure_workspace_hobby_credits(user_id, workspace)
        plan_name = _effective_plan(workspace)
        limits = get_plan_limits(plan_name)
        monthly_quota = int(workspace.get("credits_monthly_quota") or limits.monthly_credits)
        mode = credits_refresh_mode(plan_name)
        return {
            "organization_id": workspace.get("organization_id"),
            "workspace_name": workspace.get("name"),
            "credits_balance": int(workspace.get("credits_balance") or 0),
            "credits_quota": monthly_quota,
            "credits_refresh_mode": mode,
            "credits_period_end": workspace.get("credits_period_end") if mode == "monthly" else None,
            "credit_costs": {k.value: v for k, v in CREDIT_COSTS.items()},
            "credit_action_labels": CREDIT_ACTION_LABELS,
        }
    except Exception:
        # Fallback for projects before the workspace migration is applied.
        pass

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
    try:
        workspace = await get_active_workspace(user_id)
        org_id = workspace.get("organization_id")
        rows = await rest_list(
            "credit_transactions",
            f"organization_id=eq.{org_id}&order=created_at.desc&limit={limit}",
        )
    except Exception:
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


async def charge_credits(
    user_id: str,
    action: CreditAction,
    *,
    dataset_id: str | None = None,
    idempotency_key: str | None = None,
    source: str = "api",
) -> CreditCharge:
    if not is_billing_enforcement_enabled():
        return CreditCharge(cost=0, transaction_id=None, already_processed=False)

    cost = CREDIT_COSTS[action]
    if cost <= 0:
        return CreditCharge(cost=0, transaction_id=None, already_processed=False)

    if idempotency_key is None:
        base_key = _request_idempotency_key.get()
        idempotency_key = build_credit_idempotency_key(base_key, action, dataset_id)

    try:
        workspace = await get_active_workspace(user_id)
        org_id = str(workspace["organization_id"])
        plan_name = _effective_plan(workspace)
        await rest_rpc(
            "ensure_organization_membership",
            {"p_organization_id": org_id, "p_user_id": user_id},
        )
        result = await rest_rpc(
            "spend_organization_credits",
            build_spend_organization_credits_payload(
                organization_id=org_id,
                user_id=user_id,
                action=action,
                cost=cost,
                dataset_id=dataset_id,
                idempotency_key=idempotency_key,
                source=source,
            ),
        )
        row = _rpc_first_row(result) or {}
        transaction_id = str(row["transaction_id"]) if row.get("transaction_id") else None
        already_processed = bool(row.get("already_processed"))
        charges = _request_credit_charges.get()
        if charges is not None and not already_processed:
            charges.append(
                {
                    "user_id": user_id,
                    "organization_id": org_id,
                    "action": action,
                    "credits": cost,
                    "dataset_id": dataset_id,
                    "transaction_id": transaction_id,
                }
            )
        return CreditCharge(cost=cost, transaction_id=transaction_id, already_processed=already_processed)
    except HTTPException:
        raise
    except Exception as exc:
        detail = _http_detail_from_rpc_error(exc, cost=cost, plan_name=locals().get("plan_name", "hobby"))
        if detail:
            raise HTTPException(status_code=_http_status_from_rpc_error(exc), detail=detail) from exc
        logger.exception(
            "Organization credit spend failed user_id=%s organization_id=%s action=%s rpc_error=%s",
            user_id,
            locals().get("org_id"),
            action.value,
            rpc_error_message(exc),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "message": "Could not charge workspace credits. Please try again or contact support.",
            },
        ) from exc

    # Unreachable: workspace spend succeeded above.


async def require_credits(
    user_id: str,
    action: CreditAction,
    *,
    dataset_id: str | None = None,
    idempotency_key: str | None = None,
) -> int:
    if _credits_precharged.get():
        return 0
    charge = await charge_credits(
        user_id,
        action,
        dataset_id=dataset_id,
        idempotency_key=idempotency_key,
    )
    return charge.cost


async def refund_job_charge(job: dict[str, Any], *, reason: str) -> None:
    tx_id = job.get("credit_transaction_id")
    if not tx_id or not is_billing_enforcement_enabled():
        return
    try:
        rows = await rest_list(
            "credit_transactions",
            f"id=eq.{tx_id}&select=action,credits_delta,organization_id",
        )
        if not rows:
            return
        tx = rows[0]
        credits = abs(int(tx.get("credits_delta") or 0))
        if credits <= 0:
            return
        action_str = str(tx.get("action") or "")
        try:
            action = CreditAction(action_str)
        except ValueError:
            return
        org_id = tx.get("organization_id") or job.get("organization_id")
        await refund_credits(
            str(job["user_id"]),
            action,
            credits,
            dataset_id=str(job["dataset_id"]) if job.get("dataset_id") else None,
            reason=reason,
            organization_id=str(org_id) if org_id else None,
            refunded_transaction_id=str(tx_id),
        )
    except Exception:
        pass


async def refund_credits(
    user_id: str,
    action: CreditAction,
    credits: int,
    *,
    dataset_id: str | None = None,
    reason: str = "action_failed",
    organization_id: str | None = None,
    refunded_transaction_id: str | None = None,
) -> None:
    if not is_billing_enforcement_enabled() or credits <= 0:
        return

    try:
        if organization_id:
            await rest_rpc(
                "refund_organization_credits",
                {
                    "p_organization_id": organization_id,
                    "p_user_id": user_id,
                    "p_action": action.value,
                    "p_credits": credits,
                    "p_dataset_id": dataset_id,
                    "p_reason": reason,
                    "p_refunded_transaction_id": refunded_transaction_id,
                },
            )
            return

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


def begin_credit_tracking(idempotency_key: str | None = None) -> tuple[Token[list[dict[str, Any]] | None], Token[str | None]]:
    charge_token = _request_credit_charges.set([])
    idem_token = _request_idempotency_key.set(idempotency_key)
    return charge_token, idem_token


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
            organization_id=charge.get("organization_id"),
            refunded_transaction_id=charge.get("transaction_id"),
        )


def end_credit_tracking(token: tuple[Token[list[dict[str, Any]] | None], Token[str | None]]) -> None:
    charge_token, idem_token = token
    _request_credit_charges.reset(charge_token)
    _request_idempotency_key.reset(idem_token)


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
