import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const NOMINATIM_ENDPOINT = Deno.env.get("NOMINATIM_ENDPOINT") ?? "https://nominatim.openstreetmap.org/search";
const USER_AGENT = Deno.env.get("NOMINATIM_USER_AGENT") ?? "RoyalPMS-Enterprise/1.0 (rate-shopper)";

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ALLOWED_ROLES = new Set(["admin", "manager", "reservations"]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Supabase secrets are not configured." }, 500);

  try {
    const authHeader = req.headers.get("Authorization");
    const jwt = authHeader?.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Missing bearer token." }, 401);

    const { data: userData, error: authError } = await adminClient.auth.getUser(jwt);
    if (authError || !userData.user) return json({ error: "Invalid session." }, 401);

    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (!ALLOWED_ROLES.has(profile?.role ?? "")) {
      return json({ error: "You do not have permission to locate competitors." }, 403);
    }

    const body = await req.json();
    const city = cleanText(body?.city, 120);
    if (city.length < 2) return json({ error: "city is required." }, 400);

    const url = new URL(NOMINATIM_ENDPOINT);
    url.searchParams.set("q", `hotel ${city}`);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "10");

    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.7",
      },
    });

    if (!response.ok) {
      return json({ error: `Locator failed with ${response.status}` }, 502);
    }

    const raw = await response.json();
    const rows = Array.isArray(raw) ? raw : [];
    const seen = new Set<string>();
    const competitors = rows
      .map((item: any) => normalizeResult(item, city))
      .filter((item) => {
        const key = `${item.name}|${item.latitude}|${item.longitude}`;
        if (!item.name || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 8);

    return json({ competitors, source: "nominatim" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeResult(item: any, requestedCity: string) {
  const address = item?.address || {};
  const city = address.city || address.town || address.village || address.municipality || requestedCity;
  const name = cleanText(item?.name || item?.display_name?.split(",")?.[0] || "Hotel sem nome", 160);

  return {
    name,
    city: cleanText(city, 120),
    locality: cleanText(address.suburb || address.neighbourhood || address.city_district || "", 120),
    address: cleanText(item?.display_name || "", 500),
    latitude: Number(item?.lat),
    longitude: Number(item?.lon),
    source: "nominatim",
  };
}
