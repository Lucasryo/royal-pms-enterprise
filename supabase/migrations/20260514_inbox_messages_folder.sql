ALTER TABLE inbox_messages
  ADD COLUMN IF NOT EXISTS folder text NOT NULL DEFAULT 'inbox'
  CHECK (folder IN ('inbox','spam','trash'));

CREATE INDEX IF NOT EXISTS idx_inbox_messages_contact_folder
  ON inbox_messages (contact_id, folder);
