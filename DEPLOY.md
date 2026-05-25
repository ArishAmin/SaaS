# Acutize — Deploy on Render (Blueprint)

Deploy with the **root** `render.yaml` only. The file `api/render.yaml` is outdated (typo service name, Postgres reference) — do not use it for Blueprint.

## Architecture (cost-optimized)

| Service | Role | Default plan | ~Monthly |
|--------|------|--------------|----------|
| `acutize-api` | FastAPI (analyze, clean, features, instant preview, export) | Starter | $7 |
| `acutize-web` | Next.js dashboard | Starter | $7 |
| `acutize-redis` | Rate-limit storage for API | Free → Starter if needed | $0 → $10 |
| **Supabase** (external) | Auth, Postgres, file storage | Free → Pro | $0 → $25 |

**Not deployed:** Celery worker. Full model training is exported for the user’s machine (`train_full_model.py`). Background TTL cleanup is disabled by default (`TTL_CLEANUP_ENABLED=false`).

### Typical monthly stack cost

| Stage | Render compute | Render workspace | Supabase | **Total fixed** |
|-------|----------------|------------------|----------|-----------------|
| Launch (Hobby workspace) | ~$14 | $0 | $0 (Free) | **~$14** |
| Production (Pro workspace, no cold starts) | ~$14 | $25 | $25 (Pro) | **~$64** |
| Scale (Standard API 2GB RAM) | ~$39 | $25 | $25+ | **~$89+** |

Add Paddle fees (~5% + $0.50 per transaction, varies by region) and OpenAI usage if you enable the assistant.

---

## Prerequisites

1. [Render](https://render.com/) account  
2. [Supabase](https://supabase.com/) project (Auth + DB + Storage bucket `datasets`)  
3. [Paddle](https://www.paddle.com/) catalog: recurring prices for **Pro ($25/mo)** and **Business ($70/mo)**  
4. Git repo connected to Render  

---

## Step 1: Commit the blueprint

```bash
git add render.yaml DEPLOY.md
git commit -m "chore: render blueprint for api, web, redis"
git push
```

## Step 2: Create Blueprint instance

1. [Render Dashboard](https://dashboard.render.com/) → **Blueprints** → **New Blueprint Instance**  
2. Select the `acutizeAI` repo  
3. Approve the detected `render.yaml`  

## Step 3: Environment variables

Set when prompted (or in each service → **Environment**):

### API (`acutize-api`)

| Variable | Required | Notes |
|----------|----------|--------|
| `SUPABASE_URL` | Yes | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role (secret) |
| `SUPABASE_JWKS_URL` | Yes | Usually `{SUPABASE_URL}/auth/v1/.well-known/jwks.json` |
| `PADDLE_API_KEY` | If billing on | Paddle Billing API secret key |
| `PADDLE_WEBHOOK_SECRET` | If billing on | Notification destination secret |
| `PADDLE_ENVIRONMENT` | Yes | `sandbox` or `production` |
| `PADDLE_PRICE_ID_PRO` | If billing on | Paddle Price ID for $25/mo Pro |
| `PADDLE_PRICE_ID_PRO_YEARLY` | If billing on | Paddle Price ID for $249/yr Pro (17% off) |
| `PADDLE_PRICE_ID_BUSINESS` | If billing on | Paddle Price ID for $70/mo Business |
| `PADDLE_PRICE_ID_BUSINESS_YEARLY` | If billing on | Paddle Price ID for $697/yr Business (17% off) |
| `PADDLE_CHECKOUT_URL` | Optional | Leave blank to use Paddle's default payment link; if set, use an approved checkout/payment-link page, not the post-payment dashboard URL |
| `APP_PUBLIC_URL` | Yes | Your live web URL, e.g. `https://acutize-web.onrender.com` |
| `BILLING_ENFORCEMENT_ENABLED` | Prod | Blueprint sets `true` (real limits + credits) |
| `ALLOWED_ORIGINS` | Prod | Your web URL only, e.g. `https://acutize-web.onrender.com` (CORS) |
| `APP_ENV` | Prod | Blueprint sets `production` (generic errors, HSTS) |
| `OPENAI_API_KEY` | Optional | Feature suggestions / assistant |
| `SUPABASE_LOG_ENABLED` | Optional | Set `false` to skip writing `app_logs` rows (saves DB writes) |

`REDIS_URL` is wired automatically from `acutize-redis`.

### Web (`acutize-web`)

| Variable | Required | Notes |
|----------|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Same as API Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Anon key |
| `NEXT_PUBLIC_API_BASE_URL` | Yes | `https://acutize-api.onrender.com` (after API deploys) |
| `NEXT_PUBLIC_BILLING_ENFORCEMENT_ENABLED` | Prod | Blueprint sets `true` (must match API) |
| `NEXT_PUBLIC_PADDLE_ENVIRONMENT` | If billing on | `sandbox` for test checkouts, `production` for live |
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | If billing on | Paddle client-side token; sandbox tokens start with `test_`, live tokens start with `live_` |

After the API URL is live, update `NEXT_PUBLIC_API_BASE_URL` and redeploy the web service.

### Paddle sandbox → production (when you go live)

Keep the same env var **names**. Only change values:

1. `PADDLE_ENVIRONMENT` → `production`
2. Replace `PADDLE_API_KEY` and `PADDLE_WEBHOOK_SECRET` with live dashboard values
3. Replace all four `PADDLE_PRICE_ID_*` with production catalog price IDs
4. Re-register webhook URL on the **live** Paddle notification destination

With `PADDLE_ENVIRONMENT=sandbox` and sandbox keys, the site behaves like production (limits, credits, checkout) — payments are test-only until you swap credentials.

## Step 4: Supabase

1. Run migrations under `supabase/migrations/` in order. If signup shows “database error saving new user”, run `supabase/fix_signup_run_in_sql_editor.sql` once in the SQL Editor (starter `profiles` tables often require `email` + `username` on insert).  
2. Create storage bucket **`datasets`** (private)  
3. Configure Auth redirect URLs for your Render web URL  

## Step 5: Paddle webhooks (production)

1. In Paddle → **Developer tools** → **Notifications**, add destination: `https://<acutize-api>/billing/webhook`  
2. Subscribe to: `subscription.activated`, `subscription.updated`, `subscription.canceled`, `transaction.completed`  
3. Copy the endpoint secret into `PADDLE_WEBHOOK_SECRET`  

Run Supabase migration `20260521100000_paddle_credits.sql` for credits + Paddle columns on `profiles`.

## Step 6: Verify

- `https://<acutize-api>/health` → `{"status":"ok"}`  
- Sign up / login on web  
- Upload → clean → features → save → instant preview  

---

## Scaling & upgrades

- **API slow on large CSVs:** bump `acutize-api` to **Standard** ($25/mo, 2 GB RAM). Uvicorn uses `--workers 4` by default in the Blueprint for concurrency.
- **Redis evictions / rate limits flaky:** set `acutize-redis` to **Starter** ($10/mo). Connection pooling is used to stay within the 20 connection limit on the free tier.
- **Cold starts on free workspace:** use Render **Pro** workspace ($25/mo) or upgrade service plans.  
- **TTL cleanup:** A Render **Cron Job** is included in the Blueprint. It calls `/admin/cleanup-ttl` hourly using `ADMIN_CLEANUP_TOKEN`.

---

## Local vs production

Local dev can use `BILLING_ENFORCEMENT_ENABLED=false` and Redis optional (API falls back to in-memory rate limits). Production blueprint sets enforcement to `true`.
