from __future__ import annotations

from ..core.config import get_settings
from ..core.http_client import HTTPClient


async def send_workspace_invite_email(
    *,
    to_email: str,
    organization_name: str,
    inviter_name: str | None,
    role: str,
) -> bool:
    """Send a teammate invite email. Returns False when email is not configured."""
    settings = get_settings()
    if not settings.resend_api_key:
        return False

    app_url = settings.app_public_url.rstrip("/")
    signup_url = f"{app_url}/signup?email={to_email}"
    inviter_label = inviter_name.strip() if inviter_name else "Your team admin"
    role_label = "admin" if role == "admin" else "member"

    html = f"""
    <div style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto; color: #0f172a;">
      <h2 style="margin-bottom: 8px;">You&apos;re invited to {organization_name}</h2>
      <p style="line-height: 1.6; color: #475569;">
        {inviter_label} invited you to join <strong>{organization_name}</strong> on Acutize
        as a team {role_label}. Create an account with this email address to access your
        company&apos;s shared datasets and credit pool.
      </p>
      <p style="margin: 28px 0;">
        <a href="{signup_url}"
           style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">
          Accept invitation
        </a>
      </p>
      <p style="font-size: 13px; color: #64748b; line-height: 1.5;">
        If you already have an Acutize account, sign in with <strong>{to_email}</strong> and
        you&apos;ll be added automatically.
      </p>
    </div>
    """

    client = HTTPClient.get_client()
    response = await client.post(
        "https://api.resend.com/emails",
        headers={
            "Authorization": f"Bearer {settings.resend_api_key}",
            "Content-Type": "application/json",
        },
        json={
            "from": "Acutize <onboarding@acutize.com>",
            "to": [to_email],
            "subject": f"Join {organization_name} on Acutize",
            "html": html,
        },
    )
    return response.status_code < 400
