create or replace function public.normalize_booking_category_for_block(value text)
returns text
language sql
immutable
as $$
  select case lower(trim(coalesce(value, '')))
    when 'premium' then 'superior'
    when 'luxo' then 'master'
    when 'suite' then 'suite presidencial'
    else lower(trim(coalesce(value, '')))
  end;
$$;

create or replace function public.prevent_reservation_request_on_blocked_date()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  blocked_row record;
  new_category text := public.normalize_booking_category_for_block(new.category);
begin
  if new.check_in is null or new.check_out is null then
    return new;
  end if;

  select b.start_date, b.end_date, b.reason, b.category
  into blocked_row
  from public.booking_blocked_dates b
  where b.active = true
    and new.check_in <= b.end_date
    and new.check_out >= b.start_date
    and (
      b.category is null
      or public.normalize_booking_category_for_block(b.category) in ('', 'all', 'todos', 'todas', 'geral', 'todas as categorias', 'todas categorias')
      or public.normalize_booking_category_for_block(b.category) = new_category
    )
  order by b.start_date asc
  limit 1;

  if found then
    raise exception 'Periodo bloqueado para reservas entre % e %. %',
      blocked_row.start_date,
      blocked_row.end_date,
      coalesce(blocked_row.reason, '')
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists reservation_requests_blocked_date_guard on public.reservation_requests;

create trigger reservation_requests_blocked_date_guard
before insert or update of check_in, check_out, category
on public.reservation_requests
for each row
execute function public.prevent_reservation_request_on_blocked_date();
