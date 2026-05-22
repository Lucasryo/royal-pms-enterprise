-- =====================================================================
-- 0002_rls.sql  —  Row Level Security (isolamento por empresa)
-- O usuario master ve tudo; o usuario property ve apenas a propria empresa.
-- =====================================================================

-- ---------- Funcoes auxiliares ----------
-- SECURITY DEFINER + search_path fixo: leem profiles sem disparar RLS
-- recursivo e podem ser usadas dentro das proprias policies.

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'master' from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ---------- Habilita RLS ----------
alter table public.companies           enable row level security;
alter table public.profiles            enable row level security;
alter table public.products            enable row level security;
alter table public.product_shelf_lives enable row level security;
alter table public.label_prints        enable row level security;
alter table public.photos              enable row level security;

-- ---------- companies ----------
create policy companies_select on public.companies
  for select to authenticated
  using ( public.is_master() or id = public.current_company_id() );

create policy companies_insert on public.companies
  for insert to authenticated
  with check ( public.is_master() );

create policy companies_update on public.companies
  for update to authenticated
  using ( public.is_master() )
  with check ( public.is_master() );

create policy companies_delete on public.companies
  for delete to authenticated
  using ( public.is_master() );

-- ---------- profiles ----------
-- Insercao acontece via trigger / service role (que ignoram RLS).
create policy profiles_select on public.profiles
  for select to authenticated
  using ( public.is_master() or id = auth.uid() );

create policy profiles_update on public.profiles
  for update to authenticated
  using ( public.is_master() or id = auth.uid() )
  with check ( public.is_master() or id = auth.uid() );

-- ---------- products ----------
create policy products_select on public.products
  for select to authenticated
  using ( public.is_master() or company_id = public.current_company_id() );

create policy products_insert on public.products
  for insert to authenticated
  with check ( public.is_master() or company_id = public.current_company_id() );

create policy products_update on public.products
  for update to authenticated
  using ( public.is_master() or company_id = public.current_company_id() )
  with check ( public.is_master() or company_id = public.current_company_id() );

create policy products_delete on public.products
  for delete to authenticated
  using ( public.is_master() or company_id = public.current_company_id() );

-- ---------- product_shelf_lives (escopo herdado do produto pai) ----------
create policy shelf_select on public.product_shelf_lives
  for select to authenticated
  using (
    public.is_master()
    or product_id in (
      select id from public.products
      where company_id = public.current_company_id()
    )
  );

create policy shelf_insert on public.product_shelf_lives
  for insert to authenticated
  with check (
    public.is_master()
    or product_id in (
      select id from public.products
      where company_id = public.current_company_id()
    )
  );

create policy shelf_update on public.product_shelf_lives
  for update to authenticated
  using (
    public.is_master()
    or product_id in (
      select id from public.products
      where company_id = public.current_company_id()
    )
  )
  with check (
    public.is_master()
    or product_id in (
      select id from public.products
      where company_id = public.current_company_id()
    )
  );

create policy shelf_delete on public.product_shelf_lives
  for delete to authenticated
  using (
    public.is_master()
    or product_id in (
      select id from public.products
      where company_id = public.current_company_id()
    )
  );

-- ---------- label_prints (historico imutavel: sem update/delete) ----------
create policy label_prints_select on public.label_prints
  for select to authenticated
  using ( public.is_master() or company_id = public.current_company_id() );

create policy label_prints_insert on public.label_prints
  for insert to authenticated
  with check ( public.is_master() or company_id = public.current_company_id() );

-- ---------- photos ----------
create policy photos_select on public.photos
  for select to authenticated
  using ( public.is_master() or company_id = public.current_company_id() );

create policy photos_insert on public.photos
  for insert to authenticated
  with check ( public.is_master() or company_id = public.current_company_id() );

create policy photos_delete on public.photos
  for delete to authenticated
  using ( public.is_master() or company_id = public.current_company_id() );
