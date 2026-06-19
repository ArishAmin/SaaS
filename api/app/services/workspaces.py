from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status

from ..core.billing import PlanType, is_testing_mode
from .supabase import rest_insert, rest_list, rest_patch, rest_rpc

TESTING_CUSTOM_CREDITS = 5000


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


async def accept_pending_invitations(user_id: str, email: str | None) -> str | None:
    if not email or not str(email).strip():
        return None
    result = await rest_rpc(
        "accept_pending_organization_invitations",
        {"p_user_id": user_id, "p_email": str(email).strip()},
    )
    if isinstance(result, str) and result:
        return result
    if isinstance(result, list) and result:
        return str(result[0]) if result[0] else None
    return None


async def _load_organization(org_id: str) -> dict[str, Any]:
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


async def provision_testing_company_workspace(user_id: str, workspace: dict[str, Any]) -> dict[str, Any]:
    """When TESTING=true, simulate a successful custom Paddle purchase for QA."""
    if not is_testing_mode():
        return workspace

    plan = str(workspace.get("plan") or "hobby").lower()
    status_value = str(workspace.get("subscription_status") or "inactive").lower()
    org_id = str(workspace["organization_id"])
    quota = int(workspace.get("credits_monthly_quota") or 0)
    already_provisioned = (
        plan == PlanType.CUSTOM.value
        and status_value in ("active", "past_due", "trialing")
        and quota >= TESTING_CUSTOM_CREDITS
    )
    if already_provisioned:
        return workspace

    from .credits import reset_credits_for_plan, reset_workspace_credits_for_plan

    now = datetime.now(timezone.utc).isoformat()
    patch = {
        "plan": PlanType.CUSTOM.value,
        "subscription_status": "active",
        "credits_monthly_quota": TESTING_CUSTOM_CREDITS,
        "updated_at": now,
    }
    await rest_patch("organizations", f"organization_id=eq.{org_id}", patch)
    await rest_patch("profiles", f"id=eq.{user_id}", patch)
    await reset_workspace_credits_for_plan(
        organization_id=org_id,
        user_id=user_id,
        plan_name=PlanType.CUSTOM.value,
        monthly_credits=TESTING_CUSTOM_CREDITS,
    )
    await reset_credits_for_plan(user_id, PlanType.CUSTOM.value, TESTING_CUSTOM_CREDITS)

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
    return rows[0] if rows else {**workspace, **patch}


async def get_active_workspace(user_id: str) -> dict[str, Any]:
    profiles = await rest_list("profiles", f"id=eq.{user_id}&select=active_organization_id,full_name,email")
    profile = profiles[0] if profiles else {}

    if profile.get("email"):
        await accept_pending_invitations(user_id, profile.get("email"))
        profiles = await rest_list(
            "profiles",
            f"id=eq.{user_id}&select=active_organization_id,full_name,email",
        )
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
            return await provision_testing_company_workspace(user_id, rows[0])

    org_id = await ensure_default_workspace(user_id, profile.get("full_name") or profile.get("email"))
    workspace = await _load_organization(org_id)
    return await provision_testing_company_workspace(user_id, workspace)


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
    owner_user_id = str(workspace.get("owner_user_id") or "")
    return {
        "enabled": enabled,
        "organization_id": org_id,
        "organization_name": workspace.get("name"),
        "owner_user_id": owner_user_id or None,
        "is_owner": owner_user_id == str(user_id),
        "member_count": member_count,
        "pending_invitations": pending_invites,
        "plan": workspace.get("plan"),
        "role": role,
        "can_manage_members": enabled and role in ("owner", "admin"),
        "can_manage_billing": enabled and owner_user_id == str(user_id),
        "can_update_member_roles": enabled and owner_user_id == str(user_id),
        "credits_balance": int(workspace.get("credits_balance") or 0),
        "credits_monthly_quota": int(workspace.get("credits_monthly_quota") or 0),
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


async def require_workspace_owner(organization_id: str, user_id: str) -> None:
    rows = await rest_list(
        "organizations",
        f"organization_id=eq.{organization_id}&select=owner_user_id",
    )
    if not rows or str(rows[0].get("owner_user_id")) != str(user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "owner_required", "message": "Only the workspace owner can perform this action."},
        )


async def require_billing_access(user_id: str) -> None:
    """Company billing is owner-only; individual plans keep self-serve billing."""
    workspace = await get_active_workspace(user_id)
    if not await is_company_account(workspace):
        return
    if str(workspace.get("owner_user_id")) != str(user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "billing_owner_required",
                "message": "Billing is managed by your company workspace owner. Contact them for plan changes.",
            },
        )


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


async def enrich_members_with_profiles(members: list[dict[str, Any]]) -> list[dict[str, Any]]:
    user_ids = [str(row["user_id"]) for row in members if row.get("user_id")]
    if not user_ids:
        return members
    id_filter = ",".join(user_ids)
    profiles = await rest_list(
        "profiles",
        f"id=in.({id_filter})&select=id,email,full_name,username",
    )
    profile_map = {str(row["id"]): row for row in profiles}
    enriched: list[dict[str, Any]] = []
    for member in members:
        profile = profile_map.get(str(member.get("user_id")), {})
        enriched.append(
            {
                **member,
                "email": profile.get("email") or member.get("invited_email"),
                "full_name": profile.get("full_name"),
                "username": profile.get("username"),
            }
        )
    return enriched


async def enrich_jobs_with_profiles(jobs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    user_ids = [str(row["user_id"]) for row in jobs if row.get("user_id")]
    if not user_ids:
        return jobs
    id_filter = ",".join(user_ids)
    profiles = await rest_list(
        "profiles",
        f"id=in.({id_filter})&select=id,email,full_name,username",
    )
    profile_map = {str(row["id"]): row for row in profiles}
    enriched: list[dict[str, Any]] = []
    for job in jobs:
        profile = profile_map.get(str(job.get("user_id")), {})
        full_name = profile.get("full_name")
        email = profile.get("email")
        username = profile.get("username")
        performer_name = full_name or email or username
        enriched.append(
            {
                **job,
                "performer_name": performer_name,
                "performer_email": email,
            }
        )
    return enriched


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
