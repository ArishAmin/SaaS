-- Paddle billing + monthly credits (replaces Stripe columns on profiles)

alter table public.profiles
  add column if not exists credits_balance integer not null default 200,
  add column if not exists credits_period_end timestamptz,
  add column if not exists paddle_customer_id text,
  add column if not exists paddle_subscription_id text,
  add column if not exists paddle_portal_url text;

-- Migrate away from Stripe (keep columns nullable for existing rows; app uses Paddle only)
alter table public.profiles
  drop column if exists stripe_customer_id,
  drop column if exists stripe_subscription_id;

-- New signups: hobby credits + billing period
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
  );
  return new;
end;
$$ language plpgsql security definer;
