-- =============================================================================
-- Acutize — Add indexes on shared_reports for scalability
-- Safe to run multiple times (idempotent).
-- =============================================================================

create index if not exists shared_reports_user_id_idx on public.shared_reports(user_id);
create index if not exists shared_reports_dataset_id_idx on public.shared_reports(dataset_id);
create index if not exists shared_reports_created_at_idx on public.shared_reports(created_at desc);
