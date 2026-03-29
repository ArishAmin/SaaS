# Supabase Schema Automation

Use this command instead of manually copy/pasting SQL into the Supabase SQL editor.

## 1) Install dependencies

From `api/` venv:

`pip install -r requirements.txt`

## 2) Set DB URL

Set `SUPABASE_DB_URL` to your Supabase Postgres connection string.

PowerShell example:

`$env:SUPABASE_DB_URL="postgresql://postgres.<project-ref>:<password>@<host>:6543/postgres"`

## 3) Apply schema

From repo root:

`python scripts/apply_supabase_schema.py`

This applies `supabase/schema.sql` automatically.
