import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-test-call",
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
  voucher_url_domains: string[];
};
type BotConfig = { api_key: string; model: string; provider: string };
type AttachmentRef = { path: string; name: string; size: number; mime: string };

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
  // Corporativo
  is_corporate?: boolean;
  cost_center?: string;
  billing_obs?: string;
  fiscal_data?: string;
  payment_method?: string;
  billing_info?: string;
  requested_by?: string;
  extras?: string;
  company_name?: string;
};

async function loadConfig(): Promise<ParserConfig> {
  const defaults: ParserConfig = {
    enabled: false, always_classify: false,
    sender_whitelist: ["booking.com", "airbnb.com", "expedia.com"],
    subject_keywords: ["reserva", "booking", "reservation", "confirmation"],
    min_confidence: "medium", default_category: "executivo",
    voucher_url_domains: ["b2breservas.com.br"],
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

type CompanyRow = { id: string; name: string; email_domain: string | null; parser_aliases: string[] | null };

async function loadActiveCompanies(): Promise<CompanyRow[]> {
  const { data } = await admin.from("companies")
    .select("id, name, email_domain, parser_aliases")
    .ilike("status", "active");
  return (data ?? []) as CompanyRow[];
}

function matchCompanyHeuristic(companies: CompanyRow[], senderEmail: string, subject: string, body: string): CompanyRow | null {
  const senderDomain = senderEmail.split("@")[1]?.toLowerCase() ?? "";
  const haystack = `${senderEmail}\n${subject}\n${body}`.toLowerCase();
  // 1) dominio bate exato
  const byDomain = companies.find(c => c.email_domain && senderDomain && c.email_domain.toLowerCase() === senderDomain);
  if (byDomain) return byDomain;
  // 2) algum alias aparece no remetente/assunto/corpo
  for (const c of companies) {
    for (const alias of c.parser_aliases ?? []) {
      const a = alias.trim().toLowerCase();
      if (a.length >= 3 && haystack.includes(a)) return c;
    }
  }
  // 3) nome da empresa aparece no corpo
  for (const c of companies) {
    if (c.name && haystack.includes(c.name.toLowerCase())) return c;
  }
  return null;
}

function matchCompanyByName(companies: CompanyRow[], name: string): CompanyRow | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  return companies.find(c =>
    c.name.toLowerCase() === n ||
    (c.parser_aliases ?? []).some(a => a.trim().toLowerCase() === n),
  ) ?? null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function loadAttachments(refs: AttachmentRef[]): Promise<Array<{ name: string; mime: string; base64: string }>> {
  const out: Array<{ name: string; mime: string; base64: string }> = [];
  for (const a of refs) {
    if (a.size > 5 * 1024 * 1024) continue; // Limite Claude vision ~5MB
    if (!a.mime.startsWith("image/") && a.mime !== "application/pdf") continue;
    try {
      const { data } = await admin.storage.from("inbox_attachments").download(a.path);
      if (!data) continue;
      const buf = new Uint8Array(await data.arrayBuffer());
      out.push({ name: a.name, mime: a.mime, base64: bytesToBase64(buf) });
    } catch (err) {
      console.warn(`[load-attachment] ${a.path}: ${err instanceof Error ? err.message : err}`);
    }
  }
  return out;
}

function extractVoucherUrls(text: string, domains: string[]): string[] {
  if (!text || domains.length === 0) return [];
  const urls = text.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  const lowered = domains.map(d => d.toLowerCase().trim()).filter(Boolean);
  const matched: string[] = [];
  for (const raw of urls) {
    // limpa cauda comum (pontuacao final)
    const url = raw.replace(/[.,;:)\]}>"']+$/, "");
    try {
      const host = new URL(url).hostname.toLowerCase();
      if (lowered.some(d => host === d || host.endsWith(`.${d}`))) {
        if (!matched.includes(url)) matched.push(url);
      }
    } catch { /* invalid url */ }
    if (matched.length >= 3) break;
  }
  return matched;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#?\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchVoucherText(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const r = await fetch(url, { signal: controller.signal, headers: { "user-agent": "Mozilla/5.0 (RoyalPMS-bot)" } });
    clearTimeout(timeout);
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") ?? "";
    if (!ct.includes("text/html") && !ct.includes("text/plain")) return null;
    const html = await r.text();
    return htmlToText(html).slice(0, 6000);
  } catch (err) {
    console.warn(`[voucher-fetch] ${url}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

type ToolSchema = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

function buildExtractionTool(): ToolSchema {
  return {
    name: "submit_reservation_data",
    description: "Submita os dados extraidos do email. is_reservation=false se NAO for email de reserva.",
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
        category: { type: "string", enum: ["executivo", "master", "suite presidencial"] },
        contact_email: { type: "string" },
        contact_phone: { type: "string" },
        total_amount: { type: "number", description: "Valor total em BRL" },
        tariff: { type: "number", description: "Tarifa por noite em BRL" },
        source: { type: "string", description: "BOOKING_COM, AIRBNB, EXPEDIA, PETROBRAS, DIRECT_EMAIL, etc." },
        notes: { type: "string" },

        is_corporate: { type: "boolean", description: "true se eh reserva de empresa (Petrobras, etc). OTAs nao contam." },
        cost_center: { type: "string", description: "Centro de custo / projeto / OS (Petrobras manda tipo CC-12345, OS-67890)" },
        billing_obs: { type: "string", description: "Observacoes de faturamento" },
        fiscal_data: { type: "string", description: "Dados fiscais pra NF (CNPJ filial, endereco, etc) se diferentes do default" },
        payment_method: { type: "string", enum: ["BILLED", "CREDIT_CARD", "PIX", "CASH"], description: "BILLED se faturado pra empresa" },
        billing_info: { type: "string", description: "Instrucoes: 'faturar diarias separado de extras', 'incluir estacionamento na NF', etc" },
        requested_by: { type: "string", description: "Nome do solicitante na empresa (quem aprovou/pediu)" },
        extras: { type: "string", description: "Servicos extras (estacionamento, lavanderia, frigobar, etc) separado por virgula" },
        company_name: { type: "string", description: "Nome EXATO da empresa cliente conforme aparece na lista de empresas cadastradas (ou um dos aliases). Se nao bater com nenhuma empresa da lista, deixe vazio." },
      },
      required: ["is_reservation", "confidence"],
    },
  };
}

function buildSystemPrompt(companyHint: { id: string; name: string } | null, companies: CompanyRow[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const companyContext = companyHint ? `\n\nCONTEXTO: O remetente/conteudo aponta pra "${companyHint.name}" (empresa cadastrada). Assuma is_corporate=true e payment_method=BILLED. Use company_name="${companyHint.name}".` : "";
  const companyList = companies.length > 0
    ? `\n\nEMPRESAS CADASTRADAS (use o campo company_name pra escolher uma destas — nome canonico ou alias):\n${companies.map(c => {
        const aliases = (c.parser_aliases ?? []).filter(Boolean).join(", ");
        return `- ${c.name}${aliases ? ` (aliases: ${aliases})` : ""}`;
      }).join("\n")}\n\nIMPORTANTE: O remetente do email muitas vezes eh AGENCIA (Star/Accenture, Voetur, Kontik, etc) — a empresa REAL eh a mencionada no corpo. Use os aliases pra resolver. Se o email eh de agencia mista (Copastur, etc) sem empresa clara, deixe company_name vazio.`
    : "";
  return `Voce eh um parser de emails de reserva de hotel. Hoje eh ${today}.

Tipos de email que voce processa:
1. OTA (Booking.com, Airbnb, Expedia) - preencha campos basicos
2. CORPORATIVA (Petrobras e outras empresas) - preencha is_corporate=true + TODOS os campos de faturamento (cost_center, billing_obs, fiscal_data, payment_method=BILLED, billing_info, requested_by, extras)
3. Email direto de hospede - basico, payment_method CREDIT_CARD ou PIX

Regras corporativas:
- "faturar diarias" = cobrar so noites na NF principal
- "extras a parte" = NF separada pra estacionamento/lavanderia/frigobar - anote em billing_info
- "OS 12345", "CC-XXXX", "projeto YYYY" = cost_center
- Se tem PDF/imagem anexada (voucher Petrobras, screenshot interno), leia TUDO o que conseguir
- Tarifa pode estar so em uma das fontes (corpo ou anexo) - use a mais especifica

Datas SEMPRE YYYY-MM-DD (converta de "20/01/2026" ou "20 de janeiro de 2026"). Se incerto sobre algum campo, OMITA (nao invente).
confidence="high" se tem nome+datas+valor. "medium" se faltam alguns. "low" se esta adivinhando.
Se NAO for reserva (newsletter, spam, conversa generica), is_reservation=false com confidence=high.${companyList}${companyContext}`;
}

function buildUserText(subject: string, body: string, bodyHtml: string, vouchers: Array<{ url: string; text: string }>): string {
  const base = `Assunto: ${subject}\n\nCorpo:\n${(body || bodyHtml || "(sem corpo)").slice(0, 8000)}`;
  if (vouchers.length === 0) return base;
  const voucherSection = vouchers
    .map(v => `\n\n--- CONTEUDO DO VOUCHER (${v.url}) ---\n${v.text}`)
    .join("");
  return base + voucherSection;
}

async function extractViaAnthropic(
  botCfg: BotConfig,
  systemPrompt: string,
  userText: string,
  attachments: Array<{ name: string; mime: string; base64: string }>,
  tool: ToolSchema,
): Promise<Extracted> {
  const contentBlocks: Array<Record<string, unknown>> = [{ type: "text", text: userText }];
  for (const att of attachments) {
    if (att.mime.startsWith("image/")) {
      contentBlocks.push({ type: "image", source: { type: "base64", media_type: att.mime, data: att.base64 } });
    } else if (att.mime === "application/pdf") {
      contentBlocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: att.base64 } });
    }
  }
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": botCfg.api_key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({
      model: botCfg.model,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: contentBlocks }],
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
    }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json() as { content?: Array<{ type: string; name?: string; input?: Extracted }> };
  const block = (j.content ?? []).find(b => b.type === "tool_use" && b.name === tool.name);
  return block?.input ?? { is_reservation: false, confidence: "low" };
}

async function extractViaGroq(
  botCfg: BotConfig,
  systemPrompt: string,
  userText: string,
  tool: ToolSchema,
): Promise<Extracted> {
  const payload = JSON.stringify({
    model: botCfg.model,
    max_tokens: 2048,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userText },
    ],
    tools: [{ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.input_schema } }],
    tool_choice: { type: "function", function: { name: tool.name } },
  });
  let lastErr = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${botCfg.api_key}`, "Content-Type": "application/json" },
      body: payload,
    });
    if (r.ok) {
      const j = await r.json() as { choices?: Array<{ message?: { tool_calls?: Array<{ function: { name: string; arguments: string } }> } }> };
      const call = j.choices?.[0]?.message?.tool_calls?.find(c => c.function.name === tool.name);
      if (!call) return { is_reservation: false, confidence: "low" };
      try { return JSON.parse(call.function.arguments) as Extracted; } catch { return { is_reservation: false, confidence: "low" }; }
    }
    lastErr = `${r.status}: ${(await r.text()).slice(0, 200)}`;
    if (r.status !== 429 && r.status < 500) throw new Error(`Groq ${lastErr}`);
    const retryAfter = Number(r.headers.get("retry-after")) || 0;
    const waitMs = retryAfter > 0 ? Math.min(retryAfter * 1000, 30_000) : 1000 * Math.pow(2, attempt);
    await new Promise(res => setTimeout(res, waitMs));
  }
  throw new Error(`Groq ${lastErr} (after retries)`);
}

async function extractReservation(
  botCfg: BotConfig,
  subject: string,
  body: string,
  bodyHtml: string,
  attachments: Array<{ name: string; mime: string; base64: string }>,
  companyHint: { id: string; name: string } | null,
  companies: CompanyRow[],
  vouchers: Array<{ url: string; text: string }>,
): Promise<Extracted> {
  const tool = buildExtractionTool();
  const systemPrompt = buildSystemPrompt(companyHint, companies);
  const userText = buildUserText(subject, body, bodyHtml, vouchers);
  if (botCfg.provider === "groq") return extractViaGroq(botCfg, systemPrompt, userText, tool);
  return extractViaAnthropic(botCfg, systemPrompt, userText, attachments, tool);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const isInternal = req.headers.get("authorization") === `Bearer ${SERVICE_ROLE_KEY}`;
  const isTestCall = req.headers.get("x-test-call") === "1";
  if (!isInternal && !isTestCall) return json({ error: "Forbidden" }, 403);

  let body: { inbox_message_id?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!body.inbox_message_id) return json({ error: "inbox_message_id required" }, 400);

  const cfg = await loadConfig();
  if (!cfg.enabled) return json({ skipped: "parser_disabled" });

  const { data: msg } = await admin.from("inbox_messages")
    .select("id, channel, subject, body, body_html, contact_id, contact_identifier, email_message_id, direction, attachments")
    .eq("id", body.inbox_message_id)
    .maybeSingle();
  if (!msg) return json({ skipped: "message_not_found" });
  if (msg.channel !== "email") return json({ skipped: "not_email" });
  if (msg.direction !== "in") return json({ skipped: "not_incoming" });

  const sourceKey = `email:${msg.id}`;
  const { data: existing } = await admin.from("reservation_requests").select("id").eq("source_message_id", sourceKey).maybeSingle();
  if (existing) return json({ skipped: "already_processed", reservation_request_id: (existing as { id: string }).id });

  // Carrega empresas ativas pra identificar (LLM + heuristica)
  const allCompanies = await loadActiveCompanies();
  // Hint pre-LLM: tenta match por dominio + alias + nome no corpo
  let company = matchCompanyHeuristic(allCompanies, msg.contact_identifier ?? "", msg.subject ?? "", msg.body ?? msg.body_html ?? "");

  if (!cfg.always_classify && !company) {
    const senderLow = (msg.contact_identifier ?? "").toLowerCase();
    const subjectLow = (msg.subject ?? "").toLowerCase();
    const senderMatch = (cfg.sender_whitelist ?? []).some(d => senderLow.includes(d.toLowerCase()));
    const subjectMatch = (cfg.subject_keywords ?? []).some(k => subjectLow.includes(k.toLowerCase()));
    if (!senderMatch && !subjectMatch) return json({ skipped: "heuristic_no_match" });
  }

  const botCfg = await loadBotConfig();
  if (!botCfg?.api_key) return json({ skipped: "no_llm_key" });
  if (botCfg.provider !== "claude" && botCfg.provider !== "groq") return json({ skipped: `provider_not_supported: ${botCfg.provider}` });

  const attRefs = (msg.attachments ?? []) as AttachmentRef[];
  const downloadedAtt = await loadAttachments(attRefs);

  // Vouchers de link (B2B etc): extrai URLs dos dominios configurados, baixa HTML, manda como contexto pro LLM
  const voucherUrls = extractVoucherUrls(`${msg.body ?? ""}\n${msg.body_html ?? ""}`, cfg.voucher_url_domains ?? []);
  const vouchers: Array<{ url: string; text: string }> = [];
  for (const url of voucherUrls) {
    const text = await fetchVoucherText(url);
    if (text) vouchers.push({ url, text });
  }

  let extracted: Extracted;
  try {
    extracted = await extractReservation(botCfg, msg.subject ?? "", msg.body ?? "", msg.body_html ?? "", downloadedAtt, company, allCompanies, vouchers);
  } catch (err) {
    return json({ error: "llm_failed", detail: err instanceof Error ? err.message : String(err) }, 500);
  }

  // LLM pode ter identificado a empresa pelo conteudo (ex: Star/Accenture -> Petrorio)
  if (extracted.company_name) {
    const llmMatched = matchCompanyByName(allCompanies, extracted.company_name);
    if (llmMatched) company = llmMatched;
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
  const billingObsCombined = [
    extracted.billing_obs,
    extracted.extras ? `Extras: ${extracted.extras}` : null,
  ].filter(Boolean).join(" | ") || null;

  const { data: inserted, error } = await admin.from("reservation_requests").insert([{
    guest_name: extracted.guest_name,
    check_in: extracted.check_in,
    check_out: extracted.check_out,
    status: "REQUESTED",
    company_id: company?.id ?? null,
    total_amount: extracted.total_amount ?? 0,
    reservation_code: code,
    tariff: extracted.tariff ?? 0,
    category: extracted.category ?? cfg.default_category ?? "executivo",
    guests_per_uh: (extracted.adults ?? 1) + (extracted.children ?? 0),
    adults: extracted.adults ?? 1,
    children: extracted.children ?? 0,
    contact_email: extracted.contact_email ?? msg.contact_identifier,
    contact_phone: extracted.contact_phone ?? null,
    source: extracted.source ?? (company ? company.name.toUpperCase() : "EMAIL"),
    requested_by: extracted.requested_by ?? "bot-email-parser",
    cost_center: extracted.cost_center ?? null,
    billing_obs: billingObsCombined,
    fiscal_data: extracted.fiscal_data ?? null,
    payment_method: extracted.payment_method ?? (company ? "BILLED" : "CREDIT_CARD"),
    billing_info: extracted.billing_info ?? null,
    source_message_id: sourceKey,
  }]).select("id, reservation_code").single();
  if (error) return json({ error: error.message }, 500);

  return json({
    created: true,
    reservation_request_id: (inserted as { id: string }).id,
    code: (inserted as { reservation_code: string }).reservation_code,
    company: company?.name ?? null,
    attachments_processed: downloadedAtt.length,
    vouchers_fetched: vouchers.length,
    extracted,
  });
});
