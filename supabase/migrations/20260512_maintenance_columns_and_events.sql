-- ============================================================
-- FASE 1: Correção do Sistema de Manutenção
-- 1. Adicionar actor_tg_id em maintenance_ticket_events
-- 2. Índices de performance faltantes
-- 3. RLS policies para maintenance_ticket_events
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. COLUNA actor_tg_id em maintenance_ticket_events
--    (necessária para lookup por Telegram user ID)
-- ─────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'maintenance_ticket_events' AND column_name = 'actor_tg_id'
  ) THEN
    ALTER TABLE public.maintenance_ticket_events ADD COLUMN actor_tg_id bigint;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 2. ÍNDICES DE PERFORMANCE FALTANTES
-- ─────────────────────────────────────────────────────────────

-- /meus (busca por telegram_user_id)
CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_telegram_user_id
  ON public.maintenance_tickets(telegram_user_id)
  WHERE telegram_user_id IS NOT NULL;

-- Inspeções pendentes
CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_inspection_status
  ON public.maintenance_tickets(inspection_status)
  WHERE inspection_status = 'pending';

-- Aguardando peças
CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_awaiting_parts
  ON public.maintenance_tickets(awaiting_parts)
  WHERE awaiting_parts = true;

-- Avaliações (performance reports)
CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_rating
  ON public.maintenance_tickets(rating)
  WHERE rating IS NOT NULL;

-- Alertas de SLA
CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_sla_alerted_at
  ON public.maintenance_tickets(sla_alerted_at)
  WHERE sla_alerted_at IS NOT NULL;

-- Eventos por ticket
CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket_id
  ON public.maintenance_ticket_events(ticket_id);

-- Eventos por Telegram user ID
CREATE INDEX IF NOT EXISTS idx_ticket_events_actor_tg_id
  ON public.maintenance_ticket_events(actor_tg_id)
  WHERE actor_tg_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 3. RLS POLICIES PARA maintenance_ticket_events
-- ─────────────────────────────────────────────────────────────

-- Habilitar RLS se ainda não estiver habilitado
ALTER TABLE public.maintenance_ticket_events ENABLE ROW LEVEL SECURITY;

-- Policy: anon pode inserir eventos (fluxo QR)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'maintenance_ticket_events' AND policyname = 'anon_insert_ticket_events'
  ) THEN
    CREATE POLICY "anon_insert_ticket_events"
      ON public.maintenance_ticket_events
      FOR INSERT
      TO anon
      WITH CHECK (true);
  END IF;
END $$;

-- Policy: authenticated pode ler eventos
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'maintenance_ticket_events' AND policyname = 'authenticated_read_ticket_events'
  ) THEN
    CREATE POLICY "authenticated_read_ticket_events"
      ON public.maintenance_ticket_events
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

-- Policy: authenticated pode inserir eventos
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'maintenance_ticket_events' AND policyname = 'authenticated_insert_ticket_events'
  ) THEN
    CREATE POLICY "authenticated_insert_ticket_events"
      ON public.maintenance_ticket_events
      FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;
END $$;

-- Policy: service_role pode tudo (bot)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'maintenance_ticket_events' AND policyname = 'service_role_all_ticket_events'
  ) THEN
    CREATE POLICY "service_role_all_ticket_events"
      ON public.maintenance_ticket_events
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
