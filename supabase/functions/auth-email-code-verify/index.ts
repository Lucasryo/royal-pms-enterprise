import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CODE_SECRET = Deno.env.get("AUTH_EMAIL_CODE_SECRET") ?? SERVICE_ROLE_KEY;
const SESSION_INACTIVITY_MINUTES = 30;
const REMEMBER_DAYS = 30;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: "Supabase is not configured." }, 500);

  try {
    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body?.email);
    const code = String(body?.code ?? "").replace(/\D/g, "");
    const rememberDevice = body?.remember_device === true;
    const deviceLabel = String(body?.device_label ?? "").trim() || null;
    const ip = clientIp(req);
    const userAgent = req.headers.get("user-agent") ?? null;

    if (!email || code.length !== 6) return json({ error: "Codigo invalido." }, 400);

    const { data: challenge, error: challengeError } = await admin
      .from("auth_email_challenges")
      .select("id, profile_id, email, normalized_email, code_hash, code_salt, auth_session_ciphertext, auth_session_iv, attempts, max_attempts, expires_at")
      .eq("normalized_email", email)
      .eq("purpose", "login")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (challengeError) return json({ error: challengeError.message }, 500);
    if (!challenge) return json({ ok: false, error: "Codigo invalido ou expirado." }, 400);

    const now = Date.now();
    if (new Date(challenge.expires_at).getTime() <= now) {
      await admin.from("auth_email_challenges").update({ status: "expired" }).eq("id", challenge.id);
      await recordEvent(challenge.profile_id, email, "email_code_expired", ip, userAgent);
      return json({ ok: false, error: "Codigo invalido ou expirado." }, 400);
    }

    const expectedHash = await hashCode(code, challenge.code_salt);
    if (expectedHash !== challenge.code_hash) {
      const attempts = Number(challenge.attempts ?? 0) + 1;
      const locked = attempts >= Number(challenge.max_attempts ?? 3);
      await admin
        .from("auth_email_challenges")
        .update({ attempts, status: locked ? "locked" : "pending" })
        .eq("id", challenge.id);
      await recordEvent(challenge.profile_id, email, locked ? "email_code_locked" : "email_code_failed", ip, userAgent, { attempts });
      return json({ ok: false, error: "Codigo invalido ou expirado.", attempts_remaining: Math.max(0, Number(challenge.max_attempts ?? 3) - attempts) }, 400);
    }

    await admin
      .from("auth_email_challenges")
      .update({ status: "verified", consumed_at: new Date().toISOString(), attempts: Number(challenge.attempts ?? 0) + 1 })
      .eq("id", challenge.id);

    let rememberedDeviceId: string | null = null;
    let rememberedDeviceToken: string | null = null;
    if (rememberDevice) {
      rememberedDeviceToken = randomToken();
      const { data: remembered, error: rememberedError } = await admin
        .from("auth_remembered_devices")
        .insert({
          profile_id: challenge.profile_id,
          device_hash: await hashToken(rememberedDeviceToken),
          device_label: deviceLabel,
          user_agent: userAgent,
          ip_address: ip,
          expires_at: new Date(now + REMEMBER_DAYS * 24 * 60 * 60 * 1000).toISOString(),
          metadata: { source: "auth-email-code-verify" },
        })
        .select("id")
        .single();

      if (rememberedError) return json({ error: rememberedError.message }, 500);
      rememberedDeviceId = remembered.id;
    }

    const deviceSessionToken = randomToken();
    const expiresAt = new Date(now + SESSION_INACTIVITY_MINUTES * 60 * 1000).toISOString();
    const { error: sessionError } = await admin.from("auth_device_sessions").insert({
      profile_id: challenge.profile_id,
      remembered_device_id: rememberedDeviceId,
      session_hash: await hashToken(deviceSessionToken),
      user_agent: userAgent,
      ip_address: ip,
      expires_at: expiresAt,
      metadata: { source: "auth-email-code-verify", challenge_id: challenge.id },
    });

    if (sessionError) return json({ error: sessionError.message }, 500);

    await recordEvent(challenge.profile_id, email, "email_code_verified", ip, userAgent, { remembered_device: rememberDevice });

    if (!challenge.auth_session_ciphertext || !challenge.auth_session_iv) {
      return json({ error: "Sessao de autenticacao ausente. Solicite um novo codigo." }, 400);
    }

    const session = await decryptSession(challenge.auth_session_ciphertext, challenge.auth_session_iv);

    return json({
      ok: true,
      requires_followup: false,
      session,
      auth_session_scaffold: {
        profile_id: challenge.profile_id,
        device_session_token: deviceSessionToken,
        expires_at: expiresAt,
        inactivity_seconds: SESSION_INACTIVITY_MINUTES * 60,
        remembered_device_token: rememberedDeviceToken,
        remembered_device_expires_in_days: rememberedDeviceToken ? REMEMBER_DAYS : null,
      },
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hashCode(code: string, salt: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${code}:${CODE_SECRET}`));
  return hex(digest);
}

async function hashToken(token: string) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
}

async function decryptSession(ciphertext: string, iv: string) {
  const key = await sessionCryptoKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(iv) },
    key,
    fromBase64Url(ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}

async function sessionCryptoKey() {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(CODE_SECRET));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["decrypt"]);
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function hex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function recordEvent(profileId: string | null, email: string, eventType: string, ip: string | null, userAgent: string | null, metadata = {}) {
  await admin.from("auth_security_events").insert({
    profile_id: profileId,
    email,
    normalized_email: email,
    event_type: eventType,
    ip_address: ip,
    user_agent: userAgent,
    metadata,
  });
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
