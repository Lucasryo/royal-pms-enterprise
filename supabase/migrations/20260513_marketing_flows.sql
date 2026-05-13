create table if not exists public.marketing_flows (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  trigger_type text not null check (trigger_type in ('first_message','keyword','no_reply','reservation_event','manual')),
  trigger_condition jsonb not null default '{}',
  steps jsonb not null default '[]',
  status text not null default 'inactive' check (status in ('active','inactive')),
  channel text not null default 'whatsapp' check (channel in ('whatsapp','instagram','facebook','all')),
  created_by uuid references auth.users(id),
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.marketing_flow_executions (
  id uuid default gen_random_uuid() primary key,
  flow_id uuid not null references public.marketing_flows(id) on delete cascade,
  contact_id uuid references public.marketing_contacts(id),
  contact_identifier text,
  status text not null default 'running' check (status in ('running','completed','failed','cancelled')),
  current_step integer not null default 0,
  context jsonb not null default '{}',
  started_at timestamptz default timezone('utc', now()) not null,
  completed_at timestamptz,
  error text
);

create index if not exists idx_marketing_flows_status on public.marketing_flows(status);
create index if not exists idx_flow_executions_flow_id on public.marketing_flow_executions(flow_id, status);
create index if not exists idx_flow_executions_contact on public.marketing_flow_executions(contact_id, status);

alter table public.marketing_flows enable row level security;
alter table public.marketing_flow_executions enable row level security;
create policy "flows_staff" on public.marketing_flows for all to authenticated using (true) with check (true);
create policy "flow_executions_staff" on public.marketing_flow_executions for all to authenticated using (true) with check (true);
