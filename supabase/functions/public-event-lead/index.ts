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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Event lead capture is not configured." }, 500);

  try {
    const body = await req.json();
    const leadId = cleanUuid(body?.lead_id);
    const status = cleanStatus(body?.status);
    const customerName = cleanText(body?.customer_name, 140);
    const customerEmail = cleanEmail(body?.customer_email);
    const customerPhone = cleanText(body?.customer_phone, 40);
    const companyName = cleanText(body?.company_name, 160);
    const eventName = cleanText(body?.event_name, 160);
    const eventType = cleanText(body?.event_type || "Corporativo", 80);
    const eventDate = cleanDate(body?.event_date);
    const alternateDate = cleanDate(body?.alternate_date);
    const startTime = cleanText(body?.start_time, 20);
    const attendeesCount = clampNumber(body?.attendees_count, 0, 2000, 0);
    const hallPreference = cleanText(body?.hall_preference, 120);
    const budgetRange = cleanText(body?.budget_range, 80);
    const notes = cleanText(body?.notes, 1600);
    const pageUrl = cleanText(body?.page_url, 500);
    const utmSource = cleanText(body?.utm_source, 100);
    const utmMedium = cleanText(body?.utm_medium, 100);
    const utmCampaign = cleanText(body?.utm_campaign, 140);

    if (!customerName || (!customerEmail && !customerPhone)) {
      return json({ error: "Nome e pelo menos um contato sao obrigatorios." }, 400);
    }

    const contact = await upsertMarketingContact({
      name: customerName,
      email: customerEmail,
      phone: customerPhone,
      status,
      eventType,
      eventDate,
      attendeesCount,
      companyName,
      notes,
    });

    let previousStatus = "";
    if (leadId) {
      const { data } = await adminClient
        .from("public_event_leads")
        .select("status")
        .eq("id", leadId)
        .maybeSingle();
      previousStatus = data?.status ?? "";
    }

    const score = computeScore({ status, customerEmail, customerPhone, eventDate, attendeesCount, budgetRange, notes });
    const payload = {
      contact_id: contact?.id ?? null,
      status,
      lead_score: score,
      customer_name: customerName,
      customer_email: customerEmail || null,
      customer_phone: customerPhone || null,
      company_name: companyName || null,
      event_name: eventName || null,
      event_type: eventType || null,
      event_date: eventDate || null,
      alternate_date: alternateDate || null,
      start_time: startTime || null,
      attendees_count: attendeesCount || null,
      hall_preference: hallPreference || null,
      budget_range: budgetRange || null,
      notes: notes || null,
      source: "landing_events",
      utm_source: utmSource || null,
      utm_medium: utmMedium || null,
      utm_campaign: utmCampaign || null,
      page_url: pageUrl || null,
      last_activity_at: new Date().toISOString(),
      submitted_at: status === "submitted" ? new Date().toISOString() : undefined,
      raw_payload: body ?? {},
      updated_at: new Date().toISOString(),
    };

    const query = leadId
      ? adminClient.from("public_event_leads").update(payload).eq("id", leadId).select("id,status,lead_score").single()
      : adminClient.from("public_event_leads").insert([payload]).select("id,status,lead_score").single();
    const { data: lead, error } = await query;
    if (error) return json({ error: error.message }, 500);

    const shouldNotify =
      status === "submitted" ||
      (status === "abandoned" && previousStatus !== "abandoned" && previousStatus !== "submitted");
    if (shouldNotify) {
      await notifyEventTeam({
        customerName,
        customerEmail,
        customerPhone,
        eventType,
        eventDate,
        attendeesCount,
        status,
        score,
      });
    }

    return json({ lead_id: lead.id, status: lead.status, lead_score: lead.lead_score });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return json({ error: message }, 500);
  }
});

async function upsertMarketingContact(args: {
  name: string;
  email: string;
  phone: string;
  status: string;
  eventType: string;
  eventDate: string;
  attendeesCount: number;
  companyName: string;
  notes: string;
}) {
  const identifier = args.email || args.phone;
  if (!identifier) return null;

  const lastMessage = [
    args.status === "submitted" ? "Solicitou cotacao de evento pela landing" : "Abandonou interesse em evento na landing",
    args.eventType ? `Tipo: ${args.eventType}` : "",
    args.eventDate ? `Data: ${args.eventDate}` : "",
    args.attendeesCount ? `${args.attendeesCount} pessoas` : "",
  ].filter(Boolean).join(" - ");

  const base = {
    name: args.name,
    email: args.email || null,
    phone: args.phone || null,
    channel: "landing_eventos",
    status: args.status === "submitted" ? "new" : "needs_human",
    sentiment: "neutral",
    last_message: lastMessage,
    last_message_at: new Date().toISOString(),
    unread_count: 1,
    tags: ["eventos", "landing", args.status === "submitted" ? "cotacao" : "remarketing"],
    internal_notes: [
      args.companyName ? `Empresa: ${args.companyName}` : "",
      args.notes ? `Observacoes: ${args.notes}` : "",
    ].filter(Boolean).join("\n") || null,
    updated_at: new Date().toISOString(),
  };

  const existingQuery = args.email
    ? adminClient.from("marketing_contacts").select("id").eq("email", args.email).limit(1)
    : adminClient.from("marketing_contacts").select("id").eq("phone", args.phone).limit(1);
  const { data: existingRows } = await existingQuery;
  const existing = existingRows?.[0];

  if (existing?.id) {
    const { data } = await adminClient
      .from("marketing_contacts")
      .update(base)
      .eq("id", existing.id)
      .select("id")
      .single();
    return data;
  }

  const { data } = await adminClient
    .from("marketing_contacts")
    .insert([{ ...base, created_at: new Date().toISOString() }])
    .select("id")
    .single();
  return data;
}

async function notifyEventTeam(args: {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  eventType: string;
  eventDate: string;
  attendeesCount: number;
  status: string;
  score: number;
}) {
  const { data: team } = await adminClient
    .from("profiles")
    .select("id")
    .in("role", ["admin", "manager", "eventos", "marketing"]);
  if (!team?.length) return;

  const title = args.status === "submitted" ? "Nova cotacao de evento pela landing" : "Lead de evento abandonado";
  const action = args.status === "submitted" ? "solicitou cotacao" : "deixou dados e saiu antes de concluir";
  const contact = [args.customerEmail, args.customerPhone].filter(Boolean).join(" / ");
  const message = `${args.customerName} ${action}. ${args.eventType || "Evento"} ${args.eventDate ? `em ${args.eventDate}` : ""} ${args.attendeesCount ? `para ${args.attendeesCount} pessoas` : ""}. Contato: ${contact}. Score ${args.score}.`;

  await adminClient.from("notifications").insert(
    team.map((member: { id: string }) => ({
      user_id: member.id,
      title,
      message,
      link: "/dashboard",
      read: false,
      timestamp: new Date().toISOString(),
    })),
  );
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function cleanEmail(value: unknown) {
  const email = cleanText(value, 160).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function cleanDate(value: unknown) {
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function cleanUuid(value: unknown) {
  const text = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : "";
}

function cleanStatus(value: unknown) {
  const status = cleanText(value, 20);
  return ["draft", "abandoned", "submitted"].includes(status) ? status : "abandoned";
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function computeScore(args: { status: string; customerEmail: string; customerPhone: string; eventDate: string; attendeesCount: number; budgetRange: string; notes: string }) {
  let score = args.status === "submitted" ? 70 : 38;
  if (args.customerEmail) score += 5;
  if (args.customerPhone) score += 10;
  if (args.eventDate) score += 8;
  if (args.attendeesCount >= 80) score += 8;
  if (args.budgetRange && !args.budgetRange.includes("definir")) score += 5;
  if (args.notes) score += 4;
  return Math.max(0, Math.min(100, score));
}
