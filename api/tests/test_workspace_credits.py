"""Workspace credit spend helpers and RPC error mapping."""

from __future__ import annotations

import asyncio
import os
import sys
import unittest
from unittest.mock import AsyncMock, patch

import httpx

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import HTTPException

from app.services.credits import (  # noqa: E402
    CreditAction,
    _http_detail_from_rpc_error,
    _http_status_from_rpc_error,
    build_spend_organization_credits_payload,
    charge_credits,
)


class SpendPayloadTests(unittest.TestCase):
    def test_omits_null_optional_fields(self) -> None:
        payload = build_spend_organization_credits_payload(
            organization_id="org-1",
            user_id="user-1",
            action=CreditAction.ANALYZE,
            cost=7,
        )
        self.assertEqual(payload["p_organization_id"], "org-1")
        self.assertEqual(payload["p_cost"], 7)
        self.assertNotIn("p_dataset_id", payload)
        self.assertNotIn("p_idempotency_key", payload)
        self.assertEqual(payload["p_metadata"], {"source": "api"})

    def test_includes_dataset_and_idempotency_when_set(self) -> None:
        payload = build_spend_organization_credits_payload(
            organization_id="org-1",
            user_id="user-1",
            action=CreditAction.ANALYZE,
            cost=7,
            dataset_id="dataset-1",
            idempotency_key="job:analyze:dataset-1",
            source="job_enqueue",
        )
        self.assertEqual(payload["p_dataset_id"], "dataset-1")
        self.assertEqual(payload["p_idempotency_key"], "job:analyze:dataset-1")
        self.assertEqual(payload["p_metadata"], {"source": "job_enqueue"})


class RpcErrorMappingTests(unittest.TestCase):
    def _exc(self, status: int, body: dict[str, str]) -> httpx.HTTPStatusError:
        request = httpx.Request("POST", "https://example.test/rpc/spend_organization_credits")
        response = httpx.Response(status, json=body, request=request)
        return httpx.HTTPStatusError("RPC failed", request=request, response=response)

    def test_insufficient_credits_maps_to_402(self) -> None:
        exc = self._exc(400, {"code": "P0001", "message": "insufficient_credits:42:7"})
        detail = _http_detail_from_rpc_error(exc, cost=7, plan_name="custom")
        self.assertIsNotNone(detail)
        assert detail is not None
        self.assertEqual(detail["code"], "insufficient_credits")
        self.assertEqual(detail["balance"], 42)
        self.assertEqual(_http_status_from_rpc_error(exc), 402)

    def test_not_org_member_maps_to_403(self) -> None:
        exc = self._exc(403, {"code": "42501", "message": "not_org_member"})
        detail = _http_detail_from_rpc_error(exc, cost=7)
        self.assertIsNotNone(detail)
        assert detail is not None
        self.assertEqual(detail["code"], "workspace_access_denied")
        self.assertEqual(_http_status_from_rpc_error(exc), 403)

    def test_missing_function_maps_to_migration_hint(self) -> None:
        exc = self._exc(
            404,
            {
                "code": "PGRST202",
                "message": "Could not find the function public.spend_organization_credits without parameters in the schema cache",
            },
        )
        detail = _http_detail_from_rpc_error(exc, cost=7)
        self.assertIsNotNone(detail)
        assert detail is not None
        self.assertEqual(detail["code"], "billing_migration_required")


class ChargeCreditsTests(unittest.TestCase):
    def test_successful_workspace_charge(self) -> None:
        async def run() -> None:
            workspace = {
                "organization_id": "org-1",
                "plan": "custom",
                "subscription_status": "active",
                "credits_balance": 5000,
            }
            with (
                patch("app.services.credits.is_billing_enforcement_enabled", return_value=True),
                patch("app.services.credits.get_active_workspace", new_callable=AsyncMock, return_value=workspace),
                patch("app.services.credits.rest_rpc", new_callable=AsyncMock) as rpc_mock,
            ):
                rpc_mock.side_effect = [
                    None,
                    [{"transaction_id": "tx-1", "balance_after": 4993, "already_processed": False}],
                ]
                charge = await charge_credits(
                    "member-1",
                    CreditAction.ANALYZE,
                    dataset_id="dataset-1",
                    idempotency_key="idem-1",
                )
                self.assertEqual(charge.cost, 7)
                self.assertEqual(charge.transaction_id, "tx-1")
                self.assertFalse(charge.already_processed)
                self.assertEqual(rpc_mock.await_count, 2)
                spend_call = rpc_mock.await_args_list[1].args[1]
                self.assertEqual(spend_call["p_organization_id"], "org-1")
                self.assertEqual(spend_call["p_user_id"], "member-1")
                self.assertEqual(spend_call["p_dataset_id"], "dataset-1")
                self.assertEqual(spend_call["p_idempotency_key"], "idem-1")

        asyncio.run(run())

    def test_insufficient_credits_raises_402(self) -> None:
        async def run() -> None:
            workspace = {"organization_id": "org-1", "plan": "custom", "subscription_status": "active"}
            request = httpx.Request("POST", "https://example.test/rpc/spend_organization_credits")
            response = httpx.Response(
                400,
                json={"code": "P0001", "message": "insufficient_credits:3:7"},
                request=request,
            )
            exc = httpx.HTTPStatusError("RPC failed", request=request, response=response)
            with (
                patch("app.services.credits.is_billing_enforcement_enabled", return_value=True),
                patch("app.services.credits.get_active_workspace", new_callable=AsyncMock, return_value=workspace),
                patch("app.services.credits.rest_rpc", new_callable=AsyncMock, side_effect=[None, exc]),
            ):
                with self.assertRaises(HTTPException) as ctx:
                    await charge_credits("member-1", CreditAction.ANALYZE, dataset_id="dataset-1")
                self.assertEqual(ctx.exception.status_code, 402)
                detail = ctx.exception.detail
                assert isinstance(detail, dict)
                self.assertEqual(detail.get("code"), "insufficient_credits")

        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
