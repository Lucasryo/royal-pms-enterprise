import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

/* ============================================================
 * send-resend-email
 *  - Funcao generica de envio via Resend
 *  - Requer secret: RESEND_API_KEY
 *  - Aceita { to, subject, html, from?, replyTo? }
 *  - from default vem do body ou cai num placeholder seguro
 * ============================================================ */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const DEFAULT_FROM = Deno.env.get("RESEND_DEFAULT_FROM") ?? "Royal PMS <onboarding@resend.dev>";

type Body = {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY nao configurada" }, 500);

  try {
    const body = (await req.json()) as Body;
    const to = Array.isArray(body.to) ? body.to : [body.to];
    const recipients = to.map((s) => String(s || "").trim()).filter(Boolean);
    if (recipients.length === 0) return json({ error: "Sem destinatarios" }, 400);
    if (!body.subject?.trim()) return json({ error: "Assunto obrigatorio" }, 400);
    if (!body.html?.trim()) return json({ error: "Corpo obrigatorio" }, 400);

    const payload = {
      from: body.from || DEFAULT_FROM,
      to: recipients,
      subject: body.subject,
      html: body.html,
      ...(body.replyTo ? { reply_to: body.replyTo } : {}),
    };

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("Resend error", res.status, data);
      return json({ error: data?.message || `Resend HTTP ${res.status}`, detail: data }, 502);
    }
    return json({ sent: true, id: data?.id, recipients });
  } catch (e) {
    console.error("send-resend-email", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
