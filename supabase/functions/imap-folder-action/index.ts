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
  user: string;
  pass: string;
  imapHost?: string;
  imapPort?: string;
};

type Action = "spam" | "trash" | "inbox" | "delete";

const FOLDER_CANDIDATES: Record<Action, string[]> = {
  spam: ["Spam", "Junk", "INBOX.Spam", "INBOX.Junk", "[Gmail]/Spam"],
  trash: ["Trash", "Lixeira", "INBOX.Trash", "[Gmail]/Trash", "Deleted Items"],
  inbox: ["INBOX"],
  delete: [],
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Supabase is not configured." }, 500);

  try {
    const body = await req.json();
    const messageId = String(body?.messageId ?? "").trim();
    const action = String(body?.action ?? "") as Action;
    if (!messageId || !["spam", "trash", "inbox", "delete"].includes(action)) {
      return json({ error: "messageId and valid action are required." }, 400);
    }

    const { data: message, error: messageError } = await adminClient
      .from("inbox_messages")
      .select("id, channel, direction, message_uid, folder, contact_id")
      .eq("id", messageId)
      .maybeSingle();

    if (messageError) throw messageError;
    if (!message) return json({ error: "Message not found." }, 404);
    if (message.channel !== "email") {
      return json({ error: "Folder actions only available for email." }, 400);
    }

    const smtp = await loadSmtpConfig();
    if (!smtp?.imapHost || !smtp.user || !smtp.pass) {
      return json({ error: "IMAP is not configured." }, 400);
    }

    // For outbound messages (no UID) just update DB.
    if (message.direction === "in" && message.message_uid) {
      const currentFolderForServer = mapDbFolderToImap(message.folder);
      const client = new ImapClient(smtp.imapHost, Number(smtp.imapPort || 993));
      await client.connect();
      try {
        await client.login(smtp.user, smtp.pass);
        await client.select(currentFolderForServer);

        if (action === "delete") {
          await client.markDeleted(message.message_uid);
          await client.expunge();
        } else {
          const target = await client.findExistingFolder(FOLDER_CANDIDATES[action]);
          if (!target) {
            throw new Error(`Pasta de destino "${action}" não encontrada no servidor IMAP.`);
          }
          await client.moveOrCopy(message.message_uid, target);
        }
        await client.logout();
      } finally {
        client.close();
      }
    }

    // Update DB state.
    if (action === "delete") {
      await adminClient.from("inbox_messages").delete().eq("id", messageId);
    } else {
      await adminClient
        .from("inbox_messages")
        .update({ folder: action })
        .eq("id", messageId);
    }

    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return json({ error: message }, 500);
  }
});

function mapDbFolderToImap(folder: string) {
  if (folder === "spam") return "Spam";
  if (folder === "trash") return "Trash";
  return "INBOX";
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

class ImapClient {
  private conn: Deno.TlsConn | null = null;
  private decoder = new TextDecoder();
  private encoder = new TextEncoder();
  private tag = 0;
  private buffer = "";

  constructor(private host: string, private port: number) {}

  async connect() {
    this.conn = await Deno.connectTls({ hostname: this.host, port: this.port });
    await this.readUntil(/^\* OK/m);
  }

  async login(user: string, pass: string) {
    await this.command(`LOGIN ${quote(user)} ${quote(pass)}`);
  }

  async select(folder: string) {
    await this.command(`SELECT ${quote(folder)}`);
  }

  async moveOrCopy(uid: string, target: string) {
    try {
      await this.command(`UID MOVE ${uid} ${quote(target)}`);
    } catch {
      await this.command(`UID COPY ${uid} ${quote(target)}`);
      await this.command(`UID STORE ${uid} +FLAGS.SILENT (\\Deleted)`);
      await this.command("EXPUNGE");
    }
  }

  async markDeleted(uid: string) {
    await this.command(`UID STORE ${uid} +FLAGS.SILENT (\\Deleted)`);
  }

  async expunge() {
    await this.command("EXPUNGE");
  }

  async findExistingFolder(candidates: string[]) {
    for (const name of candidates) {
      try {
        const response = await this.command(`LIST "" ${quote(name)}`);
        if (/\* LIST/i.test(response)) return name;
      } catch {
        // try next
      }
    }
    return null;
  }

  async logout() {
    try { await this.command("LOGOUT"); } catch { /* ignore */ }
  }

  close() {
    try { this.conn?.close(); } catch { /* already closed */ }
  }

  private async command(command: string) {
    const tag = `A${(++this.tag).toString().padStart(4, "0")}`;
    await this.write(`${tag} ${command}\r\n`);
    const response = await this.readUntil(new RegExp(`^${tag} (OK|NO|BAD)`, "im"));
    if (!new RegExp(`^${tag} OK`, "im").test(response)) {
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
    const buf = new Uint8Array(8192);
    while (!pattern.test(this.buffer)) {
      const read = await this.conn.read(buf);
      if (read === null) break;
      this.buffer += this.decoder.decode(buf.subarray(0, read), { stream: true });
    }
    const match = this.buffer.match(pattern);
    if (!match) return this.buffer;
    const endIdx = (match.index ?? 0) + match[0].length;
    const tail = this.buffer.indexOf("\r\n", endIdx);
    const consumeEnd = tail === -1 ? this.buffer.length : tail + 2;
    const slice = this.buffer.slice(0, consumeEnd);
    this.buffer = this.buffer.slice(consumeEnd);
    return slice;
  }
}

function quote(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
