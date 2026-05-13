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
  signatureName?: string;
  signatureRole?: string;
  signaturePhone?: string;
  signatureWebsite?: string;
  signatureAddress?: string;
  signatureLogoUrl?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Supabase is not configured." }, 500);

  try {
    const body = await req.json();
    const to = cleanEmail(body?.to);
    const subject = cleanSubject(body?.subject);
    const message = cleanBody(body?.body);
    const inReplyTo = cleanMessageId(body?.inReplyTo);
    const references = cleanReferences(body?.references, inReplyTo);

    if (!to || !subject || !message) {
      return json({ error: "Destinatario, assunto e mensagem sao obrigatorios." }, 400);
    }

    const smtpConfig = await loadSmtpConfig();
    if (!smtpConfig?.host || !smtpConfig.user || !smtpConfig.pass) {
      return json({ error: "SMTP nao esta configurado." }, 400);
    }

    const smtp = new SmtpClient(smtpConfig.host, Number(smtpConfig.port || 587));
    await smtp.connect();
    try {
      await smtp.ehlo();
      if (Number(smtpConfig.port || 587) !== 465) {
        await smtp.startTls();
        await smtp.ehlo();
      }
      await smtp.authLogin(smtpConfig.user, smtpConfig.pass);
      const messageId = await smtp.sendMail({
        fromEmail: smtpConfig.user,
        fromName: smtpConfig.fromName || smtpConfig.user,
        to,
        subject,
        body: message,
        html: buildHtmlEmail(message, smtpConfig),
        inReplyTo,
        references,
      });
      await smtp.quit();
      return json({ sent: true, messageId });
    } finally {
      smtp.close();
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

class SmtpClient {
  private conn: Deno.Conn | Deno.TlsConn | null = null;
  private decoder = new TextDecoder();
  private encoder = new TextEncoder();

  constructor(private host: string, private port: number) {}

  async connect() {
    this.conn = this.port === 465
      ? await Deno.connectTls({ hostname: this.host, port: this.port })
      : await Deno.connect({ hostname: this.host, port: this.port });
    await this.readResponse([220]);
  }

  async ehlo() {
    await this.command(`EHLO royal-pms.local`, [250]);
  }

  async startTls() {
    await this.command("STARTTLS", [220]);
    if (!this.conn) throw new Error("SMTP connection is not open.");
    this.conn = await Deno.startTls(this.conn, { hostname: this.host });
  }

  async authLogin(user: string, pass: string) {
    await this.command("AUTH LOGIN", [334]);
    await this.command(base64(user), [334], false);
    await this.command(base64(pass), [235], false);
  }

  async sendMail({ fromEmail, fromName, to, subject, body, html, inReplyTo, references }: { fromEmail: string; fromName: string; to: string; subject: string; body: string; html: string; inReplyTo: string | null; references: string | null }) {
    await this.command(`MAIL FROM:<${fromEmail}>`, [250]);
    await this.command(`RCPT TO:<${to}>`, [250, 251]);
    await this.command("DATA", [354]);

    const boundary = `royal-pms-${crypto.randomUUID()}`;
    const messageId = createMessageId(fromEmail);
    const headers = [
      `From: ${encodeAddress(fromName, fromEmail)}`,
      `To: <${to}>`,
      `Subject: ${encodeHeader(subject)}`,
      `Message-ID: ${messageId}`,
      ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`] : []),
      ...(references ? [`References: ${references}`] : []),
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      `Date: ${new Date().toUTCString()}`,
    ];

    const mimeBody = [
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      body,
      "",
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      html,
      "",
      `--${boundary}--`,
    ].join("\r\n");

    await this.write(`${headers.join("\r\n")}\r\n\r\n${dotStuff(mimeBody)}\r\n.\r\n`);
    await this.readResponse([250]);
    return messageId;
  }

  async quit() {
    await this.command("QUIT", [221]);
  }

  close() {
    try {
      this.conn?.close();
    } catch {
      // Connection may already be closed.
    }
  }

  private async command(text: string, expectedCodes: number[], appendCrLf = true) {
    await this.write(appendCrLf ? `${text}\r\n` : `${text}\r\n`);
    return this.readResponse(expectedCodes);
  }

  private async write(text: string) {
    if (!this.conn) throw new Error("SMTP connection is not open.");
    await this.conn.write(this.encoder.encode(text));
  }

  private async readResponse(expectedCodes: number[]) {
    if (!this.conn) throw new Error("SMTP connection is not open.");
    let response = "";
    const buffer = new Uint8Array(4096);

    while (true) {
      const read = await this.conn.read(buffer);
      if (read === null) break;
      response += this.decoder.decode(buffer.subarray(0, read), { stream: true });
      const lines = response.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] ?? "";
      if (/^\d{3} /.test(last)) {
        const code = Number(last.slice(0, 3));
        if (!expectedCodes.includes(code)) {
          throw new Error(`SMTP error ${code}: ${last.slice(4) || response.trim()}`);
        }
        return response;
      }
    }

    throw new Error("SMTP connection closed unexpectedly.");
  }
}

function cleanEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function cleanSubject(value: unknown) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 240);
}

function cleanBody(value: unknown) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim().slice(0, 12000);
}

function cleanMessageId(value: unknown) {
  const match = String(value ?? "").match(/<[^<>\s]+@[^<>\s]+>/);
  return match?.[0] ?? null;
}

function cleanReferences(value: unknown, inReplyTo: string | null) {
  const refs = String(value ?? "").match(/<[^<>\s]+@[^<>\s]+>/g) ?? [];
  if (inReplyTo && !refs.includes(inReplyTo)) refs.push(inReplyTo);
  return refs.length ? refs.join(" ").slice(0, 2000) : null;
}

function createMessageId(fromEmail: string) {
  const domain = fromEmail.split("@")[1]?.replace(/[^a-z0-9.-]/gi, "") || "royal-pms.local";
  return `<${crypto.randomUUID()}@${domain}>`;
}

function base64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function encodeHeader(value: string) {
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${base64(value)}?=`;
}

function encodeAddress(name: string, email: string) {
  return `${encodeHeader(name)} <${email}>`;
}

function dotStuff(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n").replace(/^\./gm, "..");
}

function buildHtmlEmail(message: string, config: SmtpConfig) {
  const lines = escapeHtml(message).replace(/\n/g, "<br>");
  const signatureName = escapeHtml(config.signatureName || config.fromName || "Royal Macaé Palace Hotel");
  const signatureRole = escapeHtml(config.signatureRole || "Reservas");
  const phone = escapeHtml(config.signaturePhone || "");
  const website = escapeHtml(config.signatureWebsite || "");
  const address = escapeHtml(config.signatureAddress || "");
  const logo = String(config.signatureLogoUrl || "").trim();

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f5f2;font-family:Arial,Helvetica,sans-serif;color:#171717;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:94%;background:#ffffff;border:1px solid #e7e5e4;border-radius:8px;">
            <tr>
              <td style="padding:28px 32px;font-size:15px;line-height:1.65;color:#262626;">
                ${lines}
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 30px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="border-top:1px solid #e7e5e4;padding-top:18px;width:100%;">
                  <tr>
                    ${logo ? `<td style="width:68px;vertical-align:top;padding-right:14px;"><img src="${escapeAttribute(logo)}" width="54" height="54" alt="" style="display:block;object-fit:contain;border-radius:6px;border:1px solid #eee;background:#fff;"></td>` : ""}
                    <td style="vertical-align:top;">
                      <div style="font-size:15px;font-weight:700;color:#171717;margin-bottom:2px;">${signatureName}</div>
                      <div style="font-size:13px;font-weight:700;color:#b7791f;margin-bottom:8px;">${signatureRole}</div>
                      ${phone ? `<div style="font-size:12px;color:#525252;margin-bottom:2px;">${phone}</div>` : ""}
                      ${website ? `<div style="font-size:12px;color:#525252;margin-bottom:2px;"><a href="${escapeAttribute(website)}" style="color:#a16207;text-decoration:none;">${website}</a></div>` : ""}
                      ${address ? `<div style="font-size:12px;color:#737373;">${address}</div>` : ""}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
