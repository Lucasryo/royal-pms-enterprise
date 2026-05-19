import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

/* ============================================================
 * notify-finance-digest
 *  - Le recipients de app_settings.notification_recipients.overdue_digest
 *  - Calcula vencidos hoje (FATURAS com due_date < hoje, status != PAID)
 *  - Envia digest HTML por Resend
 *  - Pode ser invocado manualmente ou via cron (pg_cron) diariamente
 * ============================================================ */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const DEFAULT_FROM = Deno.env.get("RESEND_DEFAULT_FROM") ?? "Royal PMS <onboarding@resend.dev>";

const FINANCIAL_TYPES = ["FATURA", "Hospedagem", "Alimentação", "Lavanderia", "Eventos", "Transporte", "Fatura Evento"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY nao configurada" }, 500);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: "Supabase nao configurado" }, 500);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    const settings = await admin.from("app_settings").select("value").eq("id", "notification_recipients").maybeSingle();
    const recipients = parseRecipients(settings.data?.value);
    const targets = (recipients?.overdue_digest as string[] | undefined)?.filter(Boolean) ?? [];
    if (targets.length === 0) return json({ skipped: "Sem destinatarios em overdue_digest" });

    const fromSettings = await admin.from("app_settings").select("value").eq("id", "notification_from").maybeSingle();
    const from = (fromSettings.data?.value as string | undefined) || DEFAULT_FROM;

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString().slice(0, 10);

    const filesRes = await admin
      .from("files")
      .select("*")
      .in("type", FINANCIAL_TYPES)
      .eq("is_deleted", false)
      .lt("due_date", todayIso)
      .neq("status", "PAID")
      .neq("status", "CANCELLED")
      .order("due_date", { ascending: true });
    const files = filesRes.data ?? [];

    const companyIds = Array.from(new Set(files.map((f: any) => f.company_id).filter(Boolean)));
    const compRes = companyIds.length
      ? await admin.from("companies").select("id, name").in("id", companyIds)
      : { data: [] };
    const companyMap = new Map((compRes.data ?? []).map((c: any) => [c.id, c.name]));

    const total = files.reduce((s: number, f: any) => s + Number(f.amount || 0), 0);

    const subject = `[Royal PMS] Vencidos hoje · ${files.length} fatura(s) · ${money(total)}`;
    const html = buildDigestHtml(files, companyMap, total);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: targets, subject, html }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("Resend error", res.status, data);
      return json({ error: data?.message || `Resend HTTP ${res.status}` }, 502);
    }
    return json({ sent: true, recipients: targets, total_files: files.length, total_amount: total });
  } catch (e) {
    console.error("notify-finance-digest", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, 500);
  }
});

function parseRecipients(v: unknown): Record<string, string[]> | null {
  if (!v) return null;
  if (typeof v === "object") return v as Record<string, string[]>;
  try { return JSON.parse(String(v)); } catch { return null; }
}

function money(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(s?: string) {
  if (!s) return "-";
  try { return new Date(s).toLocaleDateString("pt-BR"); } catch { return s; }
}

function buildDigestHtml(files: any[], companies: Map<string, string>, total: number) {
  const rows = files.map((f) => {
    const daysOver = f.due_date ? Math.floor((Date.now() - new Date(f.due_date).getTime()) / 86_400_000) : 0;
    return `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;">
          <div style="font-weight:700;color:#111">${escapeHtml(companies.get(f.company_id) || "-")}</div>
          <div style="color:#777;font-size:12px">${escapeHtml(f.original_name || "")}</div>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#555;font-size:12px;">${fmtDate(f.due_date)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#b91c1c;font-size:12px;font-weight:700;">${daysOver}d</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:800;color:#111;">${money(Number(f.amount || 0))}</td>
      </tr>`;
  }).join("");

  return `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f5f5f4;font-family:-apple-system,Segoe UI,sans-serif;color:#222;">
    <div style="max-width:680px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:#0a0a0a;color:white;padding:20px 24px;">
        <div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#fbbf24;">Royal PMS · Financeiro</div>
        <div style="margin-top:6px;font-size:22px;font-weight:900;">Digest de vencidos · ${new Date().toLocaleDateString("pt-BR")}</div>
        <div style="margin-top:4px;color:#9ca3af;font-size:13px;">${files.length} fatura(s) atrasada(s) · total ${money(total)}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="background:#fafafa;">
          <th style="text-align:left;padding:10px 12px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#777;">Cliente / Documento</th>
          <th style="text-align:left;padding:10px 12px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#777;">Venceu</th>
          <th style="text-align:left;padding:10px 12px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#777;">Atraso</th>
          <th style="text-align:right;padding:10px 12px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#777;">Valor</th>
        </tr></thead>
        <tbody>${rows || `<tr><td colspan="4" style="padding:24px;text-align:center;color:#9ca3af;">Sem vencidos hoje.</td></tr>`}</tbody>
      </table>
      <div style="padding:14px 24px;font-size:11px;color:#9ca3af;border-top:1px solid #eee;">Acesse o PMS para cobrar ou conciliar. Esta mensagem foi gerada automaticamente.</div>
    </div></body></html>`;
}

function escapeHtml(s: string) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
