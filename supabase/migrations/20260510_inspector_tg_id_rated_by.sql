ALTER TABLE public.maintenance_tickets
  ADD COLUMN IF NOT EXISTS inspector_tg_id bigint,
  ADD COLUMN IF NOT EXISTS rated_by_tg_id  bigint;
