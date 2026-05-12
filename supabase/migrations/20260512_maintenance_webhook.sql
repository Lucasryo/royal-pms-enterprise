-- ============================================================
-- FASE 2: Webhook para notificar Edge Function de mudanças em maintenance_tickets
-- Usa pg_net para enviar requisições HTTP assíncronas ao Edge Function
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Função trigger para notificar o Edge Function
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_maintenance_ticket_webhook()
RETURNS TRIGGER AS $$
DECLARE
  response_id bigint;
  payload jsonb;
BEGIN
  -- Monta o payload no formato esperado pelo Edge Function
  payload := jsonb_build_object(
    'type', TG_OP,
    'record', row_to_json(NEW)::jsonb
  );
  
  IF TG_OP = 'UPDATE' THEN
    payload := payload || jsonb_build_object('old_record', row_to_json(OLD)::jsonb);
  END IF;

  -- Envia requisição HTTP assíncrona via pg_net
  SELECT net.http_post(
    url := 'https://piwknissqcvkvnzloojh.supabase.co/functions/v1/notify-maintenance-ticket',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer qQW6AnEK2xheDdRCmwzMsp9YGUHfauBL0Olkvj7Jc8Zi1gI5"}'::jsonb,
    body := payload
  ) INTO response_id;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log do erro mas não falha a transação principal
    RAISE WARNING 'Failed to send webhook for ticket %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────
-- 2. Trigger na tabela maintenance_tickets
-- ─────────────────────────────────────────────────────────────

-- Remove trigger existente se houver
DROP TRIGGER IF EXISTS maintenance_ticket_webhook_trigger ON public.maintenance_tickets;

-- Cria o trigger para INSERT e UPDATE
CREATE TRIGGER maintenance_ticket_webhook_trigger
  AFTER INSERT OR UPDATE ON public.maintenance_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_maintenance_ticket_webhook();
