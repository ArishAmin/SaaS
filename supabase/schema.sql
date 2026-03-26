-- DataPilot AI: MVP schema + security policies
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

create policy "datasets_select_own"
on public.datasets
for select
using (auth.uid() = user_id);

create policy "datasets_insert_own"
on public.datasets
for insert
with check (auth.uid() = user_id);

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
alter table storage.objects enable row level security;

create policy "datasets_objects_select_own"
on storage.objects
for select
using (
  bucket_id = 'datasets'
  and auth.uid()::text = split_part(name, '/', 1)
);

create policy "datasets_objects_insert_own"
on storage.objects
for insert
with check (
  bucket_id = 'datasets'
  and auth.uid()::text = split_part(name, '/', 1)
);

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

create policy "datasets_objects_delete_own"
on storage.objects
for delete
using (
  bucket_id = 'datasets'
  and auth.uid()::text = split_part(name, '/', 1)
);

-- 3) Async training runs table
create table if not exists public.training_runs (
  run_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  dataset_id uuid not null references public.datasets(dataset_id) on delete cascade,

  mode text not null, -- 'full'
  status text not null default 'queued', -- queued/running/completed/failed

  results_json jsonb,
  error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_training_runs_updated_at on public.training_runs;
create trigger trg_training_runs_updated_at
before update on public.training_runs
for each row execute function public.set_updated_at();

alter table public.training_runs enable row level security;

create policy "training_runs_select_own"
on public.training_runs
for select
using (auth.uid() = user_id);

create policy "training_runs_insert_own"
on public.training_runs
for insert
with check (auth.uid() = user_id);

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
create policy "shared_reports_insert_own"
on public.shared_reports
for insert
with check (auth.uid() = user_id);

-- Users can view their own shares
create policy "shared_reports_select_own"
on public.shared_reports
for select
using (auth.uid() = user_id);

-- Public read access is served via backend token endpoint (no direct anon select needed).

