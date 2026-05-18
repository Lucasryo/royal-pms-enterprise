import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const { data } = await adminClient.from("app_settings").select("value").eq("id", "whatsapp_config").maybeSingle();
  if (!data?.value) return json({ templates: [], error: "WhatsApp não configurado" });
  let cfg: { access_token?: string; business_account_id?: string };
  try { cfg = JSON.parse(data.value); } catch { return json({ templates: [], error: "Config inválida" }); }

  if (!cfg.access_token || !cfg.business_account_id) {
    return json({ templates: [], error: "access_token ou business_account_id ausente" });
  }

  try {
    const r = await fetch(
      `https://graph.facebook.com/v18.0/${cfg.business_account_id}/message_templates?fields=name,language,status,category,components&limit=100`,
      { headers: { Authorization: `Bearer ${cfg.access_token}` } },
    );
    const result = await r.json().catch(() => ({}));
    if (!r.ok) {
      const errMsg = (result as { error?: { message?: string } })?.error?.message ?? `Meta API ${r.status}`;
      return json({ templates: [], error: errMsg }, 500);
    }
    // Filtra só APPROVED
    const all = (result as { data?: Array<{ name: string; language: string; status: string; category: string; components?: Array<{ type: string; text?: string; example?: { body_text?: string[][] } }> }> })?.data ?? [];
    const approved = all
      .filter(t => t.status === "APPROVED")
      .map(t => {
        const body = t.components?.find(c => c.type === "BODY");
        // Conta quantos {{1}}, {{2}} etc tem no body pra saber paramCount
        const paramCount = body?.text ? (body.text.match(/\{\{\d+\}\}/g) ?? []).length : 0;
        return {
          name: t.name,
          language: t.language,
          category: t.category,
          bodyText: body?.text ?? "",
          paramCount,
        };
      });
    return json({ templates: approved });
  } catch (err) {
    return json({ templates: [], error: err instanceof Error ? err.message : "Erro" }, 500);
  }
});
