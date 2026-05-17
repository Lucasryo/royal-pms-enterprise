// Compartilhado entre webhook-whatsapp / webhook-instagram / webhook-facebook.
// Copia identica nos 3 dirs (Edge Functions nao compartilham filesystem entre deployments).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export type ChannelConfig = {
  verify_token?: string;
  access_token?: string;
  app_secret?: string;
  phone_number_id?: string;
  business_account_id?: string;
  page_id?: string;
};

export type ParsedMessage = {
  identifier: string;     // wa_id / PSID
  name: string;
  text: string;
  externalId: string;     // wamid / mid (pra dedupe)
  timestamp: number;
};

export function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function loadConfig(channel: "whatsapp" | "instagram" | "facebook"): Promise<ChannelConfig | null> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("app_settings")
    .select("value")
    .eq("id", `${channel}_config`)
    .maybeSingle();
  if (error || !data?.value) return null;
  try {
    return JSON.parse(data.value) as ChannelConfig;
  } catch {
    return null;
  }
}

// GET /?hub.mode=subscribe&hub.verify_token=X&hub.challenge=Y → responde Y se token bate.
export function verifyChallenge(url: URL, expectedToken: string | undefined): string | null {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && expectedToken && token === expectedToken && challenge) {
    return challenge;
  }
  return null;
}

// HMAC-SHA256 do body com app_secret. Compara com header X-Hub-Signature-256.
export async function validateSignature(rawBody: string, signature: string | null, appSecret: string | undefined): Promise<boolean> {
  // Modo dev: se nao tem secret configurado, aceita (mas avisa)
  if (!appSecret) {
    console.warn("[meta-webhook] app_secret não configurado — aceitando sem validação.");
    return true;
  }
  if (!signature || !signature.startsWith("sha256=")) return false;
  const expected = signature.slice(7).toLowerCase();
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(appSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
    const hex = Array.from(new Uint8Array(sigBuf))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
    return hex === expected;
  } catch (err) {
    console.warn("[meta-webhook] signature validation failed:", err);
    return false;
  }
}

// ─── Parsers por canal ─────────────────────────────────────────────────────

export function parseWhatsApp(payload: any): ParsedMessage[] {
  const out: ParsedMessage[] = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value ?? {};
      const contacts: any[] = value.contacts ?? [];
      const messages: any[] = value.messages ?? [];
      for (const msg of messages) {
        const from = msg.from ?? "";
        const contact = contacts.find(c => c.wa_id === from) ?? contacts[0];
        const name = contact?.profile?.name ?? from;
        let text = "";
        if (msg.type === "text") text = msg.text?.body ?? "";
        else if (msg.type === "image") text = "[FOTO]";
        else if (msg.type === "audio") text = "[ÁUDIO]";
        else if (msg.type === "video") text = "[VÍDEO]";
        else if (msg.type === "document") text = `[DOCUMENTO: ${msg.document?.filename ?? "arquivo"}]`;
        else if (msg.type === "sticker") text = "[STICKER]";
        else if (msg.type === "location") text = `[LOCALIZAÇÃO: ${msg.location?.latitude},${msg.location?.longitude}]`;
        else if (msg.type === "button") text = msg.button?.text ?? "";
        else if (msg.type === "interactive") text = msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? "[INTERATIVA]";
        else text = `[${(msg.type ?? "desconhecido").toString().toUpperCase()}]`;
        out.push({
          identifier: from,
          name,
          text,
          externalId: msg.id ?? `wa-${Date.now()}-${Math.random()}`,
          timestamp: Number(msg.timestamp ?? Math.floor(Date.now() / 1000)),
        });
      }
    }
  }
  return out;
}

export function parseInstagramOrFacebook(payload: any): ParsedMessage[] {
  const out: ParsedMessage[] = [];
  for (const entry of payload?.entry ?? []) {
    const messaging: any[] = entry?.messaging ?? [];
    for (const event of messaging) {
      const senderId = event?.sender?.id ?? "";
      if (!senderId) continue;
      // Ignora echo (mensagens que nós mesmos enviamos)
      if (event?.message?.is_echo) continue;
      let text = "";
      if (event?.message?.text) text = event.message.text;
      else if (event?.message?.attachments?.length) {
        const types = event.message.attachments.map((a: any) => (a.type ?? "anexo").toUpperCase()).join(", ");
        text = `[${types}]`;
      } else if (event?.postback?.title) {
        text = event.postback.title;
      } else continue;
      out.push({
        identifier: senderId,
        name: senderId, // IG/FB não mandam nome no webhook; pega via Graph API depois
        text,
        externalId: event?.message?.mid ?? `${entry?.id}-${event?.timestamp ?? Date.now()}`,
        timestamp: Number(event?.timestamp ?? Date.now()),
      });
    }
  }
  return out;
}

// ─── Upsert e insert ───────────────────────────────────────────────────────

export async function upsertContactAndMessage(
  channel: "whatsapp" | "instagram" | "facebook",
  msg: ParsedMessage,
): Promise<void> {
  const admin = getAdminClient();

  // 1. Find existing contact por phone (WA) ou por identifier salvo em email/phone (IG/FB).
  // Pra simplificar: usa phone pra WA, e armazena identifier em phone pra IG/FB tambem (sem coluna especifica).
  const idField = "phone";
  const { data: existing } = await admin
    .from("marketing_contacts")
    .select("id, unread_count")
    .eq("channel", channel)
    .eq(idField, msg.identifier)
    .maybeSingle();

  let contactId: string;
  let prevUnread = 0;
  if (existing?.id) {
    contactId = existing.id;
    prevUnread = existing.unread_count ?? 0;
    await admin.from("marketing_contacts").update({
      name: msg.name || msg.identifier,
      last_message: msg.text.slice(0, 500),
      last_message_at: new Date(msg.timestamp * 1000).toISOString(),
      unread_count: prevUnread + 1,
      status: "new",
      updated_at: new Date().toISOString(),
    }).eq("id", contactId);
  } else {
    const { data: inserted, error } = await admin.from("marketing_contacts").insert({
      channel,
      [idField]: msg.identifier,
      name: msg.name || msg.identifier,
      last_message: msg.text.slice(0, 500),
      last_message_at: new Date(msg.timestamp * 1000).toISOString(),
      unread_count: 1,
      status: "new",
      sentiment: "neutral",
      updated_at: new Date().toISOString(),
    }).select("id").single();
    if (error) {
      console.warn(`[meta-webhook] insert contact failed: ${error.message}`);
      return;
    }
    contactId = (inserted as { id: string }).id;
  }

  // 2. Dedupe: se ja temos mensagem com mesmo externalId, ignora.
  const { data: existingMsg } = await admin
    .from("inbox_messages")
    .select("id")
    .eq("email_message_id", msg.externalId)
    .eq("channel", channel)
    .maybeSingle();
  if (existingMsg) return;

  // 3. Insert mensagem.
  await admin.from("inbox_messages").insert([{
    contact_id: contactId,
    contact_identifier: msg.identifier,
    channel,
    direction: "in",
    subject: null,
    body: msg.text,
    body_html: null,
    message_uid: msg.externalId,
    email_message_id: msg.externalId,
    email_references: null,
    read: false,
    attachments: [],
  }]);
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
