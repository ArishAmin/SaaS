import httpx
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from ..core.config import get_settings
from ..core.auth import get_current_user

router = APIRouter(prefix="/support", tags=["support"])

class ContactRequest(BaseModel):
    firstName: str
    lastName: str
    email: str
    subject: str
    message: str

@router.post("/contact")
async def contact_support(req: ContactRequest, user: dict = Depends(get_current_user)):
    settings = get_settings()
    
    if not settings.resend_api_key:
        raise HTTPException(status_code=500, detail="Email service is not configured on the server.")

    html_content = f"""
    <h2>New Contact Form Submission</h2>
    <p><strong>Name:</strong> {req.firstName} {req.lastName}</p>
    <p><strong>Email:</strong> {req.email}</p>
    <p><strong>Topic:</strong> {req.subject}</p>
    <p><strong>User ID:</strong> {user.get('user_id', 'Unknown')}</p>
    <p><strong>Message:</strong></p>
    <p>{req.message.replace(chr(10), '<br>')}</p>
    """

    payload = {
        "from": "Acutize Support <onboarding@resend.dev>",
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
