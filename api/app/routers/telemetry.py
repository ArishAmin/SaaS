from __future__ import annotations

from fastapi import APIRouter, Depends, Request, status
from pydantic import BaseModel, Field

from ..core.auth import get_current_user
from ..core.config import get_settings
from ..core.rate_limit import limiter
from ..services.app_logs import log_to_supabase

router = APIRouter(prefix="/telemetry", tags=["telemetry"])
_rate = get_settings().rate_limit_per_minute


class ClientLogRequest(BaseModel):
    level: str = Field(default="error", min_length=3, max_length=20)
    event: str = Field(default="client_error", min_length=3, max_length=100)
    message: str = Field(default="", max_length=5000)
    stack: str | None = Field(default=None, max_length=15000)
    page: str | None = Field(default=None, max_length=2000)


@router.post("/client-log", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit(_rate)
async def client_log(
    request: Request,
    payload: ClientLogRequest,
    user=Depends(get_current_user),
) -> dict:
    await log_to_supabase(
        level=payload.level,
        event=payload.event,
        message=payload.message,
        user_id=str(user["user_id"]),
        method=request.method,
        path=request.url.path,
        metadata={"page": payload.page, "stack": payload.stack},
    )
    return {"accepted": True}
