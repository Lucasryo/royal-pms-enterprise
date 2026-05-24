-- Link imported corporate tariffs to registered companies.

create extension if not exists unaccent with schema extensions;

alter table public.tariffs
  add column if not exists company_id uuid references public.companies(id) on delete set null;

create index if not exists idx_tariffs_company_id
  on public.tariffs(company_id);

create index if not exists idx_tariffs_company_category_room
  on public.tariffs(company_id, category, room_type)
  where company_id is not null;

with tariff_norm as (
  select
    t.*,
    regexp_replace(lower(extensions.unaccent(t.company_name)), '[^a-z0-9]+', '', 'g') as norm
  from public.tariffs t
  where t.company_id is null
),
company_norm as (
  select
    c.id,
    c.name,
    regexp_replace(lower(extensions.unaccent(c.name)), '[^a-z0-9]+', '', 'g') as norm
  from public.companies c
),
exact_candidates as (
  select t.id as tariff_id, c.id as company_id, c.name as company_name, 0 as match_rank
  from tariff_norm t
  join company_norm c on c.norm = t.norm
),
fallback_candidates as (
  select t.id as tariff_id, c.id as company_id, c.name as company_name, 1 as match_rank
  from tariff_norm t
  join company_norm c
    on not exists (select 1 from exact_candidates e where e.tariff_id = t.id)
   and (
        (length(t.norm) >= 5 and c.norm like '%' || t.norm || '%')
        or (length(c.norm) >= 5 and t.norm like '%' || c.norm || '%')
      )
),
candidates as (
  select * from exact_candidates
  union all
  select * from fallback_candidates
),
ranked as (
  select
    t.id as tariff_id,
    t.base_rate,
    t.percentage,
    t.room_type,
    t.category,
    t.description,
    t.created_by,
    c.company_id,
    c.company_name,
    row_number() over (partition by t.id order by c.match_rank, c.company_name, c.company_id) as rn
  from tariff_norm t
  join candidates c on c.tariff_id = t.id
),
updated as (
  update public.tariffs t
  set
    company_id = r.company_id,
    company_name = r.company_name,
    updated_at = timezone('utc', now())
  from ranked r
  where t.id = r.tariff_id
    and r.rn = 1
  returning t.id
)
insert into public.tariffs (
  company_name,
  company_id,
  base_rate,
  percentage,
  room_type,
  category,
  description,
  created_by,
  created_at,
  updated_at
)
select
  r.company_name,
  r.company_id,
  r.base_rate,
  r.percentage,
  r.room_type,
  r.category,
  r.description,
  r.created_by,
  timezone('utc', now()),
  timezone('utc', now())
from ranked r
where r.rn > 1
  and not exists (
    select 1
    from public.tariffs existing
    where existing.company_id = r.company_id
      and existing.category = r.category
      and existing.room_type = r.room_type
  );
