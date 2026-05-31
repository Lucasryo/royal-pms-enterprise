-- Cliente B2B confirma automaticamente reservas faturadas quando o periodo esta disponivel.
-- A disponibilidade operacional continua sendo controlada por booking_blocked_dates.

drop policy if exists reservations_client_create_billed_own_company on public.reservations;
create policy reservations_client_create_billed_own_company
  on public.reservations for insert to authenticated
  with check (
    company_id = public.current_user_company_id()
    and coalesce(public.current_user_role(), '') in ('client', 'external_client')
    and status = 'CONFIRMED'
    and payment_method = 'BILLED'
  );

drop trigger if exists reservations_blocked_date_guard on public.reservations;
create trigger reservations_blocked_date_guard
before insert or update of check_in, check_out, category
on public.reservations
for each row
execute function public.prevent_reservation_request_on_blocked_date();
