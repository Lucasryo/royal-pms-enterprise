ALTER TABLE marketing_contacts ADD COLUMN IF NOT EXISTS provider_id TEXT;
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_provider
  ON marketing_contacts(provider_id) WHERE provider_id IS NOT NULL;

INSERT INTO app_settings (id, value)
VALUES ('generic_providers', '{"providers":[]}')
ON CONFLICT (id) DO NOTHING;
