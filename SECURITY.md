# Acutize — Security posture

This document describes how the app is hardened for production and what you should verify before go-live.

## Authentication & authorization

- **Supabase JWT**: API routes use `get_current_user`; tokens are verified against Supabase JWKS (`SUPABASE_JWKS_URL`).
- **Row-level ownership**: Dataset and training endpoints compare `dataset.user_id` to the authenticated user; mismatches return **403**.
- **Service role**: Backend uses `SUPABASE_SERVICE_ROLE_KEY` only on the server — never exposed to the browser.

## Billing & abuse

- **Paddle webhooks**: Signature verified with `PADDLE_WEBHOOK_SECRET` before applying subscription or credit changes.
- **Credits**: Paid actions call `require_credits`; insufficient balance returns **402** with a structured code for the UI.
- **Rate limiting**: SlowAPI + Redis (`REDIS_URL`) on sensitive dataset routes.

## Data handling (memory & cost)

- **Plan file caps**: Free 10 MB, Pro **30 MB**, Business **75 MB** — enforced on upload and before parsing (`enforce_file_size`).
- **Row caps**: Free tier pipeline steps use **20,000 rows** (`nrows` on CSV/Excel reads). Pro/Business use up to **100,000 rows** per pipeline step.
- **Model training**: Free tier trains on a **20,000-row** random sample (`sample_for_preview`). Paid plans train on a **100,000-row** sample to bound RAM and CPU.
- **Column cap**: 200 columns max on ingest.

## Transport & headers

- **API** (`SecurityHeadersMiddleware`): `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`; **HSTS** when `APP_ENV=production`.
- **Web** (`next.config.ts`): Same baseline headers on all routes.
- **CORS**: `ALLOWED_ORIGINS` (comma-separated). Localhost is appended only when `APP_ENV != production`.

## Error disclosure

- **Production** (`APP_ENV=production`): Generic 500 messages; exception types and stack traces are not returned to clients. Details are logged server-side with a `request_id`.

## Secrets & configuration

- Do not commit `.env` files. Use Render/Supabase dashboard for secrets.
- Set `PADDLE_ENVIRONMENT=production` and production price IDs before charging real customers.
- Set `ALLOWED_ORIGINS` to your exact web origin(s), e.g. `https://app.acutize.ai`.
- Keep `BILLING_ENFORCEMENT_ENABLED=true` in production (`render.yaml` does this).

## Pre-launch checklist

- [ ] `APP_ENV=production` on API
- [ ] `ALLOWED_ORIGINS` matches your deployed web URL
- [ ] `NEXT_PUBLIC_API_BASE_URL` points to HTTPS API
- [ ] Supabase RLS policies enabled on `profiles`, `datasets`, and related tables
- [ ] Paddle webhook URL registered and secret matches
- [ ] Redis reachable from API (rate limits)
- [ ] No test-only UI paths (dev plan overlay removed from `/profiles/me`)

## What we did not automate

- Penetration testing or formal SOC2 — recommended as you scale.
- WAF / DDoS — use Render/Cloudflare if needed.
- Dependency scanning — run `pip audit` / `npm audit` in CI periodically.
