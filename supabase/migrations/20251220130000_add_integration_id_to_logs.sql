alter table public.integration_logs 
add column if not exists integration_id uuid references public.integrations(id) on delete cascade;

create index if not exists idx_integration_logs_integration_id on public.integration_logs(integration_id);
