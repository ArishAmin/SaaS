from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import HTTPException

from ..core.billing import PlanType, plan_from_paddle_price_id
from .credits import reset_credits_for_plan
from ..core.config import get_settings
from ..services.app_logs import log_to_supabase
from ..services.supabase import rest_list, rest_patch

PADDLE_API_BASE = "https://api.paddle.com"
PADDLE_SANDBOX_API_BASE = "https://sandbox-api.paddle.com"


def _api_base() -> str:
    settings = get_settings()
    if (settings.paddle_environment or "sandbox").lower() == "production":
        return PADDLE_API_BASE
    return PADDLE_SANDBOX_API_BASE


async def _paddle_request(method: str, path: str, payload: dict | None = None) -> dict[str, Any]:
    settings = get_settings()
    if not settings.paddle_api_key:
        raise HTTPException(status_code=500, detail="Paddle is not configured on this server.")

    url = f"{_api_base()}{path}"
    headers = {
        "Authorization": f"Bearer {settings.paddle_api_key}",
        "Content-Type": "application/json",
        "Paddle-Version": "1",
    }
    from ..core.http_client import HTTPClient
    client = HTTPClient.get_client()
    resp = await client.request(method, url, headers=headers, json=payload)
    if resp.status_code >= 400:
        detail = resp.text
        try:
            body = resp.json()
            detail = body.get("error", {}).get("detail", detail)
        except Exception:
            pass
        raise HTTPException(status_code=400, detail=f"Paddle API error: {detail}")

    body = resp.json()
    return body.get("data", body)


def _price_id_for_plan(plan: str, interval: str = "monthly") -> str:
    settings = get_settings()
    yearly = interval == "yearly"
    if plan == PlanType.BUSINESS.value:
        pid = settings.paddle_price_id_business_yearly if yearly else settings.paddle_price_id_business
    elif plan == PlanType.PRO.value:
        pid = settings.paddle_price_id_pro_yearly if yearly else settings.paddle_price_id_pro
    else:
        raise HTTPException(status_code=400, detail="Invalid plan for checkout")
    if not pid:
        raise HTTPException(
            status_code=500,
            detail=f"Paddle price ID not configured for {plan} ({interval})",
        )
    return pid


def _parse_paddle_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _same_plan_subscription_is_current(profile: dict[str, Any], requested_plan: str) -> bool:
    current_plan = str(profile.get("plan") or "").strip().lower()
    if current_plan != requested_plan:
        return False

    current_status = str(profile.get("subscription_status") or "").strip().lower()
    period_end = _parse_paddle_datetime(profile.get("current_period_end"))
    period_has_not_ended = period_end is None or period_end > datetime.now(timezone.utc)
    terminal_statuses = {"canceled", "deleted", "inactive", "none", "expired"}

    if current_status in {"active", "past_due", "trialing", "paused"}:
        return period_has_not_ended
    if period_end and period_has_not_ended:
        return True
    if profile.get("paddle_subscription_id") and current_status not in terminal_statuses:
        return True
    return False


def _interval_for_price_id(price_id: str) -> str | None:
    settings = get_settings()
    if price_id in {settings.paddle_price_id_pro_yearly, settings.paddle_price_id_business_yearly}:
        return "yearly"
    if price_id in {settings.paddle_price_id_pro, settings.paddle_price_id_business}:
        return "monthly"
    return None


def _same_price_subscription_is_current(profile: dict[str, Any], requested_price_id: str) -> bool:
    requested_plan = plan_from_paddle_price_id(requested_price_id).value
    requested_interval = _interval_for_price_id(requested_price_id)
    current_price_id = str(profile.get("paddle_price_id") or "").strip()
    if current_price_id:
        return current_price_id == requested_price_id and _same_plan_subscription_is_current(profile, requested_plan)

    current_interval = str(profile.get("billing_interval") or "").strip().lower()
    if current_interval and requested_interval and current_interval != requested_interval:
        return False

    return _same_plan_subscription_is_current(profile, requested_plan)


async def create_checkout(
    *,
    user_id: str,
    email: str | None,
    plan: str,
    interval: str = "monthly",
    success_url: str,
) -> str:
    settings = get_settings()
    price_id = _price_id_for_plan(plan, interval)
    profiles = await rest_list("profiles", f"id=eq.{user_id}")
    profile = profiles[0] if profiles else {}
    customer_id = profile.get("paddle_customer_id")
    if _same_price_subscription_is_current(profile, price_id):
        raise HTTPException(
            status_code=409,
            detail=(
                f"You are already subscribed to this {plan} {interval} plan. "
                "You can change plans from billing settings when you want to upgrade or downgrade."
            ),
        )

    checkout_url = settings.paddle_checkout_url or f"{settings.app_public_url.rstrip('/')}/checkout"

    payload: dict[str, Any] = {
        "collection_mode": "automatic",
        "items": [{"price_id": price_id, "quantity": 1}],
        "custom_data": {"user_id": user_id, "plan": plan, "interval": interval},
        "checkout": {"url": checkout_url},
    }
    if customer_id:
        payload["customer_id"] = customer_id

    data = await _paddle_request("POST", "/transactions", payload)
    checkout = data.get("checkout") or {}
    checkout_url = checkout.get("url")
    if not checkout_url:
        raise HTTPException(status_code=500, detail="Paddle did not return a checkout URL")
    return checkout_url


async def create_customer_portal(*, user_id: str, return_url: str) -> str:
    profiles = await rest_list("profiles", f"id=eq.{user_id}")
    if not profiles or not profiles[0].get("paddle_customer_id"):
        raise HTTPException(status_code=400, detail="No Paddle billing account found. Upgrade first.")

    customer_id = profiles[0]["paddle_customer_id"]
    subscription_id = profiles[0].get("paddle_subscription_id")

    body: dict[str, Any] = {
        "customer_id": customer_id,
        "return_url": return_url,
    }
    if subscription_id:
        body["subscription_ids"] = [subscription_id]

    try:
        data = await _paddle_request("POST", "/customer-portal-sessions", body)
        url = data.get("url")
        if url:
            return url
    except HTTPException:
        pass

    # Fallback: subscription management link from profile if stored
    mgmt = profiles[0].get("paddle_portal_url")
    if mgmt:
        return mgmt
    raise HTTPException(status_code=400, detail="Unable to open billing portal. Contact support.")


def verify_webhook_signature(raw_body: bytes, signature_header: str | None) -> dict[str, Any]:
    settings = get_settings()
    secret = settings.paddle_webhook_secret
    if not secret:
        raise HTTPException(status_code=500, detail="Paddle webhook secret not configured")
    if not signature_header:
        raise HTTPException(status_code=400, detail="Missing Paddle-Signature header")

    # Paddle-Signature: ts=1671552777;h1=hexdigest
    parts: dict[str, str] = {}
    for piece in signature_header.split(";"):
        if "=" in piece:
            k, v = piece.split("=", 1)
            parts[k.strip()] = v.strip()

    ts = parts.get("ts")
    h1 = parts.get("h1")
    if not ts or not h1:
        raise HTTPException(status_code=400, detail="Invalid Paddle-Signature format")

    signed_payload = f"{ts}:{raw_body.decode('utf-8')}"
    expected = hmac.new(secret.encode(), signed_payload.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, h1):
        raise HTTPException(status_code=400, detail="Invalid Paddle webhook signature")

    return json.loads(raw_body)


async def apply_subscription_update(subscription: dict[str, Any]) -> None:
    custom = subscription.get("custom_data") or {}
    user_id = custom.get("user_id")
    customer_id = subscription.get("customer_id", "")
    subscription_id = subscription.get("id", "")
    sub_status = subscription.get("status", "inactive")

    items = subscription.get("items") or []
    price_id = ""
    if items:
        first = items[0]
        price_id = (first.get("price") or {}).get("id") or first.get("price_id") or ""

    plan = plan_from_paddle_price_id(price_id)
    if sub_status in ("canceled", "deleted"):
        plan = PlanType.HOBBY

    where_query = f"id=eq.{user_id}" if user_id else f"paddle_customer_id=eq.{customer_id}"

    period_end = subscription.get("current_billing_period", {}).get("ends_at")
    if not period_end:
        period_end = subscription.get("next_billed_at")

    payload: dict[str, Any] = {
        "paddle_customer_id": customer_id,
        "paddle_subscription_id": subscription_id,
        "paddle_price_id": price_id,
        "billing_interval": _interval_for_price_id(price_id),
        "plan": plan.value,
        "subscription_status": sub_status,
        "cancel_at_period_end": bool(subscription.get("scheduled_change")),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if period_end:
        payload["current_period_end"] = period_end

    mgmt = subscription.get("management_urls") or {}
    if isinstance(mgmt, dict) and mgmt.get("update"):
        payload["paddle_portal_url"] = mgmt.get("update")

    await rest_patch("profiles", where_query, payload)

    if user_id and sub_status in ("active", "trialing", "past_due"):
        await reset_credits_for_plan(str(user_id), plan.value)

    await log_to_supabase(
        level="info",
        event="paddle_subscription_update",
        message=f"Plan set to {plan.value} ({sub_status})",
        metadata={"user_id": user_id, "price_id": price_id, "status": sub_status},
    )


async def apply_transaction_completed(transaction: dict[str, Any]) -> None:
    custom = transaction.get("custom_data") or {}
    user_id = custom.get("user_id")
    if not user_id:
        return

    customer_id = transaction.get("customer_id")
    subscription_id = transaction.get("subscription_id")
    patch: dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if customer_id:
        patch["paddle_customer_id"] = customer_id
    if subscription_id:
        patch["paddle_subscription_id"] = subscription_id

    plan_hint = custom.get("plan")
    if plan_hint in ("pro", "business"):
        patch["plan"] = plan_hint
        patch["subscription_status"] = "active"

    items = transaction.get("items") or []
    if items:
        first = items[0]
        price_id = (first.get("price") or {}).get("id") or first.get("price_id")
        if price_id:
            patch["paddle_price_id"] = price_id
            interval = _interval_for_price_id(price_id)
            if interval:
                patch["billing_interval"] = interval

    await rest_patch("profiles", f"id=eq.{user_id}", patch)
