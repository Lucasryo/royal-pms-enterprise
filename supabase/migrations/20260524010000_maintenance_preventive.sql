-- Preventive maintenance plans, runs, and ticket linkage.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

create table if not exists public.maintenance_preventive_plans (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 3 and 160),
  category text not null default 'Geral',
  target_type text not null default 'room' check (target_type in ('room', 'area', 'equipment')),
  room_number text,
  location text,
  equipment_name text,
  frequency text not null check (frequency in ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  checklist text[] not null default '{}',
  instructions text,
  next_due_date date not null,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_generated_at timestamptz
);

create table if not exists public.maintenance_preventive_runs (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.maintenance_preventive_plans(id) on delete cascade,
  due_date date not null,
  status text not null default 'pending' check (status in ('pending', 'ticket_created', 'completed', 'skipped', 'cancelled')),
  ticket_id uuid references public.maintenance_tickets(id) on delete set null,
  generated_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, due_date)
);

alter table public.maintenance_tickets
  add column if not exists source text not null default 'manual';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'maintenance_tickets_source_check'
      and conrelid = 'public.maintenance_tickets'::regclass
  ) then
    alter table public.maintenance_tickets
      add constraint maintenance_tickets_source_check
      check (source in ('preventive', 'qr', 'telegram', 'manual'));
  end if;
end $$;

alter table public.maintenance_tickets
  add column if not exists preventive_plan_id uuid references public.maintenance_preventive_plans(id) on delete set null,
  add column if not exists preventive_run_id uuid references public.maintenance_preventive_runs(id) on delete set null;

create index if not exists idx_preventive_plans_due
  on public.maintenance_preventive_plans(active, next_due_date);

create index if not exists idx_preventive_runs_plan_status
  on public.maintenance_preventive_runs(plan_id, status, due_date);

create index if not exists idx_preventive_runs_ticket
  on public.maintenance_preventive_runs(ticket_id)
  where ticket_id is not null;

create index if not exists idx_maintenance_tickets_preventive_plan
  on public.maintenance_tickets(preventive_plan_id)
  where preventive_plan_id is not null;

alter table public.maintenance_preventive_plans enable row level security;
alter table public.maintenance_preventive_runs enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'maintenance_preventive_plans'
      and policyname = 'authenticated_manage_preventive_plans'
  ) then
    create policy "authenticated_manage_preventive_plans"
      on public.maintenance_preventive_plans
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'maintenance_preventive_runs'
      and policyname = 'authenticated_manage_preventive_runs'
  ) then
    create policy "authenticated_manage_preventive_runs"
      on public.maintenance_preventive_runs
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'maintenance_preventive_plans'
      and policyname = 'service_role_all_preventive_plans'
  ) then
    create policy "service_role_all_preventive_plans"
      on public.maintenance_preventive_plans
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'maintenance_preventive_runs'
      and policyname = 'service_role_all_preventive_runs'
  ) then
    create policy "service_role_all_preventive_runs"
      on public.maintenance_preventive_runs
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end $$;

grant select, insert, update, delete on public.maintenance_preventive_plans to authenticated;
grant select, insert, update, delete on public.maintenance_preventive_runs to authenticated;

do $$
begin
  perform cron.unschedule('maintenance-preventive-due-hourly');
exception
  when others then null;
end $$;

do $$
declare
  bot_maintenance_secret text := current_setting('app.bot_maintenance_secret', true);
begin
  if coalesce(bot_maintenance_secret, '') = '' then
    raise notice 'Skipping maintenance preventive cron: app.bot_maintenance_secret is not configured.';
    return;
  end if;

  perform cron.schedule(
    'maintenance-preventive-due-hourly',
    '7 * * * *',
    format(
      $cron$
        select net.http_post(
          url := 'https://piwknissqcvkvnzloojh.supabase.co/functions/v1/notify-maintenance-ticket',
          headers := jsonb_build_object('Authorization', 'Bearer ' || %L, 'Content-Type', 'application/json'),
          body := jsonb_build_object('type', 'preventive_due_scan', 'source', 'pg_cron')
        );
      $cron$,
      bot_maintenance_secret
    )
  );
end $$;
