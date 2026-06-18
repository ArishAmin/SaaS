-- Team workspaces, atomic workspace credits, idempotent charges, and job/concurrency tables.
-- Safe to run repeatedly on a live project before users arrive.

create table if not exists public.organizations (
  organization_id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  owner_user_id uuid not null references auth.users(id) on delete cascade,

  plan text not null default 'hobby',
  subscription_status text not null default 'inactive',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,

  credits_balance integer not null default 200,
  credits_monthly_quota integer not null default 200,
  credits_period_end timestamptz,

  paddle_customer_id text,
  paddle_subscription_id text,
  paddle_price_id text,
  paddle_portal_url text,
  billing_interval text,

  max_concurrent_jobs integer not null default 1,
  max_concurrent_jobs_per_user integer not null default 1,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_organizations_updated_at on public.organizations;
create trigger trg_organizations_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

alter table public.organizations enable row level security;

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(organization_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),
  invited_email text,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.organization_invitations (
  invitation_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(organization_id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid references auth.users(id) on delete set null,
  token uuid not null default gen_random_uuid(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, email, status)
);

drop trigger if exists trg_organization_invitations_updated_at on public.organization_invitations;
create trigger trg_organization_invitations_updated_at
before update on public.organization_invitations
for each row execute function public.set_updated_at();

alter table public.organization_invitations enable row level security;

drop trigger if exists trg_organization_members_updated_at on public.organization_members;
create trigger trg_organization_members_updated_at
before update on public.organization_members
for each row execute function public.set_updated_at();

alter table public.organization_members enable row level security;

alter table public.profiles
  add column if not exists active_organization_id uuid references public.organizations(organization_id) on delete set null;

alter table public.datasets
  add column if not exists organization_id uuid references public.organizations(organization_id) on delete cascade;

alter table public.training_runs
  add column if not exists organization_id uuid references public.organizations(organization_id) on delete cascade;

alter table public.dataset_events
  add column if not exists organization_id uuid references public.organizations(organization_id) on delete cascade;

alter table public.shared_reports
  add column if not exists organization_id uuid references public.organizations(organization_id) on delete cascade;

alter table public.credit_transactions
  add column if not exists organization_id uuid references public.organizations(organization_id) on delete cascade,
  add column if not exists idempotency_key text,
  add column if not exists refunded_transaction_id uuid references public.credit_transactions(id) on delete set null;

create unique index if not exists credit_transactions_org_idempotency_idx
  on public.credit_transactions (organization_id, idempotency_key)
  where organization_id is not null and idempotency_key is not null;

create index if not exists organizations_owner_idx on public.organizations(owner_user_id);
create index if not exists organization_members_user_idx on public.organization_members(user_id, status);
create index if not exists organization_invitations_email_idx on public.organization_invitations(email, status);
create index if not exists datasets_org_updated_idx on public.datasets(organization_id, updated_at desc);
create index if not exists training_runs_org_created_idx on public.training_runs(organization_id, created_at desc);
create index if not exists credit_transactions_org_created_idx on public.credit_transactions(organization_id, created_at desc);

create table if not exists public.processing_jobs (
  job_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(organization_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  dataset_id uuid references public.datasets(dataset_id) on delete cascade,
  action text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'canceled')),
  idempotency_key text,
  credit_transaction_id uuid references public.credit_transactions(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  result_json jsonb,
  error text,
  attempts integer not null default 0,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_processing_jobs_updated_at on public.processing_jobs;
create trigger trg_processing_jobs_updated_at
before update on public.processing_jobs
for each row execute function public.set_updated_at();

alter table public.processing_jobs enable row level security;

create unique index if not exists processing_jobs_org_idempotency_idx
  on public.processing_jobs (organization_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists processing_jobs_org_status_idx
  on public.processing_jobs(organization_id, status, queued_at);

create index if not exists processing_jobs_user_status_idx
  on public.processing_jobs(user_id, status, queued_at);

create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

drop policy if exists "organizations_select_member" on public.organizations;
create policy "organizations_select_member" on public.organizations
for select using (public.is_org_member(organization_id));

drop policy if exists "organizations_update_admin" on public.organizations;
create policy "organizations_update_admin" on public.organizations
for update using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id = organizations.organization_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  )
);

drop policy if exists "organization_members_select_member" on public.organization_members;
create policy "organization_members_select_member" on public.organization_members
for select using (public.is_org_member(organization_id));

drop policy if exists "organization_members_insert_admin" on public.organization_members;
create policy "organization_members_insert_admin" on public.organization_members
for insert with check (
  exists (
    select 1 from public.organization_members m
    where m.organization_id = organization_members.organization_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  )
);

drop policy if exists "organization_invitations_select_admin" on public.organization_invitations;
create policy "organization_invitations_select_admin" on public.organization_invitations
for select using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id = organization_invitations.organization_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  )
);

drop policy if exists "organization_invitations_insert_admin" on public.organization_invitations;
create policy "organization_invitations_insert_admin" on public.organization_invitations
for insert with check (
  exists (
    select 1 from public.organization_members m
    where m.organization_id = organization_invitations.organization_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  )
);

drop policy if exists "processing_jobs_select_member" on public.processing_jobs;
create policy "processing_jobs_select_member" on public.processing_jobs
for select using (public.is_org_member(organization_id));

create or replace function public.ensure_default_organization(p_user_id uuid, p_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  org_name text;
  p public.profiles%rowtype;
begin
  select * into p from public.profiles where id = p_user_id;

  select m.organization_id into org_id
  from public.organization_members m
  where m.user_id = p_user_id and m.status = 'active'
  order by m.created_at asc
  limit 1;

  if org_id is null then
    org_name := coalesce(nullif(trim(p_name), ''), coalesce(p.full_name, p.email, 'My Workspace'));

    insert into public.organizations (
      name,
      owner_user_id,
      plan,
      subscription_status,
      current_period_end,
      cancel_at_period_end,
      credits_balance,
      credits_monthly_quota,
      credits_period_end,
      paddle_customer_id,
      paddle_subscription_id,
      paddle_price_id,
      paddle_portal_url,
      billing_interval,
      max_concurrent_jobs,
      max_concurrent_jobs_per_user
    )
    values (
      org_name,
      p_user_id,
      coalesce(p.plan, 'hobby'),
      coalesce(p.subscription_status, 'inactive'),
      p.current_period_end,
      coalesce(p.cancel_at_period_end, false),
      coalesce(p.credits_balance, 200),
      coalesce(p.credits_monthly_quota, 200),
      p.credits_period_end,
      p.paddle_customer_id,
      p.paddle_subscription_id,
      p.paddle_price_id,
      p.paddle_portal_url,
      p.billing_interval,
      case when coalesce(p.plan, 'hobby') = 'business' then 3 when coalesce(p.plan, 'hobby') = 'pro' then 2 else 1 end,
      case when coalesce(p.plan, 'hobby') = 'business' then 2 else 1 end
    )
    returning organization_id into org_id;

    insert into public.organization_members (organization_id, user_id, role, status)
    values (org_id, p_user_id, 'owner', 'active')
    on conflict (organization_id, user_id) do update set role = 'owner', status = 'active';
  end if;

  update public.profiles
  set active_organization_id = coalesce(active_organization_id, org_id)
  where id = p_user_id;

  update public.datasets
  set organization_id = org_id
  where user_id = p_user_id and organization_id is null;

  update public.training_runs
  set organization_id = org_id
  where user_id = p_user_id and organization_id is null;

  update public.dataset_events
  set organization_id = org_id
  where user_id = p_user_id and organization_id is null;

  update public.shared_reports
  set organization_id = org_id
  where user_id = p_user_id and organization_id is null;

  update public.credit_transactions
  set organization_id = org_id
  where user_id = p_user_id and organization_id is null;

  return org_id;
end;
$$;

create or replace function public.spend_organization_credits(
  p_organization_id uuid,
  p_user_id uuid,
  p_action text,
  p_cost integer,
  p_dataset_id uuid default null,
  p_idempotency_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table(transaction_id uuid, balance_after integer, already_processed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  org_row public.organizations%rowtype;
  existing public.credit_transactions%rowtype;
  new_balance integer;
begin
  if p_cost <= 0 then
    transaction_id := null;
    select credits_balance into balance_after from public.organizations where organization_id = p_organization_id;
    already_processed := false;
    return next;
    return;
  end if;

  if not exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id
      and user_id = p_user_id
      and status = 'active'
  ) then
    raise exception 'not_org_member' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    select * into existing
    from public.credit_transactions
    where organization_id = p_organization_id
      and idempotency_key = p_idempotency_key
    limit 1;

    if found then
      transaction_id := existing.id;
      balance_after := existing.balance_after;
      already_processed := true;
      return next;
      return;
    end if;
  end if;

  select * into org_row
  from public.organizations
  where organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'organization_not_found' using errcode = 'P0002';
  end if;

  if org_row.credits_balance < p_cost then
    raise exception 'insufficient_credits:%:%', org_row.credits_balance, p_cost using errcode = 'P0001';
  end if;

  new_balance := org_row.credits_balance - p_cost;

  update public.organizations
  set credits_balance = new_balance, updated_at = now()
  where organization_id = p_organization_id;

  insert into public.credit_transactions (
    organization_id,
    user_id,
    action,
    credits_delta,
    balance_after,
    dataset_id,
    metadata,
    idempotency_key
  )
  values (
    p_organization_id,
    p_user_id,
    p_action,
    -p_cost,
    new_balance,
    p_dataset_id,
    coalesce(p_metadata, '{}'::jsonb),
    p_idempotency_key
  )
  returning id, balance_after into transaction_id, balance_after;

  already_processed := false;
  return next;
end;
$$;

create or replace function public.refund_organization_credits(
  p_organization_id uuid,
  p_user_id uuid,
  p_action text,
  p_credits integer,
  p_dataset_id uuid default null,
  p_reason text default 'action_failed',
  p_refunded_transaction_id uuid default null
)
returns table(transaction_id uuid, balance_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  org_row public.organizations%rowtype;
  new_balance integer;
begin
  if p_credits <= 0 then
    select credits_balance into balance_after from public.organizations where organization_id = p_organization_id;
    transaction_id := null;
    return next;
    return;
  end if;

  select * into org_row
  from public.organizations
  where organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'organization_not_found' using errcode = 'P0002';
  end if;

  new_balance := org_row.credits_balance + p_credits;

  update public.organizations
  set credits_balance = new_balance, updated_at = now()
  where organization_id = p_organization_id;

  insert into public.credit_transactions (
    organization_id,
    user_id,
    action,
    credits_delta,
    balance_after,
    dataset_id,
    metadata,
    refunded_transaction_id
  )
  values (
    p_organization_id,
    p_user_id,
    p_action || '_refund',
    p_credits,
    new_balance,
    p_dataset_id,
    jsonb_build_object('reason', p_reason),
    p_refunded_transaction_id
  )
  returning id, balance_after into transaction_id, balance_after;

  return next;
end;
$$;

create or replace function public.try_start_processing_job(
  p_job_id uuid,
  p_worker_id text default null
)
returns table(started boolean, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  job_row public.processing_jobs%rowtype;
  org_limit integer;
  user_limit integer;
  org_running integer;
  user_running integer;
begin
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

  if job_row.status <> 'queued' then
    started := false;
    reason := 'job_not_queued';
    return next;
    return;
  end if;

  select max_concurrent_jobs, max_concurrent_jobs_per_user
  into org_limit, user_limit
  from public.organizations
  where organization_id = job_row.organization_id;

  select count(*) into org_running
  from public.processing_jobs
  where organization_id = job_row.organization_id
    and status = 'running';

  select count(*) into user_running
  from public.processing_jobs
  where organization_id = job_row.organization_id
    and user_id = job_row.user_id
    and status = 'running';

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
