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

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type NpsConfig = {
  enabled: boolean;
  send_after_hours: number;
  message_template: string;
  hotel_name?: string;
};

type Reservation = {
  id: string;
  guest_name: string | null;
  check_out: string;
  status: string;
  contact_phone: string | null;
  contact_email: string | null;
};

const DEFAULT_TEMPLATE = "Ola {{guest_name}}! Aqui e o {{hotel_name}}. Esperamos que tenha gostado da estadia. De 0 a 10, qual a chance de voce nos recomendar? Responda com a nota e um comentario se quiser.";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: "Supabase is not configured." }, 500);

  try {
    const body = await req.json().catch(() => ({}));
    const authHeader = req.headers.get("authorization") ?? "";
    const serviceCall = authHeader === `Bearer ${SERVICE_ROLE_KEY}`;
    if (!serviceCall) await assertStaff(authHeader);

    const cfg = await loadConfig();
    if (!cfg.enabled && !body?.force) return json({ skipped: "NPS disabled" });

    const reservations = await loadEligibleReservations(cfg, body?.reservation_id);
    const results: Array<{ reservation_id: string; sent: boolean; reason?: string }> = [];

    for (const reservation of reservations) {
      const { data: existing } = await admin.from("nps_responses").select("id").eq("reservation_id", reservation.id).maybeSingle();
      if (existing) {
        results.push({ reservation_id: reservation.id, sent: false, reason: "already_sent" });
        continue;
      }

      const contact = await findOrCreateContact(reservation);
      const channel = contact?.channel ?? (reservation.contact_email ? "email" : "unsupported");
      if (channel !== "email") {
        results.push({ reservation_id: reservation.id, sent: false, reason: "Only email NPS is implemented in this deployment" });
        continue;
      }

      const email = contact?.email ?? reservation.contact_email;
      if (!email) {
        results.push({ reservation_id: reservation.id, sent: false, reason: "no_email" });
        continue;
      }

      const text = renderTemplate(cfg, reservation);
      const { data: npsRow, error: insertError } = await admin.from("nps_responses").insert([{
        contact_id: contact?.id ?? null,
        reservation_id: reservation.id,
        guest_name: reservation.guest_name,
        channel: "email",
        score: null,
        comment: null,
        sent_at: new Date().toISOString(),
        responded_at: null,
      }]).select("id").single();
      if (insertError) {
        results.push({ reservation_id: reservation.id, sent: false, reason: insertError.message });
        continue;
      }

      try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
          method: "POST",
          headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            to: email,
            subject: `Pesquisa de satisfacao - ${cfg.hotel_name || "Hotel"}`,
            body: text,
          }),
        });
        const sendResult = await response.json().catch(() => ({}));
        if (!response.ok || !sendResult.sent) throw new Error(sendResult.error || "send-email failed");
        results.push({ reservation_id: reservation.id, sent: true });
      } catch (error) {
        await admin.from("nps_responses").delete().eq("id", (npsRow as { id: string }).id);
        results.push({ reservation_id: reservation.id, sent: false, reason: error instanceof Error ? error.message : "send failed" });
      }
    }

    return json({ processed: reservations.length, sent: results.filter(r => r.sent).length, results });
  } catch (error) {
    const status = error instanceof Error && error.message === "Forbidden" ? 403 : 500;
    return json({ error: error instanceof Error ? error.message : "Unexpected" }, status);
  }
});

async function assertStaff(authHeader: string) {
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token || !SUPABASE_ANON_KEY) throw new Error("Forbidden");
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) throw new Error("Forbidden");
  const { data: profile } = await admin.from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
  const role = String((profile as { role?: string } | null)?.role ?? "");
  if (!["admin", "manager", "marketing", "reservations", "reception"].includes(role)) throw new Error("Forbidden");
}

async function loadConfig(): Promise<NpsConfig> {
  const defaults: NpsConfig = { enabled: false, send_after_hours: 24, message_template: DEFAULT_TEMPLATE };
  const { data } = await admin.from("app_settings").select("value").eq("id", "nps_config").maybeSingle();
  if (!data?.value) return defaults;
  try {
    const parsed = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

async function loadEligibleReservations(cfg: NpsConfig, reservationId?: string): Promise<Reservation[]> {
  let query = admin
    .from("reservations")
    .select("id, guest_name, check_out, status, contact_phone, contact_email")
    .eq("status", "CHECKED_OUT")
    .order("check_out", { ascending: false })
    .limit(50);

  if (reservationId) {
    query = admin
      .from("reservations")
      .select("id, guest_name, check_out, status, contact_phone, contact_email")
      .eq("id", reservationId)
      .limit(1);
  } else {
    const cutoffDate = new Date(Date.now() - (cfg.send_after_hours ?? 24) * 3600 * 1000).toISOString().slice(0, 10);
    query = query.lte("check_out", cutoffDate);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Reservation[];
}

async function findOrCreateContact(reservation: Reservation) {
  if (reservation.contact_email) {
    const { data } = await admin.from("marketing_contacts").select("id, name, email, phone, channel").eq("email", reservation.contact_email).maybeSingle();
    if (data) return data as { id: string; name: string | null; email: string | null; phone: string | null; channel: string };
  }
  if (reservation.contact_phone) {
    const { data } = await admin.from("marketing_contacts").select("id, name, email, phone, channel").eq("phone", reservation.contact_phone).maybeSingle();
    if (data) return data as { id: string; name: string | null; email: string | null; phone: string | null; channel: string };
  }
  if (!reservation.contact_email && !reservation.contact_phone) return null;
  const { data } = await admin.from("marketing_contacts").insert([{
    name: reservation.guest_name,
    email: reservation.contact_email,
    phone: reservation.contact_phone,
    channel: reservation.contact_email ? "email" : "whatsapp",
    status: "new",
    last_message: "NPS enviado",
    last_message_at: new Date().toISOString(),
  }]).select("id, name, email, phone, channel").single();
  return data as { id: string; name: string | null; email: string | null; phone: string | null; channel: string } | null;
}

function renderTemplate(cfg: NpsConfig, reservation: Reservation) {
  return cfg.message_template
    .replaceAll("{{guest_name}}", (reservation.guest_name || "hospede").split(" ")[0])
    .replaceAll("{{hotel_name}}", cfg.hotel_name || "nosso hotel");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
