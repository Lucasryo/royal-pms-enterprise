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

type ChannelConfig = {
  access_token?: string;
  phone_number_id?: string;
  page_id?: string;
};

async function loadConfig(channel: Channel): Promise<ChannelConfig | null> {
  const { data } = await adminClient
    .from("app_settings")
    .select("value")
    .eq("id", `${channel}_config`)
    .maybeSingle();
  if (!data?.value) return null;
  try { return JSON.parse(data.value) as ChannelConfig; } catch { return null; }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { channel?: Channel; recipient?: string; text?: string; contact_id?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { channel, recipient, text, contact_id } = body;
  if (!channel || !["whatsapp", "instagram", "facebook"].includes(channel)) return json({ error: "Invalid channel" }, 400);
  if (!recipient) return json({ error: "Recipient is required" }, 400);
  if (!text || !text.trim()) return json({ error: "Text is required" }, 400);

  const cfg = await loadConfig(channel);
  if (!cfg?.access_token) return json({ error: `${channel} access_token not configured` }, 400);

  try {
    let endpoint = "";
    let payload: Record<string, unknown> = {};

    if (channel === "whatsapp") {
      if (!cfg.phone_number_id) return json({ error: "WhatsApp phone_number_id not configured" }, 400);
      endpoint = `https://graph.facebook.com/v18.0/${cfg.phone_number_id}/messages`;
      payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipient,
        type: "text",
        text: { body: text },
      };
    } else if (channel === "instagram" || channel === "facebook") {
      // IG e Messenger usam o mesmo endpoint padrão Messenger Send API.
      // Pra IG, page_id é o IG Business ID; pra FB, o Page ID.
      if (!cfg.page_id) return json({ error: `${channel} page_id not configured` }, 400);
      endpoint = `https://graph.facebook.com/v18.0/${cfg.page_id}/messages`;
      payload = {
        recipient: { id: recipient },
        message: { text: text },
        messaging_type: "RESPONSE",
      };
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errMsg = (result as { error?: { message?: string } })?.error?.message ?? `Meta API ${response.status}`;
      console.warn(`[send-meta-message] ${channel} fail:`, errMsg, JSON.stringify(result));
      return json({ error: errMsg }, 500);
    }

    // External ID que Meta retornou (wamid / mid)
    let externalId: string | null = null;
    if (channel === "whatsapp") {
      externalId = (result as { messages?: Array<{ id?: string }> })?.messages?.[0]?.id ?? null;
    } else {
      externalId = (result as { message_id?: string })?.message_id ?? null;
    }
    if (!externalId) externalId = `${channel}-out-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Grava no banco como mensagem direction=out
    if (contact_id) {
      const now = new Date().toISOString();
      await adminClient.from("inbox_messages").insert([{
        contact_id,
        contact_identifier: recipient,
        channel,
        direction: "out",
        subject: null,
        body: text,
        body_html: null,
        message_uid: externalId,
        email_message_id: externalId,
        email_references: null,
        read: true,
        attachments: [],
      }]);
      await adminClient.from("marketing_contacts").update({
        last_message: text.slice(0, 500),
        last_message_at: now,
        status: "ai_responded",
        updated_at: now,
      }).eq("id", contact_id);
    }

    return json({ sent: true, externalId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    console.warn(`[send-meta-message] error:`, message);
    return json({ error: message }, 500);
  }
});
