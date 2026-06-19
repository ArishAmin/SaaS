-- Fix workspace credit spend for company teams: ensure owners are members, backfill rows, grant RPC access.

create or replace function public.ensure_organization_membership(
  p_organization_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  org_owner uuid;
begin
  select owner_user_id into org_owner
  from public.organizations
  where organization_id = p_organization_id;

  if org_owner is null or org_owner <> p_user_id then
    return;
  end if;

  insert into public.organization_members (organization_id, user_id, role, status)
  values (p_organization_id, p_user_id, 'owner', 'active')
  on conflict (organization_id, user_id) do update
    set role = 'owner', status = 'active', updated_at = now();
end;
$$;

-- Backfill owner rows for orgs created outside ensure_default_organization().
insert into public.organization_members (organization_id, user_id, role, status)
select o.organization_id, o.owner_user_id, 'owner', 'active'
from public.organizations o
where not exists (
  select 1
  from public.organization_members m
  where m.organization_id = o.organization_id
    and m.user_id = o.owner_user_id
    and m.status = 'active'
)
on conflict (organization_id, user_id) do update
  set role = 'owner', status = 'active', updated_at = now();

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

  perform public.ensure_organization_membership(p_organization_id, p_user_id);

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

grant execute on function public.ensure_organization_membership(uuid, uuid) to service_role, authenticated, anon;
grant execute on function public.spend_organization_credits(uuid, uuid, text, integer, uuid, text, jsonb) to service_role, authenticated, anon;
grant execute on function public.refund_organization_credits(uuid, uuid, text, integer, uuid, text, uuid) to service_role, authenticated, anon;
grant execute on function public.ensure_default_organization(uuid, text) to service_role, authenticated, anon;
grant execute on function public.accept_pending_organization_invitations(uuid, text) to service_role, authenticated, anon;
