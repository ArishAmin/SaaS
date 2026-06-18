-- Auto-accept pending company invitations when a user signs up or logs in with a matching email.
-- The organization owner (payer) keeps the owner role; invited users join as admin/member only.

create or replace function public.accept_pending_organization_invitations(
  p_user_id uuid,
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv record;
  joined_org_id uuid := null;
  normalized_email text := lower(trim(coalesce(p_email, '')));
begin
  if normalized_email = '' then
    return null;
  end if;

  for inv in
    select invitation_id, organization_id, role, email, invited_by
    from public.organization_invitations
    where lower(email) = normalized_email
      and status = 'pending'
      and expires_at > now()
    order by created_at desc
  loop
    insert into public.organization_members (
      organization_id,
      user_id,
      role,
      status,
      invited_email,
      invited_by
    )
    values (
      inv.organization_id,
      p_user_id,
      inv.role,
      'active',
      inv.email,
      inv.invited_by
    )
    on conflict (organization_id, user_id) do update
      set
        role = excluded.role,
        status = 'active',
        invited_email = excluded.invited_email,
        invited_by = excluded.invited_by,
        updated_at = now();

    update public.organization_invitations
    set status = 'accepted', updated_at = now()
    where invitation_id = inv.invitation_id;

    joined_org_id := inv.organization_id;
  end loop;

  if joined_org_id is not null then
    update public.profiles
    set active_organization_id = joined_org_id
    where id = p_user_id;
  end if;

  return joined_org_id;
end;
$$;

-- Extend signup so invited teammates join their company workspace immediately.
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
    credits_monthly_quota,
    credits_period_end
  )
  values (
    new.id,
    v_email,
    v_username,
    v_full_name,
    'hobby',
    200,
    200,
    null
  )
  on conflict (id) do update set
    email = excluded.email,
    username = coalesce(public.profiles.username, excluded.username),
    full_name = coalesce(excluded.full_name, public.profiles.full_name);

  perform public.accept_pending_organization_invitations(new.id, v_email);

  return new;
end;
$$;
