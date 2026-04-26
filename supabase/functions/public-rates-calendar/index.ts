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

function iterDates(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  const start = new Date(`${startISO}T12:00:00Z`);
  const end = new Date(`${endISO}T12:00:00Z`);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Calendar engine not configured" }, 500);

  try {
    const body = await req.json();
    const startDate = parseDate(body?.start_date);
    const endDate = parseDate(body?.end_date);
    const category = String(body?.category ?? "").trim().toLowerCase();

    if (!startDate || !endDate) return json({ ok: false, error: "start_date e end_date obrigatorios" });
    if (endDate < startDate) return json({ ok: false, error: "end_date deve ser >= start_date" });
    if (!["executivo", "master", "suite presidencial"].includes(category)) {
      return json({ ok: false, error: "categoria invalida" });
    }

    // Limita range a 6 meses para evitar payload excessivo
    const startMs = new Date(`${startDate}T00:00:00Z`).getTime();
    const endMs = new Date(`${endDate}T00:00:00Z`).getTime();
    const maxDays = 200;
    const days = Math.ceil((endMs - startMs) / 86400000) + 1;
    if (days > maxDays) {
      return json({ ok: false, error: `Range maximo ${maxDays} dias` });
    }

    const { data: rates, error } = await adminClient
      .from("public_rates")
      .select("id, category, label, start_date, end_date, weekday_rate, weekend_rate, guests_included, extra_guest_fee, min_nights, priority")
      .eq("category", category)
      .eq("active", true)
      .lte("start_date", endDate)
      .gte("end_date", startDate);

    if (error) return json({ ok: false, error: error.message });

    const rates_by_date: Record<string, { rate: number; weekend: boolean; label: string; min_nights: number }> = {};
    let minRate: number | null = null;
    let maxRate: number | null = null;

    for (const date of iterDates(startDate, endDate)) {
      const rate = pickRate((rates ?? []) as Rate[], date);
      if (!rate) continue;
      const weekend = isWeekend(date);
      const value = weekend && rate.weekend_rate != null ? Number(rate.weekend_rate) : Number(rate.weekday_rate);
      rates_by_date[date] = { rate: value, weekend, label: rate.label, min_nights: rate.min_nights };
      if (minRate == null || value < minRate) minRate = value;
      if (maxRate == null || value > maxRate) maxRate = value;
    }

    return json({
      ok: true,
      rates_by_date,
      min_rate: minRate,
      max_rate: maxRate,
      currency: "BRL",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return json({ ok: false, error: msg }, 500);
  }
});
