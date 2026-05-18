ALTER TABLE reservation_requests
  ADD COLUMN IF NOT EXISTS external_reservation_code TEXT;

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS source_message_id TEXT,
  ADD COLUMN IF NOT EXISTS external_reservation_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_reservation_requests_external_code
  ON reservation_requests(UPPER(external_reservation_code))
  WHERE external_reservation_code IS NOT NULL AND external_reservation_code <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_reservations_source_msg
  ON reservations(source_message_id)
  WHERE source_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_reservations_external_code
  ON reservations(UPPER(external_reservation_code))
  WHERE external_reservation_code IS NOT NULL AND external_reservation_code <> '';

CREATE TABLE IF NOT EXISTS reservation_import_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL DEFAULT 'email',
  event_type TEXT NOT NULL,
  inbox_message_id UUID REFERENCES inbox_messages(id) ON DELETE SET NULL,
  reservation_request_id UUID REFERENCES reservation_requests(id) ON DELETE SET NULL,
  reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
  external_reservation_code TEXT,
  source_message_id TEXT,
  reason TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_reservation_import_logs_created_at
  ON reservation_import_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reservation_import_logs_source
  ON reservation_import_logs(source_message_id, external_reservation_code);

ALTER TABLE reservation_import_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reservation_import_logs_select_staff" ON reservation_import_logs;
CREATE POLICY "reservation_import_logs_select_staff" ON reservation_import_logs
  FOR SELECT TO authenticated
  USING (public.current_user_is_staff());

DROP POLICY IF EXISTS "reservation_import_logs_service_all" ON reservation_import_logs;
CREATE POLICY "reservation_import_logs_service_all" ON reservation_import_logs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

UPDATE app_settings
SET value = (
  COALESCE(
    CASE
      WHEN jsonb_typeof(value::jsonb) = 'object' THEN value::jsonb
      ELSE '{}'::jsonb
    END,
    '{}'::jsonb
  )
  || '{"auto_confirm_enabled":false,"auto_confirm_sender_whitelist":[]}'::jsonb
)::text,
updated_at = timezone('utc', now())
WHERE id = 'email_parser_config';
