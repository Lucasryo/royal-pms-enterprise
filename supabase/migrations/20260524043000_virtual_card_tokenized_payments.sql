alter table public.reservations
  add column if not exists payment_token_status text,
  add column if not exists payment_charge_status text,
  add column if not exists payment_token_provider text,
  add column if not exists payment_card_brand text,
  add column if not exists payment_card_last4 text,
  add column if not exists payment_charge_window_start date,
  add column if not exists payment_charge_window_end date;

alter table public.reservation_requests
  add column if not exists payment_token_status text,
  add column if not exists payment_charge_status text,
  add column if not exists payment_token_provider text,
  add column if not exists payment_card_brand text,
  add column if not exists payment_card_last4 text,
  add column if not exists payment_charge_window_start date,
  add column if not exists payment_charge_window_end date;

create table if not exists public.reservation_payment_tokens (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references public.reservations(id) on delete cascade,
  reservation_request_id uuid references public.reservation_requests(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  provider text not null default 'gateway_tokenized',
  payment_token text,
  hosted_url text,
  brand text,
  last4 text,
  holder_name text,
  authorized_limit numeric,
  expected_amount numeric,
  charged_amount numeric,
  charge_window_start date,
  charge_window_end date,
  status text not null default 'pending_token' check (status in ('pending_token','tokenized','charge_ready','charged','failed','cancelled','expired')),
  authorization_reference text,
  stored_credential_reference text,
  gateway_transaction_id text,
  failure_reason text,
  charged_by uuid references public.profiles(id) on delete set null,
  charged_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint reservation_payment_tokens_target_check check (reservation_id is not null or reservation_request_id is not null),
  constraint reservation_payment_tokens_last4_check check (last4 is null or last4 ~ '^[0-9]{4}$')
);

create index if not exists idx_reservation_payment_tokens_reservation_id on public.reservation_payment_tokens(reservation_id);
create index if not exists idx_reservation_payment_tokens_request_id on public.reservation_payment_tokens(reservation_request_id);
create index if not exists idx_reservation_payment_tokens_status on public.reservation_payment_tokens(status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists reservation_payment_tokens_set_updated_at on public.reservation_payment_tokens;
create trigger reservation_payment_tokens_set_updated_at
before update on public.reservation_payment_tokens
for each row execute function public.set_updated_at();

create or replace function public.luhn_valid_digits(digits text)
returns boolean
language plpgsql
immutable
as $$
declare
  sum_value integer := 0;
  digit_value integer;
  should_double boolean := false;
  idx integer;
begin
  if digits is null or digits !~ '^[0-9]{13,19}$' then
    return false;
  end if;
  for idx in reverse length(digits)..1 loop
    digit_value := substr(digits, idx, 1)::integer;
    if should_double then
      digit_value := digit_value * 2;
      if digit_value > 9 then digit_value := digit_value - 9; end if;
    end if;
    sum_value := sum_value + digit_value;
    should_double := not should_double;
  end loop;
  return (sum_value % 10) = 0;
end;
$$;

create or replace function public.text_has_payment_card_data(value text)
returns boolean
language plpgsql
immutable
as $$
declare
  candidate text;
  digits text;
begin
  if value is null or btrim(value) = '' then
    return false;
  end if;

  if lower(value) ~ '(cvv|cvc|cód[[:alpha:]]* de seguran[çc]a|codigo de seguran[çc]a)[^0-9]{0,12}[0-9]{3,4}' then
    return true;
  end if;

  for candidate in
    select match[1]
    from regexp_matches(value, '((?:[0-9][ -]?){13,19})', 'g') as match
  loop
    digits := regexp_replace(candidate, '[^0-9]', '', 'g');
    if public.luhn_valid_digits(digits) then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

create or replace function public.prevent_payment_card_data_leak()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.text_has_payment_card_data(coalesce(new.billing_obs, '') || ' ' || coalesce(new.billing_info, '') || ' ' || coalesce(new.fiscal_data, '')) then
    raise exception 'Dados de cartão não podem ser salvos em campos livres. Use tokenização segura.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists reservation_requests_card_data_guard on public.reservation_requests;
create trigger reservation_requests_card_data_guard
before insert or update of billing_obs, billing_info, fiscal_data
on public.reservation_requests
for each row execute function public.prevent_payment_card_data_leak();

drop trigger if exists reservations_card_data_guard on public.reservations;
create trigger reservations_card_data_guard
before insert or update of billing_obs, billing_info, fiscal_data
on public.reservations
for each row execute function public.prevent_payment_card_data_leak();

alter table public.reservation_payment_tokens enable row level security;

drop policy if exists reservation_payment_tokens_staff_all on public.reservation_payment_tokens;
create policy reservation_payment_tokens_staff_all
on public.reservation_payment_tokens
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin','manager','reservations','reception','finance','faturamento')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin','manager','reservations','reception','finance','faturamento')
  )
);

drop policy if exists reservation_payment_tokens_client_insert_pending on public.reservation_payment_tokens;
create policy reservation_payment_tokens_client_insert_pending
on public.reservation_payment_tokens
for insert
to authenticated
with check (
  status = 'pending_token'
  and payment_token is null
  and exists (
    select 1
    from public.profiles p
    join public.reservation_requests rr on rr.id = reservation_request_id
    where p.id = auth.uid()
      and p.role in ('client','external_client')
      and p.company_id = rr.company_id
  )
);

grant select, insert, update on public.reservation_payment_tokens to authenticated;
