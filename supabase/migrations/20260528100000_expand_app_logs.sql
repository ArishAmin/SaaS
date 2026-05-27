-- Expanded operational logging for API/client troubleshooting.
-- Keeps existing columns and adds searchable trace fields.

alter table public.app_logs
  add column if not exists source text not null default 'api',
  add column if not exists action text,
  add column if not exists dataset_id uuid,
  add column if not exists session_id text,
  add column if not exists user_agent text,
  add column if not exists ip_hash text,
  add column if not exists path_template text;

create index if not exists app_logs_request_id_idx
  on public.app_logs (request_id);

create index if not exists app_logs_source_created_at_idx
  on public.app_logs (source, created_at desc);

create index if not exists app_logs_action_created_at_idx
  on public.app_logs (action, created_at desc);

create index if not exists app_logs_dataset_id_created_at_idx
  on public.app_logs (dataset_id, created_at desc);

create index if not exists app_logs_session_id_created_at_idx
  on public.app_logs (session_id, created_at desc);

create index if not exists app_logs_status_created_at_idx
  on public.app_logs (status_code, created_at desc);

create index if not exists app_logs_path_template_created_at_idx
  on public.app_logs (path_template, created_at desc);

-- Make PostgREST/Supabase REST notice newly added columns immediately.
notify pgrst, 'reload schema';
