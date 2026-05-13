-- Omni-Inbox persistence and free IMAP polling support.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

create table if not exists public.marketing_contacts (
  id uuid default gen_random_uuid() primary key,
  name text,
  email text,
  phone text,
  channel text not null default 'email',
  status text not null default 'new' check (status in ('new', 'ai_responded', 'needs_human', 'resolved')),
  sentiment text not null default 'neutral' check (sentiment in ('happy', 'neutral', 'mixed')),
  last_message text,
  last_message_at timestamptz,
  unread_count integer not null default 0,
  tags text[] not null default '{}',
  internal_notes text,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null,
  constraint marketing_contacts_email_unique unique (email)
);

create index if not exists idx_marketing_contacts_last_message
  on public.marketing_contacts(last_message_at desc nulls last);
create index if not exists idx_marketing_contacts_channel
  on public.marketing_contacts(channel);

create table if not exists public.inbox_messages (
  id uuid default gen_random_uuid() primary key,
  contact_id uuid references public.marketing_contacts(id) on delete cascade,
  contact_identifier text not null,
  channel text not null default 'email',
  direction text not null check (direction in ('in','out')),
  subject text,
  body text not null,
  message_uid text,
  read boolean not null default false,
  created_at timestamptz default timezone('utc', now()) not null
);

create index if not exists idx_inbox_messages_contact
  on public.inbox_messages(contact_id, created_at desc);
create unique index if not exists idx_inbox_messages_uid
  on public.inbox_messages(channel, message_uid)
  where message_uid is not null;

alter table public.marketing_contacts enable row level security;
alter table public.inbox_messages enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'marketing_contacts' and policyname = 'marketing_contacts_select_staff') then
    create policy marketing_contacts_select_staff
      on public.marketing_contacts for select to authenticated
      using (public.current_user_is_staff());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'marketing_contacts' and policyname = 'marketing_contacts_manage_staff') then
    create policy marketing_contacts_manage_staff
      on public.marketing_contacts for all to authenticated
      using (public.current_user_is_staff())
      with check (public.current_user_is_staff());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'inbox_messages' and policyname = 'inbox_messages_select_staff') then
    create policy inbox_messages_select_staff
      on public.inbox_messages for select to authenticated
      using (public.current_user_is_staff());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'inbox_messages' and policyname = 'inbox_messages_manage_staff') then
    create policy inbox_messages_manage_staff
      on public.inbox_messages for all to authenticated
      using (public.current_user_is_staff())
      with check (public.current_user_is_staff());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'app_settings' and policyname = 'app_settings_manage_staff_smtp') then
    create policy app_settings_manage_staff_smtp
      on public.app_settings for all to authenticated
      using (id = 'smtp_config' and public.current_user_is_staff())
      with check (id = 'smtp_config' and public.current_user_is_staff());
  end if;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.inbox_messages;
exception
  when duplicate_object then null;
  when undefined_object then
    raise notice 'supabase_realtime publication is not available in this environment.';
end $$;

do $$
declare
  supabase_url text := current_setting('app.supabase_url', true);
  service_role_key text := current_setting('app.service_role_key', true);
begin
  if coalesce(supabase_url, '') = '' or coalesce(service_role_key, '') = '' then
    raise notice 'Skipping poll-email-inbox cron: app.supabase_url/app.service_role_key are not configured.';
    return;
  end if;

  perform cron.unschedule('poll-email-inbox-every-2min');
exception
  when others then null;
end $$;

do $$
declare
  supabase_url text := current_setting('app.supabase_url', true);
  service_role_key text := current_setting('app.service_role_key', true);
begin
  if coalesce(supabase_url, '') = '' or coalesce(service_role_key, '') = '' then
    return;
  end if;

  perform cron.schedule(
    'poll-email-inbox-every-2min',
    '*/2 * * * *',
    format(
      $cron$
        select net.http_post(
          url := %L,
          headers := jsonb_build_object('Authorization', 'Bearer ' || %L, 'Content-Type', 'application/json'),
          body := '{}'::jsonb
        );
      $cron$,
      supabase_url || '/functions/v1/poll-email-inbox',
      service_role_key
    )
  );
end $$;
