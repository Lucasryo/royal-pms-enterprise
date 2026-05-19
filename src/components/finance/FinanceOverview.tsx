import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../supabase';
import { Company, FiscalFile, UserProfile } from '../../types';
import { hasPermission } from '../../lib/permissions';
import { logAudit } from '../../lib/audit';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, ChevronDown,
  CreditCard, Filter, Loader2, MoreHorizontal, Pencil, Search, Target, TrendingUp, X as CloseIcon,
} from 'lucide-react';
import {
  FINANCIAL_TYPES, fileStatus, fmtDate, isFinancialFile, money, moneyShort, startOfToday, STATUS_TONE,
} from './shared';
import { triggerOverdueDigest } from '../../lib/notify';
import { Send } from 'lucide-react';

/* ============================================================
 * FinanceOverview — Gestao Financeira reformulada
 *  - Hero "Pulso do mes" com meta vs realizado, dias uteis, projecao
 *  - 3 cards de acao (Cobrar hoje, Vencendo 7d, Em disputa)
 *  - Tabela conectada aos filtros via topbar unificada
 *  - Edit por popover (data + valor + status juntos)
 * ============================================================ */

type Filter = 'all' | 'today' | 'week' | 'overdue' | 'disputed' | 'paid';
const FILTER_LABEL: Record<Filter, string> = {
  all: 'Todas',
  today: 'Cobrar hoje',
  week: 'Vence em 7d',
  overdue: 'Vencidas',
  disputed: 'Em disputa',
  paid: 'Pagas',
};

export default function FinanceOverview({ profile }: { profile: UserProfile }) {
  const canEdit = hasPermission(profile, 'canManageFinance' as any, ['admin', 'finance', 'faturamento', 'manager']);
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<FiscalFile[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [monthlyGoal, setMonthlyGoal] = useState(0);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState('');

  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState<string>('');
  const [popoverFile, setPopoverFile] = useState<FiscalFile | null>(null);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    const [filesRes, compRes, goalRes] = await Promise.all([
      supabase.from('files').select('*').order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('companies').select('*').order('name'),
      supabase.from('app_settings').select('*').eq('id', 'monthly_revenue_goal').maybeSingle(),
    ]);
    if (filesRes.data) setFiles((filesRes.data as FiscalFile[]).filter(isFinancialFile));
    if (compRes.data) setCompanies(compRes.data as Company[]);
    if (goalRes.data?.value) setMonthlyGoal(Number(goalRes.data.value) || 0);
    setLoading(false);
  }

  const today = startOfToday();
  const monthStart = useMemo(() => { const d = new Date(today); d.setDate(1); return d; }, [today]);
  const monthEnd = useMemo(() => { const d = new Date(today); d.setMonth(d.getMonth() + 1); d.setDate(0); return d; }, [today]);
  const monthDaysTotal = monthEnd.getDate();
  const monthDaysLeft = Math.max(0, monthDaysTotal - today.getDate() + 1);
  const monthProgress = ((today.getDate() / monthDaysTotal) * 100);

  const kpis = useMemo(() => {
    const active = files.filter((f) => !f.is_deleted);
    const monthFiles = active.filter((f) => {
      if (!f.due_date) return false;
      const d = new Date(f.due_date);
      return d >= monthStart && d <= monthEnd;
    });
    const monthPaid = monthFiles.filter((f) => f.status === 'PAID').reduce((s, f) => s + Number(f.amount || 0), 0);
    const monthOpen = monthFiles.filter((f) => f.status !== 'PAID' && f.status !== 'CANCELLED').reduce((s, f) => s + Number(f.amount || 0), 0);
    const overdueTotal = active.filter((f) => fileStatus(f) === 'overdue').reduce((s, f) => s + Number(f.amount || 0), 0);
    const dueTodayCount = active.filter((f) => f.due_date && new Date(f.due_date).toDateString() === today.toDateString() && f.status !== 'PAID' && f.status !== 'CANCELLED').length;
    const week = new Date(today); week.setDate(week.getDate() + 7);
    const dueWeekCount = active.filter((f) => {
      const s = fileStatus(f); if (s === 'paid' || s === 'cancelled' || s === 'overdue') return false;
      if (!f.due_date) return false; const d = new Date(f.due_date); return d > today && d <= week;
    }).length;
    const disputeCount = active.filter((f) => fileStatus(f) === 'disputed').length;
    const overdueCount = active.filter((f) => fileStatus(f) === 'overdue').length;
    const projection = monthPaid + monthOpen;
    const goalReached = monthlyGoal > 0 ? Math.min(100, (monthPaid / monthlyGoal) * 100) : 0;
    const pace = monthlyGoal > 0 ? (monthPaid / monthlyGoal) / Math.max(0.01, today.getDate() / monthDaysTotal) : 1;
    return { monthPaid, monthOpen, overdueTotal, dueTodayCount, dueWeekCount, disputeCount, overdueCount, projection, goalReached, pace };
  }, [files, monthStart, monthEnd, today, monthDaysTotal, monthlyGoal]);

  const filtered = useMemo(() => {
    const active = files.filter((f) => !f.is_deleted);
    const week = new Date(today); week.setDate(week.getDate() + 7);
    const base = active.filter((f) => {
      switch (filter) {
        case 'today': return f.due_date && new Date(f.due_date).toDateString() === today.toDateString() && f.status !== 'PAID' && f.status !== 'CANCELLED';
        case 'week':  return f.due_date && new Date(f.due_date) > today && new Date(f.due_date) <= week && f.status !== 'PAID' && f.status !== 'CANCELLED';
        case 'overdue': return fileStatus(f) === 'overdue';
        case 'disputed': return fileStatus(f) === 'disputed';
        case 'paid': return f.status === 'PAID';
        default: return true;
      }
    });
    const q = search.trim().toLowerCase();
    return base.filter((f) => {
      if (companyFilter && f.company_id !== companyFilter) return false;
      if (!q) return true;
      const compName = companies.find((c) => c.id === f.company_id)?.name?.toLowerCase() || '';
      return f.original_name?.toLowerCase().includes(q) || compName.includes(q) || (f.category || '').toLowerCase().includes(q);
    });
  }, [files, filter, search, companyFilter, companies, today]);

  async function saveGoal() {
    const v = Number(goalDraft);
    if (!Number.isFinite(v) || v < 0) { toast.error('Meta invalida'); return; }
    const { error } = await supabase.from('app_settings').upsert({ id: 'monthly_revenue_goal', value: String(v) });
    if (error) { toast.error('Erro salvando meta'); return; }
    setMonthlyGoal(v); setEditingGoal(false); toast.success('Meta atualizada');
  }

  async function applyEdit(patch: Partial<FiscalFile>) {
    if (!popoverFile) return;
    const id = popoverFile.id;
    const { error } = await supabase.from('files').update(patch).eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    await logAudit({ user_id: profile.id, user_name: profile.name, action: 'Fatura atualizada', details: `Arquivo ${popoverFile.original_name}`, type: 'update' });
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    setPopoverFile(null);
    toast.success('Salvo');
  }

  if (loading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-neutral-300" /></div>;
  }

  return (
    <div className="space-y-5">
      {/* === HERO PULSO DO MES === */}
      <div className="relative overflow-hidden rounded-3xl border border-neutral-200 bg-gradient-to-br from-neutral-950 via-neutral-900 to-emerald-950 p-5 sm:p-7 text-white shadow-sm">
        <div className="relative grid gap-5 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300 flex items-center gap-2">
              <Target className="h-3.5 w-3.5" /> Pulso do mes
            </p>
            <h2 className="mt-2 text-2xl sm:text-3xl font-black tracking-tight">{money(kpis.monthPaid)}</h2>
            <p className="mt-1 text-xs sm:text-sm text-white/60">
              Recebido em {today.toLocaleDateString('pt-BR', { month: 'long' })} · faltam {monthDaysLeft} dia{monthDaysLeft === 1 ? '' : 's'}
            </p>
            {monthlyGoal > 0 ? (
              <div className="mt-4">
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-white/60">
                  <span>Meta {money(monthlyGoal)}</span>
                  <span className={`flex items-center gap-1 ${kpis.pace >= 1 ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {kpis.pace >= 1 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {(kpis.pace * 100).toFixed(0)}% do ritmo
                  </span>
                </div>
                <div className="mt-2 h-2.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="absolute h-2.5 rounded-full bg-white/20" style={{ width: `${monthProgress}%` }} />
                  <div className="h-2.5 rounded-full bg-gradient-to-r from-emerald-400 to-emerald-300" style={{ width: `${kpis.goalReached}%` }} />
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-white/50">
                  <span>{kpis.goalReached.toFixed(0)}% atingido</span>
                  <button onClick={() => { setGoalDraft(String(monthlyGoal)); setEditingGoal(true); }} className="font-bold text-white/70 hover:text-white">Ajustar</button>
                </div>
              </div>
            ) : (
              <button onClick={() => { setGoalDraft(''); setEditingGoal(true); }} className="mt-4 rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold hover:bg-white/10">
                Definir meta de receita
              </button>
            )}
            {editingGoal && (
              <div className="mt-3 flex gap-2">
                <input
                  autoFocus type="number" value={goalDraft} onChange={(e) => setGoalDraft(e.target.value)}
                  placeholder="R$ 0,00"
                  className="flex-1 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:border-emerald-300"
                />
                <button onClick={saveGoal} className="rounded-xl bg-emerald-400 px-3 py-2 text-xs font-black text-emerald-950">Salvar</button>
                <button onClick={() => setEditingGoal(false)} className="rounded-xl border border-white/15 px-3 py-2 text-xs font-bold text-white/70">X</button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Tile label="Em aberto" value={moneyShort(kpis.monthOpen)} sub={`${kpis.dueTodayCount + kpis.dueWeekCount + kpis.overdueCount} faturas`} tone="amber" icon={CreditCard} />
            <Tile label="Vencido" value={moneyShort(kpis.overdueTotal)} sub={`${kpis.overdueCount} faturas`} tone="red" icon={AlertTriangle} />
            <Tile label="Projecao" value={moneyShort(kpis.projection)} sub="se tudo entrar" tone="blue" icon={TrendingUp} />
            <Tile label="Concluidas" value={String(files.filter((f) => f.status === 'PAID').length)} sub="historico total" tone="emerald" icon={CheckCircle2} />
          </div>
        </div>
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-16 h-72 w-72 rounded-full bg-emerald-500/15 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-amber-500/10 blur-3xl" />
      </div>

      {/* === ACAO RAPIDA: DISPARAR DIGEST === */}
      {kpis.overdueCount > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/50 px-4 py-3">
          <div className="text-xs text-amber-900">
            <span className="font-black">{kpis.overdueCount}</span> fatura(s) vencida(s) totalizando <span className="font-black">{money(kpis.overdueTotal)}</span>
          </div>
          <button
            onClick={async () => {
              const tid = toast.loading('Enviando digest de vencidos…');
              const r = await triggerOverdueDigest();
              if ((r as any)?.error) toast.error('Falha: ' + (r as any).error, { id: tid });
              else if ((r as any)?.skipped) toast.message('Configure destinatários no canal "Digest de vencidos"', { id: tid });
              else toast.success(`Digest enviado para ${(r as any)?.recipients?.length || 0} email(s)`, { id: tid });
            }}
            className="flex items-center gap-1.5 rounded-xl bg-amber-700 px-3 py-1.5 text-xs font-black text-white">
            <Send className="h-3.5 w-3.5" /> Enviar digest agora
          </button>
        </div>
      )}

      {/* === CARDS DE ACAO === */}
      <div className="grid gap-3 sm:grid-cols-3">
        <ActionCard
          tone="red"
          icon={AlertTriangle}
          label="Cobrar hoje"
          count={kpis.dueTodayCount}
          sub={kpis.dueTodayCount === 0 ? 'Nada vencendo hoje' : 'Faturas vencem hoje'}
          active={filter === 'today'}
          onClick={() => setFilter(filter === 'today' ? 'all' : 'today')}
        />
        <ActionCard
          tone="amber"
          icon={CreditCard}
          label="Vence em 7 dias"
          count={kpis.dueWeekCount}
          sub="Prepare cobranca preventiva"
          active={filter === 'week'}
          onClick={() => setFilter(filter === 'week' ? 'all' : 'week')}
        />
        <ActionCard
          tone="violet"
          icon={Filter}
          label="Em disputa"
          count={kpis.disputeCount}
          sub="Aguardando resposta do cliente"
          active={filter === 'disputed'}
          onClick={() => setFilter(filter === 'disputed' ? 'all' : 'disputed')}
        />
      </div>

      {/* === TABELA + TOOLBAR === */}
      <div className="rounded-3xl border border-neutral-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-neutral-100 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar nota, empresa ou categoria"
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-neutral-900 focus:bg-white" />
          </div>
          <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}
            className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-medium outline-none">
            <option value="">Todas as empresas</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="flex flex-wrap gap-1.5 rounded-xl bg-neutral-100 p-1">
            {(Object.keys(FILTER_LABEL) as Filter[]).map((k) => (
              <button key={k} onClick={() => setFilter(k)}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${filter === k ? 'bg-neutral-950 text-white' : 'text-neutral-500 hover:text-neutral-900'}`}>
                {FILTER_LABEL[k]}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-200" />
            <p className="text-sm font-bold text-neutral-400">Nada por aqui — boa!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-neutral-50 text-left text-[10px] font-black uppercase tracking-widest text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Empresa / Documento</th>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3">Vencimento</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filtered.map((f) => {
                  const stat = fileStatus(f);
                  const tone = STATUS_TONE[stat];
                  const company = companies.find((c) => c.id === f.company_id);
                  const due = f.due_date ? new Date(f.due_date) : null;
                  const overdueDays = due && stat === 'overdue' ? Math.floor((today.getTime() - due.getTime()) / 86_400_000) : 0;
                  return (
                    <tr key={f.id} className="group hover:bg-neutral-50">
                      <td className="px-4 py-3">
                        <div className="font-bold text-neutral-900">{company?.name || '—'}</div>
                        <div className="text-[11px] text-neutral-500 truncate max-w-[220px]">{f.original_name}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-600">{f.category || f.type}</td>
                      <td className="px-4 py-3 text-xs text-neutral-700">
                        {fmtDate(f.due_date)}
                        {overdueDays > 0 && <span className="ml-2 inline-block rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-black text-red-700">{overdueDays}d</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-black tabular-nums text-neutral-900">{money(Number(f.amount || 0))}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ring-1 ring-inset ${tone.bg} ${tone.text} ${tone.ring}`}>
                          {tone.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canEdit && (
                          <button onClick={() => setPopoverFile(f)} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900">
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-neutral-100 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
          {filtered.length} resultado{filtered.length === 1 ? '' : 's'}
        </div>
      </div>

      <AnimatePresence>
        {popoverFile && (
          <EditPopover file={popoverFile} onClose={() => setPopoverFile(null)} onSave={applyEdit} />
        )}
      </AnimatePresence>
    </div>
  );
}

function Tile({ label, value, sub, tone, icon: Icon }: { label: string; value: string; sub: string; tone: 'amber' | 'red' | 'blue' | 'emerald'; icon: any }) {
  const tones: Record<string, string> = {
    amber: 'text-amber-300',
    red: 'text-red-300',
    blue: 'text-blue-300',
    emerald: 'text-emerald-300',
  };
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
      <div className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider ${tones[tone]}`}>
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-2 text-xl font-black text-white tabular-nums">{value}</div>
      <div className="text-[10px] text-white/40">{sub}</div>
    </div>
  );
}

function ActionCard({ tone, icon: Icon, label, count, sub, active, onClick }: { tone: 'red' | 'amber' | 'violet'; icon: any; label: string; count: number; sub: string; active: boolean; onClick: () => void }) {
  const tones: Record<string, { ring: string; bg: string; text: string; accent: string }> = {
    red:    { ring: 'ring-red-200',    bg: 'bg-red-50',    text: 'text-red-700',    accent: 'bg-red-500' },
    amber:  { ring: 'ring-amber-200',  bg: 'bg-amber-50',  text: 'text-amber-700',  accent: 'bg-amber-500' },
    violet: { ring: 'ring-violet-200', bg: 'bg-violet-50', text: 'text-violet-700', accent: 'bg-violet-500' },
  };
  const t = tones[tone];
  return (
    <button onClick={onClick}
      className={`relative flex items-center gap-4 rounded-3xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${active ? `border-transparent ring-2 ${t.ring} ${t.bg}` : 'border-neutral-200'}`}>
      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${t.bg} ${t.text}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1">
        <div className="flex items-baseline gap-2">
          <span className={`text-3xl font-black tabular-nums ${count > 0 ? t.text : 'text-neutral-300'}`}>{count}</span>
          <span className="text-[10px] font-black uppercase tracking-wider text-neutral-500">{label}</span>
        </div>
        <div className="text-xs text-neutral-500">{sub}</div>
      </div>
      {active && <span className={`absolute right-3 top-3 h-2 w-2 animate-pulse rounded-full ${t.accent}`} />}
    </button>
  );
}

function EditPopover({ file, onClose, onSave }: { file: FiscalFile; onClose: () => void; onSave: (patch: Partial<FiscalFile>) => void }) {
  const [due, setDue] = useState(file.due_date?.slice(0, 10) || '');
  const [amount, setAmount] = useState(String(file.amount ?? ''));
  const [status, setStatus] = useState<FiscalFile['status']>(file.status || 'PENDING');
  const [reason, setReason] = useState('');
  const overlayRef = useRef<HTMLDivElement>(null);

  return (
    <motion.div
      ref={overlayRef}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm p-4 sm:items-center"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
        className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Editar fatura</div>
            <div className="mt-1 font-black text-neutral-900 truncate max-w-[260px]">{file.original_name}</div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100"><CloseIcon className="h-4 w-4" /></button>
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Vencimento</label>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)}
              className="mt-1 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Valor (R$)</label>
            <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm tabular-nums" />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Status</label>
            <div className="mt-1 grid grid-cols-3 gap-1.5">
              {(['PENDING', 'PAID', 'CANCELLED'] as const).map((s) => (
                <button key={s} type="button" onClick={() => setStatus(s)}
                  className={`rounded-xl border px-3 py-2 text-[11px] font-black uppercase tracking-wider transition ${status === s ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300'}`}>
                  {s === 'PENDING' ? 'Pendente' : s === 'PAID' ? 'Pago' : 'Cancelar'}
                </button>
              ))}
            </div>
          </div>
          {status === 'CANCELLED' && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Motivo do cancelamento</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Obrigatorio"
                className="mt-1 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm" />
            </div>
          )}
        </div>
        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-2xl border border-neutral-200 py-2.5 text-xs font-bold text-neutral-500">Cancelar</button>
          <button
            onClick={() => {
              const patch: Partial<FiscalFile> = {
                due_date: due || undefined,
                amount: Number(amount) || 0,
                status,
              };
              if (status === 'CANCELLED') {
                if (!reason.trim()) { toast.error('Motivo obrigatorio'); return; }
                (patch as any).cancel_reason = reason.trim();
                (patch as any).cancelled_at = new Date().toISOString();
              }
              onSave(patch);
            }}
            className="flex-1 rounded-2xl bg-neutral-950 py-2.5 text-xs font-black text-white">
            Salvar
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
