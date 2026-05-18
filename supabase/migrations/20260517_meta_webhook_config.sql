-- Defaults vazios pra cada canal Meta. UI edita via app_settings.
INSERT INTO app_settings (id, value)
VALUES
  ('whatsapp_config', '{"verify_token":"","access_token":"","phone_number_id":"","business_account_id":"","app_secret":""}'),
  ('instagram_config', '{"verify_token":"","access_token":"","page_id":"","app_secret":""}'),
  ('facebook_config', '{"verify_token":"","access_token":"","page_id":"","app_secret":""}')
ON CONFLICT (id) DO NOTHING;
