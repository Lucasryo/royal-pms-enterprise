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
  body: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Supabase is not configured." }, 500);

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
      const unseenUids = await client.searchUnseen();
      let processed = 0;

      for (const uid of unseenUids) {
        const raw = await client.fetchMessage(uid);
        const parsed = parseEmail(raw);
        if (!parsed.fromEmail || !parsed.body) {
          await client.markSeen(uid);
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
            message_uid: uid,
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

        await client.markSeen(uid);
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
  const { data, error } = await adminClient
    .from("marketing_contacts")
    .upsert({
      email: email.fromEmail,
      name: email.fromName || email.fromEmail,
      channel: "email",
      last_message: emailPreview(email),
      last_message_at: new Date().toISOString(),
      status: "new",
      sentiment: "neutral",
      updated_at: new Date().toISOString(),
    }, { onConflict: "email" })
    .select("id, unread_count")
    .single();

  if (error) throw error;
  return data as { id: string; unread_count: number | null };
}

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
    } catch {
      // Connection may already be closed by LOGOUT.
    }
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
  const body = extractReadableBody(bodyText, headers["content-type"] ?? "", headers["content-transfer-encoding"] ?? "");
  return { fromEmail, fromName, subject, body };
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

function extractReadableBody(body: string, contentType: string, encoding: string) {
  const boundary = contentType.match(/boundary="?([^";]+)"?/i)?.[1];
  if (boundary) {
    const parts = body.split(`--${boundary}`);
    const plain = parts.find((part) => /content-type:\s*text\/plain/i.test(part));
    const html = parts.find((part) => /content-type:\s*text\/html/i.test(part));
    return cleanBody(decodePart(plain || html || parts[0] || "", ""));
  }

  return cleanBody(decodePart(body, encoding));
}

function decodePart(part: string, fallbackEncoding: string) {
  const splitAt = part.indexOf("\n\n");
  const headerText = splitAt >= 0 ? part.slice(0, splitAt) : "";
  const content = splitAt >= 0 ? part.slice(splitAt + 2) : part;
  const headers = parseHeaders(headerText);
  const encoding = (headers["content-transfer-encoding"] || fallbackEncoding).toLowerCase();

  if (encoding.includes("base64")) return decodeBase64(content);
  if (encoding.includes("quoted-printable")) return decodeQuotedPrintable(content);
  return content;
}

function decodeBase64(text: string) {
  try {
    const binary = atob(text.replace(/\s/g, ""));
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  } catch {
    return text;
  }
}

function decodeQuotedPrintable(text: string) {
  const compact = text.replace(/=\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < compact.length; i += 1) {
    if (compact[i] === "=" && /^[0-9A-F]{2}$/i.test(compact.slice(i + 1, i + 3))) {
      bytes.push(Number.parseInt(compact.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(compact.charCodeAt(i));
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function decodeHeader(value: string) {
  return value.replace(/=\?([^?]+)\?([BQ])\?([^?]+)\?=/gi, (_match, _charset, encoding, encoded) => {
    if (encoding.toUpperCase() === "B") return decodeBase64(encoded);
    return decodeQuotedPrintable(encoded.replace(/_/g, " "));
  });
}

function extractEmail(value: string) {
  return (value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "").toLowerCase();
}

function emailPreview(email: ParsedEmail) {
  const body = email.body.replace(/\s+/g, " ").trim();
  return email.subject ? `${email.subject} - ${body}`.slice(0, 500) : body.slice(0, 500);
}

function cleanBody(value: string) {
  const withoutMarkup = value
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCharCode(Number.parseInt(code, 16)));

  return normalizeEmailBody(withoutMarkup)
    .slice(0, 12000);
}

function normalizeEmailBody(value: string) {
  const lines = value
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""));

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
    .replace(/[ \u00a0]{2,}/g, " ")
    .replace(/\n[ \u00a0]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
