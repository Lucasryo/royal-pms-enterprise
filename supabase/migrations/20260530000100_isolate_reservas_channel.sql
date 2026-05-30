-- Isola configuracoes B2B do Reservas Channel de clientes externos.

create or replace function public.current_user_can_access_reservas_channel_b2b()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role(), '') in ('admin', 'reservations', 'finance', 'faturamento');
$$;

drop policy if exists company_billing_profiles_select_staff_or_linked_client on public.company_billing_profiles;
drop policy if exists company_billing_profiles_select_channel_staff on public.company_billing_profiles;
create policy company_billing_profiles_select_channel_staff
  on public.company_billing_profiles for select to authenticated
  using (public.current_user_can_access_reservas_channel_b2b());

drop policy if exists company_billing_profiles_manage_staff on public.company_billing_profiles;
drop policy if exists company_billing_profiles_manage_channel_staff on public.company_billing_profiles;
create policy company_billing_profiles_manage_channel_staff
  on public.company_billing_profiles for all to authenticated
  using (public.current_user_can_access_reservas_channel_b2b())
  with check (public.current_user_can_access_reservas_channel_b2b());

drop policy if exists app_settings_select_voucher_hotel_profile on public.app_settings;
drop policy if exists app_settings_select_voucher_hotel_profile_channel_staff on public.app_settings;
create policy app_settings_select_voucher_hotel_profile_channel_staff
  on public.app_settings for select to authenticated
  using (id = 'voucher_hotel_profile' and public.current_user_can_access_reservas_channel_b2b());

drop policy if exists app_settings_manage_staff_voucher_hotel_profile on public.app_settings;
drop policy if exists app_settings_manage_voucher_hotel_profile_channel_staff on public.app_settings;
create policy app_settings_manage_voucher_hotel_profile_channel_staff
  on public.app_settings for all to authenticated
  using (id = 'voucher_hotel_profile' and public.current_user_can_access_reservas_channel_b2b())
  with check (id = 'voucher_hotel_profile' and public.current_user_can_access_reservas_channel_b2b());
