import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}

type GenericProvider = {
  id: string;
  name: string;
  channel: "whatsapp" | "instagram" | "facebook";
  enabled: boolean;
  outbound: { url: string; method?: string; headers?: Record<string, string>; body_template: string };
};

async function loadProvider(providerId: string): Promise<GenericProvider | null> {
  const { data } = await admin().from("app_settings").select("value").eq("id", "generic_providers").maybeSingle();
  if (!data?.value) return null;
  try {
    const parsed = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
    return ((parsed.providers ?? []) as GenericProvider[]).find(p => p.id === providerId) ?? null;
  } catch { return null; }
}

function escapeForJson(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
}

function renderTemplate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => escapeForJson(String(vars[k] ?? "")));
}

async function recordOutgoing(contactId: string, channel: string, text: string, externalId: string) {
  const a = admin();
  await a.from("inbox_messages").insert([{
    contact_id: contactId,
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
  await a.from("marketing_contacts").update({
    last_message: text.slice(0, 500),
    last_message_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", contactId);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (req.headers.get("authorization") !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return json({ error: "Forbidden" }, 403);
  }

  let body: { provider_id?: string; recipient?: string; text?: string; contact_id?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const { provider_id, recipient, text, contact_id } = body;
  if (!provider_id || !recipient || !text || !contact_id) return json({ error: "provider_id, recipient, text, contact_id required" }, 400);

  const provider = await loadProvider(provider_id);
  if (!provider) return json({ error: "provider not found" }, 404);

  const rendered = renderTemplate(provider.outbound.body_template, { recipient, text, contact_id });
  let res: Response;
  try {
    res = await fetch(provider.outbound.url, {
      method: provider.outbound.method ?? "POST",
      headers: provider.outbound.headers ?? { "Content-Type": "application/json" },
      body: rendered,
    });
  } catch (err) {
    return json({ error: "fetch failed", detail: err instanceof Error ? err.message : String(err) }, 502);
  }
  const detail = await res.text();
  if (!res.ok) return json({ error: "provider rejected", status: res.status, detail }, 502);

  const externalId = `gen-${provider_id}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  await recordOutgoing(contact_id, provider.channel, text, externalId);
  return json({ sent: true, provider_response: detail.slice(0, 500) });
});
