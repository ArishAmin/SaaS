from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..core.auth import get_current_user
from ..services.supabase import rest_insert, rest_list, rest_patch
from ..services.workspace_invites import send_workspace_invite_email
from ..services.workspaces import (
    enrich_members_with_profiles,
    get_active_workspace,
    get_company_account_summary,
    list_user_workspaces,
    rename_company_workspace,
    require_company_account,
    require_workspace_admin,
    require_workspace_member,
    require_workspace_owner,
)

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


class WorkspaceCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=80)


class WorkspaceSwitchRequest(BaseModel):
    organization_id: str


class InviteMemberRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    role: str = Field("member", pattern="^(admin|member)$")


class WorkspaceRenameRequest(BaseModel):
    name: str = Field(min_length=2, max_length=80)


class UpdateMemberRoleRequest(BaseModel):
    role: str = Field(..., pattern="^(admin|member)$")


@router.get("")
async def list_workspaces(user: dict = Depends(get_current_user)) -> dict:
    user_id = str(user["user_id"])
    active = await get_active_workspace(user_id)
    company_account = await get_company_account_summary(user_id)
    return {
        "active_organization_id": active.get("organization_id"),
        "workspaces": await list_user_workspaces(user_id),
        "company_account": company_account,
    }


@router.post("")
async def create_new_workspace(req: WorkspaceCreateRequest, user: dict = Depends(get_current_user)) -> dict:
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "code": "company_account_required",
            "message": (
                "Company workspaces are provisioned by Acutize when you sign up for custom pricing. "
                "Please contact us to set up shared access for your organization."
            ),
        },
    )


@router.post("/switch")
async def switch_workspace(req: WorkspaceSwitchRequest, user: dict = Depends(get_current_user)) -> dict:
    user_id = str(user["user_id"])
    await require_company_account(user_id)
    await require_workspace_member(req.organization_id, user_id)
    await rest_patch("profiles", f"id=eq.{user_id}", {"active_organization_id": req.organization_id})
    return {"active_organization_id": req.organization_id}


@router.get("/{organization_id}/members")
async def list_members(organization_id: str, user: dict = Depends(get_current_user)) -> dict:
    user_id = str(user["user_id"])
    await require_company_account(user_id)
    await require_workspace_member(organization_id, user_id)
    rows = await rest_list(
        "organization_members",
        (
            f"organization_id=eq.{organization_id}"
            "&select=organization_id,user_id,role,status,invited_email,created_at"
            "&order=created_at.asc"
        ),
    )
    invitations = await rest_list(
        "organization_invitations",
        (
            f"organization_id=eq.{organization_id}&status=eq.pending"
            "&select=invitation_id,email,role,status,created_at,expires_at"
            "&order=created_at.desc"
        ),
    )
    members = await enrich_members_with_profiles(rows)
    org_rows = await rest_list("organizations", f"organization_id=eq.{organization_id}&select=owner_user_id")
    owner_user_id = org_rows[0].get("owner_user_id") if org_rows else None

    summary = await get_company_account_summary(user_id)
    show_invitations = bool(summary.get("can_manage_members"))
    return {
        "members": members,
        "invitations": invitations if show_invitations else [],
        "owner_user_id": owner_user_id,
    }


@router.post("/{organization_id}/members")
async def invite_member(
    organization_id: str,
    req: InviteMemberRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    user_id = str(user["user_id"])
    await require_company_account(user_id)
    await require_workspace_admin(organization_id, user_id)

    email = req.email.strip().lower()
    if "@" not in email:
        raise HTTPException(status_code=400, detail={"message": "Enter a valid email address."})

    existing_member = await rest_list(
        "organization_members",
        f"organization_id=eq.{organization_id}&invited_email=eq.{email}&status=eq.active&select=user_id&limit=1",
    )
    profile_match = await rest_list(
        "profiles",
        f"email=eq.{email}&select=id&limit=1",
    )
    if profile_match:
        already_in = await rest_list(
            "organization_members",
            (
                f"organization_id=eq.{organization_id}"
                f"&user_id=eq.{profile_match[0]['id']}&status=eq.active&select=user_id&limit=1"
            ),
        )
        if already_in:
            raise HTTPException(
                status_code=409,
                detail={"message": "This person is already on your team."},
            )

    pending = await rest_list(
        "organization_invitations",
        (
            f"organization_id=eq.{organization_id}&email=eq.{email}"
            "&status=eq.pending&select=invitation_id&limit=1"
        ),
    )
    if pending:
        raise HTTPException(
            status_code=409,
            detail={"message": "An invite is already pending for this email."},
        )

    invited = await rest_insert(
        "organization_invitations",
        [
            {
                "organization_id": organization_id,
                "email": email,
                "role": req.role,
                "invited_by": user_id,
            }
        ],
    )

    org_rows = await rest_list(
        "organizations",
        f"organization_id=eq.{organization_id}&select=name",
    )
    inviter_rows = await rest_list("profiles", f"id=eq.{user_id}&select=full_name,email")
    inviter = inviter_rows[0] if inviter_rows else {}
    email_sent = await send_workspace_invite_email(
        to_email=email,
        organization_name=(org_rows[0].get("name") if org_rows else "Your company") or "Your company",
        inviter_name=inviter.get("full_name") or inviter.get("email"),
        role=req.role,
    )
    return {"invitation": invited, "email_sent": email_sent}


@router.delete("/{organization_id}/invitations/{invitation_id}")
async def revoke_invitation(
    organization_id: str,
    invitation_id: str,
    user: dict = Depends(get_current_user),
) -> dict:
    user_id = str(user["user_id"])
    await require_company_account(user_id)
    await require_workspace_admin(organization_id, user_id)
    rows = await rest_list(
        "organization_invitations",
        (
            f"invitation_id=eq.{invitation_id}&organization_id=eq.{organization_id}"
            "&status=eq.pending&select=invitation_id&limit=1"
        ),
    )
    if not rows:
        raise HTTPException(status_code=404, detail={"message": "Invite not found."})
    await rest_patch(
        "organization_invitations",
        f"invitation_id=eq.{invitation_id}",
        {"status": "revoked"},
    )
    return {"status": "revoked"}


@router.delete("/{organization_id}/members/{member_user_id}")
async def remove_member(
    organization_id: str,
    member_user_id: str,
    user: dict = Depends(get_current_user),
) -> dict:
    user_id = str(user["user_id"])
    await require_company_account(user_id)
    await require_workspace_admin(organization_id, user_id)

    org_rows = await rest_list(
        "organizations",
        f"organization_id=eq.{organization_id}&select=owner_user_id",
    )
    owner_id = str(org_rows[0].get("owner_user_id")) if org_rows else ""
    if member_user_id == owner_id:
        raise HTTPException(
            status_code=403,
            detail={"message": "The workspace owner cannot be removed."},
        )
    if member_user_id == user_id:
        raise HTTPException(
            status_code=403,
            detail={"message": "You cannot remove yourself. Transfer ownership or ask another admin."},
        )

    member_rows = await rest_list(
        "organization_members",
        (
            f"organization_id=eq.{organization_id}&user_id=eq.{member_user_id}"
            "&status=eq.active&select=role&limit=1"
        ),
    )
    if not member_rows:
        raise HTTPException(status_code=404, detail={"message": "Team member not found."})
    if member_rows[0].get("role") == "owner":
        raise HTTPException(status_code=403, detail={"message": "The workspace owner cannot be removed."})

    target_role = member_rows[0].get("role")
    actor_rows = await rest_list(
        "organization_members",
        f"organization_id=eq.{organization_id}&user_id=eq.{user_id}&status=eq.active&select=role&limit=1",
    )
    actor_role = actor_rows[0].get("role") if actor_rows else None
    if actor_role == "admin" and target_role == "admin":
        raise HTTPException(
            status_code=403,
            detail={"message": "Only the workspace owner can remove another admin."},
        )

    await rest_patch(
        "organization_members",
        f"organization_id=eq.{organization_id}&user_id=eq.{member_user_id}",
        {"status": "disabled"},
    )
    return {"status": "removed"}


@router.patch("/{organization_id}/members/{member_user_id}")
async def update_member_role(
    organization_id: str,
    member_user_id: str,
    req: UpdateMemberRoleRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    user_id = str(user["user_id"])
    await require_company_account(user_id)
    await require_workspace_owner(organization_id, user_id)

    org_rows = await rest_list(
        "organizations",
        f"organization_id=eq.{organization_id}&select=owner_user_id",
    )
    owner_id = str(org_rows[0].get("owner_user_id")) if org_rows else ""
    if member_user_id == owner_id:
        raise HTTPException(status_code=403, detail={"message": "The owner role cannot be changed."})
    if member_user_id == user_id:
        raise HTTPException(status_code=403, detail={"message": "You cannot change your own role."})

    member_rows = await rest_list(
        "organization_members",
        (
            f"organization_id=eq.{organization_id}&user_id=eq.{member_user_id}"
            "&status=eq.active&select=role&limit=1"
        ),
    )
    if not member_rows:
        raise HTTPException(status_code=404, detail={"message": "Team member not found."})
    if member_rows[0].get("role") == "owner":
        raise HTTPException(status_code=403, detail={"message": "The owner role cannot be changed."})

    await rest_patch(
        "organization_members",
        f"organization_id=eq.{organization_id}&user_id=eq.{member_user_id}",
        {"role": req.role},
    )
    return {"user_id": member_user_id, "role": req.role}


@router.get("/{organization_id}/jobs")
async def list_workspace_jobs(organization_id: str, user: dict = Depends(get_current_user)) -> dict:
    user_id = str(user["user_id"])
    await require_company_account(user_id)
    await require_workspace_member(organization_id, user_id)
    summary = await get_company_account_summary(user_id)
    rows = await rest_list(
        "processing_jobs",
        (
            f"organization_id=eq.{organization_id}"
            "&select=job_id,user_id,dataset_id,action,status,error,attempts,queued_at,started_at,completed_at,updated_at"
            "&order=queued_at.desc&limit=100"
        ),
    )
    return {"jobs": rows, "can_cancel_jobs": bool(summary.get("can_manage_members"))}


@router.patch("/{organization_id}")
async def rename_workspace(
    organization_id: str,
    req: WorkspaceRenameRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    user_id = str(user["user_id"])
    updated = await rename_company_workspace(user_id, organization_id, req.name.strip())
    return {"workspace": updated}


@router.put("/{organization_id}")
async def rename_workspace_put(
    organization_id: str,
    req: WorkspaceRenameRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    user_id = str(user["user_id"])
    updated = await rename_company_workspace(user_id, organization_id, req.name.strip())
    return {"workspace": updated}
