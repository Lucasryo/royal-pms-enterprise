import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── env ────────────────────────────────────────────────────────────────────
const BOT_TOKEN      = Deno.env.get("TELEGRAM_BOT_TOKEN")        ?? "";
const CHAT_ID        = Deno.env.get("TELEGRAM_CHAT_ID")           ?? "";
const SUPA_URL       = Deno.env.get("SUPABASE_URL")               ?? "";
const SUPA_KEY       = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")  ?? "";
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET")    ?? "";
const BOT_MAINTENANCE_SECRET = Deno.env.get("BOT_MAINTENANCE_SECRET") ?? "";

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

async function deleteChatMessage(chatId: unknown, messageId: unknown): Promise<boolean> {
  const numericMessageId = Number(messageId);
  if (!numericMessageId) return false;
  const data = await tg("deleteMessage", { chat_id: chatId, message_id: numericMessageId });
  return data?.ok === true;
}

async function cleanupPromptAndReply(message: Record<string, unknown>): Promise<void> {
  const chatId = (message.chat as Record<string, unknown>)?.id ?? CHAT_ID;
  const replyTo = (message.reply_to_message as Record<string, unknown>) ?? {};
  await deleteChatMessage(chatId, message.message_id);
  await deleteChatMessage(chatId, replyTo.message_id);
}

async function isAuthorizedInternal(authHeader: string | null): Promise<boolean> {
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  if (WEBHOOK_SECRET && token === WEBHOOK_SECRET) return true;
  if (BOT_MAINTENANCE_SECRET && token === BOT_MAINTENANCE_SECRET) return true;

  const { data, error } = await db.auth.getUser(token);
  return !error && !!data.user;
}

async function getInternalUser(authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  if (WEBHOOK_SECRET && token === WEBHOOK_SECRET) return { id: "system", role: "admin", name: "Sistema" };
  if (BOT_MAINTENANCE_SECRET && token === BOT_MAINTENANCE_SECRET) return { id: "system", role: "admin", name: "Sistema" };

  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;

  const { data: profile } = await db
    .from("profiles")
    .select("id,name,role")
    .eq("id", data.user.id)
    .single();
  return profile ?? null;
}

async function logTelegramNotification(
  eventType: string,
  status: "sent" | "edited" | "deleted" | "failed" | "skipped",
  opts: { ticketId?: string | null; payload?: Record<string, unknown> } = {},
) {
  try {
    await db.from("maintenance_notification_logs").insert({
      ticket_id: opts.ticketId ?? null,
      recipient_name: "Telegram",
      channel: "telegram",
      event_type: eventType,
      status,
      payload: opts.payload ?? null,
    });
  } catch (e) {
    console.error("[logTelegramNotification] failed:", e);
  }
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

function cardStatusLabel(record: Record<string, unknown>): string {
  const status = (record.status as string) ?? "open";
  const inspection = record.inspection_status as string | null | undefined;
  if (status === "open") return "Aberto";
  if (status === "in_progress" && record.awaiting_parts) return "Aguardando pecas";
  if (status === "in_progress" && inspection === "rejected") return "Reprovado / retorno ao tecnico";
  if (status === "in_progress") return "Em atendimento";
  if (status === "resolved" && inspection === "pending" && record.inspector_tg_id) return "Vistoria em andamento";
  if (status === "resolved" && inspection === "pending") return "Aguardando vistoria";
  if (status === "resolved" && inspection === "approved" && !record.rating) return "Aprovado / aguardando avaliacao";
  if (status === "resolved" && inspection === "approved" && record.rating) return "Concluido e avaliado";
  if (status === "resolved") return "Resolvido";
  return ST_LABEL[status] ?? status;
}

function buildTicketCardText(record: Record<string, unknown>): string {
  const priority = (record.priority as string) ?? "medium";
  const lines: string[] = [`${P_EMOJI[priority] ?? ""} *Chamado de manutencao*`, ""];
  lines.push(`*${esc(record.title as string)}*`);
  if (record.room_number) lines.push(`UH *${esc(record.room_number as string)}*`);
  lines.push(`Status: *${esc(cardStatusLabel(record))}*`);
  lines.push(`Prioridade: *${esc(P_LABEL[priority] ?? priority)}*`);
  if (record.status_reason) lines.push(`Tecnico: *${esc(record.status_reason as string)}*`);
  if (record.description) lines.push("", `_${esc(record.description as string)}_`);
  if (record.resolution_notes) lines.push("", `Nota: ${esc(String(record.resolution_notes).slice(0, 500))}`);
  if (record.inspection_notes) lines.push("", `Vistoria: ${esc(String(record.inspection_notes).slice(0, 300))}`);
  if (record.rating) lines.push("", `Avaliacao: *${esc(String(record.rating))}/5*`);
  lines.push("", `ID: \`${record.id as string}\``);
  return lines.join("\n");
}

// ── keyboards ───────────────────────────────────────────────────────────────
function openKb(id: string) {
  return { inline_keyboard: [
    [{ text: "✅ Assumir", callback_data: `assume:${id}` }],
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

function bindTechKb(id: string) {
  return { inline_keyboard: [
    [{ text: "✅ Assumir", callback_data: `assume:${id}` }],
    [{ text: "📋 Ver detalhes", callback_data: `details:${id}` }],
  ]};
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

function ticketCardKb(record: Record<string, unknown>) {
  const id = record.id as string;
  const status = record.status as string;
  const inspection = record.inspection_status as string | null | undefined;
  const techTgId = record.telegram_user_id ? Number(record.telegram_user_id) : undefined;
  const inspectorTgId = record.inspector_tg_id ? Number(record.inspector_tg_id) : undefined;

  if (status === "open") return openKb(id);
  if (status === "in_progress" && !techTgId) return bindTechKb(id);
  if (status === "in_progress" && record.awaiting_parts) return partsReceivedKb(id, techTgId);
  if (status === "in_progress") return inProgressKb(id, techTgId);
  if (status === "resolved" && inspection === "pending" && inspectorTgId) return inspectorActionsKb(id, inspectorTgId);
  if (status === "resolved" && inspection === "pending") return inspectionKb(id);
  if (status === "resolved" && inspection === "approved" && !record.rating) return ratingKb(id);
  return { inline_keyboard: [] };
}

async function saveTicketCardRef(ticketId: string, chatId: unknown, messageId: unknown) {
  const numericMessageId = Number(messageId);
  if (!ticketId || !numericMessageId) return;
  await db.from("maintenance_tickets").update({
    telegram_chat_id: Number(chatId),
    telegram_message_id: numericMessageId,
    telegram_card_updated_at: new Date().toISOString(),
  }).eq("id", ticketId);
}

async function fetchTicket(ticketId: string) {
  const { data } = await db.from("maintenance_tickets").select("*").eq("id", ticketId).single();
  return data as Record<string, unknown> | null;
}

function telegramErrorDescription(result: unknown): string {
  const error = result as { description?: unknown; error_code?: unknown };
  return String(error?.description ?? error?.error_code ?? "").toLowerCase();
}

function isMessageNotModified(result: unknown): boolean {
  return telegramErrorDescription(result).includes("message is not modified");
}

function shouldReplaceMissingCard(result: unknown): boolean {
  const description = telegramErrorDescription(result);
  return description.includes("message to edit not found")
    || description.includes("message can't be edited")
    || description.includes("message identifier is not specified")
    || description.includes("message_id_invalid")
    || description.includes("message not found");
}

async function sendTicketCard(record: Record<string, unknown>, chatId: unknown = CHAT_ID): Promise<boolean> {
  const existingMessageId = Number(record.telegram_message_id);
  if (record.id && existingMessageId) return await updateTicketCard(record.id as string, chatId);

  const result = await tg("sendMessage", {
    chat_id: chatId,
    text: buildTicketCardText(record),
    parse_mode: "MarkdownV2",
    disable_web_page_preview: true,
    reply_markup: ticketCardKb(record),
  });
  if (result?.ok) await saveTicketCardRef(record.id as string, chatId, result.result?.message_id);
  await logTelegramNotification("ticket_card_send", result?.ok ? "sent" : "failed", {
    ticketId: record.id as string,
    payload: {
      chat_id: chatId,
      message_id: result?.result?.message_id ?? null,
      telegram_error: result?.ok ? null : result,
    },
  });
  return result?.ok === true;
}

async function updateTicketCard(ticketId: string, fallbackChatId: unknown = CHAT_ID): Promise<boolean> {
  const record = await fetchTicket(ticketId);
  if (!record) return false;
  const chatId = record.telegram_chat_id ?? fallbackChatId;
  const messageId = Number(record.telegram_message_id);
  if (messageId) {
    const edited = await tg("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: buildTicketCardText(record),
      parse_mode: "MarkdownV2",
      disable_web_page_preview: true,
      reply_markup: ticketCardKb(record),
    });
    if (edited?.ok) {
      await db.from("maintenance_tickets").update({
        telegram_card_updated_at: new Date().toISOString(),
      }).eq("id", ticketId);
      await logTelegramNotification("ticket_card_edit", "edited", {
        ticketId,
        payload: { chat_id: chatId, message_id: messageId },
      });
      return true;
    }
    if (isMessageNotModified(edited)) {
      await db.from("maintenance_tickets").update({
        telegram_card_updated_at: new Date().toISOString(),
      }).eq("id", ticketId);
      await logTelegramNotification("ticket_card_edit", "edited", {
        ticketId,
        payload: { chat_id: chatId, message_id: messageId, note: "not_modified" },
      });
      return true;
    }
    await logTelegramNotification("ticket_card_edit", "failed", {
      ticketId,
      payload: { chat_id: chatId, message_id: messageId, telegram_error: edited },
    });
    if (!shouldReplaceMissingCard(edited)) return false;
    await db.from("maintenance_tickets").update({
      telegram_chat_id: null,
      telegram_message_id: null,
      telegram_card_updated_at: null,
    }).eq("id", ticketId);
    const freshRecord = await fetchTicket(ticketId);
    return freshRecord ? await sendTicketCard(freshRecord, fallbackChatId) : false;
  }
  return await sendTicketCard(record, fallbackChatId);
}

async function recreateTicketCard(ticketId: string, fallbackChatId: unknown = CHAT_ID): Promise<boolean> {
  const record = await fetchTicket(ticketId);
  if (!record) return false;
  const chatId = record.telegram_chat_id ?? fallbackChatId;
  const messageId = Number(record.telegram_message_id);
  if (messageId) {
    const deleted = await deleteChatMessage(chatId, messageId);
    await logTelegramNotification("ticket_card_delete", deleted ? "deleted" : "failed", {
      ticketId,
      payload: { chat_id: chatId, message_id: messageId },
    });
  }
  await db.from("maintenance_tickets").update({
    telegram_chat_id: null,
    telegram_message_id: null,
    telegram_card_updated_at: null,
  }).eq("id", ticketId);
  const freshRecord = await fetchTicket(ticketId);
  return freshRecord ? await sendTicketCard(freshRecord, fallbackChatId) : false;
}

async function findTicketsNeedingCards(limit = 50): Promise<string[]> {
  const [openCardRes, pendingCardRes] = await Promise.all([
    db.from("maintenance_tickets")
      .select("id")
      .in("status", ["open", "in_progress"])
      .is("telegram_message_id", null)
      .order("created_at", { ascending: true })
      .limit(limit),
    db.from("maintenance_tickets")
      .select("id")
      .eq("status", "resolved")
      .eq("inspection_status", "pending")
      .is("telegram_message_id", null)
      .order("created_at", { ascending: true })
      .limit(limit),
  ]);
  return Array.from(new Set([
    ...(openCardRes.data ?? []).map(ticket => ticket.id as string),
    ...(pendingCardRes.data ?? []).map(ticket => ticket.id as string),
  ])).slice(0, limit);
}

async function findRecentlyFailedCardTickets(limit = 50): Promise<string[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: failedLogs } = await db.from("maintenance_notification_logs")
    .select("ticket_id")
    .eq("channel", "telegram")
    .eq("status", "failed")
    .in("event_type", ["ticket_card_send", "ticket_card_edit"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(200);
  const failedIds = Array.from(new Set((failedLogs ?? [])
    .map(log => log.ticket_id as string | null)
    .filter((id): id is string => Boolean(id))));
  if (failedIds.length === 0) return [];

  const { data: activeTickets } = await db.from("maintenance_tickets")
    .select("id")
    .in("id", failedIds)
    .or("status.in.(open,in_progress),and(status.eq.resolved,inspection_status.eq.pending)")
    .limit(limit);
  const activeIds = new Set((activeTickets ?? []).map(ticket => ticket.id as string));
  return failedIds.filter(id => activeIds.has(id)).slice(0, limit);
}

async function runBotMaintenance(limit = 50) {
  const missingIds = await findTicketsNeedingCards(limit);
  const retryIds = await findRecentlyFailedCardTickets(limit);
  const ids = Array.from(new Set([...missingIds, ...retryIds])).slice(0, limit);
  let repaired = 0;
  const failed: string[] = [];

  for (const id of ids) {
    const ok = await updateTicketCard(id, CHAT_ID);
    if (ok) repaired++;
    else failed.push(id);
  }

  const retryFailed = retryIds.filter(id => failed.includes(id)).length;
  const summary = {
    checked: ids.length,
    repaired,
    retry_failed: retryFailed,
    persistent_failures: failed.length,
    missing_cards_checked: missingIds.length,
    recent_failures_checked: retryIds.length,
    failed_ticket_ids: failed.slice(0, 25),
  };
  await logTelegramNotification("bot_maintenance", failed.length ? "failed" : ids.length ? "sent" : "skipped", {
    payload: summary,
  });
  return { ok: true, ...summary };
}

function extractTelegramLogReason(payload: unknown): string | null {
  const value = payload as Record<string, unknown> | null;
  if (!value) return null;
  const error = value.telegram_error as Record<string, unknown> | undefined;
  const description = error?.description ?? value.error ?? value.reason;
  if (description) return String(description).slice(0, 180);
  if (Array.isArray(value.failed_ticket_ids) && value.failed_ticket_ids.length > 0) {
    return `${value.failed_ticket_ids.length} chamados ainda com falha`;
  }
  return null;
}

async function rememberCallbackCard(ticketId: string, chatId: unknown, messageId: unknown) {
  const numericMessageId = Number(messageId);
  if (!ticketId || !numericMessageId) return;
  const { data } = await db.from("maintenance_tickets")
    .select("telegram_message_id")
    .eq("id", ticketId)
    .single();
  if (!data?.telegram_message_id) await saveTicketCardRef(ticketId, chatId, numericMessageId);
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
function ownerBlockMessage(ticket: Record<string, unknown> | null | undefined): string {
  const owner = ticket?.status_reason ? String(ticket.status_reason) : "quem assumiu";
  return `Apenas ${owner} pode alterar este chamado.`;
}

function isTicketOwnedBy(ticket: Record<string, unknown> | null | undefined, fromId: number): boolean {
  return ticket?.status === "in_progress" &&
    !!ticket.telegram_user_id &&
    Number(ticket.telegram_user_id) === fromId;
}

async function ensureCallbackOwner(
  ticket: Record<string, unknown>,
  fromId: number,
  callbackAlert: (text: string) => Promise<void>,
): Promise<boolean> {
  if (isTicketOwnedBy(ticket, fromId)) return true;
  await logTelegramNotification("owner_lock_blocked", "skipped", {
    ticketId: ticket.id as string | undefined,
    payload: {
      action: "telegram_card_action",
      from_id: fromId,
      owner_tg_id: ticket.telegram_user_id ?? null,
      owner_name: ticket.status_reason ?? null,
      status: ticket.status ?? null,
    },
  });
  if (ticket.status !== "in_progress") {
    await callbackAlert(`Este chamado nao esta em andamento (status: ${ticket.status ?? "desconhecido"}).`);
  } else {
    await callbackAlert(ownerBlockMessage(ticket));
  }
  return false;
}

async function ensureReplyOwner(ticketId: string, fromId: number, chatId: unknown, message: Record<string, unknown>) {
  const { data: ticket } = await db
    .from("maintenance_tickets")
    .select("status,telegram_user_id,status_reason")
    .eq("id", ticketId)
    .single();
  if (isTicketOwnedBy(ticket as Record<string, unknown> | null, fromId)) return { ok: true, ticket };
  await deleteChatMessage(chatId, message.message_id);
  return { ok: false, ticket };
}

async function rejectInspectionAndReturnToTech(
  ticketId: string,
  actorTgId: number,
  actorName: string,
  chatId: unknown,
  note?: string,
): Promise<{ ok: boolean; error?: string }> {
  const cleanNote = note?.trim() || "Reprovado pela vistoria. O tecnico deve corrigir e concluir novamente.";
  const { data: ticket } = await db
    .from("maintenance_tickets")
    .select("title,room_number,status,status_reason,telegram_user_id,inspection_status,inspector_tg_id")
    .eq("id", ticketId)
    .single();

  if (!ticket) return { ok: false, error: "ticket_not_found" };
  if (ticket.status !== "resolved" || ticket.inspection_status !== "pending") {
    await updateTicketCard(ticketId, chatId);
    return { ok: false, error: `not_pending_inspection:${ticket.status ?? "unknown"}` };
  }
  if (!ticket.inspector_tg_id) {
    return { ok: false, error: "inspection_not_assumed" };
  }
  if (Number(ticket.inspector_tg_id) !== actorTgId) {
    return { ok: false, error: "locked_to_other_inspector" };
  }

  const now = new Date().toISOString();
  const { count } = await db.from("maintenance_tickets").update({
    status: "in_progress",
    inspection_status: "rejected",
    inspection_notes: cleanNote,
    inspected_at: now,
    resolved_at: null,
    awaiting_parts: false,
    inspector_tg_id: null,
    inspection_requested_at: null,
    updated_at: now,
  })
    .eq("id", ticketId)
    .eq("status", "resolved")
    .eq("inspection_status", "pending")
    .eq("inspector_tg_id", actorTgId)
    .select("id", { count: "exact", head: true });

  if (!count || count === 0) {
    await updateTicketCard(ticketId, chatId);
    return { ok: false, error: "stale_ticket" };
  }

  await logEvent({
    ticketId,
    actorType: "telegram_user",
    actorId: String(actorTgId),
    actorName,
    event: "inspection_rejected",
    prevStatus: "resolved",
    newStatus: "in_progress",
    notes: cleanNote.slice(0, 500),
  });

  await updateTicketCard(ticketId, chatId);

  const uhPart = ticket.room_number ? ` \\(UH ${esc(ticket.room_number)}\\)` : "";
  const techMention = ticket.telegram_user_id
    ? `[${ticket.status_reason ?? "Tecnico"}](tg://user?id=${ticket.telegram_user_id})`
    : `*${esc(ticket.status_reason ?? "Tecnico")}*`;

  await tg("sendMessage", {
    chat_id: chatId,
    text: [
      `*Vistoria reprovada* por *${esc(actorName)}*`,
      `Chamado: *${esc(ticket.title)}*${uhPart}`,
      "",
      `Motivo: _${esc(cleanNote)}_`,
      "",
      `${techMention}\\, o chamado voltou para em andamento\\. Por favor corrija e conclua novamente\\.`,
    ].join("\n"),
    parse_mode: "MarkdownV2",
    reply_markup: inProgressKb(ticketId, ticket.telegram_user_id ?? undefined),
  });

  return { ok: true };
}

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
  resolutionNotes?: string,
): Promise<boolean> {
  void techName;
  void ticketTitle;
  void roomNumber;
  void durationPart;
  void resolutionNotes;
  return await updateTicketCard(ticketId, chatId);
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

  void heading;
  void kb;
  void extraLine;
  await updateTicketCard(id, CHAT_ID);
  return { ok: true };
}

function extractLastTech(resolutionNotes: string): string | null {
  const m = resolutionNotes.match(/\(([^)]+)\)\s*$/);
  return m ? m[1] : null;
}

// ── db webhook dispatcher ───────────────────────────────────────────────────
async function handleDbWebhook(body: Record<string, unknown>, authHeader: string | null) {
  // Fix L: validate Authorization for internal trigger types
  const internalTypes = ["daily_report", "manual_resend", "request_rating", "sla_alert", "request_inspection", "bot_health", "cleanup_test_tickets", "cleanup_all_tickets", "reconcile_cards", "recreate_card", "bot_maintenance"];
  if (internalTypes.includes(body.type as string)) {
    if (!await isAuthorizedInternal(authHeader)) return { ok: false, error: "unauthorized" };
  }

  if ((body.type as string) === "daily_report")   return await sendDailyReport();
  if ((body.type as string) === "manual_resend")  return await handleManualResend(body);
  if ((body.type as string) === "sla_alert")      return await sendSlaAlert();

  if ((body.type as string) === "bot_health") {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [
      logsRes,
      openRes,
      progressRes,
      unownedProgressRes,
      pendingInspectionRes,
      openCardRes,
      pendingCardRes,
    ] = await Promise.all([
      db.from("maintenance_notification_logs")
        .select("id,ticket_id,event_type,status,payload,created_at")
        .eq("channel", "telegram")
        .order("created_at", { ascending: false })
        .limit(20),
      db.from("maintenance_tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
      db.from("maintenance_tickets").select("id", { count: "exact", head: true }).eq("status", "in_progress"),
      db.from("maintenance_tickets").select("id", { count: "exact", head: true }).eq("status", "in_progress").is("telegram_user_id", null),
      db.from("maintenance_tickets").select("id", { count: "exact", head: true }).eq("status", "resolved").eq("inspection_status", "pending"),
      db.from("maintenance_tickets")
        .select("id")
        .in("status", ["open", "in_progress"])
        .is("telegram_message_id", null)
        .limit(200),
      db.from("maintenance_tickets")
        .select("id")
        .eq("status", "resolved")
        .eq("inspection_status", "pending")
        .is("telegram_message_id", null)
        .limit(200),
    ]);
    const logs = logsRes.data ?? [];
    const missingCardIds = [
      ...(openCardRes.data ?? []).map(ticket => ticket.id as string),
      ...(pendingCardRes.data ?? []).map(ticket => ticket.id as string),
    ];
    const maintenanceLogs = logs.filter(log => log.event_type === "bot_maintenance");
    const lastMaintenance = maintenanceLogs[0] ?? null;
    const persistentFailures = logs
      .filter(log => log.status === "failed" && String(log.created_at) >= since)
      .slice(0, 8)
      .map(log => ({
        id: log.id,
        ticket_id: log.ticket_id,
        event_type: log.event_type,
        status: log.status,
        created_at: log.created_at,
        reason: extractTelegramLogReason(log.payload),
      }));
    return {
      ok: true,
      bot_configured: Boolean(BOT_TOKEN && CHAT_ID),
      webhook_secret_configured: Boolean(WEBHOOK_SECRET),
      last_event_at: logs[0]?.created_at ?? null,
      failures_24h: logs.filter(log => log.status === "failed" && String(log.created_at) >= since).length,
      last_bot_maintenance_at: lastMaintenance?.created_at ?? null,
      last_bot_maintenance: lastMaintenance?.payload ?? null,
      persistent_failures: persistentFailures,
      open_count: openRes.count ?? 0,
      in_progress_count: progressRes.count ?? 0,
      unowned_in_progress_count: unownedProgressRes.count ?? 0,
      pending_inspection_count: pendingInspectionRes.count ?? 0,
      missing_card_count: missingCardIds.length,
      missing_card_ticket_ids: missingCardIds.slice(0, 25),
      recent_logs: logs,
    };
  }

  if ((body.type as string) === "recreate_card") {
    const user = await getInternalUser(authHeader);
    if (!user || !["admin", "manager"].includes(String(user.role))) return { ok: false, error: "forbidden" };
    const ticketId = body.ticket_id as string;
    if (!ticketId) return { ok: false, error: "missing ticket_id" };
    const ok = await recreateTicketCard(ticketId, CHAT_ID);
    return { ok, ticket_id: ticketId };
  }

  if ((body.type as string) === "bot_maintenance") {
    const user = await getInternalUser(authHeader);
    if (!user || !["admin", "manager"].includes(String(user.role))) return { ok: false, error: "forbidden" };
    return await runBotMaintenance(50);
  }

  if ((body.type as string) === "reconcile_cards") {
    const user = await getInternalUser(authHeader);
    if (!user || !["admin", "manager"].includes(String(user.role))) return { ok: false, error: "forbidden" };
    const ids = await findTicketsNeedingCards(50);
    let repaired = 0;
    const failed: string[] = [];
    for (const id of ids) {
      const ok = await updateTicketCard(id, CHAT_ID);
      if (ok) repaired++;
      else failed.push(id);
    }
    return { ok: true, checked: ids.length, repaired, failed_count: failed.length, failed_ticket_ids: failed.slice(0, 25) };
  }

  if ((body.type as string) === "cleanup_test_tickets") {
    const user = await getInternalUser(authHeader);
    if (!user || !["admin", "manager"].includes(String(user.role))) return { ok: false, error: "forbidden" };

    const hours = Math.min(Math.max(Number(body.hours ?? 24), 1), 72);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const { data: tickets } = await db
      .from("maintenance_tickets")
      .select("id,title,status_reason,resolution_notes,telegram_chat_id,telegram_message_id")
      .gte("created_at", since)
      .or("title.ilike.%teste%,status_reason.eq.Reset solicitado no PMS,resolution_notes.ilike.%Reset em%");

    let deletedCards = 0;
    const ids = (tickets ?? []).map(ticket => ticket.id as string);
    for (const ticket of tickets ?? []) {
      if (!ticket.telegram_message_id) continue;
      const ok = await deleteChatMessage(ticket.telegram_chat_id ?? CHAT_ID, ticket.telegram_message_id);
      if (ok) deletedCards++;
      await logTelegramNotification("ticket_card_delete", ok ? "deleted" : "failed", {
        ticketId: ticket.id as string,
        payload: {
          chat_id: ticket.telegram_chat_id ?? CHAT_ID,
          message_id: ticket.telegram_message_id,
        },
      });
    }

    if (ids.length > 0) {
      await db.from("maintenance_notification_logs").delete().in("ticket_id", ids);
      await db.from("maintenance_ticket_events").delete().in("ticket_id", ids);
      await db.from("maintenance_tickets").delete().in("id", ids);
    }

    return { ok: true, tickets_deleted: ids.length, telegram_cards_deleted: deletedCards, hours };
  }

  if ((body.type as string) === "cleanup_all_tickets") {
    const user = await getInternalUser(authHeader);
    if (!user || !["admin", "manager"].includes(String(user.role))) return { ok: false, error: "forbidden" };
    if (body.confirm !== "LIMPAR TODOS") return { ok: false, error: "confirmation_required" };

    const { data: tickets } = await db
      .from("maintenance_tickets")
      .select("id,telegram_chat_id,telegram_message_id");

    let deletedCards = 0;
    let failedCards = 0;
    const ids = (tickets ?? []).map(ticket => ticket.id as string);
    for (const ticket of tickets ?? []) {
      if (!ticket.telegram_message_id) continue;
      const ok = await deleteChatMessage(ticket.telegram_chat_id ?? CHAT_ID, ticket.telegram_message_id);
      if (ok) deletedCards++;
      else failedCards++;
    }

    if (ids.length > 0) {
      await db.from("maintenance_notification_logs").delete().in("ticket_id", ids);
      await db.from("maintenance_ticket_events").delete().in("ticket_id", ids);
      await db.from("maintenance_tickets").delete().in("id", ids);
    }

    await logTelegramNotification("cleanup_all_tickets", failedCards ? "failed" : ids.length ? "deleted" : "skipped", {
      payload: {
        tickets_deleted: ids.length,
        telegram_cards_deleted: deletedCards,
        telegram_cards_failed: failedCards,
        actor_id: user.id,
        actor_name: user.name,
      },
    });

    return {
      ok: true,
      tickets_deleted: ids.length,
      telegram_cards_deleted: deletedCards,
      telegram_cards_failed: failedCards,
    };
  }

  if ((body.type as string) === "public_report") {
    const ticketId = body.ticket_id as string;
    if (!ticketId) return { ok: false, error: "missing ticket_id" };
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: ticket } = await db
      .from("maintenance_tickets")
      .select("*")
      .eq("id", ticketId)
      .eq("status", "open")
      .gte("created_at", fiveMinutesAgo)
      .single();
    if (!ticket) return { ok: false, error: "ticket not found or too old" };
    await sendTicketCard(ticket, CHAT_ID);
    return { ok: true };
  }

  if ((body.type as string) === "request_inspection") {
    const ticketId  = body.ticket_id as string;
    const actorName = (body.actor_name as string) ?? "Operador";
    if (!ticketId) return { ok: false, error: "missing ticket_id" };
    const { data: tk } = await db
      .from("maintenance_tickets")
      .select("title,room_number,status_reason,inspection_status,created_at,resolved_at,resolution_notes")
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
      tk.resolution_notes as string | undefined,
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
    void tk;
    await updateTicketCard(ticketId, CHAT_ID);
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
    await updateTicketCard(id, CHAT_ID);
    // Fix D: only trigger inspection if not already dispatched via Telegram
    if (!record.inspection_status) {
      await sendInspectionRequest(
        CHAT_ID, id,
        (record.status_reason as string) ?? "Técnico",
        (record.title as string) ?? "",
        record.room_number as string | null,
        mins !== null ? ` em *${esc(formatDuration(mins))}*` : "",
        record.resolution_notes as string | undefined,
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

  void heading;
  void kb;
  if (event === "INSERT") await sendTicketCard(record, CHAT_ID);
  else await updateTicketCard(id, CHAT_ID);
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

  let callbackAnswered = false;
  const callbackOk = async (text?: string) => {
    if (callbackAnswered) return;
    callbackAnswered = true;
    await tg("answerCallbackQuery", { callback_query_id: cbId, ...(text ? { text } : {}) });
  };
  const callbackAlert = async (text: string) => {
    if (callbackAnswered) return;
    callbackAnswered = true;
    await tg("answerCallbackQuery", { callback_query_id: cbId, text, show_alert: true });
  };

  // ── Rating ──────────────────────────────────────────────────────────────
  if (action === "rate") {
    const parts    = rest.split(":");
    const ticketId = parts[0];
    const rating   = Number(parts[1]);
    if (!ticketId || !rating || rating < 1 || rating > 5) {
      return { ok: true };
    }
    await rememberCallbackCard(ticketId, chatId, msgId);

    if (!await isModerator(chatId, fromId)) {
      await callbackAlert("Apenas o vistoriador que assumiu pode avaliar este chamado.");
      return { ok: true };
    }

    const { data: ticket } = await db
      .from("maintenance_tickets")
      .select("status,inspection_status,inspector_tg_id,rating")
      .eq("id", ticketId)
      .single();
    if (!ticket) return { ok: true };

    if (ticket.status !== "resolved" || ticket.inspection_status !== "approved") {
      await callbackAlert("Este chamado ainda nao esta aprovado para avaliacao.");
      await updateTicketCard(ticketId, chatId);
      return { ok: true };
    }
    if (!ticket.inspector_tg_id) {
      await callbackAlert("A avaliacao exige uma vistoria assumida por moderador.");
      await updateTicketCard(ticketId, chatId);
      return { ok: true };
    }
    if (Number(ticket.inspector_tg_id) !== fromId) {
      await callbackAlert("Apenas o vistoriador que assumiu pode avaliar este chamado.");
      return { ok: true };
    }
    if (ticket.rating) {
      await updateTicketCard(ticketId, chatId);
      await callbackOk("Chamado ja avaliado.");
      return { ok: true };
    }

    // 2E: atomic update — only write if rating is still null (prevents race condition)
    const { count: ratingCount } = await db.from("maintenance_tickets")
      .update({ rating, rated_by_tg_id: fromId, updated_at: new Date().toISOString() })
      .eq("id", ticketId)
      .eq("status", "resolved")
      .eq("inspection_status", "approved")
      .eq("inspector_tg_id", fromId)
      .is("rating", null)
      .select("id", { count: "exact", head: true });

    if (!ratingCount || ratingCount === 0) {
      const { data: tk } = await db
        .from("maintenance_tickets").select("rating").eq("id", ticketId).single();
      void tk;
      await updateTicketCard(ticketId, chatId);
      return { ok: true };
    }
    void name;
    await updateTicketCard(ticketId, chatId);
    await callbackOk("Avaliacao registrada.");
    return { ok: true };
  }

  // ── Inspection: assume vistoria (somente moderadores) ───────────────────
  if (action === "insp_assume") {
    const ticketId = rest;
    if (!await isModerator(chatId, fromId)) {
      await callbackAlert("Apenas moderadores do grupo podem assumir a vistoria.");
      return { ok: true };
    }

    const { data: ticket } = await db
      .from("maintenance_tickets").select("title,room_number,inspection_status,inspector_tg_id,status").eq("id", ticketId).single();
    if (!ticket) return { ok: true };

    // Only allow assuming inspection on resolved tickets
    if (ticket.status !== "resolved") {
      await callbackAlert(`Este chamado nao esta aguardando vistoria (status: ${ticket.status ?? "desconhecido"}).`);
      return { ok: true };
    }

    // Block if another moderator already assumed (inspection_status is "pending" and inspector_tg_id is set)
    if (ticket.inspector_tg_id && Number(ticket.inspector_tg_id) !== fromId) {
      await callbackAlert("A vistoria deste chamado ja foi assumida por outro moderador.");
      return { ok: true };
    }

    if (Number(ticket.inspector_tg_id) === fromId) {
      await updateTicketCard(ticketId, chatId);
      return { ok: true };
    }

    // Fix B: save inspector_tg_id atomically while inspection is waiting.
    const { count } = await db.from("maintenance_tickets").update({
      inspection_status: "pending",
      inspector_tg_id: fromId,
      updated_at: new Date().toISOString(),
    }).eq("id", ticketId)
      .eq("status", "resolved")
      .is("inspector_tg_id", null)
      .or("inspection_status.is.null,inspection_status.eq.pending")
      .select("id", { count: "exact", head: true });

    if (!count || count === 0) {
      const { data: current } = await db
        .from("maintenance_tickets")
        .select("status,inspection_status,inspector_tg_id")
        .eq("id", ticketId)
        .single();

      if (current?.status === "resolved" && Number(current.inspector_tg_id) === fromId) {
        await updateTicketCard(ticketId, chatId);
        return { ok: true };
      }

      if (current?.status !== "resolved") {
        await callbackAlert(`Este chamado nao esta aguardando vistoria (status: ${current?.status ?? "desconhecido"}).`);
        return { ok: true };
      }

      if (!current?.inspector_tg_id && (current?.inspection_status === null || current?.inspection_status === "pending")) {
        await updateTicketCard(ticketId, chatId);
        await callbackAlert("Nao consegui assumir a vistoria agora. Toque em Assumir Vistoria novamente.");
        return { ok: true };
      }

      await callbackAlert("A vistoria deste chamado ja foi assumida por outro moderador.");
      return { ok: true };
    }

    void msgId;
    void name;
    await updateTicketCard(ticketId, chatId);
    return { ok: true };
  }

  // ── Inspection: approve ─────────────────────────────────────────────────
  if (action === "insp_ok") {
    const parts          = rest.split(":");
    const ticketId       = parts[0];
    const lockedInspId   = parts[1] ? Number(parts[1]) : null;

    if (!await isModerator(chatId, fromId)) {
      await callbackAlert("Apenas moderadores do grupo podem aprovar vistoria.");
      return { ok: true };
    }

    // Fix B: validate lock against DB inspector_tg_id too
    if (lockedInspId && lockedInspId !== fromId) {
      await callbackAlert("Apenas o vistoriador que assumiu pode aprovar.");
      return { ok: true };
    }

    const { data: ticket } = await db
      .from("maintenance_tickets").select("title,room_number,status,status_reason,inspection_status,inspector_tg_id").eq("id", ticketId).single();
    if (!ticket) return { ok: true };

    if (ticket.status !== "resolved" || ticket.inspection_status !== "pending") {
      await callbackAlert("Este chamado nao esta mais aguardando vistoria.");
      await updateTicketCard(ticketId, chatId);
      return { ok: true };
    }
    if (!ticket.inspector_tg_id) {
      await callbackAlert("A vistoria precisa ser assumida por um moderador antes de aprovar.");
      await updateTicketCard(ticketId, chatId);
      return { ok: true };
    }

    // Secondary DB-level lock check
    if (Number(ticket.inspector_tg_id) !== fromId) {
      await callbackAlert("Apenas o vistoriador que assumiu pode aprovar este chamado.");
      return { ok: true };
    }

    const { count } = await db.from("maintenance_tickets").update({
      inspection_status: "approved",
      inspected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
      .eq("id", ticketId)
      .eq("status", "resolved")
      .eq("inspection_status", "pending")
      .eq("inspector_tg_id", fromId)
      .select("id", { count: "exact", head: true });

    if (!count || count === 0) {
      await callbackAlert("Este chamado nao esta mais aguardando esta vistoria.");
      await updateTicketCard(ticketId, chatId);
      return { ok: true };
    }

    // 3C: audit
    await logEvent({
      ticketId, actorType: "telegram_user",
      actorId: String(fromId), actorName: name,
      event: "inspection_approved", prevStatus: "pending", newStatus: "approved",
    });

    const uhPart = ticket.room_number ? ` \\(UH ${esc(ticket.room_number)}\\)` : "";
    void msgId;
    void uhPart;
    await updateTicketCard(ticketId, chatId);
    return { ok: true };
  }

  // ── Inspection: reject ──────────────────────────────────────────────────
  if (action === "insp_nok") {
    const parts        = rest.split(":");
    const ticketId     = parts[0];
    const lockedInspId = parts[1] ? Number(parts[1]) : null;

    if (!await isModerator(chatId, fromId)) {
      await callbackAlert("Apenas moderadores do grupo podem reprovar vistoria.");
      return { ok: true };
    }

    if (lockedInspId && lockedInspId !== fromId) {
      await callbackAlert("Apenas o vistoriador que assumiu pode reprovar.");
      return { ok: true };
    }

    const result = await rejectInspectionAndReturnToTech(ticketId, fromId, name, chatId);
    if (result.ok) {
      await callbackAlert("Vistoria reprovada. O chamado voltou para o tecnico corrigir.");
    } else if (result.error === "inspection_not_assumed") {
      await callbackAlert("A vistoria precisa ser assumida por um moderador antes de reprovar.");
    } else if (result.error === "locked_to_other_inspector") {
      await callbackAlert("Apenas o vistoriador que assumiu pode reprovar este chamado.");
    } else if (result.error?.startsWith("not_pending_inspection")) {
      await callbackAlert("Este chamado nao esta mais aguardando vistoria.");
    } else {
      await callbackAlert("Nao consegui reprovar a vistoria agora. Tente novamente.");
    }
    void msgId;
    return { ok: true };
  }

  // ── Ticket actions ──────────────────────────────────────────────────────
  const restParts      = rest.split(":");
  const ticketId       = restParts[0];
  const lockedTgUserId = restParts[1] ? Number(restParts[1]) : null;

  if (!ticketId) {
    return { ok: true };
  }
  await rememberCallbackCard(ticketId, chatId, msgId);

  void lockedTgUserId;

  // 3C: select específico — evita carregar campos desnecessários
  const { data: ticket } = await db
    .from("maintenance_tickets")
    .select("id,status,room_number,title,created_at,status_reason,telegram_user_id,awaiting_parts,resolution_notes,inspection_status,description,assigned_to,priority,resolved_at,inspection_notes,inspected_at,rating")
    .eq("id", ticketId).single();
  if (!ticket) return { ok: true };

  const ownerOnlyActions = ["parts_ok", "resolve", "parts", "note"];
  if (ownerOnlyActions.includes(action) && !await ensureCallbackOwner(ticket, fromId, callbackAlert)) {
    return { ok: true };
  }

  if (action === "assume") {
    // Fix A+10: atomic update with status guard to prevent double-assume
    const { count } = await db.from("maintenance_tickets").update({
      status: "in_progress",
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status_reason: name,
      telegram_user_id: fromId,
    })
      .eq("id", ticketId)
      .or("status.eq.open,and(status.eq.in_progress,telegram_user_id.is.null)")
      .select("id", { count: "exact", head: true });

    if (!count || count === 0) {
      // count=0 pode ser: (a) outro tecnico assumiu, OU (b) retry do Telegram do mesmo usuario
      // Buscar quem realmente assumiu para decidir
      const { data: current } = await db
        .from("maintenance_tickets")
        .select("telegram_user_id, status_reason, status")
        .eq("id", ticketId).single();
      if (Number(current?.telegram_user_id) === fromId) {
        // Caso (b): mesmo usuario, retry/duplicate — re-emite o teclado e finaliza silenciosamente
        if (msgId) {
          await tg("editMessageReplyMarkup", {
            chat_id: chatId, message_id: msgId, reply_markup: inProgressKb(ticketId, fromId),
          });
        }
        return { ok: true };
      }
      // Caso (a): realmente foi outro tecnico
      await callbackAlert(`Este chamado ja foi assumido por ${current?.status_reason ?? "outro tecnico"}.`);
      return { ok: true };
    }

    // Edita a mensagem original substituindo o teclado pelo de "em andamento"
    let editOk = true;
    if (msgId) {
      const editRes = await tg("editMessageReplyMarkup", {
        chat_id: chatId, message_id: msgId, reply_markup: inProgressKb(ticketId, fromId),
      });
      editOk = editRes.ok === true;
      if (!editOk) {
        console.error(`[assume] editMessageReplyMarkup failed ticket=${ticketId} chat=${chatId} msg=${msgId}:`, JSON.stringify(editRes));
      }
    }
    const uhPart = ticket.room_number ? ` \\(UH ${esc(ticket.room_number)}\\)` : "";
    // Confirmação curta (mantém design original com poucas mensagens).
    // Se o edit falhou, anexa o teclado aqui para o técnico não ficar sem ação.
    await tg("sendMessage", {
      chat_id: chatId,
      text: `🔧 *${esc(name)}* assumiu: *${esc(ticket.title)}*${uhPart}`,
      parse_mode: "MarkdownV2",
      ...(editOk ? {} : { reply_markup: inProgressKb(ticketId, fromId) }),
    });
    // 3C: audit
    await logEvent({
      ticketId, actorType: "telegram_user",
      actorId: String(fromId), actorName: name,
      event: "assumed", prevStatus: "open", newStatus: "in_progress",
    });
    await updateTicketCard(ticketId, chatId);

  } else if (action === "parts_ok") {
    // 4C: técnico recebeu as peças — limpa flag e devolve ao fluxo normal
    if (ticket.status === "resolved" || ticket.status === "cancelled") {
      await callbackAlert(`Chamado ja esta ${ticket.status}.`);
      return { ok: true };
    }
    await db.from("maintenance_tickets").update({
      awaiting_parts: false,
      updated_at: new Date().toISOString(),
    }).eq("id", ticketId).eq("status", "in_progress").eq("telegram_user_id", fromId);
    await updateTicketCard(ticketId, chatId);
    await callbackOk("Pecas recebidas. Chamado retomado.");
    return { ok: true };

  } else if (action === "resolve") {
    // Fix 8: only allow resolve if ticket is in_progress
    if (ticket.status !== "in_progress") {
      await callbackAlert(`Este chamado nao esta em andamento (status: ${ticket.status}).`);
      return { ok: true };
    }
    const lockSuffix = ticket.telegram_user_id ? `\\|${esc(String(ticket.telegram_user_id))}` : "";
    await tg("sendMessage", {
      chat_id: chatId,
      text: `✍️ Descreva a solução \\[resolve:${esc(ticketId)}${lockSuffix}\\]:\n_${esc(ticket.title)}_`,
      parse_mode: "MarkdownV2",
      reply_to_message_id: msgId,
      reply_markup: { force_reply: true, input_field_placeholder: "Digite a solução aqui..." },
    });

  } else if (action === "parts") {
    // Fix 9: only allow parts report if ticket is active
    if (ticket.status === "resolved" || ticket.status === "cancelled") {
      await callbackAlert(`Este chamado ja esta ${ticket.status === "resolved" ? "resolvido" : "cancelado"}.`);
      return { ok: true };
    }
    const lockSuffix = ticket.telegram_user_id ? `\\|${esc(String(ticket.telegram_user_id))}` : "";
    await tg("sendMessage", {
      chat_id: chatId,
      text: `🔩 Quais peças são necessárias? \\[parts:${esc(ticketId)}${lockSuffix}\\]\n_${esc(ticket.title)}_`,
      parse_mode: "MarkdownV2",
      reply_to_message_id: msgId,
      reply_markup: { force_reply: true, input_field_placeholder: "Descreva as peças necessárias..." },
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
      await callbackAlert("Este chamado ja esta encerrado e nao aceita novas notas.");
      return { ok: true };
    }
    await tg("sendMessage", {
      chat_id: chatId,
      text: `📝 Digite sua nota de andamento \\[note:${esc(ticketId)}\\|${esc(String(fromId))}\\]:\n_${esc(ticket.title)}_`,
      parse_mode: "MarkdownV2",
      reply_to_message_id: msgId,
      reply_markup: { force_reply: true, input_field_placeholder: "Digite sua nota de andamento..." },
    });

  } else if (action === "transfer") {
    if (ticket.status !== "in_progress") {
      await callbackAlert("Este chamado nao esta em andamento e nao pode ser transferido.");
      return { ok: true };
    }
    const isOwner = isTicketOwnedBy(ticket, fromId);
    const isMod = await isModerator(chatId, fromId);
    if (!isOwner && !isMod) {
      await logTelegramNotification("owner_lock_blocked", "skipped", {
        ticketId,
        payload: {
          action: "telegram_transfer",
          from_id: fromId,
          owner_tg_id: ticket.telegram_user_id ?? null,
          owner_name: ticket.status_reason ?? null,
          status: ticket.status ?? null,
        },
      });
      await callbackAlert(ownerBlockMessage(ticket));
      return { ok: true };
    }
    const { count: transferCount } = await db.from("maintenance_tickets")
      .update({ status: "open", telegram_user_id: null, assigned_to: null, status_reason: null, updated_at: new Date().toISOString() })
      .eq("id", ticketId).eq("status", "in_progress")
      .select("id", { count: "exact", head: true });
    if (!transferCount || transferCount === 0) {
      await callbackAlert("Chamado ja foi alterado por outra acao.");
      return { ok: true };
    }
    await logEvent({
      ticketId, actorType: "telegram_user",
      actorId: String(fromId), actorName: name,
      event: isOwner ? "transferred" : "transferred_by_moderator", prevStatus: "in_progress", newStatus: "open",
      notes: isOwner ? "tecnico liberou chamado de volta para a fila" : "moderador liberou chamado de volta para a fila",
    });
    const cardUpdated = await updateTicketCard(ticketId, chatId);
    await callbackOk("Chamado voltou para a fila.");
    if (!cardUpdated) {
      const uhPart = ticket.room_number ? ` - UH ${esc(ticket.room_number as string)}` : "";
      await tg("sendMessage", {
        chat_id: chatId,
        text: `*${esc(name)}* transferiu chamado de volta para a fila\\.\n*${esc(ticket.title as string)}*${uhPart}\n\nOutro tecnico pode assumir\\:`,
        parse_mode: "MarkdownV2",
        reply_markup: openKb(ticketId),
      });
    }
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
    if (!await isModerator(chatId, fromId)) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: `ðŸ”’ Apenas moderadores do grupo podem reprovar vistoria\\.`,
        parse_mode: "MarkdownV2",
      });
      return { ok: true };
    }

    const result = await rejectInspectionAndReturnToTech(ticketId, fromId, name, chatId, userText);
    if (result.ok) {
      await cleanupPromptAndReply(message);
    } else if (result.error === "inspection_not_assumed") {
      await tg("sendMessage", {
        chat_id: chatId,
        text: `âš ï¸ A vistoria precisa ser assumida por um moderador antes de reprovar\\.`,
        parse_mode: "MarkdownV2",
      });
    } else if (result.error === "locked_to_other_inspector") {
      await tg("sendMessage", {
        chat_id: chatId,
        text: `ðŸ”’ Apenas o vistoriador que assumiu pode reprovar este chamado\\.`,
        parse_mode: "MarkdownV2",
      });
    } else if (result.error?.startsWith("not_pending_inspection")) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: `⚠️ Este chamado não está mais aguardando vistoria\\.`,
        parse_mode: "MarkdownV2",
      });
    }
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
      // telegram_user_id nao e definido aqui; o tecnico precisa assumir no card para vincular o Telegram.
    }).eq("id", ticketId);
    await logEvent({ ticketId, actorType: "telegram_user", actorId: String(fromId), actorName: name,
      event: "directed", prevStatus: ticket.status, newStatus: "in_progress", notes: `Direcionado para: ${tech.name}` });
    await tg("sendMessage", {
      chat_id: chatId,
      text: `📌 *${esc(name)}* direcionou *${esc(ticket.title)}* para *${esc(tech.name)}*`,
      parse_mode: "MarkdownV2",
      reply_markup: bindTechKb(ticketId),
    });
    return { ok: true };
  }

  // ── Note addition reply [note:UUID|USER_ID] ─────────────────────────────
  const noteMatch = replyText.match(/\[note:([0-9a-f-]{36})\|(\d+)\]/i);
  if (noteMatch) {
    const tId     = noteMatch[1];
    const ownerId = Number(noteMatch[2]);
    void ownerId;
    const ownerCheck = await ensureReplyOwner(tId, fromId, chatId, message);
    if (!ownerCheck.ok) return { ok: true };
    const noteText = userText.trim();
    if (!noteText) return { ok: true };
    const { data: tk } = await db.from("maintenance_tickets")
      .select("resolution_notes,status,room_number,title").eq("id", tId).single();
    if (!tk || tk.status === "resolved" || tk.status === "cancelled") return { ok: true };
    const stamp = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const newNotes = [tk.resolution_notes, `[${stamp}] ${noteText}`].filter(Boolean).join("\n");
    await db.from("maintenance_tickets").update({ resolution_notes: newNotes, updated_at: new Date().toISOString() })
      .eq("id", tId).eq("status", "in_progress").eq("telegram_user_id", fromId);
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
  const resolveMatch = replyText.match(/\[resolve:([0-9a-f-]{36})(?:\|(\d+))?\]/i);
  const legacyResolveMatch = !resolveMatch && replyText.startsWith("✍️")
    ? replyText.match(/\[([0-9a-f-]{36})(?:\|(\d+))?\]/i)
    : null;
  const partsMatch = replyText.match(/\[parts:([0-9a-f-]{36})(?:\|(\d+))?\]/i);
  const legacyPartsMatch = !partsMatch && replyText.startsWith("🔩")
    ? replyText.match(/\[([0-9a-f-]{36})(?:\|(\d+))?\]/i)
    : null;
  const match = resolveMatch ?? legacyResolveMatch ?? partsMatch ?? legacyPartsMatch;
  if (!match) return { ok: true };
  const ticketId       = match[1];
  const lockedTgUserId = match[2] ? Number(match[2]) : null;
  const replyValue     = userText.trim();

  void lockedTgUserId;
  const ownerCheck = await ensureReplyOwner(ticketId, fromId, chatId, message);
  if (!ownerCheck.ok) return { ok: true };

  const isResolve = !!(resolveMatch ?? legacyResolveMatch);
  const isParts   = !!(partsMatch ?? legacyPartsMatch);

  if (isResolve) {
    if (!replyValue) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: `⚠️ Envie uma descrição da solução para concluir o chamado\\.`,
        parse_mode: "MarkdownV2",
      });
      return { ok: true };
    }

    const { data: ticket } = await db
      .from("maintenance_tickets").select("created_at,title,room_number,status,telegram_user_id,resolution_notes").eq("id", ticketId).single();

    // Fix F/8: validate ticket is still in_progress before resolving
    if (!ticket || ticket.status !== "in_progress") {
      const alreadyResolvedBySameTech =
        ticket?.status === "resolved" &&
        Number(ticket.telegram_user_id) === fromId &&
        String(ticket.resolution_notes ?? "") === replyValue;
      if (alreadyResolvedBySameTech) {
        await updateTicketCard(ticketId, chatId);
        await cleanupPromptAndReply(message);
        return { ok: true, skipped: "already-resolved" };
      }
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
      resolution_notes: replyValue,
      status_reason: name,
      awaiting_parts: false,
      inspection_status: "pending",
      inspector_tg_id: null,
      inspection_notes: null,
      inspected_at: null,
      inspection_requested_at: null,
      rating: null,
      rated_by_tg_id: null,
    }).eq("id", ticketId).eq("status", "in_progress").eq("telegram_user_id", fromId).select("id", { count: "exact", head: true });

    if (!resolvedCount || resolvedCount === 0) {
      const { data: current } = await db
        .from("maintenance_tickets")
        .select("status,telegram_user_id,resolution_notes")
        .eq("id", ticketId)
        .single();
      const alreadyResolvedBySameTech =
        current?.status === "resolved" &&
        Number(current.telegram_user_id) === fromId &&
        String(current.resolution_notes ?? "") === replyValue;
      if (alreadyResolvedBySameTech) {
        await updateTicketCard(ticketId, chatId);
        await cleanupPromptAndReply(message);
        return { ok: true, skipped: "already-resolved" };
      }
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
      notes: replyValue.slice(0, 500),
    });

    const durationPart = mins !== null ? ` em *${esc(formatDuration(mins))}*` : "";

    // Send inspection request directly (DB trigger removed)
    await sendInspectionRequest(
      CHAT_ID, ticketId,
      name,
      ticket.title ?? "",
      ticket.room_number ?? null,
      durationPart,
      replyValue,
    );
    await db.from("maintenance_tickets").update({
      inspection_requested_at: now,
      updated_at: now,
    }).eq("id", ticketId).eq("status", "resolved").is("inspection_requested_at", null);
    await cleanupPromptAndReply(message);
  } else if (isParts) {
    if (!replyValue) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: `⚠️ Descreva quais peças são necessárias antes de registrar falta de peças\\.`,
        parse_mode: "MarkdownV2",
      });
      return { ok: true };
    }

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
      resolution_notes: `Aguardando pecas: ${replyValue} (${name})`,
    }).eq("id", ticketId).eq("status", "in_progress").eq("telegram_user_id", fromId);
    await updateTicketCard(ticketId, chatId);
    await cleanupPromptAndReply(message);
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
      reply_markup: { force_reply: true, input_field_placeholder: "Motivo do cancelamento..." },
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
      reply_markup: { force_reply: true, input_field_placeholder: "Motivo da reabertura..." },
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
      reply_markup: { force_reply: true, input_field_placeholder: "Nome do técnico..." },
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
    const body        = await req.json();
    const authHeader  = req.headers.get("authorization");

    // 1A: Validate Telegram webhook secret header
    const tgSecret     = req.headers.get("x-telegram-bot-api-secret-token");
    const isFromTg     = !!(body.callback_query || body.message || body.edited_message);
    const isInternal   = !!body.type && !!authHeader?.startsWith("Bearer ");
    const isPublicReport = body.type === "public_report";
    if (isFromTg) {
      if (WEBHOOK_SECRET && tgSecret !== WEBHOOK_SECRET) {
        return new Response("Unauthorized", { status: 401, headers: corsHeaders });
      }
    } else if (!isInternal && !isPublicReport) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    // Deduplication — skip if already processed
    const updateId = body.update_id as number;
    if (updateId && isDuplicate(updateId)) {
      return new Response(JSON.stringify({ ok: true, skipped: "duplicate" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
