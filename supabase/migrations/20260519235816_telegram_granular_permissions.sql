alter table public.profiles
  add column if not exists active boolean not null default true;

create table if not exists public.telegram_user_bindings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  telegram_user_id bigint not null,
  telegram_username text,
  display_name text,
  telegram_role text not null check (telegram_role in ('admin', 'technician', 'inspector')),
  active boolean not null default true,
  linked_at timestamptz not null default now(),
  linked_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_telegram_user_bindings_active_user
  on public.telegram_user_bindings(telegram_user_id)
  where active;

create index if not exists idx_telegram_user_bindings_profile
  on public.telegram_user_bindings(profile_id, active);

create table if not exists public.telegram_link_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  telegram_role text not null check (telegram_role in ('admin', 'technician', 'inspector')),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_telegram_user_id bigint,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_telegram_link_codes_profile
  on public.telegram_link_codes(profile_id, created_at desc);

create or replace function public.revoke_telegram_bindings_when_profile_inactive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.active is distinct from new.active and new.active = false then
    update public.telegram_user_bindings
      set active = false,
          revoked_at = coalesce(revoked_at, now()),
          updated_at = now()
      where profile_id = new.id
        and active = true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_revoke_telegram_bindings_when_profile_inactive on public.profiles;
create trigger trg_revoke_telegram_bindings_when_profile_inactive
  after update of active on public.profiles
  for each row
  execute function public.revoke_telegram_bindings_when_profile_inactive();

alter table public.telegram_user_bindings enable row level security;
alter table public.telegram_link_codes enable row level security;

drop policy if exists "service_role_all_telegram_user_bindings" on public.telegram_user_bindings;
create policy "service_role_all_telegram_user_bindings"
  on public.telegram_user_bindings for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "service_role_all_telegram_link_codes" on public.telegram_link_codes;
create policy "service_role_all_telegram_link_codes"
  on public.telegram_link_codes for all
  to service_role
  using (true)
  with check (true);
