-- Consolidated, repeat-safe marketing schema/config for production deploys.

create extension if not exists pg_net with schema extensions;

create table if not exists public.marketing_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'Personalizado',
  channel text not null default 'WhatsApp',
  body text not null,
  variables text[] default '{}',
  usage_count int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_marketing_templates_category
  on public.marketing_templates(category);

create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel text not null default 'email',
  status text not null default 'draft' check (status in ('draft','scheduled','running','completed','paused','failed')),
  template_id uuid references public.marketing_templates(id) on delete set null,
  audience_filter jsonb not null default '{}',
  subject text,
  body text,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  total_recipients int not null default 0,
  delivered_count int not null default 0,
  read_count int not null default 0,
  reply_count int not null default 0,
  failed_count int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_marketing_campaigns_status
  on public.marketing_campaigns(status, scheduled_at);

create table if not exists public.marketing_campaign_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade,
  contact_id uuid not null references public.marketing_contacts(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sent','delivered','read','replied','failed')),
  sent_at timestamptz,
  delivered_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique(campaign_id, contact_id)
);

create index if not exists idx_campaign_sends_campaign
  on public.marketing_campaign_sends(campaign_id);
create index if not exists idx_campaign_sends_status
  on public.marketing_campaign_sends(campaign_id, status);

create table if not exists public.marketing_flows (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  trigger_type text not null default 'manual' check (trigger_type in ('keyword','event','schedule','manual')),
  trigger_config jsonb not null default '{}',
  status text not null default 'draft' check (status in ('draft','active','paused')),
  nodes jsonb not null default '[]',
  edges jsonb not null default '[]',
  stats jsonb not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_marketing_flows_status
  on public.marketing_flows(status);

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

alter table public.marketing_contacts
  add column if not exists thread_root_message_id text null;

alter table public.marketing_contacts
  drop constraint if exists marketing_contacts_email_unique;

create unique index if not exists marketing_contacts_email_thread_unique
  on public.marketing_contacts(email, thread_root_message_id)
  where email is not null and thread_root_message_id is not null;

create index if not exists idx_marketing_contacts_thread_root
  on public.marketing_contacts(thread_root_message_id)
  where thread_root_message_id is not null;

do $$
begin
  if to_regclass('public.reservation_requests') is not null then
    alter table public.reservation_requests
      add column if not exists source_message_id text,
      add column if not exists external_reservation_code text;

    create unique index if not exists uq_reservation_requests_source_msg
      on public.reservation_requests(source_message_id)
      where source_message_id is not null;

    create unique index if not exists uq_reservation_requests_external_code
      on public.reservation_requests(upper(external_reservation_code))
      where external_reservation_code is not null and external_reservation_code <> '';
  end if;

  if to_regclass('public.reservations') is not null then
    alter table public.reservations
      add column if not exists source_message_id text,
      add column if not exists external_reservation_code text;

    create unique index if not exists uq_reservations_source_msg
      on public.reservations(source_message_id)
      where source_message_id is not null;

    create unique index if not exists uq_reservations_external_code
      on public.reservations(upper(external_reservation_code))
      where external_reservation_code is not null and external_reservation_code <> '';
  end if;
end $$;

create table if not exists public.reservation_import_logs (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'email',
  event_type text not null,
  inbox_message_id uuid references public.inbox_messages(id) on delete set null,
  reservation_request_id uuid references public.reservation_requests(id) on delete set null,
  reservation_id uuid references public.reservations(id) on delete set null,
  external_reservation_code text,
  source_message_id text,
  reason text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_reservation_import_logs_created_at
  on public.reservation_import_logs(created_at desc);
create index if not exists idx_reservation_import_logs_source
  on public.reservation_import_logs(source_message_id, external_reservation_code);

insert into public.app_settings (id, value)
values (
  'email_parser_config',
  '{"enabled":false,"always_classify":false,"sender_whitelist":["booking.com","airbnb.com","expedia.com","hoteis.com","decolar.com","trivago.com"],"subject_keywords":["reserva","reservation","booking","confirmation","confirmacao"],"min_confidence":"medium","default_category":"executivo","auto_confirm_enabled":false,"auto_confirm_sender_whitelist":[]}'
)
on conflict (id) do nothing;

do $$
declare
  smtp_value jsonb;
begin
  select case
    when value is null or btrim(value) = '' then '{}'::jsonb
    else value::jsonb
  end
  into smtp_value
  from public.app_settings
  where id = 'smtp_config';

  if found and jsonb_typeof(smtp_value) = 'object' then
    update public.app_settings
    set value = (smtp_value || jsonb_build_object('signatureWebsite', 'https://royal.app.br'))::text,
        updated_at = timezone('utc', now())
    where id = 'smtp_config';
  end if;
exception
  when others then
    raise warning 'Could not update smtp_config.signatureWebsite: %', sqlerrm;
end $$;

alter table public.marketing_templates enable row level security;
alter table public.marketing_campaigns enable row level security;
alter table public.marketing_campaign_sends enable row level security;
alter table public.marketing_flows enable row level security;
alter table public.marketing_flow_executions enable row level security;
alter table public.nps_responses enable row level security;
alter table public.reservation_import_logs enable row level security;

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

drop policy if exists "auth read templates" on public.marketing_templates;
drop policy if exists "auth write templates" on public.marketing_templates;
drop policy if exists marketing_templates_select_staff on public.marketing_templates;
drop policy if exists marketing_templates_manage_staff on public.marketing_templates;
create policy marketing_templates_select_staff
  on public.marketing_templates for select to authenticated
  using (public.current_user_is_staff());
create policy marketing_templates_manage_staff
  on public.marketing_templates for all to authenticated
  using (public.current_user_is_staff())
  with check (public.current_user_is_staff());

drop policy if exists "auth read campaigns" on public.marketing_campaigns;
drop policy if exists "auth write campaigns" on public.marketing_campaigns;
drop policy if exists marketing_campaigns_select_staff on public.marketing_campaigns;
drop policy if exists marketing_campaigns_manage_staff on public.marketing_campaigns;
create policy marketing_campaigns_select_staff
  on public.marketing_campaigns for select to authenticated
  using (public.current_user_is_staff());
create policy marketing_campaigns_manage_staff
  on public.marketing_campaigns for all to authenticated
  using (public.current_user_is_staff())
  with check (public.current_user_is_staff());

drop policy if exists "auth read sends" on public.marketing_campaign_sends;
drop policy if exists "auth write sends" on public.marketing_campaign_sends;
drop policy if exists marketing_campaign_sends_select_staff on public.marketing_campaign_sends;
drop policy if exists marketing_campaign_sends_manage_staff on public.marketing_campaign_sends;
create policy marketing_campaign_sends_select_staff
  on public.marketing_campaign_sends for select to authenticated
  using (public.current_user_is_staff());
create policy marketing_campaign_sends_manage_staff
  on public.marketing_campaign_sends for all to authenticated
  using (public.current_user_is_staff())
  with check (public.current_user_is_staff());

drop policy if exists "auth read flows" on public.marketing_flows;
drop policy if exists "auth write flows" on public.marketing_flows;
drop policy if exists marketing_flows_select_staff on public.marketing_flows;
drop policy if exists marketing_flows_manage_staff on public.marketing_flows;
create policy marketing_flows_select_staff
  on public.marketing_flows for select to authenticated
  using (public.current_user_is_staff());
create policy marketing_flows_manage_staff
  on public.marketing_flows for all to authenticated
  using (public.current_user_is_staff())
  with check (public.current_user_is_staff());

drop policy if exists marketing_flow_executions_select_staff on public.marketing_flow_executions;
drop policy if exists marketing_flow_executions_manage_staff on public.marketing_flow_executions;
create policy marketing_flow_executions_select_staff
  on public.marketing_flow_executions for select to authenticated
  using (public.current_user_is_staff());
create policy marketing_flow_executions_manage_staff
  on public.marketing_flow_executions for all to authenticated
  using (public.current_user_is_staff())
  with check (public.current_user_is_staff());

drop policy if exists nps_responses_select_staff on public.nps_responses;
drop policy if exists nps_responses_manage_staff on public.nps_responses;
create policy nps_responses_select_staff
  on public.nps_responses for select to authenticated
  using (public.current_user_is_staff());
create policy nps_responses_manage_staff
  on public.nps_responses for all to authenticated
  using (public.current_user_is_staff())
  with check (public.current_user_is_staff());

drop policy if exists reservation_import_logs_select_staff on public.reservation_import_logs;
drop policy if exists reservation_import_logs_service_all on public.reservation_import_logs;
create policy reservation_import_logs_select_staff
  on public.reservation_import_logs for select to authenticated
  using (public.current_user_is_staff());
create policy reservation_import_logs_service_all
  on public.reservation_import_logs for all to service_role
  using (true)
  with check (true);

drop policy if exists app_settings_manage_staff_nps on public.app_settings;
create policy app_settings_manage_staff_nps
  on public.app_settings for all to authenticated
  using (id = 'nps_config' and public.current_user_is_staff())
  with check (id = 'nps_config' and public.current_user_is_staff());

create or replace function public.marketing_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_marketing_templates_touch on public.marketing_templates;
create trigger trg_marketing_templates_touch
before update on public.marketing_templates
for each row execute function public.marketing_touch_updated_at();

drop trigger if exists trg_marketing_campaigns_touch on public.marketing_campaigns;
create trigger trg_marketing_campaigns_touch
before update on public.marketing_campaigns
for each row execute function public.marketing_touch_updated_at();

drop trigger if exists trg_marketing_flows_touch on public.marketing_flows;
create trigger trg_marketing_flows_touch
before update on public.marketing_flows
for each row execute function public.marketing_touch_updated_at();

create or replace function public.invoke_marketing_flow_execution()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  supabase_url text := '__SUPABASE_URL__';
  service_role_key text := '__SUPABASE_SERVICE_ROLE_KEY__';
begin
  if new.direction <> 'in' or new.contact_id is null then
    return new;
  end if;

  if coalesce(supabase_url, '') = ''
    or coalesce(service_role_key, '') = ''
    or supabase_url = '__SUPABASE_URL__'
    or service_role_key = '__SUPABASE_SERVICE_ROLE_KEY__'
  then
    insert into public.marketing_flow_executions(contact_id, message_id, status, details, error)
    values (
      new.contact_id,
      new.id,
      'skipped',
      jsonb_build_object('reason', 'supabase_url_or_service_role_missing'),
      'Flow execution webhook is not configured.'
    );
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
