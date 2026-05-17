import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders, json, loadConfig, parseWhatsApp, upsertContactAndMessage, validateSignature, verifyChallenge } from "./shared.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const config = await loadConfig("whatsapp");

  // GET: Meta challenge verification.
  if (req.method === "GET") {
    const challenge = verifyChallenge(url, config?.verify_token);
    if (challenge) return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const rawBody = await req.text();
  const sig = req.headers.get("x-hub-signature-256");
  const valid = await validateSignature(rawBody, sig, config?.app_secret);
  if (!valid) {
    console.warn("[webhook-whatsapp] invalid signature");
    return new Response("Forbidden", { status: 403 });
  }

  let payload: any = {};
  try { payload = JSON.parse(rawBody); } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  try {
    const messages = parseWhatsApp(payload);
    for (const m of messages) {
      await upsertContactAndMessage("whatsapp", m);
    }
    return json({ processed: messages.length });
  } catch (err) {
    console.warn("[webhook-whatsapp] processing error:", err);
    // Sempre responde 200 pra Meta nao reenviar em loop
    return json({ error: err instanceof Error ? err.message : "error", processed: 0 });
  }
});
