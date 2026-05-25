-- Foundation for email-code authentication and remembered devices.
-- Tables are locked down to service_role access; frontend integration will use Edge Functions.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.auth_email_challenges (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  email text not null,
  normalized_email text not null,
  purpose text not null default 'login',
  code_hash text not null,
  code_salt text not null,
  auth_session_ciphertext text,
  auth_session_iv text,
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'expired', 'locked', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts > 0),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_auth_email_challenges_lookup
  on public.auth_email_challenges(normalized_email, purpose, status, expires_at desc);
create index if not exists idx_auth_email_challenges_profile_created
  on public.auth_email_challenges(profile_id, created_at desc);

create table if not exists public.auth_remembered_devices (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  device_hash text not null unique,
  device_label text,
  user_agent text,
  ip_address text,
  last_seen_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoke_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_auth_remembered_devices_profile_active
  on public.auth_remembered_devices(profile_id, revoked_at, expires_at desc);

create table if not exists public.auth_device_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  remembered_device_id uuid references public.auth_remembered_devices(id) on delete set null,
  session_hash text not null unique,
  user_agent text,
  ip_address text,
  last_seen_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoke_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_auth_device_sessions_profile_active
  on public.auth_device_sessions(profile_id, revoked_at, expires_at desc);
create index if not exists idx_auth_device_sessions_remembered_device
  on public.auth_device_sessions(remembered_device_id);

create table if not exists public.auth_security_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  email text,
  normalized_email text,
  event_type text not null,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_auth_security_events_profile_created
  on public.auth_security_events(profile_id, created_at desc);
create index if not exists idx_auth_security_events_email_created
  on public.auth_security_events(normalized_email, created_at desc);
create index if not exists idx_auth_security_events_type_created
  on public.auth_security_events(event_type, created_at desc);

create or replace function public.auth_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_auth_email_challenges_touch on public.auth_email_challenges;
create trigger trg_auth_email_challenges_touch
before update on public.auth_email_challenges
for each row execute function public.auth_touch_updated_at();

drop trigger if exists trg_auth_remembered_devices_touch on public.auth_remembered_devices;
create trigger trg_auth_remembered_devices_touch
before update on public.auth_remembered_devices
for each row execute function public.auth_touch_updated_at();

drop trigger if exists trg_auth_device_sessions_touch on public.auth_device_sessions;
create trigger trg_auth_device_sessions_touch
before update on public.auth_device_sessions
for each row execute function public.auth_touch_updated_at();

alter table public.auth_email_challenges enable row level security;
alter table public.auth_remembered_devices enable row level security;
alter table public.auth_device_sessions enable row level security;
alter table public.auth_security_events enable row level security;
alter table public.auth_email_challenges force row level security;
alter table public.auth_remembered_devices force row level security;
alter table public.auth_device_sessions force row level security;
alter table public.auth_security_events force row level security;

revoke all on public.auth_email_challenges from anon, authenticated;
revoke all on public.auth_remembered_devices from anon, authenticated;
revoke all on public.auth_device_sessions from anon, authenticated;
revoke all on public.auth_security_events from anon, authenticated;

grant select, insert, update, delete on public.auth_email_challenges to service_role;
grant select, insert, update, delete on public.auth_remembered_devices to service_role;
grant select, insert, update, delete on public.auth_device_sessions to service_role;
grant select, insert, update, delete on public.auth_security_events to service_role;

drop policy if exists auth_email_challenges_service_all on public.auth_email_challenges;
create policy auth_email_challenges_service_all
  on public.auth_email_challenges for all to service_role
  using (true)
  with check (true);

drop policy if exists auth_remembered_devices_service_all on public.auth_remembered_devices;
create policy auth_remembered_devices_service_all
  on public.auth_remembered_devices for all to service_role
  using (true)
  with check (true);

drop policy if exists auth_device_sessions_service_all on public.auth_device_sessions;
create policy auth_device_sessions_service_all
  on public.auth_device_sessions for all to service_role
  using (true)
  with check (true);

drop policy if exists auth_security_events_service_all on public.auth_security_events;
create policy auth_security_events_service_all
  on public.auth_security_events for all to service_role
  using (true)
  with check (true);
