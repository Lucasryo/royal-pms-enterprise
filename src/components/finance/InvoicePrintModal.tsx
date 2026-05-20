import { useEffect, useMemo, useRef, useState } from 'react';
import { Company, FiscalFile, HotelEvent } from '../../types';
import { supabase } from '../../supabase';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { CalendarClock, Download, FileText, Loader2, Pencil, Printer, X as CloseIcon } from 'lucide-react';
import { fmtDate, money, startOfToday } from './shared';
import { RoyalDocumentPage, RoyalDocumentTable, RoyalInfoGrid, RoyalSummary } from '../documents/RoyalDocument';

/* ============================================================
 * InvoicePrintModal — preview imprimivel/PDF de fatura
 *  - Renderiza fatura HTML estavel mesmo quando nao ha arquivo
 *    real em storage (caso de OS de evento ex: OS-2026-IKJQGJ)
 *  - Editor de vencimento inline + regua visual
 *  - Imprimir nativo + Salvar PDF via html2canvas/jspdf
 * ============================================================ */

type Props = {
  file: FiscalFile;
  company?: Company;
  onClose: () => void;
  onDueChange: (newDate: string) => Promise<void> | void;
};

export default function InvoicePrintModal({ file, company, onClose, onDueChange }: Props) {
  const printRef = useRef<HTMLDivElement>(null);
  const [event, setEvent] = useState<HotelEvent | null>(null);
  const [loadingEvent, setLoadingEvent] = useState(false);
  const [editingDue, setEditingDue] = useState(false);
  const [dueDraft, setDueDraft] = useState(file.due_date?.slice(0, 10) || '');
  const [savingDue, setSavingDue] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!file.event_os_number) return;
    setLoadingEvent(true);
    supabase.from('hotel_events').select('*').eq('os_number', file.event_os_number).maybeSingle()
      .then(({ data }) => { if (data) setEvent(data as HotelEvent); })
      .then(() => setLoadingEvent(false))
      .then(undefined, () => setLoadingEvent(false));
  }, [file.event_os_number]);

  async function saveDue() {
    if (!dueDraft) return;
    setSavingDue(true);
    try { await onDueChange(dueDraft); setEditingDue(false); }
    finally { setSavingDue(false); }
  }

  async function handlePrint() {
    window.print();
  }

  async function handlePdf() {
    if (!printRef.current) return;
    setGenerating(true);
    const toastId = toast.loading('Gerando PDF…');
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const canvas = await html2canvas(printRef.current, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
      const img = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const props = pdf.getImageProperties(img);
      const pdfH = (props.height * pageW) / props.width;
      pdf.addImage(img, 'PNG', 0, 0, pageW, pdfH);
      const safe = (file.original_name || file.event_os_number || file.id).replace(/[^a-z0-9-_]/gi, '_');
      pdf.save(`${safe}.pdf`);
      toast.success('PDF gerado', { id: toastId });
    } catch (e: any) {
      toast.error('Falha ao gerar PDF: ' + (e?.message || e), { id: toastId });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 print:relative print:bg-white print:p-0"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="relative flex h-full max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl print:max-h-none print:rounded-none print:shadow-none"
      >
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-neutral-100 bg-white px-5 py-3 no-print">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-neutral-700" />
            <span className="text-sm font-black text-neutral-900">Fatura · Preview</span>
            <span className="hidden sm:inline text-xs text-neutral-400">{file.original_name}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-black text-neutral-800 hover:bg-neutral-50">
              <Printer className="h-3.5 w-3.5" /> Imprimir
            </button>
            <button onClick={handlePdf} disabled={generating} className="flex items-center gap-1.5 rounded-xl bg-neutral-950 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50">
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Salvar PDF
            </button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100"><CloseIcon className="h-4 w-4" /></button>
          </div>
        </div>

        {/* Régua de vencimento + editor */}
        <div className="border-b border-neutral-100 bg-neutral-50/70 px-5 py-4 no-print">
          <DueRuler due={file.due_date} onEdit={() => { setDueDraft(file.due_date?.slice(0, 10) || ''); setEditingDue(true); }} />
          {editingDue && (
            <div className="mt-3 flex items-center gap-2">
              <input type="date" value={dueDraft} onChange={(e) => setDueDraft(e.target.value)} autoFocus
                className="rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-sm" />
              <button onClick={saveDue} disabled={savingDue} className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50">
                {savingDue ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Salvar'}
              </button>
              <button onClick={() => setEditingDue(false)} className="rounded-xl border border-neutral-200 px-3 py-1.5 text-xs font-bold text-neutral-500">Cancelar</button>
            </div>
          )}
        </div>

        {/* Document area */}
        <div className="flex-1 overflow-y-auto bg-neutral-100 p-4 sm:p-8 print:bg-white print:p-0">
          <div
            ref={printRef}
            className="mx-auto w-full max-w-[800px] rounded-xl bg-white p-8 sm:p-12 shadow-sm print:max-w-full print:rounded-none print:shadow-none"
            style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
          >
            <InvoiceLayout file={file} company={company} event={event} loadingEvent={loadingEvent} />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* === REGUA DE VENCIMENTO === */
function DueRuler({ due, onEdit }: { due?: string; onEdit: () => void }) {
  const today = startOfToday();
  const dueDate = due ? new Date(due) : null;
  const diff = dueDate ? Math.round((dueDate.getTime() - today.getTime()) / 86_400_000) : null;

  const tone = diff === null
    ? 'neutral'
    : diff < 0 ? 'red'
    : diff === 0 ? 'amber'
    : diff <= 7 ? 'amber'
    : 'emerald';

  const tones: Record<string, { bg: string; bar: string; text: string; ring: string }> = {
    red:     { bg: 'bg-red-50',     bar: 'bg-red-500',     text: 'text-red-700',     ring: 'ring-red-200' },
    amber:   { bg: 'bg-amber-50',   bar: 'bg-amber-500',   text: 'text-amber-700',   ring: 'ring-amber-200' },
    emerald: { bg: 'bg-emerald-50', bar: 'bg-emerald-500', text: 'text-emerald-700', ring: 'ring-emerald-200' },
    neutral: { bg: 'bg-neutral-100',bar: 'bg-neutral-400', text: 'text-neutral-500', ring: 'ring-neutral-200' },
  };
  const t = tones[tone];

  // janela: -30..+30 dias
  const W = 60;
  const center = 30;
  const clamped = diff === null ? null : Math.max(-30, Math.min(30, diff));
  const pos = clamped === null ? null : ((center + clamped) / W) * 100;

  const label = diff === null
    ? 'Sem data de vencimento'
    : diff < 0 ? `${Math.abs(diff)} dia${Math.abs(diff) === 1 ? '' : 's'} em atraso`
    : diff === 0 ? 'Vence hoje'
    : `Vence em ${diff} dia${diff === 1 ? '' : 's'}`;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock className={`h-4 w-4 ${t.text}`} />
          <span className={`text-xs font-black uppercase tracking-wider ${t.text}`}>Vencimento</span>
        </div>
        <button onClick={onEdit} className="flex items-center gap-1 text-[11px] font-bold text-neutral-500 hover:text-neutral-900">
          <Pencil className="h-3 w-3" /> {dueDate ? fmtDate(due) : 'Definir'}
        </button>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${t.bg} ${t.text} ring-1 ring-inset ${t.ring}`}>{label}</span>
        <div className="relative flex-1 h-2 rounded-full bg-neutral-200">
          {/* marca do hoje */}
          <div className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-neutral-700" style={{ left: '50%' }} />
          <div className="absolute -top-4 text-[9px] font-bold uppercase tracking-wider text-neutral-500" style={{ left: '50%', transform: 'translateX(-50%)' }}>Hoje</div>
          {pos !== null && (
            <div className={`absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white ${t.bar}`} style={{ left: `${pos}%` }} />
          )}
        </div>
        <span className="hidden sm:block text-[10px] font-bold text-neutral-400 shrink-0">-30d · +30d</span>
      </div>
    </div>
  );
}

/* === LAYOUT IMPRIMIVEL === */
function InvoiceLayout({ file, company, event, loadingEvent }: { file: FiscalFile; company?: Company; event: HotelEvent | null; loadingEvent: boolean }) {
  const total = Number(file.amount || 0);
  const items = useMemo(() => {
    if (event?.quote_items && event.quote_items.length > 0) {
      return event.quote_items.map((q) => ({
        name: q.name || 'Item',
        qty: q.quantity || 1,
        unit: q.unit_price || 0,
        total: q.subtotal ?? (q.quantity || 1) * (q.unit_price || 0),
      }));
    }
    return [{
      name: event ? `Evento ${event.name} (${event.hall_name})` : (file.category || 'Servico'),
      qty: 1, unit: total, total,
    }];
  }, [event, file, total]);
  const itemsTotal = items.reduce((s, i) => s + i.total, 0);

  return (
    <RoyalDocumentPage
      title="Fatura"
      code={file.event_os_number || file.reservation_code || file.id.slice(0, 8)}
      issuedAt={fmtDate(file.upload_date)}
      guestName={company?.name || 'Sem empresa'}
      rightMeta={[
        { label: 'Vencimento', value: fmtDate(file.due_date) },
        { label: 'Periodo', value: file.period },
        { label: 'Documento', value: file.category || file.type },
      ]}
    >
      {loadingEvent ? (
        <div className="py-6 text-center text-xs text-neutral-400">Carregando itens do evento...</div>
      ) : (
        <RoyalDocumentTable
          headers={['Data', 'Descricao', 'Valor']}
          rows={items.map((it) => [
            fmtDate(file.upload_date),
            `${it.name} - Qtd ${it.qty} - Unit. ${money(it.unit)}`,
            money(it.total),
          ])}
        />
      )}

      <RoyalSummary>
        <RoyalInfoGrid
          rows={[
            { label: 'Cliente', value: company?.name || 'Sem empresa' },
            { label: 'CNPJ', value: company?.cnpj },
            { label: 'Endereco', value: company?.address },
            { label: 'E-mail', value: company?.email },
            { label: 'O.S.', value: file.event_os_number },
            { label: 'Reserva', value: file.reservation_code },
          ]}
        />
        <div className="mt-8 flex justify-end">
          <div className="w-72 border-t border-neutral-900 pt-2 text-xs">
            <div className="flex justify-between py-1">
              <span>Subtotal</span>
              <span className="font-bold tabular-nums">{money(itemsTotal)}</span>
            </div>
            {event?.iss_amount ? (
              <div className="flex justify-between py-1">
                <span>ISS {event.iss_rate || ''}%</span>
                <span className="font-bold tabular-nums">{money(event.iss_amount)}</span>
              </div>
            ) : null}
            <div className="mt-1 flex justify-between border-t border-neutral-900 py-2 text-sm font-black">
              <span>Total</span>
              <span className="tabular-nums">{money(total)}</span>
            </div>
          </div>
        </div>
      </RoyalSummary>
    </RoyalDocumentPage>
  );
  return (
    <div className="hidden text-neutral-900">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between border-b border-neutral-200 pb-6">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-700">Royal Macaé · Pousada & Eventos</div>
          <h1 className="mt-1 text-3xl font-black tracking-tight">FATURA</h1>
          <p className="mt-1 text-xs text-neutral-500">{file.category || file.type}</p>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Documento</div>
          <div className="font-mono text-sm font-black text-neutral-900">{file.event_os_number || file.reservation_code || file.id.slice(0, 8)}</div>
          <div className="mt-2 text-[10px] font-bold uppercase tracking-wider text-neutral-500">Emitida</div>
          <div className="text-sm font-bold">{fmtDate(file.upload_date)}</div>
        </div>
      </div>

      {/* Empresa */}
      <div className="mt-6 grid grid-cols-2 gap-6">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Cliente</div>
          <div className="mt-1 text-base font-black">{company?.name || 'Sem empresa'}</div>
          {company?.cnpj && <div className="text-xs text-neutral-600">CNPJ {company.cnpj}</div>}
          {company?.address && <div className="text-xs text-neutral-600">{company.address}</div>}
          {company?.email && <div className="text-xs text-neutral-600">{company.email}</div>}
        </div>
        <div className="text-right">
          <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Vencimento</div>
          <div className="mt-1 text-base font-black">{fmtDate(file.due_date)}</div>
          {file.period && <div className="text-xs text-neutral-500">Periodo {file.period}</div>}
        </div>
      </div>

      {/* Itens */}
      <div className="mt-8">
        <div className="grid grid-cols-[1fr_60px_120px_120px] gap-2 border-b border-neutral-200 pb-2 text-[10px] font-black uppercase tracking-wider text-neutral-500">
          <span>Descricao</span><span className="text-center">Qtd</span><span className="text-right">Unit</span><span className="text-right">Total</span>
        </div>
        {loadingEvent && <div className="py-6 text-center text-xs text-neutral-400">Carregando itens do evento…</div>}
        {!loadingEvent && items.map((it, idx) => (
          <div key={idx} className="grid grid-cols-[1fr_60px_120px_120px] gap-2 border-b border-neutral-100 py-3 text-sm">
            <span className="font-bold text-neutral-800">{it.name}</span>
            <span className="text-center tabular-nums text-neutral-600">{it.qty}</span>
            <span className="text-right tabular-nums text-neutral-600">{money(it.unit)}</span>
            <span className="text-right tabular-nums font-black text-neutral-900">{money(it.total)}</span>
          </div>
        ))}
      </div>

      {/* Totais */}
      <div className="mt-6 flex justify-end">
        <div className="w-full max-w-xs space-y-1.5">
          <Row label="Subtotal" value={money(itemsTotal)} />
          {event?.iss_amount ? <Row label={`ISS ${event.iss_rate || ''}%`} value={money(event.iss_amount)} /> : null}
          <div className="mt-2 flex items-baseline justify-between border-t-2 border-neutral-900 pt-2">
            <span className="text-xs font-black uppercase tracking-widest text-neutral-500">Total</span>
            <span className="text-2xl font-black tabular-nums text-neutral-900">{money(total)}</span>
          </div>
        </div>
      </div>

      {/* Rodape */}
      <div className="mt-10 border-t border-neutral-200 pt-4 text-[10px] text-neutral-400">
        Documento gerado pelo Royal PMS · Pagamento em conta corrente conforme contrato.
      </div>
    </div>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-neutral-500">{label}</span>
      <span className="tabular-nums font-bold text-neutral-800">{value}</span>
    </div>
  );
}
