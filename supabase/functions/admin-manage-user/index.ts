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

const ALLOWED_ROLES = new Set([
  "admin",
  "manager",
  "client",
  "external_client",
  "reservations",
  "faturamento",
  "reception",
  "finance",
  "eventos",
  "restaurant",
  "housekeeping",
  "maintenance",
  "marketing",
]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Supabase function secrets are not configured." }, 500);

  try {
    const actor = await requireAdmin(req.headers.get("Authorization"));
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "list");

    if (action === "list") return await listUsers();
    if (action === "update_profile") return await updateProfile(body, actor.id);
    if (action === "update_password") return await updatePassword(body, actor.id);
    if (action === "revoke_telegram_binding") return await revokeTelegramBinding(body, actor.id);

    return json({ error: "Invalid action." }, 400);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unexpected error";
    return json({ error: message }, status);
  }
});

async function requireAdmin(authHeader: string | null) {
  const jwt = authHeader?.replace(/^Bearer\s+/i, "");
  if (!jwt) throw new HttpError("Missing bearer token.", 401);

  const { data: userData, error: authError } = await adminClient.auth.getUser(jwt);
  if (authError || !userData.user) throw new HttpError("Invalid session.", 401);

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id,role,permissions,active")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError) throw new HttpError(profileError.message, 500);
  if (!profile || profile.active === false || profile.role !== "admin") {
    throw new HttpError("You do not have permission to manage users.", 403);
  }

  return profile;
}

async function listUsers() {
  const [{ data: profiles, error: profilesError }, { data: companies, error: companiesError }] = await Promise.all([
    adminClient
      .from("profiles")
      .select("id,name,email,role,phone,company_id,permissions,active")
      .order("name", { ascending: true }),
    adminClient
      .from("companies")
      .select("id,name,status")
      .order("name", { ascending: true }),
  ]);

  if (profilesError) throw new HttpError(profilesError.message, 500);
  if (companiesError) throw new HttpError(companiesError.message, 500);

  const profileIds = (profiles ?? []).map((profile) => profile.id as string);
  const bindingsRes = profileIds.length
    ? await adminClient
      .from("telegram_user_bindings")
      .select("id,profile_id,telegram_user_id,telegram_username,display_name,telegram_role,active,linked_at,revoked_at")
      .in("profile_id", profileIds)
      .eq("active", true)
    : { data: [], error: null };

  if (bindingsRes.error) throw new HttpError(bindingsRes.error.message, 500);

  const bindingsByProfile = new Map<string, Record<string, unknown>>();
  for (const binding of bindingsRes.data ?? []) bindingsByProfile.set(binding.profile_id as string, binding);

  return json({
    ok: true,
    users: (profiles ?? []).map((profile) => ({
      ...profile,
      active: profile.active !== false,
      telegram_binding: bindingsByProfile.get(profile.id as string) ?? null,
    })),
    companies: companies ?? [],
  });
}

async function updateProfile(body: Record<string, unknown>, actorId: string) {
  const profileId = String(body?.profile_id ?? "");
  if (!profileId) throw new HttpError("Missing profile_id.", 400);

  const name = String(body?.name ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  const phone = String(body?.phone ?? "").trim();
  const role = String(body?.role ?? "");
  const companyId = body?.company_id ? String(body.company_id) : null;
  const permissions = body?.permissions ?? null;
  const active = body?.active !== false;

  if (!name || !email) throw new HttpError("Name and email are required.", 400);
  if (!ALLOWED_ROLES.has(role)) throw new HttpError("Invalid role.", 400);

  const { data: previous, error: previousError } = await adminClient
    .from("profiles")
    .select("id,email")
    .eq("id", profileId)
    .maybeSingle();

  if (previousError) throw new HttpError(previousError.message, 500);
  if (!previous) throw new HttpError("Profile not found.", 404);

  const updateAuthPayload: Record<string, unknown> = {
    user_metadata: { full_name: name },
    app_metadata: { role },
  };
  if (previous.email !== email) {
    updateAuthPayload.email = email;
    updateAuthPayload.email_confirm = true;
  }

  const { error: authError } = await adminClient.auth.admin.updateUserById(profileId, updateAuthPayload);
  if (authError) throw new HttpError(authError.message, 400);

  const { data: updated, error: updateError } = await adminClient
    .from("profiles")
    .update({
      name,
      email,
      phone,
      role,
      company_id: companyId,
      permissions,
      active,
    })
    .eq("id", profileId)
    .select("id,name,email,role,phone,company_id,permissions,active")
    .single();

  if (updateError) throw new HttpError(updateError.message, 500);

  await logAudit(actorId, "Editou usuario", { profile_id: profileId, role, active });
  return json({ ok: true, user: updated });
}

async function updatePassword(body: Record<string, unknown>, actorId: string) {
  const profileId = String(body?.profile_id ?? "");
  const password = String(body?.password ?? "");
  if (!profileId) throw new HttpError("Missing profile_id.", 400);
  if (password.length < 6) throw new HttpError("Password must be at least 6 characters.", 400);

  const { error } = await adminClient.auth.admin.updateUserById(profileId, { password });
  if (error) throw new HttpError(error.message, 400);

  await logAudit(actorId, "Alterou senha de usuario", { profile_id: profileId });
  return json({ ok: true });
}

async function revokeTelegramBinding(body: Record<string, unknown>, actorId: string) {
  const bindingId = String(body?.binding_id ?? "");
  if (!bindingId) throw new HttpError("Missing binding_id.", 400);

  const { data: binding, error } = await adminClient
    .from("telegram_user_bindings")
    .update({
      active: false,
      revoked_at: new Date().toISOString(),
      revoked_by: actorId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bindingId)
    .eq("active", true)
    .select("id,profile_id,telegram_user_id")
    .maybeSingle();

  if (error) throw new HttpError(error.message, 500);
  if (!binding) throw new HttpError("Binding not found.", 404);

  await logAudit(actorId, "Revogou vinculo Telegram", {
    binding_id: bindingId,
    profile_id: binding.profile_id,
    telegram_user_id: binding.telegram_user_id,
  });
  return json({ ok: true, binding });
}

async function logAudit(actorId: string, action: string, details: Record<string, unknown>) {
  const { data: actor } = await adminClient
    .from("profiles")
    .select("name")
    .eq("id", actorId)
    .maybeSingle();

  await adminClient.from("audit_logs").insert({
    user_id: actorId,
    user_name: actor?.name ?? "Admin",
    action,
    details: JSON.stringify(details),
    type: "update",
    timestamp: new Date().toISOString(),
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

class HttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
