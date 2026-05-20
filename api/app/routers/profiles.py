from fastapi import APIRouter, Depends, HTTPException
from ..core.auth import get_current_user
from ..core.billing import is_billing_enforcement_enabled
from ..services.supabase import rest_list

router = APIRouter(prefix="/profiles", tags=["profiles"])


def _apply_dev_plan_overlay(profile: dict) -> dict:
    """When billing is off, expose Business/active so the UI unlocks everything."""
    if not is_billing_enforcement_enabled():
        profile = {**profile, "plan": "business", "subscription_status": "active"}
    return profile


@router.get("/me")
async def get_my_profile(user: dict = Depends(get_current_user)):
    user_id = user["user_id"]
    try:
        rows = await rest_list("profiles", f"id=eq.{user_id}")
        if not rows:
            return _apply_dev_plan_overlay(
                {
                    "id": user_id,
                    "plan": "hobby",
                    "subscription_status": "none",
                }
            )
        return _apply_dev_plan_overlay(rows[0])
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
