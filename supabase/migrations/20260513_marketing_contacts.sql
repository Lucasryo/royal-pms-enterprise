create table if not exists public.marketing_contacts (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  phone text,
  email text,
  channel text default 'whatsapp' check (channel in ('whatsapp','instagram','facebook','email','google','twitter','linkedin')),
  opt_out boolean not null default false,
  opt_out_at timestamptz,
  lead_score integer not null default 0 check (lead_score >= 0 and lead_score <= 100),
  lead_temp text not null default 'cold' check (lead_temp in ('hot','warm','cold')),
  tags text[] not null default '{}',
  notes text,
  source text,
  total_conversations integer not null default 0,
  last_contact_at timestamptz,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create index if not exists idx_marketing_contacts_opt_out on public.marketing_contacts(opt_out) where opt_out = false;
create index if not exists idx_marketing_contacts_lead_temp on public.marketing_contacts(lead_temp, lead_score desc);

alter table public.marketing_contacts enable row level security;
create policy "marketing_contacts_staff" on public.marketing_contacts
  for all to authenticated using (true) with check (true);
