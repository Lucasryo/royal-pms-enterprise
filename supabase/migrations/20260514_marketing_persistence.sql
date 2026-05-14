-- Templates
CREATE TABLE IF NOT EXISTS marketing_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Personalizado',
  channel text NOT NULL DEFAULT 'WhatsApp',
  body text NOT NULL,
  variables text[] DEFAULT '{}',
  usage_count int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_marketing_templates_category ON marketing_templates(category);

-- Campaigns
CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  channel text NOT NULL DEFAULT 'email',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','running','completed','paused','failed')),
  template_id uuid REFERENCES marketing_templates(id) ON DELETE SET NULL,
  audience_filter jsonb NOT NULL DEFAULT '{}',
  subject text,
  body text,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  total_recipients int NOT NULL DEFAULT 0,
  delivered_count int NOT NULL DEFAULT 0,
  read_count int NOT NULL DEFAULT 0,
  reply_count int NOT NULL DEFAULT 0,
  failed_count int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_status ON marketing_campaigns(status, scheduled_at);

CREATE TABLE IF NOT EXISTS marketing_campaign_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES marketing_contacts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','delivered','read','replied','failed')),
  sent_at timestamptz,
  delivered_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, contact_id)
);
CREATE INDEX IF NOT EXISTS idx_campaign_sends_campaign ON marketing_campaign_sends(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_sends_status ON marketing_campaign_sends(campaign_id, status);

-- Flows
CREATE TABLE IF NOT EXISTS marketing_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  trigger_type text NOT NULL DEFAULT 'manual' CHECK (trigger_type IN ('keyword','event','schedule','manual')),
  trigger_config jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused')),
  nodes jsonb NOT NULL DEFAULT '[]',
  edges jsonb NOT NULL DEFAULT '[]',
  stats jsonb NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_marketing_flows_status ON marketing_flows(status);

ALTER TABLE marketing_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_campaign_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read templates" ON marketing_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write templates" ON marketing_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth read campaigns" ON marketing_campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write campaigns" ON marketing_campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth read sends" ON marketing_campaign_sends FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write sends" ON marketing_campaign_sends FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth read flows" ON marketing_flows FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write flows" ON marketing_flows FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION marketing_touch_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_marketing_templates_touch ON marketing_templates;
CREATE TRIGGER trg_marketing_templates_touch BEFORE UPDATE ON marketing_templates FOR EACH ROW EXECUTE FUNCTION marketing_touch_updated_at();
DROP TRIGGER IF EXISTS trg_marketing_campaigns_touch ON marketing_campaigns;
CREATE TRIGGER trg_marketing_campaigns_touch BEFORE UPDATE ON marketing_campaigns FOR EACH ROW EXECUTE FUNCTION marketing_touch_updated_at();
DROP TRIGGER IF EXISTS trg_marketing_flows_touch ON marketing_flows;
CREATE TRIGGER trg_marketing_flows_touch BEFORE UPDATE ON marketing_flows FOR EACH ROW EXECUTE FUNCTION marketing_touch_updated_at();
