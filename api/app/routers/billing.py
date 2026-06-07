from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field

from ..core.auth import get_current_user
from ..core.billing import PLAN_CONFIGS, PlanType, is_billing_enforcement_enabled
from ..core.config import get_settings
from ..services.app_logs import log_to_supabase
from ..core.billing import get_user_plan_limits
from ..services.credits import (
    CREDIT_ACTION_LABELS,
    CREDIT_COSTS,
    credits_refresh_mode,
    get_credits_summary,
    list_credit_transactions,
)
from ..services.paddle_billing import (
    apply_subscription_update,
    apply_transaction_completed,
    create_checkout,
    create_customer_portal,
    verify_webhook_signature,
)

router = APIRouter(prefix="/billing", tags=["billing"])
settings = get_settings()


class CheckoutRequest(BaseModel):
    plan: str = Field(..., pattern="^(pro|business|custom)$")
    interval: str = Field("monthly", pattern="^(monthly|yearly)$")
    custom_credits: int | None = None
    success_url: str
    cancel_url: str | None = None


class PortalRequest(BaseModel):
    return_url: str | None = None


@router.get("/plans")
async def list_plans() -> dict:
    """Public plan metadata for pricing page (no secrets)."""
    credit_costs = {k.value: v for k, v in CREDIT_COSTS.items()}
    plans = []
    for plan_type in (PlanType.HOBBY, PlanType.PRO, PlanType.BUSINESS):
        cfg = PLAN_CONFIGS[plan_type]
        plans.append(
            {
                "id": plan_type.value,
                "price_usd": cfg.price_usd,
                "monthly_credits": cfg.monthly_credits,
                "max_dataset_size_mb": cfg.max_dataset_size_mb,
                "max_concurrent_datasets": cfg.max_concurrent_datasets,
                "allowed_models": cfg.allowed_models,
                "max_compute_seconds": cfg.max_compute_seconds,
                "support_priority": cfg.support_priority,
                "credit_costs": credit_costs,
            }
        )
    return {"plans": plans, "enforcement_enabled": is_billing_enforcement_enabled()}


@router.get("/credits")
async def my_credits(user: dict = Depends(get_current_user)) -> dict:
    return await get_credits_summary(user["user_id"])


@router.get("/account")
async def billing_account(user: dict = Depends(get_current_user)) -> dict:
    """Plan limits, credit costs, balance, and spend history for the usage settings page."""
    user_id = str(user["user_id"])
    from ..core.data_limits import PREVIEW_MAX_ROWS, get_user_data_limits
    from ..services.supabase import rest_list

    profiles = await rest_list("profiles", f"id=eq.{user_id}")
    profile = profiles[0] if profiles else {"plan": "hobby", "subscription_status": "none"}
    plan_name = profile.get("plan", "hobby")
    data_limits = await get_user_data_limits(user_id)
    limits = await get_user_plan_limits(user_id)
    dataset_rows = await rest_list("datasets", f"user_id=eq.{user_id}&select=dataset_id")
    credits_summary = await get_credits_summary(user_id)

    credit_rows = [
        {
            "action": action.value,
            "label": CREDIT_ACTION_LABELS.get(action.value, action.value),
            "credits": cost,
            "free": cost == 0,
        }
        for action, cost in CREDIT_COSTS.items()
        if cost > 0 or action.value in ("feature_apply",)
    ]
    credit_rows = [r for r in credit_rows if r["credits"] > 0]

    return {
        "plan": plan_name,
        "subscription_status": profile.get("subscription_status", "none"),
        "credits": credits_summary,
        "plan_limits": {
            "max_dataset_size_mb": data_limits.max_dataset_size_mb,
            "max_concurrent_datasets": limits.max_concurrent_datasets,
            "monthly_credits": credits_summary.get("credits_quota", limits.monthly_credits),
            "allowed_models": limits.allowed_models,
            "max_compute_seconds": limits.max_compute_seconds,
            "support_priority": limits.support_priority,
            "credits_refresh_mode": credits_refresh_mode(plan_name),
        },
        "dataset_usage": {
            "active_count": len(dataset_rows),
            "max_concurrent_datasets": limits.max_concurrent_datasets,
            "can_upload_more": (
                limits.max_concurrent_datasets is None
                or len(dataset_rows) < limits.max_concurrent_datasets
            ),
        },
        "data_limits": {
            "pipeline_max_rows": data_limits.pipeline_max_rows,
            "preview_max_rows": PREVIEW_MAX_ROWS,
            "uses_full_dataset": data_limits.uses_full_dataset,
            "max_columns": data_limits.max_columns,
        },
        "credit_costs_table": credit_rows,
        "transactions": await list_credit_transactions(user_id, limit=100),
    }


@router.post("/checkout")
async def paddle_checkout(req: CheckoutRequest, user: dict = Depends(get_current_user)):
    if not settings.paddle_api_key:
        raise HTTPException(status_code=500, detail="Paddle is not configured on this server.")
    user_id = user["user_id"]
    email = user.get("claims", {}).get("email") if isinstance(user.get("claims"), dict) else None
    success = req.success_url or f"{settings.app_public_url}/dashboard?checkout=success"
    custom_credits = req.custom_credits if req.plan == "custom" else None
    url = await create_checkout(
        user_id=str(user_id),
        email=email,
        plan=req.plan,
        interval=req.interval,
        custom_credits=custom_credits,
        success_url=success,
    )
    return {"url": url}


@router.post("/customer-portal")
async def paddle_customer_portal(req: PortalRequest | None = None, user: dict = Depends(get_current_user)):
    if not settings.paddle_api_key:
        raise HTTPException(status_code=500, detail="Paddle is not configured on this server.")
    return_url = (req.return_url if req else None) or f"{settings.app_public_url}/dashboard/settings"
    url = await create_customer_portal(user_id=str(user["user_id"]), return_url=return_url)
    return {"url": url}


@router.post("/webhook")
async def paddle_webhook(
    request: Request,
    paddle_signature: str | None = Header(None, alias="Paddle-Signature"),
):
    raw = await request.body()
    try:
        event = verify_webhook_signature(raw, paddle_signature)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Webhook error: {e}")

    event_type = event.get("event_type", "")
    data = event.get("data", {})

    try:
        if event_type.startswith("subscription."):
            await apply_subscription_update(data)
        elif event_type == "transaction.completed":
            await apply_transaction_completed(data)
            sub_id = data.get("subscription_id")
            if sub_id:
                # Subscription object may arrive in a separate webhook; transaction still updates customer ids.
                pass
    except Exception as e:
        await log_to_supabase(
            level="error",
            event="paddle_webhook_handler_error",
            message=str(e),
            metadata={"event_type": event_type},
        )
        raise HTTPException(status_code=500, detail="Webhook handler failed")

    return {"status": "ok"}
