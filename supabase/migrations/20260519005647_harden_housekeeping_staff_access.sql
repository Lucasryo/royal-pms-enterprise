create table if not exists public.housekeeping_staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pin_hash text not null unique,
  floor_number integer not null,
  is_active boolean default true,
  last_used_at timestamptz,
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now()),
  created_by uuid references auth.users(id),
  phone text,
  notes text
);

alter table public.housekeeping_staff enable row level security;

alter table public.maintenance_tickets
  add column if not exists housekeeping_reported_by uuid references public.housekeeping_staff(id) on delete set null;

create index if not exists idx_maintenance_tickets_housekeeping_reported_by
  on public.maintenance_tickets(housekeeping_reported_by)
  where housekeeping_reported_by is not null;

create or replace function public.is_active_housekeeping_staff(staff_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.housekeeping_staff hs
    where hs.id = staff_id
      and hs.is_active = true
  );
$$;

grant execute on function public.is_active_housekeeping_staff(uuid) to anon, authenticated, service_role;

revoke all on public.housekeeping_staff from anon;
grant select, insert, update, delete on public.housekeeping_staff to authenticated;
grant all on public.housekeeping_staff to service_role;

drop policy if exists "anon_validate_housekeeping_staff" on public.housekeeping_staff;
drop policy if exists "admin_all_housekeeping_staff" on public.housekeeping_staff;
drop policy if exists "service_role_all_housekeeping_staff" on public.housekeeping_staff;
drop policy if exists "housekeeping_staff_select_staff" on public.housekeeping_staff;
drop policy if exists "housekeeping_staff_manage_staff" on public.housekeeping_staff;

create policy "housekeeping_staff_select_staff"
  on public.housekeeping_staff
  for select
  to authenticated
  using (public.current_user_role() in ('admin', 'manager', 'housekeeping'));

create policy "housekeeping_staff_manage_staff"
  on public.housekeeping_staff
  for all
  to authenticated
  using (public.current_user_role() in ('admin', 'manager', 'housekeeping'))
  with check (public.current_user_role() in ('admin', 'manager', 'housekeeping'));

drop policy if exists "anon_can_open_maintenance_ticket" on public.maintenance_tickets;

create policy "anon_can_open_maintenance_ticket"
  on public.maintenance_tickets
  for insert
  to anon
  with check (
    coalesce(status, 'open') = 'open'
    and priority in ('low', 'medium', 'high', 'urgent')
    and length(coalesce(title, '')) between 3 and 200
    and length(coalesce(description, '')) <= 2000
    and length(coalesce(room_number, '')) between 1 and 20
    and reported_by is null
    and (
      housekeeping_reported_by is null
      or public.is_active_housekeeping_staff(housekeeping_reported_by)
    )
    and assigned_to is null
    and resolved_at is null
  );
