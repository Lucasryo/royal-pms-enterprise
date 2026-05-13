-- Track when a resolved maintenance ticket was sent to inspection.
ALTER TABLE public.maintenance_tickets
  ADD COLUMN IF NOT EXISTS inspection_requested_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_inspection_requested_at
  ON public.maintenance_tickets(inspection_requested_at)
  WHERE inspection_requested_at IS NOT NULL;
