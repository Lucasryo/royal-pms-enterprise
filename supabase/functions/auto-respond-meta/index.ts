import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-test-call",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

type BotConfig = {
  enabled: boolean;
  provider: "claude" | "openai" | "gemini" | "groq" | "rule" | "none";
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
type ChatMsg = { role: "user" | "assistant"; content: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function loadBotConfig(): Promise<BotConfig | null> {
  const { data } = await adminClient.from("app_settings").select("value").eq("id", "bot_config").maybeSingle();
  if (!data?.value) return null;
  try { return JSON.parse(data.value) as BotConfig; } catch { return null; }
}

async function loadContact(contactId: string) {
  const { data } = await adminClient.from("marketing_contacts").select("id, assigned_to, phone, email, name").eq("id", contactId).maybeSingle();
  return data as { id: string; assigned_to: string | null; phone: string | null; email: string | null; name: string | null } | null;
}

async function markNeedsHuman(contactId: string) {
  await adminClient.from("marketing_contacts").update({ status: "needs_human", updated_at: new Date().toISOString() }).eq("id", contactId);
}

async function loadHistory(contactId: string, limit: number): Promise<ChatMsg[]> {
  const { data } = await adminClient.from("inbox_messages").select("body, direction, created_at").eq("contact_id", contactId).order("created_at", { ascending: false }).limit(limit);
  if (!data) return [];
  return (data as Array<{ body: string; direction: string }>).reverse().map(m => ({
    role: m.direction === "out" ? "assistant" as const : "user" as const,
    content: (m.body || "").slice(0, 2000),
  }));
}

async function countConsecutiveBotOut(contactId: string): Promise<number> {
  const { data } = await adminClient.from("inbox_messages").select("direction, created_at").eq("contact_id", contactId).order("created_at", { ascending: false }).limit(20);
  if (!data) return 0;
  let count = 0;
  for (const m of data as Array<{ direction: string }>) {
    if (m.direction === "out") count += 1; else break;
  }
  return count;
}

function renderSystemPrompt(tpl: string, cfg: BotConfig): string {
  const base = tpl
    .replaceAll("{{hotel_name}}", cfg.hotel_name || "Hotel")
    .replaceAll("{{mood}}", cfg.mood || "professional")
    .replaceAll("{{description}}", cfg.description || "(sem descricao)")
    .replaceAll("{{policies}}", cfg.policies || "(sem politicas)")
    .replaceAll("{{rooms}}", cfg.rooms || "(sem acomodacoes cadastradas)")
    .replaceAll("{{faq}}", cfg.faq || "(sem FAQ)");
  return base + "\n\nVoce tem ferramentas pra consultar disponibilidade real e tarifas:\n- check_availability(category, check_in, check_out)\n- get_rates(category, check_in, check_out, adults, children)\nUse-as SEMPRE que perguntarem sobre datas/precos. NUNCA invente valores. Hoje eh " + new Date().toISOString().slice(0, 10) + ".";
}

// ─── PMS helpers (duplicado de public-booking-request) ───────────────────

function iterDates(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  const start = new Date(`${startISO}T12:00:00Z`);
  const end = new Date(`${endISO}T12:00:00Z`);
  for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}
function isWeekend(dateISO: string): boolean {
  const d = new Date(`${dateISO}T12:00:00Z`).getUTCDay();
  return d === 5 || d === 6;
}
type RateRow = { id: string; category: string; label: string; start_date: string; end_date: string; weekday_rate: number; weekend_rate: number | null; guests_included: number; extra_guest_fee: number; min_nights: number; priority: number };
function pickRate(rates: RateRow[], dateISO: string): RateRow | null {
  const candidates = rates.filter(r => r.start_date <= dateISO && r.end_date >= dateISO);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.priority - a.priority);
  return candidates[0];
}

async function checkAvailability(category: string, checkIn: string, checkOut: string) {
  const dates = iterDates(checkIn, checkOut);
  if (dates.length === 0) return { available: false, full_dates: [], reason: "Periodo invalido (check_out deve ser apos check_in)." };

  // Inventario do bot vem APENAS de booking_blocked_dates (Reservas > Bloqueio de Datas).
  // Se nao esta bloqueado, esta disponivel.
  const { data: blockedRows } = await adminClient.from("booking_blocked_dates").select("start_date, end_date, reason, category").eq("active", true).lte("start_date", checkOut).gte("end_date", checkIn).or(`category.is.null,category.eq.${category}`);
  const blocked = (blockedRows ?? []) as Array<{ start_date: string; end_date: string; reason: string | null }>;
  const blockedDates = dates.filter(d => blocked.some(b => b.start_date <= d && b.end_date >= d));
  if (blockedDates.length > 0) {
    const first = blocked.find(b => b.start_date <= blockedDates[0] && b.end_date >= blockedDates[0]);
    return { available: false, full_dates: blockedDates, reason: first?.reason ? `Bloqueado: ${first.reason}` : `Bloqueado em ${blockedDates.length} dia(s).` };
  }
  return { available: true, full_dates: [], reason: "" };
}

async function getRates(category: string, checkIn: string, checkOut: string, adults: number, children: number) {
  const dates = iterDates(checkIn, checkOut);
  if (dates.length === 0) return { available: false, reason: "Periodo invalido." };
  const guests = adults + children;
  if (!["executivo", "master", "suite presidencial"].includes(category)) return { available: false, reason: `Categoria '${category}' nao reconhecida. Use: executivo, master, suite presidencial.` };

  const { data: rates, error } = await adminClient.from("public_rates").select("id, category, label, start_date, end_date, weekday_rate, weekend_rate, guests_included, extra_guest_fee, min_nights, priority").eq("category", category).eq("active", true).lte("start_date", checkOut).gte("end_date", checkIn);
  if (error) return { available: false, reason: error.message };

  let nightlyTotal = 0;
  let extraGuestTotal = 0;
  let minNights = 1;
  const breakdown: Array<{ date: string; rate: number }> = [];
  for (const date of dates) {
    const r = pickRate((rates ?? []) as RateRow[], date);
    if (!r) return { available: false, reason: `Sem tarifa publica vigente para ${date}.` };
    const weekend = isWeekend(date);
    const day = weekend && r.weekend_rate != null ? Number(r.weekend_rate) : Number(r.weekday_rate);
    nightlyTotal += day;
    breakdown.push({ date, rate: day });
    minNights = Math.max(minNights, r.min_nights);
    extraGuestTotal += Math.max(0, guests - r.guests_included) * Number(r.extra_guest_fee);
  }
  if (dates.length < minNights) return { available: false, reason: `Estadia minima ${minNights} noites.` };
  return { available: true, nights: dates.length, nightly_total: nightlyTotal, extra_guest_total: extraGuestTotal, total: nightlyTotal + extraGuestTotal, breakdown };
}

async function runTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  try {
    if (name === "check_availability") return await checkAvailability(String(input.category ?? "").toLowerCase(), String(input.check_in), String(input.check_out));
    if (name === "get_rates") return await getRates(String(input.category ?? "").toLowerCase(), String(input.check_in), String(input.check_out), Number(input.adults ?? 1), Number(input.children ?? 0));
    return { error: `unknown tool: ${name}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "tool error" };
  }
}

// ─── Tool definitions ────────────────────────────────────────────────────

const TOOLS_ANTHROPIC = [
  {
    name: "check_availability",
    description: "Verifica se as datas estao liberadas (sem bloqueio manual em Reservas > Bloqueio de Datas) pra uma categoria. Retorna {available, full_dates, reason}. NAO checa ocupacao real — confiamos no bloqueio manual.",
    input_schema: { type: "object", properties: {
      category: { type: "string", enum: ["executivo", "master", "suite presidencial"], description: "Categoria da UH" },
      check_in: { type: "string", description: "Data check-in YYYY-MM-DD" },
      check_out: { type: "string", description: "Data check-out YYYY-MM-DD" },
    }, required: ["category", "check_in", "check_out"] },
  },
  {
    name: "get_rates",
    description: "Calcula tarifa total de uma categoria pra um periodo. Retorna {available, nights, total, breakdown}.",
    input_schema: { type: "object", properties: {
      category: { type: "string", enum: ["executivo", "master", "suite presidencial"] },
      check_in: { type: "string", description: "YYYY-MM-DD" },
      check_out: { type: "string", description: "YYYY-MM-DD" },
      adults: { type: "number" },
      children: { type: "number" },
    }, required: ["category", "check_in", "check_out", "adults"] },
  },
];
const TOOLS_OPENAI = TOOLS_ANTHROPIC.map(t => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.input_schema } }));
const TOOLS_GEMINI = TOOLS_ANTHROPIC.map(t => ({ name: t.name, description: t.description, parameters: t.input_schema }));

// ─── Pricing table (USD per 1M tokens) ───────────────────────────────────
const PRICING: Record<string, { in: number; out: number }> = {
  "claude-haiku-4-5": { in: 1.0, out: 5.0 },
  "claude-sonnet-4-6": { in: 3.0, out: 15.0 },
  "claude-opus-4-7": { in: 15.0, out: 75.0 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gpt-4o": { in: 2.5, out: 10.0 },
  "gpt-5": { in: 5.0, out: 15.0 },
  "gemini-2.0-flash": { in: 0.075, out: 0.3 },
  "gemini-2.5-pro": { in: 1.25, out: 5.0 },
  "llama-3.3-70b-versatile": { in: 0.59, out: 0.79 },
  "llama-3.1-8b-instant": { in: 0.05, out: 0.08 },
};
function calcCost(model: string, inTok: number, outTok: number): number {
  const p = PRICING[model];
  if (!p) return 0;
  return (inTok / 1_000_000) * p.in + (outTok / 1_000_000) * p.out;
}

// ─── LLM call w/ tools — returns final text + accumulated tokens + tools used ──

type LLMResult = { reply: string; input_tokens: number; output_tokens: number; tools_used: string[] };

async function callAnthropicWithTools(apiKey: string, model: string, systemPrompt: string, history: ChatMsg[], userMsg: string): Promise<LLMResult> {
  const messages: Array<Record<string, unknown>> = [...history, { role: "user", content: userMsg }];
  let inTok = 0, outTok = 0;
  const toolsUsed: string[] = [];
  for (let i = 0; i < 5; i++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 1024, system: systemPrompt, messages, tools: TOOLS_ANTHROPIC }),
    });
    if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json() as { content?: Array<Record<string, unknown>>; stop_reason?: string; usage?: { input_tokens?: number; output_tokens?: number } };
    inTok += j.usage?.input_tokens ?? 0;
    outTok += j.usage?.output_tokens ?? 0;
    const blocks = j.content ?? [];
    if (j.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: blocks });
      const toolResults: Array<Record<string, unknown>> = [];
      for (const block of blocks) {
        if (block.type === "tool_use") {
          toolsUsed.push(block.name as string);
          const result = await runTool(block.name as string, block.input as Record<string, unknown>);
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
        }
      }
      messages.push({ role: "user", content: toolResults });
      continue;
    }
    const text = blocks.filter(b => b.type === "text").map(b => b.text).join("\n").trim();
    return { reply: text, input_tokens: inTok, output_tokens: outTok, tools_used: toolsUsed };
  }
  throw new Error("Max tool iterations (5) excedidas");
}

async function callOpenAICompatibleWithTools(label: string, baseUrl: string, apiKey: string, model: string, systemPrompt: string, history: ChatMsg[], userMsg: string): Promise<LLMResult> {
  const messages: Array<Record<string, unknown>> = [{ role: "system", content: systemPrompt }, ...history, { role: "user", content: userMsg }];
  let inTok = 0, outTok = 0;
  const toolsUsed: string[] = [];
  for (let i = 0; i < 5; i++) {
    const r = await fetch(baseUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 1024, messages, tools: TOOLS_OPENAI }),
    });
    if (!r.ok) throw new Error(`${label} ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json() as { choices?: Array<{ message?: Record<string, unknown>; finish_reason?: string }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    inTok += j.usage?.prompt_tokens ?? 0;
    outTok += j.usage?.completion_tokens ?? 0;
    const choice = j.choices?.[0];
    const msg = choice?.message as { content?: string; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } | undefined;
    if (choice?.finish_reason === "tool_calls" && msg?.tool_calls) {
      messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });
      for (const tc of msg.tool_calls) {
        toolsUsed.push(tc.function.name);
        const input = (() => { try { return JSON.parse(tc.function.arguments); } catch { return {}; } })();
        const result = await runTool(tc.function.name, input);
        messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
      }
      continue;
    }
    return { reply: (msg?.content ?? "").trim(), input_tokens: inTok, output_tokens: outTok, tools_used: toolsUsed };
  }
  throw new Error("Max tool iterations (5) excedidas");
}

async function callGeminiWithTools(apiKey: string, model: string, systemPrompt: string, history: ChatMsg[], userMsg: string): Promise<LLMResult> {
  const contents: Array<Record<string, unknown>> = [
    ...history.map(h => ({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.content }] })),
    { role: "user", parts: [{ text: userMsg }] },
  ];
  let inTok = 0, outTok = 0;
  const toolsUsed: string[] = [];
  for (let i = 0; i < 5; i++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        tools: [{ functionDeclarations: TOOLS_GEMINI }],
        generationConfig: { maxOutputTokens: 1024 },
      }),
    });
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json() as { candidates?: Array<{ content?: { parts?: Array<Record<string, unknown>> } }>; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
    inTok += j.usageMetadata?.promptTokenCount ?? 0;
    outTok += j.usageMetadata?.candidatesTokenCount ?? 0;
    const parts = j.candidates?.[0]?.content?.parts ?? [];
    const fnCalls = parts.filter(p => p.functionCall) as Array<{ functionCall: { name: string; args: Record<string, unknown> } }>;
    if (fnCalls.length > 0) {
      contents.push({ role: "model", parts });
      const fnResponseParts: Array<Record<string, unknown>> = [];
      for (const fc of fnCalls) {
        toolsUsed.push(fc.functionCall.name);
        const result = await runTool(fc.functionCall.name, fc.functionCall.args);
        fnResponseParts.push({ functionResponse: { name: fc.functionCall.name, response: { content: result } } });
      }
      contents.push({ role: "user", parts: fnResponseParts });
      continue;
    }
    const text = parts.filter(p => p.text).map(p => p.text as string).join("\n").trim();
    return { reply: text, input_tokens: inTok, output_tokens: outTok, tools_used: toolsUsed };
  }
  throw new Error("Max tool iterations (5) excedidas");
}

function ruleBasedReply(_history: ChatMsg[], userMsg: string): LLMResult {
  const lower = userMsg.toLowerCase();
  let reply = "<needs_human/>";
  if (/\b(ola|oi|bom dia|boa tarde|boa noite)\b/.test(lower)) reply = "Olá! Como posso ajudar?";
  else if (/\b(preco|preço|valor|tarifa|diaria|reserva|reservar|disponibilidade)\b/.test(lower)) reply = "<needs_human/>";
  else if (/\b(obrigad|valeu|thanks)\b/.test(lower)) reply = "De nada! Estamos a disposicao.";
  return { reply, input_tokens: 0, output_tokens: 0, tools_used: [] };
}

async function callLLM(cfg: BotConfig, systemPrompt: string, history: ChatMsg[], userMsg: string): Promise<LLMResult> {
  if (cfg.provider === "claude") return callAnthropicWithTools(cfg.api_key, cfg.model, systemPrompt, history, userMsg);
  if (cfg.provider === "openai") return callOpenAICompatibleWithTools("OpenAI", "https://api.openai.com/v1/chat/completions", cfg.api_key, cfg.model, systemPrompt, history, userMsg);
  if (cfg.provider === "groq") return callOpenAICompatibleWithTools("Groq", "https://api.groq.com/openai/v1/chat/completions", cfg.api_key, cfg.model, systemPrompt, history, userMsg);
  if (cfg.provider === "gemini") return callGeminiWithTools(cfg.api_key, cfg.model, systemPrompt, history, userMsg);
  if (cfg.provider === "rule") return ruleBasedReply(history, userMsg);
  throw new Error(`unknown provider: ${cfg.provider}`);
}

// ─── Logging ─────────────────────────────────────────────────────────────

type LogInput = {
  contact_id: string | null;
  channel: string;
  incoming_text: string | null;
  reply_text: string | null;
  decision: "replied" | "escalated" | "skipped" | "error";
  reason?: string;
  provider?: string;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number;
  duration_ms?: number;
  tools_used?: string[];
};
async function logInvocation(log: LogInput) {
  try {
    await adminClient.from("bot_invocations").insert([{
      contact_id: log.contact_id,
      channel: log.channel,
      incoming_text: log.incoming_text,
      reply_text: log.reply_text,
      decision: log.decision,
      reason: log.reason ?? null,
      provider: log.provider ?? null,
      model: log.model ?? null,
      input_tokens: log.input_tokens ?? null,
      output_tokens: log.output_tokens ?? null,
      cost_usd: log.cost_usd ?? null,
      duration_ms: log.duration_ms ?? null,
      tools_used: log.tools_used && log.tools_used.length > 0 ? log.tools_used : null,
    }]);
  } catch (err) {
    console.warn("[bot_invocations] log failed:", err);
  }
}

// ─── Main handler ────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = req.headers.get("authorization") ?? "";
  const isInternalCall = auth === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
  const isTestCall = req.headers.get("x-test-call") === "1";

  let body: { contact_id?: string; channel?: Channel; incoming_text?: string; test_only?: boolean; test_text?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const cfg = await loadBotConfig();
  if (!cfg) return json({ error: "bot_config not found" }, 500);

  // Modo teste
  if (body.test_only && body.test_text) {
    if (!isInternalCall && !isTestCall) return json({ error: "Forbidden" }, 403);
    try {
      const systemPrompt = renderSystemPrompt(cfg.system_prompt_template, cfg);
      const result = await callLLM(cfg, systemPrompt, [], body.test_text);
      return json({ reply: result.reply, tools_used: result.tools_used, input_tokens: result.input_tokens, output_tokens: result.output_tokens, cost_usd: calcCost(cfg.model, result.input_tokens, result.output_tokens) });
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : "Erro" }, 500);
    }
  }

  if (!isInternalCall) return json({ error: "Forbidden" }, 403);

  const { contact_id, channel, incoming_text } = body;
  if (!contact_id || !channel || !incoming_text) return json({ error: "contact_id, channel, incoming_text required" }, 400);

  if (!cfg.enabled) {
    await logInvocation({ contact_id, channel, incoming_text, reply_text: null, decision: "skipped", reason: "bot_disabled" });
    return json({ skipped: "bot disabled" });
  }

  const contact = await loadContact(contact_id);
  if (!contact) {
    await logInvocation({ contact_id: null, channel, incoming_text, reply_text: null, decision: "skipped", reason: "contact_not_found" });
    return json({ skipped: "contact not found" });
  }
  if (contact.assigned_to) {
    await logInvocation({ contact_id, channel, incoming_text, reply_text: null, decision: "skipped", reason: "human_assigned" });
    return json({ skipped: "human assigned" });
  }

  // NPS reply capture: se existe nps_responses pendente pra esse contato, extrai score do texto
  const { data: pendingNps } = await adminClient.from("nps_responses").select("id").eq("contact_id", contact_id).is("responded_at", null).order("sent_at", { ascending: false }).limit(1).maybeSingle();
  if (pendingNps) {
    const m = incoming_text.match(/\b(10|[0-9])\s*(?:\/\s*10)?\b/);
    const score = m ? Number(m[1]) : null;
    if (score != null && score >= 0 && score <= 10) {
      await adminClient.from("nps_responses").update({ score, comment: incoming_text.slice(0, 1000), responded_at: new Date().toISOString() }).eq("id", (pendingNps as { id: string }).id);
      await logInvocation({ contact_id, channel, incoming_text, reply_text: null, decision: "skipped", reason: "nps_captured" });
      // Resposta de agradecimento curta (sem chamar LLM)
      const recipient = contact.phone || contact.email;
      if (recipient) {
        await fetch(`${SUPABASE_URL}/functions/v1/send-meta-message`, {
          method: "POST",
          headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ channel, recipient, text: "Obrigado pelo feedback! 🙌", contact_id }),
        }).catch(() => {});
      }
      return json({ nps_captured: true, score });
    }
  }

  const lower = incoming_text.toLowerCase();
  if ((cfg.escalation_keywords ?? []).some(kw => lower.includes(kw.toLowerCase()))) {
    await markNeedsHuman(contact_id);
    await logInvocation({ contact_id, channel, incoming_text, reply_text: null, decision: "escalated", reason: "keyword" });
    return json({ skipped: "escalation keyword" });
  }

  const consecutiveOut = await countConsecutiveBotOut(contact_id);
  if (consecutiveOut >= (cfg.max_consecutive_bot_msgs ?? 5)) {
    await markNeedsHuman(contact_id);
    await logInvocation({ contact_id, channel, incoming_text, reply_text: null, decision: "escalated", reason: "max_consecutive" });
    return json({ skipped: "max consecutive bot msgs" });
  }

  const history = await loadHistory(contact_id, cfg.history_window ?? 10);
  const systemPrompt = renderSystemPrompt(cfg.system_prompt_template, cfg);

  const t0 = Date.now();
  let result: LLMResult;
  try {
    result = await callLLM(cfg, systemPrompt, history, incoming_text);
  } catch (err) {
    const duration = Date.now() - t0;
    console.warn("[auto-respond] LLM error:", err);
    await logInvocation({ contact_id, channel, incoming_text, reply_text: null, decision: "error", reason: "llm_failed", provider: cfg.provider, model: cfg.model, duration_ms: duration });
    return json({ error: "llm_failed", detail: err instanceof Error ? err.message : "" }, 500);
  }
  const duration = Date.now() - t0;
  const cost = calcCost(cfg.model, result.input_tokens, result.output_tokens);

  if (result.reply.includes("<needs_human/>") || result.reply.length === 0) {
    await markNeedsHuman(contact_id);
    await logInvocation({ contact_id, channel, incoming_text, reply_text: result.reply, decision: "escalated", reason: "llm_escalated", provider: cfg.provider, model: cfg.model, input_tokens: result.input_tokens, output_tokens: result.output_tokens, cost_usd: cost, duration_ms: duration, tools_used: result.tools_used });
    return json({ skipped: "llm escalated" });
  }

  const recipient = contact.phone || contact.email;
  if (!recipient) {
    await logInvocation({ contact_id, channel, incoming_text, reply_text: result.reply, decision: "error", reason: "no_recipient", provider: cfg.provider, model: cfg.model, input_tokens: result.input_tokens, output_tokens: result.output_tokens, cost_usd: cost, duration_ms: duration, tools_used: result.tools_used });
    return json({ skipped: "no recipient identifier" });
  }

  const sendResponse = await fetch(`${SUPABASE_URL}/functions/v1/send-meta-message`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ channel, recipient, text: result.reply, contact_id }),
  });
  const sendResult = await sendResponse.json().catch(() => ({}));
  if (!sendResponse.ok || !(sendResult as { sent?: boolean }).sent) {
    await logInvocation({ contact_id, channel, incoming_text, reply_text: result.reply, decision: "error", reason: "send_failed", provider: cfg.provider, model: cfg.model, input_tokens: result.input_tokens, output_tokens: result.output_tokens, cost_usd: cost, duration_ms: duration, tools_used: result.tools_used });
    return json({ error: "send_failed", detail: sendResult }, 500);
  }
  await adminClient.from("marketing_contacts").update({ status: "ai_responded", updated_at: new Date().toISOString() }).eq("id", contact_id);
  await logInvocation({ contact_id, channel, incoming_text, reply_text: result.reply, decision: "replied", provider: cfg.provider, model: cfg.model, input_tokens: result.input_tokens, output_tokens: result.output_tokens, cost_usd: cost, duration_ms: duration, tools_used: result.tools_used });
  return json({ sent: true, reply: result.reply, tools_used: result.tools_used, cost_usd: cost });
});
