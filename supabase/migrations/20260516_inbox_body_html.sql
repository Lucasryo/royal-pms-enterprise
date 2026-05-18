-- Stores rendered HTML body for email messages (text/html part with inline images resolved).
ALTER TABLE public.inbox_messages
  ADD COLUMN IF NOT EXISTS body_html text NULL;
