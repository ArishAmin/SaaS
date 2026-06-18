"""Smoke test: jobs router imports workspace helpers."""

from __future__ import annotations

import inspect
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.routers import jobs as jobs_router  # noqa: E402


class JobsRouterImportTests(unittest.TestCase):
    def test_require_workspace_member_is_imported(self) -> None:
        source = inspect.getsource(jobs_router._get_job_for_user)
        self.assertIn("require_workspace_member", source)
        self.assertTrue(callable(jobs_router.require_workspace_member))


if __name__ == "__main__":
    unittest.main()
