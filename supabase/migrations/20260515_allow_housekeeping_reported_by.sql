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

grant execute on function public.is_active_housekeeping_staff(uuid) to anon, authenticated;

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
    and (
      reported_by is null
      or public.is_active_housekeeping_staff(reported_by)
    )
    and assigned_to is null
    and resolved_at is null
  );
