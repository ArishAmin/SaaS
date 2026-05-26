-- Track the exact Paddle price and billing interval on profiles.
-- This lets the app block duplicate purchases of the same plan interval
-- while still allowing changes like Pro monthly -> Pro yearly.

alter table public.profiles
  add column if not exists paddle_price_id text,
  add column if not exists billing_interval text;

