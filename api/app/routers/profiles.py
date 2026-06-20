from fastapi import APIRouter, Depends, HTTPException, status

from ..core.auth import get_current_user
from ..services.credits import get_credits_summary
from ..services.supabase import rest_list
from ..services.workspaces import get_active_workspace, get_company_account_summary

router = APIRouter(prefix="/profiles", tags=["profiles"])


@router.get("/me")
async def get_my_profile(user: dict = Depends(get_current_user)):
    user_id = user["user_id"]
    try:
        rows = await rest_list("profiles", f"id=eq.{user_id}")
        if not rows:
            return {
                "id": user_id,
                "plan": "hobby",
                "subscription_status": "none",
                "credits_balance": 200,
                "credits_quota": 200,
                "credits_monthly_quota": 200,
                "credits_refresh_mode": "one_time",
            }

        profile = rows[0]
        credits = await get_credits_summary(user_id)
        company_account = await get_company_account_summary(user_id)
        try:
            workspace = await get_active_workspace(user_id)
            if workspace:
                profile["plan"] = workspace.get("plan", profile.get("plan", "hobby"))
                profile["subscription_status"] = workspace.get("subscription_status", profile.get("subscription_status", "inactive"))
        except Exception:
            workspace = None
        return {
            **profile,
            **credits,
            "workspace": workspace,
            "company_account": company_account,
            "active_organization_id": (workspace or {}).get("organization_id") or profile.get("active_organization_id"),
        }
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "message": "We couldn't load your profile right now. Please refresh and try again.",
            },
        )
