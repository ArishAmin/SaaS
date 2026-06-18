"""TTL cleanup timestamp encoding for PostgREST."""

from __future__ import annotations

import os
import sys
import unittest
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.worker.tasks_ttl_cleanup import _postgrest_ts  # noqa: E402


class TtlTimestampTests(unittest.TestCase):
    def test_postgrest_ts_uses_z_suffix_not_plus(self) -> None:
        dt = datetime(2026, 6, 20, 15, 30, 0, tzinfo=timezone.utc)
        ts = _postgrest_ts(dt)
        self.assertEqual(ts, "2026-06-20T15:30:00Z")
        self.assertNotIn("+", ts)
        self.assertNotIn(" ", ts)


if __name__ == "__main__":
    unittest.main()
