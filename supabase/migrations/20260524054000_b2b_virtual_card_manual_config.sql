alter table public.reservations
  add column if not exists property_scope text not null default 'default';

alter table public.reservation_requests
  add column if not exists property_scope text not null default 'default';

alter table public.reservation_payment_tokens
  add column if not exists property_scope text not null default 'default',
  add column if not exists token_registered_by uuid references public.profiles(id) on delete set null,
  add column if not exists token_registered_at timestamptz;

create index if not exists idx_reservations_property_scope on public.reservations(property_scope);
create index if not exists idx_reservation_requests_property_scope on public.reservation_requests(property_scope);
create index if not exists idx_reservation_payment_tokens_property_scope on public.reservation_payment_tokens(property_scope);

insert into public.app_settings (id, value)
values (
  'b2b_virtual_card_config',
  '{
    "property_scope": "default",
    "provider": "manual",
    "mode": "manual",
    "charge_window_days_after_checkout": 7,
    "require_token_before_confirmation": false,
    "credentials_configured": false,
    "instructions": "Registre apenas token/referencia do gateway, bandeira e final 4. Nunca informe numero completo do cartao ou CVV no PMS."
  }'
)
on conflict (id) do nothing;

drop policy if exists app_settings_select_b2b_virtual_card_config on public.app_settings;
create policy app_settings_select_b2b_virtual_card_config
  on public.app_settings for select to authenticated
  using (
    id = 'b2b_virtual_card_config'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin','manager','reservations','reception','finance','faturamento')
    )
  );

drop policy if exists app_settings_manage_b2b_virtual_card_config on public.app_settings;
create policy app_settings_manage_b2b_virtual_card_config
  on public.app_settings for all to authenticated
  using (
    id = 'b2b_virtual_card_config'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin','manager','finance','faturamento')
    )
  )
  with check (
    id = 'b2b_virtual_card_config'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin','manager','finance','faturamento')
    )
  );

create or replace function public.prevent_payment_token_card_data_leak()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.text_has_payment_card_data(
    coalesce(new.payment_token, '') || ' ' ||
    coalesce(new.hosted_url, '') || ' ' ||
    coalesce(new.holder_name, '') || ' ' ||
    coalesce(new.authorization_reference, '') || ' ' ||
    coalesce(new.stored_credential_reference, '') || ' ' ||
    coalesce(new.failure_reason, '')
  ) then
    raise exception 'Dados de cartao nao podem ser salvos no registro de token. Use apenas token/referencia mascarada do gateway.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists reservation_payment_tokens_card_data_guard on public.reservation_payment_tokens;
create trigger reservation_payment_tokens_card_data_guard
before insert or update of payment_token, hosted_url, holder_name, authorization_reference, stored_credential_reference, failure_reason
on public.reservation_payment_tokens
for each row execute function public.prevent_payment_token_card_data_leak();
