from fastapi import APIRouter, Depends, HTTPException, Header, status
from ..worker.tasks_ttl_cleanup import run_ttl_cleanup
from ..core.config import get_settings
import os

router = APIRouter(prefix="/admin", tags=["admin"])

@router.post("/cleanup-ttl")
async def trigger_ttl_cleanup(authorization: str | None = Header(None)) -> dict:
    # Use environment variable directly or via config
    admin_token = os.environ.get("ADMIN_CLEANUP_TOKEN")
    
    if not admin_token:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="ADMIN_CLEANUP_TOKEN is not configured on the server."
        )

    expected_header = f"Bearer {admin_token}"
    if authorization != expected_header:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing admin token."
        )

    result = await run_ttl_cleanup()
    return result
