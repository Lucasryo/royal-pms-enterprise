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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseDate(value: unknown): string {
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

type Rate = {
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

function pickRate(rates: Rate[], dateISO: string): Rate | null {
  const candidates = rates.filter((r) => r.start_date <= dateISO && r.end_date >= dateISO);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.priority - a.priority);
  return candidates[0];
}

async function checkAvailability(category: string, checkIn: string, checkOut: string) {
  const dates = iterDates(checkIn, checkOut);

  // Verifica bloqueios manuais antes de checar inventario
  const { data: blockedRows } = await adminClient
    .from("booking_blocked_dates")
    .select("start_date, end_date, reason, category")
    .eq("active", true)
    .lte("start_date", checkOut)
    .gte("end_date", checkIn)
    .or(`category.is.null,category.eq.${category}`);

  type BlockedRow = { start_date: string; end_date: string; reason: string | null };
  const blocked = (blockedRows ?? []) as BlockedRow[];
  const blockedDatesInRange = dates.filter((d) =>
    blocked.some((b) => b.start_date <= d && b.end_date >= d)
  );

  if (blockedDatesInRange.length > 0) {
    const firstBlock = blocked.find((b) => b.start_date <= blockedDatesInRange[0] && b.end_date >= blockedDatesInRange[0]);
    return {
      available: false,
      min_left: 0,
      total: 0,
      full_dates: blockedDatesInRange,
      reason: firstBlock?.reason
        ? `Reservas bloqueadas para este periodo: ${firstBlock.reason}`
        : `Reservas bloqueadas para ${blockedDatesInRange.length} data(s) do periodo.`,
      blocked: true,
    };
  }

  // Inventario total da categoria
  const { data: roomRows } = await adminClient
    .from("rooms")
    .select("id")
    .eq("category", category)
    .eq("is_virtual", false);
  const total = (roomRows || []).length;

  if (total === 0) {
    return { available: false, min_left: 0, total: 0, full_dates: [] as string[], reason: "Categoria sem inventario cadastrado.", blocked: false };
  }

  // Reservas + requests que sobrepoem o range (categoria + status validos)
  const [resvRes, reqRes] = await Promise.all([
    adminClient
      .from("reservations")
      .select("check_in, check_out, status")
      .eq("category", category)
      .neq("status", "CANCELLED")
      .lte("check_in", checkOut)
      .gt("check_out", checkIn),
    adminClient
      .from("reservation_requests")
      .select("check_in, check_out, status")
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

  for (const date of dates) {
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
    blocked: false,
  };
}

export async function quote(body: any) {
  const checkIn = parseDate(body?.check_in);
  const checkOut = parseDate(body?.check_out);
  const category = String(body?.category ?? "").trim().toLowerCase();
  const adults = clampNumber(body?.adults, 1, 12, 1);
  const children = clampNumber(body?.children, 0, 12, 0);
  const guests = adults + children;

  if (!checkIn || !checkOut) return { ok: false, error: "check_in e check_out obrigatorios" };
  if (checkOut <= checkIn) return { ok: false, error: "check_out deve ser depois de check_in" };
  if (!["executivo", "master", "suite presidencial"].includes(category)) {
    return { ok: false, error: "categoria invalida" };
  }

  const dates = iterDates(checkIn, checkOut);
  const nights = dates.length;

  // Check de disponibilidade antes de calcular preco
  const availability = await checkAvailability(category, checkIn, checkOut);
  if (!availability.available) {
    return {
      ok: true,
      available: false,
      nights,
      reason: availability.reason,
      sold_out: true,
      full_dates: availability.full_dates,
      slots_left: 0,
    };
  }

  const { data: rates, error } = await adminClient
    .from("public_rates")
    .select("id, category, label, start_date, end_date, weekday_rate, weekend_rate, guests_included, extra_guest_fee, min_nights, priority")
    .eq("category", category)
    .eq("active", true)
    .lte("start_date", checkOut)
    .gte("end_date", checkIn);

  if (error) return { ok: false, error: error.message };

  const breakdown: Array<{ date: string; rate: number; label: string; weekend: boolean }> = [];
  let nightlyTotal = 0;
  let extraGuestTotal = 0;
  let minNightsRequired = 1;
  let lastRateGuestsIncluded = 0;

  for (const date of dates) {
    const rate = pickRate((rates ?? []) as Rate[], date);
    if (!rate) {
      return {
        ok: true,
        available: false,
        nights,
        reason: `Nao ha tarifa publica vigente para ${date}. Solicite cotacao manual e nossa central confirma o valor.`,
      };
    }
    const weekend = isWeekend(date);
    const dayRate = weekend && rate.weekend_rate != null ? Number(rate.weekend_rate) : Number(rate.weekday_rate);
    nightlyTotal += dayRate;
    breakdown.push({ date, rate: dayRate, label: rate.label, weekend });
    minNightsRequired = Math.max(minNightsRequired, rate.min_nights);
    const extra = Math.max(0, guests - rate.guests_included);
    extraGuestTotal += extra * Number(rate.extra_guest_fee);
    lastRateGuestsIncluded = rate.guests_included;
  }

  if (nights < minNightsRequired) {
    return {
      ok: true,
      available: false,
      nights,
      reason: `Estadia minima e de ${minNightsRequired} noite(s) para o periodo selecionado.`,
    };
  }

  const total = nightlyTotal + extraGuestTotal;

  return {
    ok: true,
    available: true,
    nights,
    total,
    nightly_total: nightlyTotal,
    extra_guest_total: extraGuestTotal,
    extra_guests: Math.max(0, guests - lastRateGuestsIncluded),
    breakdown,
    currency: "BRL",
    slots_left: availability.min_left,
    inventory_total: availability.total,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Quote engine not configured" }, 500);

  try {
    const body = await req.json();
    const result = await quote(body);
    return json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return json({ error: msg }, 500);
  }
});
