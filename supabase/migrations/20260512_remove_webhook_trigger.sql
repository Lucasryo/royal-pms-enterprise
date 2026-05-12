-- Execute no Supabase SQL Editor:
-- https://supabase.com/dashboard/project/piwknissqcvkvnzloojh/sql/new

-- 1. Remover trigger duplicado que causa mensagens em dobro
DROP TRIGGER IF EXISTS "notify-maintenance-ticket" ON public.maintenance_tickets;

-- 2. Remover função do trigger
DROP FUNCTION IF EXISTS public.notify_maintenance_ticket_webhook() CASCADE;

-- 3. Verificar que os triggers de sistema ainda existem (deve retornar apenas os RI_ConstraintTrigger)
SELECT tgname, proname 
FROM pg_trigger 
JOIN pg_proc ON pg_trigger.tgfoid = pg_proc.oid 
WHERE tgrelid = 'public.maintenance_tickets'::regclass 
AND tgname NOT LIKE 'RI_ConstraintTrigger%';