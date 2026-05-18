alter table public.maintenance_tickets
  add column if not exists housekeeping_reported_by uuid references public.housekeeping_staff(id) on delete set null;

create index if not exists idx_maintenance_tickets_housekeeping_reported_by
  on public.maintenance_tickets(housekeeping_reported_by)
  where housekeeping_reported_by is not null;

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
