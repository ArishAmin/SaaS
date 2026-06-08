-- Persist the latest business-friendly forecast summary for each dataset.
alter table public.datasets
  add column if not exists forecast_json jsonb,
  add column if not exists forecasted_at timestamptz;

create index if not exists idx_datasets_forecasted_at
  on public.datasets (forecasted_at desc)
  where forecasted_at is not null;
