-- Credit spend history + free tier one-time pack (no monthly reset on hobby)
--
-- Safe if profiles was created before subscription columns existed:
-- adds missing columns, then continues.

-- ---------------------------------------------------------------------------
-- 1) Ensure public.profiles has billing / credit columns
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists plan text default 'hobby',
  add column if not exists subscription_status text default 'inactive',
  add column if not exists current_period_end timestamptz,
  add column if not exists cancel_at_period_end boolean default false,
  add column if not exists credits_balance integer default 200,
  add column if not exists credits_period_end timestamptz,
  add column if not exists paddle_customer_id text,
  add column if not exists paddle_subscription_id text,
  add column if not exists paddle_portal_url text;

-- Backfill nulls for rows created before these columns existed
update public.profiles
set
  plan = coalesce(plan, 'hobby'),
  subscription_status = coalesce(subscription_status, 'inactive'),
  credits_balance = coalesce(credits_balance, 200)
where plan is null
   or subscription_status is null
   or credits_balance is null;

-- Stripe columns (optional cleanup if present from older migrations)
alter table public.profiles
  drop column if exists stripe_customer_id,
  drop column if exists stripe_subscription_id;

-- ---------------------------------------------------------------------------
-- 2) Credit transaction log
-- ---------------------------------------------------------------------------
create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  credits_delta integer not null,
  balance_after integer not null,
  dataset_id uuid,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_credit_transactions_user_created
  on public.credit_transactions (user_id, created_at desc);

alter table public.credit_transactions enable row level security;

drop policy if exists "credit_transactions_select_own" on public.credit_transactions;
create policy "credit_transactions_select_own" on public.credit_transactions
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3) Signup trigger: one-time 200 credits on free tier
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, plan, credits_balance, credits_period_end)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    'hobby',
    200,
    null
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name);
  return new;
end;
$$ language plpgsql security definer;

-- Free tier: one-time pack (no monthly refresh until upgrade)
update public.profiles
set credits_period_end = null
where coalesce(plan, 'hobby') = 'hobby'
  and coalesce(subscription_status, 'inactive') = 'inactive';
