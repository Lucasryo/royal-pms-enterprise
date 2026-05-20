ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS reservation_parser_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reservation_parser_block_reason text,
  ADD COLUMN IF NOT EXISTS reservation_parser_block_reply text;

CREATE INDEX IF NOT EXISTS idx_companies_reservation_parser_blocked
  ON public.companies (reservation_parser_blocked)
  WHERE reservation_parser_blocked = true;
