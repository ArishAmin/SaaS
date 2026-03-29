"""
Apply Supabase schema automatically without manual SQL copy/paste.

Usage:
  1) Set SUPABASE_DB_URL in environment.
  2) Run: python scripts/apply_supabase_schema.py

SUPABASE_DB_URL example:
  postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
"""

from __future__ import annotations

import os
from pathlib import Path

import psycopg


ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "supabase" / "schema.sql"


def main() -> None:
    db_url = os.getenv("SUPABASE_DB_URL")
    if not db_url:
        raise SystemExit(
            "Missing SUPABASE_DB_URL. Set it and rerun.\n"
            "Example:\n"
            "  set SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@.../postgres"
        )

    sql = SCHEMA_PATH.read_text(encoding="utf-8")
    with psycopg.connect(db_url, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(sql)

    print("Supabase schema applied successfully.")


if __name__ == "__main__":
    main()
