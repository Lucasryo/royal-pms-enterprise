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
  auto_confirm_enabled: boolean;
  auto_confirm_sender_whitelist: string[];
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
  external_reservation_code?: string;
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
  company_cnpj?: string;
};

class GroqRateLimitError extends Error {
  retryAfterSeconds: number | null;
  detail: string;

  constructor(detail: string, retryAfterSeconds: number | null) {
    super("Groq rate limit reached");
    this.name = "GroqRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
    this.detail = detail;
  }
}

async function loadConfig(): Promise<ParserConfig> {
  const defaults: ParserConfig = {
    enabled: false, always_classify: false,
    sender_whitelist: ["booking.com", "airbnb.com", "expedia.com"],
    subject_keywords: ["reserva", "booking", "reservation", "confirmation"],
    min_confidence: "medium", default_category: "executivo",
    voucher_url_domains: ["b2breservas.com.br"],
    auto_confirm_enabled: false,
    auto_confirm_sender_whitelist: [],
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

type CompanyRow = { id: string; name: string; cnpj: string | null; email_domain: string | null; parser_aliases: string[] | null };

async function loadActiveCompanies(): Promise<CompanyRow[]> {
  const { data } = await admin.from("companies")
    .select("id, name, cnpj, email_domain, parser_aliases")
    .ilike("status", "active");
  return (data ?? []) as CompanyRow[];
}

function normalizeCnpj(s: string): string {
  return s.replace(/\D/g, "");
}

function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scoreCompanyCandidate(c: CompanyRow, senderDomain: string, haystack: string, companyNameHint = ""): number {
  let score = 0;
  const normalizedHaystack = normalizeText(haystack);
  const normalizedHint = normalizeText(companyNameHint);
  const aliases = (c.parser_aliases ?? []).map(a => a.trim()).filter(Boolean);

  if (c.email_domain && senderDomain && c.email_domain.toLowerCase() === senderDomain) score += 100;

  for (const alias of aliases) {
    const normalizedAlias = normalizeText(alias);
    if (normalizedAlias.length >= 3 && normalizedHaystack.includes(normalizedAlias)) score += Math.min(70, normalizedAlias.length);
    if (normalizedHint && normalizedAlias === normalizedHint) score += 90;
  }

  const normalizedName = normalizeText(c.name);
  if (normalizedName && normalizedHaystack.includes(normalizedName)) score += 60;
  if (normalizedHint && normalizedName === normalizedHint) score += 90;

  return score;
}

function pickBestCompany(candidates: CompanyRow[], senderDomain: string, haystack: string, companyNameHint = ""): CompanyRow | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  const ranked = candidates
    .map(c => ({ c, score: scoreCompanyCandidate(c, senderDomain, haystack, companyNameHint) }))
    .sort((a, b) => b.score - a.score);
  return ranked[0].score > 0 ? ranked[0].c : candidates[0];
}

function matchCompanyHeuristic(companies: CompanyRow[], senderEmail: string, subject: string, body: string): CompanyRow | null {
  const senderDomain = senderEmail.split("@")[1]?.toLowerCase() ?? "";
  const haystack = `${senderEmail}\n${subject}\n${body}`.toLowerCase();
  const haystackDigits = normalizeCnpj(haystack);
  // 1) CNPJ bate (mais confiavel); se houver centros de custo com o mesmo CNPJ,
  // desempata por domínio, aliases ou nome mencionado no e-mail.
  const byCnpj = companies.filter(c => {
    const cnpjDigits = c.cnpj ? normalizeCnpj(c.cnpj) : "";
    return cnpjDigits.length === 14 && haystackDigits.includes(cnpjDigits);
  });
  const bestByCnpj = pickBestCompany(byCnpj, senderDomain, haystack);
  if (bestByCnpj) return bestByCnpj;
  // 2) dominio bate exato; se houver mais de um card no mesmo domínio, desempata.
  const byDomain = pickBestCompany(
    companies.filter(c => c.email_domain && senderDomain && c.email_domain.toLowerCase() === senderDomain),
    senderDomain,
    haystack,
  );
  if (byDomain) return byDomain;
  // 3) algum alias aparece no remetente/assunto/corpo
  for (const c of companies) {
    for (const alias of c.parser_aliases ?? []) {
      const a = alias.trim().toLowerCase();
      if (a.length >= 3 && haystack.includes(a)) return c;
    }
  }
  // 4) nome da empresa aparece no corpo
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

function matchCompanyByCnpj(companies: CompanyRow[], cnpj: string, senderEmail = "", subject = "", body = "", companyNameHint = ""): CompanyRow | null {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return null;
  const senderDomain = senderEmail.split("@")[1]?.toLowerCase() ?? "";
  const haystack = `${senderEmail}\n${subject}\n${body}`;
  const candidates = companies.filter(c => c.cnpj && normalizeCnpj(c.cnpj) === digits);
  return pickBestCompany(candidates, senderDomain, haystack, companyNameHint);
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

type VoucherFetchResult = { url: string; html: string; text: string };

async function fetchVoucherText(url: string): Promise<VoucherFetchResult | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const r = await fetch(url, { signal: controller.signal, headers: { "user-agent": "Mozilla/5.0 (RoyalPMS-bot)" } });
    clearTimeout(timeout);
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") ?? "";
    if (!ct.includes("text/html") && !ct.includes("text/plain")) return null;
    const html = await r.text();
    return { url, html: html.slice(0, 200_000), text: htmlToText(html).slice(0, 12000) };
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
        external_reservation_code: { type: "string", description: "Codigo externo da reserva/voucher/OTA/agencia/empresa. Ex: Booking confirmation number, codigo B2B, localizador, voucher number. Omitir se nao existir claramente." },
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
        company_cnpj: { type: "string", description: "CNPJ da empresa cliente quando aparece no voucher/email (qualquer formato, ex: '12.345.678/0001-00' ou '12345678000100'). Usado como chave de match mais confiavel que nome." },
      },
      required: ["is_reservation", "confidence"],
    },
  };
}

function buildSystemPrompt(companyHint: { id: string; name: string } | null, companies: CompanyRow[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const companyContext = companyHint ? `\n\nCONTEXTO: O remetente/conteudo aponta pra "${companyHint.name}" (empresa cadastrada). Assuma is_corporate=true e payment_method=BILLED. Use company_name="${companyHint.name}".` : "";
  const companyList = companies.length > 0
    ? `\n\nEMPRESAS CADASTRADAS (use company_name + company_cnpj pra identificar):\n${companies.map(c => {
        const aliases = (c.parser_aliases ?? []).filter(Boolean).join(", ");
        const parts = [c.name];
        if (c.cnpj) parts.push(`CNPJ ${c.cnpj}`);
        if (aliases) parts.push(`aliases: ${aliases}`);
        return `- ${parts.join(" | ")}`;
      }).join("\n")}\n\nIMPORTANTE: O remetente do email muitas vezes eh AGENCIA (B2B, Star/Accenture, Voetur, Kontik, etc) — a empresa REAL eh a mencionada no voucher/corpo. Preencha company_cnpj quando o CNPJ aparecer no voucher (eh a chave mais confiavel). Use os aliases/nome pra resolver tambem. Se eh agencia mista sem empresa clara, deixe ambos vazios.`
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
- Sempre extraia external_reservation_code quando houver codigo/localizador/numero de voucher claramente identificado. Nao invente codigo.

Datas SEMPRE YYYY-MM-DD (converta de "20/01/2026" ou "20 de janeiro de 2026"). Se incerto sobre algum campo, OMITA (nao invente).
confidence="high" se tem nome+datas+valor. "medium" se faltam alguns. "low" se esta adivinhando.
Se NAO for reserva (newsletter, spam, conversa generica), is_reservation=false com confidence=high.${companyList}${companyContext}`;
}

function cleanExternalCode(value: unknown): string | null {
  const text = String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  if (text.length < 4 || text.length > 80) return null;
  return text.replace(/[^A-Z0-9._/-]/g, "");
}

function cleanCategory(value: unknown, fallback: string): string {
  const category = String(value ?? fallback).trim().toLowerCase();
  return ["executivo", "master", "suite presidencial"].includes(category) ? category : fallback;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanLabelValue(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[\s:;|#-]+/, "")
    .replace(/[\s;|]+$/, "")
    .trim();
}

function parseBrazilianNumber(value: string): number | undefined {
  const normalized = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseFastDate(raw: string): string | null {
  const text = normalizeText(raw).toLowerCase();
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const numeric = text.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (numeric) {
    const day = numeric[1].padStart(2, "0");
    const month = numeric[2].padStart(2, "0");
    const rawYear = numeric[3];
    const currentYear = new Date().getUTCFullYear();
    const year = rawYear ? (rawYear.length === 2 ? `20${rawYear}` : rawYear) : String(currentYear);
    return `${year}-${month}-${day}`;
  }

  const months: Record<string, string> = {
    janeiro: "01", jan: "01",
    fevereiro: "02", fev: "02",
    marco: "03", mar: "03",
    abril: "04", abr: "04",
    maio: "05", mai: "05",
    junho: "06", jun: "06",
    julho: "07", jul: "07",
    agosto: "08", ago: "08",
    setembro: "09", set: "09",
    outubro: "10", out: "10",
    novembro: "11", nov: "11",
    dezembro: "12", dez: "12",
  };
  const named = text.match(/\b(\d{1,2})\s*(?:de\s*)?([a-z]+)\s*(?:de\s*)?(20\d{2})\b/);
  if (named && months[named[2]]) {
    return `${named[3]}-${months[named[2]]}-${named[1].padStart(2, "0")}`;
  }

  return null;
}

function validIsoDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function pickDateNear(text: string, labels: string[]): string | null {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const preferLast = labels.some(label => ["check-out", "check out", "saida", "saída", "departure", "partida"].includes(label));
  for (const line of lines) {
    const low = normalizeText(line).toLowerCase();
    if (labels.some(label => low.includes(label))) {
      const dates = extractAllDates(line).sort();
      if (dates.length > 0) return preferLast ? dates[dates.length - 1] : dates[0];
      const parsed = parseFastDate(line);
      if (parsed) return parsed;
    }
  }
  return null;
}

function extractAllDates(text: string): string[] {
  const found: string[] = [];
  const patterns = [
    /\b20\d{2}-\d{2}-\d{2}\b/g,
    /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g,
    /\b\d{1,2}\s*(?:de\s*)?(?:janeiro|jan|fevereiro|fev|marco|mar|abril|abr|maio|mai|junho|jun|julho|jul|agosto|ago|setembro|set|outubro|out|novembro|nov|dezembro|dez)\s*(?:de\s*)?20\d{2}\b/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const parsed = parseFastDate(match[0]);
      if (parsed && !found.includes(parsed)) found.push(parsed);
    }
  }
  return found;
}

function extractFirstByPatterns(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1] ? cleanLabelValue(match[1]) : "";
    if (value.length >= 2 && value.length <= 120) return value;
  }
  return undefined;
}

function extractBestLabelValue(text: string, labels: string[], maxLength = 180): string | undefined {
  const normalizedLabels = labels.map(label => normalizeText(label).toLowerCase());
  const lines = text.split(/\r?\n| {2,}/).map(line => cleanLabelValue(line)).filter(Boolean);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const low = normalizeText(line).toLowerCase();
    for (const label of normalizedLabels) {
      if (low === label || low === `${label}:`) {
        const next = lines[index + 1] ? cleanLabelValue(lines[index + 1]) : "";
        if (next && next.length <= maxLength) return next;
      }
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const inline = low.match(new RegExp(`${escaped}\\s*[:#-]\\s*(.+)$`, "i"));
      if (inline?.[1]) {
        const raw = line.slice(line.toLowerCase().indexOf(inline[1].toLowerCase()));
        const value = cleanLabelValue(raw || inline[1]);
        if (value && value.length <= maxLength) return value;
      }
    }
  }
  return undefined;
}

function mergeExtracted(base: Extracted, patch: Partial<Extracted>): Extracted {
  const out: Extracted = { ...base };
  for (const [key, value] of Object.entries(patch) as Array<[keyof Extracted, Extracted[keyof Extracted]]>) {
    if (value === undefined || value === null || value === "") continue;
    (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

function extractVoucherStructuredData(text: string): Partial<Extracted> {
  const normalized = normalizeText(text);
  const low = normalized.toLowerCase();
  const checkIn = pickDateNear(text, ["check-in", "check in", "entrada", "arrival", "chegada"])
    ?? parseFastDate(extractBestLabelValue(text, ["data entrada", "dt entrada", "entrada"]) ?? "");
  const checkOut = pickDateNear(text, ["check-out", "check out", "saida", "saída", "departure", "partida"])
    ?? parseFastDate(extractBestLabelValue(text, ["data saida", "data saída", "dt saida", "dt saída", "saida", "saída"]) ?? "");
  const code = cleanExternalCode(extractBestLabelValue(text, [
    "voucher", "localizador", "codigo", "código", "reserva", "numero da reserva", "número da reserva",
    "confirmation number", "booking number", "reservation number",
  ]));
  const guest = extractBestLabelValue(text, [
    "hospede", "hóspede", "nome do hospede", "nome do hóspede", "guest", "guest name", "passageiro", "colaborador",
  ]);
  const companyName = extractBestLabelValue(text, [
    "empresa", "cliente", "razao social", "razão social", "company", "corporativo",
  ]);
  const costCenter = extractBestLabelValue(text, [
    "centro de custo", "centro custo", "cost center", "cc", "c.c.", "os", "oe", "dv", "ordem de servico", "ordem de serviço", "projeto",
  ], 120) ?? extractFirstByPatterns(normalized, [
    /\b(?:CC|OS|OE|DV|PROJETO|CENTRO DE CUSTO)\s*[:#-]?\s*([A-Z0-9._/-]{3,80})\b/i,
  ]);
  const billingInfo = extractBestLabelValue(text, [
    "faturamento", "instrucoes de faturamento", "instruções de faturamento", "billing", "forma de pagamento", "pagamento",
  ], 280);
  const billingObs = extractBestLabelValue(text, [
    "observacao", "observação", "observacoes", "observações", "obs", "remarks", "notas", "alertas",
  ], 300);
  const fiscalData = extractBestLabelValue(text, ["cnpj", "dados fiscais", "fiscal"], 220);
  const requestedBy = extractBestLabelValue(text, ["solicitante", "requested by", "responsavel", "responsável", "aprovador"], 120);
  const phone = extractBestLabelValue(text, ["telefone", "phone", "celular", "whatsapp"], 60);
  const email = normalized.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const totalMatch = normalized.match(/(?:total|valor total|valor|amount)\s*[:#-]?\s*(?:r\$)?\s*([\d.,]+)/i)
    ?? normalized.match(/R\$\s*([\d.]+,\d{2})/i);
  const totalAmount = totalMatch?.[1] ? parseBrazilianNumber(totalMatch[1]) : undefined;
  const tariffMatch = normalized.match(/(?:diaria|diária|tarifa|daily rate|rate)\s*[:#-]?\s*(?:r\$)?\s*([\d.,]+)/i);
  const tariff = tariffMatch?.[1] ? parseBrazilianNumber(tariffMatch[1]) : undefined;
  const adultsMatch = normalized.match(/(?:adultos|adults?)\s*[:#-]?\s*(\d{1,2})/i);
  const childrenMatch = normalized.match(/(?:criancas|crianças|children|kids)\s*[:#-]?\s*(\d{1,2})/i);
  const category = low.includes("suite presidencial")
    ? "suite presidencial"
    : low.includes("master")
      ? "master"
      : low.includes("executivo") || low.includes("standard")
        ? "executivo"
        : undefined;
  const extras = [
    low.includes("estacionamento") ? "estacionamento" : null,
    low.includes("lavanderia") ? "lavanderia" : null,
    low.includes("frigobar") ? "frigobar" : null,
    low.includes("cafe") || low.includes("café") ? "cafe da manha" : null,
  ].filter(Boolean).join(", ") || undefined;
  const billingFragments = [
    billingInfo,
    low.includes("extras a parte") || low.includes("extras à parte") ? "extras a parte" : null,
    low.includes("faturar diarias") || low.includes("faturar diárias") ? "faturar diarias" : null,
    low.includes("nota fiscal") || low.includes("nf") ? "nota fiscal" : null,
  ].filter(Boolean).join(" | ") || undefined;

  return {
    external_reservation_code: code ?? undefined,
    guest_name: guest,
    check_in: checkIn ?? undefined,
    check_out: checkOut ?? undefined,
    category,
    company_name: companyName,
    cost_center: costCenter,
    billing_info: billingFragments,
    billing_obs: billingObs,
    fiscal_data: fiscalData,
    requested_by: requestedBy,
    contact_phone: phone,
    contact_email: email,
    total_amount: totalAmount,
    tariff,
    adults: adultsMatch?.[1] ? Math.max(1, Number(adultsMatch[1])) : undefined,
    children: childrenMatch?.[1] ? Math.max(0, Number(childrenMatch[1])) : undefined,
    payment_method: companyName || costCenter || billingFragments ? "BILLED" : undefined,
    extras,
    source: "B2B_VOUCHER",
  };
}

function evaluateExtraction(extracted: Extracted): { extracted: Extracted; sufficient: boolean; reason: string } {
  const hasRequired = Boolean(
    extracted.is_reservation &&
    extracted.guest_name &&
    validIsoDate(extracted.check_in) &&
    validIsoDate(extracted.check_out) &&
    extracted.check_in! < extracted.check_out!,
  );
  return {
    extracted: { ...extracted, confidence: hasRequired ? "high" : extracted.confidence },
    sufficient: hasRequired,
    reason: hasRequired ? "voucher_parser_complete" : "voucher_parser_incomplete",
  };
}

function getCorporateReviewAlerts(extracted: Extracted, hasCompany: boolean): string[] {
  if (!hasCompany) return [];
  const alerts: string[] = [];
  if (!extracted.cost_center) alerts.push("centro de custo");
  if (!extracted.billing_info) alerts.push("instrucoes de faturamento");
  if (!extracted.fiscal_data && !extracted.company_cnpj) alerts.push("dados fiscais/CNPJ");
  if (!extracted.requested_by) alerts.push("solicitante/aprovador");
  return alerts;
}

function extractFastReservation(args: {
  senderEmail: string;
  subject: string;
  body: string;
  bodyHtml: string;
  vouchers: Array<{ url: string; text: string }>;
  defaultCategory: string;
}): { extracted: Extracted; sufficient: boolean; reason: string } {
  const voucherText = args.vouchers.map(v => v.text).join("\n");
  const rawText = [args.subject, args.body, htmlToText(args.bodyHtml), voucherText].filter(Boolean).join("\n");
  const compact = normalizeText(rawText);
  const low = compact.toLowerCase();
  const senderLow = args.senderEmail.toLowerCase();
  const source = senderLow.includes("booking") || low.includes("booking.com")
    ? "BOOKING_COM"
    : senderLow.includes("airbnb") || low.includes("airbnb")
      ? "AIRBNB"
      : senderLow.includes("expedia") || low.includes("expedia") || senderLow.includes("hoteis")
        ? "EXPEDIA"
        : low.includes("voucher") || low.includes("localizador")
          ? "VOUCHER_EMAIL"
          : "EMAIL";

  const hasReservationSignal = [
    "reserva", "reservation", "booking", "confirmation", "confirmacao", "confirmada",
    "voucher", "localizador", "check-in", "check in", "hospede", "guest",
  ].some(token => low.includes(token));

  const stayRequestSubject = args.subject.match(/Hospedagem\s*-\s*(.+?)\s*-\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*a\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  const externalCode = cleanExternalCode(extractFirstByPatterns(compact, [
    /(?:confirmation number|booking number|reservation number|numero da reserva|n[úu]mero da reserva|reserva|localizador|voucher|codigo|c[óo]digo|referencia|refer[êe]ncia)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{3,50})/i,
    /(\b(?:BK|BKG|RSV|RES|LOC|VCH|EML|HTL|AIRBNB|EXP)[-_]?\d{4,}[A-Z0-9._/-]*\b)/i,
  ]));

  const guestName = stayRequestSubject?.[1]?.trim() ?? extractFirstByPatterns(compact, [
    /(?:hospede|hóspede|guest name|guest|nome do hospede|nome do hóspede|cliente|passageiro)\s*[:#-]\s*([^\n\r|,;]{3,120})/i,
    /(?:reserva para|reservation for|booking for)\s+([A-ZÀ-ÿ][^\n\r|,;]{3,120})/i,
  ]);

  const checkIn = pickDateNear(rawText, ["check-in", "check in", "entrada", "arrival", "chegada"]);
  const checkOut = pickDateNear(rawText, ["check-out", "check out", "saida", "saída", "departure", "partida"]);
  const allDates = extractAllDates(rawText).sort();
  const resolvedCheckIn = parseFastDate(stayRequestSubject?.[2] ?? "") ?? checkIn ?? allDates[0];
  const resolvedCheckOut = parseFastDate(stayRequestSubject?.[3] ?? "") ?? checkOut ?? allDates.find(d => resolvedCheckIn && d > resolvedCheckIn);

  const category = low.includes("suite presidencial")
    ? "suite presidencial"
    : low.includes("master")
      ? "master"
      : low.includes("executivo")
        ? "executivo"
        : args.defaultCategory;

  const totalMatch = compact.match(/(?:total|valor total|amount|preco|preço)\s*[:#-]?\s*(?:r\$)?\s*([\d.,]+)/i)
    ?? compact.match(/R\$\s*([\d.]+,\d{2})/i);
  const totalAmount = totalMatch?.[1] ? parseBrazilianNumber(totalMatch[1]) : undefined;

  const adultsMatch = compact.match(/(?:adultos|adults?)\s*[:#-]?\s*(\d{1,2})/i);
  const childrenMatch = compact.match(/(?:criancas|crianças|children|kids)\s*[:#-]?\s*(\d{1,2})/i);
  const emailMatch = compact.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const phoneMatch = compact.match(/(?:telefone|phone|celular|whatsapp)\s*[:#-]?\s*(\+?\d[\d\s().-]{7,24})/i);

  const isReservation = Boolean(hasReservationSignal && (externalCode || (guestName && resolvedCheckIn && resolvedCheckOut)));
  const hasRequired = Boolean(guestName && validIsoDate(resolvedCheckIn) && validIsoDate(resolvedCheckOut) && resolvedCheckIn! < resolvedCheckOut!);
  const sufficient = Boolean(isReservation && hasRequired && externalCode);

  const base: Extracted = {
    is_reservation: isReservation,
    confidence: sufficient ? "high" : (isReservation ? "medium" : "low"),
    guest_name: guestName,
    check_in: resolvedCheckIn,
    check_out: resolvedCheckOut,
    adults: adultsMatch?.[1] ? Math.max(1, Number(adultsMatch[1])) : 1,
    children: childrenMatch?.[1] ? Math.max(0, Number(childrenMatch[1])) : 0,
    category,
    contact_email: emailMatch?.[0] ?? args.senderEmail,
    contact_phone: phoneMatch?.[1] ? cleanLabelValue(phoneMatch[1]) : undefined,
    total_amount: totalAmount,
    tariff: undefined,
    source,
    external_reservation_code: externalCode ?? undefined,
    requested_by: "fast-email-parser",
    notes: "Extraido por parser rapido sem IA.",
  };

  const bodyStructured = extractVoucherStructuredData(rawText);
  const structuredBase = mergeExtracted(base, bodyStructured);
  const voucherStructured = args.vouchers.length > 0
    ? args.vouchers.map(v => extractVoucherStructuredData(v.text)).reduce((acc, item) => mergeExtracted(acc, item), structuredBase)
    : structuredBase;
  const evaluated = evaluateExtraction({ ...voucherStructured, is_reservation: voucherStructured.is_reservation || isReservation });

  return {
    sufficient: evaluated?.sufficient ?? sufficient,
    reason: evaluated?.sufficient
      ? evaluated.reason
      : sufficient
      ? "fast_parser_complete"
      : isReservation
        ? "fast_parser_incomplete"
        : "fast_parser_no_match",
    extracted: evaluated?.extracted ?? base,
  };
}

function iterDates(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  const start = new Date(`${startISO}T12:00:00Z`);
  const end = new Date(`${endISO}T12:00:00Z`);
  for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

async function checkAvailability(
  category: string,
  checkIn: string,
  checkOut: string,
): Promise<{ available: boolean; min_left: number; total: number; full_dates: string[]; reason: string; blocked?: boolean }> {
  const dates = iterDates(checkIn, checkOut);
  const { data: blockedRows } = await admin
    .from("booking_blocked_dates")
    .select("start_date, end_date, reason, category")
    .eq("active", true)
    .lte("start_date", checkOut)
    .gte("end_date", checkIn)
    .or(`category.is.null,category.eq.${category}`);

  type BlockedRow = { start_date: string; end_date: string; reason: string | null };
  const blocked = (blockedRows ?? []) as BlockedRow[];
  const blockedDatesInRange = dates.filter((d) => blocked.some((b) => b.start_date <= d && b.end_date >= d));
  if (blockedDatesInRange.length > 0) {
    const firstBlock = blocked.find((b) => b.start_date <= blockedDatesInRange[0] && b.end_date >= blockedDatesInRange[0]);
    return {
      available: false,
      min_left: 0,
      total: 0,
      full_dates: blockedDatesInRange,
      reason: firstBlock?.reason
        ? `Reservas bloqueadas para este periodo: ${firstBlock.reason}`
        : `Reservas bloqueadas para ${blockedDatesInRange.length} data(s) do periodo.`,
      blocked: true,
    };
  }

  const { data: roomRows } = await admin
    .from("rooms")
    .select("id")
    .eq("category", category)
    .eq("is_virtual", false);
  const total = (roomRows ?? []).length;
  if (total === 0) return { available: false, min_left: 0, total: 0, full_dates: [], reason: "Categoria sem inventario cadastrado." };

  const [resvRes, reqRes] = await Promise.all([
    admin
      .from("reservations")
      .select("check_in, check_out")
      .eq("category", category)
      .neq("status", "CANCELLED")
      .lte("check_in", checkOut)
      .gt("check_out", checkIn),
    admin
      .from("reservation_requests")
      .select("check_in, check_out")
      .eq("category", category)
      .neq("status", "REJECTED")
      .lte("check_in", checkOut)
      .gt("check_out", checkIn),
  ]);

  type Booked = { check_in: string; check_out: string };
  const all: Booked[] = [
    ...((resvRes.data ?? []) as Booked[]),
    ...((reqRes.data ?? []) as Booked[]),
  ];

  let minLeft = total;
  const fullDates: string[] = [];
  for (const date of dates) {
    const occupied = all.filter((r) => r.check_in <= date && r.check_out > date).length;
    const left = total - occupied;
    if (left < minLeft) minLeft = left;
    if (left <= 0) fullDates.push(date);
  }

  return {
    available: minLeft > 0,
    min_left: Math.max(0, minLeft),
    total,
    full_dates: fullDates,
    reason: fullDates.length > 0
      ? `Sem disponibilidade nesta categoria para ${fullDates.length} data(s) do periodo.`
      : "",
  };
}

async function logImportEvent(payload: Record<string, unknown>) {
  try {
    await admin.from("reservation_import_logs").insert([{
      channel: "email",
      event_type: payload.event_type ?? "parser_event",
      inbox_message_id: payload.inbox_message_id ?? null,
      reservation_request_id: payload.reservation_request_id ?? null,
      reservation_id: payload.reservation_id ?? null,
      external_reservation_code: payload.external_reservation_code ?? null,
      source_message_id: payload.source_message_id ?? null,
      reason: payload.reason ?? null,
      payload,
    }]);
  } catch (err) {
    console.warn(`[reservation-import-log] ${err instanceof Error ? err.message : err}`);
  }
}

async function notifyStaffAlert(title: string, message: string) {
  try {
    const { data: staff } = await admin
      .from("profiles")
      .select("id")
      .in("role", ["admin", "manager", "reservations", "finance", "faturamento"]);
    const rows = (staff ?? []).map((member: { id: string }) => ({
      user_id: member.id,
      title,
      message,
      link: "/dashboard",
      read: false,
      timestamp: new Date().toISOString(),
    }));
    if (rows.length > 0) await admin.from("notifications").insert(rows);
  } catch (err) {
    console.warn(`[staff-alert] ${err instanceof Error ? err.message : err}`);
  }
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
    const errorText = await r.text();
    lastErr = `${r.status}: ${errorText.slice(0, 200)}`;
    const retryAfter = Number(r.headers.get("retry-after")) || 0;
    if (r.status === 429) {
      let groqError: { error?: { message?: string; type?: string; code?: string } } | null = null;
      try { groqError = JSON.parse(errorText); } catch { /* ignore */ }
      const message = groqError?.error?.message ?? errorText;
      const isDailyTokenLimit = message.toLowerCase().includes("tokens per day") || message.toLowerCase().includes("tpd");
      if (isDailyTokenLimit || retryAfter > 300) {
        throw new GroqRateLimitError(message.slice(0, 500), retryAfter || null);
      }
    }
    if (r.status !== 429 && r.status < 500) throw new Error(`Groq ${lastErr}`);
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
  if (botCfg.provider === "groq") {
    const compactUserText = userText.length > 5000 ? `${userText.slice(0, 5000)}\n\n[conteudo truncado para reduzir uso de tokens no Groq]` : userText;
    return extractViaGroq(botCfg, systemPrompt, compactUserText, tool);
  }
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
  const { data: existingRequestBySource } = await admin.from("reservation_requests").select("id").eq("source_message_id", sourceKey).maybeSingle();
  if (existingRequestBySource) {
    await logImportEvent({
      event_type: "duplicate_source_message",
      inbox_message_id: msg.id,
      source_message_id: sourceKey,
      reservation_request_id: (existingRequestBySource as { id: string }).id,
      reason: "Mensagem ja processada em reservation_requests.",
    });
    return json({ skipped: "already_processed", reservation_request_id: (existingRequestBySource as { id: string }).id });
  }
  const { data: existingReservationBySource } = await admin.from("reservations").select("id").eq("source_message_id", sourceKey).maybeSingle();
  if (existingReservationBySource) {
    await logImportEvent({
      event_type: "duplicate_source_message",
      inbox_message_id: msg.id,
      source_message_id: sourceKey,
      reservation_id: (existingReservationBySource as { id: string }).id,
      reason: "Mensagem ja processada em reservations.",
    });
    return json({ skipped: "already_confirmed", reservation_id: (existingReservationBySource as { id: string }).id });
  }

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

  const attRefs = (msg.attachments ?? []) as AttachmentRef[];
  const hasParseableAttachments = attRefs.some(a => a.size <= 5 * 1024 * 1024 && (a.mime.startsWith("image/") || a.mime === "application/pdf"));

  // Vouchers de link (B2B etc): para empresas, baixa antes do LLM para preservar faturamento/campos corporativos.
  const voucherUrls = extractVoucherUrls(`${msg.body ?? ""}\n${msg.body_html ?? ""}`, cfg.voucher_url_domains ?? []);
  const vouchers: VoucherFetchResult[] = [];
  let fastResult = extractFastReservation({
    senderEmail: msg.contact_identifier ?? "",
    subject: msg.subject ?? "",
    body: msg.body ?? "",
    bodyHtml: msg.body_html ?? "",
    vouchers,
    defaultCategory: cfg.default_category ?? "executivo",
  });

  let requiresLlmEnrichment = false;

  if ((!fastResult.sufficient || requiresLlmEnrichment) && voucherUrls.length > 0) {
    for (const url of voucherUrls) {
      const voucher = await fetchVoucherText(url);
      if (voucher) vouchers.push(voucher);
    }
    if (vouchers.length > 0) {
      fastResult = extractFastReservation({
        senderEmail: msg.contact_identifier ?? "",
        subject: msg.subject ?? "",
        body: msg.body ?? "",
        bodyHtml: msg.body_html ?? "",
        vouchers,
        defaultCategory: cfg.default_category ?? "executivo",
      });
    }
  }

  requiresLlmEnrichment = Boolean(
    !fastResult.sufficient && (company || hasParseableAttachments),
  );

  let downloadedAtt: Array<{ name: string; mime: string; base64: string }> = [];
  let extracted: Extracted;
  let extractionMethod: "fast_parser" | "llm_parser" = "fast_parser";

  if (fastResult.sufficient && !requiresLlmEnrichment) {
    extracted = fastResult.extracted;
    await logImportEvent({
      event_type: "fast_parser",
      inbox_message_id: msg.id,
      source_message_id: sourceKey,
      reason: fastResult.reason,
      extracted,
    });
  } else {
    const botCfg = await loadBotConfig();
    if (!botCfg?.api_key) {
      await logImportEvent({
        event_type: "manual_review_required",
        inbox_message_id: msg.id,
        source_message_id: sourceKey,
        reason: requiresLlmEnrichment
          ? "Email corporativo/com anexo precisa de enriquecimento LLM, mas bot_config esta sem API key."
          : "Parser rapido incompleto e bot_config sem API key para fallback LLM.",
        requires_llm_enrichment: requiresLlmEnrichment,
        fast_result: fastResult,
      });
      return json({ skipped: "no_llm_key", requires_llm_enrichment: requiresLlmEnrichment, fast_result: fastResult });
    }
    if (botCfg.provider !== "claude" && botCfg.provider !== "groq") return json({ skipped: `provider_not_supported: ${botCfg.provider}`, requires_llm_enrichment: requiresLlmEnrichment, fast_result: fastResult });

    downloadedAtt = await loadAttachments(attRefs);
    extractionMethod = "llm_parser";
    try {
      extracted = await extractReservation(botCfg, msg.subject ?? "", msg.body ?? "", msg.body_html ?? "", downloadedAtt, company, allCompanies, vouchers);
      await logImportEvent({
        event_type: "llm_parser",
        inbox_message_id: msg.id,
        source_message_id: sourceKey,
        reason: fastResult.reason,
        provider: botCfg.provider,
        requires_llm_enrichment: requiresLlmEnrichment,
        fast_result: fastResult,
        extracted,
      });
    } catch (err) {
      if (err instanceof GroqRateLimitError) {
        await logImportEvent({
          event_type: "llm_rate_limited",
          inbox_message_id: msg.id,
          source_message_id: sourceKey,
          reason: "Groq atingiu limite de tokens; email nao foi classificado.",
          retry_after_seconds: err.retryAfterSeconds,
          detail: err.detail,
          requires_llm_enrichment: requiresLlmEnrichment,
          fast_result: fastResult,
        });
        return json({
          skipped: "llm_rate_limited",
          provider: "groq",
          retry_after_seconds: err.retryAfterSeconds,
          detail: err.detail,
          requires_llm_enrichment: requiresLlmEnrichment,
          fast_result: fastResult,
        }, 429);
      }
      return json({ error: "llm_failed", detail: err instanceof Error ? err.message : String(err), requires_llm_enrichment: requiresLlmEnrichment, fast_result: fastResult }, 500);
    }
  }

  // LLM pode ter identificado a empresa pelo conteudo. CNPJ tem prioridade (mais confiavel que nome).
  if (extracted.company_cnpj) {
    const byCnpj = matchCompanyByCnpj(
      allCompanies,
      extracted.company_cnpj,
      msg.contact_identifier ?? "",
      msg.subject ?? "",
      `${msg.body ?? ""}\n${msg.body_html ?? ""}`,
      extracted.company_name ?? "",
    );
    if (byCnpj) company = byCnpj;
  }
  if (!company && extracted.company_name) {
    const byName = matchCompanyByName(allCompanies, extracted.company_name);
    if (byName) company = byName;
  }

  if (!extracted.is_reservation) return json({ skipped: "not_reservation", confidence: extracted.confidence });

  const order: Record<string, number> = { high: 3, medium: 2, low: 1 };
  if ((order[extracted.confidence] ?? 0) < (order[cfg.min_confidence ?? "medium"] ?? 2)) {
    return json({ skipped: "low_confidence", confidence: extracted.confidence, extracted });
  }

  if (!extracted.guest_name || !extracted.check_in || !extracted.check_out) {
    await logImportEvent({
      event_type: "manual_review_required",
      inbox_message_id: msg.id,
      source_message_id: sourceKey,
      reason: "Dados obrigatorios ausentes.",
      parser_method: extractionMethod,
      extracted,
    });
    return json({ skipped: "missing_required", extracted });
  }
  if (extracted.check_in >= extracted.check_out) {
    await logImportEvent({
      event_type: "manual_review_required",
      inbox_message_id: msg.id,
      source_message_id: sourceKey,
      reason: "Datas invalidas.",
      parser_method: extractionMethod,
      extracted,
    });
    return json({ skipped: "invalid_dates", extracted });
  }

  const category = cleanCategory(extracted.category, cfg.default_category ?? "executivo");
  const externalReservationCode = cleanExternalCode(extracted.external_reservation_code);

  if (externalReservationCode) {
    const [duplicateRequest, duplicateReservation] = await Promise.all([
      admin.from("reservation_requests").select("id, reservation_code").eq("external_reservation_code", externalReservationCode).maybeSingle(),
      admin.from("reservations").select("id, reservation_code").eq("external_reservation_code", externalReservationCode).maybeSingle(),
    ]);
    if (duplicateRequest.data || duplicateReservation.data) {
      await logImportEvent({
        event_type: "duplicate_external_code",
        inbox_message_id: msg.id,
        source_message_id: sourceKey,
        external_reservation_code: externalReservationCode,
        reservation_request_id: (duplicateRequest.data as { id?: string } | null)?.id ?? null,
        reservation_id: (duplicateReservation.data as { id?: string } | null)?.id ?? null,
        reason: "Codigo externo ja importado.",
        parser_method: extractionMethod,
        extracted,
      });
      return json({
        skipped: "duplicate_external_reservation_code",
        external_reservation_code: externalReservationCode,
        reservation_request_id: (duplicateRequest.data as { id?: string } | null)?.id ?? null,
        reservation_id: (duplicateReservation.data as { id?: string } | null)?.id ?? null,
      });
    }
  } else {
    const [fallbackRequestDuplicates, fallbackReservationDuplicates] = await Promise.all([
      admin
        .from("reservation_requests")
        .select("id")
        .ilike("guest_name", extracted.guest_name)
        .eq("check_in", extracted.check_in)
        .eq("check_out", extracted.check_out)
        .eq("category", category)
        .neq("status", "REJECTED")
        .limit(1),
      admin
        .from("reservations")
        .select("id")
        .ilike("guest_name", extracted.guest_name)
        .eq("check_in", extracted.check_in)
        .eq("check_out", extracted.check_out)
        .eq("category", category)
        .neq("status", "CANCELLED")
        .limit(1),
    ]);
    if ((fallbackRequestDuplicates.data ?? []).length > 0 || (fallbackReservationDuplicates.data ?? []).length > 0) {
      const requestDuplicateId = ((fallbackRequestDuplicates.data ?? []) as Array<{ id: string }>)[0]?.id ?? null;
      const reservationDuplicateId = ((fallbackReservationDuplicates.data ?? []) as Array<{ id: string }>)[0]?.id ?? null;
      await logImportEvent({
        event_type: "possible_duplicate",
        inbox_message_id: msg.id,
        source_message_id: sourceKey,
        reservation_request_id: requestDuplicateId,
        reservation_id: reservationDuplicateId,
        reason: "Possivel duplicidade por hospede, periodo e categoria sem codigo externo.",
        parser_method: extractionMethod,
        extracted,
      });
      return json({ skipped: "possible_duplicate", reservation_request_id: requestDuplicateId, reservation_id: reservationDuplicateId });
    }
  }

  const availability = await checkAvailability(category, extracted.check_in, extracted.check_out);
  const hasAvailability = availability.available;
  const corporateReviewAlerts = getCorporateReviewAlerts(extracted, Boolean(company));

  const code = "EML-" + Math.random().toString(36).slice(2, 8).toUpperCase();
  const billingObsCombined = [
    !hasAvailability ? `REVISAO: ${availability.reason || "Sem disponibilidade no periodo."}` : null,
    corporateReviewAlerts.length > 0 ? `ALERTA: revisar ${corporateReviewAlerts.join(", ")}` : null,
    extracted.billing_obs,
    extracted.extras ? `Extras: ${extracted.extras}` : null,
    externalReservationCode ? `Codigo externo: ${externalReservationCode}` : null,
  ].filter(Boolean).join(" | ") || null;

  const senderLow = (msg.contact_identifier ?? "").toLowerCase();
  const autoConfirmWhitelist = cfg.auto_confirm_sender_whitelist?.length ? cfg.auto_confirm_sender_whitelist : cfg.sender_whitelist;
  const trustedForAutoConfirm = Boolean(company) || autoConfirmWhitelist.some(d => senderLow.includes(d.toLowerCase()));
  const hasEssentialStayData = Boolean(
    extracted.guest_name &&
    extracted.check_in &&
    extracted.check_out &&
    category &&
    (externalReservationCode || company),
  );
  const canAutoConfirm = Boolean(
    cfg.auto_confirm_enabled &&
    trustedForAutoConfirm &&
    (extracted.confidence === "high" || (company && hasEssentialStayData)) &&
    hasEssentialStayData &&
    hasAvailability,
  );

  const reservationPayload = {
    guest_name: extracted.guest_name,
    check_in: extracted.check_in,
    check_out: extracted.check_out,
    company_id: company?.id ?? null,
    total_amount: extracted.total_amount ?? 0,
    reservation_code: code,
    tariff: extracted.tariff ?? 0,
    category,
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
    external_reservation_code: externalReservationCode,
  };

  if (canAutoConfirm) {
    const { data: confirmed, error: confirmError } = await admin.from("reservations").insert([{
      ...reservationPayload,
      status: "CONFIRMED",
      created_at: new Date().toISOString(),
    }]).select("id, reservation_code").single();
    if (confirmError) return json({ error: confirmError.message }, 500);

    await logImportEvent({
      event_type: "auto_confirmed",
      inbox_message_id: msg.id,
      source_message_id: sourceKey,
      reservation_id: (confirmed as { id: string }).id,
      external_reservation_code: externalReservationCode,
      reason: "Reserva confirmada automaticamente por criterios confiaveis.",
      review_alerts: corporateReviewAlerts,
      parser_method: extractionMethod,
      availability,
      extracted,
    });

    if (corporateReviewAlerts.length > 0) {
      await notifyStaffAlert(
        "Reserva corporativa confirmada com alerta",
        `${extracted.guest_name} foi confirmado para ${extracted.check_in}. Revisar: ${corporateReviewAlerts.join(", ")}.`,
      );
    }

    return json({
      confirmed: true,
      reservation_id: (confirmed as { id: string }).id,
      code: (confirmed as { reservation_code: string }).reservation_code,
      company: company?.name ?? null,
      external_reservation_code: externalReservationCode,
      parser_method: extractionMethod,
      review_alerts: corporateReviewAlerts,
      availability,
      attachments_processed: downloadedAtt.length,
      vouchers_fetched: vouchers.length,
      extracted,
    });
  }

  const { data: inserted, error } = await admin.from("reservation_requests").insert([{
    ...reservationPayload,
    status: "REQUESTED",
  }]).select("id, reservation_code").single();
  if (error) return json({ error: error.message }, 500);

  await logImportEvent({
    event_type: hasAvailability ? "request_created" : "manual_review_required",
    inbox_message_id: msg.id,
    source_message_id: sourceKey,
    reservation_request_id: (inserted as { id: string }).id,
    external_reservation_code: externalReservationCode,
    reason: hasAvailability
      ? (cfg.auto_confirm_enabled ? "Nao atende todos os criterios de auto-confirmacao." : "Auto-confirmacao desativada.")
      : (availability.reason || "Sem disponibilidade no periodo."),
    review_alerts: corporateReviewAlerts,
    parser_method: extractionMethod,
    availability,
    extracted,
  });

  return json({
    created: true,
    reservation_request_id: (inserted as { id: string }).id,
    code: (inserted as { reservation_code: string }).reservation_code,
    company: company?.name ?? null,
    external_reservation_code: externalReservationCode,
    parser_method: extractionMethod,
    review_alerts: corporateReviewAlerts,
    availability,
    auto_confirm_candidate: canAutoConfirm,
    attachments_processed: downloadedAtt.length,
    vouchers_fetched: vouchers.length,
    extracted,
  });
});
