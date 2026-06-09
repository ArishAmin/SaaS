-- Acutize: MVP schema + security policies
-- Run in Supabase SQL editor (or via migrations).

-- 1) Datasets table (one per uploaded file)
create table if not exists public.datasets (
  dataset_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,

  storage_path text not null,
  original_file_name text not null,
  original_extension text not null,
  mime_type text,

  status text not null default 'uploaded',
  analysis_json jsonb,
  error text,

  analyzed_at timestamptz,

  cleaned_storage_path text,
  cleaned_params jsonb,
  cleaned_target_column text,
  cleaned_at timestamptz,

  engineered_storage_path text,
  engineered_params jsonb,
  engineered_at timestamptz,

  quick_evaluation_json jsonb,
  quick_trained_at timestamptz,

  forecast_json jsonb,
  forecasted_at timestamptz,

  business_insights_json jsonb,
  business_insights_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_datasets_updated_at on public.datasets;
create trigger trg_datasets_updated_at
before update on public.datasets
for each row execute function public.set_updated_at();

alter table public.datasets enable row level security;

drop policy if exists "datasets_select_own" on public.datasets;
create policy "datasets_select_own"
on public.datasets
for select
using (auth.uid() = user_id);

drop policy if exists "datasets_insert_own" on public.datasets;
create policy "datasets_insert_own"
on public.datasets
for insert
with check (auth.uid() = user_id);

drop policy if exists "datasets_update_own" on public.datasets;
create policy "datasets_update_own"
on public.datasets
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- 2) Private Storage bucket for dataset files
-- Bucket id/name: "datasets"
insert into storage.buckets (id, name, public)
values ('datasets', 'datasets', false)
on conflict (id) do nothing;

-- Policies isolate objects by user_id folder: {user_id}/datasets/{dataset_id}/filename
-- Do NOT run `alter table storage.objects enable row level security;`
-- on hosted Supabase projects unless your role owns that table.
-- Storage RLS is managed by Supabase; we only define policies below.

drop policy if exists "datasets_objects_select_own" on storage.objects;
create policy "datasets_objects_select_own"
on storage.objects
for select
using (
  bucket_id = 'datasets'
  and auth.uid()::text = split_part(name, '/', 1)
);

drop policy if exists "datasets_objects_insert_own" on storage.objects;
create policy "datasets_objects_insert_own"
on storage.objects
for insert
with check (
  bucket_id = 'datasets'
  and auth.uid()::text = split_part(name, '/', 1)
);

drop policy if exists "datasets_objects_update_own" on storage.objects;
create policy "datasets_objects_update_own"
on storage.objects
for update
using (
  bucket_id = 'datasets'
  and auth.uid()::text = split_part(name, '/', 1)
)
with check (
  bucket_id = 'datasets'
  and auth.uid()::text = split_part(name, '/', 1)
);

drop policy if exists "datasets_objects_delete_own" on storage.objects;
create policy "datasets_objects_delete_own"
on storage.objects
for delete
using (
  bucket_id = 'datasets'
  and auth.uid()::text = split_part(name, '/', 1)
);

-- 3) Instant-preview training runs (one row per preview; full training is local Python export)
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

-- 3b) Pipeline audit events (append-only tracing)
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

alter table public.dataset_events enable row level security;

drop policy if exists "dataset_events_select_own" on public.dataset_events;
create policy "dataset_events_select_own"
on public.dataset_events for select using (auth.uid() = user_id);

drop policy if exists "dataset_events_insert_own" on public.dataset_events;
create policy "dataset_events_insert_own"
on public.dataset_events for insert with check (auth.uid() = user_id);

create index if not exists dataset_events_dataset_created_idx
  on public.dataset_events (dataset_id, created_at desc);

drop trigger if exists trg_training_runs_updated_at on public.training_runs;
create trigger trg_training_runs_updated_at
before update on public.training_runs
for each row execute function public.set_updated_at();

alter table public.training_runs enable row level security;

drop policy if exists "training_runs_select_own" on public.training_runs;
create policy "training_runs_select_own"
on public.training_runs
for select
using (auth.uid() = user_id);

drop policy if exists "training_runs_insert_own" on public.training_runs;
create policy "training_runs_insert_own"
on public.training_runs
for insert
with check (auth.uid() = user_id);

drop policy if exists "training_runs_update_own" on public.training_runs;
create policy "training_runs_update_own"
on public.training_runs
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- 4) Shareable reports (public read-only by token)
create table if not exists public.shared_reports (
  token uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  dataset_id uuid not null references public.datasets(dataset_id) on delete cascade,
  snapshot_json jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.shared_reports enable row level security;

-- Users can create their own shares
drop policy if exists "shared_reports_insert_own" on public.shared_reports;
create policy "shared_reports_insert_own"
on public.shared_reports
for insert
with check (auth.uid() = user_id);

-- Users can view their own shares
drop policy if exists "shared_reports_select_own" on public.shared_reports;
create policy "shared_reports_select_own"
on public.shared_reports
for select
using (auth.uid() = user_id);

-- Public read access is served via backend token endpoint (no direct anon select needed).

-- 5) Centralized application logs (ingested by backend via service role)
create table if not exists public.app_logs (
  log_id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  level text not null default 'info',
  event text not null,
  message text,
  method text,
  path text,
  status_code integer,
  duration_ms integer,
  request_id text,
  source text not null default 'api',
  action text,
  dataset_id uuid,
  session_id text,
  user_agent text,
  ip_hash text,
  path_template text,
  metadata jsonb,
  error jsonb,
  created_at timestamptz not null default now()
);

create index if not exists app_logs_created_at_idx on public.app_logs (created_at desc);
create index if not exists app_logs_event_idx on public.app_logs (event);
create index if not exists app_logs_user_id_idx on public.app_logs (user_id);
create index if not exists app_logs_request_id_idx on public.app_logs (request_id);
create index if not exists app_logs_source_created_at_idx on public.app_logs (source, created_at desc);
create index if not exists app_logs_action_created_at_idx on public.app_logs (action, created_at desc);
create index if not exists app_logs_dataset_id_created_at_idx on public.app_logs (dataset_id, created_at desc);
create index if not exists app_logs_session_id_created_at_idx on public.app_logs (session_id, created_at desc);
create index if not exists app_logs_status_created_at_idx on public.app_logs (status_code, created_at desc);
create index if not exists app_logs_path_template_created_at_idx on public.app_logs (path_template, created_at desc);

alter table public.app_logs enable row level security;

-- End users can only read their own logs.
drop policy if exists "app_logs_select_own" on public.app_logs;
create policy "app_logs_select_own"
on public.app_logs
for select
using (auth.uid() = user_id);
