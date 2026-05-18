import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

type ParserConfig = {
  enabled: boolean;
  always_classify: boolean;
  sender_whitelist: string[];
  subject_keywords: string[];
  min_confidence: "high" | "medium" | "low";
  default_category: string;
};
type BotConfig = { api_key: string; model: string; provider: string };

type Extracted = {
  is_reservation: boolean;
  confidence: "high" | "medium" | "low";
  guest_name?: string;
  check_in?: string;
  check_out?: string;
  adults?: number;
  children?: number;
  category?: string;
  contact_email?: string;
  contact_phone?: string;
  total_amount?: number;
  tariff?: number;
  source?: string;
  notes?: string;
};

async function loadConfig(): Promise<ParserConfig> {
  const defaults: ParserConfig = {
    enabled: false, always_classify: false,
    sender_whitelist: ["booking.com", "airbnb.com", "expedia.com"],
    subject_keywords: ["reserva", "booking", "reservation", "confirmation"],
    min_confidence: "medium", default_category: "executivo",
  };
  const { data } = await admin.from("app_settings").select("value").eq("id", "email_parser_config").maybeSingle();
  if (!data?.value) return defaults;
  try {
    const parsed = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
    return { ...defaults, ...parsed };
  } catch { return defaults; }
}

async function loadBotConfig(): Promise<BotConfig | null> {
  const { data } = await admin.from("app_settings").select("value").eq("id", "bot_config").maybeSingle();
  if (!data?.value) return null;
  try {
    const parsed = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
    return { api_key: parsed.api_key, model: parsed.model, provider: parsed.provider };
  } catch { return null; }
}

async function extractReservation(botCfg: BotConfig, subject: string, body: string, bodyHtml: string): Promise<Extracted> {
  const tools = [{
    name: "submit_reservation_data",
    description: "Submita os dados extraidos do email. is_reservation=false se NAO for email de reserva (newsletter, spam, conversa generica).",
    input_schema: {
      type: "object",
      properties: {
        is_reservation: { type: "boolean" },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
        guest_name: { type: "string" },
        check_in: { type: "string", description: "YYYY-MM-DD" },
        check_out: { type: "string", description: "YYYY-MM-DD" },
        adults: { type: "number" },
        children: { type: "number" },
        category: { type: "string", enum: ["executivo", "master", "suite presidencial"], description: "Mapeie do que o email diz. Se nao mencionar, omita." },
        contact_email: { type: "string" },
        contact_phone: { type: "string" },
        total_amount: { type: "number", description: "Valor total em BRL" },
        tariff: { type: "number", description: "Tarifa por noite em BRL" },
        source: { type: "string", description: "BOOKING_COM, AIRBNB, EXPEDIA, DIRECT_EMAIL, etc." },
        notes: { type: "string", description: "Observacoes relevantes pra recepcao" },
      },
      required: ["is_reservation", "confidence"],
    },
  }];
  const systemPrompt = `Voce eh um parser de emails de reserva de hotel. Sua tarefa: extrair dados estruturados de emails de confirmacao de reserva (Booking.com, Airbnb, Expedia, OTAs, emails diretos de clientes).

Regras:
- Se NAO for email de reserva (newsletter, spam, conversa generica, fatura, etc), retorne is_reservation=false com confidence="high".
- Datas SEMPRE no formato YYYY-MM-DD (converta de "20 de janeiro de 2026" → "2026-01-20").
- Se nao tiver certeza sobre um campo, omita ele em vez de inventar.
- confidence="high" se o email tem todos os campos chave (nome, datas, valor). "medium" se faltam alguns. "low" se voce esta adivinhando.
- Hoje eh ${new Date().toISOString().slice(0, 10)}.`;
  const userMsg = `Assunto: ${subject}\n\nCorpo:\n${(body || bodyHtml || "").slice(0, 8000)}`;

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": botCfg.api_key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({
      model: botCfg.model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userMsg }],
      tools,
      tool_choice: { type: "tool", name: "submit_reservation_data" },
    }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json() as { content?: Array<{ type: string; name?: string; input?: Extracted }> };
  const block = (j.content ?? []).find(b => b.type === "tool_use" && b.name === "submit_reservation_data");
  return block?.input ?? { is_reservation: false, confidence: "low" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (req.headers.get("authorization") !== `Bearer ${SERVICE_ROLE_KEY}`) return json({ error: "Forbidden" }, 403);

  let body: { inbox_message_id?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!body.inbox_message_id) return json({ error: "inbox_message_id required" }, 400);

  const cfg = await loadConfig();
  if (!cfg.enabled) return json({ skipped: "parser_disabled" });

  const { data: msg } = await admin.from("inbox_messages")
    .select("id, channel, subject, body, body_html, contact_id, contact_identifier, email_message_id, direction")
    .eq("id", body.inbox_message_id)
    .maybeSingle();
  if (!msg) return json({ skipped: "message_not_found" });
  if (msg.channel !== "email") return json({ skipped: "not_email" });
  if (msg.direction !== "in") return json({ skipped: "not_incoming" });

  // Dedupe
  const sourceKey = `email:${msg.id}`;
  const { data: existing } = await admin.from("reservation_requests").select("id").eq("source_message_id", sourceKey).maybeSingle();
  if (existing) return json({ skipped: "already_processed", reservation_request_id: (existing as { id: string }).id });

  // Heuristica
  if (!cfg.always_classify) {
    const senderLow = (msg.contact_identifier ?? "").toLowerCase();
    const subjectLow = (msg.subject ?? "").toLowerCase();
    const senderMatch = (cfg.sender_whitelist ?? []).some(d => senderLow.includes(d.toLowerCase()));
    const subjectMatch = (cfg.subject_keywords ?? []).some(k => subjectLow.includes(k.toLowerCase()));
    if (!senderMatch && !subjectMatch) return json({ skipped: "heuristic_no_match" });
  }

  const botCfg = await loadBotConfig();
  if (!botCfg?.api_key) return json({ skipped: "no_llm_key" });
  if (botCfg.provider !== "claude") return json({ skipped: `provider_not_supported: ${botCfg.provider}` });

  let extracted: Extracted;
  try {
    extracted = await extractReservation(botCfg, msg.subject ?? "", msg.body ?? "", msg.body_html ?? "");
  } catch (err) {
    return json({ error: "llm_failed", detail: err instanceof Error ? err.message : String(err) }, 500);
  }

  if (!extracted.is_reservation) return json({ skipped: "not_reservation", confidence: extracted.confidence });

  const order: Record<string, number> = { high: 3, medium: 2, low: 1 };
  if ((order[extracted.confidence] ?? 0) < (order[cfg.min_confidence ?? "medium"] ?? 2)) {
    return json({ skipped: "low_confidence", confidence: extracted.confidence, extracted });
  }

  if (!extracted.guest_name || !extracted.check_in || !extracted.check_out) {
    return json({ skipped: "missing_required", extracted });
  }
  if (extracted.check_in >= extracted.check_out) return json({ skipped: "invalid_dates", extracted });

  const code = "EML-" + Math.random().toString(36).slice(2, 8).toUpperCase();
  const { data: inserted, error } = await admin.from("reservation_requests").insert([{
    guest_name: extracted.guest_name,
    check_in: extracted.check_in,
    check_out: extracted.check_out,
    status: "REQUESTED",
    company_id: null,
    total_amount: extracted.total_amount ?? 0,
    reservation_code: code,
    tariff: extracted.tariff ?? 0,
    category: extracted.category ?? cfg.default_category ?? "executivo",
    guests_per_uh: (extracted.adults ?? 1) + (extracted.children ?? 0),
    adults: extracted.adults ?? 1,
    children: extracted.children ?? 0,
    contact_email: extracted.contact_email ?? msg.contact_identifier,
    contact_phone: extracted.contact_phone ?? null,
    source: extracted.source ?? "EMAIL",
    requested_by: "bot-email-parser",
    billing_obs: extracted.notes ?? null,
    source_message_id: sourceKey,
  }]).select("id, reservation_code").single();
  if (error) return json({ error: error.message }, 500);

  return json({ created: true, reservation_request_id: (inserted as { id: string }).id, code: (inserted as { reservation_code: string }).reservation_code, extracted });
});
