-- Package 1: additive multi-property database foundation.

create table if not exists public.hotel_properties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  city text not null default 'Macae',
  status text not null default 'active' check (status in ('active', 'inactive', 'opening')),
  rooms_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.hotel_properties (code, name, city, status)
values
  ('RMP', 'Royal Macae Palace', 'Macae', 'active'),
  ('RAM', 'Royal Atlantica Macae', 'Macae', 'active'),
  ('RKM', 'Royal Kingdom Macae', 'Macae', 'active'),
  ('RUM', 'Royal Urban Macae', 'Macae', 'active')
on conflict (code) do update
set
  name = excluded.name,
  city = excluded.city,
  status = excluded.status,
  updated_at = timezone('utc', now());

create table if not exists public.profile_property_access (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  property_id uuid not null references public.hotel_properties(id) on delete cascade,
  access_level text not null default 'member' check (access_level in ('viewer', 'member', 'manager', 'admin')),
  can_manage_reservations boolean not null default false,
  can_manage_finance boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (profile_id, property_id)
);

create index if not exists idx_profile_property_access_property
  on public.profile_property_access(property_id);

create index if not exists idx_profile_property_access_reservations
  on public.profile_property_access(profile_id, property_id)
  where can_manage_reservations = true;

create index if not exists idx_profile_property_access_finance
  on public.profile_property_access(profile_id, property_id)
  where can_manage_finance = true;

create table if not exists public.company_properties (
  company_id uuid not null references public.companies(id) on delete cascade,
  property_id uuid not null references public.hotel_properties(id) on delete cascade,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (company_id, property_id)
);

create index if not exists idx_company_properties_property
  on public.company_properties(property_id);

create index if not exists idx_company_properties_company_active
  on public.company_properties(company_id, active);

create index if not exists idx_company_properties_default
  on public.company_properties(company_id, is_default)
  where active = true;

alter table public.profile_property_access enable row level security;
alter table public.company_properties enable row level security;

drop policy if exists profile_property_access_select_self_or_managers on public.profile_property_access;
create policy profile_property_access_select_self_or_managers
  on public.profile_property_access for select to authenticated
  using (
    profile_id = auth.uid()
    or coalesce(public.current_user_role(), '') in ('admin', 'manager')
  );

drop policy if exists profile_property_access_manage_managers on public.profile_property_access;
create policy profile_property_access_manage_managers
  on public.profile_property_access for all to authenticated
  using (coalesce(public.current_user_role(), '') in ('admin', 'manager'))
  with check (coalesce(public.current_user_role(), '') in ('admin', 'manager'));

drop policy if exists company_properties_select_staff_or_linked_client on public.company_properties;
create policy company_properties_select_staff_or_linked_client
  on public.company_properties for select to authenticated
  using (
    public.current_user_is_staff()
    or company_id = public.current_user_company_id()
  );

drop policy if exists company_properties_manage_managers on public.company_properties;
create policy company_properties_manage_managers
  on public.company_properties for all to authenticated
  using (coalesce(public.current_user_role(), '') in ('admin', 'manager'))
  with check (coalesce(public.current_user_role(), '') in ('admin', 'manager'));

do $$
declare
  default_property_id uuid;
  target_table regclass;
  target_table_name text;
  index_name text;
begin
  select id
    into default_property_id
  from public.hotel_properties
  where code = 'RMP'
  limit 1;

  if default_property_id is null then
    raise exception 'Default hotel property RMP was not created.';
  end if;

  foreach target_table_name in array array[
    'reservations',
    'reservation_requests',
    'reservation_payment_tokens',
    'rooms',
    'files',
    'folio_charges',
    'company_billing_profiles',
    'tariffs',
    'booking_blocked_dates'
  ]
  loop
    target_table := to_regclass(format('public.%I', target_table_name));

    if target_table is not null then
      execute format(
        'alter table %s add column if not exists property_id uuid references public.hotel_properties(id) on delete set null',
        target_table
      );

      execute format('alter table %s disable trigger user', target_table);
      execute format(
        'update %s set property_id = $1 where property_id is null',
        target_table
      )
      using default_property_id;
      execute format('alter table %s enable trigger user', target_table);

      index_name := 'idx_' || target_table_name || '_property_id';

      execute format(
        'create index if not exists %I on %s(property_id)',
        index_name,
        target_table
      );
    end if;
  end loop;
end $$;

insert into public.profile_property_access (
  profile_id,
  property_id,
  access_level,
  can_manage_reservations,
  can_manage_finance
)
select
  p.id,
  hp.id,
  case when p.role in ('admin', 'manager') then 'admin' else 'member' end,
  p.role in ('admin', 'manager', 'reservations', 'reception'),
  p.role in ('admin', 'manager', 'finance', 'faturamento')
from public.profiles p
cross join public.hotel_properties hp
where p.role in ('admin', 'manager')
on conflict (profile_id, property_id) do nothing;

insert into public.profile_property_access (
  profile_id,
  property_id,
  access_level,
  can_manage_reservations,
  can_manage_finance
)
select
  p.id,
  hp.id,
  'member',
  p.role in ('reservations', 'reception'),
  p.role in ('finance', 'faturamento')
from public.profiles p
cross join public.hotel_properties hp
where p.role in ('reservations', 'reception', 'finance', 'faturamento')
  and hp.code = 'RMP'
on conflict (profile_id, property_id) do nothing;

insert into public.company_properties (company_id, property_id, is_default, active)
select
  c.id,
  hp.id,
  true,
  true
from public.companies c
cross join public.hotel_properties hp
where hp.code = 'RMP'
on conflict (company_id, property_id) do nothing;

create or replace function public.current_user_property_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(property_id order by property_code), array[]::uuid[])
  from (
    select hp.id as property_id, hp.code as property_code
    from public.hotel_properties hp
    where hp.status = 'active'
      and coalesce(public.current_user_role(), '') in ('admin', 'manager')

    union

    select ppa.property_id, hp.code as property_code
    from public.profile_property_access ppa
    join public.hotel_properties hp on hp.id = ppa.property_id
    where ppa.profile_id = auth.uid()
      and hp.status = 'active'
  ) allowed_properties;
$$;

create or replace function public.current_user_can_access_property(target_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    target_property_id is not null
    and exists (
      select 1
      from public.hotel_properties hp
      where hp.id = target_property_id
        and hp.status = 'active'
    )
    and (
      coalesce(public.current_user_role(), '') in ('admin', 'manager')
      or exists (
        select 1
        from public.profile_property_access ppa
        join public.hotel_properties hp on hp.id = ppa.property_id
        where ppa.profile_id = auth.uid()
          and ppa.property_id = target_property_id
          and hp.status = 'active'
      )
    );
$$;

create or replace function public.current_user_can_manage_property_reservations(target_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    target_property_id is not null
    and exists (
      select 1
      from public.hotel_properties hp
      where hp.id = target_property_id
        and hp.status = 'active'
    )
    and (
      coalesce(public.current_user_role(), '') in ('admin', 'manager')
      or exists (
        select 1
        from public.profile_property_access ppa
        join public.hotel_properties hp on hp.id = ppa.property_id
        where ppa.profile_id = auth.uid()
          and ppa.property_id = target_property_id
          and ppa.can_manage_reservations = true
          and hp.status = 'active'
      )
    );
$$;

create or replace function public.current_user_can_manage_property_finance(target_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    target_property_id is not null
    and exists (
      select 1
      from public.hotel_properties hp
      where hp.id = target_property_id
        and hp.status = 'active'
    )
    and (
      coalesce(public.current_user_role(), '') in ('admin', 'manager')
      or exists (
        select 1
        from public.profile_property_access ppa
        join public.hotel_properties hp on hp.id = ppa.property_id
        where ppa.profile_id = auth.uid()
          and ppa.property_id = target_property_id
          and ppa.can_manage_finance = true
          and hp.status = 'active'
      )
    );
$$;

grant select on public.hotel_properties to authenticated, anon;
grant select, insert, update, delete on public.hotel_properties to service_role;
grant select, insert, update, delete on public.profile_property_access to authenticated;
grant select, insert, update, delete on public.company_properties to authenticated;
grant select, insert, update, delete on public.profile_property_access to service_role;
grant select, insert, update, delete on public.company_properties to service_role;

grant execute on function public.current_user_property_ids() to authenticated, service_role;
grant execute on function public.current_user_can_access_property(uuid) to authenticated, service_role;
grant execute on function public.current_user_can_manage_property_reservations(uuid) to authenticated, service_role;
grant execute on function public.current_user_can_manage_property_finance(uuid) to authenticated, service_role;
