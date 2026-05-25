alter table public.reservations
  add column if not exists property_id uuid references public.hotel_properties(id) on delete set null;

alter table public.reservation_requests
  add column if not exists property_id uuid references public.hotel_properties(id) on delete set null;

alter table public.reservation_payment_tokens
  add column if not exists property_id uuid references public.hotel_properties(id) on delete set null;

create index if not exists idx_reservations_property_id on public.reservations(property_id);
create index if not exists idx_reservation_requests_property_id on public.reservation_requests(property_id);
create index if not exists idx_reservation_payment_tokens_property_id on public.reservation_payment_tokens(property_id);

create table if not exists public.property_payment_gateway_credentials (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.hotel_properties(id) on delete cascade,
  provider text not null default 'cielo' check (provider in ('cielo')),
  mode text not null default 'sandbox' check (mode in ('sandbox','production')),
  status text not null default 'inactive' check (status in ('active','inactive','rotation_required')),
  merchant_id text,
  merchant_id_masked text,
  merchant_key_secret_ref text,
  access_token_secret_ref text,
  credential_fingerprint text,
  configured_by uuid references public.profiles(id) on delete set null,
  configured_at timestamptz,
  last_used_at timestamptz,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint property_gateway_credentials_unique_scope unique (property_id, provider, mode),
  constraint property_gateway_credentials_no_inline_key check (
    merchant_key_secret_ref is null
    or merchant_key_secret_ref !~* '(merchant.?key|senha|password|secret)[=:][^[:space:]]+'
  )
);

create table if not exists public.virtual_card_transactions (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.hotel_properties(id) on delete set null,
  reservation_id uuid references public.reservations(id) on delete set null,
  reservation_payment_token_id uuid references public.reservation_payment_tokens(id) on delete set null,
  credential_id uuid references public.property_payment_gateway_credentials(id) on delete set null,
  provider text not null default 'cielo' check (provider in ('cielo','mock','manual')),
  gateway_mode text not null default 'mock' check (gateway_mode in ('mock','manual','sandbox','production')),
  status text not null check (status in ('pending','authorized','captured','charged','failed','cancelled','refunded')),
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'BRL',
  gateway_transaction_id text,
  gateway_payment_id text,
  authorization_code text,
  nsu text,
  tid text,
  brand text,
  last4 text,
  installments integer not null default 1 check (installments > 0),
  requested_by uuid references public.profiles(id) on delete set null,
  requested_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz,
  failure_reason text,
  gateway_response_code text,
  gateway_response_message text,
  gateway_response_sanitized jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint virtual_card_transactions_last4_check check (last4 is null or last4 ~ '^[0-9]{4}$')
);

create table if not exists public.virtual_card_receipts (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.virtual_card_transactions(id) on delete cascade,
  property_id uuid references public.hotel_properties(id) on delete set null,
  reservation_id uuid references public.reservations(id) on delete set null,
  receipt_type text not null default 'charge' check (receipt_type in ('authorization','charge','capture','refund','failure')),
  status text not null default 'issued' check (status in ('issued','void','failed')),
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'BRL',
  receipt_number text,
  provider_reference text,
  issued_by uuid references public.profiles(id) on delete set null,
  issued_at timestamptz not null default timezone('utc', now()),
  payload_sanitized jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_property_gateway_credentials_property on public.property_payment_gateway_credentials(property_id);
create index if not exists idx_property_gateway_credentials_active on public.property_payment_gateway_credentials(property_id, provider, mode) where status = 'active';
create index if not exists idx_virtual_card_transactions_reservation on public.virtual_card_transactions(reservation_id);
create index if not exists idx_virtual_card_transactions_property on public.virtual_card_transactions(property_id);
create index if not exists idx_virtual_card_transactions_token on public.virtual_card_transactions(reservation_payment_token_id);
create index if not exists idx_virtual_card_transactions_gateway_id on public.virtual_card_transactions(gateway_transaction_id);
create index if not exists idx_virtual_card_receipts_transaction on public.virtual_card_receipts(transaction_id);
create index if not exists idx_virtual_card_receipts_reservation on public.virtual_card_receipts(reservation_id);

drop trigger if exists property_gateway_credentials_set_updated_at on public.property_payment_gateway_credentials;
create trigger property_gateway_credentials_set_updated_at
before update on public.property_payment_gateway_credentials
for each row execute function public.set_updated_at();

drop trigger if exists virtual_card_transactions_set_updated_at on public.virtual_card_transactions;
create trigger virtual_card_transactions_set_updated_at
before update on public.virtual_card_transactions
for each row execute function public.set_updated_at();

drop trigger if exists virtual_card_receipts_set_updated_at on public.virtual_card_receipts;
create trigger virtual_card_receipts_set_updated_at
before update on public.virtual_card_receipts
for each row execute function public.set_updated_at();

create or replace function public.prevent_virtual_card_transaction_sensitive_data()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.text_has_payment_card_data(
    coalesce(new.gateway_transaction_id, '') || ' ' ||
    coalesce(new.gateway_payment_id, '') || ' ' ||
    coalesce(new.authorization_code, '') || ' ' ||
    coalesce(new.nsu, '') || ' ' ||
    coalesce(new.tid, '') || ' ' ||
    coalesce(new.failure_reason, '') || ' ' ||
    coalesce(new.gateway_response_message, '') || ' ' ||
    coalesce(new.gateway_response_sanitized::text, '') || ' ' ||
    coalesce(new.metadata::text, '')
  ) then
    raise exception 'Dados de cartao nao podem ser salvos em transacoes. Use apenas token/referencia mascarada do gateway.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists virtual_card_transactions_sensitive_data_guard on public.virtual_card_transactions;
create trigger virtual_card_transactions_sensitive_data_guard
before insert or update of gateway_transaction_id, gateway_payment_id, authorization_code, nsu, tid, failure_reason, gateway_response_message, gateway_response_sanitized, metadata
on public.virtual_card_transactions
for each row execute function public.prevent_virtual_card_transaction_sensitive_data();

create or replace function public.prevent_virtual_card_receipt_sensitive_data()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.text_has_payment_card_data(
    coalesce(new.receipt_number, '') || ' ' ||
    coalesce(new.provider_reference, '') || ' ' ||
    coalesce(new.payload_sanitized::text, '')
  ) then
    raise exception 'Dados de cartao nao podem ser salvos em recibos. Use apenas referencias mascaradas do gateway.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists virtual_card_receipts_sensitive_data_guard on public.virtual_card_receipts;
create trigger virtual_card_receipts_sensitive_data_guard
before insert or update of receipt_number, provider_reference, payload_sanitized
on public.virtual_card_receipts
for each row execute function public.prevent_virtual_card_receipt_sensitive_data();

alter table public.property_payment_gateway_credentials enable row level security;
alter table public.virtual_card_transactions enable row level security;
alter table public.virtual_card_receipts enable row level security;

revoke all on public.property_payment_gateway_credentials from anon, authenticated;
grant all on public.property_payment_gateway_credentials to service_role;
grant select on public.virtual_card_transactions to authenticated;
grant select on public.virtual_card_receipts to authenticated;
grant select, insert, update, delete on public.virtual_card_transactions to service_role;
grant select, insert, update, delete on public.virtual_card_receipts to service_role;

drop policy if exists property_gateway_credentials_service_all on public.property_payment_gateway_credentials;
create policy property_gateway_credentials_service_all
  on public.property_payment_gateway_credentials for all to service_role
  using (true)
  with check (true);

drop policy if exists virtual_card_transactions_staff_select on public.virtual_card_transactions;
create policy virtual_card_transactions_staff_select
  on public.virtual_card_transactions for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin','manager','reception','finance','faturamento')
        and (
          virtual_card_transactions.property_id is null
          or public.current_user_can_access_property(virtual_card_transactions.property_id)
        )
    )
  );

drop policy if exists virtual_card_transactions_service_all on public.virtual_card_transactions;
create policy virtual_card_transactions_service_all
  on public.virtual_card_transactions for all to service_role
  using (true)
  with check (true);

drop policy if exists virtual_card_receipts_staff_select on public.virtual_card_receipts;
create policy virtual_card_receipts_staff_select
  on public.virtual_card_receipts for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin','manager','reception','finance','faturamento')
        and (
          virtual_card_receipts.property_id is null
          or public.current_user_can_access_property(virtual_card_receipts.property_id)
        )
    )
  );

drop policy if exists virtual_card_receipts_service_all on public.virtual_card_receipts;
create policy virtual_card_receipts_service_all
  on public.virtual_card_receipts for all to service_role
  using (true)
  with check (true);

create or replace view public.property_payment_gateway_credentials_masked as
select
  c.id,
  c.property_id,
  hp.name as property_name,
  hp.code as property_code,
  c.provider,
  c.mode,
  c.status,
  coalesce(c.merchant_id_masked, case
    when c.merchant_id is null then null
    when length(c.merchant_id) <= 4 then repeat('*', length(c.merchant_id))
    else repeat('*', greatest(length(c.merchant_id) - 4, 0)) || right(c.merchant_id, 4)
  end) as merchant_id_masked,
  c.credential_fingerprint,
  c.configured_by,
  c.configured_at,
  c.last_used_at,
  c.created_at,
  c.updated_at
from public.property_payment_gateway_credentials c
left join public.hotel_properties hp on hp.id = c.property_id
where exists (
  select 1 from public.profiles p
  where p.id = auth.uid()
    and p.role in ('admin','manager','finance','faturamento')
    and public.current_user_can_access_property(c.property_id)
);

grant select on public.property_payment_gateway_credentials_masked to authenticated;
