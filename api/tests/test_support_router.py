"""Tests for the public contact-support endpoint."""

from __future__ import annotations

import os
import sys
import unittest
from unittest.mock import AsyncMock, patch

from starlette.requests import Request

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.auth import get_optional_current_user  # noqa: E402
from app.routers.support import ContactRequest, contact_support  # noqa: E402


def make_request(headers: list[tuple[bytes, bytes]] | None = None) -> Request:
    return Request({"type": "http", "method": "POST", "path": "/support/contact", "headers": headers or []})


class OptionalAuthTests(unittest.IsolatedAsyncioTestCase):
    async def test_missing_authorization_is_allowed(self) -> None:
        self.assertIsNone(await get_optional_current_user(make_request()))


class ContactSupportTests(unittest.IsolatedAsyncioTestCase):
    async def test_guest_submission_sends_email(self) -> None:
        response = AsyncMock()
        response.status_code = 200
        client = AsyncMock()
        client.post.return_value = response
        context = AsyncMock()
        context.__aenter__.return_value = client

        payload = ContactRequest(
            firstName="Guest",
            lastName="User",
            email="guest@example.com",
            subject="support",
            message="Please help",
        )
        with (
            patch("app.routers.support.get_settings") as settings,
            patch("app.routers.support.httpx.AsyncClient", return_value=context),
        ):
            settings.return_value.resend_api_key = "test-key"
            result = await contact_support.__wrapped__(make_request(), payload, None)

        self.assertEqual(result, {"status": "ok"})
        sent_payload = client.post.call_args.kwargs["json"]
        self.assertIn("User ID:</strong> Guest", sent_payload["html"])


if __name__ == "__main__":
    unittest.main()
