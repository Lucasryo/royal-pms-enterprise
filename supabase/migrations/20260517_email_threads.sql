-- Permite multiplas conversas (threads) por endereco de email.
ALTER TABLE public.marketing_contacts
  ADD COLUMN IF NOT EXISTS thread_root_message_id text NULL;

ALTER TABLE public.marketing_contacts
  DROP CONSTRAINT IF EXISTS marketing_contacts_email_unique;

CREATE UNIQUE INDEX IF NOT EXISTS marketing_contacts_email_thread_unique
  ON public.marketing_contacts (email, thread_root_message_id)
  WHERE email IS NOT NULL AND thread_root_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marketing_contacts_thread_root
  ON public.marketing_contacts (thread_root_message_id)
  WHERE thread_root_message_id IS NOT NULL;
