import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

type NpsConfig = {
  enabled: boolean;
  send_after_hours: number;
  message_template: string;
  hotel_name?: string;
};

const DEFAULT_TEMPLATE = "Olá {{guest_name}}! Aqui é o {{hotel_name}}. Esperamos que tenha gostado da estadia! Numa escala de 0 a 10, qual a chance de você nos recomendar pra um amigo? Responda com a nota (e fique à vontade pra deixar um comentário).";

async function loadConfig(): Promise<NpsConfig> {
  const { data } = await admin.from("app_settings").select("value").eq("id", "nps_config").maybeSingle();
  const defaults: NpsConfig = { enabled: false, send_after_hours: 24, message_template: DEFAULT_TEMPLATE };
  if (!data?.value) return defaults;
  try {
    const parsed = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
    return { ...defaults, ...parsed };
  } catch { return defaults; }
}

async function findContact(phone: string | null, email: string | null) {
  if (phone) {
    const { data } = await admin.from("marketing_contacts").select("id, channel, phone, email, name").eq("phone", phone).maybeSingle();
    if (data) return data;
  }
  if (email) {
    const { data } = await admin.from("marketing_contacts").select("id, channel, phone, email, name").eq("email", email).maybeSingle();
    if (data) return data;
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Aceita 2 modos: (1) cron interno via service role, (2) dispatch manual de uma reserva especifica
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${SERVICE_ROLE_KEY}`) return json({ error: "Forbidden" }, 403);

  let body: { reservation_id?: string; force?: boolean; dry_run?: boolean } = {};
  try { body = await req.json(); } catch { body = {}; }

  const cfg = await loadConfig();
  if (!cfg.enabled && !body.force) return json({ skipped: "NPS disabled" });

  // Seleciona reservations cujo checkout passou X horas atras
  const cutoffHours = cfg.send_after_hours ?? 24;
  const cutoffMs = Date.now() - cutoffHours * 3600 * 1000;
  const cutoffDate = new Date(cutoffMs).toISOString().slice(0, 10);

  let resQuery = admin.from("reservations").select("id, guest_name, check_out, status, contact_phone, contact_email").eq("status", "CHECKED_OUT").lte("check_out", cutoffDate);
  if (body.reservation_id) resQuery = admin.from("reservations").select("id, guest_name, check_out, status, contact_phone, contact_email").eq("id", body.reservation_id);

  const { data: reservations, error } = await resQuery.limit(50);
  if (error) return json({ error: error.message }, 500);
  const list = (reservations ?? []) as Array<{ id: string; guest_name: string | null; check_out: string; status: string; contact_phone: string | null; contact_email: string | null }>;

  const results: Array<{ reservation_id: string; sent: boolean; reason?: string }> = [];

  for (const r of list) {
    // Idempotencia: se ja tem nps_responses pra essa reserva, pula
    const { data: existing } = await admin.from("nps_responses").select("id").eq("reservation_id", r.id).maybeSingle();
    if (existing) { results.push({ reservation_id: r.id, sent: false, reason: "already_sent" }); continue; }

    const contact = await findContact(r.contact_phone, r.contact_email);
    const channel = contact?.channel ?? (r.contact_phone ? "whatsapp" : (r.contact_email ? "email" : null));
    const recipient = contact?.phone ?? r.contact_phone ?? contact?.email ?? r.contact_email ?? null;
    if (!channel || !recipient) { results.push({ reservation_id: r.id, sent: false, reason: "no_recipient" }); continue; }

    const text = cfg.message_template
      .replaceAll("{{guest_name}}", (r.guest_name || "hospede").split(" ")[0])
      .replaceAll("{{hotel_name}}", cfg.hotel_name || "nosso hotel");

    if (body.dry_run) {
      results.push({ reservation_id: r.id, sent: false, reason: `dry_run: would send to ${recipient} via ${channel}` });
      continue;
    }

    // Cria row pendente PRIMEIRO (pra dedupe se send falhar parcial)
    const { data: npsRow, error: npsErr } = await admin.from("nps_responses").insert([{
      contact_id: contact?.id ?? null,
      reservation_id: r.id,
      guest_name: r.guest_name,
      channel,
      score: null,
      comment: null,
      sent_at: new Date().toISOString(),
      responded_at: null,
    }]).select("id").single();
    if (npsErr) { results.push({ reservation_id: r.id, sent: false, reason: `db_insert: ${npsErr.message}` }); continue; }

    // Envia (text-only por enquanto)
    try {
      if (channel === "whatsapp" || channel === "instagram" || channel === "facebook") {
        const send = await fetch(`${SUPABASE_URL}/functions/v1/send-meta-message`, {
          method: "POST",
          headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ channel, recipient, text, contact_id: contact?.id }),
        });
        if (!send.ok) throw new Error(`send-meta-message ${send.status}: ${(await send.text()).slice(0, 200)}`);
      } else if (channel === "email") {
        // Email NPS: usa dispatch-campaign-like fluxo manual via send-email-message se existir; aqui marcamos pendente
        // Fallback: pula com aviso (email NPS requer dispatch separado)
        throw new Error("Email NPS dispatch nao implementado nesta versao");
      } else {
        throw new Error(`Canal nao suportado: ${channel}`);
      }
      results.push({ reservation_id: r.id, sent: true });
    } catch (err) {
      await admin.from("nps_responses").delete().eq("id", (npsRow as { id: string }).id);
      results.push({ reservation_id: r.id, sent: false, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  return json({ processed: list.length, sent: results.filter(r => r.sent).length, results });
});
