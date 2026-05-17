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

type BotConfig = {
  enabled: boolean;
  provider: "claude" | "openai" | "gemini" | "rule" | "none";
  model: string;
  api_key: string;
  system_prompt_template: string;
  hotel_name: string;
  description: string;
  policies: string;
  rooms: string;
  faq: string;
  mood: string;
  escalation_keywords: string[];
  max_consecutive_bot_msgs: number;
  history_window: number;
};

type Channel = "whatsapp" | "instagram" | "facebook";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function loadBotConfig(): Promise<BotConfig | null> {
  const { data } = await adminClient.from("app_settings").select("value").eq("id", "bot_config").maybeSingle();
  if (!data?.value) return null;
  try { return JSON.parse(data.value) as BotConfig; } catch { return null; }
}

async function loadContact(contactId: string): Promise<{ id: string; assigned_to: string | null; phone: string | null; email: string | null; name: string | null } | null> {
  const { data } = await adminClient.from("marketing_contacts").select("id, assigned_to, phone, email, name").eq("id", contactId).maybeSingle();
  return data;
}

async function markNeedsHuman(contactId: string) {
  await adminClient.from("marketing_contacts").update({ status: "needs_human", updated_at: new Date().toISOString() }).eq("id", contactId);
}

async function loadHistory(contactId: string, limit: number): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const { data } = await adminClient
    .from("inbox_messages")
    .select("body, direction, created_at")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!data) return [];
  return (data as Array<{ body: string; direction: string }>)
    .reverse()
    .map(m => ({ role: m.direction === "out" ? "assistant" as const : "user" as const, content: (m.body || "").slice(0, 2000) }));
}

async function countConsecutiveBotOut(contactId: string): Promise<number> {
  const { data } = await adminClient
    .from("inbox_messages")
    .select("direction, created_at")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (!data) return 0;
  let count = 0;
  for (const m of data as Array<{ direction: string }>) {
    if (m.direction === "out") count += 1; else break;
  }
  return count;
}

function renderSystemPrompt(tpl: string, cfg: BotConfig): string {
  return tpl
    .replaceAll("{{hotel_name}}", cfg.hotel_name || "Hotel")
    .replaceAll("{{mood}}", cfg.mood || "professional")
    .replaceAll("{{description}}", cfg.description || "(sem descricao)")
    .replaceAll("{{policies}}", cfg.policies || "(sem politicas)")
    .replaceAll("{{rooms}}", cfg.rooms || "(sem acomodacoes cadastradas)")
    .replaceAll("{{faq}}", cfg.faq || "(sem FAQ)");
}

// ─── LLM providers ────────────────────────────────────────────────────────

async function callAnthropic(apiKey: string, model: string, systemPrompt: string, history: Array<{ role: "user" | "assistant"; content: string }>, userMsg: string): Promise<string> {
  const messages = [...history, { role: "user" as const, content: userMsg }];
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, max_tokens: 500, system: systemPrompt, messages }),
  });
  if (!r.ok) {
    const errBody = await r.text().catch(() => "");
    throw new Error(`Anthropic ${r.status}: ${errBody.slice(0, 200)}`);
  }
  const result = await r.json();
  return (result as { content?: Array<{ text?: string }> })?.content?.[0]?.text ?? "";
}

async function callOpenAI(apiKey: string, model: string, systemPrompt: string, history: Array<{ role: "user" | "assistant"; content: string }>, userMsg: string): Promise<string> {
  const messages = [{ role: "system" as const, content: systemPrompt }, ...history, { role: "user" as const, content: userMsg }];
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 500, messages }),
  });
  if (!r.ok) {
    const errBody = await r.text().catch(() => "");
    throw new Error(`OpenAI ${r.status}: ${errBody.slice(0, 200)}`);
  }
  const result = await r.json();
  return (result as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content ?? "";
}

async function callGemini(apiKey: string, model: string, systemPrompt: string, history: Array<{ role: "user" | "assistant"; content: string }>, userMsg: string): Promise<string> {
  const contents = [
    ...history.map(h => ({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.content }] })),
    { role: "user", parts: [{ text: userMsg }] },
  ];
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { maxOutputTokens: 500 },
    }),
  });
  if (!r.ok) {
    const errBody = await r.text().catch(() => "");
    throw new Error(`Gemini ${r.status}: ${errBody.slice(0, 200)}`);
  }
  const result = await r.json();
  return (result as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

function ruleBasedReply(_history: Array<{ role: "user" | "assistant"; content: string }>, userMsg: string, _systemPrompt: string): string {
  const lower = userMsg.toLowerCase();
  if (/\b(ola|oi|bom dia|boa tarde|boa noite)\b/.test(lower)) return "Olá! Como posso ajudar?";
  if (/\b(preco|preço|valor|tarifa|diaria)\b/.test(lower)) return "Vou passar a sua consulta de preços pro atendente humano. Um momento, por favor.";
  if (/\b(reserva|reservar|disponibilidade)\b/.test(lower)) return "Pra reservas, um atendente humano vai falar com voce em instantes.";
  if (/\b(obrigad|valeu|thanks)\b/.test(lower)) return "De nada! Estamos a disposicao.";
  return "<needs_human/>";
}

async function callLLM(cfg: BotConfig, systemPrompt: string, history: Array<{ role: "user" | "assistant"; content: string }>, userMsg: string): Promise<string> {
  if (cfg.provider === "claude") return callAnthropic(cfg.api_key, cfg.model, systemPrompt, history, userMsg);
  if (cfg.provider === "openai") return callOpenAI(cfg.api_key, cfg.model, systemPrompt, history, userMsg);
  if (cfg.provider === "gemini") return callGemini(cfg.api_key, cfg.model, systemPrompt, history, userMsg);
  if (cfg.provider === "rule") return ruleBasedReply(history, userMsg, systemPrompt);
  throw new Error(`unknown provider: ${cfg.provider}`);
}

// ─── Main handler ─────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Auth: aceita somente requests com SERVICE_ROLE_KEY no header
  const auth = req.headers.get("authorization") ?? "";
  const expectedAuth = `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
  // Também aceita modo test (chamado da UI) — nesse caso vai do JWT do user
  const isInternalCall = auth === expectedAuth;
  const isTestCall = req.headers.get("x-test-call") === "1";

  let body: { contact_id?: string; channel?: Channel; incoming_text?: string; test_only?: boolean; test_text?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const cfg = await loadBotConfig();
  if (!cfg) return json({ error: "bot_config not found" }, 500);

  // Modo teste: não precisa contact_id, só simula
  if (body.test_only && body.test_text) {
    if (!isInternalCall && !isTestCall) return json({ error: "Forbidden" }, 403);
    if (!cfg.enabled && body.test_only !== true) return json({ skipped: "bot disabled" });
    try {
      const systemPrompt = renderSystemPrompt(cfg.system_prompt_template, cfg);
      const reply = await callLLM(cfg, systemPrompt, [], body.test_text);
      return json({ reply, systemPrompt });
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : "Erro" }, 500);
    }
  }

  if (!isInternalCall) return json({ error: "Forbidden" }, 403);

  const { contact_id, channel, incoming_text } = body;
  if (!contact_id || !channel || !incoming_text) return json({ error: "contact_id, channel, incoming_text required" }, 400);

  if (!cfg.enabled) return json({ skipped: "bot disabled" });

  const contact = await loadContact(contact_id);
  if (!contact) return json({ skipped: "contact not found" });
  if (contact.assigned_to) return json({ skipped: "human assigned" });

  // Escalation por keyword
  const lower = incoming_text.toLowerCase();
  if ((cfg.escalation_keywords ?? []).some(kw => lower.includes(kw.toLowerCase()))) {
    await markNeedsHuman(contact_id);
    return json({ skipped: "escalation keyword" });
  }

  // Limite consecutivo
  const consecutiveOut = await countConsecutiveBotOut(contact_id);
  if (consecutiveOut >= (cfg.max_consecutive_bot_msgs ?? 5)) {
    await markNeedsHuman(contact_id);
    return json({ skipped: "max consecutive bot msgs" });
  }

  const history = await loadHistory(contact_id, cfg.history_window ?? 10);
  const systemPrompt = renderSystemPrompt(cfg.system_prompt_template, cfg);

  let reply: string;
  try {
    reply = (await callLLM(cfg, systemPrompt, history, incoming_text)).trim();
  } catch (err) {
    console.warn("[auto-respond] LLM error:", err);
    return json({ error: "llm_failed", detail: err instanceof Error ? err.message : "" }, 500);
  }

  // Tag de escalacao na resposta
  if (reply.includes("<needs_human/>") || reply.length === 0) {
    await markNeedsHuman(contact_id);
    return json({ skipped: "llm escalated" });
  }

  // Envia via send-meta-message
  const recipient = contact.phone || contact.email;
  if (!recipient) return json({ skipped: "no recipient identifier" });

  const sendResponse = await fetch(`${SUPABASE_URL}/functions/v1/send-meta-message`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ channel, recipient, text: reply, contact_id }),
  });
  const sendResult = await sendResponse.json().catch(() => ({}));
  if (!sendResponse.ok || !(sendResult as { sent?: boolean }).sent) {
    return json({ error: "send_failed", detail: sendResult }, 500);
  }
  await adminClient.from("marketing_contacts").update({ status: "ai_responded", updated_at: new Date().toISOString() }).eq("id", contact_id);
  return json({ sent: true, reply });
});
