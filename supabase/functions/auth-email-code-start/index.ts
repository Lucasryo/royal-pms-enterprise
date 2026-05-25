import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const DEFAULT_FROM = Deno.env.get("RESEND_DEFAULT_FROM") ?? "Royal PMS <onboarding@resend.dev>";
const CODE_SECRET = Deno.env.get("AUTH_EMAIL_CODE_SECRET") ?? SERVICE_ROLE_KEY;
const CODE_TTL_MINUTES = 5;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) return json({ error: "Supabase is not configured." }, 500);

  try {
    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body?.email);
    const password = String(body?.password ?? "");
    const ip = clientIp(req);
    const userAgent = req.headers.get("user-agent") ?? null;

    if (!email) return json({ error: "Email obrigatorio." }, 400);
    if (!password) return json({ error: "Senha obrigatoria." }, 400);

    const { data: authData, error: authError } = await authClient.auth.signInWithPassword({ email, password });
    if (authError || !authData.user || !authData.session) {
      await recordEvent(null, email, "password_failed", ip, userAgent, { reason: authError?.message ?? "no_session" });
      return json({ error: "Email ou senha invalidos." }, 401);
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, email, name, active")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (profileError) return json({ error: profileError.message }, 500);

    if (!profile || profile.active === false) {
      await recordEvent(authData.user.id, email, "password_verified_profile_inactive", ip, userAgent);
      return json({ error: "Usuario inativo ou sem perfil." }, 403);
    }

    const code = generateCode();
    const salt = randomToken(16);
    const codeHash = await hashCode(code, salt);
    const encryptedSession = await encryptSession({
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
      expires_at: authData.session.expires_at,
      expires_in: authData.session.expires_in,
      token_type: authData.session.token_type,
      user: authData.user,
    });
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();

    await admin
      .from("auth_email_challenges")
      .update({ status: "cancelled" })
      .eq("profile_id", profile.id)
      .eq("purpose", "login")
      .eq("status", "pending");

    const { error: insertError } = await admin.from("auth_email_challenges").insert({
      profile_id: profile.id,
      email: profile.email ?? email,
      normalized_email: email,
      purpose: "login",
      code_hash: codeHash,
      code_salt: salt,
      auth_session_ciphertext: encryptedSession.ciphertext,
      auth_session_iv: encryptedSession.iv,
      max_attempts: 3,
      expires_at: expiresAt,
      ip_address: ip,
      user_agent: userAgent,
      metadata: { source: "auth-email-code-start" },
    });

    if (insertError) return json({ error: insertError.message }, 500);

    await recordEvent(profile.id, email, "password_verified_code_sent", ip, userAgent);

    const emailResult = await sendCodeEmail(profile.email ?? email, code);
    if (!emailResult.ok) {
      await recordEvent(profile.id, email, "email_code_delivery_failed", ip, userAgent, emailResult);
      return json({ ok: false, error: "Falha ao enviar codigo por email.", detail: emailResult }, 502);
    }

    return json({ ok: true, sent: true, expires_in_seconds: CODE_TTL_MINUTES * 60 });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});

async function sendCodeEmail(to: string, code: string) {
  if (!RESEND_API_KEY) {
    // TODO: configure RESEND_API_KEY and RESEND_DEFAULT_FROM for production email-code delivery.
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: DEFAULT_FROM,
      to: [to],
      subject: "Codigo de acesso Royal PMS",
      html: `<p>Seu codigo de acesso ao Royal PMS e:</p><p style="font-size:24px;font-weight:700;letter-spacing:4px">${code}</p><p>Ele expira em 5 minutos.</p>`,
    }),
  });
  const data = await res.json().catch(() => ({}));
  return res.ok ? { ok: true, id: data?.id } : { ok: false, status: res.status, detail: data };
}

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function generateCode() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0] % 1_000_000).padStart(6, "0");
}

function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hashCode(code: string, salt: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${code}:${CODE_SECRET}`));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function encryptSession(session: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await sessionCryptoKey();
  const bytes = new TextEncoder().encode(JSON.stringify(session));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes);
  return {
    ciphertext: base64Url(new Uint8Array(encrypted)),
    iv: base64Url(iv),
  };
}

async function sessionCryptoKey() {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(CODE_SECRET));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt"]);
}

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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
