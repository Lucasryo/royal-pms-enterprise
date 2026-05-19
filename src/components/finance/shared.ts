import { FiscalFile } from '../../types';

export const FINANCIAL_TYPES = ['FATURA', 'Hospedagem', 'Alimentação', 'Lavanderia', 'Eventos', 'Transporte', 'Fatura Evento'] as const;

export const money = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });

export const moneyShort = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toFixed(1).replace('.', ',')}k`;
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
};

export const isFinancialFile = (f: FiscalFile) => FINANCIAL_TYPES.includes(f.type as typeof FINANCIAL_TYPES[number]);

export const fileStatus = (f: FiscalFile): 'paid' | 'overdue' | 'pending' | 'disputed' | 'cancelled' => {
  if (f.status === 'CANCELLED') return 'cancelled';
  if (f.dispute_reason && !f.dispute_resolved_at) return 'disputed';
  if (f.status === 'PAID') return 'paid';
  if (f.due_date && new Date(f.due_date) < startOfToday()) return 'overdue';
  return 'pending';
};

export const STATUS_TONE: Record<ReturnType<typeof fileStatus>, { bg: string; text: string; ring: string; label: string }> = {
  paid:      { bg: 'bg-emerald-50',  text: 'text-emerald-700',  ring: 'ring-emerald-200',  label: 'Pago' },
  overdue:   { bg: 'bg-red-50',      text: 'text-red-700',      ring: 'ring-red-200',      label: 'Vencido' },
  pending:   { bg: 'bg-amber-50',    text: 'text-amber-700',    ring: 'ring-amber-200',    label: 'Pendente' },
  disputed:  { bg: 'bg-violet-50',   text: 'text-violet-700',   ring: 'ring-violet-200',   label: 'Em disputa' },
  cancelled: { bg: 'bg-neutral-100', text: 'text-neutral-500',  ring: 'ring-neutral-200',  label: 'Cancelada' },
};

export function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }

export function daysBetween(a: Date, b: Date) {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

export function fmtDate(s?: string) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('pt-BR'); } catch { return s; }
}

export function fmtDateTime(s?: string) {
  if (!s) return '—';
  try { return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return s; }
}
