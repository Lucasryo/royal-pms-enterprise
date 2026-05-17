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

export type MediaItem = {
  source: "whatsapp" | "meta-direct";  // whatsapp = precisa GET media_id pra pegar URL; meta-direct = url ja vem no payload
  mediaIdOrUrl: string;
  mime: string;
  filename?: string;
};

export type ParsedMessage = {
  identifier: string;     // wa_id / PSID
  name: string;
  text: string;
  externalId: string;     // wamid / mid (pra dedupe)
  timestamp: number;
  mediaItems?: MediaItem[];
};

export type Attachment = { path: string; name: string; size: number; mime: string; };

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
        const mediaItems: MediaItem[] = [];
        if (msg.type === "text") {
          text = msg.text?.body ?? "";
        } else if (msg.type === "image") {
          text = msg.image?.caption ?? "";
          if (msg.image?.id) mediaItems.push({ source: "whatsapp", mediaIdOrUrl: msg.image.id, mime: msg.image?.mime_type ?? "image/jpeg", filename: `image.${(msg.image?.mime_type ?? "image/jpeg").split("/")[1]}` });
        } else if (msg.type === "audio") {
          text = "[ÁUDIO]";
          if (msg.audio?.id) mediaItems.push({ source: "whatsapp", mediaIdOrUrl: msg.audio.id, mime: msg.audio?.mime_type ?? "audio/ogg", filename: "audio.ogg" });
        } else if (msg.type === "video") {
          text = msg.video?.caption ?? "";
          if (msg.video?.id) mediaItems.push({ source: "whatsapp", mediaIdOrUrl: msg.video.id, mime: msg.video?.mime_type ?? "video/mp4", filename: "video.mp4" });
        } else if (msg.type === "document") {
          text = msg.document?.caption ?? "";
          if (msg.document?.id) mediaItems.push({ source: "whatsapp", mediaIdOrUrl: msg.document.id, mime: msg.document?.mime_type ?? "application/pdf", filename: msg.document?.filename ?? "documento" });
        } else if (msg.type === "sticker") {
          text = "[STICKER]";
          if (msg.sticker?.id) mediaItems.push({ source: "whatsapp", mediaIdOrUrl: msg.sticker.id, mime: msg.sticker?.mime_type ?? "image/webp", filename: "sticker.webp" });
        } else if (msg.type === "location") {
          text = `[LOCALIZAÇÃO: ${msg.location?.latitude},${msg.location?.longitude}]`;
        } else if (msg.type === "button") {
          text = msg.button?.text ?? "";
        } else if (msg.type === "interactive") {
          text = msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? "[INTERATIVA]";
        } else {
          text = `[${(msg.type ?? "desconhecido").toString().toUpperCase()}]`;
        }
        out.push({
          identifier: from,
          name,
          text,
          externalId: msg.id ?? `wa-${Date.now()}-${Math.random()}`,
          timestamp: Number(msg.timestamp ?? Math.floor(Date.now() / 1000)),
          mediaItems: mediaItems.length > 0 ? mediaItems : undefined,
        });
      }
    }
  }
  return out;
}

// Download de uma mídia (WhatsApp Cloud API ou URL direta de IG/FB), salva no bucket inbox_attachments.
export async function downloadMediaToStorage(
  item: MediaItem,
  contactId: string,
  channel: string,
  accessToken: string,
): Promise<Attachment | null> {
  try {
    let downloadUrl = item.mediaIdOrUrl;
    // WhatsApp: precisa primeiro GET /{media_id} pra pegar a URL real
    if (item.source === "whatsapp") {
      const lookup = await fetch(`https://graph.facebook.com/v18.0/${item.mediaIdOrUrl}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!lookup.ok) {
        console.warn(`[media] lookup failed: ${lookup.status}`);
        return null;
      }
      const lookupJson = await lookup.json().catch(() => ({}));
      downloadUrl = (lookupJson as { url?: string })?.url ?? "";
      if (!downloadUrl) return null;
    }
    // Baixa o binário (com auth header pra WhatsApp)
    const dl = await fetch(downloadUrl, item.source === "whatsapp" ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined);
    if (!dl.ok) {
      console.warn(`[media] download failed: ${dl.status}`);
      return null;
    }
    const bytes = new Uint8Array(await dl.arrayBuffer());
    if (bytes.length === 0) return null;

    const safeName = (item.filename ?? "media").replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${channel}/${contactId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
    const admin = getAdminClient();
    const { error: upErr } = await admin.storage.from("inbox_attachments").upload(path, bytes, {
      contentType: item.mime,
      upsert: false,
    });
    if (upErr) {
      console.warn(`[media] storage upload failed: ${upErr.message}`);
      return null;
    }
    return { path, name: safeName, size: bytes.length, mime: item.mime };
  } catch (err) {
    console.warn("[media] downloadMediaToStorage error:", err);
    return null;
  }
}

export async function upsertContactAndMessage(
  channel: "whatsapp" | "instagram" | "facebook",
  msg: ParsedMessage,
  accessToken?: string,
): Promise<void> {
  const admin = getAdminClient();
  const idField = "phone";
  const { data: existing } = await admin
    .from("marketing_contacts")
    .select("id, unread_count")
    .eq("channel", channel)
    .eq(idField, msg.identifier)
    .maybeSingle();

  let contactId: string;
  if (existing?.id) {
    contactId = existing.id;
    const prev = existing.unread_count ?? 0;
    await admin.from("marketing_contacts").update({
      name: msg.name || msg.identifier,
      last_message: msg.text.slice(0, 500) || (msg.mediaItems?.length ? `[${msg.mediaItems.length} anexo(s)]` : ""),
      last_message_at: new Date(msg.timestamp * 1000).toISOString(),
      unread_count: prev + 1,
      status: "new",
      updated_at: new Date().toISOString(),
    }).eq("id", contactId);
  } else {
    const { data: inserted, error } = await admin.from("marketing_contacts").insert({
      channel,
      [idField]: msg.identifier,
      name: msg.name || msg.identifier,
      last_message: msg.text.slice(0, 500) || (msg.mediaItems?.length ? `[${msg.mediaItems.length} anexo(s)]` : ""),
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

  // Dedupe
  const { data: existingMsg } = await admin
    .from("inbox_messages")
    .select("id")
    .eq("email_message_id", msg.externalId)
    .eq("channel", channel)
    .maybeSingle();
  if (existingMsg) return;

  // Download de mídias (se houver e tivermos access_token)
  const attachments: Attachment[] = [];
  if (msg.mediaItems && msg.mediaItems.length > 0 && accessToken) {
    for (const item of msg.mediaItems) {
      const att = await downloadMediaToStorage(item, contactId, channel, accessToken);
      if (att) attachments.push(att);
    }
  }

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
    attachments,
  }]);
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
