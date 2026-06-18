from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..core.auth import get_current_user
from ..services.supabase import rest_insert, rest_list, rest_patch
from ..services.workspaces import (
    get_active_workspace,
    get_company_account_summary,
    list_user_workspaces,
    rename_company_workspace,
    require_company_account,
    require_workspace_admin,
    require_workspace_member,
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
    return {"members": rows, "invitations": invitations}


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
    return {"member": invited}


@router.get("/{organization_id}/jobs")
async def list_workspace_jobs(organization_id: str, user: dict = Depends(get_current_user)) -> dict:
    user_id = str(user["user_id"])
    summary = await require_company_account(user_id)
    await require_workspace_member(organization_id, user_id)
    if not summary.get("can_manage_members"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "admin_required",
                "message": "Only company admins can view team activity.",
            },
        )
    rows = await rest_list(
        "processing_jobs",
        (
            f"organization_id=eq.{organization_id}"
            "&select=job_id,user_id,dataset_id,action,status,error,attempts,queued_at,started_at,completed_at,updated_at"
            "&order=queued_at.desc&limit=100"
        ),
    )
    return {"jobs": rows}


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
