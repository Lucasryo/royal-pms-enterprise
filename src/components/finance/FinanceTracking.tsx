import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { supabase } from '../../supabase';
import { Company, FiscalFile, UserProfile } from '../../types';
import { hasPermission } from '../../lib/permissions';
import { logAudit } from '../../lib/audit';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import {
  AlertOctagon, ArrowRight, CheckCircle2, ClipboardCheck, FileText, Hotel,
  Loader2, Lock, Receipt, Search, Unlock, User,
} from 'lucide-react';
import { fmtDateTime, money } from './shared';

/* ============================================================
 * FinanceTracking — Kanban de rastreio de notas
 *  - 4 colunas: Recepcao -> Reservas -> Financeiro -> Concluido
 *  - drag-to-advance + clique avanca uma etapa
 *  - status (ok/blocked/pending) muda borda colorida do card
 *  - filtros e busca no topo
 * ============================================================ */

type Stage = 'reception' | 'reservations' | 'finance' | 'completed';
type Status = 'ok' | 'blocked' | 'pending';

const STAGES: Array<{ id: Stage; label: string; icon: any; tone: string; bar: string }> = [
  { id: 'reception',    label: 'Recepcao',       icon: Hotel,         tone: 'from-blue-50 to-white',    bar: 'bg-blue-400' },
  { id: 'reservations', label: 'Reservas',       icon: ClipboardCheck, tone: 'from-amber-50 to-white',  bar: 'bg-amber-400' },
  { id: 'finance',      label: 'Financeiro',     icon: Receipt,       tone: 'from-violet-50 to-white', bar: 'bg-violet-400' },
  { id: 'completed',    label: 'Concluido',      icon: CheckCircle2,  tone: 'from-emerald-50 to-white', bar: 'bg-emerald-400' },
];

const STATUS_LABEL: Record<Status, string> = { ok: 'Liberado', blocked: 'Travado', pending: 'Pendente' };

export default function FinanceTracking({ profile }: { profile: UserProfile }) {
  const canManage = hasPermission(profile, 'canManageFinance' as any, ['admin', 'finance', 'faturamento', 'manager', 'reception', 'reservations']);
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<FiscalFile[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [hoverStage, setHoverStage] = useState<Stage | null>(null);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [f, c] = await Promise.all([
      supabase.from('files').select('*').not('tracking_stage', 'is', null).order('tracking_updated_at', { ascending: false, nullsFirst: false }),
      supabase.from('companies').select('*').order('name'),
    ]);
    if (f.data) setFiles(f.data as FiscalFile[]);
    if (c.data) setCompanies(c.data as Company[]);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return files.filter((f) => {
      if (companyFilter && f.company_id !== companyFilter) return false;
      if (statusFilter !== 'all' && f.tracking_status !== statusFilter) return false;
      if (!q) return true;
      const name = companies.find((c) => c.id === f.company_id)?.name?.toLowerCase() || '';
      return f.original_name?.toLowerCase().includes(q) || name.includes(q) || (f.nh || '').toLowerCase().includes(q);
    });
  }, [files, search, companyFilter, statusFilter, companies]);

  const byStage = useMemo(() => {
    const map: Record<Stage, FiscalFile[]> = { reception: [], reservations: [], finance: [], completed: [] };
    filtered.forEach((f) => {
      const s = (f.tracking_stage || 'reception') as Stage;
      if (map[s]) map[s].push(f);
    });
    return map;
  }, [filtered]);

  const totals = useMemo(() => {
    const out: Record<Stage, { count: number; sum: number; blocked: number }> = {
      reception: { count: 0, sum: 0, blocked: 0 },
      reservations: { count: 0, sum: 0, blocked: 0 },
      finance: { count: 0, sum: 0, blocked: 0 },
      completed: { count: 0, sum: 0, blocked: 0 },
    };
    (Object.keys(byStage) as Stage[]).forEach((s) => {
      const items = byStage[s];
      out[s].count = items.length;
      out[s].sum = items.reduce((acc, f) => acc + Number(f.amount || 0), 0);
      out[s].blocked = items.filter((f) => f.tracking_status === 'blocked').length;
    });
    return out;
  }, [byStage]);

  async function moveTo(file: FiscalFile, target: Stage) {
    if (!canManage) { toast.error('Sem permissao'); return; }
    if (file.tracking_stage === target) return;
    const { error } = await supabase.from('files').update({
      tracking_stage: target,
      tracking_status: target === 'completed' ? 'ok' : (file.tracking_status || 'pending'),
      tracking_updated_at: new Date().toISOString(),
      tracking_updated_by: profile.id,
    }).eq('id', file.id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    await logAudit({ user_id: profile.id, user_name: profile.name, action: 'Rastreio movido', details: `${file.original_name} -> ${target}`, type: 'update' });
    setFiles((prev) => prev.map((f) => f.id === file.id ? { ...f, tracking_stage: target, tracking_updated_at: new Date().toISOString(), tracking_updated_by: profile.id } : f));
    toast.success('Etapa atualizada');
  }
  async function toggleBlock(file: FiscalFile) {
    if (!canManage) return;
    const next: Status = file.tracking_status === 'blocked' ? 'pending' : 'blocked';
    const { error } = await supabase.from('files').update({ tracking_status: next, tracking_updated_at: new Date().toISOString(), tracking_updated_by: profile.id }).eq('id', file.id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    setFiles((prev) => prev.map((f) => f.id === file.id ? { ...f, tracking_status: next } : f));
    toast.success(next === 'blocked' ? 'Travado' : 'Destravado');
  }

  if (loading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-neutral-300" /></div>;
  }

  return (
    <div className="space-y-5">
      {/* === HEADER FILTROS === */}
      <div className="flex flex-col gap-3 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar nota, NH ou empresa"
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-neutral-900 focus:bg-white" />
        </div>
        <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}
          className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-medium outline-none">
          <option value="">Todas as empresas</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="flex gap-1 rounded-xl bg-neutral-100 p-1">
          {(['all', 'ok', 'pending', 'blocked'] as const).map((k) => (
            <button key={k} onClick={() => setStatusFilter(k)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${statusFilter === k ? 'bg-neutral-950 text-white' : 'text-neutral-500'}`}>
              {k === 'all' ? 'Todos' : STATUS_LABEL[k as Status]}
            </button>
          ))}
        </div>
      </div>

      {/* === KANBAN === */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {STAGES.map((stage) => {
          const items = byStage[stage.id];
          const t = totals[stage.id];
          const StageIcon = stage.icon;
          const isHover = hoverStage === stage.id && draggedId;
          return (
            <div key={stage.id}
              onDragOver={(e) => { if (canManage && draggedId) { e.preventDefault(); setHoverStage(stage.id); } }}
              onDragLeave={() => setHoverStage(null)}
              onDrop={() => {
                if (draggedId) {
                  const f = files.find((x) => x.id === draggedId);
                  if (f) moveTo(f, stage.id);
                }
                setDraggedId(null); setHoverStage(null);
              }}
              className={`flex flex-col rounded-3xl border bg-gradient-to-b p-3 transition ${stage.tone} ${isHover ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-neutral-200'}`}
            >
              <div className="flex items-center gap-2 px-1 pb-3">
                <div className={`flex h-8 w-8 items-center justify-center rounded-xl bg-white shadow-sm`}>
                  <StageIcon className="h-4 w-4 text-neutral-700" />
                </div>
                <div className="flex-1">
                  <div className="text-xs font-black uppercase tracking-wider text-neutral-700">{stage.label}</div>
                  <div className="text-[10px] text-neutral-500">{t.count} · {money(t.sum)}{t.blocked > 0 && <span className="ml-1 text-red-600">· {t.blocked} travada(s)</span>}</div>
                </div>
                <div className={`h-1.5 w-12 rounded-full ${stage.bar}`} />
              </div>
              <div className="space-y-2 min-h-[120px]">
                {items.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-neutral-300 bg-white/50 px-3 py-6 text-center text-[11px] font-bold text-neutral-400">
                    Vazio
                  </div>
                )}
                {items.map((f) => {
                  const company = companies.find((c) => c.id === f.company_id)?.name || '—';
                  const blocked = f.tracking_status === 'blocked';
                  const ok = f.tracking_status === 'ok';
                  return (
                    <motion.div
                      layout
                      key={f.id}
                      draggable={canManage}
                      onDragStart={() => setDraggedId(f.id)}
                      onDragEnd={() => { setDraggedId(null); setHoverStage(null); }}
                      className={`group rounded-2xl bg-white p-3 shadow-sm ring-1 transition ${
                        blocked ? 'ring-red-200' : ok ? 'ring-emerald-200' : 'ring-neutral-200'
                      } ${draggedId === f.id ? 'opacity-50' : 'hover:shadow-md cursor-grab active:cursor-grabbing'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-black text-neutral-900">{f.original_name}</div>
                          <div className="mt-0.5 truncate text-[10px] text-neutral-500">{company}</div>
                          {f.nh && <div className="mt-0.5 inline-block rounded bg-neutral-100 px-1.5 py-0.5 text-[9px] font-bold text-neutral-700">NH {f.nh}</div>}
                        </div>
                        {blocked && <Lock className="h-3.5 w-3.5 shrink-0 text-red-500" />}
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[10px] text-neutral-400">
                        <span>{fmtDateTime(f.tracking_updated_at)}</span>
                        {f.amount ? <span className="font-black text-neutral-700 tabular-nums">{money(Number(f.amount))}</span> : null}
                      </div>
                      {canManage && (
                        <div className="mt-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
                          <button onClick={() => toggleBlock(f)}
                            className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold ${blocked ? 'bg-emerald-100 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                            {blocked ? <><Unlock className="h-3 w-3" /> Destravar</> : <><Lock className="h-3 w-3" /> Travar</>}
                          </button>
                          {stage.id !== 'completed' && (
                            <button onClick={() => {
                              const idx = STAGES.findIndex((s) => s.id === stage.id);
                              const next = STAGES[idx + 1];
                              if (next) moveTo(f, next.id);
                            }} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-neutral-950 px-2 py-1 text-[10px] font-bold text-white">
                              Avancar <ArrowRight className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-3xl border border-dashed border-neutral-200 bg-white py-10 text-center">
          <FileText className="mx-auto mb-2 h-8 w-8 text-neutral-200" />
          <p className="text-sm font-bold text-neutral-400">Nenhuma nota no rastreio</p>
        </div>
      )}
    </div>
  );
}
