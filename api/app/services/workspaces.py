from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status

from ..core.billing import is_testing_mode
from .supabase import rest_insert, rest_list, rest_patch, rest_rpc


async def ensure_default_workspace(user_id: str, name: str | None = None) -> str:
    result = await rest_rpc(
        "ensure_default_organization",
        {"p_user_id": user_id, "p_name": name},
    )
    if isinstance(result, str):
        return result
    if isinstance(result, list) and result:
        return str(result[0])
    raise HTTPException(status_code=500, detail="Could not create default workspace")


async def get_active_workspace(user_id: str) -> dict[str, Any]:
    profiles = await rest_list("profiles", f"id=eq.{user_id}&select=active_organization_id,full_name,email")
    profile = profiles[0] if profiles else {}
    active_org_id = profile.get("active_organization_id")

    if active_org_id:
        rows = await rest_list(
            "organizations",
            (
                f"organization_id=eq.{active_org_id}"
                "&select=organization_id,name,owner_user_id,plan,subscription_status,current_period_end,"
                "cancel_at_period_end,credits_balance,credits_monthly_quota,credits_period_end,"
                "paddle_customer_id,paddle_subscription_id,paddle_price_id,paddle_portal_url,billing_interval,"
                "max_concurrent_jobs,max_concurrent_jobs_per_user,created_at,updated_at"
            ),
        )
        if rows and await is_workspace_member(str(rows[0]["organization_id"]), user_id):
            return rows[0]

    org_id = await ensure_default_workspace(user_id, profile.get("full_name") or profile.get("email"))
    rows = await rest_list(
        "organizations",
        (
            f"organization_id=eq.{org_id}"
            "&select=organization_id,name,owner_user_id,plan,subscription_status,current_period_end,"
            "cancel_at_period_end,credits_balance,credits_monthly_quota,credits_period_end,"
            "paddle_customer_id,paddle_subscription_id,paddle_price_id,paddle_portal_url,billing_interval,"
            "max_concurrent_jobs,max_concurrent_jobs_per_user,created_at,updated_at"
        ),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return rows[0]


async def get_organization_member_count(organization_id: str) -> int:
    rows = await rest_list(
        "organization_members",
        f"organization_id=eq.{organization_id}&status=eq.active&select=user_id",
    )
    return len(rows)


async def get_pending_invitation_count(organization_id: str) -> int:
    rows = await rest_list(
        "organization_invitations",
        f"organization_id=eq.{organization_id}&status=eq.pending&select=invitation_id&limit=1",
    )
    return len(rows)


async def is_company_account(org: dict[str, Any]) -> bool:
    """Company workspace is only for custom-pricing customers (provisioned by Acutize)."""
    if is_testing_mode():
        return True
    return str(org.get("plan") or "hobby").lower() == "custom"


async def rename_company_workspace(user_id: str, organization_id: str, name: str) -> dict[str, Any]:
    await require_company_account(user_id)
    await require_workspace_admin(organization_id, user_id)
    clean_name = name.strip()
    if len(clean_name) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Company name must be at least 2 characters."},
        )
    return await rest_patch(
        "organizations",
        f"organization_id=eq.{organization_id}",
        {"name": clean_name},
    )


async def get_company_account_summary(user_id: str) -> dict[str, Any]:
    workspace = await get_active_workspace(user_id)
    org_id = str(workspace["organization_id"])
    member_count = await get_organization_member_count(org_id)
    pending_invites = await get_pending_invitation_count(org_id)
    enabled = await is_company_account(workspace)
    memberships = await rest_list(
        "organization_members",
        f"organization_id=eq.{org_id}&user_id=eq.{user_id}&status=eq.active&select=role",
    )
    role = memberships[0].get("role") if memberships else None
    return {
        "enabled": enabled,
        "organization_id": org_id,
        "organization_name": workspace.get("name"),
        "member_count": member_count,
        "pending_invitations": pending_invites,
        "plan": workspace.get("plan"),
        "role": role,
        "can_manage_members": enabled and role in ("owner", "admin"),
    }


async def require_company_account(user_id: str) -> dict[str, Any]:
    summary = await get_company_account_summary(user_id)
    if not summary["enabled"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "company_account_required",
                "message": (
                    "Company workspaces are included with custom pricing plans only. "
                    "Contact us if your organization needs shared access for multiple employees."
                ),
            },
        )
    return summary


async def is_workspace_member(organization_id: str, user_id: str) -> bool:
    rows = await rest_list(
        "organization_members",
        f"organization_id=eq.{organization_id}&user_id=eq.{user_id}&status=eq.active&select=user_id",
    )
    return bool(rows)


async def require_workspace_member(organization_id: str, user_id: str) -> None:
    if not await is_workspace_member(organization_id, user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Workspace access denied")


async def require_workspace_admin(organization_id: str, user_id: str) -> None:
    rows = await rest_list(
        "organization_members",
        f"organization_id=eq.{organization_id}&user_id=eq.{user_id}&status=eq.active&select=role",
    )
    role = rows[0].get("role") if rows else None
    if role not in ("owner", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Workspace admin access required")


async def list_user_workspaces(user_id: str) -> list[dict[str, Any]]:
    await ensure_default_workspace(user_id)
    memberships = await rest_list(
        "organization_members",
        (
            f"user_id=eq.{user_id}&status=eq.active"
            "&select=role,organization_id,organizations(organization_id,name,plan,subscription_status,credits_balance,credits_monthly_quota)"
            "&order=created_at.asc"
        ),
    )
    out: list[dict[str, Any]] = []
    for row in memberships:
        org = row.get("organizations") or {}
        out.append(
            {
                "organization_id": org.get("organization_id") or row.get("organization_id"),
                "name": org.get("name"),
                "role": row.get("role"),
                "plan": org.get("plan"),
                "subscription_status": org.get("subscription_status"),
                "credits_balance": org.get("credits_balance"),
                "credits_monthly_quota": org.get("credits_monthly_quota"),
            }
        )
    return out


async def create_workspace(user_id: str, name: str) -> dict[str, Any]:
    await require_company_account(user_id)
    created = await rest_insert(
        "organizations",
        [
            {
                "name": name,
                "owner_user_id": user_id,
                "plan": "hobby",
                "subscription_status": "inactive",
                "credits_balance": 200,
                "credits_monthly_quota": 200,
                "max_concurrent_jobs": 1,
                "max_concurrent_jobs_per_user": 1,
            }
        ],
    )
    org_id = str(created["organization_id"])
    await rest_insert(
        "organization_members",
        [{"organization_id": org_id, "user_id": user_id, "role": "owner", "status": "active"}],
    )
    await rest_patch("profiles", f"id=eq.{user_id}", {"active_organization_id": org_id})
    return created
