-- Royal PMS Enterprise - Supabase production schema
-- Apply in the Supabase SQL editor before deploying the frontend.

create extension if not exists pgcrypto;

-- Core tables
create table if not exists public.companies (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  slug text unique,
  cnpj text unique,
  email text,
  phone text,
  address text,
  status text default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text unique not null,
  name text not null,
  role text default 'client' not null check (
    role in ('admin', 'manager', 'client', 'external_client', 'reservations', 'faturamento', 'reception', 'finance', 'eventos', 'restaurant', 'housekeeping', 'maintenance')
  ),
  company_id uuid references public.companies(id) on delete set null,
  phone text,
  photo_url text,
  permissions jsonb,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.reservations (
  id uuid default gen_random_uuid() primary key,
  guest_name text not null,
  room_number text,
  check_in date not null,
  check_out date not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED')),
  company_id uuid references public.companies(id) on delete set null,
  total_amount numeric(12,2) not null default 0,
  reservation_code text not null unique,
  cost_center text,
  billing_obs text,
  tariff numeric(12,2) not null default 0,
  category text not null default 'executivo',
  guests_per_uh integer not null default 1,
  contact_phone text,
  contact_email text,
  source text not null default 'MANUAL',
  adults integer not null default 1,
  children integer not null default 0,
  iss_tax numeric(5,2) not null default 0,
  service_tax numeric(5,2) not null default 0,
  payment_method text default 'BILLED',
  fiscal_data text,
  billing_info text,
  requested_by text,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.rooms (
  id uuid default gen_random_uuid() primary key,
  room_number text not null unique,
  floor integer not null,
  category text not null,
  sea_view boolean not null default false,
  status text not null default 'available' check (status in ('available', 'occupied', 'maintenance', 'reserved')),
  housekeeping_status text not null default 'clean' check (housekeeping_status in ('clean', 'dirty', 'inspected', 'out_of_order')),
  maintenance_notes text,
  last_cleaned_at timestamptz,
  is_virtual boolean default false,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);
-- Compat: garante coluna sea_view em bases antigas
alter table public.rooms add column if not exists sea_view boolean not null default false;

create table if not exists public.folio_charges (
  id uuid default gen_random_uuid() primary key,
  reservation_id uuid references public.reservations(id) on delete cascade not null,
  room_number text,
  charge_date date not null default current_date,
  description text not null,
  quantity numeric(10,2) not null default 1,
  unit_value numeric(12,2) not null default 0,
  total_value numeric(12,2) generated always as (quantity * unit_value) stored,
  charge_type text not null default 'outro' check (
    charge_type in ('diaria', 'servico', 'alimento', 'bebida', 'lavanderia', 'estorno', 'outro')
  ),
  posted_by uuid references auth.users(id),
  created_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.pos_menu_items (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  category text not null default 'food' check (category in ('food', 'beverage', 'service', 'other')),
  price numeric(12,2) not null default 0,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.pos_orders (
  id uuid default gen_random_uuid() primary key,
  reservation_id uuid references public.reservations(id) on delete set null,
  room_number text,
  guest_name text,
  status text not null default 'open' check (status in ('open', 'posted', 'paid', 'cancelled')),
  payment_method text not null default 'room' check (payment_method in ('room', 'cash', 'card', 'pix')),
  subtotal numeric(12,2) not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.pos_order_items (
  id uuid default gen_random_uuid() primary key,
  order_id uuid references public.pos_orders(id) on delete cascade not null,
  menu_item_id uuid references public.pos_menu_items(id) on delete set null,
  item_name text not null,
  category text not null default 'food',
  quantity numeric(10,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  total_value numeric(12,2) generated always as (quantity * unit_price) stored,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.maintenance_tickets (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references public.rooms(id) on delete set null,
  room_number text,
  title text not null,
  description text,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'cancelled')),
  assigned_to uuid references auth.users(id),
  reported_by uuid references auth.users(id),
  due_at timestamptz,
  started_at timestamptz,
  resolved_at timestamptz,
  status_reason text,
  resolution_notes text,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.maintenance_notification_logs (
  id uuid default gen_random_uuid() primary key,
  ticket_id uuid references public.maintenance_tickets(id) on delete cascade,
  recipient_user_id uuid references auth.users(id) on delete set null,
  recipient_name text,
  recipient_phone text,
  channel text not null default 'phone_webhook',
  event_type text not null,
  status text not null default 'queued',
  payload jsonb,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.lost_found_items (
  id uuid default gen_random_uuid() primary key,
  room_number text,
  guest_name text,
  item_name text not null,
  description text,
  status text not null default 'stored' check (status in ('stored', 'claimed', 'discarded')),
  storage_location text,
  found_by uuid references auth.users(id),
  claimed_by text,
  found_at timestamptz default timezone('utc', now()) not null,
  resolved_at timestamptz,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.shift_handovers (
  id uuid default gen_random_uuid() primary key,
  shift_date date not null default current_date,
  shift_name text not null check (shift_name in ('manha', 'tarde', 'noite')),
  summary text not null,
  open_items text,
  created_by uuid references auth.users(id),
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.reservation_requests (
  id uuid default gen_random_uuid() primary key,
  guest_name text not null,
  check_in date not null,
  check_out date not null,
  status text not null default 'REQUESTED' check (status in ('REQUESTED', 'APPROVED', 'REJECTED')),
  company_id uuid references public.companies(id) on delete set null,
  total_amount numeric(12,2) not null default 0,
  reservation_code text not null,
  cost_center text,
  billing_obs text,
  tariff numeric(12,2) not null default 0,
  category text not null default 'executivo',
  guests_per_uh integer not null default 1,
  contact_phone text,
  contact_email text,
  source text not null default 'PORTAL',
  adults integer not null default 1,
  children integer not null default 0,
  iss_tax numeric(5,2) not null default 0,
  service_tax numeric(5,2) not null default 0,
  payment_method text,
  fiscal_data text,
  billing_info text,
  requested_by text,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

alter table public.reservations add column if not exists contact_email text;
alter table public.reservations add column if not exists source text not null default 'MANUAL';
alter table public.reservations add column if not exists adults integer not null default 1;
alter table public.reservations add column if not exists children integer not null default 0;
alter table public.reservation_requests add column if not exists contact_email text;
alter table public.reservation_requests add column if not exists source text not null default 'PORTAL';
alter table public.reservation_requests add column if not exists adults integer not null default 1;
alter table public.reservation_requests add column if not exists children integer not null default 0;

create table if not exists public.hotel_events (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  start_date date not null,
  end_date date not null,
  start_time text,
  end_time text,
  hall_name text not null,
  event_type text not null,
  attendees_count integer not null default 0,
  total_value numeric(12,2) not null default 0,
  status text not null default 'planned' check (status in ('planned', 'confirmed', 'ongoing', 'completed', 'cancelled')),
  items_included text,
  client_profile text,
  client_category text,
  check_info text,
  staff_roadmap text,
  important_notes text,
  company_id uuid references public.companies(id) on delete set null,
  os_number text not null unique,
  cancelled_at timestamptz,
  cancelled_by text,
  cancel_reason text,
  created_at timestamptz default timezone('utc', now()) not null,
  created_by uuid references auth.users(id),
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.files (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references public.companies(id) on delete set null,
  type text not null,
  period text,
  original_name text not null,
  storage_path text not null,
  upload_date timestamptz default timezone('utc', now()) not null,
  uploader_id uuid references auth.users(id),
  download_url text,
  due_date date,
  viewed_by_client boolean default false,
  viewed_at timestamptz,
  viewed_by_admin boolean default false,
  amount numeric(12,2),
  category text,
  status text default 'PENDING',
  cancelled_at timestamptz,
  cancelled_by text,
  cancel_reason text,
  proof_url text,
  proof_date timestamptz,
  dispute_reason text,
  dispute_images jsonb,
  dispute_at timestamptz,
  dispute_response text,
  dispute_resolved_at timestamptz,
  is_deleted boolean default false,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  billing_notifications_sent jsonb,
  tracking_stage text,
  tracking_status text,
  tracking_notes text,
  tracking_updated_at timestamptz,
  tracking_updated_by text,
  nh text,
  event_os_number text,
  reservation_code text,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.audit_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id),
  user_name text,
  action text not null,
  details text,
  type text not null default 'update',
  timestamp timestamptz default timezone('utc', now()) not null
);

create table if not exists public.notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  message text not null,
  read boolean default false,
  link text,
  timestamp timestamptz default timezone('utc', now()) not null
);

create table if not exists public.bank_accounts (
  id uuid default gen_random_uuid() primary key,
  institution text not null,
  bank_name text not null,
  agency text not null,
  account text not null,
  pix_key text not null,
  is_default boolean default false,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.tariffs (
  id uuid default gen_random_uuid() primary key,
  company_name text not null,
  base_rate numeric(12,2) not null,
  percentage numeric(5,2) not null,
  room_type text not null,
  category text not null,
  description text,
  created_by uuid references auth.users(id),
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

-- Tarifas publicas (motor de reservas da landing page) — separadas das tarifas corporativas
create table if not exists public.public_rates (
  id uuid default gen_random_uuid() primary key,
  category text not null check (category in ('executivo', 'master', 'suite presidencial')),
  label text not null,
  start_date date not null,
  end_date date not null,
  weekday_rate numeric(12,2) not null check (weekday_rate >= 0),
  weekend_rate numeric(12,2) check (weekend_rate is null or weekend_rate >= 0),
  guests_included int not null default 2 check (guests_included >= 1),
  extra_guest_fee numeric(12,2) not null default 0 check (extra_guest_fee >= 0),
  min_nights int not null default 1 check (min_nights >= 1),
  active boolean not null default true,
  priority int not null default 0,
  description text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (end_date >= start_date)
);
create index if not exists idx_public_rates_active on public.public_rates(active, category, start_date, end_date);
create index if not exists idx_public_rates_priority on public.public_rates(priority desc, created_at desc);
alter table public.public_rates enable row level security;
create policy "public_rates_select_staff" on public.public_rates
  for select to authenticated using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'reservations', 'manager'))
  );
create policy "public_rates_manage_staff" on public.public_rates
  for all to authenticated using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'reservations', 'manager'))
  ) with check (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'reservations', 'manager'))
  );

-- Bloqueios de datas no motor de reservas diretas
-- category null = bloqueia todas as categorias; caso contrario, apenas a categoria especificada
create table if not exists public.booking_blocked_dates (
  id uuid default gen_random_uuid() primary key,
  category text check (category is null or category in ('executivo', 'master', 'suite presidencial')),
  start_date date not null,
  end_date date not null,
  reason text,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (end_date >= start_date)
);
create index if not exists idx_booking_blocked_dates_active on public.booking_blocked_dates(active, category, start_date, end_date);
alter table public.booking_blocked_dates enable row level security;
create policy "booking_blocked_dates_select_staff" on public.booking_blocked_dates
  for select to authenticated using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'reservations', 'manager'))
  );
create policy "booking_blocked_dates_manage_staff" on public.booking_blocked_dates
  for all to authenticated using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'reservations', 'manager'))
  ) with check (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'reservations', 'manager'))
  );

-- Subscricoes de Web Push por dispositivo/usuario
create table if not exists public.push_subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  endpoint text not null,
  subscription jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(user_id, endpoint)
);
create index if not exists idx_push_subscriptions_user on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
create policy "push_subscriptions_own" on public.push_subscriptions
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "push_subscriptions_service" on public.push_subscriptions
  for select to service_role using (true);

create table if not exists public.bank_statements (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  period text,
  transactions jsonb not null default '[]'::jsonb,
  created_by text not null,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.app_settings (
  id text primary key,
  value text,
  updated_at timestamptz default timezone('utc', now()) not null,
  updated_by uuid references auth.users(id)
);

create table if not exists public.night_audits (
  id uuid default gen_random_uuid() primary key,
  audit_date date not null,
  status text not null default 'open' check (status in ('open', 'closed', 'reopened')),
  occupancy_rate numeric(5,2) not null default 0,
  room_revenue numeric(12,2) not null default 0,
  pos_revenue numeric(12,2) not null default 0,
  pending_items integer not null default 0,
  notes text,
  closed_by uuid references auth.users(id),
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.rate_rules (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  category text not null,
  season_name text,
  start_date date not null,
  end_date date not null,
  base_rate numeric(12,2) not null default 0,
  min_nights integer not null default 1,
  weekday_multiplier numeric(8,4) not null default 1,
  weekend_multiplier numeric(8,4) not null default 1,
  occupancy_trigger numeric(5,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.rate_shopper_competitors (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  city text not null,
  locality text,
  address text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  source text not null default 'manual',
  observed_rate numeric(12,2),
  category text,
  notes text,
  last_checked_at timestamptz,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.fiscal_jobs (
  id uuid default gen_random_uuid() primary key,
  reservation_code text,
  document_type text not null default 'nfse' check (document_type in ('nfse', 'rps', 'invoice')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'issued', 'error', 'cancelled')),
  amount numeric(12,2) not null default 0,
  payload jsonb,
  error_message text,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.guest_profiles (
  id uuid default gen_random_uuid() primary key,
  full_name text not null,
  email text,
  phone text,
  vip_level text not null default 'standard' check (vip_level in ('standard', 'vip', 'blacklist')),
  preferences text,
  restrictions text,
  consent_lgpd boolean not null default false,
  last_stay_at date,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.inventory_items (
  id uuid default gen_random_uuid() primary key,
  sku text not null unique,
  name text not null,
  department text not null default 'restaurant' check (department in ('restaurant', 'housekeeping', 'maintenance', 'frontdesk')),
  quantity numeric(12,2) not null default 0,
  min_quantity numeric(12,2) not null default 0,
  unit_cost numeric(12,2) not null default 0,
  supplier text,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.cash_sessions (
  id uuid default gen_random_uuid() primary key,
  opened_by uuid references auth.users(id),
  closed_by uuid references auth.users(id),
  department text not null default 'restaurant' check (department in ('restaurant', 'frontdesk')),
  opening_amount numeric(12,2) not null default 0,
  closing_amount numeric(12,2),
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_at timestamptz default timezone('utc', now()) not null,
  closed_at timestamptz,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.guest_service_requests (
  id uuid default gen_random_uuid() primary key,
  guest_name text not null,
  room_number text,
  request_type text not null default 'amenity' check (request_type in ('pre_checkin', 'amenity', 'maintenance', 'late_checkout', 'document')),
  status text not null default 'new' check (status in ('new', 'in_progress', 'done', 'cancelled')),
  notes text,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.hotel_properties (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  code text not null unique,
  city text not null,
  status text not null default 'active' check (status in ('active', 'inactive', 'opening')),
  rooms_count integer not null default 0,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.group_blocks (
  id uuid default gen_random_uuid() primary key,
  property_id uuid references public.hotel_properties(id),
  group_name text not null,
  company_name text,
  status text not null default 'tentative' check (status in ('prospect', 'tentative', 'confirmed', 'released', 'cancelled')),
  arrival_date date not null,
  departure_date date not null,
  rooms_blocked integer not null default 0,
  rooms_picked_up integer not null default 0,
  cut_off_date date,
  rate numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.preventive_maintenance_tasks (
  id uuid default gen_random_uuid() primary key,
  asset_name text not null,
  room_number text,
  frequency text not null default 'monthly' check (frequency in ('daily', 'weekly', 'monthly', 'quarterly', 'annual')),
  next_due_at date not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'in_progress', 'done', 'overdue')),
  estimated_cost numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.guest_messages (
  id uuid default gen_random_uuid() primary key,
  reservation_id uuid references public.reservations(id),
  guest_name text not null,
  channel text not null default 'whatsapp' check (channel in ('whatsapp', 'email', 'sms', 'internal')),
  template_name text not null,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sent', 'failed')),
  scheduled_at timestamptz,
  body text not null,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.accounts_receivable (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references public.companies(id),
  debtor_name text not null,
  document_number text,
  amount numeric(12,2) not null default 0,
  due_date date not null,
  status text not null default 'open' check (status in ('open', 'partial', 'paid', 'overdue', 'written_off')),
  aging_bucket text,
  notes text,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.payment_controls (
  id uuid default gen_random_uuid() primary key,
  payer_name text not null,
  payment_type text not null default 'pix' check (payment_type in ('pix', 'credit_card', 'debit_card', 'cash', 'bank_transfer', 'manual_preauth')),
  amount numeric(12,2) not null default 0,
  status text not null default 'pending' check (status in ('pending', 'authorized', 'captured', 'reconciled', 'cancelled')),
  reconciliation_ref text,
  notes text,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.purchase_requests (
  id uuid default gen_random_uuid() primary key,
  department text not null default 'admin' check (department in ('restaurant', 'housekeeping', 'maintenance', 'frontdesk', 'admin')),
  item_name text not null,
  quantity numeric(12,2) not null default 1,
  estimated_cost numeric(12,2) not null default 0,
  supplier text,
  status text not null default 'requested' check (status in ('requested', 'quoted', 'approved', 'ordered', 'received', 'cancelled')),
  requested_by uuid references auth.users(id),
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.laundry_batches (
  id uuid default gen_random_uuid() primary key,
  batch_code text not null unique,
  department text not null default 'rooms' check (department in ('rooms', 'restaurant', 'spa', 'events')),
  item_type text not null,
  quantity_sent numeric(12,2) not null default 0,
  quantity_returned numeric(12,2) not null default 0,
  losses numeric(12,2) not null default 0,
  status text not null default 'sent' check (status in ('sent', 'washing', 'returned', 'loss_reported')),
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.minibar_controls (
  id uuid default gen_random_uuid() primary key,
  room_number text not null,
  item_name text not null,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  status text not null default 'pending' check (status in ('pending', 'posted', 'replenished', 'divergence')),
  posted_folio_charge_id uuid references public.folio_charges(id),
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.revenue_forecasts (
  id uuid default gen_random_uuid() primary key,
  forecast_date date not null,
  demand_level text not null default 'medium' check (demand_level in ('low', 'medium', 'high', 'compression')),
  expected_occupancy numeric(5,2) not null default 0,
  suggested_rate numeric(12,2) not null default 0,
  pickup_rooms integer not null default 0,
  city_event text,
  notes text,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.security_controls (
  id uuid default gen_random_uuid() primary key,
  control_name text not null,
  category text not null default 'audit' check (category in ('password', 'session', 'backup', 'audit', 'monitoring')),
  status text not null default 'planned' check (status in ('planned', 'active', 'review', 'incident')),
  owner text,
  last_review_at date,
  notes text,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.operational_tasks (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  origin_department text not null default 'admin' check (origin_department in ('reservations', 'reception', 'maintenance', 'finance', 'restaurant', 'events', 'housekeeping', 'admin')),
  target_department text not null check (target_department in ('reservations', 'reception', 'maintenance', 'finance', 'restaurant', 'events', 'housekeeping', 'admin')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'waiting_other_department', 'done', 'cancelled')),
  due_at timestamptz,
  assigned_to uuid references auth.users(id),
  created_by uuid references auth.users(id),
  related_type text check (related_type in ('reservation', 'room', 'event', 'folio', 'invoice', 'maintenance', 'pos', 'group', 'purchase', 'minibar', 'laundry', 'other')),
  related_id text,
  related_label text,
  last_note text,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);

create table if not exists public.operational_task_history (
  id uuid default gen_random_uuid() primary key,
  task_id uuid references public.operational_tasks(id) on delete cascade,
  user_id uuid references auth.users(id),
  action text not null,
  note text,
  created_at timestamptz default timezone('utc', now()) not null
);

-- Compatibility migrations for projects that already had an older schema.
alter table public.companies add column if not exists slug text;
alter table public.companies add column if not exists email text;
alter table public.companies add column if not exists phone text;
alter table public.companies add column if not exists address text;
alter table public.companies add column if not exists status text default 'active';
alter table public.companies add column if not exists updated_at timestamptz default timezone('utc', now()) not null;

alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists photo_url text;
alter table public.profiles add column if not exists permissions jsonb;
alter table public.profiles add column if not exists updated_at timestamptz default timezone('utc', now()) not null;
alter table public.maintenance_tickets add column if not exists started_at timestamptz;
alter table public.maintenance_tickets add column if not exists status_reason text;
alter table public.maintenance_tickets add column if not exists resolution_notes text;

alter table public.reservations add column if not exists checked_in_at timestamptz;
alter table public.reservations add column if not exists checked_out_at timestamptz;

alter table public.files add column if not exists uploader_id uuid references auth.users(id);
alter table public.files add column if not exists upload_date timestamptz default timezone('utc', now()) not null;
alter table public.files add column if not exists download_url text;
alter table public.files add column if not exists viewed_at timestamptz;
alter table public.files add column if not exists viewed_by_admin boolean default false;
alter table public.files add column if not exists proof_url text;
alter table public.files add column if not exists proof_date timestamptz;
alter table public.files add column if not exists dispute_reason text;
alter table public.files add column if not exists dispute_images jsonb;
alter table public.files add column if not exists dispute_at timestamptz;
alter table public.files add column if not exists cancelled_at timestamptz;
alter table public.files add column if not exists cancelled_by text;
alter table public.files add column if not exists cancel_reason text;
alter table public.files add column if not exists deleted_at timestamptz;
alter table public.files add column if not exists deleted_by uuid references auth.users(id);
alter table public.files add column if not exists billing_notifications_sent jsonb;
alter table public.files add column if not exists tracking_stage text;
alter table public.files add column if not exists tracking_status text;
alter table public.files add column if not exists tracking_notes text;
alter table public.files add column if not exists tracking_updated_at timestamptz;
alter table public.files add column if not exists tracking_updated_by text;
alter table public.files add column if not exists nh text;
alter table public.files add column if not exists event_os_number text;
alter table public.files add column if not exists reservation_code text;
alter table public.files add column if not exists updated_at timestamptz default timezone('utc', now()) not null;

-- Helpers
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() limit 1;
$$;

create or replace function public.current_user_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.profiles where id = auth.uid() limit 1;
$$;

create or replace function public.current_user_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role(), '') in (
    'admin', 'manager', 'reservations', 'faturamento', 'reception', 'finance', 'eventos', 'restaurant', 'housekeeping', 'maintenance'
  );
$$;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role(), '') = 'admin';
$$;

create or replace function public.current_user_can_manage_users()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and (
        role in ('admin', 'faturamento')
        or coalesce((permissions ->> 'canCreateUsers')::boolean, false)
      )
  );
$$;

create or replace function public.current_user_can_manage_finance()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role(), '') in ('admin', 'manager', 'faturamento', 'finance');
$$;

create or replace function public.current_user_can_manage_reservations()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role(), '') in ('admin', 'manager', 'reservations', 'reception');
$$;

create or replace function public.current_user_can_manage_events()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role(), '') in ('admin', 'manager', 'eventos', 'reservations', 'finance');
$$;

create or replace function public.current_user_can_manage_housekeeping()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role(), '') in ('admin', 'manager', 'reception', 'housekeeping', 'maintenance');
$$;

create or replace function public.current_user_can_view_operations()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role(), '') in (
    'admin', 'manager', 'reception', 'reservations', 'faturamento', 'finance', 'eventos', 'restaurant', 'housekeeping', 'maintenance'
  );
$$;

create or replace function public.current_user_can_manage_operations()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role(), '') in ('admin', 'manager', 'reception', 'eventos', 'restaurant', 'housekeeping', 'maintenance');
$$;

create or replace function public.current_user_can_view_pos()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role(), '') in ('admin', 'manager', 'reception', 'faturamento', 'finance', 'eventos', 'restaurant');
$$;

create or replace function public.current_user_can_manage_pos()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role(), '') in ('admin', 'reception', 'restaurant');
$$;

create or replace function public.current_user_can_view_professional_tools()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role(), '') in (
    'admin', 'manager', 'reservations', 'faturamento', 'finance', 'reception'
  );
$$;

create or replace function public.current_user_can_manage_professional_tools()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role(), '') in ('admin', 'manager', 'faturamento', 'finance');
$$;

create or replace function public.current_user_can_manage_rate_shopper()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role(), '') in ('admin', 'manager', 'reservations');
$$;

create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  can_manage boolean;
begin
  can_manage := public.current_user_can_manage_users();

  if tg_op = 'INSERT' then
    if auth.uid() = new.id and not can_manage then
      new.role := 'client';
      new.permissions := null;
      new.company_id := null;
    end if;
    return new;
  end if;

  if auth.uid() = old.id and not can_manage then
    new.role := old.role;
    new.permissions := old.permissions;
    new.company_id := old.company_id;
  end if;

  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'companies', 'profiles', 'reservations', 'reservation_requests', 'hotel_events',
    'rooms', 'folio_charges', 'pos_menu_items', 'pos_orders', 'maintenance_tickets', 'maintenance_notification_logs', 'lost_found_items', 'shift_handovers',
    'files', 'audit_logs', 'notifications', 'bank_accounts', 'tariffs',
    'bank_statements', 'app_settings', 'night_audits', 'rate_rules', 'rate_shopper_competitors', 'fiscal_jobs',
    'guest_profiles', 'inventory_items', 'cash_sessions', 'guest_service_requests',
    'hotel_properties', 'group_blocks', 'preventive_maintenance_tasks', 'guest_messages',
    'accounts_receivable', 'payment_controls', 'purchase_requests', 'laundry_batches',
    'minibar_controls', 'revenue_forecasts', 'security_controls', 'operational_tasks'
  ] loop
    execute format('drop trigger if exists set_%s_updated_at on public.%I', table_name, table_name);
    if table_name not in ('audit_logs', 'notifications') then
      execute format(
        'create trigger set_%s_updated_at before update on public.%I for each row execute function public.handle_updated_at()',
        table_name,
        table_name
      );
    end if;
  end loop;
end $$;

drop trigger if exists protect_profile_privileged_fields on public.profiles;
create trigger protect_profile_privileged_fields
before insert or update on public.profiles
for each row execute function public.protect_profile_privileged_fields();

grant execute on function public.current_user_role() to authenticated, service_role;
grant execute on function public.current_user_company_id() to authenticated, service_role;
grant execute on function public.current_user_is_staff() to authenticated, service_role;
grant execute on function public.current_user_is_admin() to authenticated, service_role;
grant execute on function public.current_user_can_manage_users() to authenticated, service_role;
grant execute on function public.current_user_can_manage_finance() to authenticated, service_role;
grant execute on function public.current_user_can_manage_reservations() to authenticated, service_role;
grant execute on function public.current_user_can_manage_events() to authenticated, service_role;
grant execute on function public.current_user_can_manage_housekeeping() to authenticated, service_role;
grant execute on function public.current_user_can_view_operations() to authenticated, service_role;
grant execute on function public.current_user_can_manage_operations() to authenticated, service_role;
grant execute on function public.current_user_can_view_pos() to authenticated, service_role;
grant execute on function public.current_user_can_manage_pos() to authenticated, service_role;
grant execute on function public.current_user_can_view_professional_tools() to authenticated, service_role;
grant execute on function public.current_user_can_manage_professional_tools() to authenticated, service_role;
grant execute on function public.current_user_can_manage_rate_shopper() to authenticated, service_role;

-- Indexes
create index if not exists idx_profiles_company on public.profiles(company_id);
create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_companies_name on public.companies(name);
create index if not exists idx_reservations_company on public.reservations(company_id);
create index if not exists idx_reservations_code on public.reservations(reservation_code);
create index if not exists idx_rooms_number on public.rooms(room_number);
create index if not exists idx_rooms_floor on public.rooms(floor);
create index if not exists idx_rooms_category on public.rooms(category);
create index if not exists idx_rooms_sea_view on public.rooms(sea_view) where sea_view = true;
create index if not exists idx_folio_reservation on public.folio_charges(reservation_id);
create index if not exists idx_pos_orders_created on public.pos_orders(created_at desc);
create index if not exists idx_pos_orders_reservation on public.pos_orders(reservation_id);
create index if not exists idx_pos_items_order on public.pos_order_items(order_id);
create index if not exists idx_maintenance_status on public.maintenance_tickets(status, priority);
create index if not exists idx_maintenance_room on public.maintenance_tickets(room_number);
create index if not exists idx_maintenance_notifications_ticket on public.maintenance_notification_logs(ticket_id, created_at desc);
create index if not exists idx_lost_found_status on public.lost_found_items(status, found_at desc);
create index if not exists idx_shift_handovers_date on public.shift_handovers(shift_date desc);
create index if not exists idx_requests_company on public.reservation_requests(company_id);
create index if not exists idx_events_company on public.hotel_events(company_id);
create index if not exists idx_events_os on public.hotel_events(os_number);
create index if not exists idx_files_company on public.files(company_id);
create index if not exists idx_files_status on public.files(status);
create index if not exists idx_files_reservation_code on public.files(reservation_code);
create index if not exists idx_audit_timestamp on public.audit_logs(timestamp desc);
create index if not exists idx_notifications_user on public.notifications(user_id, timestamp desc);
create index if not exists idx_night_audits_date on public.night_audits(audit_date desc);
create index if not exists idx_rate_rules_dates on public.rate_rules(start_date, end_date);
create index if not exists idx_rate_shopper_city on public.rate_shopper_competitors(city, last_checked_at desc);
create index if not exists idx_fiscal_jobs_status on public.fiscal_jobs(status, created_at desc);
create index if not exists idx_guest_profiles_name on public.guest_profiles(full_name);
create index if not exists idx_inventory_department on public.inventory_items(department, name);
create index if not exists idx_cash_sessions_status on public.cash_sessions(status, opened_at desc);
create index if not exists idx_guest_requests_status on public.guest_service_requests(status, created_at desc);
create index if not exists idx_group_blocks_dates on public.group_blocks(arrival_date, departure_date);
create index if not exists idx_preventive_due on public.preventive_maintenance_tasks(status, next_due_at);
create index if not exists idx_guest_messages_status on public.guest_messages(status, created_at desc);
create index if not exists idx_accounts_receivable_due on public.accounts_receivable(status, due_date);
create index if not exists idx_payment_controls_status on public.payment_controls(status, created_at desc);
create index if not exists idx_purchase_requests_status on public.purchase_requests(status, created_at desc);
create index if not exists idx_laundry_batches_status on public.laundry_batches(status, created_at desc);
create index if not exists idx_minibar_room on public.minibar_controls(room_number, status);
create index if not exists idx_revenue_forecasts_date on public.revenue_forecasts(forecast_date);
create index if not exists idx_security_controls_category on public.security_controls(category, status);
create index if not exists idx_hotel_properties_code on public.hotel_properties(code);
create index if not exists idx_operational_tasks_department on public.operational_tasks(target_department, status, due_at);
create index if not exists idx_operational_tasks_related on public.operational_tasks(related_type, related_id);
create index if not exists idx_operational_task_history_task on public.operational_task_history(task_id, created_at desc);

-- RLS
alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.reservations enable row level security;
alter table public.rooms enable row level security;
alter table public.folio_charges enable row level security;
alter table public.pos_menu_items enable row level security;
alter table public.pos_orders enable row level security;
alter table public.pos_order_items enable row level security;
alter table public.maintenance_tickets enable row level security;
alter table public.maintenance_notification_logs enable row level security;
alter table public.lost_found_items enable row level security;
alter table public.shift_handovers enable row level security;
alter table public.reservation_requests enable row level security;
alter table public.hotel_events enable row level security;
alter table public.files enable row level security;
alter table public.audit_logs enable row level security;
alter table public.notifications enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.tariffs enable row level security;
alter table public.bank_statements enable row level security;
alter table public.app_settings enable row level security;
alter table public.night_audits enable row level security;
alter table public.rate_rules enable row level security;
alter table public.rate_shopper_competitors enable row level security;
alter table public.fiscal_jobs enable row level security;
alter table public.guest_profiles enable row level security;
alter table public.inventory_items enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.guest_service_requests enable row level security;
alter table public.hotel_properties enable row level security;
alter table public.group_blocks enable row level security;
alter table public.preventive_maintenance_tasks enable row level security;
alter table public.guest_messages enable row level security;
alter table public.accounts_receivable enable row level security;
alter table public.payment_controls enable row level security;
alter table public.purchase_requests enable row level security;
alter table public.laundry_batches enable row level security;
alter table public.minibar_controls enable row level security;
alter table public.revenue_forecasts enable row level security;
alter table public.security_controls enable row level security;
alter table public.operational_tasks enable row level security;
alter table public.operational_task_history enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'companies', 'profiles', 'reservations', 'rooms', 'folio_charges',
        'maintenance_tickets', 'maintenance_notification_logs', 'lost_found_items', 'shift_handovers',
        'reservation_requests', 'hotel_events',
        'files', 'audit_logs', 'notifications', 'bank_accounts', 'tariffs',
        'bank_statements', 'app_settings', 'night_audits', 'rate_rules', 'rate_shopper_competitors', 'fiscal_jobs',
        'guest_profiles', 'inventory_items', 'cash_sessions', 'guest_service_requests',
        'hotel_properties', 'group_blocks', 'preventive_maintenance_tasks', 'guest_messages',
        'accounts_receivable', 'payment_controls', 'purchase_requests', 'laundry_batches',
        'minibar_controls', 'revenue_forecasts', 'security_controls', 'operational_tasks', 'operational_task_history'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  end loop;
end $$;

-- Profiles
create policy "profiles_select_scope" on public.profiles
  for select using (
    auth.uid() = id
    or public.current_user_can_manage_users()
    or (public.current_user_is_staff() and role in ('client', 'external_client'))
  );

create policy "profiles_bootstrap_own" on public.profiles
  for insert with check (auth.uid() = id or public.current_user_can_manage_users());

create policy "profiles_update_own_or_manager" on public.profiles
  for update using (auth.uid() = id or public.current_user_can_manage_users())
  with check (auth.uid() = id or public.current_user_can_manage_users());

-- Companies
create policy "companies_select_scope" on public.companies
  for select using (
    public.current_user_is_staff()
    or id = public.current_user_company_id()
  );

create policy "companies_manage_admin_or_events" on public.companies
  for all using (public.current_user_is_admin() or public.current_user_role() = 'eventos')
  with check (public.current_user_is_admin() or public.current_user_role() = 'eventos');

-- Reservations and requests
create policy "reservations_select_scope" on public.reservations
  for select using (
    public.current_user_is_staff()
    or company_id = public.current_user_company_id()
  );

create policy "reservations_manage_staff" on public.reservations
  for all using (public.current_user_can_manage_reservations())
  with check (public.current_user_can_manage_reservations());

-- Rooms and guest folio
create policy "rooms_select_staff" on public.rooms
  for select using (public.current_user_is_staff());

create policy "rooms_manage_reception" on public.rooms
  for all using (public.current_user_can_manage_housekeeping())
  with check (public.current_user_can_manage_housekeeping());

create policy "folio_select_scope" on public.folio_charges
  for select using (
    public.current_user_is_staff()
    or exists (
      select 1
      from public.reservations r
      where r.id = folio_charges.reservation_id
        and r.company_id = public.current_user_company_id()
    )
  );

create policy "folio_insert_staff" on public.folio_charges
  for insert with check (
    public.current_user_can_manage_reservations()
    or public.current_user_can_manage_finance()
    or public.current_user_can_manage_pos()
  );

create policy "folio_update_staff" on public.folio_charges
  for update using (
    public.current_user_can_manage_reservations()
    or public.current_user_can_manage_finance()
    or public.current_user_can_manage_pos()
  )
  with check (
    public.current_user_can_manage_reservations()
    or public.current_user_can_manage_finance()
    or public.current_user_can_manage_pos()
  );

create policy "folio_delete_reception_admin" on public.folio_charges
  for delete using (public.current_user_can_manage_housekeeping());

-- POS and restaurant
create policy "pos_menu_select_staff" on public.pos_menu_items
  for select using (public.current_user_can_view_pos());

create policy "pos_menu_manage_pos" on public.pos_menu_items
  for all using (public.current_user_can_manage_pos())
  with check (public.current_user_can_manage_pos());

create policy "pos_orders_select_staff" on public.pos_orders
  for select using (public.current_user_can_view_pos());

create policy "pos_orders_insert_pos" on public.pos_orders
  for insert with check (public.current_user_can_manage_pos());

create policy "pos_orders_update_pos" on public.pos_orders
  for update using (public.current_user_can_manage_pos())
  with check (public.current_user_can_manage_pos());

create policy "pos_order_items_select_staff" on public.pos_order_items
  for select using (
    public.current_user_can_view_pos()
    or exists (
      select 1
      from public.pos_orders o
      where o.id = pos_order_items.order_id
        and public.current_user_can_view_pos()
    )
  );

create policy "pos_order_items_insert_pos" on public.pos_order_items
  for insert with check (public.current_user_can_manage_pos());

-- Operations center
create policy "maintenance_select_operations" on public.maintenance_tickets
  for select using (public.current_user_can_view_operations());

create policy "maintenance_insert_operations" on public.maintenance_tickets
  for insert with check (public.current_user_can_manage_operations());

create policy "maintenance_update_operations" on public.maintenance_tickets
  for update using (public.current_user_can_manage_operations())
  with check (public.current_user_can_manage_operations());

create policy "maintenance_delete_admin" on public.maintenance_tickets
  for delete using (public.current_user_is_admin());

create policy "maintenance_notifications_select_operations" on public.maintenance_notification_logs
  for select using (public.current_user_can_view_operations());

create policy "maintenance_notifications_insert_service" on public.maintenance_notification_logs
  for insert with check (auth.role() = 'service_role');

create policy "lost_found_select_operations" on public.lost_found_items
  for select using (public.current_user_can_view_operations());

create policy "lost_found_insert_operations" on public.lost_found_items
  for insert with check (public.current_user_can_manage_operations());

create policy "lost_found_update_operations" on public.lost_found_items
  for update using (public.current_user_can_manage_operations())
  with check (public.current_user_can_manage_operations());

create policy "lost_found_delete_admin" on public.lost_found_items
  for delete using (public.current_user_is_admin());

create policy "handovers_select_operations" on public.shift_handovers
  for select using (public.current_user_can_view_operations());

create policy "handovers_insert_operations" on public.shift_handovers
  for insert with check (public.current_user_can_manage_operations());

create policy "handovers_delete_admin" on public.shift_handovers
  for delete using (public.current_user_is_admin());

create policy "requests_select_scope" on public.reservation_requests
  for select using (
    public.current_user_is_staff()
    or company_id = public.current_user_company_id()
  );

create policy "requests_client_create" on public.reservation_requests
  for insert with check (
    public.current_user_is_staff()
    or company_id = public.current_user_company_id()
  );

create policy "requests_staff_update_delete" on public.reservation_requests
  for all using (public.current_user_can_manage_reservations())
  with check (public.current_user_can_manage_reservations());

-- Events
create policy "events_select_scope" on public.hotel_events
  for select using (
    public.current_user_is_staff()
    or company_id = public.current_user_company_id()
  );

create policy "events_manage_staff" on public.hotel_events
  for all using (public.current_user_can_manage_events())
  with check (public.current_user_can_manage_events());

-- Files and finance
create policy "files_select_scope" on public.files
  for select using (
    public.current_user_is_staff()
    or company_id = public.current_user_company_id()
  );

create policy "files_insert_scope" on public.files
  for insert with check (
    public.current_user_can_manage_finance()
    or public.current_user_can_manage_reservations()
    or company_id = public.current_user_company_id()
  );

create policy "files_update_scope" on public.files
  for update using (
    public.current_user_can_manage_finance()
    or public.current_user_can_manage_reservations()
    or company_id = public.current_user_company_id()
  )
  with check (
    public.current_user_can_manage_finance()
    or public.current_user_can_manage_reservations()
    or company_id = public.current_user_company_id()
  );

create policy "files_delete_admin_finance" on public.files
  for delete using (public.current_user_can_manage_finance());

-- Audit and notifications
create policy "audit_select_admin" on public.audit_logs
  for select using (public.current_user_is_admin());

create policy "audit_insert_authenticated" on public.audit_logs
  for insert with check (auth.role() = 'authenticated');

create policy "notifications_select_own" on public.notifications
  for select using (auth.uid() = user_id);

create policy "notifications_insert_authenticated" on public.notifications
  for insert with check (auth.role() = 'authenticated');

create policy "notifications_update_own" on public.notifications
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Finance configuration
create policy "bank_accounts_select_finance" on public.bank_accounts
  for select using (public.current_user_can_manage_finance());

create policy "bank_accounts_manage_admin_finance" on public.bank_accounts
  for all using (public.current_user_can_manage_finance())
  with check (public.current_user_can_manage_finance());

create policy "tariffs_select_staff" on public.tariffs
  for select using (public.current_user_is_staff());

create policy "tariffs_manage_revenue" on public.tariffs
  for all using (
    public.current_user_is_admin()
    or public.current_user_role() in ('reservations', 'finance', 'faturamento')
  )
  with check (
    public.current_user_is_admin()
    or public.current_user_role() in ('reservations', 'finance', 'faturamento')
  );

create policy "bank_statements_select_finance" on public.bank_statements
  for select using (public.current_user_can_manage_finance());

create policy "bank_statements_manage_finance" on public.bank_statements
  for all using (public.current_user_can_manage_finance())
  with check (public.current_user_can_manage_finance());

create policy "app_settings_select_staff" on public.app_settings
  for select using (public.current_user_is_staff());

create policy "app_settings_manage_admin_finance" on public.app_settings
  for all using (public.current_user_can_manage_finance())
  with check (public.current_user_can_manage_finance());

-- Professional PMS modules
create policy "night_audits_select_professional" on public.night_audits
  for select using (public.current_user_can_view_professional_tools());

create policy "night_audits_manage_professional" on public.night_audits
  for all using (public.current_user_can_manage_professional_tools())
  with check (public.current_user_can_manage_professional_tools());

create policy "rate_rules_select_professional" on public.rate_rules
  for select using (public.current_user_can_view_professional_tools());

create policy "rate_rules_manage_professional" on public.rate_rules
  for all using (public.current_user_can_manage_professional_tools())
  with check (public.current_user_can_manage_professional_tools());

create policy "rate_shopper_select_professional" on public.rate_shopper_competitors
  for select using (public.current_user_can_view_professional_tools());

create policy "rate_shopper_manage_revenue" on public.rate_shopper_competitors
  for all using (public.current_user_can_manage_rate_shopper())
  with check (public.current_user_can_manage_rate_shopper());

create policy "fiscal_jobs_select_professional" on public.fiscal_jobs
  for select using (public.current_user_can_view_professional_tools());

create policy "fiscal_jobs_manage_professional" on public.fiscal_jobs
  for all using (public.current_user_can_manage_professional_tools())
  with check (public.current_user_can_manage_professional_tools());

create policy "guest_profiles_select_professional" on public.guest_profiles
  for select using (public.current_user_can_view_professional_tools());

create policy "guest_profiles_manage_professional" on public.guest_profiles
  for all using (public.current_user_can_manage_professional_tools())
  with check (public.current_user_can_manage_professional_tools());

create policy "inventory_select_professional" on public.inventory_items
  for select using (public.current_user_can_view_professional_tools() or public.current_user_can_view_pos() or public.current_user_can_view_operations());

create policy "inventory_manage_professional" on public.inventory_items
  for all using (public.current_user_can_manage_professional_tools())
  with check (public.current_user_can_manage_professional_tools());

create policy "cash_sessions_select_professional" on public.cash_sessions
  for select using (public.current_user_can_view_professional_tools() or public.current_user_can_view_pos());

create policy "cash_sessions_manage_professional" on public.cash_sessions
  for all using (public.current_user_can_manage_professional_tools() or public.current_user_can_manage_pos())
  with check (public.current_user_can_manage_professional_tools() or public.current_user_can_manage_pos());

create policy "guest_requests_select_professional" on public.guest_service_requests
  for select using (public.current_user_can_view_professional_tools() or public.current_user_can_manage_operations());

create policy "guest_requests_manage_professional" on public.guest_service_requests
  for all using (public.current_user_can_manage_professional_tools() or public.current_user_can_manage_operations())
  with check (public.current_user_can_manage_professional_tools() or public.current_user_can_manage_operations());

create policy "hotel_properties_select_professional" on public.hotel_properties
  for select using (public.current_user_can_view_professional_tools());

create policy "hotel_properties_manage_professional" on public.hotel_properties
  for all using (public.current_user_can_manage_professional_tools())
  with check (public.current_user_can_manage_professional_tools());

create policy "group_blocks_select_professional" on public.group_blocks
  for select using (public.current_user_can_view_professional_tools());

create policy "group_blocks_manage_revenue" on public.group_blocks
  for all using (public.current_user_can_manage_professional_tools() or public.current_user_role() = 'reservations')
  with check (public.current_user_can_manage_professional_tools() or public.current_user_role() = 'reservations');

create policy "preventive_tasks_select_operations" on public.preventive_maintenance_tasks
  for select using (public.current_user_can_view_professional_tools() or public.current_user_can_view_operations() or public.current_user_can_manage_housekeeping());

create policy "preventive_tasks_manage_operations" on public.preventive_maintenance_tasks
  for all using (public.current_user_can_manage_professional_tools() or public.current_user_can_manage_operations() or public.current_user_can_manage_housekeeping())
  with check (public.current_user_can_manage_professional_tools() or public.current_user_can_manage_operations() or public.current_user_can_manage_housekeeping());

create policy "guest_messages_select_staff" on public.guest_messages
  for select using (public.current_user_is_staff());

create policy "guest_messages_manage_staff" on public.guest_messages
  for all using (public.current_user_can_manage_professional_tools() or public.current_user_role() in ('reservations', 'reception', 'manager'))
  with check (public.current_user_can_manage_professional_tools() or public.current_user_role() in ('reservations', 'reception', 'manager'));

create policy "accounts_receivable_select_finance" on public.accounts_receivable
  for select using (public.current_user_can_manage_finance() or public.current_user_can_view_professional_tools());

create policy "accounts_receivable_manage_finance" on public.accounts_receivable
  for all using (public.current_user_can_manage_finance())
  with check (public.current_user_can_manage_finance());

create policy "payment_controls_select_finance" on public.payment_controls
  for select using (public.current_user_can_manage_finance() or public.current_user_can_view_professional_tools());

create policy "payment_controls_manage_finance" on public.payment_controls
  for all using (public.current_user_can_manage_finance())
  with check (public.current_user_can_manage_finance());

create policy "purchase_requests_select_professional" on public.purchase_requests
  for select using (public.current_user_can_view_professional_tools() or public.current_user_can_view_operations() or public.current_user_can_view_pos());

create policy "purchase_requests_manage_professional" on public.purchase_requests
  for all using (public.current_user_can_manage_professional_tools())
  with check (public.current_user_can_manage_professional_tools());

create policy "laundry_batches_select_operations" on public.laundry_batches
  for select using (public.current_user_can_view_professional_tools() or public.current_user_can_manage_housekeeping());

create policy "laundry_batches_manage_operations" on public.laundry_batches
  for all using (public.current_user_can_manage_professional_tools() or public.current_user_can_manage_housekeeping())
  with check (public.current_user_can_manage_professional_tools() or public.current_user_can_manage_housekeeping());

create policy "minibar_controls_select_operations" on public.minibar_controls
  for select using (public.current_user_can_view_professional_tools() or public.current_user_can_manage_housekeeping() or public.current_user_can_view_pos());

create policy "minibar_controls_manage_operations" on public.minibar_controls
  for all using (public.current_user_can_manage_professional_tools() or public.current_user_can_manage_housekeeping() or public.current_user_can_manage_pos())
  with check (public.current_user_can_manage_professional_tools() or public.current_user_can_manage_housekeeping() or public.current_user_can_manage_pos());

create policy "revenue_forecasts_select_professional" on public.revenue_forecasts
  for select using (public.current_user_can_view_professional_tools());

create policy "revenue_forecasts_manage_revenue" on public.revenue_forecasts
  for all using (public.current_user_can_manage_professional_tools() or public.current_user_role() = 'reservations')
  with check (public.current_user_can_manage_professional_tools() or public.current_user_role() = 'reservations');

create policy "security_controls_select_professional" on public.security_controls
  for select using (public.current_user_can_view_professional_tools());

create policy "security_controls_manage_professional" on public.security_controls
  for all using (public.current_user_can_manage_professional_tools())
  with check (public.current_user_can_manage_professional_tools());

create policy "operational_tasks_select_staff" on public.operational_tasks
  for select using (
    public.current_user_is_staff()
    and (
      public.current_user_role() in ('admin', 'manager')
      or target_department = case public.current_user_role()
        when 'reservations' then 'reservations'
        when 'reception' then 'reception'
        when 'maintenance' then 'maintenance'
        when 'finance' then 'finance'
        when 'faturamento' then 'finance'
        when 'restaurant' then 'restaurant'
        when 'eventos' then 'events'
        when 'housekeeping' then 'housekeeping'
        else target_department
      end
      or origin_department = case public.current_user_role()
        when 'reservations' then 'reservations'
        when 'reception' then 'reception'
        when 'maintenance' then 'maintenance'
        when 'finance' then 'finance'
        when 'faturamento' then 'finance'
        when 'restaurant' then 'restaurant'
        when 'eventos' then 'events'
        when 'housekeeping' then 'housekeeping'
        else origin_department
      end
    )
  );

create policy "operational_tasks_insert_staff" on public.operational_tasks
  for insert with check (public.current_user_is_staff());

create policy "operational_tasks_update_staff" on public.operational_tasks
  for update using (public.current_user_is_staff())
  with check (public.current_user_is_staff());

create policy "operational_task_history_select_staff" on public.operational_task_history
  for select using (
    exists (
      select 1
      from public.operational_tasks task
      where task.id = operational_task_history.task_id
    )
  );

create policy "operational_task_history_insert_staff" on public.operational_task_history
  for insert with check (public.current_user_is_staff());

-- Storage policies. Create a private bucket named "files" before applying.
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'royalpms_%'
  loop
    execute format('drop policy if exists %I on storage.objects', pol.policyname);
  end loop;
end $$;

create policy "royalpms_files_read_authenticated" on storage.objects
  for select using (bucket_id = 'files' and auth.role() = 'authenticated');

create policy "royalpms_files_upload_authenticated" on storage.objects
  for insert with check (bucket_id = 'files' and auth.role() = 'authenticated');

create policy "royalpms_files_update_staff" on storage.objects
  for update using (bucket_id = 'files' and public.current_user_is_staff())
  with check (bucket_id = 'files' and public.current_user_is_staff());

create policy "royalpms_files_delete_finance" on storage.objects
  for delete using (bucket_id = 'files' and public.current_user_can_manage_finance());

-- System virtual rooms used by special folio flows.
insert into public.rooms (room_number, floor, category, status, housekeeping_status, is_virtual)
values
  ('CC', 0, 'sistema', 'occupied', 'inspected', true),
  ('ADM', 0, 'sistema', 'occupied', 'inspected', true)
on conflict (room_number) do nothing;

insert into public.pos_menu_items (name, category, price, active)
values
  ('Cafe da manha extra', 'food', 45.00, true),
  ('Jantar executivo', 'food', 89.00, true),
  ('Sanduiche Royal', 'food', 48.00, true),
  ('Agua mineral', 'beverage', 8.00, true),
  ('Refrigerante lata', 'beverage', 12.00, true),
  ('Cerveja long neck', 'beverage', 18.00, true),
  ('Taxa de room service', 'service', 15.00, true)
on conflict do nothing;
