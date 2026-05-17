import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Channel = "whatsapp" | "instagram" | "facebook";
type ChannelConfig = { access_token?: string; phone_number_id?: string; page_id?: string; };
type AttachmentRef = { path: string; name: string; size: number; mime: string; };
type TemplateRef = { name: string; languageCode: string; bodyParams?: string[]; };

async function loadConfig(channel: Channel): Promise<ChannelConfig | null> {
  const { data } = await adminClient.from("app_settings").select("value").eq("id", `${channel}_config`).maybeSingle();
  if (!data?.value) return null;
  try { return JSON.parse(data.value) as ChannelConfig; } catch { return null; }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Mime → WhatsApp media type
function mimeToWAType(mime: string): "image" | "video" | "audio" | "document" | "sticker" {
  if (mime.startsWith("image/webp")) return "sticker";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

// Mime → IG/FB attachment type
function mimeToMessengerType(mime: string): "image" | "video" | "audio" | "file" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

// Upload de bytes pra Meta WhatsApp /media endpoint. Retorna media_id.
async function uploadToWAMedia(phoneNumberId: string, bytes: Uint8Array, mime: string, filename: string, accessToken: string): Promise<string | null> {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mime);
  form.append("file", new Blob([bytes], { type: mime }), filename);
  const r = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  if (!r.ok) {
    const errBody = await r.text().catch(() => "");
    console.warn(`[send-meta] WA media upload failed: ${r.status} ${errBody}`);
    return null;
  }
  const j = await r.json().catch(() => ({}));
  return (j as { id?: string })?.id ?? null;
}

// Lê bytes do anexo no Supabase Storage
async function fetchAttachmentBytes(path: string): Promise<{ bytes: Uint8Array; size: number } | null> {
  const { data, error } = await adminClient.storage.from("inbox_attachments").download(path);
  if (error || !data) return null;
  const ab = await data.arrayBuffer();
  return { bytes: new Uint8Array(ab), size: ab.byteLength };
}

// Gera signed URL pra anexo (IG/FB precisam de URL pública/temporária)
async function signedUrl(path: string, expiresSec = 3600): Promise<string | null> {
  const { data, error } = await adminClient.storage.from("inbox_attachments").createSignedUrl(path, expiresSec);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

async function sendWhatsAppText(cfg: ChannelConfig, to: string, text: string): Promise<{ ok: boolean; externalId?: string; error?: string }> {
  if (!cfg.phone_number_id) return { ok: false, error: "WhatsApp phone_number_id not configured" };
  const r = await fetch(`https://graph.facebook.com/v18.0/${cfg.phone_number_id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body: text } }),
  });
  const result = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: (result as { error?: { message?: string } })?.error?.message ?? `Meta API ${r.status}` };
  return { ok: true, externalId: (result as { messages?: Array<{ id?: string }> })?.messages?.[0]?.id };
}

async function sendWhatsAppMedia(cfg: ChannelConfig, to: string, mediaId: string, mime: string, caption?: string): Promise<{ ok: boolean; externalId?: string; error?: string }> {
  if (!cfg.phone_number_id) return { ok: false, error: "WhatsApp phone_number_id not configured" };
  const type = mimeToWAType(mime);
  const mediaPayload: Record<string, unknown> = { id: mediaId };
  if (caption && (type === "image" || type === "video" || type === "document")) mediaPayload.caption = caption;
  const r = await fetch(`https://graph.facebook.com/v18.0/${cfg.phone_number_id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type, [type]: mediaPayload }),
  });
  const result = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: (result as { error?: { message?: string } })?.error?.message ?? `Meta API ${r.status}` };
  return { ok: true, externalId: (result as { messages?: Array<{ id?: string }> })?.messages?.[0]?.id };
}

async function sendWhatsAppTemplate(cfg: ChannelConfig, to: string, tpl: TemplateRef): Promise<{ ok: boolean; externalId?: string; error?: string }> {
  if (!cfg.phone_number_id) return { ok: false, error: "WhatsApp phone_number_id not configured" };
  const components: Array<Record<string, unknown>> = [];
  if (tpl.bodyParams && tpl.bodyParams.length > 0) {
    components.push({ type: "body", parameters: tpl.bodyParams.map(p => ({ type: "text", text: p })) });
  }
  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: { name: tpl.name, language: { code: tpl.languageCode }, components },
  };
  const r = await fetch(`https://graph.facebook.com/v18.0/${cfg.phone_number_id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: (result as { error?: { message?: string } })?.error?.message ?? `Meta API ${r.status}` };
  return { ok: true, externalId: (result as { messages?: Array<{ id?: string }> })?.messages?.[0]?.id };
}

async function sendIGFBText(cfg: ChannelConfig, to: string, text: string): Promise<{ ok: boolean; externalId?: string; error?: string }> {
  if (!cfg.page_id) return { ok: false, error: "page_id not configured" };
  const r = await fetch(`https://graph.facebook.com/v18.0/${cfg.page_id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: to }, message: { text }, messaging_type: "RESPONSE" }),
  });
  const result = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: (result as { error?: { message?: string } })?.error?.message ?? `Meta API ${r.status}` };
  return { ok: true, externalId: (result as { message_id?: string })?.message_id };
}

async function sendIGFBAttachmentUrl(cfg: ChannelConfig, to: string, mime: string, url: string): Promise<{ ok: boolean; externalId?: string; error?: string }> {
  if (!cfg.page_id) return { ok: false, error: "page_id not configured" };
  const type = mimeToMessengerType(mime);
  const r = await fetch(`https://graph.facebook.com/v18.0/${cfg.page_id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: to },
      messaging_type: "RESPONSE",
      message: { attachment: { type, payload: { url, is_reusable: true } } },
    }),
  });
  const result = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: (result as { error?: { message?: string } })?.error?.message ?? `Meta API ${r.status}` };
  return { ok: true, externalId: (result as { message_id?: string })?.message_id };
}

async function recordOutgoing(channel: Channel, contact_id: string | undefined, to: string, text: string, externalId: string, attachments: AttachmentRef[]) {
  if (!contact_id) return;
  const now = new Date().toISOString();
  await adminClient.from("inbox_messages").insert([{
    contact_id, contact_identifier: to, channel, direction: "out",
    subject: null, body: text, body_html: null,
    message_uid: externalId, email_message_id: externalId, email_references: null,
    read: false, attachments,
  }]);
  await adminClient.from("marketing_contacts").update({
    last_message: (text || (attachments.length ? `[${attachments.length} anexo(s)]` : "")).slice(0, 500),
    last_message_at: now, status: "ai_responded", updated_at: now,
  }).eq("id", contact_id);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { channel?: Channel; recipient?: string; text?: string; contact_id?: string; attachments?: AttachmentRef[]; template?: TemplateRef };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { channel, recipient, text, contact_id, attachments, template } = body;
  if (!channel || !["whatsapp", "instagram", "facebook"].includes(channel)) return json({ error: "Invalid channel" }, 400);
  if (!recipient) return json({ error: "Recipient is required" }, 400);

  // Roteamento: se o contato veio de um provider terceiro, delega pro send-generic-message.
  if (contact_id) {
    const { data: c } = await adminClient.from("marketing_contacts").select("provider_id").eq("id", contact_id).maybeSingle();
    if (c?.provider_id) {
      if (template) return json({ error: "Templates not supported on generic providers" }, 400);
      if (attachments && attachments.length > 0) return json({ error: "Attachments not yet supported on generic providers" }, 400);
      if (!text || !text.trim()) return json({ error: "Text required" }, 400);
      const r = await fetch(`${SUPABASE_URL}/functions/v1/send-generic-message`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: c.provider_id, recipient, text, contact_id }),
      });
      const detail = await r.text();
      return new Response(detail, { status: r.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  const cfg = await loadConfig(channel);
  if (!cfg?.access_token) return json({ error: `${channel} access_token not configured` }, 400);

  const sent: string[] = [];
  const errors: string[] = [];

  try {
    // Template (apenas WA suporta templates)
    if (template?.name) {
      if (channel !== "whatsapp") return json({ error: "Templates only supported on WhatsApp" }, 400);
      const r = await sendWhatsAppTemplate(cfg, recipient, template);
      if (!r.ok) return json({ error: r.error || "Falha no template" }, 500);
      sent.push(r.externalId ?? `tpl-${Date.now()}`);
      await recordOutgoing(channel, contact_id, recipient, `[Template: ${template.name}]`, sent[0], []);
      return json({ sent: true, externalIds: sent });
    }

    // Anexos (envia cada um como msg separada; primeiro carrega caption se houver text)
    if (attachments && attachments.length > 0) {
      for (let i = 0; i < attachments.length; i++) {
        const att = attachments[i];
        const caption = i === 0 ? (text || "") : "";
        if (channel === "whatsapp") {
          const fetched = await fetchAttachmentBytes(att.path);
          if (!fetched) { errors.push(`storage: ${att.name}`); continue; }
          const mediaId = await uploadToWAMedia(cfg.phone_number_id!, fetched.bytes, att.mime, att.name, cfg.access_token);
          if (!mediaId) { errors.push(`upload: ${att.name}`); continue; }
          const r = await sendWhatsAppMedia(cfg, recipient, mediaId, att.mime, caption || undefined);
          if (r.ok && r.externalId) {
            sent.push(r.externalId);
            await recordOutgoing(channel, contact_id, recipient, caption, r.externalId, [att]);
          } else {
            errors.push(`send: ${r.error}`);
          }
        } else {
          // IG/FB: signed URL + envio direto
          const url = await signedUrl(att.path);
          if (!url) { errors.push(`signed: ${att.name}`); continue; }
          const r = await sendIGFBAttachmentUrl(cfg, recipient, att.mime, url);
          if (r.ok && r.externalId) {
            sent.push(r.externalId);
            await recordOutgoing(channel, contact_id, recipient, caption, r.externalId, [att]);
            // IG/FB attachment não suporta caption; se houver texto, manda mensagem extra
            if (i === 0 && text && text.trim()) {
              const tr = await sendIGFBText(cfg, recipient, text);
              if (tr.ok && tr.externalId) {
                sent.push(tr.externalId);
                await recordOutgoing(channel, contact_id, recipient, text, tr.externalId, []);
              }
            }
          } else {
            errors.push(`send: ${r.error}`);
          }
        }
      }
      if (sent.length === 0) return json({ error: errors[0] || "Falha ao enviar anexos" }, 500);
      return json({ sent: true, externalIds: sent, errors: errors.length ? errors : undefined });
    }

    // Texto puro
    if (!text || !text.trim()) return json({ error: "Text or attachments required" }, 400);
    const r = channel === "whatsapp" ? await sendWhatsAppText(cfg, recipient, text) : await sendIGFBText(cfg, recipient, text);
    if (!r.ok || !r.externalId) return json({ error: r.error || "Falha ao enviar" }, 500);
    sent.push(r.externalId);
    await recordOutgoing(channel, contact_id, recipient, text, r.externalId, []);
    return json({ sent: true, externalIds: sent });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    console.warn(`[send-meta-message] error:`, message);
    return json({ error: message }, 500);
  }
});
