// supabase/functions/webhook-meta/index.ts
//
// Required environment variables:
//   WEBHOOK_META_VERIFY_TOKEN  — custom token configured in Meta Developer Portal
//   WEBHOOK_META_APP_SECRET    — Meta App Secret used to validate X-Hub-Signature-256
//   SUPABASE_URL               — auto-injected by Supabase
//   SUPABASE_SERVICE_ROLE_KEY  — auto-injected by Supabase

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERIFY_TOKEN = Deno.env.get("WEBHOOK_META_VERIFY_TOKEN") ?? "";
const APP_SECRET   = Deno.env.get("WEBHOOK_META_APP_SECRET")   ?? "";
const SUPA_URL     = Deno.env.get("SUPABASE_URL")              ?? "";
const SUPA_KEY     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const db = createClient(SUPA_URL, SUPA_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// ── HMAC-SHA256 signature verification ──────────────────────────────────────
async function verifySignature(rawBody: Uint8Array, signatureHeader: string | null): Promise<boolean> {
  if (!signatureHeader || !APP_SECRET) return false;
  // Header format: "sha256=<hex>"
  const parts = signatureHeader.split("=");
  if (parts.length !== 2 || parts[0] !== "sha256") return false;
  const expectedHex = parts[1];

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, rawBody);
  const computedHex = Array.from(new Uint8Array(sigBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison
  if (computedHex.length !== expectedHex.length) return false;
  let mismatch = 0;
  for (let i = 0; i < computedHex.length; i++) {
    mismatch |= computedHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  }
  return mismatch === 0;
}

// ── Channel resolver ─────────────────────────────────────────────────────────
function resolveChannel(object: string): string {
  if (object === "whatsapp") return "whatsapp";
  if (object === "instagram") return "instagram";
  return "facebook";
}

// ── Upsert contact ───────────────────────────────────────────────────────────
async function upsertContact(opts: {
  phone?: string;
  sourceId?: string;
  channel: string;
}) {
  const { phone, sourceId, channel } = opts;
  if (!phone && !sourceId) return;

  const matchColumn = phone ? "phone" : "source_id";
  const matchValue  = phone ?? sourceId!;

  // Try to find existing record
  const { data: existing } = await db
    .from("marketing_contacts")
    .select("id, total_conversations")
    .eq(matchColumn, matchValue)
    .maybeSingle();

  if (existing) {
    await db
      .from("marketing_contacts")
      .update({
        last_contact_at: new Date().toISOString(),
        total_conversations: (existing.total_conversations ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await db.from("marketing_contacts").insert({
      phone: phone ?? null,
      channel,
      source: matchColumn === "source_id" ? `${channel}:${sourceId}` : null,
      total_conversations: 1,
      last_contact_at: new Date().toISOString(),
    });
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);

  // ── GET: Meta webhook verification ─────────────────────────────────────────
  if (req.method === "GET") {
    const mode      = url.searchParams.get("hub.mode");
    const token     = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
      return new Response(challenge, {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
      });
    }
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  // ── POST: Incoming messages ─────────────────────────────────────────────────
  if (req.method === "POST") {
    const rawBody = new Uint8Array(await req.arrayBuffer());
    const signatureHeader = req.headers.get("x-hub-signature-256");

    const valid = await verifySignature(rawBody, signatureHeader);
    if (!valid) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(new TextDecoder().decode(rawBody));
    } catch {
      // Always return 200 to Meta even on parse errors
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    const object  = (body.object as string) ?? "";
    const channel = resolveChannel(object);
    const entries = (body.entry as Array<Record<string, unknown>>) ?? [];

    for (const entry of entries) {
      // ── WhatsApp format ──────────────────────────────────────────────────
      if (channel === "whatsapp") {
        const changes = (entry.changes as Array<Record<string, unknown>>) ?? [];
        for (const change of changes) {
          const value    = (change.value as Record<string, unknown>) ?? {};
          const messages = (value.messages as Array<Record<string, unknown>>) ?? [];
          for (const msg of messages) {
            const from = msg.from as string | undefined;
            if (from) {
              await upsertContact({ phone: from, channel });
            }
          }
        }
      }

      // ── Instagram / Facebook (messaging) format ──────────────────────────
      if (channel === "instagram" || channel === "facebook") {
        const messaging = (entry.messaging as Array<Record<string, unknown>>) ?? [];
        for (const event of messaging) {
          const sender   = (event.sender as Record<string, unknown>) ?? {};
          const senderId = sender.id as string | undefined;
          if (senderId) {
            await upsertContact({ sourceId: senderId, channel });
          }
        }
      }
    }

    // Meta requires HTTP 200 within 20 s — always respond immediately
    return new Response("OK", { status: 200, headers: corsHeaders });
  }

  return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
});
