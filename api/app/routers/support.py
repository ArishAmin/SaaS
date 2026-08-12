from html import escape
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from ..core.config import get_settings
from ..core.auth import get_optional_current_user
from ..core.rate_limit import limiter

router = APIRouter(prefix="/support", tags=["support"])

class ContactRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    firstName: str = Field(min_length=1, max_length=100)
    lastName: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=254, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    subject: Literal["enterprise", "support", "bug", "other"]
    message: str = Field(min_length=1, max_length=10_000)

@router.post("/contact")
@limiter.limit("5/minute")
async def contact_support(
    request: Request,
    req: ContactRequest,
    user: dict | None = Depends(get_optional_current_user),
):
    settings = get_settings()
    
    if not settings.resend_api_key:
        raise HTTPException(status_code=500, detail="Email service is not configured on the server.")

    first_name = escape(req.firstName)
    last_name = escape(req.lastName)
    email = escape(req.email)
    subject = escape(req.subject)
    message = escape(req.message).replace("\n", "<br>")
    user_id = escape(str(user["user_id"])) if user else "Guest"

    html_content = f"""
    <h2>New Contact Form Submission</h2>
    <p><strong>Name:</strong> {first_name} {last_name}</p>
    <p><strong>Email:</strong> {email}</p>
    <p><strong>Topic:</strong> {subject}</p>
    <p><strong>User ID:</strong> {user_id}</p>
    <p><strong>Message:</strong></p>
    <p>{message}</p>
    """

    payload = {
        "from": "Acutize Support <support@acutize.com>",
        "to": ["support@acutize.com"],
        "subject": f"New Contact Request: {req.subject}",
        "html": html_content,
        "reply_to": req.email
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {settings.resend_api_key}",
                "Content-Type": "application/json"
            },
            json=payload,
            timeout=10.0
        )

        if response.status_code >= 400:
            error_details = response.text
            print(f"Resend Error: {error_details}")
            raise HTTPException(status_code=500, detail="Failed to send email.")

    return {"status": "ok"}
