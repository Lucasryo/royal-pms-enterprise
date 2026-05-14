alter table public.maintenance_tickets
  add column if not exists telegram_chat_id bigint,
  add column if not exists telegram_message_id bigint,
  add column if not exists telegram_card_updated_at timestamptz;

create index if not exists idx_maintenance_tickets_telegram_message_id
  on public.maintenance_tickets (telegram_message_id)
  where telegram_message_id is not null;
