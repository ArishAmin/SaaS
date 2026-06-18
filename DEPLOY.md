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
3. [Paddle](https://www.paddle.com/) catalog: recurring prices for **Pro ($25/mo)**, **Business ($70/mo)**, and any custom credit tiers you want to sell directly  
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
| `PADDLE_ENVIRONMENT` | Yes | Production blueprint sets `production`; use `sandbox` only in separate test services |
| `PADDLE_PRICE_ID_PRO` | If billing on | Paddle Price ID for $25/mo Pro |
| `PADDLE_PRICE_ID_PRO_YEARLY` | If billing on | Paddle Price ID for $249/yr Pro (17% off) |
| `PADDLE_PRICE_ID_BUSINESS` | If billing on | Paddle Price ID for $70/mo Business |
| `PADDLE_PRICE_ID_BUSINESS_YEARLY` | If billing on | Paddle Price ID for $697/yr Business (17% off) |
| `PADDLE_CUSTOM_CREDIT_PRICE_IDS` | If custom tiers are live | JSON mapping for custom tiers, e.g. `{"5000":{"monthly":"pri_x","yearly":"pri_y"},"10000":{"monthly":"pri_x","yearly":"pri_y"}}` |
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
| `NEXT_PUBLIC_PADDLE_ENVIRONMENT` | If billing on | Production blueprint sets `production`; use `sandbox` only in separate test services |
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | If billing on | Live Paddle client-side token for production; sandbox tokens are only for separate test services |

After the API URL is live, update `NEXT_PUBLIC_API_BASE_URL` and redeploy the web service.

### Paddle production checklist

The root `render.yaml` is production-oriented. Keep these values live on Render:

1. `PADDLE_ENVIRONMENT=production`
2. `NEXT_PUBLIC_PADDLE_ENVIRONMENT=production`
3. Use live `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, and `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`
4. Use production catalog price IDs for all `PADDLE_PRICE_ID_*` values
5. Use production custom tier price IDs in `PADDLE_CUSTOM_CREDIT_PRICE_IDS`
6. Register the webhook URL on the **live** Paddle notification destination

Do not point the production Render services at sandbox Paddle values. If you need sandbox billing tests, create separate test services or a separate Render blueprint so production env vars are not overwritten on deploy.

## Step 4: Supabase

1. Run migrations under `supabase/migrations/` in order. If signup shows “database error saving new user”, run `supabase/fix_signup_run_in_sql_editor.sql` once in the SQL Editor (starter `profiles` tables often require `email` + `username` on insert).  
2. Create storage bucket **`datasets`** (private)  
3. Configure Auth redirect URLs for your Render web URL  

## Step 5: Paddle webhooks (production)

1. In Paddle → **Developer tools** → **Notifications**, add destination: `https://<acutize-api>/billing/webhook`  
2. Subscribe to: `subscription.activated`, `subscription.updated`, `subscription.canceled`, `transaction.completed`  
3. Copy the endpoint secret into `PADDLE_WEBHOOK_SECRET`  

Run Supabase migration `20260521100000_paddle_credits.sql` for credits + Paddle columns on `profiles`.

## Team workspace + scaling readiness

Run the latest workspace migration before inviting companies:

```sql
-- Supabase SQL editor
-- Run: supabase/migrations/20260618120000_workspaces_atomic_jobs.sql
```

What this enables:

- One default workspace per user, so solo users keep working.
- Company workspaces with members and pending invitations.
- Workspace-owned billing, credits, datasets, job records, and usage history.
- Atomic workspace credit spending through Postgres RPCs.
- Idempotency keys for credit-consuming API requests.
- Queue/concurrency tables for background dataset processing.

Important rollout note: `BACKGROUND_JOBS_ENABLED` should be `true` only when the `acutize-worker` service is deployed and healthy. If the worker is suspended, set it back to `false` or heavy actions will remain queued.

### Render worker and cost

The root `render.yaml` now includes `acutize-worker`.

- Creating/deploying this worker is a paid always-running service on Render.
- If you want zero extra worker cost while there are no users, do not create the worker service yet, or suspend it until you are ready.
- Before company traffic, enable the worker and upgrade Redis from Free to at least Starter.
- The worker starts on the Render **Starter** plan by default. Upgrade its plan in Render later when CPU/RAM demand grows.
- `WORKER_CONCURRENCY` controls how many jobs one worker instance runs at once. Keep this at `1` for CPU/RAM-heavy Pandas/sklearn work unless load tests prove the instance has room.
- `WEB_CONCURRENCY` controls Uvicorn worker processes for the API. Raise it from Render env vars after upgrading API RAM/CPU.

Recommended launch path:

1. Keep `BACKGROUND_JOBS_ENABLED=true` when the worker service is deployed.
2. Run the workspace migration.
3. Deploy API + web.
4. Create the worker service only when you start migrating heavy actions to queued jobs.
5. Before paid company onboarding, enable worker(s), upgrade Redis, and load test.

### Render autoscaling

Render supports manual scaling on all workspaces. Autoscaling requires a Pro workspace or higher. For autoscaling, configure each service in Render Dashboard -> service -> Scaling:

- API web service: min 1, max 3 to start, CPU target around 60-70%.
- Worker service: start manual at 1 worker; scale workers carefully because each worker runs CPU-heavy Pandas/sklearn jobs.
- Redis: upgrade before scaling workers.

Autoscaling changes instance count, not instance size. Heavy dataset jobs may still need vertical upgrades for RAM/CPU.

### Render-only tuning checklist

After this deployment, these changes should not require code edits:

- Upgrade API instance type: Render service -> Settings -> Instance type.
- Change API process count: Render API env var `WEB_CONCURRENCY`.
- Increase/decrease API instances: Render service -> Scaling.
- Enable API autoscaling: Render service -> Scaling, Pro workspace or higher.
- Upgrade web instance type: Render web service -> Settings.
- Upgrade worker instance type: Render worker -> Settings.
- Change worker process concurrency: Render worker env var `WORKER_CONCURRENCY`.
- Increase/decrease worker instances: Render worker -> Scaling.
- Enable worker autoscaling: Render worker -> Scaling, Pro workspace or higher.
- Upgrade Redis: Render Key Value service -> plan.
- Increase queued job protection: Render API env var `MAX_QUEUED_JOBS_PER_WORKSPACE`.

Use code changes only when adding new product behavior or when moving another heavy workflow into the background worker. Infra capacity should be Render-side tuning.

### Load testing

Use `api/load_test_flows.py` after creating a test account and uploading one or more datasets:

```powershell
$env:LOADTEST_API_URL="https://your-api.onrender.com"
$env:LOADTEST_ACCESS_TOKEN="<supabase-access-token>"
$env:LOADTEST_DATASET_IDS="<dataset-id-1>,<dataset-id-2>"
$env:LOADTEST_CONCURRENCY="25"
$env:LOADTEST_ROUNDS="3"
python api/load_test_flows.py
```

Run this before marketing heavily, then repeat after every scaling change. Watch Render CPU/memory, Supabase API/database usage, `/admin/scaling-health`, and credit transaction history.

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
