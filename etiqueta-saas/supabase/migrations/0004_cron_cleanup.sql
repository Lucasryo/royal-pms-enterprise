-- =====================================================================
-- 0004_cron_cleanup.sql  —  Autoexclusao de fotos apos 30 dias
-- ---------------------------------------------------------------------
-- ATENCAO: rode este script SOMENTE depois de:
--   1. fazer o deploy da edge function `cleanup-photos`;
--   2. definir o segredo CLEANUP_SECRET nas variaveis da function.
-- Substitua <CLEANUP_SECRET> pelo mesmo valor configurado na function.
-- O project ref (glvdiicipblsohdgmqaz) ja esta preenchido.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove um agendamento anterior, se existir (evita duplicar).
select cron.unschedule('cleanup-photos-daily')
where exists (
  select 1 from cron.job where jobname = 'cleanup-photos-daily'
);

-- Executa a limpeza todos os dias as 03:00 UTC.
select cron.schedule(
  'cleanup-photos-daily',
  '0 3 * * *',
  $$
  select net.http_post(
    url     := 'https://glvdiicipblsohdgmqaz.functions.supabase.co/cleanup-photos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cleanup-secret', '<CLEANUP_SECRET>'
    )
  );
  $$
);

-- Para conferir:   select * from cron.job;
-- Para testar a function manualmente, veja o README.
