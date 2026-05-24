drop policy if exists booking_blocked_dates_select_active_clients on public.booking_blocked_dates;

create policy booking_blocked_dates_select_active_clients
on public.booking_blocked_dates
for select
to authenticated
using (
  active = true
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('client', 'external_client')
  )
);
