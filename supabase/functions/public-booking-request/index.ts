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

    // Check de disponibilidade ANTES de aceitar a reserva — evita overbooking
    const availability = await checkAvailability(category.toLowerCase(), checkIn, checkOut);
    if (!availability.available) {
      // Notifica time de reservas sobre tentativa bloqueada (lost demand)
      const { data: reservationTeam } = await adminClient
        .from("profiles")
        .select("id")
        .in("role", ["admin", "reservations"]);
      if (reservationTeam?.length) {
        await adminClient.from("notifications").insert(
          reservationTeam.map((member: { id: string }) => ({
            user_id: member.id,
            title: "Tentativa de reserva bloqueada (lotado)",
            message: `${guestName} (${contactEmail}, ${contactPhone}) tentou reservar ${category} de ${checkIn} a ${checkOut} — sem disponibilidade. Possivel oportunidade comercial.`,
            link: "/dashboard",
            read: false,
            timestamp: new Date().toISOString(),
          })),
        );
      }
      return json({
        blocked: true,
        sold_out: true,
        reason: availability.reason,
        full_dates: availability.full_dates,
      });
    }

    // Calcula tarifa com base em public_rates antes de gravar
    const quoteResult = await computeQuote({
      checkIn,
      checkOut,
      category: category.toLowerCase(),
      adults,
      children,
    });

    const reservationCode = `WEB-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const billingObs = [
      "Origem: WEB-DIRETO",
      `Email: ${contactEmail}`,
      `Telefone: ${contactPhone}`,
      `Adultos: ${adults}`,
      `Criancas: ${children}`,
      quoteResult.available
        ? `Tarifa calculada: R$ ${quoteResult.total.toFixed(2)} (${quoteResult.nights} noite(s))`
        : `Tarifa: COTACAO MANUAL (${quoteResult.reason ?? "sem tarifa publica vigente"})`,
      notes ? `Observacoes: ${notes}` : "",
    ].filter(Boolean).join("\n");

    const computedTotal = quoteResult.available ? Number(quoteResult.total.toFixed(2)) : 0;
    const computedTariff = quoteResult.available && quoteResult.nights > 0
      ? Number((quoteResult.nightly_total / quoteResult.nights).toFixed(2))
      : 0;

    const { error } = await adminClient.from("reservation_requests").insert([{
      guest_name: guestName,
      check_in: checkIn,
      check_out: checkOut,
      status: "REQUESTED",
      company_id: null,
      total_amount: computedTotal,
      reservation_code: reservationCode,
      cost_center: "WEB-DIRETO",
      billing_obs: billingObs,
      tariff: computedTariff,
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
      const quoteSummary = quoteResult.available
        ? `Tarifa estimada R$ ${quoteResult.total.toFixed(2)} (${quoteResult.nights} noite(s)).`
        : "Sem tarifa publica vigente — cotacao manual necessaria.";
      await adminClient.from("notifications").insert(
        reservationTeam.map((member: { id: string }) => ({
          user_id: member.id,
          title: "Nova reserva publica",
          message: `${guestName} solicitou reserva direta (${reservationCode}) para ${checkIn}. ${quoteSummary}`,
          link: "/dashboard",
          read: false,
          timestamp: new Date().toISOString(),
        })),
      );
    }

    return json({
      reservation_code: reservationCode,
      quote: quoteResult,
    });
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

type RateRow = {
  id: string;
  category: string;
  label: string;
  start_date: string;
  end_date: string;
  weekday_rate: number;
  weekend_rate: number | null;
  guests_included: number;
  extra_guest_fee: number;
  min_nights: number;
  priority: number;
};

type QuoteResult =
  | { available: true; nights: number; total: number; nightly_total: number; extra_guest_total: number; breakdown: Array<{ date: string; rate: number; label: string; weekend: boolean }>; reason?: undefined }
  | { available: false; nights: number; total: 0; nightly_total: 0; extra_guest_total: 0; breakdown: []; reason: string };

function iterDates(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  const start = new Date(`${startISO}T12:00:00Z`);
  const end = new Date(`${endISO}T12:00:00Z`);
  for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function isWeekend(dateISO: string): boolean {
  const d = new Date(`${dateISO}T12:00:00Z`).getUTCDay();
  return d === 5 || d === 6;
}

function pickRate(rates: RateRow[], dateISO: string): RateRow | null {
  const candidates = rates.filter((r) => r.start_date <= dateISO && r.end_date >= dateISO);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.priority - a.priority);
  return candidates[0];
}

async function computeQuote(args: { checkIn: string; checkOut: string; category: string; adults: number; children: number }): Promise<QuoteResult> {
  const dates = iterDates(args.checkIn, args.checkOut);
  const nights = dates.length;
  const guests = args.adults + args.children;

  if (!["executivo", "master", "suite presidencial"].includes(args.category)) {
    return { available: false, nights, total: 0, nightly_total: 0, extra_guest_total: 0, breakdown: [], reason: "Categoria nao reconhecida pela tabela de tarifas." };
  }

  const { data: rates, error } = await adminClient
    .from("public_rates")
    .select("id, category, label, start_date, end_date, weekday_rate, weekend_rate, guests_included, extra_guest_fee, min_nights, priority")
    .eq("category", args.category)
    .eq("active", true)
    .lte("start_date", args.checkOut)
    .gte("end_date", args.checkIn);

  if (error) {
    return { available: false, nights, total: 0, nightly_total: 0, extra_guest_total: 0, breakdown: [], reason: error.message };
  }

  const breakdown: Array<{ date: string; rate: number; label: string; weekend: boolean }> = [];
  let nightlyTotal = 0;
  let extraGuestTotal = 0;
  let minNightsRequired = 1;

  for (const date of dates) {
    const rate = pickRate((rates ?? []) as RateRow[], date);
    if (!rate) {
      return { available: false, nights, total: 0, nightly_total: 0, extra_guest_total: 0, breakdown: [], reason: `Sem tarifa publica vigente para ${date}.` };
    }
    const weekend = isWeekend(date);
    const dayRate = weekend && rate.weekend_rate != null ? Number(rate.weekend_rate) : Number(rate.weekday_rate);
    nightlyTotal += dayRate;
    breakdown.push({ date, rate: dayRate, label: rate.label, weekend });
    minNightsRequired = Math.max(minNightsRequired, rate.min_nights);
    const extra = Math.max(0, guests - rate.guests_included);
    extraGuestTotal += extra * Number(rate.extra_guest_fee);
  }

  if (nights < minNightsRequired) {
    return { available: false, nights, total: 0, nightly_total: 0, extra_guest_total: 0, breakdown: [], reason: `Estadia minima ${minNightsRequired} noite(s).` };
  }

  return { available: true, nights, total: nightlyTotal + extraGuestTotal, nightly_total: nightlyTotal, extra_guest_total: extraGuestTotal, breakdown };
}

async function checkAvailability(category: string, checkIn: string, checkOut: string): Promise<{ available: boolean; min_left: number; total: number; full_dates: string[]; reason: string }> {
  const { data: roomRows } = await adminClient
    .from("rooms")
    .select("id")
    .eq("category", category)
    .eq("is_virtual", false);
  const total = (roomRows || []).length;

  if (total === 0) {
    return { available: false, min_left: 0, total: 0, full_dates: [], reason: "Categoria sem inventario cadastrado." };
  }

  const [resvRes, reqRes] = await Promise.all([
    adminClient
      .from("reservations")
      .select("check_in, check_out")
      .eq("category", category)
      .neq("status", "CANCELLED")
      .lte("check_in", checkOut)
      .gt("check_out", checkIn),
    adminClient
      .from("reservation_requests")
      .select("check_in, check_out")
      .eq("category", category)
      .neq("status", "REJECTED")
      .lte("check_in", checkOut)
      .gt("check_out", checkIn),
  ]);

  type Booked = { check_in: string; check_out: string };
  const all: Booked[] = [
    ...((resvRes.data || []) as Booked[]),
    ...((reqRes.data || []) as Booked[]),
  ];

  let minLeft = total;
  const fullDates: string[] = [];
  for (const date of iterDates(checkIn, checkOut)) {
    const occupied = all.filter((r) => r.check_in <= date && r.check_out > date).length;
    const left = total - occupied;
    if (left < minLeft) minLeft = left;
    if (left <= 0) fullDates.push(date);
  }

  return {
    available: minLeft > 0,
    min_left: Math.max(0, minLeft),
    total,
    full_dates: fullDates,
    reason: fullDates.length > 0
      ? `Sem disponibilidade nesta categoria para ${fullDates.length} data(s) do periodo.`
      : "",
  };
}
