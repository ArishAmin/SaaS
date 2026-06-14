-- Fix Google/email signup: profiles table was created without `email`, but
-- handle_new_user() inserts into profiles.email (Supabase auth error:
-- "Database error saving new user").

alter table public.profiles
  add column if not exists email text;

-- Backfill from auth.users for any rows created before this migration
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id
  and (p.email is null or p.email = '');

-- Remove orphan profile rows that cannot be linked to auth.users
delete from public.profiles p
where p.email is null
  and not exists (select 1 from auth.users u where u.id = p.id);

-- Enforce uniqueness + NOT NULL (safe when table is empty or fully backfilled)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_email_key'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_email_key unique (email);
  end if;
exception
  when duplicate_object then null;
end $$;

alter table public.profiles
  alter column email set not null;

-- Robust signup trigger (Google uses `name` in metadata, not always `full_name`)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_full_name text;
begin
  v_email := coalesce(
    new.email,
    new.raw_user_meta_data->>'email'
  );
  v_full_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    nullif(split_part(v_email, '@', 1), '')
  );

  insert into public.profiles (id, email, full_name, plan, credits_balance, credits_period_end)
  values (
    new.id,
    v_email,
    v_full_name,
    'hobby',
    200,
    null
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
