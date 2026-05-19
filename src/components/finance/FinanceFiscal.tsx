import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase';
import { Reservation, UserProfile } from '../../types';
import { hasPermission } from '../../lib/permissions';
import { logAudit } from '../../lib/audit';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertCircle, ChevronDown, ChevronUp, CheckCircle2, CheckSquare, Clock, FileSpreadsheet,
  Loader2, RefreshCw, Search, Send, Square, XCircle, Zap,
} from 'lucide-react';
import { fmtDateTime, money } from './shared';

/* ============================================================
 * FinanceFiscal — NFS-e/RPS reformulado
 *  - Status row (Hoje, Em fila, Erro, Cancelados)
 *  - Fila expansivel com retry/erro/cancelar
 *  - Reservas deduplicadas (esconde as que ja tem job ativo)
 *  - Bulk enqueue + busca + filtro
 * ============================================================ */

type FiscalJob = {
  id: string;
  reservation_code?: string;
  document_type: 'nfse' | 'rps' | 'invoice';
  status: 'pending' | 'processing' | 'issued' | 'error' | 'cancelled';
  amount: number;
  error_message?: string;
  created_at: string;
  payload?: { guest_name?: string; company_id?: string };
};

const STATUS_TONE: Record<FiscalJob['status'], { bg: string; text: string; ring: string; icon: any; label: string }> = {
  pending:    { bg: 'bg-amber-50',    text: 'text-amber-700',    ring: 'ring-amber-200',    icon: Clock,        label: 'Em fila' },
  processing: { bg: 'bg-blue-50',     text: 'text-blue-700',     ring: 'ring-blue-200',     icon: Loader2,      label: 'Processando' },
  issued:     { bg: 'bg-emerald-50',  text: 'text-emerald-700',  ring: 'ring-emerald-200',  icon: CheckCircle2, label: 'Emitido' },
  error:      { bg: 'bg-red-50',      text: 'text-red-700',      ring: 'ring-red-200',      icon: AlertCircle,  label: 'Erro' },
  cancelled:  { bg: 'bg-neutral-100', text: 'text-neutral-500',  ring: 'ring-neutral-200',  icon: XCircle,      label: 'Cancelado' },
};

export default function FinanceFiscal({ profile }: { profile: UserProfile }) {
  const canManage = hasPermission(profile, 'canManageProfessionalTools', ['admin', 'manager', 'finance', 'faturamento']);

  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<FiscalJob[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | FiscalJob['status']>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedReservations, setSelectedReservations] = useState<Set<string>>(new Set());

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [jobsRes, resRes] = await Promise.all([
      supabase.from('fiscal_jobs').select('*').order('created_at', { ascending: false }).limit(80),
      supabase.from('reservations').select('*').eq('status', 'CHECKED_OUT').order('check_out', { ascending: false }).limit(80),
    ]);
    if (jobsRes.data) setJobs(jobsRes.data as FiscalJob[]);
    if (resRes.data) setReservations(resRes.data as Reservation[]);
    setLoading(false);
  }

  // Reservas com job ativo (pending/processing/issued) sao ocultadas da lista de pendentes
  const activeJobCodes = useMemo(() => {
    const s = new Set<string>();
    jobs.forEach((j) => { if (j.reservation_code && (j.status === 'pending' || j.status === 'processing' || j.status === 'issued')) s.add(j.reservation_code); });
    return s;
  }, [jobs]);

  const pendingReservations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reservations.filter((r) => {
      if (!r.reservation_code) return false;
      if (activeJobCodes.has(r.reservation_code)) return false;
      if (!q) return true;
      return r.reservation_code.toLowerCase().includes(q) || r.guest_name?.toLowerCase().includes(q);
    });
  }, [reservations, activeJobCodes, search]);

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter((j) => {
      if (statusFilter !== 'all' && j.status !== statusFilter) return false;
      if (!q) return true;
      return (j.reservation_code || '').toLowerCase().includes(q) || (j.payload?.guest_name || '').toLowerCase().includes(q);
    });
  }, [jobs, statusFilter, search]);

  const kpis = useMemo(() => {
    const today = new Date().toDateString();
    const issuedToday = jobs.filter((j) => j.status === 'issued' && new Date(j.created_at).toDateString() === today).length;
    const queue = jobs.filter((j) => j.status === 'pending' || j.status === 'processing').length;
    const errors = jobs.filter((j) => j.status === 'error').length;
    const cancelled = jobs.filter((j) => j.status === 'cancelled').length;
    return { issuedToday, queue, errors, cancelled };
  }, [jobs]);

  async function enqueueOne(r: Reservation) {
    const { error } = await supabase.from('fiscal_jobs').insert({
      reservation_code: r.reservation_code,
      document_type: 'nfse',
      status: 'pending',
      amount: Number(r.total_amount || 0),
      payload: { guest_name: r.guest_name, company_id: r.company_id },
    });
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success(`Enviado para fila: ${r.reservation_code}`);
    fetchAll();
  }
  async function enqueueBulk() {
    if (selectedReservations.size === 0) return;
    const target = reservations.filter((r) => selectedReservations.has(r.id));
    const rows = target.map((r) => ({
      reservation_code: r.reservation_code,
      document_type: 'nfse',
      status: 'pending',
      amount: Number(r.total_amount || 0),
      payload: { guest_name: r.guest_name, company_id: r.company_id },
    }));
    const { error } = await supabase.from('fiscal_jobs').insert(rows);
    if (error) { toast.error('Erro: ' + error.message); return; }
    await logAudit({ user_id: profile.id, user_name: profile.name, action: 'Fiscal: enfileirou em lote', details: `${rows.length} reservas`, type: 'create' });
    toast.success(`${rows.length} enviadas para fila`);
    setSelectedReservations(new Set());
    fetchAll();
  }
  async function retryJob(j: FiscalJob) {
    const { error } = await supabase.from('fiscal_jobs').update({ status: 'pending', error_message: null }).eq('id', j.id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Recolocado em fila');
    fetchAll();
  }
  async function cancelJob(j: FiscalJob) {
    if (!confirm('Cancelar este documento fiscal?')) return;
    const { error } = await supabase.from('fiscal_jobs').update({ status: 'cancelled' }).eq('id', j.id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Cancelado');
    fetchAll();
  }
  function toggleExpand(id: string) {
    setExpanded((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function toggleReservation(id: string) {
    setSelectedReservations((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function selectAllReservations() {
    if (selectedReservations.size === pendingReservations.length) setSelectedReservations(new Set());
    else setSelectedReservations(new Set(pendingReservations.map((r) => r.id)));
  }

  if (loading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-neutral-300" /></div>;
  }

  return (
    <div className="space-y-5">
      {/* === KPI ROW === */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile icon={CheckCircle2} tone="emerald" label="Emitidos hoje" value={kpis.issuedToday} />
        <KpiTile icon={Clock} tone="amber" label="Em fila" value={kpis.queue} />
        <KpiTile icon={AlertCircle} tone="red" label="Com erro" value={kpis.errors} highlight={kpis.errors > 0} />
        <KpiTile icon={XCircle} tone="neutral" label="Cancelados" value={kpis.cancelled} />
      </div>

      {/* === SEARCH === */}
      <div className="flex flex-col gap-3 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar codigo, hospede"
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-neutral-900 focus:bg-white" />
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl bg-neutral-100 p-1">
          {(['all', 'pending', 'processing', 'issued', 'error', 'cancelled'] as const).map((k) => (
            <button key={k} onClick={() => setStatusFilter(k)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${statusFilter === k ? 'bg-neutral-950 text-white' : 'text-neutral-500'}`}>
              {k === 'all' ? 'Todos jobs' : STATUS_TONE[k as FiscalJob['status']].label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {/* === FILA === */}
        <div className="rounded-3xl border border-neutral-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-neutral-700" />
              <h3 className="text-sm font-black text-neutral-900">Fila de documentos fiscais</h3>
            </div>
            <button onClick={fetchAll} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100"><RefreshCw className="h-3.5 w-3.5" /></button>
          </div>
          <div className="max-h-[560px] divide-y divide-neutral-100 overflow-y-auto">
            {filteredJobs.length === 0 ? (
              <div className="py-16 text-center">
                <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-200" />
                <p className="text-sm font-bold text-neutral-400">Sem jobs aqui</p>
              </div>
            ) : filteredJobs.map((j) => {
              const tone = STATUS_TONE[j.status];
              const Icon = tone.icon;
              const isOpen = expanded.has(j.id);
              return (
                <div key={j.id} className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ${tone.bg} ${tone.text}`}>
                      <Icon className={`h-4 w-4 ${j.status === 'processing' ? 'animate-spin' : ''}`} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black uppercase tracking-wider text-neutral-500">{j.document_type}</span>
                        <span className="font-black text-neutral-900">{j.reservation_code || '—'}</span>
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-neutral-500">
                        {j.payload?.guest_name || 'Sem hospede'} · {money(Number(j.amount || 0))} · {fmtDateTime(j.created_at)}
                      </div>
                    </div>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ring-1 ring-inset ${tone.bg} ${tone.text} ${tone.ring}`}>
                      {tone.label}
                    </span>
                    {(j.status === 'error' || j.error_message) && (
                      <button onClick={() => toggleExpand(j.id)} className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100">
                        {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden">
                        <div className="mt-3 rounded-2xl bg-red-50 p-3 text-xs text-red-900">
                          <div className="text-[10px] font-black uppercase tracking-wider text-red-700">Erro</div>
                          <div className="mt-1 break-words font-mono">{j.error_message || 'Sem detalhe'}</div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {canManage && (j.status === 'error' || j.status === 'pending') && (
                    <div className="mt-2 flex gap-1.5">
                      {j.status === 'error' && (
                        <button onClick={() => retryJob(j)} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1 text-[10px] font-black text-white">
                          <RefreshCw className="h-3 w-3" /> Tentar de novo
                        </button>
                      )}
                      <button onClick={() => cancelJob(j)} className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-[10px] font-bold text-neutral-700 hover:bg-neutral-50">
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* === RESERVAS PENDENTES === */}
        <div className="rounded-3xl border border-neutral-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4 text-neutral-700" />
              <h3 className="text-sm font-black text-neutral-900">Reservas aguardando emissao</h3>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-black text-neutral-600">{pendingReservations.length}</span>
            </div>
            <button onClick={selectAllReservations} className="flex items-center gap-1 text-[11px] font-bold text-neutral-500 hover:text-neutral-900">
              {selectedReservations.size === pendingReservations.length && pendingReservations.length > 0
                ? <><CheckSquare className="h-3.5 w-3.5" /> Tudo</>
                : <><Square className="h-3.5 w-3.5" /> Selecionar tudo</>}
            </button>
          </div>
          <div className="max-h-[560px] divide-y divide-neutral-100 overflow-y-auto">
            {pendingReservations.length === 0 ? (
              <div className="py-16 text-center">
                <Zap className="mx-auto mb-2 h-8 w-8 text-amber-200" />
                <p className="text-sm font-bold text-neutral-400">Tudo enfileirado</p>
                <p className="mt-1 text-[11px] text-neutral-400">Reservas com job ativo nao aparecem aqui</p>
              </div>
            ) : pendingReservations.map((r) => {
              const checked = selectedReservations.has(r.id);
              return (
                <div key={r.id} className={`flex items-center gap-3 px-5 py-3 ${checked ? 'bg-emerald-50/50' : ''}`}>
                  <button onClick={() => toggleReservation(r.id)} className="text-neutral-400 hover:text-neutral-900">
                    {checked ? <CheckSquare className="h-4 w-4 text-emerald-600" /> : <Square className="h-4 w-4" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="font-black text-neutral-900">{r.reservation_code}</div>
                    <div className="mt-0.5 truncate text-[11px] text-neutral-500">{r.guest_name} · {money(Number(r.total_amount || 0))}</div>
                  </div>
                  {canManage && (
                    <button onClick={() => enqueueOne(r)} className="rounded-lg bg-neutral-950 px-3 py-1.5 text-[11px] font-black text-white">
                      Enfileirar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {selectedReservations.size > 0 && canManage && (
            <div className="border-t border-neutral-100 bg-emerald-50 px-5 py-3">
              <button onClick={enqueueBulk}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white">
                <Send className="h-4 w-4" />
                Enfileirar {selectedReservations.size} reserva(s)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiTile({ icon: Icon, tone, label, value, highlight }: { icon: any; tone: 'emerald' | 'amber' | 'red' | 'neutral'; label: string; value: number; highlight?: boolean }) {
  const tones: Record<string, { bg: string; text: string; ring: string }> = {
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-200' },
    amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   ring: 'ring-amber-200' },
    red:     { bg: 'bg-red-50',     text: 'text-red-700',     ring: 'ring-red-200' },
    neutral: { bg: 'bg-neutral-100',text: 'text-neutral-600', ring: 'ring-neutral-200' },
  };
  const t = tones[tone];
  return (
    <div className={`rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm ${highlight ? 'ring-2 ring-red-200' : ''}`}>
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${t.bg} ${t.text}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-[10px] font-black uppercase tracking-wider text-neutral-500">{label}</div>
          <div className={`text-2xl font-black tabular-nums ${value > 0 ? t.text : 'text-neutral-300'}`}>{value}</div>
        </div>
      </div>
    </div>
  );
}
