-- Marketing workflow production hardening: RLS, NPS persistence, and flow execution trigger.

create extension if not exists pg_net with schema extensions;

create or replace function public.current_user_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role(), '') in (
    'admin', 'manager', 'reservations', 'marketing', 'faturamento', 'reception', 'finance',
    'eventos', 'restaurant', 'housekeeping', 'maintenance'
  );
$$;

grant execute on function public.current_user_is_staff() to authenticated, service_role;

create table if not exists public.marketing_flow_executions (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid references public.marketing_flows(id) on delete set null,
  contact_id uuid references public.marketing_contacts(id) on delete cascade,
  message_id uuid references public.inbox_messages(id) on delete set null,
  status text not null default 'started' check (status in ('started','completed','skipped','failed')),
  details jsonb not null default '{}',
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_marketing_flow_executions_flow
  on public.marketing_flow_executions(flow_id, created_at desc);
create index if not exists idx_marketing_flow_executions_contact
  on public.marketing_flow_executions(contact_id, created_at desc);

create table if not exists public.nps_responses (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.marketing_contacts(id) on delete set null,
  reservation_id uuid references public.reservations(id) on delete set null,
  guest_name text,
  channel text not null default 'email',
  score integer check (score between 0 and 10),
  comment text,
  sent_at timestamptz not null default now(),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique(reservation_id)
);

create index if not exists idx_nps_responses_sent
  on public.nps_responses(sent_at desc);
create index if not exists idx_nps_responses_responded
  on public.nps_responses(responded_at desc);

alter table public.marketing_flow_executions enable row level security;
alter table public.nps_responses enable row level security;

drop policy if exists "auth read templates" on public.marketing_templates;
drop policy if exists "auth write templates" on public.marketing_templates;
drop policy if exists "auth read campaigns" on public.marketing_campaigns;
drop policy if exists "auth write campaigns" on public.marketing_campaigns;
drop policy if exists "auth read sends" on public.marketing_campaign_sends;
drop policy if exists "auth write sends" on public.marketing_campaign_sends;
drop policy if exists "auth read flows" on public.marketing_flows;
drop policy if exists "auth write flows" on public.marketing_flows;

create policy marketing_templates_select_staff
  on public.marketing_templates for select to authenticated
  using (public.current_user_is_staff());
create policy marketing_templates_manage_staff
  on public.marketing_templates for all to authenticated
  using (public.current_user_is_staff())
  with check (public.current_user_is_staff());

create policy marketing_campaigns_select_staff
  on public.marketing_campaigns for select to authenticated
  using (public.current_user_is_staff());
create policy marketing_campaigns_manage_staff
  on public.marketing_campaigns for all to authenticated
  using (public.current_user_is_staff())
  with check (public.current_user_is_staff());

create policy marketing_campaign_sends_select_staff
  on public.marketing_campaign_sends for select to authenticated
  using (public.current_user_is_staff());
create policy marketing_campaign_sends_manage_staff
  on public.marketing_campaign_sends for all to authenticated
  using (public.current_user_is_staff())
  with check (public.current_user_is_staff());

create policy marketing_flows_select_staff
  on public.marketing_flows for select to authenticated
  using (public.current_user_is_staff());
create policy marketing_flows_manage_staff
  on public.marketing_flows for all to authenticated
  using (public.current_user_is_staff())
  with check (public.current_user_is_staff());

create policy marketing_flow_executions_select_staff
  on public.marketing_flow_executions for select to authenticated
  using (public.current_user_is_staff());
create policy marketing_flow_executions_manage_staff
  on public.marketing_flow_executions for all to authenticated
  using (public.current_user_is_staff())
  with check (public.current_user_is_staff());

create policy nps_responses_select_staff
  on public.nps_responses for select to authenticated
  using (public.current_user_is_staff());
create policy nps_responses_manage_staff
  on public.nps_responses for all to authenticated
  using (public.current_user_is_staff())
  with check (public.current_user_is_staff());

drop policy if exists app_settings_manage_staff_nps on public.app_settings;
create policy app_settings_manage_staff_nps
  on public.app_settings for all to authenticated
  using (id = 'nps_config' and public.current_user_is_staff())
  with check (id = 'nps_config' and public.current_user_is_staff());

create or replace function public.invoke_marketing_flow_execution()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  supabase_url text := current_setting('app.supabase_url', true);
  service_role_key text := current_setting('app.service_role_key', true);
begin
  if new.direction <> 'in' or new.contact_id is null then
    return new;
  end if;

  if coalesce(supabase_url, '') = '' or coalesce(service_role_key, '') = '' then
    insert into public.marketing_flow_executions(contact_id, message_id, status, details, error)
    values (new.contact_id, new.id, 'skipped', jsonb_build_object('reason', 'supabase_url_or_service_role_missing'), 'Flow execution webhook is not configured.');
    return new;
  end if;

  perform net.http_post(
    url := supabase_url || '/functions/v1/execute-marketing-flow',
    headers := jsonb_build_object('Authorization', 'Bearer ' || service_role_key, 'Content-Type', 'application/json'),
    body := jsonb_build_object('messageId', new.id)
  );

  return new;
end;
$$;

drop trigger if exists trg_execute_marketing_flows_on_inbox on public.inbox_messages;
create trigger trg_execute_marketing_flows_on_inbox
after insert on public.inbox_messages
for each row execute function public.invoke_marketing_flow_execution();
