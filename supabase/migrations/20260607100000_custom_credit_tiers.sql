-- Store the monthly credit quota purchased by custom credit tiers.

alter table public.profiles
  add column if not exists credits_monthly_quota integer;

update public.profiles
set credits_monthly_quota = case
  when plan = 'business' then 2500
  when plan = 'pro' then 450
  else 60
end
where credits_monthly_quota is null;
