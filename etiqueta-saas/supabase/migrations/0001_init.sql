-- =====================================================================
-- 0001_init.sql  —  Etiqueta SaaS: schema base
-- Tabelas, enums, indices e triggers.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Enums ----------
create type public.user_role as enum ('master', 'property');
create type public.storage_condition as enum ('ambiente', 'refrigerado', 'congelado');
create type public.validity_unit as enum ('hours', 'days');

-- ---------- Empresas (tenants) ----------
create table public.companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  cnpj       text,
  address    text,
  phone      text,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Perfis de usuario ----------
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete restrict,
  role       public.user_role not null default 'property',
  full_name  text,
  email      text,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Produtos ----------
create table public.products (
  id                        uuid primary key default gen_random_uuid(),
  company_id                uuid not null references public.companies(id) on delete cascade,
  name                      text not null,
  category                  text,
  default_storage_condition public.storage_condition not null default 'refrigerado',
  active                    boolean not null default true,
  created_by                uuid references public.profiles(id) on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- ---------- Regras de validade por condicao de armazenamento ----------
create table public.product_shelf_lives (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null references public.products(id) on delete cascade,
  storage_condition public.storage_condition not null,
  validity_value    integer not null check (validity_value > 0),
  validity_unit     public.validity_unit not null default 'days',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (product_id, storage_condition)
);

-- ---------- Historico de impressao de etiquetas (imutavel) ----------
create table public.label_prints (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies(id) on delete cascade,
  product_id            uuid references public.products(id) on delete set null,
  product_name_snapshot text not null,
  storage_condition     public.storage_condition not null,
  manipulation_at       timestamptz not null,
  expiry_at             timestamptz not null,
  responsible_name      text not null,
  quantity              integer not null default 1 check (quantity > 0),
  printed_by            uuid references public.profiles(id) on delete set null,
  printed_at            timestamptz not null default now(),
  created_at            timestamptz not null default now()
);

-- ---------- Fotos (metadados; arquivo no Storage) ----------
create table public.photos (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  storage_path  text not null,
  original_name text,
  description   text,
  uploaded_by   uuid references public.profiles(id) on delete set null,
  uploaded_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

-- ---------- Indices ----------
create index idx_profiles_company       on public.profiles(company_id);
create index idx_products_company       on public.products(company_id);
create index idx_shelf_product          on public.product_shelf_lives(product_id);
create index idx_label_prints_company   on public.label_prints(company_id, printed_at desc);
create index idx_photos_company         on public.photos(company_id);
create index idx_photos_uploaded_at     on public.photos(uploaded_at);

-- ---------- Trigger: updated_at automatico ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_companies_updated
  before update on public.companies
  for each row execute function public.set_updated_at();

create trigger trg_profiles_updated
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger trg_products_updated
  before update on public.products
  for each row execute function public.set_updated_at();

create trigger trg_shelf_updated
  before update on public.product_shelf_lives
  for each row execute function public.set_updated_at();

-- ---------- Trigger: cria profile ao criar usuario no auth ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
