from fastapi import APIRouter, Depends, HTTPException

from ..core.auth import get_current_user
from ..services.credits import get_credits_summary
from ..services.supabase import rest_list

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
        return {**profile, **credits}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
