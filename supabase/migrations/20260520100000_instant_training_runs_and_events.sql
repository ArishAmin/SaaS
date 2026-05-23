-- =============================================================================
-- Acutize — Combined migration
-- Instant-preview training_runs, pipeline tracing, export support
-- Safe to run multiple times (idempotent where possible).
-- Run in Supabase SQL Editor (or: supabase db push).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) datasets — ensure columns used by exports & instant preview
-- -----------------------------------------------------------------------------
alter table public.datasets
  add column if not exists analysis_json jsonb,
  add column if not exists analyzed_at timestamptz,
  add column if not exists cleaned_storage_path text,
  add column if not exists cleaned_params jsonb,
  add column if not exists cleaned_target_column text,
  add column if not exists cleaned_at timestamptz,
  add column if not exists engineered_storage_path text,
  add column if not exists engineered_params jsonb,
  add column if not exists engineered_at timestamptz,
  add column if not exists quick_evaluation_json jsonb,
  add column if not exists quick_trained_at timestamptz;

comment on column public.datasets.quick_evaluation_json is
  'Latest instant preview: models, metrics, best_model. Also copied into training_runs per run.';

comment on column public.datasets.quick_trained_at is
  'Timestamp of the most recent instant preview (see training_runs for full history).';

create index if not exists datasets_user_updated_idx
  on public.datasets (user_id, updated_at desc);

create index if not exists datasets_quick_trained_at_idx
  on public.datasets (quick_trained_at desc nulls last)
  where quick_trained_at is not null;

-- -----------------------------------------------------------------------------
-- 2) training_runs — instant preview only (remove legacy full-training mode)
-- -----------------------------------------------------------------------------
create table if not exists public.training_runs (
  run_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  dataset_id uuid not null references public.datasets(dataset_id) on delete cascade,
  status text not null default 'completed',
  results_json jsonb,
  error text,
  target_column text,
  data_source text,
  sample_rows integer,
  duration_ms integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Drop async full-training column (no longer used)
alter table public.training_runs drop column if exists mode;

-- Add tracing columns on existing projects
alter table public.training_runs
  add column if not exists target_column text,
  add column if not exists data_source text,
  add column if not exists sample_rows integer,
  add column if not exists duration_ms integer;

comment on table public.training_runs is
  'One row per instant-preview training run (synchronous). Full training is exported as a local Python script.';

comment on column public.training_runs.data_source is
  'Which file was used: engineered | cleaned | raw';

comment on column public.training_runs.sample_rows is
  'Row count after sampling (max 5000 or 5% of data).';

comment on column public.training_runs.duration_ms is
  'Server-side wall time for the preview run in milliseconds.';

-- Remove old full-mode rows if any (optional cleanup)
delete from public.training_runs where results_json->>'model_storage_path' is not null;

drop trigger if exists trg_training_runs_updated_at on public.training_runs;
create trigger trg_training_runs_updated_at
before update on public.training_runs
for each row execute function public.set_updated_at();

alter table public.training_runs enable row level security;

drop policy if exists "training_runs_select_own" on public.training_runs;
create policy "training_runs_select_own"
on public.training_runs for select
using (auth.uid() = user_id);

drop policy if exists "training_runs_insert_own" on public.training_runs;
create policy "training_runs_insert_own"
on public.training_runs for insert
with check (auth.uid() = user_id);

drop policy if exists "training_runs_update_own" on public.training_runs;
create policy "training_runs_update_own"
on public.training_runs for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists training_runs_dataset_created_idx
  on public.training_runs (dataset_id, created_at desc);

create index if not exists training_runs_user_created_idx
  on public.training_runs (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 3) dataset_events — pipeline audit trail (production tracing)
-- -----------------------------------------------------------------------------
create table if not exists public.dataset_events (
  event_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dataset_id uuid not null references public.datasets(dataset_id) on delete cascade,
  event_type text not null,
  status text not null default 'completed',
  metadata jsonb not null default '{}'::jsonb,
  error text,
  duration_ms integer,
  created_at timestamptz not null default now()
);

comment on table public.dataset_events is
  'Append-only audit log per dataset: upload, analyze, clean, features, train preview, export, etc.';

comment on column public.dataset_events.event_type is
  'e.g. train_instant_preview, clean_completed, export_bundle_downloaded';

alter table public.dataset_events enable row level security;

drop policy if exists "dataset_events_select_own" on public.dataset_events;
create policy "dataset_events_select_own"
on public.dataset_events for select
using (auth.uid() = user_id);

drop policy if exists "dataset_events_insert_own" on public.dataset_events;
create policy "dataset_events_insert_own"
on public.dataset_events for insert
with check (auth.uid() = user_id);

create index if not exists dataset_events_dataset_created_idx
  on public.dataset_events (dataset_id, created_at desc);

create index if not exists dataset_events_user_created_idx
  on public.dataset_events (user_id, created_at desc);

create index if not exists dataset_events_type_idx
  on public.dataset_events (event_type, created_at desc);

-- -----------------------------------------------------------------------------
-- 4) app_logs — optional index for export / activity analytics
-- -----------------------------------------------------------------------------
create index if not exists app_logs_user_activity_idx
  on public.app_logs (created_at desc)
  where event = 'user_activity';

-- -----------------------------------------------------------------------------
-- 5) Service role: API inserts training_runs & dataset_events via service key
--    (bypasses RLS). No extra policy needed for backend.
-- -----------------------------------------------------------------------------
