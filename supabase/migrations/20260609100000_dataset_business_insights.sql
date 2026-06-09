-- Persist the latest business-friendly EDA dashboard and insight summary for each dataset.
alter table public.datasets
  add column if not exists business_insights_json jsonb,
  add column if not exists business_insights_at timestamptz;

create index if not exists idx_datasets_business_insights_at
  on public.datasets (business_insights_at desc)
  where business_insights_at is not null;
