import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function sha256Hex(text: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  return crypto.subtle.digest("SHA-256", data).then((hashBuffer) => {
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { pin } = body;

    if (!pin || typeof pin !== "string" || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return new Response(JSON.stringify({ error: "PIN must be 4 digits" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pinHash = await sha256Hex(pin);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Direct REST API call
    const apiUrl = `${supabaseUrl}/rest/v1/maintenance_floor_pins?pin_hash=eq.${pinHash}&is_active=eq.true&select=floor_number,attendant_name,attendant_number`;

    const dbRes = await fetch(apiUrl, {
      headers: {
        "apikey": serviceKey,
        "Authorization": `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
      },
    });

    const rows = await dbRes.json();

    if (!Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ valid: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = rows[0];
    return new Response(JSON.stringify({
      valid: true,
      floor_number: data.floor_number,
      attendant_name: data.attendant_name,
      attendant_number: data.attendant_number,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
