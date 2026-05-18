ALTER TABLE reservation_requests
  ADD COLUMN IF NOT EXISTS source_message_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reservation_requests_source_msg
  ON reservation_requests(source_message_id) WHERE source_message_id IS NOT NULL;

INSERT INTO app_settings (id, value) VALUES (
  'email_parser_config',
  '{"enabled":false,"always_classify":false,"sender_whitelist":["booking.com","airbnb.com","expedia.com","hoteis.com","decolar.com","trivago.com"],"subject_keywords":["reserva","reservation","booking","confirmation","confirmação"],"min_confidence":"medium","default_category":"executivo"}'
) ON CONFLICT (id) DO NOTHING;
