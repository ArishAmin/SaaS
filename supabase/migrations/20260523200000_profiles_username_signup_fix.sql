-- Signup still fails when profiles.username is NOT NULL (Supabase starter schema)
-- but handle_new_user() did not populate username.

create or replace function public.generate_unique_username(base text, uid uuid)
returns text
language plpgsql
as $$
declare
  cleaned text;
  candidate text;
  suffix int := 0;
begin
  cleaned := lower(regexp_replace(coalesce(nullif(trim(base), ''), 'user'), '[^a-z0-9_]', '', 'g'));
  if cleaned = '' then
    cleaned := 'user';
  end if;
  cleaned := left(cleaned, 24);
  candidate := cleaned;

  loop
    if not exists (
      select 1
      from public.profiles p
      where p.username = candidate
        and p.id <> uid
    ) then
      return candidate;
    end if;
    suffix := suffix + 1;
    candidate := left(cleaned, 20) || '_' || suffix::text;
  end loop;
end;
$$;

-- Backfill any existing rows missing username
update public.profiles p
set username = public.generate_unique_username(
  coalesce(
    nullif(split_part(p.email, '@', 1), ''),
    'user_' || substr(replace(p.id::text, '-', ''), 1, 8)
  ),
  p.id
)
where p.username is null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_full_name text;
  v_username text;
begin
  v_email := coalesce(new.email, new.raw_user_meta_data->>'email');
  if v_email is null then
    raise exception 'handle_new_user: missing email for user %', new.id;
  end if;

  v_full_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    nullif(split_part(v_email, '@', 1), '')
  );

  v_username := public.generate_unique_username(
    coalesce(
      new.raw_user_meta_data->>'user_name',
      new.raw_user_meta_data->>'preferred_username',
      split_part(v_email, '@', 1),
      'user_' || substr(replace(new.id::text, '-', ''), 1, 8)
    ),
    new.id
  );

  insert into public.profiles (
    id,
    email,
    username,
    full_name,
    plan,
    credits_balance,
    credits_period_end
  )
  values (
    new.id,
    v_email,
    v_username,
    v_full_name,
    'hobby',
    200,
    null
  )
  on conflict (id) do update set
    email = excluded.email,
    username = coalesce(public.profiles.username, excluded.username),
    full_name = coalesce(excluded.full_name, public.profiles.full_name);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
