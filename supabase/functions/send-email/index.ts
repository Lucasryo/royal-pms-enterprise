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

// Minimal SMTP client using raw TCP — avoids denomailer STARTTLS issues with Locaweb
class SmtpSender {
  private conn!: Deno.TlsConn | Deno.TcpConn;
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();
  private buf = new Uint8Array(65536);

  async connect(host: string, port: number, tls: boolean) {
    if (tls) {
      this.conn = await Deno.connectTls({ hostname: host, port });
    } else {
      this.conn = await Deno.connect({ hostname: host, port });
    }
    await this.readLine(); // 220 greeting
  }

  async send(cmd: string) {
    await this.conn.write(this.encoder.encode(cmd + "\r\n"));
  }

  async readLine(): Promise<string> {
    let result = "";
    const single = new Uint8Array(1);
    while (true) {
      await this.conn.read(single);
      const ch = this.decoder.decode(single);
      if (ch === "\n") break;
      if (ch !== "\r") result += ch;
    }
    // Read continuation lines (e.g. "250-..." multi-line responses)
    while (result[3] === "-") {
      let line = "";
      while (true) {
        await this.conn.read(single);
        const ch = this.decoder.decode(single);
        if (ch === "\n") break;
        if (ch !== "\r") line += ch;
      }
      result = line;
    }
    const code = parseInt(result.substring(0, 3), 10);
    if (code >= 400) throw new Error(`SMTP error ${code}: ${result.substring(4)}`);
    return result;
  }

  async cmd(command: string): Promise<string> {
    await this.send(command);
    return this.readLine();
  }

  async upgradeToTls(host: string) {
    await this.send("STARTTLS");
    await this.readLine();
    this.conn = await Deno.startTls(this.conn as Deno.TcpConn, { hostname: host });
  }

  async sendEmail(opts: {
    host: string; port: number; user: string; pass: string;
    from: string; to: string; subject: string; body: string; fromDisplay: string;
  }) {
    const useSsl = opts.port === 465;
    await this.connect(opts.host, opts.port, useSsl);

    await this.cmd(`EHLO ${opts.host}`);

    if (!useSsl) {
      // STARTTLS upgrade for port 587
      try {
        await this.upgradeToTls(opts.host);
        await this.cmd(`EHLO ${opts.host}`);
      } catch {
        // Some servers don't require STARTTLS — continue without it
      }
    }

    // AUTH LOGIN
    await this.cmd("AUTH LOGIN");
    await this.cmd(btoa(opts.user));
    await this.cmd(btoa(opts.pass));

    await this.cmd(`MAIL FROM:<${opts.from}>`);
    await this.cmd(`RCPT TO:<${opts.to}>`);
    await this.cmd("DATA");

    const date = new Date().toUTCString();
    const message = [
      `From: ${opts.fromDisplay} <${opts.from}>`,
      `To: ${opts.to}`,
      `Subject: ${opts.subject}`,
      `Date: ${date}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=UTF-8`,
      `Content-Transfer-Encoding: 8bit`,
      ``,
      opts.body,
      `.`,
    ].join("\r\n");

    await this.send(message);
    await this.readLine(); // 250 OK

    await this.cmd("QUIT");
    this.conn.close();
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const { to, subject, body: bodyText } = await req.json();

    if (!to || !subject || !bodyText) {
      return json({ error: "to, subject e body são obrigatórios" }, 400);
    }

    const { data, error } = await adminClient
      .from("app_settings")
      .select("value")
      .eq("id", "smtp_config")
      .maybeSingle();

    if (error || !data?.value) {
      return json({ error: "SMTP não configurado. Configure em Integrações." }, 400);
    }

    const cfg = data.value as {
      host: string; port: string; user: string; pass: string; fromName: string;
    };

    if (!cfg.host || !cfg.user || !cfg.pass) {
      return json({ error: "Configuração SMTP incompleta." }, 400);
    }

    const port = parseInt(cfg.port ?? "465", 10);
    const sender = new SmtpSender();

    await sender.sendEmail({
      host: cfg.host,
      port,
      user: cfg.user,
      pass: cfg.pass,
      from: cfg.user,
      to,
      subject,
      body: bodyText,
      fromDisplay: cfg.fromName ?? "Hotel",
    });

    return json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro inesperado";
    return json({ error: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
