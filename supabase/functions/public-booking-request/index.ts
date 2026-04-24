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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Booking engine is not configured." }, 500);
  }

  try {
    const body = await req.json();
    const guestName = cleanText(body?.guest_name, 120);
    const contactEmail = cleanEmail(body?.contact_email);
    const contactPhone = cleanText(body?.contact_phone, 40);
    const checkIn = cleanDate(body?.check_in);
    const checkOut = cleanDate(body?.check_out);
    const category = cleanText(body?.category || "executivo", 80);
    const notes = cleanText(body?.notes || "", 1200);
    const adults = clampNumber(body?.adults, 1, 12, 1);
    const children = clampNumber(body?.children, 0, 12, 0);
    const guestsPerUh = clampNumber(body?.guests_per_uh, 1, 24, adults + children);

    if (!guestName || !contactEmail || !contactPhone || !checkIn || !checkOut) {
      return json({ error: "Missing required booking fields." }, 400);
    }

    if (checkOut <= checkIn) {
      return json({ error: "check_out must be after check_in." }, 400);
    }

    const reservationCode = `WEB-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const billingObs = [
      "Origem: WEB-DIRETO",
      `Email: ${contactEmail}`,
      `Telefone: ${contactPhone}`,
      `Adultos: ${adults}`,
      `Criancas: ${children}`,
      notes ? `Observacoes: ${notes}` : "",
    ].filter(Boolean).join("\n");

    const { error } = await adminClient.from("reservation_requests").insert([{
      guest_name: guestName,
      check_in: checkIn,
      check_out: checkOut,
      status: "REQUESTED",
      company_id: null,
      total_amount: 0,
      reservation_code: reservationCode,
      cost_center: "WEB-DIRETO",
      billing_obs: billingObs,
      tariff: 0,
      category,
      guests_per_uh: guestsPerUh,
      contact_phone: contactPhone,
      contact_email: contactEmail,
      source: "WEB-DIRETO",
      adults,
      children,
      iss_tax: 0,
      service_tax: 0,
      payment_method: "BILLED",
      requested_by: guestName,
    }]);

    if (error) {
      return json({ error: error.message }, 500);
    }

    const { data: reservationTeam } = await adminClient
      .from("profiles")
      .select("id")
      .in("role", ["admin", "reservations"]);

    if (reservationTeam?.length) {
      await adminClient.from("notifications").insert(
        reservationTeam.map((member: { id: string }) => ({
          user_id: member.id,
          title: "Nova reserva publica",
          message: `${guestName} solicitou reserva direta (${reservationCode}) para ${checkIn}.`,
          link: "/dashboard",
          read: false,
          timestamp: new Date().toISOString(),
        })),
      );
    }

    return json({ reservation_code: reservationCode });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
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

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}
