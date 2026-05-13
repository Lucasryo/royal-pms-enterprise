-- Track the primary Telegram card for each maintenance ticket.
ALTER TABLE public.maintenance_tickets
  ADD COLUMN IF NOT EXISTS telegram_chat_id bigint,
  ADD COLUMN IF NOT EXISTS telegram_message_id bigint,
  ADD COLUMN IF NOT EXISTS telegram_card_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_telegram_card
  ON public.maintenance_tickets(telegram_chat_id, telegram_message_id)
  WHERE telegram_chat_id IS NOT NULL AND telegram_message_id IS NOT NULL;
