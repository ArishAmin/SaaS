"""Permission checks for company workspace roles."""

from __future__ import annotations

import asyncio
import os
import sys
import unittest
from unittest.mock import AsyncMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import HTTPException

from app.services.workspaces import (  # noqa: E402
    get_company_account_summary,
    require_billing_access,
    require_workspace_owner,
)


class CompanyPermissionTests(unittest.TestCase):
    def test_company_summary_flags(self) -> None:
        async def run() -> None:
            workspace = {
                "organization_id": "org-1",
                "name": "Acme",
                "owner_user_id": "owner-1",
                "plan": "custom",
                "subscription_status": "active",
                "credits_balance": 5000,
                "credits_monthly_quota": 5000,
            }
            with (
                patch("app.services.workspaces.get_active_workspace", new_callable=AsyncMock, return_value=workspace),
                patch("app.services.workspaces.get_organization_member_count", new_callable=AsyncMock, return_value=3),
                patch("app.services.workspaces.get_pending_invitation_count", new_callable=AsyncMock, return_value=1),
                patch("app.services.workspaces.is_company_account", new_callable=AsyncMock, return_value=True),
                patch(
                    "app.services.workspaces.rest_list",
                    new_callable=AsyncMock,
                    return_value=[{"role": "admin"}],
                ),
            ):
                admin_summary = await get_company_account_summary("admin-1")
                self.assertTrue(admin_summary["can_manage_members"])
                self.assertFalse(admin_summary["can_manage_billing"])
                self.assertFalse(admin_summary["can_update_member_roles"])
                self.assertFalse(admin_summary["is_owner"])

                with patch(
                    "app.services.workspaces.rest_list",
                    new_callable=AsyncMock,
                    return_value=[{"role": "owner"}],
                ):
                    owner_summary = await get_company_account_summary("owner-1")
                    self.assertTrue(owner_summary["is_owner"])
                    self.assertTrue(owner_summary["can_manage_billing"])
                    self.assertTrue(owner_summary["can_update_member_roles"])

        asyncio.run(run())

    def test_billing_blocked_for_company_member(self) -> None:
        async def run() -> None:
            workspace = {
                "organization_id": "org-1",
                "owner_user_id": "owner-1",
                "plan": "custom",
            }
            with (
                patch("app.services.workspaces.get_active_workspace", new_callable=AsyncMock, return_value=workspace),
                patch("app.services.workspaces.is_company_account", new_callable=AsyncMock, return_value=True),
            ):
                with self.assertRaises(HTTPException) as ctx:
                    await require_billing_access("member-1")
                self.assertEqual(ctx.exception.status_code, 403)

        asyncio.run(run())

    def test_billing_allowed_for_individual_plan(self) -> None:
        async def run() -> None:
            workspace = {"organization_id": "org-1", "owner_user_id": "user-1", "plan": "pro"}
            with (
                patch("app.services.workspaces.get_active_workspace", new_callable=AsyncMock, return_value=workspace),
                patch("app.services.workspaces.is_company_account", new_callable=AsyncMock, return_value=False),
            ):
                await require_billing_access("user-1")

        asyncio.run(run())

    def test_require_workspace_owner(self) -> None:
        async def run() -> None:
            with patch(
                "app.services.workspaces.rest_list",
                new_callable=AsyncMock,
                return_value=[{"owner_user_id": "owner-1"}],
            ):
                await require_workspace_owner("org-1", "owner-1")
                with self.assertRaises(HTTPException):
                    await require_workspace_owner("org-1", "other-user")

        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
