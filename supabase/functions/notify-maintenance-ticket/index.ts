import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── env ────────────────────────────────────────────────────────────────────
const BOT_TOKEN  = Deno.env.get("TELEGRAM_BOT_TOKEN")       ?? "";
const CHAT_ID    = Deno.env.get("TELEGRAM_CHAT_ID")          ?? "";
const SUPA_URL   = Deno.env.get("SUPABASE_URL")              ?? "";
const SUPA_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const db = createClient(SUPA_URL, SUPA_KEY);
const TG = `https://api.telegram.org/bot${BOT_TOKEN}`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── telegram helpers ───────────────────────────────────────────────────────
async function tg(method: string, body: Record<string, unknown>) {
  const r = await fetch(`${TG}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!data.ok) console.error(`[tg] ${method}:`, JSON.stringify(data));
  return data;
}

function esc(text: string | null | undefined): string {
  if (!text) return "";
  return String(text).replace(/[_*[\]()~`>#+=|{}.!\\-]/g, "\\$&");
}

// ── message builders ───────────────────────────────────────────────────────
const P_EMOJI: Record<string, string>  = { urgent:"🔴", high:"🟠", medium:"🟡", low:"🟢" };
const P_LABEL: Record<string, string>  = { urgent:"URGENTE", high:"Alta", medium:"Media", low:"Baixa" };
const ST_LABEL: Record<string, string> = { open:"Aberto", in_progress:"Em andamento", resolved:"Resolvido", cancelled:"Cancelado" };

function buildText(record: Record<string, unknown>, heading: string): string {
  const priority = (record.priority as string) ?? "medium";
  const status   = (record.status   as string) ?? "open";
  const lines: string[] = [heading, ""];
  lines.push(`*${esc(record.title as string)}*`);
  if (record.room_number)    lines.push(`🚪 UH *${esc(record.room_number as string)}*`);
  lines.push(`Prioridade: *${P_LABEL[priority] ?? priority}*`);
  lines.push(`Status: *${ST_LABEL[status]      ?? status}*`);
  if (record.description)    lines.push("", `_${esc(record.description as string)}_`);
  if (record.status_reason)  lines.push("", `👷 *${esc(record.status_reason as string)}*`);
  if (record.resolution_notes) {
    const url = String(record.resolution_notes).match(/Foto:\s*(\S+)/)?.[1];
    lines.push("", url ? `📸 [Ver foto](${url})` : `📝 ${esc(record.resolution_notes as string)}`);
  }
  return lines.join("\n");
}

function openKb(id: string) {
  return { inline_keyboard: [[
    { text: "✅ Assumir",         callback_data: `assume:${id}` },
    { text: "⚠️ Falta de Peças", callback_data: `parts:${id}`  },
  ]] };
}

function inProgressKb(id: string, tgUserId?: number) {
  const suffix = tgUserId ? `:${tgUserId}` : "";
  return { inline_keyboard: [[
    { text: "✅ Concluir",        callback_data: `resolve:${id}${suffix}` },
    { text: "⚠️ Falta de Peças", callback_data: `parts:${id}${suffix}`   },
  ]] };
}

// ── handler: supabase db webhook ───────────────────────────────────────────
async function handleDbWebhook(payload: Record<string, unknown>) {
  const event     = (payload.type       as string)                        ?? "INSERT";
  const record    = (payload.record     as Record<string, unknown>)       ?? payload;
  const oldRecord = (payload.old_record as Record<string, unknown>)       ?? {};

  if (event === "UPDATE") {
    const statusChanged   = oldRecord.status   !== record.status;
    const priorityChanged = oldRecord.priority !== record.priority;
    if (!statusChanged && !priorityChanged)  return { ok: true, skipped: "no-change" };
    if (record.status === "cancelled")       return { ok: true, skipped: "cancelled" };
  }

  const priority = (record.priority as string) ?? "medium";
  const status   = (record.status   as string) ?? "open";
  const id       = record.id as string;

  let heading: string;
  let kb: Record<string, unknown> | undefined;

  if (event === "INSERT") {
    heading = `${P_EMOJI[priority] ?? ""} *Novo chamado de manutencao*`;
    kb = openKb(id);
  } else if (status === "in_progress") {
    heading = `🔧 *Chamado assumido*`;
    kb = inProgressKb(id);
  } else if (status === "resolved") {
    heading = `✅ *Chamado resolvido*`;
  } else {
    heading = `📋 *Chamado atualizado*`;
    kb = openKb(id);
  }

  await tg("sendMessage", {
    chat_id: CHAT_ID,
    text: buildText(record, heading),
    parse_mode: "MarkdownV2",
    disable_web_page_preview: false,
    ...(kb ? { reply_markup: kb } : {}),
  });

  return { ok: true };
}

// ── handler: telegram button click ────────────────────────────────────────
async function handleCallback(query: Record<string, unknown>) {
  const cbId   = query.id as string;
  const data   = (query.data as string) ?? "";
  const from   = (query.from    as Record<string, unknown>) ?? {};
  const msg    = (query.message as Record<string, unknown>) ?? {};
  const chatId = (msg.chat as Record<string, unknown>)?.id ?? CHAT_ID;
  const msgId  = msg.message_id;
  const name   = [from.first_name, from.last_name].filter(Boolean).join(" ") || "Tecnico";
  const fromId = Number(from.id);

  // callback_data formats:
  //   assume:UUID                 — anyone
  //   parts:UUID                  — anyone (open ticket)
  //   resolve:UUID:LOCKED_TG_ID   — only LOCKED_TG_ID
  //   parts:UUID:LOCKED_TG_ID     — only LOCKED_TG_ID (in-progress)
  const colonIdx = data.indexOf(":");
  const action   = data.slice(0, colonIdx);
  const rest     = data.slice(colonIdx + 1);
  const restParts = rest.split(":");
  const ticketId = restParts[0];
  const lockedTgUserId = restParts[1] ? Number(restParts[1]) : null;

  if (!ticketId) {
    await tg("answerCallbackQuery", { callback_query_id: cbId });
    return { ok: true };
  }

  // Ownership lock: only the user who assumed can resolve/report parts
  if (lockedTgUserId && lockedTgUserId !== fromId) {
    const { data: tk } = await db
      .from("maintenance_tickets").select("status_reason").eq("id", ticketId).single();
    await tg("answerCallbackQuery", {
      callback_query_id: cbId,
      text: `🔒 Apenas ${tk?.status_reason ?? "quem assumiu"} pode concluir ou reportar peças deste chamado.`,
      show_alert: true,
    });
    return { ok: true };
  }

  await tg("answerCallbackQuery", { callback_query_id: cbId });

  const { data: ticket } = await db
    .from("maintenance_tickets").select("*").eq("id", ticketId).single();
  if (!ticket) return { ok: true };

  if (action === "assume") {
    await db.from("maintenance_tickets").update({
      status: "in_progress",
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status_reason: name,
    }).eq("id", ticketId);

    if (msgId) {
      await tg("editMessageReplyMarkup", {
        chat_id: chatId, message_id: msgId, reply_markup: inProgressKb(ticketId, fromId),
      });
    }
    await tg("sendMessage", {
      chat_id: chatId,
      text: `🔧 *${esc(name)}* assumiu: *${esc(ticket.title)}* \\(UH ${esc(ticket.room_number)}\\)`,
      parse_mode: "MarkdownV2",
    });

  } else if (action === "resolve") {
    // Embed ticket ID + locked tg user ID in the prompt so handleReply can verify
    const lockSuffix = lockedTgUserId ? `\\|${esc(String(lockedTgUserId))}` : "";
    await tg("sendMessage", {
      chat_id: chatId,
      text: `✍️ Descreva a solução \\[${esc(ticketId)}${lockSuffix}\\]:\n_${esc(ticket.title)}_`,
      parse_mode: "MarkdownV2",
      reply_markup: { force_reply: true, selective: false },
    });

  } else if (action === "parts") {
    const lockSuffix = lockedTgUserId ? `\\|${esc(String(lockedTgUserId))}` : "";
    await tg("sendMessage", {
      chat_id: chatId,
      text: `🔩 Quais peças são necessárias? \\[${esc(ticketId)}${lockSuffix}\\]\n_${esc(ticket.title)}_`,
      parse_mode: "MarkdownV2",
      reply_markup: { force_reply: true, selective: false },
    });
  }

  return { ok: true };
}

// ── handler: telegram text reply (force_reply response) ───────────────────
async function handleReply(message: Record<string, unknown>) {
  const replyTo   = (message.reply_to_message as Record<string, unknown>) ?? {};
  const replyText = (replyTo.text as string) ?? "";
  const userText  = (message.text as string) ?? "";
  const chatId    = (message.chat as Record<string, unknown>)?.id ?? CHAT_ID;
  const from      = (message.from as Record<string, unknown>) ?? {};
  const fromId    = Number(from.id);
  const name      = [from.first_name, from.last_name].filter(Boolean).join(" ") || "Tecnico";

  // Force-reply prompt embeds [uuid] or [uuid|lockedTgUserId]
  const match = replyText.match(/\[([0-9a-f-]{36})(?:\|(\d+))?\]/i);
  if (!match) return { ok: true };
  const ticketId       = match[1];
  const lockedTgUserId = match[2] ? Number(match[2]) : null;

  if (lockedTgUserId && lockedTgUserId !== fromId) {
    const { data: tk } = await db
      .from("maintenance_tickets").select("status_reason").eq("id", ticketId).single();
    await tg("sendMessage", {
      chat_id: chatId,
      text: `🔒 Apenas *${esc(tk?.status_reason ?? "quem assumiu")}* pode finalizar este chamado\\.`,
      parse_mode: "MarkdownV2",
    });
    return { ok: true };
  }

  const isResolve = replyText.startsWith("✍️");
  const isParts   = replyText.startsWith("🔩");

  if (isResolve) {
    await db.from("maintenance_tickets").update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      resolution_notes: userText,
      status_reason: name,
    }).eq("id", ticketId);

    await tg("sendMessage", {
      chat_id: chatId,
      text: `✅ Resolvido por *${esc(name)}*\\!\n📝 ${esc(userText)}`,
      parse_mode: "MarkdownV2",
    });

  } else if (isParts) {
    await db.from("maintenance_tickets").update({
      updated_at: new Date().toISOString(),
      resolution_notes: `⚠️ Aguardando peças: ${userText} (${name})`,
    }).eq("id", ticketId);

    await tg("sendMessage", {
      chat_id: chatId,
      text: `⚠️ Peças registradas por *${esc(name)}*:\n${esc(userText)}`,
      parse_mode: "MarkdownV2",
    });
  }

  return { ok: true };
}

// ── main ───────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    let result: Record<string, unknown>;

    if (body.callback_query) {
      result = await handleCallback(body.callback_query);
    } else if (body.message?.reply_to_message) {
      result = await handleReply(body.message);
    } else if (body.type) {
      result = await handleDbWebhook(body);
    } else {
      result = { ok: true, skipped: "unknown-event" };
    }

    return new Response(JSON.stringify(result), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[notify] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
