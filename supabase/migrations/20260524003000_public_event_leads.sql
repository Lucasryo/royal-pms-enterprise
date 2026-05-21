create table if not exists public.public_event_leads (
  id uuid default gen_random_uuid() primary key,
  contact_id uuid references public.marketing_contacts(id) on delete set null,
  status text not null default 'abandoned' check (status in ('draft', 'abandoned', 'submitted', 'contacted', 'quoted', 'won', 'lost')),
  lead_score integer not null default 35,
  customer_name text not null,
  customer_email text,
  customer_phone text,
  company_name text,
  event_name text,
  event_type text,
  event_date date,
  alternate_date date,
  start_time text,
  attendees_count integer,
  hall_preference text,
  budget_range text,
  notes text,
  source text not null default 'landing_events',
  utm_source text,
  utm_medium text,
  utm_campaign text,
  page_url text,
  last_activity_at timestamptz default timezone('utc', now()) not null,
  submitted_at timestamptz,
  contacted_at timestamptz,
  converted_event_id uuid references public.hotel_events(id) on delete set null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create index if not exists idx_public_event_leads_status_activity
  on public.public_event_leads(status, last_activity_at desc);

create index if not exists idx_public_event_leads_contact
  on public.public_event_leads(contact_id);

create index if not exists idx_public_event_leads_event_date
  on public.public_event_leads(event_date);

alter table public.public_event_leads enable row level security;

grant insert on public.public_event_leads to anon;
grant select, update on public.public_event_leads to authenticated;
grant select, insert, update, delete on public.public_event_leads to service_role;

create or replace function public.current_user_can_manage_events()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role(), '') in ('admin', 'manager', 'eventos');
$$;

grant execute on function public.current_user_can_manage_events() to authenticated, service_role;

drop policy if exists public_event_leads_select_events_staff on public.public_event_leads;
create policy public_event_leads_select_events_staff
  on public.public_event_leads for select to authenticated
  using (public.current_user_can_manage_events() or public.current_user_role() = 'marketing');

drop policy if exists public_event_leads_manage_events_staff on public.public_event_leads;
create policy public_event_leads_manage_events_staff
  on public.public_event_leads for all to authenticated
  using (public.current_user_can_manage_events() or public.current_user_role() = 'marketing')
  with check (public.current_user_can_manage_events() or public.current_user_role() = 'marketing');

drop policy if exists public_event_leads_public_insert on public.public_event_leads;
create policy public_event_leads_public_insert
  on public.public_event_leads for insert to anon
  with check (source = 'landing_events');
