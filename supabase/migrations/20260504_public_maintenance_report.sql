-- =========================================================================
-- Public maintenance report — allow anonymous INSERTs into maintenance_tickets
-- =========================================================================
-- Lets staff (or even guests) scan a QR on the door and submit a ticket
-- without logging in. Restrictions:
--   1. Only INSERT is allowed for the anon role (no SELECT/UPDATE/DELETE)
--   2. Status must be 'open' on insert (forces normal workflow)
--   3. Priority must be one of the valid values
--   4. Optional rate-limit: enforce one ticket per minute per room from anon
--      (left as a soft constraint via UNIQUE INDEX, can be tightened later)
-- =========================================================================

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
    and assigned_to is null
    and resolved_at is null
  );

-- Soft rate-limit: prevent flood of identical tickets within the same minute
create unique index if not exists uq_anon_ticket_dedupe
  on public.maintenance_tickets (
    room_number,
    title,
    date_trunc('minute', created_at)
  )
  where reported_by is null and status = 'open';

-- Allow the public anon role to read the maintenance_tickets row it just created
-- (so the form can show the success message confirming insertion).
-- NOTE: anon role can only read tickets it just created (no SELECT for past).
-- We do NOT add SELECT for anon — the form does not need it; insert succeeds
-- and the UI shows the local success state.

-- =========================================================================
-- Helpful view: public_maintenance_queue — for the wall board (TV mode)
-- =========================================================================
create or replace view public.public_maintenance_queue as
  select
    id,
    room_number,
    title,
    description,
    priority,
    status,
    status_reason,
    resolution_notes,
    created_at,
    started_at,
    updated_at
  from public.maintenance_tickets
  where status in ('open', 'in_progress')
  order by
    case priority
      when 'urgent' then 1
      when 'high'   then 2
      when 'medium' then 3
      when 'low'    then 4
      else 5
    end,
    created_at asc;

comment on view public.public_maintenance_queue is
  'Live maintenance queue for the wall-mounted board. Only active tickets.';
