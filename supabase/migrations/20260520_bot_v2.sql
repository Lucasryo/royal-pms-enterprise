-- CRM real
ALTER TABLE marketing_contacts
  ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 50 CHECK (score >= 0 AND score <= 100),
  ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'cold' CHECK (stage IN ('hot','warm','cold'));
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_score ON marketing_contacts(score DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_stage ON marketing_contacts(stage);

-- Log de invocações do bot
CREATE TABLE IF NOT EXISTS bot_invocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES marketing_contacts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  incoming_text TEXT,
  reply_text TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('replied','escalated','skipped','error')),
  reason TEXT,
  provider TEXT,
  model TEXT,
  input_tokens INT,
  output_tokens INT,
  cost_usd NUMERIC(10,6),
  duration_ms INT,
  tools_used JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bot_invocations_contact ON bot_invocations(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_invocations_created ON bot_invocations(created_at DESC);

-- NPS real
CREATE TABLE IF NOT EXISTS nps_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES marketing_contacts(id) ON DELETE SET NULL,
  reservation_id UUID,
  guest_name TEXT,
  channel TEXT NOT NULL,
  score INTEGER CHECK (score BETWEEN 0 AND 10),
  comment TEXT,
  sent_at TIMESTAMPTZ DEFAULT now(),
  responded_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_nps_responses_responded ON nps_responses(responded_at DESC);

-- Função SQL pra recalcular score de um contato
CREATE OR REPLACE FUNCTION recalc_contact_score(p_contact_id UUID) RETURNS INTEGER AS $$
DECLARE
  v_msgs_in INT;
  v_msgs_out INT;
  v_days_inactive INT;
  v_score INT;
  v_stage TEXT;
BEGIN
  SELECT COUNT(*) FILTER (WHERE direction='in'),
         COUNT(*) FILTER (WHERE direction='out')
    INTO v_msgs_in, v_msgs_out
    FROM inbox_messages WHERE contact_id = p_contact_id;
  SELECT COALESCE(EXTRACT(DAY FROM now() - MAX(last_message_at))::INT, 999)
    INTO v_days_inactive FROM marketing_contacts WHERE id = p_contact_id;
  v_score := GREATEST(0, LEAST(100,
    50 + LEAST(30, v_msgs_in * 2) + LEAST(20, v_msgs_out * 2) - GREATEST(0, v_days_inactive * 2)
  ));
  v_stage := CASE
    WHEN v_score >= 75 THEN 'hot'
    WHEN v_score >= 50 THEN 'warm'
    ELSE 'cold' END;
  UPDATE marketing_contacts SET score = v_score, stage = v_stage, updated_at = now() WHERE id = p_contact_id;
  RETURN v_score;
END $$ LANGUAGE plpgsql;

-- Trigger: recalcula score sempre que inbox_messages muda
CREATE OR REPLACE FUNCTION trg_recalc_score() RETURNS TRIGGER AS $$
BEGIN
  PERFORM recalc_contact_score(NEW.contact_id);
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_recalc_score_on_msg ON inbox_messages;
CREATE TRIGGER trg_recalc_score_on_msg AFTER INSERT ON inbox_messages FOR EACH ROW EXECUTE FUNCTION trg_recalc_score();
