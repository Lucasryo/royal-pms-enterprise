import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SESSION_INACTIVITY_MINUTES = 30;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: "Supabase is not configured." }, 500);

  try {
    const body = await req.json().catch(() => ({}));
    const sessionToken = String(body?.device_session_token ?? "").trim();
    if (!sessionToken) return json({ error: "device_session_token obrigatorio." }, 400);

    const sessionHash = await hashToken(sessionToken);
    const { data: session, error } = await admin
      .from("auth_device_sessions")
      .select("id, profile_id, remembered_device_id, expires_at, revoked_at")
      .eq("session_hash", sessionHash)
      .maybeSingle();

    if (error) return json({ error: error.message }, 500);
    if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) {
      return json({ ok: false, active: false, error: "Sessao expirada ou revogada." }, 401);
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_INACTIVITY_MINUTES * 60 * 1000).toISOString();
    const ip = clientIp(req);
    const userAgent = req.headers.get("user-agent") ?? null;

    const { error: updateError } = await admin
      .from("auth_device_sessions")
      .update({ last_seen_at: now.toISOString(), expires_at: expiresAt, ip_address: ip, user_agent: userAgent })
      .eq("id", session.id);

    if (updateError) return json({ error: updateError.message }, 500);

    if (session.remembered_device_id) {
      await admin
        .from("auth_remembered_devices")
        .update({ last_seen_at: now.toISOString(), ip_address: ip, user_agent: userAgent })
        .eq("id", session.remembered_device_id)
        .is("revoked_at", null);
    }

    return json({
      ok: true,
      active: true,
      requires_followup: false,
      expires_at: expiresAt,
      inactivity_seconds: SESSION_INACTIVITY_MINUTES * 60,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
