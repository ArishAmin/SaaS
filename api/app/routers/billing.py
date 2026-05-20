import stripe
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, Header
from pydantic import BaseModel
from typing import Optional

from ..core.config import get_settings
from ..core.auth import get_current_user
from ..services.supabase import rest_patch, rest_list
from ..services.app_logs import log_to_supabase

router = APIRouter(prefix="/billing", tags=["billing"])
settings = get_settings()

if settings.stripe_secret_key:
    stripe.api_key = settings.stripe_secret_key


class CheckoutRequest(BaseModel):
    price_id: str
    success_url: str
    cancel_url: str


@router.post("/create-checkout-session")
async def create_checkout_session(
    req: CheckoutRequest,
    user: dict = Depends(get_current_user)
):
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=500, detail="Stripe is not configured on this server.")
    try:
        user_id = user["user_id"]
        email = user["claims"].get("email") if isinstance(user.get("claims"), dict) else None

        # 1. Check if user already has a stripe_customer_id
        profile_matches = await rest_list("profiles", f"id=eq.{user_id}")
        customer_id = None
        if profile_matches and profile_matches[0].get("stripe_customer_id"):
            customer_id = profile_matches[0]["stripe_customer_id"]

        session = stripe.checkout.Session.create(
            customer=customer_id,
            customer_email=email if not customer_id else None,
            line_items=[
                {
                    "price": req.price_id,
                    "quantity": 1,
                },
            ],
            mode="subscription",
            success_url=req.success_url,
            cancel_url=req.cancel_url,
            metadata={
                "user_id": user_id
            }
        )
        return {"url": session.url}
    except stripe.StripeError as e:
        await log_to_supabase(
            level="error",
            event="stripe_checkout_error",
            message=str(e),
        )
        raise HTTPException(status_code=400, detail=f"Stripe error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/customer-portal")
async def create_portal_session(
    user: dict = Depends(get_current_user)
):
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=500, detail="Stripe is not configured on this server.")
    try:
        user_id = user["user_id"]
        profile_matches = await rest_list("profiles", f"id=eq.{user_id}")
        if not profile_matches or not profile_matches[0].get("stripe_customer_id"):
            raise HTTPException(status_code=400, detail="No billing history found. Please upgrade first.")

        customer_id = profile_matches[0]["stripe_customer_id"]

        portal_session = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=f"http://localhost:3000/dashboard/settings"
        )
        return {"url": portal_session.url}
    except stripe.StripeError as e:
        await log_to_supabase(
            level="error",
            event="stripe_portal_error",
            message=str(e),
        )
        raise HTTPException(status_code=400, detail=f"Stripe error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/webhook")
async def stripe_webhook(request: Request, stripe_signature: str = Header(None)):
    if not settings.stripe_webhook_secret or settings.stripe_webhook_secret == "whsec_...":
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    payload = await request.body()
    try:
        event = stripe.Webhook.construct_event(
            payload, stripe_signature, settings.stripe_webhook_secret
        )
    except stripe.SignatureVerificationError as e:
        raise HTTPException(status_code=400, detail=f"Invalid signature: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Webhook Error: {str(e)}")

    # Handle the event — convert to dict for safe access in stripe v15+
    event_dict = event.to_dict() if hasattr(event, 'to_dict') else dict(event)
    event_type = event_dict.get("type", "")

    if event_type in [
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    ]:
        subscription_data = event_dict.get("data", {}).get("object", {})
        await _handle_subscription_change(subscription_data)

    return {"status": "success"}


async def _handle_subscription_change(subscription: dict):
    """Process subscription webhook data (already converted to plain dict)."""
    stripe_customer_id = subscription.get("customer", "")
    stripe_subscription_id = subscription.get("id", "")
    sub_status = subscription.get("status", "")

    # Map Stripe price IDs back to our internal plan names
    items_data = subscription.get("items", {})
    items_list = items_data.get("data", []) if isinstance(items_data, dict) else []
    price_id = items_list[0].get("price", {}).get("id", "") if items_list else ""

    plan_name = "hobby"
    if price_id == settings.stripe_price_id_pro:
        plan_name = "pro"
    elif price_id == settings.stripe_price_id_business:
        plan_name = "business"

    # Find user by metadata or by stripe_customer_id
    user_id = subscription.get("metadata", {}).get("user_id")

    where_query = ""
    if user_id:
        where_query = f"id=eq.{user_id}"
    else:
        where_query = f"stripe_customer_id=eq.{stripe_customer_id}"

    # Convert Unix timestamp to ISO format safely
    period_end = subscription.get("current_period_end")
    period_end_iso = None
    if period_end and isinstance(period_end, (int, float)):
        period_end_iso = datetime.fromtimestamp(period_end, tz=timezone.utc).isoformat()

    payload = {
        "stripe_customer_id": stripe_customer_id,
        "stripe_subscription_id": stripe_subscription_id,
        "plan": plan_name,
        "subscription_status": sub_status,
        "cancel_at_period_end": subscription.get("cancel_at_period_end", False),
    }
    if period_end_iso:
        payload["current_period_end"] = period_end_iso

    await rest_patch("profiles", where_query, payload)

    await log_to_supabase(
        level="info",
        event="subscription_change",
        message=f"Plan updated to {plan_name} (status: {sub_status})",
        metadata={"user_id": user_id, "plan": plan_name, "status": sub_status},
    )
