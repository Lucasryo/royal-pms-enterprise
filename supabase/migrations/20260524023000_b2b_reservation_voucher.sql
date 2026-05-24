-- B2B reservation voucher profile, company billing profiles and reservation metadata.

create table if not exists public.company_billing_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  legal_name text,
  cnpj text,
  fiscal_address text,
  fiscal_email text,
  cost_center text,
  billing_instructions text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.company_billing_profiles
  add column if not exists legal_name text,
  add column if not exists cnpj text,
  add column if not exists fiscal_address text,
  add column if not exists fiscal_email text,
  add column if not exists cost_center text,
  add column if not exists billing_instructions text,
  add column if not exists notes text,
  add column if not exists active boolean not null default true,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create index if not exists idx_company_billing_profiles_company_active
  on public.company_billing_profiles(company_id, active, name);

alter table public.company_billing_profiles enable row level security;

drop policy if exists company_billing_profiles_select_staff_or_linked_client on public.company_billing_profiles;
create policy company_billing_profiles_select_staff_or_linked_client
  on public.company_billing_profiles for select to authenticated
  using (
    public.current_user_is_staff()
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.company_id = company_billing_profiles.company_id
        and company_billing_profiles.active = true
    )
  );

drop policy if exists company_billing_profiles_manage_staff on public.company_billing_profiles;
create policy company_billing_profiles_manage_staff
  on public.company_billing_profiles for all to authenticated
  using (public.current_user_is_staff())
  with check (public.current_user_is_staff());

grant select, insert, update, delete on public.company_billing_profiles to authenticated;

alter table public.reservations
  add column if not exists pax_names text[] not null default '{}',
  add column if not exists occupancy_type text not null default 'SGL',
  add column if not exists billing_profile_id uuid references public.company_billing_profiles(id) on delete set null;

alter table public.reservation_requests
  add column if not exists pax_names text[] not null default '{}',
  add column if not exists occupancy_type text not null default 'SGL',
  add column if not exists billing_profile_id uuid references public.company_billing_profiles(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reservations_occupancy_type_check'
  ) then
    alter table public.reservations
      add constraint reservations_occupancy_type_check
      check (occupancy_type in ('SGL', 'DBL', 'TPL', 'QDL'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'reservation_requests_occupancy_type_check'
  ) then
    alter table public.reservation_requests
      add constraint reservation_requests_occupancy_type_check
      check (occupancy_type in ('SGL', 'DBL', 'TPL', 'QDL'));
  end if;
end $$;

insert into public.app_settings (id, value)
values (
  'voucher_hotel_profile',
  '{
    "trade_name":"Royal Macae Palace Hotel",
    "legal_name":"Royal Macae Palace Hotel",
    "cnpj":"07.116.901/0001-92",
    "address":"Avenida Atlantica, 1642 - Praia dos Cavaleiros, Macae - RJ",
    "phone":"(22) 2123-9650",
    "email":"reservas@royalmacae.com.br",
    "website":"www.royalmacae.com.br",
    "logo_url":"/logo.png",
    "notes":"Voucher corporativo sujeito a disponibilidade, politica comercial vigente e validacao do setor de reservas."
  }'
)
on conflict (id) do nothing;

drop policy if exists app_settings_select_voucher_hotel_profile on public.app_settings;
create policy app_settings_select_voucher_hotel_profile
  on public.app_settings for select to authenticated
  using (id = 'voucher_hotel_profile');

drop policy if exists app_settings_manage_staff_voucher_hotel_profile on public.app_settings;
create policy app_settings_manage_staff_voucher_hotel_profile
  on public.app_settings for all to authenticated
  using (id = 'voucher_hotel_profile' and public.current_user_is_staff())
  with check (id = 'voucher_hotel_profile' and public.current_user_is_staff());
