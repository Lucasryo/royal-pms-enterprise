# Telegram Bot Operations

## Secrets

The Telegram maintenance bot depends on Supabase Edge Function secrets:

- `TELEGRAM_BOT_TOKEN`: Telegram bot token.
- `TELEGRAM_CHAT_ID`: maintenance group chat id.
- `TELEGRAM_WEBHOOK_SECRET`: secret used by Telegram/PMS webhook calls.
- `BOT_MAINTENANCE_SECRET`: secret used by the scheduled bot maintenance cron.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`: provided by Supabase for Edge Functions.

Do not commit new secret values. Configure or rotate them with:

```bash
npx supabase secrets set KEY=value
```

## Automation

The database cron job `maintenance-bot-maintenance-every-15min` calls:

```json
{ "type": "bot_maintenance", "source": "pg_cron" }
```

Expected healthy response:

```json
{ "ok": true, "checked": 0, "repaired": 0, "persistent_failures": 0 }
```

The PMS "Saude do bot" panel shows the last automation time, persistent failures, and recent Telegram notification logs.

## Homologation Checklist

- Open 2 or 3 QR maintenance tickets.
- Assume one ticket from Telegram.
- Transfer one ticket back to the queue.
- Mark one ticket as awaiting parts, then resume it.
- Resolve one ticket and request inspection.
- Approve and reject inspection paths with a moderator.
- Delete one tracked Telegram card manually and run "Verificar agora" in PMS.
- Confirm no duplicate cards are created and simple invalid actions show Telegram button alerts instead of group messages.

## Group Noise Policy

Group messages should be reserved for operational events: assumed, resolved, parts, transfer, and inspection. Simple invalid actions should stay silent in the group and appear as button alerts.
