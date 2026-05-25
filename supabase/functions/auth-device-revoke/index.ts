import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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
    const rememberedDeviceToken = String(body?.remembered_device_token ?? "").trim();
    const reason = String(body?.reason ?? "user_requested").trim().slice(0, 120);
    const now = new Date().toISOString();

    if (!sessionToken && !rememberedDeviceToken) {
      return json({ error: "device_session_token ou remembered_device_token obrigatorio." }, 400);
    }

    let revokedSessions = 0;
    let revokedDevices = 0;
    let profileId: string | null = null;

    if (sessionToken) {
      const sessionHash = await hashToken(sessionToken);
      const { data: session, error: sessionLookupError } = await admin
        .from("auth_device_sessions")
        .select("id, profile_id, remembered_device_id")
        .eq("session_hash", sessionHash)
        .maybeSingle();

      if (sessionLookupError) return json({ error: sessionLookupError.message }, 500);

      if (session) {
        profileId = session.profile_id;
        const { error } = await admin
          .from("auth_device_sessions")
          .update({ revoked_at: now, revoke_reason: reason })
          .eq("id", session.id)
          .is("revoked_at", null);
        if (error) return json({ error: error.message }, 500);
        revokedSessions += 1;
      }
    }

    if (rememberedDeviceToken) {
      const deviceHash = await hashToken(rememberedDeviceToken);
      const { data: device, error: deviceLookupError } = await admin
        .from("auth_remembered_devices")
        .select("id, profile_id")
        .eq("device_hash", deviceHash)
        .maybeSingle();

      if (deviceLookupError) return json({ error: deviceLookupError.message }, 500);

      if (device) {
        profileId = profileId ?? device.profile_id;
        const { error: deviceError } = await admin
          .from("auth_remembered_devices")
          .update({ revoked_at: now, revoke_reason: reason })
          .eq("id", device.id)
          .is("revoked_at", null);
        if (deviceError) return json({ error: deviceError.message }, 500);
        revokedDevices += 1;

        const { error: sessionsError } = await admin
          .from("auth_device_sessions")
          .update({ revoked_at: now, revoke_reason: "remembered_device_revoked" })
          .eq("remembered_device_id", device.id)
          .is("revoked_at", null);
        if (sessionsError) return json({ error: sessionsError.message }, 500);
      }
    }

    await admin.from("auth_security_events").insert({
      profile_id: profileId,
      event_type: "device_revoked",
      ip_address: clientIp(req),
      user_agent: req.headers.get("user-agent"),
      metadata: { reason, revoked_sessions: revokedSessions, revoked_devices: revokedDevices },
    });

    return json({ ok: true, revoked_sessions: revokedSessions, revoked_devices: revokedDevices });
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
