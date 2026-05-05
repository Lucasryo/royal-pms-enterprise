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

function formatDuration(minutes: number): string {
  if (minutes < 1) return "menos de 1 min";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
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
  // Embed UUID for /urgente command — UUID chars don't need escaping
  lines.push("", `🔖 \`${record.id as string}\``);
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

function ratingKb(id: string) {
  return { inline_keyboard: [[
    { text: "⭐ 1", callback_data: `rate:${id}:1` },
    { text: "⭐ 2", callback_data: `rate:${id}:2` },
    { text: "⭐ 3", callback_data: `rate:${id}:3` },
    { text: "⭐ 4", callback_data: `rate:${id}:4` },
    { text: "⭐ 5", callback_data: `rate:${id}:5` },
  ]] };
}

// ── daily report ───────────────────────────────────────────────────────────
async function sendDailyReport() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const { data: todayTickets } = await db
    .from("maintenance_tickets")
    .select("id,status,priority,created_at,resolved_at")
    .gte("created_at", since.toISOString());

  const { data: openTickets } = await db
    .from("maintenance_tickets")
    .select("id,priority,created_at")
    .in("status", ["open", "in_progress"]);

  const total      = todayTickets?.length ?? 0;
  const resolved   = todayTickets?.filter(t => t.status === "resolved").length ?? 0;
  const cancelled  = todayTickets?.filter(t => t.status === "cancelled").length ?? 0;
  const abertos    = openTickets?.length ?? 0;

  const resolvedWithTime = todayTickets?.filter(
    t => t.status === "resolved" && t.resolved_at && t.created_at
  ) ?? [];
  const avgMins = resolvedWithTime.length > 0
    ? Math.round(resolvedWithTime.reduce((sum, t) =>
        sum + (new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime()) / 60000, 0
      ) / resolvedWithTime.length)
    : null;

  const SLA_LIMITS: Record<string, number> = { urgent: 15, high: 60, medium: 240, low: 1440 };
  const slaBreached = openTickets?.filter(t => {
    const limit = SLA_LIMITS[t.priority] ?? 240;
    return (Date.now() - new Date(t.created_at).getTime()) / 60000 > limit;
  }).length ?? 0;

  const dateStr = new Date().toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric",
  });

  const lines = [
    `📊 *Relatorio diario de manutencao \\— ${esc(dateStr)}*`, "",
    `📋 Abertos nas ultimas 24h: *${total}*`,
    `✅ Resolvidos: *${resolved}*`,
    `🚫 Cancelados: *${cancelled}*`,
    `⏳ Ainda em aberto: *${abertos}*`,
  ];
  if (avgMins !== null) {
    lines.push(`⏱ Tempo medio de resolucao: *${esc(formatDuration(avgMins))}*`);
  }
  lines.push("");
  if (slaBreached > 0) {
    lines.push(`⚠️ *${slaBreached} chamado${slaBreached > 1 ? "s" : ""} com SLA estourado\\!*`);
  } else {
    lines.push(`✔️ Nenhum chamado com SLA estourado\\.`);
  }

  await tg("sendMessage", {
    chat_id: CHAT_ID,
    text: lines.join("\n"),
    parse_mode: "MarkdownV2",
  });

  return { ok: true };
}

// ── handler: supabase db webhook ───────────────────────────────────────────
async function handleDbWebhook(payload: Record<string, unknown>) {
  if ((payload.type as string) === "daily_report") {
    return await sendDailyReport();
  }

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
    // Differentiate PMS-directed (assigned_to set) from Telegram-assumed
    const isDirected = record.assigned_to && oldRecord.status !== "in_progress";
    heading = isDirected ? `📌 *Chamado direcionado*` : `🔧 *Chamado assumido*`;
    kb = inProgressKb(id);
  } else if (status === "resolved") {
    const resolvedAt = record.resolved_at ? new Date(record.resolved_at as string) : new Date();
    const createdAt  = record.created_at  ? new Date(record.created_at  as string) : null;
    const mins = createdAt
      ? Math.round((resolvedAt.getTime() - createdAt.getTime()) / 60000)
      : null;
    heading = mins !== null
      ? `✅ *Resolvido em ${esc(formatDuration(mins))}*`
      : `✅ *Chamado resolvido*`;
  } else if (status === "open" && event === "UPDATE") {
    // Reopened from PMS or mobile
    heading = `🔄 *Chamado reaberto*`;
    kb = openKb(id);
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

  // Feature 7: send rating request after resolution
  if (status === "resolved") {
    await tg("sendMessage", {
      chat_id: CHAT_ID,
      text: `⭐ Como foi o atendimento de *${esc(record.title as string)}*\\? Avalie o chamado\\:`,
      parse_mode: "MarkdownV2",
      reply_markup: ratingKb(id),
    });
  }

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

  const colonIdx = data.indexOf(":");
  const action   = data.slice(0, colonIdx);
  const rest     = data.slice(colonIdx + 1);

  // Feature 7: rating handler — rate:UUID:N
  if (action === "rate") {
    const parts    = rest.split(":");
    const ticketId = parts[0];
    const rating   = Number(parts[1]);
    if (!ticketId || !rating || rating < 1 || rating > 5) {
      await tg("answerCallbackQuery", { callback_query_id: cbId });
      return { ok: true };
    }
    await db.from("maintenance_tickets")
      .update({ rating, updated_at: new Date().toISOString() })
      .eq("id", ticketId);
    await tg("answerCallbackQuery", {
      callback_query_id: cbId,
      text: `⭐ Avaliacao ${rating}/5 registrada! Obrigado.`,
      show_alert: false,
    });
    if (msgId) {
      await tg("editMessageReplyMarkup", {
        chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: [] },
      });
    }
    await tg("sendMessage", {
      chat_id: chatId,
      text: `⭐ Atendimento avaliado em *${rating}/5* por *${esc(name)}*`,
      parse_mode: "MarkdownV2",
    });
    return { ok: true };
  }

  // callback_data formats:
  //   assume:UUID                 — anyone
  //   parts:UUID                  — anyone (open ticket)
  //   resolve:UUID:LOCKED_TG_ID   — only LOCKED_TG_ID
  //   parts:UUID:LOCKED_TG_ID     — only LOCKED_TG_ID (in-progress)
  const restParts      = rest.split(":");
  const ticketId       = restParts[0];
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
      text: `🔒 Apenas ${tk?.status_reason ?? "quem assumiu"} pode concluir ou reportar pecas deste chamado.`,
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
    const lockSuffix = lockedTgUserId ? `\\|${esc(String(lockedTgUserId))}` : "";
    await tg("sendMessage", {
      chat_id: chatId,
      text: `✍️ Descreva a solucao \\[${esc(ticketId)}${lockSuffix}\\]:\n_${esc(ticket.title)}_`,
      parse_mode: "MarkdownV2",
      reply_markup: { force_reply: true, selective: false },
    });

  } else if (action === "parts") {
    const lockSuffix = lockedTgUserId ? `\\|${esc(String(lockedTgUserId))}` : "";
    await tg("sendMessage", {
      chat_id: chatId,
      text: `🔩 Quais pecas sao necessarias? \\[${esc(ticketId)}${lockSuffix}\\]\n_${esc(ticket.title)}_`,
      parse_mode: "MarkdownV2",
      reply_markup: { force_reply: true, selective: false },
    });
  }

  return { ok: true };
}

// ── handler: telegram text reply (force_reply response or /urgente) ────────
async function handleReply(message: Record<string, unknown>) {
  const replyTo   = (message.reply_to_message as Record<string, unknown>) ?? {};
  const replyText = (replyTo.text as string) ?? "";
  const userText  = (message.text as string) ?? "";
  const chatId    = (message.chat as Record<string, unknown>)?.id ?? CHAT_ID;
  const from      = (message.from as Record<string, unknown>) ?? {};
  const fromId    = Number(from.id);
  const name      = [from.first_name, from.last_name].filter(Boolean).join(" ") || "Tecnico";

  // Feature 3: /urgente command — reply to any ticket notification
  if (userText.trim().toLowerCase().startsWith("/urgente")) {
    const uuidMatch = replyText.match(
      /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
    );
    if (uuidMatch) {
      const ticketId = uuidMatch[1];
      const { data: tk } = await db
        .from("maintenance_tickets").select("title,status").eq("id", ticketId).single();
      if (tk && tk.status !== "resolved" && tk.status !== "cancelled") {
        await db.from("maintenance_tickets").update({
          priority: "urgent",
          updated_at: new Date().toISOString(),
        }).eq("id", ticketId);
        await tg("sendMessage", {
          chat_id: chatId,
          text: `🔴 *${esc(name)}* marcou como URGENTE:\n*${esc(tk.title)}*`,
          parse_mode: "MarkdownV2",
        });
      }
    }
    return { ok: true };
  }

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
    // Feature 4: calculate resolution time
    const { data: ticket } = await db
      .from("maintenance_tickets").select("created_at,title").eq("id", ticketId).single();
    const mins = ticket?.created_at
      ? Math.round((Date.now() - new Date(ticket.created_at).getTime()) / 60000)
      : null;

    await db.from("maintenance_tickets").update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      resolution_notes: userText,
      status_reason: name,
    }).eq("id", ticketId);

    const durationPart = mins !== null ? ` em *${esc(formatDuration(mins))}*` : "";
    await tg("sendMessage", {
      chat_id: chatId,
      text: `✅ Resolvido${durationPart} por *${esc(name)}*\\!\n📝 ${esc(userText)}`,
      parse_mode: "MarkdownV2",
    });

    // Feature 7: rating request
    await tg("sendMessage", {
      chat_id: chatId,
      text: `⭐ Como foi o atendimento de *${esc(ticket?.title ?? "")}*\\? Avalie o chamado\\:`,
      parse_mode: "MarkdownV2",
      reply_markup: ratingKb(ticketId),
    });

  } else if (isParts) {
    await db.from("maintenance_tickets").update({
      updated_at: new Date().toISOString(),
      resolution_notes: `⚠️ Aguardando pecas: ${userText} (${name})`,
    }).eq("id", ticketId);

    await tg("sendMessage", {
      chat_id: chatId,
      text: `⚠️ Pecas registradas por *${esc(name)}*:\n${esc(userText)}`,
      parse_mode: "MarkdownV2",
    });
  }

  return { ok: true };
}

// ── handler: non-reply messages ────────────────────────────────────────────
async function handleMessage(message: Record<string, unknown>) {
  const text   = (message.text as string) ?? "";
  const chatId = (message.chat as Record<string, unknown>)?.id ?? CHAT_ID;
  const from   = (message.from as Record<string, unknown>) ?? {};
  const name   = [from.first_name, from.last_name].filter(Boolean).join(" ") || "Tecnico";

  // Feature 3: /urgente UUID — directly mark as urgent
  if (text.trim().toLowerCase().startsWith("/urgente")) {
    const uuidMatch = text.match(
      /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
    );
    if (!uuidMatch) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: `❓ Responda a mensagem de um chamado com /urgente para marca\-lo como urgente\\.`,
        parse_mode: "MarkdownV2",
      });
      return { ok: true };
    }
    const ticketId = uuidMatch[1];
    const { data: tk } = await db
      .from("maintenance_tickets").select("title,status").eq("id", ticketId).single();
    if (tk && tk.status !== "resolved" && tk.status !== "cancelled") {
      await db.from("maintenance_tickets").update({
        priority: "urgent",
        updated_at: new Date().toISOString(),
      }).eq("id", ticketId);
      await tg("sendMessage", {
        chat_id: chatId,
        text: `🔴 *${esc(name)}* marcou como URGENTE:\n*${esc(tk.title)}*`,
        parse_mode: "MarkdownV2",
      });
    }
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
    } else if (body.message?.text) {
      result = await handleMessage(body.message);
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
