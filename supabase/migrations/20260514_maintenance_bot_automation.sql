-- Schedules Telegram bot self-healing maintenance through pg_cron/pg_net.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
begin
  perform cron.unschedule('maintenance-bot-maintenance-every-15min');
exception
  when others then null;
end $$;

do $$
declare
  bot_maintenance_secret text := current_setting('app.bot_maintenance_secret', true);
begin
  if coalesce(bot_maintenance_secret, '') = '' then
    raise notice 'Skipping maintenance bot cron: app.bot_maintenance_secret is not configured.';
    return;
  end if;

  perform cron.schedule(
    'maintenance-bot-maintenance-every-15min',
    '*/15 * * * *',
    format(
      $cron$
        select net.http_post(
          url := 'https://piwknissqcvkvnzloojh.supabase.co/functions/v1/notify-maintenance-ticket',
          headers := jsonb_build_object('Authorization', 'Bearer ' || %L, 'Content-Type', 'application/json'),
          body := jsonb_build_object('type', 'bot_maintenance', 'source', 'pg_cron')
        );
      $cron$,
      bot_maintenance_secret
    )
  );
end $$;
