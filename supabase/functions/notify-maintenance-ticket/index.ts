import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── env ────────────────────────────────────────────────────────────────────
const BOT_TOKEN      = Deno.env.get("TELEGRAM_BOT_TOKEN")        ?? "";
const CHAT_ID        = Deno.env.get("TELEGRAM_CHAT_ID")           ?? "";
const SUPA_URL       = Deno.env.get("SUPABASE_URL")               ?? "";
const SUPA_KEY       = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")  ?? "";
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET")    ?? "";

const db = createClient(SUPA_URL, SUPA_KEY);
const TG = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Webhook deduplication — prevents processing the same update twice
const processedUpdates = new Map<number, number>();
const DEDUP_TTL_MS = 5 * 60 * 1000; // 5 minutes

function isDuplicate(updateId: number): boolean {
  const now = Date.now();
  // Clean expired entries
  for (const [id, ts] of processedUpdates.entries()) {
    if (now - ts > DEDUP_TTL_MS) processedUpdates.delete(id);
  }
  if (processedUpdates.has(updateId)) return true;
  processedUpdates.set(updateId, now);
  return false;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── telegram helpers ────────────────────────────────────────────────────────
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

// 3B: cache com TTL de 5 min para evitar rate limit do Telegram
const modCache = new Map<string, { result: boolean; expiresAt: number }>();

async function isModerator(chatId: unknown, userId: number): Promise<boolean> {
  const key = `${chatId}:${userId}`;
  const cached = modCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  try {
    const res = await tg("getChatMember", { chat_id: chatId, user_id: userId });
    const result = res.ok && ["administrator", "creator"].includes(res.result?.status);
    modCache.set(key, { result, expiresAt: Date.now() + 5 * 60 * 1000 });
    return result;
  } catch {
    return false;
  }
}

function esc(text: string | null | undefined): string {
  if (!text) return "";
  return String(text).replace(/[_*[\]()~`>#+=|{}.!\\-]/g, "\\$&");
}

// 3A: suporte a dias para tickets abertos ha mais de 24h
function formatDuration(minutes: number): string {
  const m = Math.abs(Math.round(minutes));
  if (m < 1) return "menos de 1 min";
  if (m < 60) return `${m} min`;
  if (m < 1440) {
    const h = Math.floor(m / 60), rm = m % 60;
    return rm > 0 ? `${h}h ${rm}min` : `${h}h`;
  }
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

// ── message builders ────────────────────────────────────────────────────────
const P_EMOJI: Record<string, string>  = { urgent:"🔴", high:"🟠", medium:"🟡", low:"🟢" };
const P_LABEL: Record<string, string>  = { urgent:"URGENTE", high:"Alta", medium:"Media", low:"Baixa" };
const ST_LABEL: Record<string, string> = { open:"Aberto", in_progress:"Em andamento", resolved:"Resolvido", cancelled:"Cancelado" };

function buildText(record: Record<string, unknown>, heading: string): string {
  const priority = (record.priority as string) ?? "medium";
  const status   = (record.status   as string) ?? "open";
  const lines: string[] = [heading, ""];
  lines.push(`*${esc(record.title as string)}*`);
  if (record.room_number)   lines.push(`🚪 UH *${esc(record.room_number as string)}*`);
  lines.push(`Prioridade: *${P_LABEL[priority] ?? priority}*`);
  lines.push(`Status: *${ST_LABEL[status]      ?? status}*`);
  if (record.description)   lines.push("", `_${esc(record.description as string)}_`);
  if (record.status_reason) lines.push("", `👷 *${esc(record.status_reason as string)}*`);
  if (record.resolution_notes) {
    const url = String(record.resolution_notes).match(/Foto:\s*(\S+)/)?.[1];
    lines.push("", url ? `📸 [Ver foto](${url})` : `📝 ${esc(record.resolution_notes as string)}`);
  }
  lines.push("", `🔖 \`${record.id as string}\``);
  return lines.join("\n");
}

// ── keyboards ───────────────────────────────────────────────────────────────
function openKb(id: string) {
  return { inline_keyboard: [
    [
      { text: "✅ Assumir",         callback_data: `assume:${id}` },
      { text: "⚠️ Falta de Peças", callback_data: `parts:${id}`  },
    ],
    [{ text: "📋 Ver detalhes", callback_data: `details:${id}` }],
  ]};
}

function inProgressKb(id: string, tgUserId?: number) {
  const suffix = tgUserId ? `:${tgUserId}` : "";
  return { inline_keyboard: [
    [
      { text: "✅ Concluir",        callback_data: `resolve:${id}${suffix}` },
      { text: "⚠️ Falta de Peças", callback_data: `parts:${id}${suffix}`   },
    ],
    [
      { text: "📝 Adicionar nota",  callback_data: `note:${id}${suffix}` },
      { text: "🔄 Transferir",      callback_data: `transfer:${id}${suffix}` },
    ],
    [{ text: "📋 Ver detalhes", callback_data: `details:${id}` }],
  ]};
}

// Após registrar falta de peças — permite marcar como recebido sem concluir
function partsReceivedKb(id: string, tgUserId?: number) {
  const suffix = tgUserId ? `:${tgUserId}` : "";
  return { inline_keyboard: [[
    { text: "📦 Peças Recebidas", callback_data: `parts_ok:${id}${suffix}` },
    { text: "✅ Concluir",        callback_data: `resolve:${id}${suffix}`   },
  ]] };
}

function inspectionKb(id: string) {
  return { inline_keyboard: [[
    { text: "🔍 Assumir Vistoria", callback_data: `insp_assume:${id}` },
  ]] };
}

function inspectorActionsKb(id: string, inspectorTgId: number) {
  return { inline_keyboard: [[
    { text: "✅ Aprovar",   callback_data: `insp_ok:${id}:${inspectorTgId}`  },
    { text: "❌ Reprovar", callback_data: `insp_nok:${id}:${inspectorTgId}` },
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

// ── audit trail helper ──────────────────────────────────────────────────────
async function logEvent(opts: {
  ticketId: string;
  actorType: "pms_user" | "telegram_user" | "system";
  actorId?: string;
  actorName?: string;
  actorTgId?: number;
  event: string;
  prevStatus?: string;
  newStatus?: string;
  notes?: string;
}) {
  try {
    await db.from("maintenance_ticket_events").insert({
      ticket_id:   opts.ticketId,
      actor_type:  opts.actorType,
      actor_id:    opts.actorId   ?? null,
      actor_name:  opts.actorName ?? null,
      actor_tg_id: opts.actorTgId ?? null,
      event:       opts.event,
      prev_status: opts.prevStatus ?? null,
      new_status:  opts.newStatus  ?? null,
      notes:       opts.notes      ?? null,
    });
  } catch (e) {
    console.error("[logEvent] failed:", e);
  }
}

// ── sla alert ───────────────────────────────────────────────────────────────
async function sendSlaAlert() {
  const SLA: Record<string, number> = { urgent: 15, high: 60, medium: 240, low: 1440 };
  const now = Date.now();

  const { data: open } = await db.from("maintenance_tickets")
    .select("id,title,room_number,priority,created_at,sla_alerted_at")
    .in("status", ["open", "in_progress"])
    .limit(500);

  const breached = (open ?? []).filter(t => {
    const limit = SLA[t.priority] ?? 240;
    const alreadyAlerted = t.sla_alerted_at &&
      (now - new Date(t.sla_alerted_at).getTime()) < 60 * 60 * 1000; // não re-alerta em 1h
    return !alreadyAlerted && (now - new Date(t.created_at).getTime()) / 60000 > limit;
  });

  if (breached.length === 0) return { ok: true, alerted: 0 };

  const lines = [`⚠️ *${breached.length} chamado${breached.length > 1 ? "s" : ""} com SLA estourado\\!*`, ""];
  for (const t of breached.slice(0, 10)) {
    const uh = t.room_number ? ` — UH ${esc(t.room_number)}` : "";
    const mins = Math.round((now - new Date(t.created_at).getTime()) / 60000);
    lines.push(`${P_EMOJI[t.priority] ?? "•"} *${esc(t.title)}*${uh} — *${esc(formatDuration(mins))}* sem atendimento`);
  }
  if (breached.length > 10) lines.push(`_\\.\\.\\. e mais ${breached.length - 10} outros_`);

  await tg("sendMessage", { chat_id: CHAT_ID, text: lines.join("\n"), parse_mode: "MarkdownV2" });

  // Marca como alertado para não re-enviar imediatamente
  const ids = breached.map(t => t.id);
  await db.from("maintenance_tickets")
    .update({ sla_alerted_at: new Date().toISOString() })
    .in("id", ids);

  return { ok: true, alerted: breached.length };
}

// ── inspection trigger (shared) ─────────────────────────────────────────────
async function sendInspectionRequest(
  chatId: unknown,
  ticketId: string,
  techName: string,
  ticketTitle: string,
  roomNumber: string | null,
  durationPart: string,
) {
  const uhPart = roomNumber ? ` \\(UH ${esc(roomNumber)}\\)` : "";
  await tg("sendMessage", {
    chat_id: chatId,
    text: [
      `🔍 *Vistoria necessária*`, "",
      `*${esc(ticketTitle)}*${uhPart}`,
      `👷 Concluído por *${esc(techName)}*${durationPart}`,
      "",
      `_Somente moderadores do grupo podem assumir a vistoria\\._`,
      "", `🔖 \`${ticketId}\``,
    ].join("\n"),
    parse_mode: "MarkdownV2",
    reply_markup: inspectionKb(ticketId),
  });
}

// ── daily report ────────────────────────────────────────────────────────────
async function sendDailyReport() {
  const since24h   = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  // 4A: use allSettled so a partial DB failure doesn't silently send empty data
  const results = await Promise.allSettled([
    db.from("maintenance_tickets")
      .select("id,status,priority,created_at,resolved_at,room_number,status_reason,title")
      .gte("created_at", since24h.toISOString()),
    db.from("maintenance_tickets")
      .select("id,priority,created_at,room_number,title,awaiting_parts")
      .in("status", ["open", "in_progress"])
      .limit(500),
    db.from("maintenance_tickets")
      .select("id,room_number,status_reason,status")
      .gte("created_at", monthStart.toISOString())
      .neq("status", "cancelled")
      .limit(2000),
  ]);

  if (results[0].status === "rejected" || results[1].status === "rejected") {
    await tg("sendMessage", {
      chat_id: CHAT_ID,
      text: "⚠️ Erro ao gerar relatório diário \\— dados parciais ou indisponíveis\\.",
      parse_mode: "MarkdownV2",
    });
    return { ok: false, error: "partial_failure" };
  }

  const todayTickets = results[0].status === "fulfilled" ? results[0].value.data : null;
  const openTickets  = results[1].status === "fulfilled" ? results[1].value.data : null;
  const monthTickets = results[2].status === "fulfilled" ? results[2].value.data : null;

  const total         = todayTickets?.length ?? 0;
  const resolved      = todayTickets?.filter(t => t.status === "resolved").length ?? 0;
  const cancelled     = todayTickets?.filter(t => t.status === "cancelled").length ?? 0;
  const abertos       = openTickets?.length ?? 0;
  const awaitingParts = openTickets?.filter(t => t.awaiting_parts).length ?? 0;

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
  }) ?? [];

  const techCount: Record<string, number> = {};
  for (const t of todayTickets?.filter(t => t.status === "resolved" && t.status_reason) ?? []) {
    techCount[t.status_reason] = (techCount[t.status_reason] ?? 0) + 1;
  }
  const topTechEntry = Object.entries(techCount).sort((a, b) => b[1] - a[1])[0];

  const uhCount: Record<string, number> = {};
  for (const t of monthTickets ?? []) {
    if (!t.room_number) continue;
    uhCount[t.room_number] = (uhCount[t.room_number] ?? 0) + 1;
  }
  const top3UHs = Object.entries(uhCount).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const over24h = openTickets?.filter(
    t => (Date.now() - new Date(t.created_at).getTime()) / 60000 > 1440
  ) ?? [];

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
  if (awaitingParts > 0) lines.push(`🔩 Aguardando peças: *${awaitingParts}*`);
  if (avgMins !== null) lines.push(`⏱ Tempo medio de resolucao: *${esc(formatDuration(avgMins))}*`);
  if (topTechEntry) lines.push(`🏆 Tecnico destaque: *${esc(topTechEntry[0])}* \\(${topTechEntry[1]} resolucoes\\)`);
  lines.push("");
  lines.push(slaBreached.length > 0
    ? `⚠️ *${slaBreached.length} chamado${slaBreached.length > 1 ? "s" : ""} com SLA estourado\\!*`
    : `✔️ Nenhum chamado com SLA estourado\\.`);
  if (top3UHs.length > 0) {
    lines.push("", `🏨 *Top UHs do mes:*`);
    top3UHs.forEach(([uh, count], i) => lines.push(`${i + 1}\\. UH ${esc(uh)} — *${count}* chamados`));
  }
  if (over24h.length > 0) {
    lines.push("", `🕐 *Chamados sem atendimento ha mais de 24h:*`);
    over24h.slice(0, 5).forEach(t => {
      const hrs = Math.floor((Date.now() - new Date(t.created_at).getTime()) / 3600000);
      const uhPart = t.room_number ? ` \\(UH ${esc(t.room_number)}\\)` : "";
      lines.push(`• ${esc(t.title)}${uhPart} — *${hrs}h*`);
    });
    if (over24h.length > 5) lines.push(`_\\.\\.\\. e mais ${over24h.length - 5} outros_`);
  }

  await tg("sendMessage", { chat_id: CHAT_ID, text: lines.join("\n"), parse_mode: "MarkdownV2" });
  return { ok: true };
}

// ── manual resend ───────────────────────────────────────────────────────────
async function handleManualResend(payload: Record<string, unknown>) {
  const ticketId  = payload.ticket_id as string;
  const actorName = (payload.actor_name as string) ?? "Operador";
  if (!ticketId) return { ok: false, error: "missing ticket_id" };

  const { data: ticket } = await db
    .from("maintenance_tickets").select("*").eq("id", ticketId).single();
  if (!ticket) return { ok: false, error: "ticket not found" };

  const isReopened = typeof ticket.resolution_notes === "string" &&
    ticket.resolution_notes.startsWith("Reaberto:");
  const status = ticket.status ?? "open";
  const id     = ticket.id as string;

  let heading: string;
  let kb: Record<string, unknown> | undefined;
  let extraLine = "";

  if (isReopened && ticket.status === "open") {
    const lastTech = extractLastTech(ticket.resolution_notes as string);
    heading = `🔄 *Chamado reaberto — aguarda novo atendimento*`;
    kb = openKb(id);
    if (lastTech) extraLine = `\n👷 Último atendente\\: *${esc(lastTech)}*`;
    extraLine += `\n📢 _Reenvio solicitado por ${esc(actorName)}_`;
  } else if (status === "in_progress" && ticket.status_reason) {
    heading = `⏰ *Lembrete\\: chamado em andamento*`;
    kb = inProgressKb(id, ticket.telegram_user_id ?? undefined);
    const techMention = ticket.telegram_user_id
      ? `[${ticket.status_reason}](tg://user?id=${ticket.telegram_user_id})`
      : `*${esc(ticket.status_reason)}*`;
    extraLine = `\n👷 ${techMention}\\, por favor verifique este chamado\\!\n📢 _Reenvio solicitado por ${esc(actorName)}_`;
  } else if (status === "resolved") {
    heading = `✅ *Chamado já resolvido*`;
    extraLine = `\n📢 _Consultado por ${esc(actorName)}_`;
  } else {
    heading = `📢 *Chamado aguardando atendimento*`;
    kb = openKb(id);
    extraLine = `\n📢 _Reenvio solicitado por ${esc(actorName)}_`;
  }

  await tg("sendMessage", {
    chat_id: CHAT_ID,
    text: buildText(ticket, heading) + extraLine,
    parse_mode: "MarkdownV2",
    disable_web_page_preview: true,
    ...(kb ? { reply_markup: kb } : {}),
  });
  return { ok: true };
}

function extractLastTech(resolutionNotes: string): string | null {
  const m = resolutionNotes.match(/\(([^)]+)\)\s*$/);
  return m ? m[1] : null;
}

// ── db webhook dispatcher ───────────────────────────────────────────────────
async function handleDbWebhook(body: Record<string, unknown>, authHeader: string | null) {
  // Fix L: validate Authorization for internal trigger types
  const internalTypes = ["daily_report", "manual_resend", "request_rating", "sla_alert", "request_inspection"];
  if (internalTypes.includes(body.type as string)) {
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return { ok: false, error: "unauthorized" };
    }
    // Validate actual token value against WEBHOOK_SECRET
    const token = authHeader.slice(7);
    if (WEBHOOK_SECRET && token !== WEBHOOK_SECRET) {
      return { ok: false, error: "invalid token" };
    }
  }

  if ((body.type as string) === "daily_report")   return await sendDailyReport();
  if ((body.type as string) === "manual_resend")  return await handleManualResend(body);
  if ((body.type as string) === "sla_alert")      return await sendSlaAlert();

  if ((body.type as string) === "request_inspection") {
    const ticketId  = body.ticket_id as string;
    const actorName = (body.actor_name as string) ?? "Operador";
    if (!ticketId) return { ok: false, error: "missing ticket_id" };
    const { data: tk } = await db
      .from("maintenance_tickets")
      .select("title,room_number,status_reason,inspection_status,created_at,resolved_at")
      .eq("id", ticketId).single();
    if (!tk) return { ok: false, error: "ticket not found" };
    if (tk.inspection_status !== "pending") return { ok: false, error: "inspection not pending" };
    const mins = tk.resolved_at && tk.created_at
      ? Math.round((new Date(tk.resolved_at).getTime() - new Date(tk.created_at).getTime()) / 60000)
      : null;
    await sendInspectionRequest(
      CHAT_ID, ticketId,
      tk.status_reason ?? actorName,
      tk.title ?? "",
      tk.room_number ?? null,
      mins !== null ? ` em *${esc(formatDuration(mins))}*` : "",
    );
    return { ok: true };
  }

  // Fix J: validate inspection_status before sending rating
  if ((body.type as string) === "request_rating") {
    const ticketId = body.ticket_id as string;
    if (!ticketId) return { ok: false, error: "missing ticket_id" };
    const { data: tk } = await db
      .from("maintenance_tickets").select("title,inspection_status").eq("id", ticketId).single();
    if (!tk) return { ok: false, error: "ticket not found" };
    if (tk.inspection_status !== "approved") return { ok: false, error: "inspection not approved" };
    await tg("sendMessage", {
      chat_id: CHAT_ID,
      text: `⭐ *Vistoria aprovada\\!* Como foi o atendimento de *${esc(tk.title ?? "")}*\\? Avalie o chamado\\:`,
      parse_mode: "MarkdownV2",
      reply_markup: ratingKb(ticketId),
    });
    return { ok: true };
  }

  const event     = (body.type       as string)                  ?? "INSERT";
  const record    = (body.record     as Record<string, unknown>) ?? body;
  const oldRecord = (body.old_record as Record<string, unknown>) ?? {};

  if (event === "UPDATE") {
    const statusChanged   = oldRecord.status   !== record.status;
    const priorityChanged = oldRecord.priority !== record.priority;
    if (!statusChanged && !priorityChanged) return { ok: true, skipped: "no-change" };
    if (record.status === "cancelled")      return { ok: true, skipped: "cancelled" };
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
    const isDirected = record.assigned_to && oldRecord.status !== "in_progress";
    heading = isDirected ? `📌 *Chamado direcionado*` : `🔧 *Chamado assumido*`;
    kb = inProgressKb(id);
  } else if (status === "resolved") {
    const resolvedAt = record.resolved_at ? new Date(record.resolved_at as string) : new Date();
    const createdAt  = record.created_at  ? new Date(record.created_at  as string) : null;
    const mins = createdAt ? Math.round((resolvedAt.getTime() - createdAt.getTime()) / 60000) : null;
    heading = mins !== null ? `✅ *Resolvido em ${esc(formatDuration(mins))}*` : `✅ *Chamado resolvido*`;
    await tg("sendMessage", {
      chat_id: CHAT_ID,
      text: buildText(record, heading),
      parse_mode: "MarkdownV2",
      disable_web_page_preview: false,
    });
    // Fix D: only trigger inspection if not already dispatched via Telegram
    if (!record.inspection_status) {
      await sendInspectionRequest(
        CHAT_ID, id,
        (record.status_reason as string) ?? "Técnico",
        (record.title as string) ?? "",
        record.room_number as string | null,
        mins !== null ? ` em *${esc(formatDuration(mins))}*` : "",
      );
    }
    return { ok: true };
  } else if (status === "open" && event === "UPDATE") {
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
  return { ok: true };
}

// ── callback handler ────────────────────────────────────────────────────────
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

  // ── Rating ──────────────────────────────────────────────────────────────
  if (action === "rate") {
    const parts    = rest.split(":");
    const ticketId = parts[0];
    const rating   = Number(parts[1]);
    if (!ticketId || !rating || rating < 1 || rating > 5) {
      await tg("answerCallbackQuery", { callback_query_id: cbId });
      return { ok: true };
    }

    // 2E: atomic update — only write if rating is still null (prevents race condition)
    const { count: ratingCount } = await db.from("maintenance_tickets")
      .update({ rating, rated_by_tg_id: fromId, updated_at: new Date().toISOString() })
      .eq("id", ticketId)
      .is("rating", null)
      .select("id", { count: "exact", head: true });

    if (!ratingCount || ratingCount === 0) {
      const { data: tk } = await db
        .from("maintenance_tickets").select("rating").eq("id", ticketId).single();
      await tg("answerCallbackQuery", {
        callback_query_id: cbId,
        text: `✅ Este chamado já foi avaliado com ${tk?.rating ?? "?"}/5 estrelas.`,
        show_alert: true,
      });
      return { ok: true };
    }
    await tg("answerCallbackQuery", {
      callback_query_id: cbId,
      text: `⭐ Avaliacao ${rating}/5 registrada! Obrigado.`,
      show_alert: false,
    });
    if (msgId) await tg("editMessageReplyMarkup", { chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: [] } });
    await tg("sendMessage", {
      chat_id: chatId,
      text: `⭐ Atendimento avaliado em *${rating}/5* por *${esc(name)}*`,
      parse_mode: "MarkdownV2",
    });
    return { ok: true };
  }

  // ── Inspection: assume vistoria (somente moderadores) ───────────────────
  if (action === "insp_assume") {
    const ticketId = rest;
    if (!await isModerator(chatId, fromId)) {
      await tg("answerCallbackQuery", {
        callback_query_id: cbId,
        text: "🔒 Apenas moderadores do grupo podem assumir a vistoria.",
        show_alert: true,
      });
      return { ok: true };
    }
    await tg("answerCallbackQuery", { callback_query_id: cbId });

    const { data: ticket } = await db
      .from("maintenance_tickets").select("title,room_number,inspection_status").eq("id", ticketId).single();
    if (!ticket) return { ok: true };

    // Fix B+4: block if another moderator already assumed
    if (ticket.inspection_status !== null) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: `🔒 A vistoria deste chamado já foi assumida por outro moderador\\.`,
        parse_mode: "MarkdownV2",
      });
      return { ok: true };
    }

    // Fix B: save inspector_tg_id atomically; only update if inspection_status IS NULL
    const { count } = await db.from("maintenance_tickets").update({
      inspection_status: "pending",
      inspector_tg_id: fromId,
      updated_at: new Date().toISOString(),
    }).eq("id", ticketId).is("inspection_status", null).select("id", { count: "exact", head: true });

    if (!count || count === 0) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: `🔒 A vistoria deste chamado já foi assumida por outro moderador\\.`,
        parse_mode: "MarkdownV2",
      });
      return { ok: true };
    }

    if (msgId) {
      await tg("editMessageReplyMarkup", {
        chat_id: chatId, message_id: msgId,
        reply_markup: inspectorActionsKb(ticketId, fromId),
      });
    }

    const uhPart = ticket.room_number ? ` \\(UH ${esc(ticket.room_number)}\\)` : "";
    await tg("sendMessage", {
      chat_id: chatId,
      text: `🔍 *${esc(name)}* assumiu a vistoria de *${esc(ticket.title)}*${uhPart}`,
      parse_mode: "MarkdownV2",
    });
    return { ok: true };
  }

  // ── Inspection: approve ─────────────────────────────────────────────────
  if (action === "insp_ok") {
    const parts          = rest.split(":");
    const ticketId       = parts[0];
    const lockedInspId   = parts[1] ? Number(parts[1]) : null;

    // Fix B: validate lock against DB inspector_tg_id too
    if (lockedInspId && lockedInspId !== fromId) {
      await tg("answerCallbackQuery", {
        callback_query_id: cbId,
        text: "🔒 Apenas o vistoriador que assumiu pode aprovar.",
        show_alert: true,
      });
      return { ok: true };
    }
    await tg("answerCallbackQuery", { callback_query_id: cbId });

    const { data: ticket } = await db
      .from("maintenance_tickets").select("title,room_number,status_reason,inspector_tg_id").eq("id", ticketId).single();
    if (!ticket) return { ok: true };

    // Secondary DB-level lock check
    if (ticket.inspector_tg_id && ticket.inspector_tg_id !== fromId) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: `🔒 Apenas o vistoriador que assumiu pode aprovar este chamado\\.`,
        parse_mode: "MarkdownV2",
      });
      return { ok: true };
    }

    await db.from("maintenance_tickets").update({
      inspection_status: "approved",
      inspected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", ticketId);

    // 3C: audit
    await logEvent({
      ticketId, actorType: "telegram_user",
      actorId: String(fromId), actorName: name,
      event: "inspection_approved", prevStatus: "pending", newStatus: "approved",
    });

    if (msgId) await tg("editMessageReplyMarkup", { chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: [] } });

    const uhPart = ticket.room_number ? ` \\(UH ${esc(ticket.room_number)}\\)` : "";
    await tg("sendMessage", {
      chat_id: chatId,
      text: `✅ *${esc(name)}* aprovou a vistoria de *${esc(ticket.title)}*${uhPart}`,
      parse_mode: "MarkdownV2",
    });

    await tg("sendMessage", {
      chat_id: chatId,
      text: `⭐ Como foi o atendimento de *${esc(ticket.title)}*${uhPart}\\?\nAtendido por *${esc(ticket.status_reason ?? "Técnico")}*\\. Avalie\\:`,
      parse_mode: "MarkdownV2",
      reply_markup: ratingKb(ticketId),
    });
    return { ok: true };
  }

  // ── Inspection: reject ──────────────────────────────────────────────────
  if (action === "insp_nok") {
    const parts        = rest.split(":");
    const ticketId     = parts[0];
    const lockedInspId = parts[1] ? Number(parts[1]) : null;

    if (lockedInspId && lockedInspId !== fromId) {
      await tg("answerCallbackQuery", {
        callback_query_id: cbId,
        text: "🔒 Apenas o vistoriador que assumiu pode reprovar.",
        show_alert: true,
      });
      return { ok: true };
    }
    await tg("answerCallbackQuery", { callback_query_id: cbId });

    const { data: ticket } = await db
      .from("maintenance_tickets").select("title,inspector_tg_id").eq("id", ticketId).single();
    if (!ticket) return { ok: true };

    // DB-level lock check
    if (ticket.inspector_tg_id && ticket.inspector_tg_id !== fromId) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: `🔒 Apenas o vistoriador que assumiu pode reprovar este chamado\\.`,
        parse_mode: "MarkdownV2",
      });
      return { ok: true };
    }

    await tg("sendMessage", {
      chat_id: chatId,
      text: `❌ Descreva o problema encontrado \\[insp_reject:${esc(ticketId)}\\|${esc(String(fromId))}\\]:\n_${esc(ticket.title)}_`,
      parse_mode: "MarkdownV2",
      reply_to_message_id: msgId,
      reply_markup: { force_reply: true, selective: true },
    });
    return { ok: true };
  }

  // ── Ticket actions ──────────────────────────────────────────────────────
  const restParts      = rest.split(":");
  const ticketId       = restParts[0];
  const lockedTgUserId = restParts[1] ? Number(restParts[1]) : null;

  if (!ticketId) {
    await tg("answerCallbackQuery", { callback_query_id: cbId });
    return { ok: true };
  }

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

  // 3C: select específico — evita carregar campos desnecessários
  const { data: ticket } = await db
    .from("maintenance_tickets")
    .select("id,status,room_number,title,created_at,status_reason,telegram_user_id,awaiting_parts,resolution_notes,inspection_status,description,assigned_to,priority,resolved_at,inspection_notes,inspected_at,rating")
    .eq("id", ticketId).single();
  if (!ticket) return { ok: true };

  if (action === "assume") {
    // Fix A+10: atomic update with status guard to prevent double-assume
    const { count } = await db.from("maintenance_tickets").update({
      status: "in_progress",
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status_reason: name,
      telegram_user_id: fromId,
    }).eq("id", ticketId).eq("status", "open").select("id", { count: "exact", head: true });

    if (!count || count === 0) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: `⚠️ Este chamado já foi assumido por outro técnico\\.`,
        parse_mode: "MarkdownV2",
      });
      return { ok: true };
    }

    if (msgId) await tg("editMessageReplyMarkup", {
      chat_id: chatId, message_id: msgId, reply_markup: inProgressKb(ticketId, fromId),
    });
    const uhPart = ticket.room_number ? ` \\(UH ${esc(ticket.room_number)}\\)` : "";
    await tg("sendMessage", {
      chat_id: chatId,
      text: `🔧 *${esc(name)}* assumiu: *${esc(ticket.title)}*${uhPart}`,
      parse_mode: "MarkdownV2",
    });
    // 3C: audit
    await logEvent({
      ticketId, actorType: "telegram_user",
      actorId: String(fromId), actorName: name,
      event: "assumed", prevStatus: "open", newStatus: "in_progress",
    });

  } else if (action === "parts_ok") {
    // 4C: técnico recebeu as peças — limpa flag e devolve ao fluxo normal
    if (ticket.status === "resolved" || ticket.status === "cancelled") {
      await tg("answerCallbackQuery", { callback_query_id: cbId,
        text: `Chamado já está ${ticket.status}.`, show_alert: true });
      return { ok: true };
    }
    await db.from("maintenance_tickets").update({
      awaiting_parts: false,
      updated_at: new Date().toISOString(),
    }).eq("id", ticketId);
    if (msgId) await tg("editMessageReplyMarkup", {
      chat_id: chatId, message_id: msgId,
      reply_markup: inProgressKb(ticketId, lockedTgUserId ?? undefined),
    });
    await tg("sendMessage", {
      chat_id: chatId,
      text: `📦 *${esc(name)}* confirmou que as peças foram recebidas\\. Chamado retomado\\!`,
      parse_mode: "MarkdownV2",
    });

  } else if (action === "resolve") {
    // Fix 8: only allow resolve if ticket is in_progress
    if (ticket.status !== "in_progress") {
      await tg("sendMessage", {
        chat_id: chatId,
        text: `⚠️ Este chamado não está em andamento \\(status: ${esc(ticket.status)}\\)\\.`,
        parse_mode: "MarkdownV2",
      });
      return { ok: true };
    }
    const lockSuffix = lockedTgUserId ? `\\|${esc(String(lockedTgUserId))}` : "";
    await tg("sendMessage", {
      chat_id: chatId,
      text: `✍️ Descreva a solução \\[${esc(ticketId)}${lockSuffix}\\]:\n_${esc(ticket.title)}_`,
      parse_mode: "MarkdownV2",
      reply_to_message_id: msgId,
      reply_markup: { force_reply: true, selective: true },
    });

  } else if (action === "parts") {
    // Fix 9: only allow parts report if ticket is active
    if (ticket.status === "resolved" || ticket.status === "cancelled") {
      await tg("sendMessage", {
        chat_id: chatId,
        text: `⚠️ Este chamado já está ${esc(ticket.status === "resolved" ? "resolvido" : "cancelado")}\\. Não é possível registrar falta de peças\\.`,
        parse_mode: "MarkdownV2",
      });
      return { ok: true };
    }
    const lockSuffix = lockedTgUserId ? `\\|${esc(String(lockedTgUserId))}` : "";
    await tg("sendMessage", {
      chat_id: chatId,
      text: `🔩 Quais peças são necessárias? \\[${esc(ticketId)}${lockSuffix}\\]\n_${esc(ticket.title)}_`,
      parse_mode: "MarkdownV2",
      reply_to_message_id: msgId,
      reply_markup: { force_reply: true, selective: true },
    });

  } else if (action === "details") {
    const elapsed = formatDuration(Math.floor((Date.now() - new Date(ticket.created_at as string).getTime()) / 60000));
    const lines = [
      `*Chamado \\#${esc(ticket.id as string)}*`,
      `🏠 UH: ${esc(ticket.room_number as string)}`,
      `📌 Título: ${esc(ticket.title as string)}`,
      ticket.description ? `📝 Descrição: ${esc(ticket.description as string)}` : null,
      `🔥 Prioridade: ${esc(P_LABEL[(ticket.priority as string)] ?? (ticket.priority as string))}`,
      `📊 Status: ${esc(ST_LABEL[(ticket.status as string)] ?? (ticket.status as string))}`,
      `⏱ Aberto há: ${esc(elapsed)}`,
      ticket.resolution_notes ? `🗒 Notas: ${esc((ticket.resolution_notes as string).slice(0, 300))}` : null,
    ].filter(Boolean).join("\n");
    await tg("sendMessage", { chat_id: chatId, text: lines, parse_mode: "MarkdownV2" });

  } else if (action === "note") {
    if (ticket.status === "resolved" || ticket.status === "cancelled") {
      await tg("sendMessage", {
        chat_id: chatId,
        text: `⚠️ Este chamado já está encerrado e não aceita novas notas\\.`,
        parse_mode: "MarkdownV2",
      });
      return { ok: true };
    }
    await tg("sendMessage", {
      chat_id: chatId,
      text: `📝 Digite sua nota de andamento \\[note:${esc(ticketId)}\\|${esc(String(fromId))}\\]:\n_${esc(ticket.title)}_`,
      parse_mode: "MarkdownV2",
      reply_to_message_id: msgId,
      reply_markup: { force_reply: true, selective: true },
    });

  } else if (action === "transfer") {
    if (!lockedTgUserId || lockedTgUserId !== fromId) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: `🔒 Apenas o técnico responsável pode transferir este chamado\\.`,
        parse_mode: "MarkdownV2",
      });
      return { ok: true };
    }
    if (ticket.status !== "in_progress") {
      await tg("sendMessage", {
        chat_id: chatId,
        text: `⚠️ Este chamado não está em andamento e não pode ser transferido\\.`,
        parse_mode: "MarkdownV2",
      });
      return { ok: true };
    }
    const { count: transferCount } = await db.from("maintenance_tickets")
      .update({ status: "open", telegram_user_id: null, assigned_to: null, status_reason: null, updated_at: new Date().toISOString() })
      .eq("id", ticketId).eq("status", "in_progress").eq("telegram_user_id", fromId)
      .select("id", { count: "exact", head: true });
    if (!transferCount || transferCount === 0) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: `⚠️ Chamado já foi alterado por outra ação\\.`,
        parse_mode: "MarkdownV2",
      });
      return { ok: true };
    }
    await logEvent({
      ticketId, actorType: "telegram_user",
      actorId: String(fromId), actorName: name,
      event: "transferred", prevStatus: "in_progress", newStatus: "open",
      notes: "técnico liberou chamado de volta para a fila",
    });
    const uhPart = ticket.room_number ? ` — UH ${esc(ticket.room_number as string)}` : "";
    await tg("sendMessage", {
      chat_id: chatId,
      text: `🔄 *${esc(name)}* transferiu chamado de volta para a fila\\.\n📌 *${esc(ticket.title as string)}*${uhPart}\n\nOutro técnico pode assumir\\:`,
      parse_mode: "MarkdownV2",
      reply_markup: openKb(ticketId),
    });
  }

  return { ok: true };
}

// ── reply handler ────────────────────────────────────────────────────────────
async function handleReply(message: Record<string, unknown>) {
  const replyTo   = (message.reply_to_message as Record<string, unknown>) ?? {};
  const replyText = (replyTo.text as string) ?? "";
  const userText  = (message.text as string) ?? "";
  const chatId    = (message.chat as Record<string, unknown>)?.id ?? CHAT_ID;
  const from      = (message.from as Record<string, unknown>) ?? {};
  const fromId    = Number(from.id);
  const name      = [from.first_name, from.last_name].filter(Boolean).join(" ") || "Tecnico";

  // /urgente via reply
  if (userText.trim().toLowerCase().startsWith("/urgente")) {
    const uuidMatch = replyText.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (uuidMatch) {
      const ticketId = uuidMatch[1];
      const { data: tk } = await db
        .from("maintenance_tickets").select("title,status").eq("id", ticketId).single();
      if (tk && tk.status !== "resolved" && tk.status !== "cancelled") {
        await db.from("maintenance_tickets").update({ priority: "urgent", updated_at: new Date().toISOString() }).eq("id", ticketId);
        await tg("sendMessage", {
          chat_id: chatId,
          text: `🔴 *${esc(name)}* marcou como URGENTE:\n*${esc(tk.title)}*`,
          parse_mode: "MarkdownV2",
        });
      }
    }
    return { ok: true };
  }

  // ── Inspection rejection reason ──────────────────────────────────────────
  const inspRejectMatch = replyText.match(/\[insp_reject:([0-9a-f-]{36})\|(\d+)\]/i);
  if (inspRejectMatch) {
    const ticketId       = inspRejectMatch[1];
    const lockedInspId   = Number(inspRejectMatch[2]);

    if (lockedInspId && lockedInspId !== fromId) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: `🔒 Apenas o vistoriador que assumiu pode reprovar este chamado\\.`,
        parse_mode: "MarkdownV2",
      });
      return { ok: true };
    }

    const { data: ticket } = await db
      .from("maintenance_tickets").select("title,room_number,status_reason,telegram_user_id,status").eq("id", ticketId).single();
    if (!ticket) return { ok: true };

    // Fix 11: only reject if ticket is still resolved (awaiting inspection)
    if (ticket.status !== "resolved") {
      await tg("sendMessage", {
        chat_id: chatId,
        text: `⚠️ Este chamado não está mais aguardando vistoria \\(status atual: ${esc(ticket.status)}\\)\\.`,
        parse_mode: "MarkdownV2",
      });
      return { ok: true };
    }

    await db.from("maintenance_tickets").update({
      status: "in_progress",
      inspection_status: "rejected",
      inspection_notes: userText,
      inspected_at: new Date().toISOString(),
      resolved_at: null,
      awaiting_parts: false,
      updated_at: new Date().toISOString(),
    }).eq("id", ticketId);

    const uhPart = ticket.room_number ? ` \\(UH ${esc(ticket.room_number)}\\)` : "";
    const techMention = ticket.telegram_user_id
      ? `[${ticket.status_reason ?? "Técnico"}](tg://user?id=${ticket.telegram_user_id})`
      : `*${esc(ticket.status_reason ?? "Técnico")}*`;

    await tg("sendMessage", {
      chat_id: chatId,
      text: [
        `❌ *Vistoria reprovada* por *${esc(name)}*`,
        `📋 ${esc(ticket.title)}${uhPart}`,
        ``,
        `📝 Motivo: _${esc(userText)}_`,
        ``,
        `👷 ${techMention}\\, o chamado voltou para em andamento\\. Por favor corrija e conclua novamente\\.`,
      ].join("\n"),
      parse_mode: "MarkdownV2",
      reply_markup: inProgressKb(ticketId, ticket.telegram_user_id ?? undefined),
    });
    return { ok: true };
  }

  // ── Moderator action: cancel ─────────────────────────────────────────────
  const cancelMatch = replyText.match(/\[cancel:([0-9a-f-]{36})\|(\d+)\]/i);
  if (cancelMatch) {
    const ticketId    = cancelMatch[1];
    const lockedModId = Number(cancelMatch[2]);
    if (lockedModId !== fromId) {
      await tg("sendMessage", { chat_id: chatId, text: `🔒 Apenas o moderador que iniciou o cancelamento pode confirmar\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    const { data: ticket } = await db.from("maintenance_tickets").select("title,status").eq("id", ticketId).single();
    if (!ticket || ticket.status === "cancelled") return { ok: true };
    const now = new Date().toISOString();
    await db.from("maintenance_tickets").update({
      status: "cancelled",
      status_reason: name,
      resolution_notes: `Cancelado: ${userText}`,
      updated_at: now,
    }).eq("id", ticketId);
    await logEvent({ ticketId, actorType: "telegram_user", actorId: String(fromId), actorName: name,
      event: "cancelled_by_moderator", prevStatus: ticket.status, newStatus: "cancelled", notes: userText.slice(0, 500) });
    await tg("sendMessage", {
      chat_id: chatId,
      text: `❌ *${esc(name)}* cancelou: *${esc(ticket.title)}*\n_${esc(userText)}_`,
      parse_mode: "MarkdownV2",
    });
    return { ok: true };
  }

  // ── Moderator action: reopen ──────────────────────────────────────────────
  const reopenMatch = replyText.match(/\[reopen:([0-9a-f-]{36})\|(\d+)\]/i);
  if (reopenMatch) {
    const ticketId    = reopenMatch[1];
    const lockedModId = Number(reopenMatch[2]);
    if (lockedModId !== fromId) {
      await tg("sendMessage", { chat_id: chatId, text: `🔒 Apenas o moderador que iniciou a reabertura pode confirmar\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    const { data: ticket } = await db.from("maintenance_tickets").select("title,status").eq("id", ticketId).single();
    if (!ticket) return { ok: true };
    if (ticket.status !== "resolved" && ticket.status !== "cancelled") {
      await tg("sendMessage", { chat_id: chatId, text: `⚠️ Este chamado não pode ser reaberto \\(status: ${esc(ST_LABEL[ticket.status] ?? ticket.status)}\\)\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    const now = new Date().toISOString();
    await db.from("maintenance_tickets").update({
      status: "open",
      resolution_notes: `Reaberto: ${userText} (${name})`,
      inspection_status: null,
      inspector_tg_id: null,
      resolved_at: null,
      started_at: null,
      telegram_user_id: null,
      awaiting_parts: false,
      updated_at: now,
    }).eq("id", ticketId);
    await logEvent({ ticketId, actorType: "telegram_user", actorId: String(fromId), actorName: name,
      event: "reopened_by_moderator", prevStatus: ticket.status, newStatus: "open", notes: userText.slice(0, 500) });
    await tg("sendMessage", {
      chat_id: chatId,
      text: `🔄 *${esc(name)}* reabriu: *${esc(ticket.title)}*\n_${esc(userText)}_`,
      parse_mode: "MarkdownV2",
      reply_markup: openKb(ticketId),
    });
    return { ok: true };
  }

  // ── Moderator action: direct to tech ─────────────────────────────────────
  const directMatch = replyText.match(/\[direct:([0-9a-f-]{36})\|(\d+)\]/i);
  if (directMatch) {
    const ticketId    = directMatch[1];
    const lockedModId = Number(directMatch[2]);
    if (lockedModId !== fromId) {
      await tg("sendMessage", { chat_id: chatId, text: `🔒 Apenas o moderador que iniciou o direcionamento pode confirmar\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    const techQuery = userText.trim();
    if (!techQuery) return { ok: true };
    const { data: ticket } = await db.from("maintenance_tickets").select("title,status").eq("id", ticketId).single();
    if (!ticket) return { ok: true };
    const { data: profiles } = await db.from("profiles")
      .select("id,name,role")
      .ilike("name", `%${techQuery}%`)
      .eq("role", "maintenance");
    if (!profiles || profiles.length === 0) {
      await tg("sendMessage", { chat_id: chatId, text: `❌ Técnico não encontrado: _${esc(techQuery)}_\\.\nVerifique o nome e tente novamente\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    if (profiles.length > 1) {
      const lines = [`🔍 *Mais de um técnico encontrado — seja mais específico\\:*`, ""];
      for (const p of profiles) lines.push(`• *${esc(p.name)}*`);
      await tg("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    const tech = profiles[0];
    const now  = new Date().toISOString();
    await db.from("maintenance_tickets").update({
      status: "in_progress",
      assigned_to: tech.id,
      status_reason: tech.name,
      started_at: now,
      updated_at: now,
      // telegram_user_id não é definido — qualquer técnico pode concluir
    }).eq("id", ticketId);
    await logEvent({ ticketId, actorType: "telegram_user", actorId: String(fromId), actorName: name,
      event: "directed", prevStatus: ticket.status, newStatus: "in_progress", notes: `Direcionado para: ${tech.name}` });
    await tg("sendMessage", {
      chat_id: chatId,
      text: `📌 *${esc(name)}* direcionou *${esc(ticket.title)}* para *${esc(tech.name)}*`,
      parse_mode: "MarkdownV2",
      reply_markup: inProgressKb(ticketId),
    });
    return { ok: true };
  }

  // ── Note addition reply [note:UUID|USER_ID] ─────────────────────────────
  const noteMatch = replyText.match(/\[note:([0-9a-f-]{36})\|(\d+)\]/i);
  if (noteMatch) {
    const tId     = noteMatch[1];
    const ownerId = Number(noteMatch[2]);
    if (ownerId !== fromId) return { ok: true };
    const noteText = userText.trim();
    if (!noteText) return { ok: true };
    const { data: tk } = await db.from("maintenance_tickets")
      .select("resolution_notes,status,room_number,title").eq("id", tId).single();
    if (!tk || tk.status === "resolved" || tk.status === "cancelled") return { ok: true };
    const stamp = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const newNotes = [tk.resolution_notes, `[${stamp}] ${noteText}`].filter(Boolean).join("\n");
    await db.from("maintenance_tickets").update({ resolution_notes: newNotes, updated_at: new Date().toISOString() }).eq("id", tId);
    await logEvent({
      ticketId: tId, actorType: "telegram_user",
      actorId: String(fromId), actorName: name,
      event: "note_added", notes: noteText.slice(0, 500),
    });
    const uhPart = tk.room_number ? ` — UH ${esc(tk.room_number)}` : "";
    await tg("sendMessage", {
      chat_id: chatId,
      text: `📝 *Nota de andamento* por *${esc(name)}*\n📌 *${esc(tk.title)}*${uhPart}\n\n_${esc(noteText)}_`,
      parse_mode: "MarkdownV2",
    });
    return { ok: true };
  }

  // ── Ticket force-reply responses [UUID] or [UUID|LOCKED_TG_ID] ───────────
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
    const { data: ticket } = await db
      .from("maintenance_tickets").select("created_at,title,room_number,status").eq("id", ticketId).single();

    // Fix F/8: validate ticket is still in_progress before resolving
    if (!ticket || ticket.status !== "in_progress") {
      await tg("sendMessage", {
        chat_id: chatId,
        text: `⚠️ Este chamado não pode ser concluído pois não está em andamento \\(status: ${esc(ticket?.status ?? "desconhecido")}\\)\\.`,
        parse_mode: "MarkdownV2",
      });
      return { ok: true };
    }

    const mins = ticket.created_at
      ? Math.round((Date.now() - new Date(ticket.created_at).getTime()) / 60000)
      : null;

    const now = new Date().toISOString();
    // 1B: update atômico — só resolve se ainda estiver in_progress (guard contra race condition)
    const { count: resolvedCount } = await db.from("maintenance_tickets").update({
      status: "resolved",
      resolved_at: now,
      updated_at: now,
      resolution_notes: userText,
      status_reason: name,
      awaiting_parts: false,
      inspection_status: null,
      inspector_tg_id: null,
      inspection_requested_at: now,
    }).eq("id", ticketId).eq("status", "in_progress").select("id", { count: "exact", head: true });

    if (!resolvedCount || resolvedCount === 0) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: `⚠️ Chamado já foi alterado por outra ação e não pôde ser concluído\\.`,
        parse_mode: "MarkdownV2",
      });
      return { ok: true };
    }

    // 3C: audit trail
    await logEvent({
      ticketId, actorType: "telegram_user",
      actorId: String(fromId), actorName: name,
      event: "resolved", prevStatus: "in_progress", newStatus: "resolved",
      notes: userText.slice(0, 500),
    });

    const durationPart = mins !== null ? ` em *${esc(formatDuration(mins))}*` : "";

    await tg("sendMessage", {
      chat_id: chatId,
      text: `✅ Concluído${durationPart} por *${esc(name)}*\\!\n📝 ${esc(userText)}`,
      parse_mode: "MarkdownV2",
    });

    // Inspection request is handled by the DB webhook — do not send twice
  } else if (isParts) {
    const { data: ticket } = await db
      .from("maintenance_tickets").select("status").eq("id", ticketId).single();

    // Fix F/9: validate ticket is active before registering parts
    if (!ticket || ticket.status === "resolved" || ticket.status === "cancelled") {
      await tg("sendMessage", {
        chat_id: chatId,
        text: `⚠️ Este chamado não está ativo \\(status: ${esc(ticket?.status ?? "desconhecido")}\\)\\.`,
        parse_mode: "MarkdownV2",
      });
      return { ok: true };
    }

    await db.from("maintenance_tickets").update({
      updated_at: new Date().toISOString(),
      awaiting_parts: true,
      resolution_notes: `⚠️ Aguardando pecas: ${userText} (${name})`,
    }).eq("id", ticketId);
    await tg("sendMessage", {
      chat_id: chatId,
      text: `🔩 *Falta de peças registrada* por *${esc(name)}*\n\n📦 ${esc(userText)}\n\n_O chamado foi sinalizado no PMS como aguardando material\\._`,
      parse_mode: "MarkdownV2",
      reply_markup: partsReceivedKb(ticketId, lockedTgUserId ?? undefined),
    });
  }

  return { ok: true };
}

// ── message handler ─────────────────────────────────────────────────────────
async function handleMessage(message: Record<string, unknown>) {
  const text   = (message.text as string) ?? "";
  const msgId  = message.message_id;
  const chatId = (message.chat as Record<string, unknown>)?.id ?? CHAT_ID;
  const from   = (message.from as Record<string, unknown>) ?? {};
  const name   = [from.first_name, from.last_name].filter(Boolean).join(" ") || "Tecnico";
  const fromId = Number(from.id);
  // 3F: guard para mensagem vazia ou só espaços
  if (!text.trim()) return { ok: true };

  const cmd    = text.trim().toLowerCase().split(/\s+/)[0];

  // Fix H: restrict data commands to the configured group only
  const isGroupChat = String(chatId) === String(CHAT_ID);

  if (cmd === "/urgente") {
    const uuidMatch = text.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (!uuidMatch) {
      await tg("sendMessage", { chat_id: chatId, text: `❓ Responda a mensagem de um chamado com /urgente para marcá\\-lo como urgente\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    const ticketId = uuidMatch[1];
    const { data: tk } = await db.from("maintenance_tickets").select("title,status").eq("id", ticketId).single();
    if (tk && tk.status !== "resolved" && tk.status !== "cancelled") {
      await db.from("maintenance_tickets").update({ priority: "urgent", updated_at: new Date().toISOString() }).eq("id", ticketId);
      await tg("sendMessage", { chat_id: chatId, text: `🔴 *${esc(name)}* marcou como URGENTE:\n*${esc(tk.title)}*`, parse_mode: "MarkdownV2" });
    }
    return { ok: true };
  }

  if (cmd === "/status") {
    if (!isGroupChat) {
      await tg("sendMessage", { chat_id: chatId, text: `ℹ️ Use este comando no grupo de manutenção\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    // 3E: uma única query — inProg é subconjunto de open
    const { data: open } = await db.from("maintenance_tickets")
      .select("id,priority,status,created_at,awaiting_parts").in("status", ["open", "in_progress"]).limit(500);
    const SLA_LIMITS: Record<string, number> = { urgent: 15, high: 60, medium: 240, low: 1440 };
    const breached      = (open ?? []).filter(t => (Date.now() - new Date(t.created_at).getTime()) / 60000 > (SLA_LIMITS[t.priority] ?? 240));
    const awaitingParts = (open ?? []).filter(t => t.awaiting_parts).length;
    const inProgCount   = (open ?? []).filter(t => t.status === "in_progress").length;
    const lines = [
      `📊 *Status atual da Manutenção*`, "",
      `📋 Abertos/em andamento: *${(open ?? []).length}*`,
      `🔧 Em andamento: *${inProgCount}*`,
    ];
    if (awaitingParts > 0) lines.push(`🔩 Aguardando peças: *${awaitingParts}*`);
    lines.push(breached.length > 0 ? `⚠️ SLA estourado: *${breached.length}*` : `✔️ Nenhum SLA estourado`);
    if ((open ?? []).length === 0) lines.push("", `🎉 Nenhum chamado pendente\\!`);
    await tg("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "MarkdownV2" });
    return { ok: true };
  }

  if (cmd === "/listar") {
    if (!isGroupChat) {
      await tg("sendMessage", { chat_id: chatId, text: `ℹ️ Use este comando no grupo de manutenção\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    const { data: open } = await db.from("maintenance_tickets")
      .select("id,priority,room_number,title,created_at,awaiting_parts")
      .in("status", ["open", "in_progress"]).order("created_at", { ascending: true }).limit(10);
    if (!open || open.length === 0) {
      await tg("sendMessage", { chat_id: chatId, text: `✅ Nenhum chamado aberto no momento\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    const lines = [`📋 *Chamados em aberto \\(${open.length}\\)*`, ""];
    for (const t of open) {
      const mins = Math.round((Date.now() - new Date(t.created_at).getTime()) / 60000);
      const uhPart = t.room_number ? ` — UH ${esc(t.room_number)}` : "";
      const partsBadge = t.awaiting_parts ? " 🔩" : "";
      lines.push(`${P_EMOJI[t.priority] ?? "•"} *${esc(t.title)}*${uhPart}${partsBadge}`);
      lines.push(`  ⏱ ${esc(formatDuration(mins))} atrás  \\|  \`${t.id}\``);
    }
    await tg("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "MarkdownV2" });
    return { ok: true };
  }

  if (cmd === "/buscar") {
    if (!isGroupChat) {
      await tg("sendMessage", { chat_id: chatId, text: `ℹ️ Use este comando no grupo de manutenção\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    const arg = text.trim().split(/\s+/)[1] ?? "";
    if (!arg) {
      await tg("sendMessage", { chat_id: chatId, text: `❓ Uso: /buscar \\[UUID ou número da UH\\]\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    if (arg.includes("-")) {
      const { data: ticket } = await db.from("maintenance_tickets").select("*").eq("id", arg).single();
      if (!ticket) {
        await tg("sendMessage", { chat_id: chatId, text: `❌ Chamado não encontrado: \`${esc(arg)}\`\\.`, parse_mode: "MarkdownV2" });
        return { ok: true };
      }
      const status = ticket.status as string;
      const mins = Math.round((Date.now() - new Date(ticket.created_at as string).getTime()) / 60000);
      const heading = `🔍 *Chamado — ${esc(ST_LABEL[status] ?? status)} — ⏱ ${esc(formatDuration(mins))}*`;
      await tg("sendMessage", { chat_id: chatId, text: buildText(ticket, heading), parse_mode: "MarkdownV2", disable_web_page_preview: true });
    } else {
      // 3D: ilike para busca case-insensitive de número de UH
      const { data: tickets } = await db.from("maintenance_tickets")
        .select("id,priority,title,status,created_at,awaiting_parts")
        .ilike("room_number", arg)
        .order("created_at", { ascending: false })
        .limit(5);
      if (!tickets || tickets.length === 0) {
        await tg("sendMessage", { chat_id: chatId, text: `❌ Nenhum chamado encontrado para UH *${esc(arg)}*\\.`, parse_mode: "MarkdownV2" });
        return { ok: true };
      }
      const lines = [`🔍 *Últimos chamados — UH ${esc(arg)} \\(${tickets.length}\\)*`, ""];
      for (const t of tickets) {
        const mins = Math.round((Date.now() - new Date(t.created_at).getTime()) / 60000);
        const partsBadge = t.awaiting_parts ? " 🔩" : "";
        lines.push(`${P_EMOJI[t.priority] ?? "•"} *${esc(t.title)}*${partsBadge} — _${esc(ST_LABEL[t.status] ?? t.status)}_`);
        lines.push(`  ⏱ ${esc(formatDuration(mins))} atrás  \\|  \`${t.id}\``);
      }
      await tg("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "MarkdownV2" });
    }
    return { ok: true };
  }

  if (cmd === "/peças" || cmd === "/pecas") {
    if (!isGroupChat) {
      await tg("sendMessage", { chat_id: chatId, text: `ℹ️ Use este comando no grupo de manutenção\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    const { data: waiting } = await db.from("maintenance_tickets")
      .select("id,priority,title,room_number,created_at")
      .eq("awaiting_parts", true)
      .in("status", ["open", "in_progress"])
      .order("created_at", { ascending: true });
    if (!waiting || waiting.length === 0) {
      await tg("sendMessage", { chat_id: chatId, text: `✅ Nenhum chamado aguardando peças\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    const lines = [`🔩 *Chamados aguardando peças \\(${waiting.length}\\)*`, ""];
    for (const t of waiting) {
      const mins = Math.round((Date.now() - new Date(t.created_at).getTime()) / 60000);
      const uhPart = t.room_number ? ` — UH ${esc(t.room_number)}` : "";
      lines.push(`${P_EMOJI[t.priority] ?? "•"} *${esc(t.title)}*${uhPart} — ⏱ ${esc(formatDuration(mins))}`);
      lines.push(`  \`${t.id}\``);
    }
    await tg("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "MarkdownV2" });
    return { ok: true };
  }

  if (cmd === "/sla") {
    if (!isGroupChat) {
      await tg("sendMessage", { chat_id: chatId, text: `ℹ️ Use este comando no grupo de manutenção\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    const SLA_LIMITS: Record<string, number> = { urgent: 15, high: 60, medium: 240, low: 1440 };
    const now = Date.now();
    const { data: open } = await db.from("maintenance_tickets")
      .select("id,title,room_number,priority,created_at")
      .in("status", ["open", "in_progress"])
      .limit(500);
    const breached = (open ?? [])
      .filter(t => (now - new Date(t.created_at).getTime()) / 60000 > (SLA_LIMITS[t.priority] ?? 240))
      .sort((a, b) => {
        const overA = (now - new Date(a.created_at).getTime()) / 60000 - (SLA_LIMITS[a.priority] ?? 240);
        const overB = (now - new Date(b.created_at).getTime()) / 60000 - (SLA_LIMITS[b.priority] ?? 240);
        return overB - overA;
      });
    if (breached.length === 0) {
      await tg("sendMessage", { chat_id: chatId, text: `✔️ Nenhum chamado com SLA estourado\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    const lines = [`⚠️ *${breached.length} chamado${breached.length > 1 ? "s" : ""} com SLA estourado\\!*`, ""];
    for (const t of breached.slice(0, 15)) {
      const elapsedMins = Math.round((now - new Date(t.created_at).getTime()) / 60000);
      const overMins    = elapsedMins - (SLA_LIMITS[t.priority] ?? 240);
      const uhPart      = t.room_number ? ` — UH ${esc(t.room_number)}` : "";
      lines.push(`${P_EMOJI[t.priority] ?? "•"} *${esc(t.title)}*${uhPart}`);
      lines.push(`  ⏱ ${esc(formatDuration(overMins))} além do SLA  \\|  \`${t.id}\``);
    }
    if (breached.length > 15) lines.push(`_\\.\\.\\. e mais ${breached.length - 15} outros_`);
    await tg("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "MarkdownV2" });
    return { ok: true };
  }

  if (cmd === "/meus") {
    if (!isGroupChat) {
      await tg("sendMessage", { chat_id: chatId, text: `ℹ️ Use este comando no grupo de manutenção\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    // Fix E: use telegram_user_id for reliable lookup; fallback to name ilike
    let mine = null;
    if (fromId) {
      const { data } = await db.from("maintenance_tickets")
        .select("id,priority,room_number,title,started_at,awaiting_parts")
        .eq("status", "in_progress").eq("telegram_user_id", fromId);
      mine = data;
    }
    // Fallback for tickets assumed before telegram_user_id was tracked
    if ((!mine || mine.length === 0) && name !== "Tecnico") {
      const { data } = await db.from("maintenance_tickets")
        .select("id,priority,room_number,title,started_at,awaiting_parts")
        .eq("status", "in_progress").ilike("status_reason", name);
      mine = data;
    }
    if (!mine || mine.length === 0) {
      await tg("sendMessage", { chat_id: chatId, text: `ℹ️ Nenhum chamado em andamento para *${esc(name)}*\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    const lines = [`🔧 *Seus chamados em andamento \\(${mine.length}\\)*`, ""];
    for (const t of mine) {
      const mins = t.started_at ? Math.round((Date.now() - new Date(t.started_at).getTime()) / 60000) : null;
      const uhPart = t.room_number ? ` — UH ${esc(t.room_number)}` : "";
      const timePart = mins !== null ? `  ⏱ ${esc(formatDuration(mins))}` : "";
      const partsBadge = t.awaiting_parts ? " 🔩 _aguardando peças_" : "";
      lines.push(`${P_EMOJI[t.priority] ?? "•"} *${esc(t.title)}*${uhPart}${timePart}${partsBadge}`);
      lines.push(`  \`${t.id}\``);
    }
    await tg("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "MarkdownV2" });
    return { ok: true };
  }

  // 2D: /liberar — moderador libera ticket travado por técnico desconectado
  if (cmd === "/liberar") {
    if (!isGroupChat) {
      await tg("sendMessage", { chat_id: chatId, text: `ℹ️ Use este comando no grupo de manutenção\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    if (!await isModerator(chatId, fromId)) {
      await tg("sendMessage", { chat_id: chatId, text: `🔒 Apenas moderadores podem liberar chamados travados\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    const uuidMatch = text.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (!uuidMatch) {
      await tg("sendMessage", { chat_id: chatId, text: `❓ Uso: /liberar \\[UUID do chamado\\]\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    const ticketId = uuidMatch[1];
    const { data: tk } = await db.from("maintenance_tickets").select("title,status,status_reason").eq("id", ticketId).single();
    if (!tk || tk.status !== "in_progress") {
      await tg("sendMessage", { chat_id: chatId, text: `⚠️ Chamado não encontrado ou não está em andamento\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    await db.from("maintenance_tickets").update({
      telegram_user_id: null,
      status: "open",
      status_reason: null,
      started_at: null,
      updated_at: new Date().toISOString(),
    }).eq("id", ticketId).eq("status", "in_progress");
    await logEvent({
      ticketId, actorType: "telegram_user",
      actorId: String(fromId), actorName: name,
      event: "unlocked_by_moderator", prevStatus: "in_progress", newStatus: "open",
      notes: `Liberado de: ${tk.status_reason ?? "desconhecido"}`,
    });
    await tg("sendMessage", {
      chat_id: chatId,
      text: `🔓 *${esc(name)}* liberou o chamado *${esc(tk.title)}*\\. Está aberto para assumir novamente\\.`,
      parse_mode: "MarkdownV2",
      reply_markup: openKb(ticketId),
    });
    return { ok: true };
  }

  // /reenviar — moderador reenvia notificação de um chamado específico
  if (cmd === "/reenviar") {
    if (!isGroupChat) {
      await tg("sendMessage", { chat_id: chatId, text: `ℹ️ Use este comando no grupo de manutenção\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    if (!await isModerator(chatId, fromId)) {
      await tg("sendMessage", { chat_id: chatId, text: `🔒 Apenas moderadores podem reenviar chamados específicos\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    const uuidMatch = text.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (!uuidMatch) {
      await tg("sendMessage", { chat_id: chatId, text: `❓ Uso: /reenviar \\[UUID do chamado\\]\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    await handleManualResend({ ticket_id: uuidMatch[1], actor_name: name });
    return { ok: true };
  }

  if (cmd === "/cancelar") {
    if (!isGroupChat) {
      await tg("sendMessage", { chat_id: chatId, text: `ℹ️ Use este comando no grupo de manutenção\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    if (!await isModerator(chatId, fromId)) {
      await tg("sendMessage", { chat_id: chatId, text: `🔒 Apenas moderadores podem cancelar chamados\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    const uuidMatch = text.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (!uuidMatch) {
      await tg("sendMessage", { chat_id: chatId, text: `❓ Uso: /cancelar \\[UUID do chamado\\]\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    const ticketId = uuidMatch[1];
    const { data: tk } = await db.from("maintenance_tickets").select("title,status").eq("id", ticketId).single();
    if (!tk) {
      await tg("sendMessage", { chat_id: chatId, text: `❌ Chamado não encontrado\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    if (tk.status === "cancelled") {
      await tg("sendMessage", { chat_id: chatId, text: `⚠️ Este chamado já está cancelado\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    await tg("sendMessage", {
      chat_id: chatId,
      text: `❌ Informe o motivo do cancelamento \\[cancel:${esc(ticketId)}\\|${esc(String(fromId))}\\]:\n_${esc(tk.title)}_`,
      parse_mode: "MarkdownV2",
      reply_to_message_id: msgId,
      reply_markup: { force_reply: true, selective: true },
    });
    return { ok: true };
  }

  if (cmd === "/reabrir") {
    if (!isGroupChat) {
      await tg("sendMessage", { chat_id: chatId, text: `ℹ️ Use este comando no grupo de manutenção\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    if (!await isModerator(chatId, fromId)) {
      await tg("sendMessage", { chat_id: chatId, text: `🔒 Apenas moderadores podem reabrir chamados\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    const uuidMatch = text.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (!uuidMatch) {
      await tg("sendMessage", { chat_id: chatId, text: `❓ Uso: /reabrir \\[UUID do chamado\\]\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    const ticketId = uuidMatch[1];
    const { data: tk } = await db.from("maintenance_tickets").select("title,status").eq("id", ticketId).single();
    if (!tk) {
      await tg("sendMessage", { chat_id: chatId, text: `❌ Chamado não encontrado\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    if (tk.status !== "resolved" && tk.status !== "cancelled") {
      await tg("sendMessage", {
        chat_id: chatId,
        text: `⚠️ Apenas chamados *resolvidos* ou *cancelados* podem ser reabertos \\(status atual: ${esc(ST_LABEL[tk.status] ?? tk.status)}\\)\\.`,
        parse_mode: "MarkdownV2",
      });
      return { ok: true };
    }
    await tg("sendMessage", {
      chat_id: chatId,
      text: `🔄 Informe o motivo da reabertura \\[reopen:${esc(ticketId)}\\|${esc(String(fromId))}\\]:\n_${esc(tk.title)}_`,
      parse_mode: "MarkdownV2",
      reply_to_message_id: msgId,
      reply_markup: { force_reply: true, selective: true },
    });
    return { ok: true };
  }

  if (cmd === "/direcionar") {
    if (!isGroupChat) {
      await tg("sendMessage", { chat_id: chatId, text: `ℹ️ Use este comando no grupo de manutenção\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    if (!await isModerator(chatId, fromId)) {
      await tg("sendMessage", { chat_id: chatId, text: `🔒 Apenas moderadores podem direcionar chamados\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    const uuidMatch = text.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (!uuidMatch) {
      await tg("sendMessage", { chat_id: chatId, text: `❓ Uso: /direcionar \\[UUID do chamado\\]\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    const ticketId = uuidMatch[1];
    const { data: tk } = await db.from("maintenance_tickets").select("title,status").eq("id", ticketId).single();
    if (!tk) {
      await tg("sendMessage", { chat_id: chatId, text: `❌ Chamado não encontrado\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    if (tk.status !== "open" && tk.status !== "in_progress") {
      await tg("sendMessage", {
        chat_id: chatId,
        text: `⚠️ Somente chamados abertos ou em andamento podem ser direcionados \\(status: ${esc(ST_LABEL[tk.status] ?? tk.status)}\\)\\.`,
        parse_mode: "MarkdownV2",
      });
      return { ok: true };
    }
    await tg("sendMessage", {
      chat_id: chatId,
      text: `📌 Nome do técnico para direcionar \\[direct:${esc(ticketId)}\\|${esc(String(fromId))}\\]:\n_${esc(tk.title)}_`,
      parse_mode: "MarkdownV2",
      reply_to_message_id: msgId,
      reply_markup: { force_reply: true, selective: true },
    });
    return { ok: true };
  }

  if (cmd === "/performance") {
    if (!isGroupChat) {
      await tg("sendMessage", { chat_id: chatId, text: `ℹ️ Use este comando no grupo de manutenção\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    if (!await isModerator(chatId, fromId)) {
      await tg("sendMessage", { chat_id: chatId, text: `🔒 Apenas moderadores podem ver o relatório de performance\\.`, parse_mode: "MarkdownV2" });
      return { ok: true };
    }
    const since7d    = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

    const [resolvedRes, openRes, resolvedTodayRes] = await Promise.all([
      db.from("maintenance_tickets").select("id,status_reason,rating,created_at,resolved_at").eq("status", "resolved").gte("resolved_at", since7d),
      db.from("maintenance_tickets").select("id").in("status", ["open", "in_progress"]),
      db.from("maintenance_tickets").select("id,created_at,resolved_at").eq("status", "resolved").gte("resolved_at", todayStart.toISOString()),
    ]);

    const resolved      = resolvedRes.data ?? [];
    const openCount     = (openRes.data ?? []).length;
    const resolvedToday = resolvedTodayRes.data ?? [];

    const techMap: Record<string, { count: number; ratingSum: number; ratingCount: number }> = {};
    for (const t of resolved) {
      const tech = (t.status_reason as string) ?? "Desconhecido";
      if (!techMap[tech]) techMap[tech] = { count: 0, ratingSum: 0, ratingCount: 0 };
      techMap[tech].count++;
      if (t.rating) { techMap[tech].ratingSum += Number(t.rating); techMap[tech].ratingCount++; }
    }
    const ranked = Object.entries(techMap).sort((a, b) => b[1].count - a[1].count).slice(0, 10);

    const resolvedTodayTimed = resolvedToday.filter((t: Record<string, unknown>) => t.resolved_at && t.created_at);
    const avgTmrMins = resolvedTodayTimed.length > 0
      ? Math.round(resolvedTodayTimed.reduce((sum: number, t: Record<string, unknown>) =>
          sum + (new Date(t.resolved_at as string).getTime() - new Date(t.created_at as string).getTime()) / 60000, 0
        ) / resolvedTodayTimed.length)
      : null;

    const medals = ["🥇", "🥈", "🥉"];
    const lines  = [`🏆 *Performance — últimos 7 dias*`, ""];
    lines.push(`✅ Total resolvidos: *${resolved.length}*`);
    lines.push(`📋 Em aberto agora: *${openCount}*`);
    if (avgTmrMins !== null) lines.push(`⏱ TMR hoje: *${esc(formatDuration(avgTmrMins))}*`);
    lines.push("");
    if (ranked.length === 0) {
      lines.push(`_Nenhuma resolução registrada neste período\\._`);
    } else {
      lines.push(`*Ranking de técnicos\\:*`, "");
      for (let i = 0; i < ranked.length; i++) {
        const [tech, stats] = ranked[i];
        const medal    = medals[i] ?? `${i + 1}\\.`;
        const avgRating = stats.ratingCount > 0
          ? ` — ⭐ ${esc((stats.ratingSum / stats.ratingCount).toFixed(1))}`
          : "";
        lines.push(`${medal} *${esc(tech)}* — ${stats.count} resolução${stats.count === 1 ? "" : "s"}${avgRating}`);
      }
    }
    await tg("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "MarkdownV2" });
    return { ok: true };
  }

  if (cmd === "/ajuda" || cmd === "/help" || cmd === "/start") {
    const help = [
      `🤖 *Royal PMS — Bot de Manutenção*`, "",
      `*Todos os membros\\:*`,
      `/status — Resumo dos chamados abertos`,
      `/listar — Lista chamados abertos \\(até 10\\)`,
      `/meus — Seus chamados em andamento`,
      `/urgente — Responda uma msg de chamado para marcar como urgente`,
      `/buscar \\[UUID ou UH\\] — Detalhes de um chamado`,
      `/peças — Chamados aguardando material`,
      `/sla — Chamados com SLA estourado \\(detalhado\\)`,
      "", `*Moderadores\\:*`,
      `/liberar \\[UUID\\] — Libera chamado travado`,
      `/reenviar \\[UUID\\] — Reenvia notificação de chamado`,
      `/cancelar \\[UUID\\] — Cancelar chamado com justificativa`,
      `/reabrir \\[UUID\\] — Reabrir chamado encerrado`,
      `/direcionar \\[UUID\\] — Direcionar a técnico específico`,
      `/performance — Ranking de desempenho da semana`,
      "", `*Fluxo de atendimento\\:*`,
      `1\\. Novo chamado → clique ✅ Assumir`,
      `2\\. Conclua → clique ✅ Concluir e descreva a solução`,
      `3\\. Moderador faz a vistoria → ✅ Aprovar ou ❌ Reprovar`,
      `4\\. Aprovado → grupo avalia com ⭐ estrelas`,
    ];
    await tg("sendMessage", { chat_id: chatId, text: help.join("\n"), parse_mode: "MarkdownV2" });
    return { ok: true };
  }

  return { ok: true };
}

// ── main ────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  try {
    const authHeader = req.headers.get("authorization");
    const body = await req.json();

    // Webhook deduplication — skip if already processed
    const updateId = body.update_id as number;
    if (updateId && isDuplicate(updateId)) {
      return new Response(JSON.stringify({ ok: true, skipped: "duplicate" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1A: Validate Telegram webhook secret header
    const tgSecret     = req.headers.get("x-telegram-bot-api-secret-token");
    const isFromTg     = !!(body.callback_query || body.message || body.edited_message);
    const isInternal   = !!body.type && !!authHeader?.startsWith("Bearer ");
    if (isFromTg) {
      // Validate secret token if configured
      if (WEBHOOK_SECRET && tgSecret !== WEBHOOK_SECRET) {
        return new Response("Unauthorized", { status: 401, headers: corsHeaders });
      }
    } else if (!isInternal) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    let result: Record<string, unknown>;

    if (body.callback_query) {
      result = await handleCallback(body.callback_query);
    } else if (body.message?.reply_to_message) {
      result = await handleReply(body.message);
    } else if (body.message?.text) {
      result = await handleMessage(body.message);
    } else if (body.type) {
      result = await handleDbWebhook(body, authHeader);
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
