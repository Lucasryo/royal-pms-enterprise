import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { SmtpClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const { to, subject, body: bodyText } = await req.json();

    if (!to || !subject || !bodyText) {
      return json({ error: "to, subject and body are required" }, 400);
    }

    // Load SMTP config from app_settings
    const { data, error } = await adminClient
      .from("app_settings")
      .select("value")
      .eq("id", "smtp_config")
      .maybeSingle();

    if (error || !data?.value) {
      return json({ error: "SMTP not configured. Please configure it in Integrações." }, 400);
    }

    const cfg = data.value as {
      host: string;
      port: string;
      user: string;
      pass: string;
      fromName: string;
    };

    if (!cfg.host || !cfg.user || !cfg.pass) {
      return json({ error: "Incomplete SMTP configuration." }, 400);
    }

    const port = parseInt(cfg.port ?? "587", 10);
    const useTls = port === 465;

    const client = new SmtpClient({ connection: { hostname: cfg.host, port, tls: useTls, auth: { username: cfg.user, password: cfg.pass } } });

    await client.send({
      from: `${cfg.fromName ?? "Hotel"} <${cfg.user}>`,
      to,
      subject,
      content: bodyText,
    });

    await client.close();

    return json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return json({ error: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
