-- 1) Create the profiles table if it doesn't exist
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  
  -- Subscription tracking
  plan text not null default 'hobby' check (plan in ('hobby', 'pro', 'business')),
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text default 'inactive',
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) Enable RLS
alter table public.profiles enable row level security;

-- 3) Policies
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

-- 4) Trigger for set_updated_at
drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- 5) Trigger to automatically create a profile when a user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
