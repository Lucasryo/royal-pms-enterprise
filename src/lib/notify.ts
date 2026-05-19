import { supabase } from '../supabase';
import { Company, FiscalFile, Reservation } from '../types';

/* ============================================================
 * notify — helper de envio de email via Resend
 *  - carrega recipients e from de app_settings (cache em memoria)
 *  - templates HTML por canal
 *  - falha silenciosa (loga, nao quebra a acao do usuario)
 * ============================================================ */

export type RecipientChannel =
  | 'reception'
  | 'reservations'
  | 'finance'
  | 'faturamento'
  | 'reservation_created'
  | 'overdue_digest';

type Recipients = Partial<Record<RecipientChannel, string[]>>;

let cache: { recipients: Recipients; from?: string; loadedAt: number } | null = null;
const CACHE_MS = 60_000;

async function loadConfig() {
  if (cache && Date.now() - cache.loadedAt < CACHE_MS) return cache;
  const [r, f] = await Promise.all([
    supabase.from('app_settings').select('value').eq('id', 'notification_recipients').maybeSingle(),
    supabase.from('app_settings').select('value').eq('id', 'notification_from').maybeSingle(),
  ]);
  const recipients = parseJson<Recipients>(r.data?.value) || {};
  const from = (f.data?.value as string | undefined) || undefined;
  cache = { recipients, from, loadedAt: Date.now() };
  return cache;
}

export function invalidateNotifyCache() { cache = null; }

function parseJson<T>(v: unknown): T | null {
  if (!v) return null;
  if (typeof v === 'object') return v as T;
  try { return JSON.parse(String(v)) as T; } catch { return null; }
}

async function send(channel: RecipientChannel, subject: string, html: string) {
  try {
    const cfg = await loadConfig();
    const to = (cfg.recipients[channel] || []).filter(Boolean);
    if (to.length === 0) {
      console.info(`[notify] canal "${channel}" sem destinatarios`);
      return { skipped: true };
    }
    const { data, error } = await supabase.functions.invoke('send-resend-email', {
      body: { to, subject, html, from: cfg.from },
    });
    if (error) throw error;
    return data;
  } catch (e) {
    console.error('[notify] falha em', channel, e);
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/* === Templates === */

const STAGE_LABEL: Record<string, string> = {
  reception: 'Recepção',
  reservations: 'Reservas',
  finance: 'Financeiro / Faturamento',
  completed: 'Concluído',
};
const STAGE_CHANNEL: Record<string, RecipientChannel | null> = {
  reception: 'reception',
  reservations: 'reservations',
  finance: 'finance',
  completed: null, // não notifica
};

export async function notifyStageAdvanced(
  file: FiscalFile,
  newStage: string,
  fromStage: string | undefined,
  companyName?: string,
  movedBy?: string,
) {
  const channel = STAGE_CHANNEL[newStage];
  if (!channel) return { skipped: true };
  const subject = `[Royal PMS] Nota chegou em ${STAGE_LABEL[newStage]} · ${companyName || 'sem cliente'}`;
  const html = renderShell({
    eyebrow: `Rastreio · ${STAGE_LABEL[newStage]}`,
    title: `Uma nota precisa da sua atenção em ${STAGE_LABEL[newStage]}`,
    bodyHtml: `
      <p>Foi movida ${fromStage ? `de <strong>${esc(STAGE_LABEL[fromStage] || fromStage)}</strong> ` : ''}para <strong>${esc(STAGE_LABEL[newStage])}</strong> por ${esc(movedBy || 'um usuário')}.</p>
      ${kvBlock([
        ['Documento', esc(file.original_name || '-')],
        ['Cliente', esc(companyName || '-')],
        ['NH', esc(file.nh || '-')],
        ['OS', esc(file.event_os_number || '-')],
        ['Vencimento', fmtDate(file.due_date)],
        ['Valor', file.amount ? money(Number(file.amount)) : '-'],
      ])}
      <p style="margin-top:18px;font-size:12px;color:#777">Entre no PMS para conferir e seguir o fluxo.</p>
    `,
  });
  return send(channel, subject, html);
}

export async function notifyReservationCreated(r: Reservation, company?: Company) {
  const subject = `[Royal PMS] Nova reserva ${r.reservation_code || ''} · ${r.guest_name || 'hóspede'}`;
  const html = renderShell({
    eyebrow: 'Reservas · Nova entrada',
    title: `Nova reserva ${r.reservation_code || ''}`,
    bodyHtml: `
      ${kvBlock([
        ['Hóspede', esc(r.guest_name || '-')],
        ['Empresa', esc(company?.name || '-')],
        ['UH', esc(r.room_number || '-')],
        ['Check-in', fmtDate(r.check_in)],
        ['Check-out', fmtDate(r.check_out)],
        ['Categoria', esc(r.category || '-')],
        ['Total', r.total_amount ? money(Number(r.total_amount)) : '-'],
        ['Status', esc(r.status || '-')],
      ])}
      <p style="margin-top:18px;font-size:12px;color:#777">Verifique a solicitação no PMS.</p>
    `,
  });
  return send('reservation_created', subject, html);
}

export async function triggerOverdueDigest() {
  // delega pra edge function notify-finance-digest (faz query agregada)
  try {
    const { data, error } = await supabase.functions.invoke('notify-finance-digest', { body: {} });
    if (error) throw error;
    return data;
  } catch (e) {
    console.error('[notify] digest', e);
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/* === Render helpers === */

function renderShell(parts: { eyebrow: string; title: string; bodyHtml: string }) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f5f5f4;font-family:-apple-system,Segoe UI,sans-serif;color:#222">
    <div style="max-width:600px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb">
      <div style="background:#0a0a0a;color:white;padding:20px 24px">
        <div style="font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#fbbf24">${esc(parts.eyebrow)}</div>
        <div style="margin-top:6px;font-size:20px;font-weight:900;line-height:1.3">${esc(parts.title)}</div>
      </div>
      <div style="padding:20px 24px">${parts.bodyHtml}</div>
      <div style="padding:14px 24px;font-size:11px;color:#9ca3af;border-top:1px solid #eee">Royal PMS · mensagem automática</div>
    </div></body></html>`;
}
function kvBlock(rows: Array<[string, string]>) {
  return `<table style="width:100%;border-collapse:collapse;margin-top:6px">${rows.map(([k, v]) => `
    <tr>
      <td style="padding:6px 0;color:#777;font-size:11px;text-transform:uppercase;letter-spacing:.06em;width:40%">${esc(k)}</td>
      <td style="padding:6px 0;color:#111;font-weight:700;font-size:13px">${v}</td>
    </tr>`).join('')}</table>`;
}
function esc(s: string) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
function money(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function fmtDate(s?: string) {
  if (!s) return '-';
  try { return new Date(s).toLocaleDateString('pt-BR'); } catch { return s; }
}
