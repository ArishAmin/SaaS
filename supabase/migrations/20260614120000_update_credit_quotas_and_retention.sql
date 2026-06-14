-- Update credit quotas for the June 2026 credit model.
-- Free: 200 one-time credits. Pro: 500 monthly credits. Business remains 2,500 monthly credits.

alter table public.profiles
  alter column credits_balance set default 200;

update public.profiles
set
  credits_monthly_quota = 200,
  credits_balance = case
    when credits_balance = 60 then 200
    else credits_balance
  end,
  updated_at = now()
where plan = 'hobby'
  and (
    credits_monthly_quota is null
    or credits_monthly_quota = 60
    or credits_balance = 60
  );

update public.profiles
set
  credits_monthly_quota = 500,
  credits_balance = case
    when credits_balance = 450 then 500
    else credits_balance
  end,
  updated_at = now()
where plan = 'pro'
  and (
    credits_monthly_quota is null
    or credits_monthly_quota = 450
    or credits_balance = 450
  );

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (
    id,
    email,
    full_name,
    plan,
    credits_balance,
    credits_monthly_quota,
    credits_period_end
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    'hobby',
    200,
    200,
    null
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;
