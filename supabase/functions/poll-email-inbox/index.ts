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

const MAX_INLINE_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB cap por imagem inline

type SmtpConfig = {
  host: string;
  port: string;
  user: string;
  pass: string;
  fromName: string;
  imapHost?: string;
  imapPort?: string;
};

type ParsedEmail = {
  fromEmail: string;
  fromName: string;
  subject: string;
  body: string;       // text/plain (sempre presente, pode ser stripped de HTML)
  bodyHtml: string | null; // text/html sanitizado, com cid: resolvidos como data URLs
  messageId: string | null;
  references: string | null;
};

type MimePart = {
  contentType: string;   // ex: "text/html"
  charset: string;       // ex: "utf-8" (lowercase)
  encoding: string;      // ex: "quoted-printable"
  contentId: string | null;
  disposition: string;   // "inline" | "attachment" | ""
  filename: string | null;
  raw: string;           // conteúdo bruto (encoded)
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Supabase is not configured." }, 500);

  // Parse body opcional para suportar { mode: "reparse" }
  let payload: { mode?: string; limit?: number } = {};
  try {
    const text = await req.text();
    if (text) payload = JSON.parse(text);
  } catch { /* ignora body inválido */ }

  try {
    const smtpConfig = await loadSmtpConfig();
    if (!smtpConfig?.imapHost || !smtpConfig.user || !smtpConfig.pass) {
      return json({ processed: 0, skipped: "IMAP is not configured." });
    }

    const client = new ImapClient(smtpConfig.imapHost, Number(smtpConfig.imapPort || 993));
    await client.connect();
    try {
      await client.login(smtpConfig.user, smtpConfig.pass);
      await client.selectInbox();

      if (payload.mode === "reparse") {
        const limit = Math.min(Math.max(payload.limit ?? 30, 1), 100);
        const result = await reparseLegacy(client, limit);
        await client.logout();
        return json(result);
      }

      const unseenUids = await client.searchUnseen();

      // NÃO marca como lido no servidor IMAP (deixa unread no Locaweb webmail).
      // Em vez disso, filtra os UIDs que já temos no DB para não processar de novo.
      let candidateUids = unseenUids;
      if (unseenUids.length > 0) {
        const { data: known } = await adminClient
          .from("inbox_messages")
          .select("message_uid")
          .eq("channel", "email")
          .in("message_uid", unseenUids);
        const knownSet = new Set((known ?? []).map((r: { message_uid: string | null }) => r.message_uid));
        candidateUids = unseenUids.filter(uid => !knownSet.has(uid));
      }

      let processed = 0;

      for (const uid of candidateUids) {
        const raw = await client.fetchMessage(uid);
        const parsed = parseEmail(raw);
        if (!parsed.fromEmail || (!parsed.body && !parsed.bodyHtml)) {
          continue;
        }

        const contact = await upsertContact(parsed);
        const { error } = await adminClient
          .from("inbox_messages")
          .insert([{
            contact_id: contact.id,
            contact_identifier: parsed.fromEmail,
            channel: "email",
            direction: "in",
            subject: parsed.subject,
            body: parsed.body,
            body_html: parsed.bodyHtml,
            message_uid: uid,
            email_message_id: parsed.messageId,
            email_references: parsed.references,
            read: false,
          }]);

        if (!error) {
          await adminClient
            .from("marketing_contacts")
            .update({
              last_message: emailPreview(parsed),
              last_message_at: new Date().toISOString(),
              unread_count: (contact.unread_count ?? 0) + 1,
              status: "new",
              updated_at: new Date().toISOString(),
            })
            .eq("id", contact.id);
          processed += 1;
        } else if (error.code !== "23505") {
          console.warn(`Failed to insert inbox message ${uid}: ${error.message}`);
        }
      }

      await client.logout();
      return json({ processed });
    } finally {
      client.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return json({ error: message }, 500);
  }
});

// Re-baixa do IMAP os emails antigos que estão no banco com body_html=null
// e reaplica o novo parser. Faz em batches (limit).
async function reparseLegacy(client: ImapClient, limit: number) {
  const { data: rows, error } = await adminClient
    .from("inbox_messages")
    .select("id, message_uid, contact_id, body, body_html")
    .eq("channel", "email")
    .eq("direction", "in")
    .is("body_html", null)
    .not("message_uid", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  if (!rows || rows.length === 0) {
    return { mode: "reparse", reprocessed: 0, skipped: 0, remaining: 0 };
  }

  let reprocessed = 0;
  let skipped = 0;
  for (const row of rows as Array<{ id: string; message_uid: string }>) {
    try {
      const raw = await client.fetchMessage(row.message_uid);
      // UID FETCH returns "(BODY[] {N}" body ")" on miss vs preserved body on hit.
      // Se vier vazio (mensagem deletada do servidor), pula.
      if (!raw || raw.length < 50) {
        skipped += 1;
        // Marca pra não tentar de novo: grava string vazia no body_html (não null)
        await adminClient.from("inbox_messages").update({ body_html: "" }).eq("id", row.id);
        continue;
      }
      const parsed = parseEmail(raw);
      if (!parsed.body && !parsed.bodyHtml) {
        skipped += 1;
        await adminClient.from("inbox_messages").update({ body_html: "" }).eq("id", row.id);
        continue;
      }
      const { error: updError } = await adminClient
        .from("inbox_messages")
        .update({
          subject: parsed.subject || undefined,
          body: parsed.body || row.body,
          body_html: parsed.bodyHtml || "",
        })
        .eq("id", row.id);
      if (updError) {
        console.warn(`[reparse] update failed ${row.id}: ${updError.message}`);
        skipped += 1;
      } else {
        reprocessed += 1;
      }
    } catch (err) {
      skipped += 1;
      console.warn(`[reparse] fetch failed uid=${row.message_uid}: ${err instanceof Error ? err.message : err}`);
      // Não marca como processado — pode tentar de novo
    }
  }

  // Conta quantos ainda faltam
  const { count } = await adminClient
    .from("inbox_messages")
    .select("id", { count: "exact", head: true })
    .eq("channel", "email")
    .eq("direction", "in")
    .is("body_html", null)
    .not("message_uid", "is", null);

  return { mode: "reparse", reprocessed, skipped, remaining: count ?? 0 };
}

async function loadSmtpConfig() {
  const { data, error } = await adminClient
    .from("app_settings")
    .select("value")
    .eq("id", "smtp_config")
    .maybeSingle();

  if (error) throw error;
  if (!data?.value) return null;
  return JSON.parse(data.value) as SmtpConfig;
}

async function upsertContact(email: ParsedEmail) {
  // Detecta se este email é resposta de uma thread existente.
  // Procura por qualquer Message-ID referenciado em References/In-Reply-To
  // que já exista em inbox_messages — se achar, herda o contact_id (mesmo thread).
  const refIds = (email.references ?? "").match(/<[^<>\s]+@[^<>\s]+>/g) ?? [];
  if (refIds.length > 0) {
    const { data: existing } = await adminClient
      .from("inbox_messages")
      .select("contact_id")
      .in("email_message_id", refIds)
      .eq("channel", "email")
      .limit(1);
    if (existing && existing[0]?.contact_id) {
      // Reply para thread existente — atualiza dados do contato sem criar nova row.
      const { data: c, error } = await adminClient
        .from("marketing_contacts")
        .update({
          name: email.fromName || email.fromEmail,
          last_message: emailPreview(email),
          last_message_at: new Date().toISOString(),
          status: "new",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing[0].contact_id)
        .select("id, unread_count")
        .single();
      if (!error && c) return c as { id: string; unread_count: number | null };
    }
  }

  // Novo thread — cria nova row dedicada (thread_root_message_id = message id deste email).
  // Permite múltiplas conversas do mesmo email aparecerem como cards separados.
  const threadRoot = email.messageId;
  const { data, error } = await adminClient
    .from("marketing_contacts")
    .insert({
      email: email.fromEmail,
      name: email.fromName || email.fromEmail,
      channel: "email",
      thread_root_message_id: threadRoot,
      last_message: emailPreview(email),
      last_message_at: new Date().toISOString(),
      status: "new",
      sentiment: "neutral",
      updated_at: new Date().toISOString(),
    })
    .select("id, unread_count")
    .single();

  if (error) {
    // Edge case: já existe row com mesmo (email, thread_root_message_id) → faz upsert
    if (error.code === "23505") {
      const { data: existing2 } = await adminClient
        .from("marketing_contacts")
        .select("id, unread_count")
        .eq("email", email.fromEmail)
        .eq("thread_root_message_id", threadRoot ?? "")
        .maybeSingle();
      if (existing2) return existing2 as { id: string; unread_count: number | null };
    }
    throw error;
  }
  return data as { id: string; unread_count: number | null };
}

// ─── IMAP Client ──────────────────────────────────────────────────────────────

class ImapClient {
  private conn: Deno.TlsConn | null = null;
  private decoder = new TextDecoder();
  private encoder = new TextEncoder();
  private tag = 0;

  constructor(private host: string, private port: number) {}

  async connect() {
    this.conn = await Deno.connectTls({ hostname: this.host, port: this.port });
    await this.readUntil(/\* OK/i);
  }

  async login(user: string, pass: string) {
    await this.command(`LOGIN ${quote(user)} ${quote(pass)}`);
  }

  async selectInbox() {
    await this.command("SELECT INBOX");
  }

  async searchUnseen() {
    const response = await this.command("UID SEARCH UNSEEN");
    const match = response.match(/\* SEARCH\s+([0-9\s]*)/i);
    return (match?.[1] ?? "").trim().split(/\s+/).filter(Boolean);
  }

  async fetchMessage(uid: string) {
    const response = await this.command(`UID FETCH ${uid} (BODY.PEEK[])`);
    const firstLineEnd = response.indexOf("\r\n");
    const tagged = response.lastIndexOf("\r\nA");
    if (firstLineEnd >= 0 && tagged > firstLineEnd) {
      return response.slice(firstLineEnd + 2, tagged);
    }
    return response;
  }

  async markSeen(uid: string) {
    await this.command(`UID STORE ${uid} +FLAGS.SILENT (\\Seen)`);
  }

  async logout() {
    await this.command("LOGOUT");
  }

  close() {
    try {
      this.conn?.close();
    } catch { /* já fechado */ }
  }

  private async command(command: string) {
    const tag = `A${(++this.tag).toString().padStart(4, "0")}`;
    await this.write(`${tag} ${command}\r\n`);
    const response = await this.readUntil(new RegExp(`${tag} (OK|NO|BAD)`, "i"));
    if (!new RegExp(`${tag} OK`, "i").test(response)) {
      throw new Error(`IMAP command failed: ${command}`);
    }
    return response;
  }

  private async write(text: string) {
    if (!this.conn) throw new Error("IMAP connection is not open.");
    await this.conn.write(this.encoder.encode(text));
  }

  private async readUntil(pattern: RegExp) {
    if (!this.conn) throw new Error("IMAP connection is not open.");
    const chunks: string[] = [];
    const buffer = new Uint8Array(8192);
    while (true) {
      const read = await this.conn.read(buffer);
      if (read === null) break;
      chunks.push(this.decoder.decode(buffer.subarray(0, read), { stream: true }));
      const text = chunks.join("");
      if (pattern.test(text)) return text;
    }
    return chunks.join("");
  }
}

function quote(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

// ─── Email parsing ────────────────────────────────────────────────────────────

function parseEmail(raw: string): ParsedEmail {
  const normalized = raw.replace(/\r\n/g, "\n");
  const splitAt = normalized.indexOf("\n\n");
  const headerText = splitAt >= 0 ? normalized.slice(0, splitAt) : "";
  const bodyText = splitAt >= 0 ? normalized.slice(splitAt + 2) : normalized;
  const headers = parseHeaders(headerText);

  const from = decodeHeader(headers.from ?? "");
  const fromEmail = extractEmail(from);
  const fromName = from.replace(/<[^>]+>/g, "").replace(/"/g, "").trim();
  const subject = decodeHeader(headers.subject ?? "");
  const messageId = cleanMessageId(headers["message-id"] ?? "");
  const references = cleanReferences(headers.references ?? headers["in-reply-to"] ?? "");

  const topContentType = headers["content-type"] ?? "text/plain; charset=utf-8";
  const topEncoding = headers["content-transfer-encoding"] ?? "";

  const parts = collectMimeParts(bodyText, topContentType, topEncoding);

  // Decodifica parts text/plain e text/html
  const plainParts = parts.filter(p => /^text\/plain/i.test(p.contentType));
  const htmlParts = parts.filter(p => /^text\/html/i.test(p.contentType));
  const inlineImages = parts.filter(p =>
    /^image\//i.test(p.contentType) && (p.disposition === "inline" || p.contentId)
  );

  const bodyPlain = plainParts.length > 0
    ? decodePartToText(plainParts[0])
    : (htmlParts.length > 0 ? cleanHtmlToText(decodePartToText(htmlParts[0])) : "");

  let bodyHtml: string | null = null;
  if (htmlParts.length > 0) {
    const rawHtml = decodePartToText(htmlParts[0]);
    bodyHtml = inlineCidImages(rawHtml, inlineImages);
  }

  return {
    fromEmail,
    fromName,
    subject,
    body: cleanBody(bodyPlain),
    bodyHtml,
    messageId,
    references,
  };
}

function parseHeaders(text: string) {
  const unfolded = text.replace(/\n[ \t]+/g, " ");
  const headers: Record<string, string> = {};
  for (const line of unfolded.split("\n")) {
    const index = line.indexOf(":");
    if (index <= 0) continue;
    headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
  }
  return headers;
}

// Coleta todas as parts MIME recursivamente, achatando multipart aninhado.
function collectMimeParts(body: string, contentType: string, encoding: string): MimePart[] {
  const boundary = contentType.match(/boundary="?([^";\s]+)"?/i)?.[1];

  if (!boundary) {
    // Não é multipart — é uma part única
    return [{
      contentType: contentType.replace(/;.*$/, "").trim().toLowerCase(),
      charset: extractCharset(contentType),
      encoding: encoding.toLowerCase(),
      contentId: null,
      disposition: "",
      filename: null,
      raw: body,
    }];
  }

  const rawParts = body.split(`--${boundary}`);
  const result: MimePart[] = [];
  for (const raw of rawParts) {
    const p = raw.replace(/^\n/, "").replace(/\n$/, "");
    if (!p || p.startsWith("--")) continue;

    const splitAt = p.indexOf("\n\n");
    const partHeaders = parseHeaders(splitAt >= 0 ? p.slice(0, splitAt) : "");
    const partContent = splitAt >= 0 ? p.slice(splitAt + 2) : p;
    const partType = partHeaders["content-type"] ?? "text/plain";

    if (/^multipart\//i.test(partType)) {
      // Recursão
      result.push(...collectMimeParts(partContent, partType, partHeaders["content-transfer-encoding"] ?? ""));
    } else {
      result.push({
        contentType: partType.replace(/;.*$/, "").trim().toLowerCase(),
        charset: extractCharset(partType),
        encoding: (partHeaders["content-transfer-encoding"] ?? "").toLowerCase(),
        contentId: cleanContentId(partHeaders["content-id"] ?? ""),
        disposition: (partHeaders["content-disposition"] ?? "").split(";")[0].trim().toLowerCase(),
        filename: extractFilename(partHeaders["content-disposition"] ?? partHeaders["content-type"] ?? ""),
        raw: partContent,
      });
    }
  }
  return result;
}

function extractCharset(contentType: string): string {
  return (contentType.match(/charset="?([^";\s]+)"?/i)?.[1] ?? "utf-8").toLowerCase();
}

function extractFilename(headerValue: string): string | null {
  return headerValue.match(/filename="?([^";]+)"?/i)?.[1]?.trim() ?? null;
}

function cleanContentId(value: string): string | null {
  const match = value.match(/<?([^<>\s]+@?[^<>\s]*)>?/);
  return match?.[1] ? match[1].trim() : null;
}

// Decodifica part text/* respeitando charset
function decodePartToText(part: MimePart): string {
  const bytes = decodeToBytes(part.raw, part.encoding);
  return bytesToString(bytes, part.charset);
}

function decodePartToBytes(part: MimePart): Uint8Array {
  return decodeToBytes(part.raw, part.encoding);
}

function decodeToBytes(content: string, encoding: string): Uint8Array {
  const enc = encoding.toLowerCase();
  if (enc.includes("base64")) {
    try {
      const binary = atob(content.replace(/\s/g, ""));
      return Uint8Array.from(binary, c => c.charCodeAt(0));
    } catch {
      return new TextEncoder().encode(content);
    }
  }
  if (enc.includes("quoted-printable")) {
    const compact = content.replace(/=\r?\n/g, "");
    const bytes: number[] = [];
    for (let i = 0; i < compact.length; i += 1) {
      if (compact[i] === "=" && /^[0-9A-F]{2}$/i.test(compact.slice(i + 1, i + 3))) {
        bytes.push(Number.parseInt(compact.slice(i + 1, i + 3), 16));
        i += 2;
      } else {
        bytes.push(compact.charCodeAt(i));
      }
    }
    return new Uint8Array(bytes);
  }
  // 7bit, 8bit, binary, none: trata como string e codifica para UTF-8 bytes
  // (a string já vem decodificada do socket TLS como UTF-8, então isso preserva)
  return new TextEncoder().encode(content);
}

function bytesToString(bytes: Uint8Array, charset: string): string {
  const cs = normalizeCharset(charset);
  try {
    return new TextDecoder(cs, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
}

function normalizeCharset(charset: string): string {
  const cs = charset.toLowerCase().trim();
  if (cs === "us-ascii" || cs === "ascii") return "windows-1252"; // mais permissivo
  if (cs === "iso-8859-1" || cs === "latin1") return "windows-1252";
  return cs;
}

// Substitui src="cid:xxx" no HTML pelas data URLs das imagens inline correspondentes
function inlineCidImages(html: string, inlineImages: MimePart[]): string {
  if (inlineImages.length === 0) return html;

  let result = html;
  for (const img of inlineImages) {
    if (!img.contentId) continue;
    const bytes = decodePartToBytes(img);
    if (bytes.length > MAX_INLINE_IMAGE_BYTES) continue;
    const dataUrl = `data:${img.contentType};base64,${bytesToBase64(bytes)}`;
    // Replace todas as ocorrências de cid:CONTENTID (com ou sem aspas)
    const escapedCid = img.contentId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`cid:${escapedCid}`, "gi");
    result = result.replace(re, dataUrl);
  }

  // Remove qualquer `[cid:xxx]` ou `cid:xxx` órfão restante (referências sem anexo correspondente)
  result = result.replace(/\[cid:[^\]]+\]/gi, "");
  result = result.replace(/src=["']?cid:[^"'\s>]+["']?/gi, "src=\"\"");

  return result;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// Decodifica header MIME encoded-word: =?charset?B/Q?...?=
function decodeHeader(value: string): string {
  if (!value) return "";
  // Junta encoded-words adjacentes (whitespace entre eles deve ser ignorado)
  const collapsed = value.replace(/\?=\s+=\?/g, "?==?");
  return collapsed.replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi, (_match, charset, encoding, encoded) => {
    const cs = normalizeCharset(charset);
    if (encoding.toUpperCase() === "B") {
      try {
        const binary = atob(encoded.replace(/\s/g, ""));
        const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
        return new TextDecoder(cs, { fatal: false }).decode(bytes);
      } catch {
        return encoded;
      }
    }
    // Q-encoding: =XX (hex), _ vira espaço
    const text = encoded.replace(/_/g, " ");
    const bytes: number[] = [];
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] === "=" && /^[0-9A-F]{2}$/i.test(text.slice(i + 1, i + 3))) {
        bytes.push(Number.parseInt(text.slice(i + 1, i + 3), 16));
        i += 2;
      } else {
        bytes.push(text.charCodeAt(i));
      }
    }
    return new TextDecoder(cs, { fatal: false }).decode(new Uint8Array(bytes));
  });
}

function extractEmail(value: string) {
  return (value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "").toLowerCase();
}

function cleanMessageId(value: string) {
  const match = value.match(/<[^<>\s]+@[^<>\s]+>/);
  return match?.[0] ?? null;
}

function cleanReferences(value: string) {
  const refs = value.match(/<[^<>\s]+@[^<>\s]+>/g) ?? [];
  return refs.length ? refs.join(" ").slice(0, 2000) : null;
}

function emailPreview(email: ParsedEmail) {
  const body = (email.body || "").replace(/\s+/g, " ").trim();
  return email.subject ? `${email.subject} - ${body}`.slice(0, 500) : body.slice(0, 500);
}

function cleanHtmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

function cleanBody(value: string) {
  return normalizeEmailBody(value).slice(0, 20000);
}

function normalizeEmailBody(value: string) {
  const lines = value
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .split("\n")
    .map(line => line.replace(/\s+$/g, ""));

  const cleaned: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^>/.test(trimmed)) break;
    if (/^Em .+ escreveu:$/i.test(trimmed)) break;
    if (/^On .+ wrote:$/i.test(trimmed)) break;
    if (/^De:\s|^From:\s|^Enviado:\s|^Sent:\s|^Para:\s|^To:\s|^Assunto:\s|^Subject:\s/i.test(trimmed)) break;
    if (/^-{2,}\s*(Original Message|Mensagem original)\s*-{2,}$/i.test(trimmed)) break;
    cleaned.push(line);
  }

  return cleaned
    .join("\n")
    .replace(/[  ]{2,}/g, " ")
    .replace(/\n[  ]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
