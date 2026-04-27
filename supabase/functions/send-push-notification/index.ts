import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return json({ error: "VAPID keys not configured" }, 500);
  }

  webpush.setVapidDetails(
    "mailto:pms@royalhotel.com",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  );

  try {
    const body = await req.json();
    const user_id: string | null = body?.user_id ?? null;
    const title: string = String(body?.title ?? "Royal PMS").slice(0, 100);
    const message: string = String(body?.message ?? "").slice(0, 300);
    const link: string = String(body?.link ?? "/").slice(0, 200);
    const tag: string = String(body?.tag ?? "royal-pms").slice(0, 50);

    if (!user_id) return json({ error: "user_id obrigatorio" }, 400);

    const { data: subs, error } = await adminClient
      .from("push_subscriptions")
      .select("id, subscription")
      .eq("user_id", user_id);

    if (error) return json({ error: error.message }, 500);
    if (!subs || subs.length === 0) return json({ ok: true, sent: 0, reason: "sem subscricoes" });

    const payload = JSON.stringify({ title, message, link, tag });
    const results = await Promise.allSettled(
      subs.map(async (row: { id: string; subscription: unknown }) => {
        try {
          await webpush.sendNotification(row.subscription as webpush.PushSubscription, payload);
          return { id: row.id, ok: true };
        } catch (err: unknown) {
          // Subscription expirada ou invalida — remove do banco
          const status = (err as { statusCode?: number })?.statusCode;
          if (status === 404 || status === 410) {
            await adminClient.from("push_subscriptions").delete().eq("id", row.id);
          }
          return { id: row.id, ok: false, status };
        }
      }),
    );

    const sent = results.filter((r) => r.status === "fulfilled" && (r.value as { ok: boolean }).ok).length;
    return json({ ok: true, sent, total: subs.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
