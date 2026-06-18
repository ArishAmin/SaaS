-- Operational hardening for processing_jobs: stale recovery, cancellation, concurrency locking.
-- Safe to run after 20260618120000_workspaces_atomic_jobs.sql.

-- Recover jobs stuck in running (worker crash, deploy, OOM).
create or replace function public.recover_stale_processing_jobs(
  p_timeout_minutes integer default 120
)
returns table(
  job_id uuid,
  organization_id uuid,
  user_id uuid,
  action text,
  credit_transaction_id uuid,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with stale as (
    update public.processing_jobs j
    set status = 'failed',
        error = 'Job timed out (worker may have crashed)',
        completed_at = now(),
        updated_at = now()
    where j.status = 'running'
      and j.started_at is not null
      and j.started_at < now() - make_interval(mins => greatest(p_timeout_minutes, 5))
    returning j.job_id, j.organization_id, j.user_id, j.action, j.credit_transaction_id
  )
  select
    s.job_id,
    s.organization_id,
    s.user_id,
    s.action,
    s.credit_transaction_id,
    'stale_timeout'::text as reason
  from stale s;
end;
$$;

-- Cancel a queued job (member of the workspace). Running jobs cannot be canceled safely.
create or replace function public.cancel_processing_job(
  p_job_id uuid,
  p_user_id uuid
)
returns table(canceled boolean, reason text, credit_transaction_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  job_row public.processing_jobs%rowtype;
begin
  select * into job_row
  from public.processing_jobs
  where job_id = p_job_id
  for update;

  if not found then
    canceled := false;
    reason := 'job_not_found';
    credit_transaction_id := null;
    return next;
    return;
  end if;

  if not exists (
    select 1 from public.organization_members
    where organization_id = job_row.organization_id
      and user_id = p_user_id
      and status = 'active'
  ) then
    canceled := false;
    reason := 'not_org_member';
    credit_transaction_id := null;
    return next;
    return;
  end if;

  if job_row.status <> 'queued' then
    canceled := false;
    reason := 'not_cancelable';
    credit_transaction_id := job_row.credit_transaction_id;
    return next;
    return;
  end if;

  update public.processing_jobs
  set status = 'canceled',
      error = 'Canceled by user',
      completed_at = now(),
      updated_at = now()
  where job_id = p_job_id;

  canceled := true;
  reason := 'canceled';
  credit_transaction_id := job_row.credit_transaction_id;
  return next;
end;
$$;

-- Lock organization row during claim and exclude stale running jobs from concurrency counts.
create or replace function public.try_start_processing_job(
  p_job_id uuid,
  p_worker_id text default null,
  p_stale_timeout_minutes integer default 120
)
returns table(started boolean, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  job_row public.processing_jobs%rowtype;
  org_row public.organizations%rowtype;
  org_limit integer;
  user_limit integer;
  org_running integer;
  user_running integer;
  stale_cutoff timestamptz;
begin
  stale_cutoff := now() - make_interval(mins => greatest(p_stale_timeout_minutes, 5));

  select * into job_row
  from public.processing_jobs
  where job_id = p_job_id
  for update;

  if not found then
    started := false;
    reason := 'job_not_found';
    return next;
    return;
  end if;

  if job_row.status = 'canceled' then
    started := false;
    reason := 'job_canceled';
    return next;
    return;
  end if;

  if job_row.status <> 'queued' then
    started := false;
    reason := 'job_not_queued';
    return next;
    return;
  end if;

  -- Serialize concurrency checks per organization.
  select * into org_row
  from public.organizations
  where organization_id = job_row.organization_id
  for update;

  if not found then
    started := false;
    reason := 'organization_not_found';
    return next;
    return;
  end if;

  org_limit := org_row.max_concurrent_jobs;
  user_limit := org_row.max_concurrent_jobs_per_user;

  select count(*) into org_running
  from public.processing_jobs
  where organization_id = job_row.organization_id
    and status = 'running'
    and (started_at is null or started_at >= stale_cutoff);

  select count(*) into user_running
  from public.processing_jobs
  where organization_id = job_row.organization_id
    and user_id = job_row.user_id
    and status = 'running'
    and (started_at is null or started_at >= stale_cutoff);

  if org_running >= org_limit then
    started := false;
    reason := 'organization_concurrency_limit';
    return next;
    return;
  end if;

  if user_running >= user_limit then
    started := false;
    reason := 'user_concurrency_limit';
    return next;
    return;
  end if;

  update public.processing_jobs
  set status = 'running',
      attempts = attempts + 1,
      started_at = now(),
      updated_at = now(),
      payload = payload || jsonb_build_object('worker_id', p_worker_id)
  where job_id = p_job_id;

  started := true;
  reason := 'started';
  return next;
end;
$$;

-- Ensure manually created workspaces get hobby concurrency defaults.
update public.organizations
set
  max_concurrent_jobs = 1,
  max_concurrent_jobs_per_user = 1
where plan = 'hobby'
  and max_concurrent_jobs is null;

update public.organizations
set max_concurrent_jobs = 2, max_concurrent_jobs_per_user = 1
where plan = 'pro'
  and (max_concurrent_jobs is null or max_concurrent_jobs < 2);

update public.organizations
set max_concurrent_jobs = 3, max_concurrent_jobs_per_user = 2
where plan = 'business'
  and (max_concurrent_jobs is null or max_concurrent_jobs < 3);

create index if not exists processing_jobs_running_started_idx
  on public.processing_jobs(organization_id, status, started_at)
  where status = 'running';
