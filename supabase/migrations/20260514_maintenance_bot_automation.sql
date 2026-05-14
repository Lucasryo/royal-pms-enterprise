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
begin
  perform cron.schedule(
    'maintenance-bot-maintenance-every-15min',
    '*/15 * * * *',
    $cron$
      select net.http_post(
        url := 'https://piwknissqcvkvnzloojh.supabase.co/functions/v1/notify-maintenance-ticket',
        headers := '{"Authorization":"Bearer qQW6AnEK2xheDdRCmwzMsp9YGUHfauBL0Olkvj7Jc8Zi1gI5","Content-Type":"application/json"}'::jsonb,
        body := '{"type":"bot_maintenance","source":"pg_cron"}'::jsonb
      );
    $cron$
  );
end $$;
