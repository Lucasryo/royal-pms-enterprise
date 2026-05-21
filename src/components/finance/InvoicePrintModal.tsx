import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Company, FiscalFile, HotelEvent } from '../../types';
import { supabase } from '../../supabase';
import { toast } from 'sonner';
import { CalendarClock, Download, Loader2, Pencil } from 'lucide-react';
import { fmtDate, money, startOfToday } from './shared';
import { RoyalDocumentModal, RoyalDocumentTable } from '../documents/RoyalDocument';

type Props = {
  file: FiscalFile;
  company?: Company;
  onClose: () => void;
  onDueChange: (newDate: string) => Promise<void> | void;
};

type InvoiceItem = {
  date: string;
  description: string;
  detail: string;
  total: number;
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
    try {
      await onDueChange(dueDraft);
      setEditingDue(false);
    } finally {
      setSavingDue(false);
    }
  }

  async function handlePrint() {
    window.print();
  }

  async function handlePdf() {
    if (!printRef.current) return;
    setGenerating(true);
    const toastId = toast.loading('Gerando PDF...');
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
    <RoyalDocumentModal
      title="Fatura"
      subtitle={file.original_name || file.event_os_number || file.reservation_code}
      onClose={onClose}
      onPrint={handlePrint}
      actions={(
        <button
          type="button"
          onClick={handlePdf}
          disabled={generating}
          className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-widest text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Salvar PDF
        </button>
      )}
    >
      <div className="nota-no-print mx-auto mb-4 w-full max-w-[210mm] rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <DueRuler due={file.due_date} onEdit={() => { setDueDraft(file.due_date?.slice(0, 10) || ''); setEditingDue(true); }} />
        {editingDue && (
          <div className="mt-3 flex items-center gap-2">
            <input
              type="date"
              value={dueDraft}
              onChange={(e) => setDueDraft(e.target.value)}
              autoFocus
              className="rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-sm"
            />
            <button onClick={saveDue} disabled={savingDue} className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50">
              {savingDue ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Salvar'}
            </button>
            <button onClick={() => setEditingDue(false)} className="rounded-xl border border-neutral-200 px-3 py-1.5 text-xs font-bold text-neutral-500">
              Cancelar
            </button>
          </div>
        )}
      </div>

      <div ref={printRef}>
        <InvoiceDocument file={file} company={company} event={event} loadingEvent={loadingEvent} />
      </div>
    </RoyalDocumentModal>
  );
}

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
    red: { bg: 'bg-red-50', bar: 'bg-red-500', text: 'text-red-700', ring: 'ring-red-200' },
    amber: { bg: 'bg-amber-50', bar: 'bg-amber-500', text: 'text-amber-700', ring: 'ring-amber-200' },
    emerald: { bg: 'bg-emerald-50', bar: 'bg-emerald-500', text: 'text-emerald-700', ring: 'ring-emerald-200' },
    neutral: { bg: 'bg-neutral-100', bar: 'bg-neutral-400', text: 'text-neutral-500', ring: 'ring-neutral-200' },
  };
  const t = tones[tone];

  const clamped = diff === null ? null : Math.max(-30, Math.min(30, diff));
  const pos = clamped === null ? null : ((30 + clamped) / 60) * 100;

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
        <div className="relative h-2 flex-1 rounded-full bg-neutral-200">
          <div className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-neutral-700" style={{ left: '50%' }} />
          <div className="absolute -top-4 text-[9px] font-bold uppercase tracking-wider text-neutral-500" style={{ left: '50%', transform: 'translateX(-50%)' }}>Hoje</div>
          {pos !== null && (
            <div className={`absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white ${t.bar}`} style={{ left: `${pos}%` }} />
          )}
        </div>
        <span className="hidden shrink-0 text-[10px] font-bold text-neutral-400 sm:block">-30d - +30d</span>
      </div>
    </div>
  );
}

function InvoiceDocument({ file, company, event, loadingEvent }: { file: FiscalFile; company?: Company; event: HotelEvent | null; loadingEvent: boolean }) {
  const isEventInvoice = Boolean(file.event_os_number);
  const code = file.event_os_number || file.reservation_code || file.id.slice(0, 8).toUpperCase();
  const dueInfo = getDueInfo(file.due_date);
  const statusLabel = file.status === 'PAID'
    ? 'Pago'
    : file.status === 'CANCELLED'
      ? 'Cancelada'
      : file.status === 'PENDING'
        ? 'Pendente'
        : dueInfo.label;

  const items = useMemo<InvoiceItem[]>(() => {
    if (event?.quote_items && event.quote_items.length > 0) {
      return event.quote_items.map((q) => ({
        date: event.start_date ? fmtDate(event.start_date) : fmtDate(file.upload_date),
        description: q.name || 'Item',
        detail: `${String(q.unit || '').replace('por_', '/')} - Qtd ${q.quantity || 1}`,
        total: Number(q.subtotal ?? (q.quantity || 1) * (q.unit_price || 0)),
      }));
    }

    return [{
      date: fmtDate(file.upload_date),
      description: event ? `Evento ${event.name}` : (file.category || file.type || 'Lancamento financeiro'),
      detail: event ? (event.halls?.join(' / ') || event.hall_name || 'Ordem de servico') : (file.period || file.original_name || 'Documento financeiro'),
      total: Number(file.amount || event?.total_value || 0),
    }];
  }, [event, file]);

  const itemsTotal = items.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const issAmount = Number(event?.iss_amount || 0);
  const subtotal = Number(event?.subtotal_value || itemsTotal);
  const total = Number(file.amount || event?.total_value || subtotal + issAmount || itemsTotal);
  const docType = isEventInvoice ? 'Fatura de Evento' : 'Fatura Financeira';
  const eventPeriod = event?.start_date
    ? `${fmtDate(event.start_date)}${event.end_date && event.end_date !== event.start_date ? ` a ${fmtDate(event.end_date)}` : ''}`
    : file.period || 'Periodo nao informado';

  return (
    <section
      className="nota-printable relative mx-auto overflow-hidden bg-white text-neutral-950 shadow-sm"
      style={{ width: '210mm', minHeight: '297mm', padding: '12mm', fontFamily: 'Arial, Helvetica, sans-serif' }}
    >
      <img src="/logo.png" alt="" className="pointer-events-none absolute bottom-16 right-3 w-[104mm] opacity-[0.055]" />

      <header className="grid grid-cols-[38mm_1fr_55mm] gap-4 border-b-4 border-neutral-900 pb-5">
        <div className="flex items-start justify-center pt-1">
          <img src="/logo.png" alt="Royal Macae" className="max-h-16 max-w-[34mm] object-contain" />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-500">Financeiro Royal Macae</p>
          <h1 className="mt-1 text-[26px] font-black uppercase leading-none tracking-tight">{docType}</h1>
          <p className="mt-2 text-[11px] leading-4 text-neutral-600">
            Royal Macae Palace Hotel - AV. ATLANTICA, 1642 - PR. DOS CAVALEIROS<br />
            CNPJ 07.116.901/0001-92 - (22)2123-9650 - financeiro@royalmacae.com.br
          </p>
        </div>
        <div className="text-right">
          <p className="text-[9px] font-black uppercase tracking-widest text-neutral-500">Documento</p>
          <p className="mt-1 text-lg font-black">{code}</p>
          <p className="mt-2 text-[10px] font-bold text-neutral-500">Emissao</p>
          <p className="text-[12px] font-bold">{fmtDate(file.upload_date)}</p>
          <span className="mt-3 inline-flex rounded-full border border-neutral-900 px-3 py-1 text-[9px] font-black uppercase tracking-widest">
            {statusLabel}
          </span>
        </div>
      </header>

      <section className="mt-5 grid grid-cols-[1.18fr_0.82fr] gap-4">
        <div className="rounded-xl border-2 border-neutral-900 p-4">
          <p className="text-[9px] font-black uppercase tracking-[0.24em] text-neutral-500">Cliente faturado</p>
          <h2 className="mt-2 text-2xl font-black leading-tight">{company?.name || 'Empresa nao informada'}</h2>
          <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2 text-[12px]">
            <InvoiceDocField label="CNPJ" value={company?.cnpj || '-'} />
            <InvoiceDocField label="Contato" value={company?.email || company?.phone || '-'} />
            <InvoiceDocField label="Endereco" value={company?.address || '-'} wide />
            <InvoiceDocField label="Origem" value={isEventInvoice ? 'Eventos / O.S.' : (file.category || file.type || '-')} />
            <InvoiceDocField label="Periodo" value={eventPeriod} />
          </div>
        </div>

        <div className="rounded-xl bg-neutral-900 p-4 text-white">
          <p className="text-[9px] font-black uppercase tracking-[0.24em] text-neutral-400">Controle de recebimento</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <InvoiceDocDarkMetric label="Vencimento" value={file.due_date ? fmtDate(file.due_date) : 'A definir'} />
            <InvoiceDocDarkMetric label="Aging" value={dueInfo.label} />
            <InvoiceDocDarkMetric label="Status" value={statusLabel} />
            <InvoiceDocDarkMetric label="Total" value={money(total)} />
          </div>
        </div>
      </section>

      {isEventInvoice && (
        <section className="mt-5 grid grid-cols-3 gap-3">
          <InvoiceDocMetric label="Evento" value={event?.name || 'Evento vinculado'} />
          <InvoiceDocMetric label="Local" value={event?.halls?.join(' / ') || event?.hall_name || '-'} />
          <InvoiceDocMetric label="Participantes" value={event?.attendees_count ? `${event.attendees_count} pessoas` : '-'} />
        </section>
      )}

      <section className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[10px] font-black uppercase tracking-[0.24em] text-neutral-500">Composicao da fatura</h3>
          <span className="text-[10px] font-bold text-neutral-400">Page 1 of 1</span>
        </div>
        {loadingEvent ? (
          <div className="rounded-xl border border-neutral-200 py-8 text-center text-xs text-neutral-400">Carregando itens do evento...</div>
        ) : (
          <RoyalDocumentTable
            headers={['Data', 'Descricao', 'Valor']}
            rows={items.map((item) => [
              item.date,
              <span>
                <strong>{item.description}</strong>
                <br />
                <span className="text-[10px] text-neutral-500">{item.detail}</span>
              </span>,
              money(item.total),
            ])}
          />
        )}
      </section>

      <section className="mt-6 grid grid-cols-[1fr_72mm] gap-5">
        <div className="space-y-3">
          <InvoiceDocNote title="Instrucao financeira" text={isEventInvoice
            ? 'Fatura vinculada a ordem de servico de eventos. Conferir composicao, vencimento e condicoes acordadas antes da baixa.'
            : 'Documento emitido para controle de recebimento e acompanhamento do lancamento financeiro no Royal PMS.'}
          />
          <InvoiceDocNote title="Observacoes" text={file.period ? `Periodo de competencia: ${file.period}` : 'Sem observacoes adicionais registradas.'} />
        </div>

        <div className="rounded-xl border border-neutral-300 p-4">
          <p className="text-[9px] font-black uppercase tracking-[0.24em] text-neutral-500">Resumo financeiro</p>
          <InvoiceDocTotal label="Subtotal" value={money(subtotal)} />
          {issAmount > 0 && <InvoiceDocTotal label={`ISS ${event?.iss_rate || ''}%`} value={money(issAmount)} />}
          <div className="mt-3 border-t-2 border-neutral-900 pt-3">
            <InvoiceDocTotal label="Total" value={money(total)} strong />
          </div>
        </div>
      </section>

      <footer className="absolute bottom-5 left-12 right-12">
        <div className="grid grid-cols-2 gap-12">
          <InvoiceDocSignature label="Financeiro Royal" />
          <InvoiceDocSignature label="Cliente / responsavel" />
        </div>
        <div className="mt-5 border-t border-neutral-900 pt-2 text-center text-[11px]">
          www.royalmacae.com.br - reservas@royalmacae.com.br
        </div>
      </footer>
    </section>
  );
}

function getDueInfo(due?: string) {
  if (!due) return { label: 'Sem vencimento', days: null };
  const today = startOfToday();
  const dueDate = new Date(due);
  const days = Math.round((dueDate.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { label: `${Math.abs(days)}d atraso`, days };
  if (days === 0) return { label: 'Vence hoje', days };
  return { label: `${days}d restantes`, days };
}

function InvoiceDocField({ label, value, wide = false }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <p className="text-[9px] font-black uppercase tracking-widest text-neutral-500">{label}</p>
      <p className="font-bold">{value}</p>
    </div>
  );
}

function InvoiceDocDarkMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/15 p-2">
      <p className="text-[8px] font-black uppercase tracking-widest text-neutral-400">{label}</p>
      <p className="mt-1 text-sm font-black text-white">{value}</p>
    </div>
  );
}

function InvoiceDocMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-neutral-100 p-3">
      <p className="text-[9px] font-black uppercase tracking-widest text-neutral-500">{label}</p>
      <p className="mt-1 truncate text-sm font-black">{value}</p>
    </div>
  );
}

function InvoiceDocNote({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-neutral-300 p-3">
      <p className="text-[9px] font-black uppercase tracking-widest text-neutral-500">{title}</p>
      <p className="mt-2 whitespace-pre-line text-[11px] leading-5">{text}</p>
    </div>
  );
}

function InvoiceDocTotal({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`mt-2 flex justify-between text-xs ${strong ? 'text-base font-black' : 'font-bold'}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function InvoiceDocSignature({ label }: { label: string }) {
  return (
    <div>
      <div className="border-t border-neutral-900 pt-2 text-center text-[11px] font-bold">{label}</div>
    </div>
  );
}
