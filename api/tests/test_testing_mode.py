"""Unit checks for TESTING mode company-workspace bypass."""

from __future__ import annotations

import asyncio
import os
import sys
import unittest
from unittest.mock import AsyncMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ["TESTING"] = "true"

from app.core.billing import has_active_subscription, is_testing_mode  # noqa: E402
from app.services.workspaces import (  # noqa: E402
    TESTING_CUSTOM_CREDITS,
    is_company_account,
    provision_testing_company_workspace,
)


class TestingModeTests(unittest.TestCase):
    def test_testing_env_is_enabled(self) -> None:
        self.assertTrue(is_testing_mode())

    def test_has_active_subscription_bypassed(self) -> None:
        self.assertTrue(has_active_subscription("inactive"))
        self.assertTrue(has_active_subscription("none"))

    def test_is_company_account_enabled_in_testing(self) -> None:
        self.assertTrue(asyncio.run(is_company_account({"plan": "hobby"})))

    def test_provision_upgrades_hobby_workspace(self) -> None:
        hobby_workspace = {
            "organization_id": "org-1",
            "plan": "hobby",
            "subscription_status": "inactive",
            "credits_monthly_quota": 200,
            "credits_balance": 200,
        }
        upgraded = {
            **hobby_workspace,
            "plan": "custom",
            "subscription_status": "active",
            "credits_monthly_quota": TESTING_CUSTOM_CREDITS,
            "credits_balance": TESTING_CUSTOM_CREDITS,
        }

        with (
            patch("app.services.workspaces.rest_patch", new_callable=AsyncMock) as patch_mock,
            patch(
                "app.services.credits.reset_workspace_credits_for_plan",
                new_callable=AsyncMock,
            ),
            patch("app.services.credits.reset_credits_for_plan", new_callable=AsyncMock),
            patch(
                "app.services.workspaces.rest_list",
                new_callable=AsyncMock,
                return_value=[upgraded],
            ),
        ):
            result = asyncio.run(provision_testing_company_workspace("user-1", hobby_workspace))

        self.assertEqual(result["plan"], "custom")
        self.assertEqual(result["credits_monthly_quota"], TESTING_CUSTOM_CREDITS)
        self.assertEqual(patch_mock.await_count, 2)

    def test_provision_skips_when_already_custom(self) -> None:
        custom_workspace = {
            "organization_id": "org-1",
            "plan": "custom",
            "subscription_status": "active",
            "credits_monthly_quota": TESTING_CUSTOM_CREDITS,
            "credits_balance": TESTING_CUSTOM_CREDITS,
        }

        with patch("app.services.workspaces.rest_patch", new_callable=AsyncMock) as patch_mock:
            result = asyncio.run(provision_testing_company_workspace("user-1", custom_workspace))

        self.assertEqual(result, custom_workspace)
        patch_mock.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
