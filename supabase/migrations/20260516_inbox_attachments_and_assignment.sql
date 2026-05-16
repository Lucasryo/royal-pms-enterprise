-- Inbox attachments + conversation assignment
-- Idempotent migration: safe to re-run.

-- 1) Conversation assignment in marketing_contacts
ALTER TABLE public.marketing_contacts
  ADD COLUMN IF NOT EXISTS assigned_to uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_marketing_contacts_assigned_to
  ON public.marketing_contacts(assigned_to) WHERE assigned_to IS NOT NULL;

-- 2) Attachments array in inbox_messages
ALTER TABLE public.inbox_messages
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 3) Private storage bucket for inbox attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'inbox_attachments',
  'inbox_attachments',
  false,
  20971520,
  ARRAY[
    'image/jpeg','image/png','image/gif','image/webp',
    'application/pdf',
    'audio/mpeg','audio/ogg','audio/mp4','audio/webm',
    'video/mp4','video/quicktime',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- 4) RLS policies on storage objects for the inbox bucket
-- Drop first to allow re-running (CREATE POLICY IF NOT EXISTS is not supported in all Postgres versions)
DROP POLICY IF EXISTS "Authenticated upload to inbox_attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read inbox_attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete own inbox_attachments" ON storage.objects;

CREATE POLICY "Authenticated upload to inbox_attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'inbox_attachments');

CREATE POLICY "Authenticated read inbox_attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'inbox_attachments');

CREATE POLICY "Authenticated delete own inbox_attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'inbox_attachments' AND owner = auth.uid());
