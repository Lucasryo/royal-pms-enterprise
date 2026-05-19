import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase';
import { Company, FiscalFile, UserProfile } from '../../types';
import { hasPermission } from '../../lib/permissions';
import { logAudit } from '../../lib/audit';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import {
  Archive, ArrowLeft, CheckSquare, Download, FileText, Filter, Folder, Loader2,
  Printer, Search, Square, Trash2, X as CloseIcon,
} from 'lucide-react';
import { fileStatus, fmtDate, fmtDateTime, isFinancialFile, money, STATUS_TONE } from './shared';
import InvoicePrintModal from './InvoicePrintModal';

/* ============================================================
 * FinanceDocuments — Faturas e arquivos reformulado
 *  - Dropzone hero (drag-drop com staging area)
 *  - Lista com agrupamento toggle (empresa / mes)
 *  - Side panel ao clicar (detalhes + download + lixeira)
 *  - Barra fixa de bulk action quando ha selecao
 * ============================================================ */

type Group = 'company' | 'month';
type View = 'active' | 'trash';

export default function FinanceDocuments({ profile }: { profile: UserProfile }) {
  const canManage = hasPermission(profile, 'canManageFinance' as any, ['admin', 'finance', 'faturamento', 'manager']);
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<FiscalFile[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [group, setGroup] = useState<Group>('company');
  const [view, setView] = useState<View>('active');
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<FiscalFile | null>(null);
  const [printing, setPrinting] = useState<FiscalFile | null>(null);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [f, c] = await Promise.all([
      supabase.from('files').select('*').order('upload_date', { ascending: false }),
      supabase.from('companies').select('*').order('name'),
    ]);
    if (f.data) setFiles((f.data as FiscalFile[]).filter(isFinancialFile));
    if (c.data) setCompanies(c.data as Company[]);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return files.filter((f) => {
      const isTrash = !!f.is_deleted;
      if (view === 'active' && isTrash) return false;
      if (view === 'trash' && !isTrash) return false;
      if (companyFilter && f.company_id !== companyFilter) return false;
      if (!q) return true;
      const name = companies.find((c) => c.id === f.company_id)?.name?.toLowerCase() || '';
      return f.original_name?.toLowerCase().includes(q) || name.includes(q);
    });
  }, [files, view, companyFilter, search, companies]);

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; items: FiscalFile[] }>();
    filtered.forEach((f) => {
      let key: string; let label: string;
      if (group === 'company') {
        key = f.company_id || 'sem';
        label = companies.find((c) => c.id === f.company_id)?.name || 'Sem empresa';
      } else {
        const d = f.due_date ? new Date(f.due_date) : (f.upload_date ? new Date(f.upload_date) : null);
        if (!d) { key = 'sem-data'; label = 'Sem data'; }
        else { key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); }
      }
      if (!map.has(key)) map.set(key, { key, label, items: [] });
      map.get(key)!.items.push(f);
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [filtered, group, companies]);

  const totals = useMemo(() => {
    const sum = filtered.reduce((s, f) => s + Number(f.amount || 0), 0);
    return { count: filtered.length, sum };
  }, [filtered]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function clearSelection() { setSelected(new Set()); }
  function selectAllInGroup(items: FiscalFile[]) {
    const next = new Set(selected);
    const allOn = items.every((i) => next.has(i.id));
    if (allOn) items.forEach((i) => next.delete(i.id));
    else items.forEach((i) => next.add(i.id));
    setSelected(next);
  }

  async function moveToTrash(ids: string[]) {
    if (ids.length === 0) return;
    const { error } = await supabase.from('files').update({ is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: profile.id }).in('id', ids);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success(`${ids.length} arquivo(s) na lixeira`);
    clearSelection();
    fetchAll();
  }
  async function restore(ids: string[]) {
    const { error } = await supabase.from('files').update({ is_deleted: false, deleted_at: null }).in('id', ids);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Restaurado');
    clearSelection();
    fetchAll();
  }
  async function permanentDelete(ids: string[]) {
    if (!confirm(`Excluir definitivamente ${ids.length} arquivo(s)?`)) return;
    const target = files.filter((f) => ids.includes(f.id));
    await supabase.storage.from('files').remove(target.map((f) => f.storage_path));
    const { error } = await supabase.from('files').delete().in('id', ids);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Excluido definitivamente');
    clearSelection();
    fetchAll();
  }

  function isVirtualStorage(f: FiscalFile) {
    // Faturas geradas por evento sao virtuais: storage_path tipo "eventos/OS-..."
    return !f.storage_path || f.storage_path.startsWith('eventos/');
  }

  async function downloadFile(f: FiscalFile) {
    if (isVirtualStorage(f)) {
      setPrinting(f);
      return;
    }
    try {
      const { data, error } = await supabase.storage.from('files').download(f.storage_path);
      if (error || !data) throw error || new Error('Arquivo nao encontrado');
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url; a.download = f.original_name || 'fatura';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      // Fallback: arquivo nao existe no storage → abre o modal de impressao
      toast.message('Sem arquivo fisico — abrindo gerador de PDF');
      setPrinting(f);
    }
  }

  async function updateDue(f: FiscalFile, newDate: string) {
    const { error } = await supabase.from('files').update({ due_date: newDate }).eq('id', f.id);
    if (error) { toast.error('Erro: ' + error.message); throw error; }
    await logAudit({ user_id: profile.id, user_name: profile.name, action: 'Vencimento alterado', details: `${f.original_name} -> ${newDate}`, type: 'update' });
    setFiles((prev) => prev.map((x) => (x.id === f.id ? { ...x, due_date: newDate } : x)));
    if (detail?.id === f.id) setDetail({ ...detail!, due_date: newDate });
    if (printing?.id === f.id) setPrinting({ ...printing!, due_date: newDate });
    toast.success('Vencimento atualizado');
  }

  if (loading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-neutral-300" /></div>;
  }

  return (
    <div className="space-y-5">
      {/* === TOOLBAR === */}
      <div className="flex flex-col gap-3 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar arquivo ou empresa…"
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-neutral-900 focus:bg-white" />
        </div>
        <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}
          className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-medium outline-none">
          <option value="">Todas as empresas</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="flex gap-1 rounded-xl bg-neutral-100 p-1">
          <button onClick={() => setGroup('company')} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold ${group === 'company' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'}`}>
            <Folder className="h-3 w-3" /> Empresa
          </button>
          <button onClick={() => setGroup('month')} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold ${group === 'month' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'}`}>
            <Filter className="h-3 w-3" /> Mes
          </button>
        </div>
        <div className="flex gap-1 rounded-xl bg-neutral-100 p-1">
          <button onClick={() => { setView('active'); clearSelection(); }} className={`rounded-lg px-3 py-1.5 text-[11px] font-bold ${view === 'active' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'}`}>
            Ativos
          </button>
          <button onClick={() => { setView('trash'); clearSelection(); }} className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-bold ${view === 'trash' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'}`}>
            <Archive className="h-3 w-3" /> Lixeira
          </button>
        </div>
      </div>

      {/* === GRUPOS === */}
      {groups.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-neutral-200 bg-white py-16 text-center">
          <FileText className="mx-auto mb-3 h-10 w-10 text-neutral-200" />
          <p className="text-sm font-bold text-neutral-400">Nenhum documento</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const groupSum = g.items.reduce((s, f) => s + Number(f.amount || 0), 0);
            const allSelected = g.items.every((i) => selected.has(i.id));
            return (
              <div key={g.key} className="overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm">
                <div className="flex items-center gap-3 border-b border-neutral-100 bg-neutral-50 px-4 py-2.5">
                  <button onClick={() => selectAllInGroup(g.items)} className="text-neutral-400 hover:text-neutral-900">
                    {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                  </button>
                  <h3 className="flex-1 text-sm font-black uppercase tracking-wider text-neutral-700">{g.label}</h3>
                  <span className="text-[11px] font-bold text-neutral-500">{g.items.length} · {money(groupSum)}</span>
                </div>
                <div className="divide-y divide-neutral-100">
                  {g.items.map((f) => {
                    const tone = STATUS_TONE[fileStatus(f)];
                    const checked = selected.has(f.id);
                    return (
                      <div key={f.id} className={`flex items-center gap-3 px-4 py-3 transition ${checked ? 'bg-emerald-50/50' : 'hover:bg-neutral-50'}`}>
                        <button onClick={() => toggleSelect(f.id)} className="text-neutral-400 hover:text-neutral-900">
                          {checked ? <CheckSquare className="h-4 w-4 text-emerald-600" /> : <Square className="h-4 w-4" />}
                        </button>
                        <button onClick={() => setDetail(f)} className="flex-1 min-w-0 text-left">
                          <div className="truncate text-sm font-bold text-neutral-900">{f.original_name}</div>
                          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-neutral-500">
                            <span>{f.category || f.type}</span>
                            <span className="text-neutral-300">·</span>
                            <span>{fmtDate(f.due_date)}</span>
                          </div>
                        </button>
                        <div className="hidden sm:block text-right">
                          <div className="text-sm font-black tabular-nums text-neutral-900">{money(Number(f.amount || 0))}</div>
                        </div>
                        <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ring-1 ring-inset ${tone.bg} ${tone.text} ${tone.ring}`}>
                          {tone.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="text-right text-[11px] font-bold uppercase tracking-wider text-neutral-400">
        {totals.count} arquivo(s) · {money(totals.sum)}
      </div>

      {/* === BARRA FIXA DE BULK ACTION === */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
            className="fixed inset-x-0 bottom-4 z-40 mx-auto w-fit max-w-[calc(100vw-2rem)] rounded-2xl bg-neutral-950 px-4 py-3 text-white shadow-2xl"
          >
            <div className="flex items-center gap-3">
              <button onClick={clearSelection} className="rounded-lg p-1 hover:bg-white/10">
                <CloseIcon className="h-4 w-4" />
              </button>
              <span className="text-xs font-bold">{selected.size} selecionado(s)</span>
              <div className="h-4 w-px bg-white/20" />
              {view === 'active' ? (
                <button onClick={() => moveToTrash(Array.from(selected))} className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-bold hover:bg-white/20">
                  <Archive className="h-3.5 w-3.5" /> Lixeira
                </button>
              ) : (
                <>
                  <button onClick={() => restore(Array.from(selected))} className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-black hover:bg-emerald-400">
                    <ArrowLeft className="h-3.5 w-3.5" /> Restaurar
                  </button>
                  <button onClick={() => permanentDelete(Array.from(selected))} className="flex items-center gap-1.5 rounded-xl bg-red-500 px-3 py-1.5 text-xs font-black hover:bg-red-400">
                    <Trash2 className="h-3.5 w-3.5" /> Excluir
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* === SIDE PANEL DE DETALHE === */}
      <AnimatePresence>
        {detail && (
          <DetailPanel
            file={detail}
            company={companies.find((c) => c.id === detail.company_id)?.name || 'Sem empresa'}
            onClose={() => setDetail(null)}
            onPrint={() => { setPrinting(detail); }}
            onDownload={() => downloadFile(detail)}
            onTrash={() => { moveToTrash([detail.id]); setDetail(null); }}
            isTrash={view === 'trash'}
            onRestore={() => { restore([detail.id]); setDetail(null); }}
            isVirtual={isVirtualStorage(detail)}
          />
        )}
      </AnimatePresence>

      {/* === MODAL IMPRESSAO/PDF === */}
      <AnimatePresence>
        {printing && (
          <InvoicePrintModal
            file={printing}
            company={companies.find((c) => c.id === printing.company_id)}
            onClose={() => setPrinting(null)}
            onDueChange={(d) => updateDue(printing, d)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function DetailPanel({
  file, company, onClose, onPrint, onDownload, onTrash, isTrash, onRestore, isVirtual,
}: {
  file: FiscalFile; company: string; onClose: () => void; onPrint: () => void; onDownload: () => void; onTrash: () => void; isTrash: boolean; onRestore: () => void; isVirtual: boolean;
}) {
  const tone = STATUS_TONE[fileStatus(file)];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <motion.aside
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 280, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Documento</div>
            <h2 className="mt-1 break-words text-lg font-black text-neutral-900">{file.original_name}</h2>
            <div className="mt-1 text-sm text-neutral-500">{company}</div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100"><CloseIcon className="h-4 w-4" /></button>
        </div>

        <div className={`mt-5 inline-flex items-center rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wider ring-1 ring-inset ${tone.bg} ${tone.text} ${tone.ring}`}>
          {tone.label}
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl bg-neutral-50 p-4 text-sm">
          <div><dt className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Tipo</dt><dd className="font-bold text-neutral-800">{file.type}</dd></div>
          <div><dt className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Categoria</dt><dd className="font-bold text-neutral-800">{file.category || '—'}</dd></div>
          <div><dt className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Vencimento</dt><dd className="font-bold text-neutral-800">{fmtDate(file.due_date)}</dd></div>
          <div><dt className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Valor</dt><dd className="font-bold text-neutral-800">{money(Number(file.amount || 0))}</dd></div>
          <div className="col-span-2"><dt className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Enviado em</dt><dd className="font-bold text-neutral-800">{fmtDateTime(file.upload_date)}</dd></div>
          {file.cancel_reason && <div className="col-span-2"><dt className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Motivo do cancelamento</dt><dd className="text-neutral-700">{file.cancel_reason}</dd></div>}
          {file.dispute_reason && <div className="col-span-2"><dt className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Disputa</dt><dd className="text-neutral-700">{file.dispute_reason}</dd></div>}
        </dl>

        <div className="mt-5 space-y-2">
          <button onClick={onPrint} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-neutral-950 py-2.5 text-xs font-black text-white">
            <Printer className="h-4 w-4" /> Imprimir / PDF
          </button>
          <div className="grid grid-cols-2 gap-2">
            {!isVirtual && (
              <button onClick={onDownload} className="flex items-center justify-center gap-2 rounded-2xl border border-neutral-200 bg-white py-2.5 text-xs font-black text-neutral-800 hover:bg-neutral-50">
                <Download className="h-4 w-4" /> Baixar
              </button>
            )}
            {isTrash ? (
              <button onClick={onRestore} className={`flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-2.5 text-xs font-black text-white ${isVirtual ? 'col-span-2' : ''}`}>
                <ArrowLeft className="h-4 w-4" /> Restaurar
              </button>
            ) : (
              <button onClick={onTrash} className={`flex items-center justify-center gap-2 rounded-2xl bg-red-50 py-2.5 text-xs font-black text-red-700 ${isVirtual ? 'col-span-2' : ''}`}>
                <Archive className="h-4 w-4" /> Mover p/ Lixeira
              </button>
            )}
          </div>
        </div>
      </motion.aside>
    </motion.div>
  );
}
