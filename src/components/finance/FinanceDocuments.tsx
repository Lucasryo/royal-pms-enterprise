import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { supabase } from '../../supabase';
import { Company, FiscalFile, UserProfile } from '../../types';
import { hasPermission } from '../../lib/permissions';
import { logAudit } from '../../lib/audit';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import {
  Archive, ArrowLeft, CheckSquare, Download, FileText, Filter, Folder, Loader2,
  Search, Square, Trash2, Upload, X as CloseIcon,
} from 'lucide-react';
import { FINANCIAL_TYPES, fileStatus, fmtDate, fmtDateTime, isFinancialFile, money, STATUS_TONE } from './shared';

/* ============================================================
 * FinanceDocuments — Faturas e arquivos reformulado
 *  - Dropzone hero (drag-drop com staging area)
 *  - Lista com agrupamento toggle (empresa / mes)
 *  - Side panel ao clicar (detalhes + download + lixeira)
 *  - Barra fixa de bulk action quando ha selecao
 * ============================================================ */

type Group = 'company' | 'month';
type View = 'active' | 'trash';

type Staged = {
  id: string;
  file: File;
  companyId?: string;
  type: string;
  dueDate?: string;
  amount?: string;
};

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

  // Upload staging
  const [staged, setStaged] = useState<Staged[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault(); setDragOver(false);
    const list = Array.from(e.dataTransfer.files) as File[];
    addStaged(list);
  }

  function addStaged(list: File[]) {
    const next: Staged[] = list.map((file) => {
      // smart guess company by filename
      const lower = file.name.toLowerCase();
      const matched = companies.find((c) => c.name && lower.includes(c.name.toLowerCase().split(' ')[0]));
      return {
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        companyId: matched?.id,
        type: 'FATURA',
      };
    });
    setStaged((prev) => [...prev, ...next]);
  }

  async function commitStaged() {
    if (staged.length === 0) return;
    const missing = staged.find((s) => !s.companyId);
    if (missing) { toast.error('Selecione a empresa de todos os arquivos'); return; }
    setUploading(true);
    try {
      for (const item of staged) {
        const now = new Date();
        const year = String(now.getFullYear());
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const ts = Date.now();
        const rand = Math.random().toString(36).slice(2, 8);
        const storagePath = `empresas/${item.companyId}/${year}/${month}/${item.type.toLowerCase()}s/${ts}_${rand}_${item.file.name}`;
        const { error: upErr } = await supabase.storage.from('files').upload(storagePath, item.file);
        if (upErr) throw upErr;
        const { error: dbErr } = await supabase.from('files').insert({
          company_id: item.companyId,
          type: item.type,
          period: '',
          due_date: item.dueDate || null,
          amount: item.amount ? Number(item.amount) : null,
          category: item.type === 'FATURA' ? 'Hospedagem' : item.type,
          status: 'PENDING',
          original_name: item.file.name,
          storage_path: storagePath,
          uploader_id: profile.id,
          upload_date: new Date().toISOString(),
        });
        if (dbErr) throw dbErr;
      }
      await logAudit({ user_id: profile.id, user_name: profile.name, action: 'Upload', details: `${staged.length} arquivo(s)`, type: 'upload' });
      toast.success(`${staged.length} arquivo(s) enviados`);
      setStaged([]);
      fetchAll();
    } catch (err: any) {
      toast.error('Falha no upload: ' + (err?.message || err));
    } finally {
      setUploading(false);
    }
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

  async function downloadFile(f: FiscalFile) {
    const { data } = supabase.storage.from('files').getPublicUrl(f.storage_path);
    window.open(data.publicUrl, '_blank');
  }

  if (loading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-neutral-300" /></div>;
  }

  return (
    <div className="space-y-5">
      {/* === HERO DROPZONE === */}
      {canManage && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`relative overflow-hidden rounded-3xl border-2 border-dashed p-6 transition ${
            dragOver ? 'border-emerald-400 bg-emerald-50' : 'border-neutral-300 bg-gradient-to-br from-neutral-50 to-white'
          }`}
        >
          <div className="flex flex-col items-center justify-center gap-3 text-center">
            <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${dragOver ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-neutral-500'}`}>
              <Upload className="h-6 w-6" />
            </div>
            <div>
              <p className="font-black text-neutral-900">Arraste arquivos ou clique para enviar</p>
              <p className="text-xs text-neutral-500">PDF, imagens, planilhas — a gente detecta a empresa pelo nome do arquivo</p>
            </div>
            <button
              onClick={() => inputRef.current?.click()}
              className="rounded-2xl bg-neutral-950 px-4 py-2 text-xs font-black text-white"
            >
              Selecionar arquivos
            </button>
            <input ref={inputRef} type="file" multiple className="hidden"
              onChange={(e) => { if (e.target.files) addStaged(Array.from(e.target.files)); e.target.value = ''; }} />
          </div>

          {staged.length > 0 && (
            <div className="mt-5 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-wider text-neutral-500">Para enviar ({staged.length})</p>
                <button onClick={() => setStaged([])} className="text-[11px] font-bold text-neutral-400 hover:text-red-600">Limpar tudo</button>
              </div>
              <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-2">
                {staged.map((s) => (
                  <div key={s.id} className="grid grid-cols-1 gap-2 rounded-xl bg-neutral-50 p-2 md:grid-cols-[1.5fr_1fr_1fr_120px_auto]">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-neutral-800">{s.file.name}</p>
                      <p className="text-[10px] text-neutral-400">{(s.file.size / 1024).toFixed(0)} KB</p>
                    </div>
                    <select value={s.companyId || ''} onChange={(e) => setStaged((p) => p.map((x) => x.id === s.id ? { ...x, companyId: e.target.value } : x))}
                      className={`rounded-lg border bg-white px-2 py-1 text-xs ${s.companyId ? 'border-neutral-200' : 'border-red-300'}`}>
                      <option value="">Empresa…</option>
                      {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <select value={s.type} onChange={(e) => setStaged((p) => p.map((x) => x.id === s.id ? { ...x, type: e.target.value } : x))}
                      className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs">
                      {FINANCIAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input type="date" value={s.dueDate || ''} onChange={(e) => setStaged((p) => p.map((x) => x.id === s.id ? { ...x, dueDate: e.target.value } : x))}
                      className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs" />
                    <input type="number" placeholder="Valor" value={s.amount || ''} onChange={(e) => setStaged((p) => p.map((x) => x.id === s.id ? { ...x, amount: e.target.value } : x))}
                      className="w-24 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs tabular-nums" />
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={commitStaged} disabled={uploading}
                  className="rounded-2xl bg-emerald-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">
                  {uploading ? <span className="inline-flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Enviando…</span> : `Enviar ${staged.length} arquivo(s)`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

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
            onDownload={() => downloadFile(detail)}
            onTrash={() => { moveToTrash([detail.id]); setDetail(null); }}
            isTrash={view === 'trash'}
            onRestore={() => { restore([detail.id]); setDetail(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function DetailPanel({
  file, company, onClose, onDownload, onTrash, isTrash, onRestore,
}: {
  file: FiscalFile; company: string; onClose: () => void; onDownload: () => void; onTrash: () => void; isTrash: boolean; onRestore: () => void;
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

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button onClick={onDownload} className="flex items-center justify-center gap-2 rounded-2xl border border-neutral-200 bg-white py-2.5 text-xs font-black text-neutral-800 hover:bg-neutral-50">
            <Download className="h-4 w-4" /> Baixar
          </button>
          {isTrash ? (
            <button onClick={onRestore} className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-2.5 text-xs font-black text-white">
              <ArrowLeft className="h-4 w-4" /> Restaurar
            </button>
          ) : (
            <button onClick={onTrash} className="flex items-center justify-center gap-2 rounded-2xl bg-red-50 py-2.5 text-xs font-black text-red-700">
              <Archive className="h-4 w-4" /> Mover p/ Lixeira
            </button>
          )}
        </div>
      </motion.aside>
    </motion.div>
  );
}
