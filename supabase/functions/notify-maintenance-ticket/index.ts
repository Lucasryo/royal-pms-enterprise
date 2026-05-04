import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/**
 * Telegram bot notifier for maintenance tickets.
 *
 * Trigger: Supabase Database Webhook on INSERT/UPDATE to maintenance_tickets
 *
 * Setup:
 * 1. Talk to @BotFather on Telegram → /newbot → save the token
 * 2. Add the bot to a group (or DM it) → call /start
 * 3. Use @getidsbot to get the chat_id
 * 4. Set Edge Function secrets:
 *    supabase secrets set TELEGRAM_BOT_TOKEN=xxxx TELEGRAM_CHAT_ID=yyyy
 * 5. Create a Database Webhook in Supabase Dashboard:
 *    Table: maintenance_tickets, Events: Insert + Update,
 *    URL: https://<project-ref>.supabase.co/functions/v1/notify-maintenance-ticket
 */

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PRIORITY_EMOJI: Record<string, string> = {
  urgent: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "🟢",
};

const STATUS_EMOJI: Record<string, string> = {
  open: "📥",
  in_progress: "🔧",
  resolved: "✅",
  cancelled: "❌",
};

const PRIORITY_LABEL: Record<string, string> = {
  urgent: "URGENTE",
  high: "Alta",
  medium: "Media",
  low: "Baixa",
};

const STATUS_LABEL: Record<string, string> = {
  open: "Aberto",
  in_progress: "Em andamento",
  resolved: "Resolvido",
  cancelled: "Cancelado",
};

function escapeMd(text: string | null | undefined): string {
  if (!text) return "";
  return String(text).replace(/[_*[\]()~`>#+=|{}.!\\-]/g, "\\$&");
}

function buildMessage(record: any, eventType: string): string {
  const priority = record.priority ?? "medium";
  const status = record.status ?? "open";
  const lines: string[] = [];

  if (eventType === "INSERT") {
    lines.push(`${PRIORITY_EMOJI[priority] ?? ""} *Novo chamado de manutencao*`);
  } else if (record.status === "in_progress") {
    lines.push(`${STATUS_EMOJI.in_progress} *Chamado assumido*`);
  } else if (record.status === "resolved") {
    lines.push(`${STATUS_EMOJI.resolved} *Chamado resolvido*`);
  } else {
    lines.push(`${STATUS_EMOJI[status] ?? ""} *Chamado atualizado*`);
  }

  lines.push("");
  lines.push(`*${escapeMd(record.title)}*`);

  if (record.room_number) {
    lines.push(`🚪 UH *${escapeMd(record.room_number)}*`);
  }

  lines.push(`Prioridade: *${PRIORITY_LABEL[priority] ?? priority}*`);
  lines.push(`Status: *${STATUS_LABEL[status] ?? status}*`);

  if (record.description) {
    lines.push("");
    lines.push(`_${escapeMd(record.description)}_`);
  }

  if (record.status_reason) {
    lines.push("");
    lines.push(`👤 ${escapeMd(record.status_reason)}`);
  }

  if (record.resolution_notes) {
    const photoMatch = String(record.resolution_notes).match(/Foto:\s*(\S+)/);
    if (photoMatch) {
      lines.push("");
      lines.push(`📸 [Ver foto](${photoMatch[1]})`);
    } else if (record.status === "resolved") {
      lines.push("");
      lines.push(`📝 ${escapeMd(record.resolution_notes)}`);
    }
  }

  return lines.join("\n");
}

async function sendTelegramMessage(text: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("[notify-maintenance-ticket] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
    return;
  }

  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "MarkdownV2",
        disable_web_page_preview: false,
      }),
    },
  );

  if (!response.ok) {
    const errBody = await response.text();
    console.error("[notify-maintenance-ticket] Telegram error:", response.status, errBody);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const payload = await req.json();
    const eventType = payload?.type ?? "INSERT";
    const record = payload?.record ?? payload;

    // Skip if no meaningful change
    if (eventType === "UPDATE") {
      const oldRecord = payload?.old_record ?? {};
      if (oldRecord.status === record.status && oldRecord.priority === record.priority) {
        return new Response(JSON.stringify({ ok: true, skipped: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Skip notifying on cancellations
      if (record.status === "cancelled") {
        return new Response(JSON.stringify({ ok: true, skipped: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const message = buildMessage(record, eventType);
    await sendTelegramMessage(message);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[notify-maintenance-ticket] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
