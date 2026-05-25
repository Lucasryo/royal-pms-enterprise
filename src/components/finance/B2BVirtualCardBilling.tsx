import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase';
import { Company, FiscalFile, Reservation, ReservationPaymentToken, UserProfile } from '../../types';
import { hasPermission } from '../../lib/permissions';
import { logAudit } from '../../lib/audit';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle, CheckCircle2, Clock, CreditCard, Download, FileText, Loader2,
  Paperclip, Receipt, RefreshCw, Search, ShieldCheck, Upload, X as CloseIcon,
} from 'lucide-react';

type ChargeType = 'diaria' | 'servico' | 'alimento' | 'bebida' | 'lavanderia' | 'estorno' | 'outro';
type FolioCharge = {
  id: string;
  reservation_id: string;
  room_number: string | null;
  charge_date: string;
  description: string;
  quantity: number;
  unit_value: number;
  total_value: number;
  charge_type: ChargeType;
  posted_by: string | null;
  created_at: string;
};

type BillingStatus = 'charged' | 'ready' | 'pending' | 'failed';
type DetailTab = 'charge' | 'documents' | 'summary';
type UploadKind = 'nota-fiscal' | 'extrato';

const money = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));
const dateBR = (value?: string | null) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR') : '-';
const dateTimeBR = (value?: string | null) => value ? new Date(value).toLocaleString('pt-BR') : '-';

const chargeLabel: Record<ChargeType, string> = {
  diaria: 'Diaria',
  servico: 'Servico',
  alimento: 'Alimento',
  bebida: 'Bebida',
  lavanderia: 'Lavanderia',
  estorno: 'Estorno',
  outro: 'Outro',
};

const statusMeta: Record<BillingStatus, { label: string; tone: string; icon: typeof Clock }> = {
  charged: { label: 'Cobrado', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  ready: { label: 'Pronto para cobrar', tone: 'bg-amber-50 text-amber-700 border-amber-200', icon: ShieldCheck },
  pending: { label: 'Token pendente', tone: 'bg-neutral-100 text-neutral-600 border-neutral-200', icon: Clock },
  failed: { label: 'Problema financeiro', tone: 'bg-red-50 text-red-700 border-red-200', icon: AlertTriangle },
};

function reservationStatus(token?: ReservationPaymentToken | null, reservation?: Reservation | null): BillingStatus {
  if (reservation?.payment_charge_status === 'charged' || token?.status === 'charged') return 'charged';
  if (reservation?.payment_charge_status === 'failed' || token?.status === 'failed') return 'failed';
  if (token && ['tokenized', 'charge_ready'].includes(token.status)) return 'ready';
  return 'pending';
}

function reservationDocs(files: FiscalFile[], reservation: Reservation) {
  const code = (reservation.reservation_code || '').toLowerCase();
  const id = reservation.id.toLowerCase();
  return files.filter((file) => {
    const haystack = [
      file.original_name,
      file.storage_path,
      file.category,
      file.period,
    ].filter(Boolean).join(' ').toLowerCase();
    return (!!code && haystack.includes(code)) || haystack.includes(id);
  });
}

export default function B2BVirtualCardBilling({ profile }: { profile: UserProfile }) {
  const canCharge = hasPermission(profile, 'canChargeVirtualCard', ['admin', 'manager', 'reception', 'finance', 'faturamento']);
  const canManageFinance = hasPermission(profile, 'canManageFinance' as any, ['admin', 'manager', 'finance', 'faturamento']);
  const [loading, setLoading] = useState(true);
  const [chargingId, setChargingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState<UploadKind | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [tokens, setTokens] = useState<ReservationPaymentToken[]>([]);
  const [charges, setCharges] = useState<FolioCharge[]>([]);
  const [files, setFiles] = useState<FiscalFile[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | BillingStatus>('all');
  const [selected, setSelected] = useState<Reservation | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('charge');

  useEffect(() => {
    fetchAll();
    const channel = supabase.channel('b2b-virtual-card-billing')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservation_payment_tokens' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'folio_charges' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'files' }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchAll() {
    setLoading(true);
    const [r, c, t, ch, f] = await Promise.all([
      supabase.from('reservations').select('*').eq('payment_method', 'VIRTUAL_CARD').order('check_out', { ascending: false }),
      supabase.from('companies').select('*').order('name'),
      supabase.from('reservation_payment_tokens').select('*').order('created_at', { ascending: false }),
      supabase.from('folio_charges').select('*').order('charge_date', { ascending: true }),
      supabase.from('files').select('*').order('upload_date', { ascending: false }),
    ]);
    if (r.data) setReservations(r.data as Reservation[]);
    if (c.data) setCompanies(c.data as Company[]);
    if (t.data) setTokens(t.data as ReservationPaymentToken[]);
    if (ch.data) setCharges(ch.data as FolioCharge[]);
    if (f.data) setFiles(f.data as FiscalFile[]);
    setLoading(false);
  }

  const companyName = (id?: string) => companies.find((c) => c.id === id)?.name || 'Sem empresa';
  const tokenOf = (reservationId: string) => tokens.find((token) => token.reservation_id === reservationId);
  const chargesOf = (reservationId: string) => charges.filter((charge) => charge.reservation_id === reservationId);
  const folioTotal = (reservation: Reservation) => {
    const total = chargesOf(reservation.id).reduce((sum, charge) => sum + Number(charge.total_value || 0), 0);
    return total > 0 ? total : Number(reservation.total_amount || 0);
  };
  const dailyTotal = (reservation: Reservation) => chargesOf(reservation.id)
    .filter((charge) => charge.charge_type === 'diaria')
    .reduce((sum, charge) => sum + Number(charge.total_value || 0), 0);
  const extraTotal = (reservation: Reservation) => folioTotal(reservation) - dailyTotal(reservation);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reservations.filter((reservation) => {
      const token = tokenOf(reservation.id);
      const status = reservationStatus(token, reservation);
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (!q) return true;
      const haystack = [
        reservation.reservation_code,
        reservation.guest_name,
        reservation.room_number,
        companyName(reservation.company_id),
        token?.last4,
        token?.brand,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [reservations, tokens, companies, search, statusFilter]);

  const totals = useMemo(() => {
    const base = { total: reservations.length, charged: 0, ready: 0, pending: 0, failed: 0, amount: 0 };
    reservations.forEach((reservation) => {
      const status = reservationStatus(tokenOf(reservation.id), reservation);
      base[status] += 1;
      if (status !== 'charged') base.amount += folioTotal(reservation);
    });
    return base;
  }, [reservations, tokens, charges]);

  async function chargeReservation(reservation: Reservation) {
    const token = tokenOf(reservation.id);
    const status = reservationStatus(token, reservation);
    const amount = folioTotal(reservation);
    if (!canCharge) {
      toast.error('Seu perfil nao pode cobrar cartao virtual.');
      return;
    }
    if (status !== 'ready') {
      toast.error('Cartao virtual ainda nao esta pronto para cobranca.');
      return;
    }
    if (amount <= 0) {
      toast.error('Nao ha saldo para cobrar.');
      return;
    }
    if (!confirm(`Cobrar ${money(amount)} da reserva ${reservation.reservation_code}?`)) return;
    setChargingId(reservation.id);
    const { data, error } = await supabase.functions.invoke('charge-virtual-card', {
      body: { reservation_id: reservation.id, amount, note: 'Cobranca B2B pelo painel financeiro' },
    });
    setChargingId(null);
    if (error) {
      toast.error(error.message || 'Falha ao cobrar cartao virtual.');
      return;
    }
    if (data?.error) {
      toast.error(data.error);
      return;
    }
    toast.success(`Cartao virtual cobrado: ${money(Number(data?.charged_amount || amount))}`);
    await fetchAll();
  }

  async function markFinancialIssue(reservation: Reservation) {
    if (!canManageFinance) {
      toast.error('Seu perfil nao pode alterar status financeiro.');
      return;
    }
    const reason = window.prompt('Descreva o problema financeiro:', 'Recusado ou pendente de validacao do cartao virtual');
    if (!reason) return;
    const token = tokenOf(reservation.id);
    const now = new Date().toISOString();
    if (token) {
      const { error } = await supabase.from('reservation_payment_tokens').update({
        status: 'failed',
        failure_reason: reason,
        updated_at: now,
      }).eq('id', token.id);
      if (error) { toast.error(error.message); return; }
    }
    const { error } = await supabase.from('reservations').update({
      payment_charge_status: 'failed',
      payment_token_status: 'failed',
      updated_at: now,
    }).eq('id', reservation.id);
    if (error) { toast.error(error.message); return; }
    await logAudit({
      user_id: profile.id,
      user_name: profile.name,
      action: 'Problema financeiro B2B',
      details: {
        module: 'financeiro',
        reservation_code: reservation.reservation_code,
        guest_name: reservation.guest_name,
        reason,
        summary: `Reserva ${reservation.reservation_code} marcada com problema financeiro`,
      },
      type: 'update',
    });
    toast.success('Reserva marcada com problema financeiro.');
    fetchAll();
  }

  async function uploadDocument(reservation: Reservation, file: File, kind: UploadKind) {
    if (!canManageFinance) {
      toast.error('Seu perfil nao pode anexar documentos financeiros.');
      return;
    }
    setUploading(kind);
    try {
      const safeName = file.name.replace(/[^\w.\-]+/g, '_');
      const code = reservation.reservation_code || reservation.id;
      const storagePath = `b2b-virtual-card/${code}/${kind}-${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from('files').upload(storagePath, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
      if (uploadError) throw uploadError;
      const { error: insertError } = await supabase.from('files').insert([{
        company_id: reservation.company_id,
        type: 'Hospedagem',
        period: `${dateBR(reservation.check_in)} a ${dateBR(reservation.check_out)}`,
        original_name: `${kind === 'nota-fiscal' ? 'Nota Fiscal' : 'Extrato'} - ${code} - ${file.name}`,
        storage_path: storagePath,
        upload_date: new Date().toISOString(),
        uploader_id: profile.id,
        due_date: reservation.check_out,
        viewed_by_client: false,
        amount: folioTotal(reservation),
        category: kind === 'nota-fiscal' ? 'Nota Fiscal' : 'Extrato',
        status: 'PENDING',
      }]);
      if (insertError) throw insertError;
      await logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: kind === 'nota-fiscal' ? 'Nota Fiscal anexada' : 'Extrato anexado',
        details: {
          module: 'financeiro',
          reservation_code: code,
          guest_name: reservation.guest_name,
          file_name: file.name,
          summary: `Documento anexado na cobranca B2B da reserva ${code}`,
        },
        type: 'upload',
      });
      toast.success('Documento anexado.');
      await fetchAll();
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao anexar documento.');
    } finally {
      setUploading(null);
    }
  }

  async function downloadFile(file: FiscalFile) {
    const { data, error } = await supabase.storage.from('files').download(file.storage_path);
    if (error || !data) {
      toast.error(error?.message || 'Arquivo nao encontrado.');
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.original_name || 'documento';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <div className="flex min-h-[45vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-neutral-300" /></div>;
  }

  const selectedToken = selected ? tokenOf(selected.id) : null;
  const selectedCharges = selected ? chargesOf(selected.id) : [];
  const selectedDocs = selected ? reservationDocs(files, selected) : [];
  const selectedStatus = selected ? reservationStatus(selectedToken, selected) : 'pending';

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-neutral-200 bg-neutral-950 p-5 text-white shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-300">Cobranças B2B</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight">Cartão virtual corporativo</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
              Todas as reservas com cartão virtual, status de token, documentos de cobrança e ação de cobrança no checkout/faturamento.
            </p>
          </div>
          <button onClick={fetchAll} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-2 text-xs font-black text-neutral-950">
            <RefreshCw className="h-4 w-4" /> Atualizar
          </button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Kpi label="Reservas" value={totals.total} />
          <Kpi label="Pendentes" value={totals.pending} />
          <Kpi label="Prontas" value={totals.ready} />
          <Kpi label="Problemas" value={totals.failed} />
          <Kpi label="A receber" value={money(totals.amount)} strong />
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por reserva, empresa, hospede, UH ou final do cartao..."
            className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 py-3 pl-10 pr-4 text-sm outline-none focus:border-neutral-900 focus:bg-white"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(['all', 'pending', 'ready', 'failed', 'charged'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`rounded-2xl px-4 py-2 text-xs font-black transition ${
                statusFilter === status ? 'bg-neutral-950 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              {status === 'all' ? 'Todos' : statusMeta[status].label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left">
            <thead className="bg-neutral-50 text-[10px] font-black uppercase tracking-widest text-neutral-400">
              <tr>
                <th className="px-5 py-4">Reserva</th>
                <th className="px-5 py-4">Empresa / Pax</th>
                <th className="px-5 py-4">Periodo</th>
                <th className="px-5 py-4">Cartao</th>
                <th className="px-5 py-4 text-right">Valor</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4 text-right">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filtered.map((reservation) => {
                const token = tokenOf(reservation.id);
                const status = reservationStatus(token, reservation);
                const meta = statusMeta[status];
                const StatusIcon = meta.icon;
                return (
                  <tr key={reservation.id} className="hover:bg-neutral-50">
                    <td className="px-5 py-4">
                      <p className="font-black text-neutral-950">{reservation.reservation_code}</p>
                      <p className="text-xs text-neutral-500">UH {reservation.room_number || '-'} · {reservation.status}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-bold text-neutral-900">{companyName(reservation.company_id)}</p>
                      <p className="text-xs text-neutral-500">{reservation.guest_name}</p>
                    </td>
                    <td className="px-5 py-4 text-sm text-neutral-700">
                      {dateBR(reservation.check_in)} - {dateBR(reservation.check_out)}
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm font-bold text-neutral-900">{token?.brand || reservation.payment_card_brand || 'Gateway'}</p>
                      <p className="text-xs text-neutral-500">{token?.last4 || reservation.payment_card_last4 ? `Final ${token?.last4 || reservation.payment_card_last4}` : token?.status || 'Sem token'}</p>
                    </td>
                    <td className="px-5 py-4 text-right font-black tabular-nums text-neutral-950">{money(folioTotal(reservation))}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-black ${meta.tone}`}>
                        <StatusIcon className="h-3.5 w-3.5" /> {meta.label}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => { setSelected(reservation); setDetailTab('charge'); }}
                        className="rounded-xl bg-neutral-950 px-4 py-2 text-xs font-black text-white"
                      >
                        Abrir cobrança
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-sm font-bold text-neutral-400">Nenhuma reserva de cartão virtual encontrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {selected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-3xl bg-white shadow-2xl"
            >
              <div className="flex items-start justify-between border-b border-neutral-100 bg-neutral-950 p-5 text-white">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-300">Cobrança B2B</p>
                  <h3 className="mt-1 text-2xl font-black">{selected.reservation_code}</h3>
                  <p className="mt-1 text-sm text-white/60">{companyName(selected.company_id)} · {selected.guest_name}</p>
                </div>
                <button onClick={() => setSelected(null)} className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white">
                  <CloseIcon className="h-5 w-5" />
                </button>
              </div>

              <div className="flex gap-2 border-b border-neutral-100 bg-neutral-50 px-5 py-3">
                {([
                  ['charge', 'Cobrança', CreditCard],
                  ['documents', 'NF e extrato', Paperclip],
                  ['summary', 'Resumo', Receipt],
                ] as const).map(([id, label, Icon]) => (
                  <button
                    key={id}
                    onClick={() => setDetailTab(id)}
                    className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-black ${
                      detailTab === id ? 'bg-neutral-950 text-white' : 'bg-white text-neutral-500 hover:text-neutral-900'
                    }`}
                  >
                    <Icon className="h-4 w-4" /> {label}
                  </button>
                ))}
              </div>

              <div className="max-h-[70vh] overflow-y-auto p-5">
                {detailTab === 'charge' && (
                  <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
                    <div className="rounded-3xl border border-neutral-200 p-4">
                      <h4 className="font-black text-neutral-950">Valores para cobrança</h4>
                      <div className="mt-4 space-y-2">
                        {selectedCharges.length === 0 ? (
                          <div className="rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-700">
                            Sem lançamentos de folio. Usando valor previsto da reserva: {money(Number(selected.total_amount || 0))}.
                          </div>
                        ) : selectedCharges.map((charge) => (
                          <div key={charge.id} className="flex items-center justify-between rounded-2xl bg-neutral-50 p-3 text-sm">
                            <div>
                              <p className="font-bold text-neutral-900">{charge.description}</p>
                              <p className="text-xs text-neutral-500">{chargeLabel[charge.charge_type]} · {dateBR(charge.charge_date)} · Qtd {charge.quantity}</p>
                            </div>
                            <p className="font-black tabular-nums text-neutral-950">{money(charge.total_value)}</p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <Metric label="Diarias" value={money(dailyTotal(selected))} />
                        <Metric label="Extras / taxas" value={money(extraTotal(selected))} />
                        <Metric label="Total a cobrar" value={money(folioTotal(selected))} strong />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-3xl border border-neutral-200 p-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Status do token</p>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-black ${statusMeta[selectedStatus].tone}`}>
                            {statusMeta[selectedStatus].label}
                          </span>
                          <span className="text-xs font-bold text-neutral-500">{selectedToken?.provider || selected.payment_token_provider || 'gateway'}</span>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                          <Metric label="Bandeira" value={selectedToken?.brand || selected.payment_card_brand || '-'} />
                          <Metric label="Final" value={selectedToken?.last4 || selected.payment_card_last4 || '-'} />
                          <Metric label="Janela início" value={dateBR(selectedToken?.charge_window_start || selected.payment_charge_window_start)} />
                          <Metric label="Janela fim" value={dateBR(selectedToken?.charge_window_end || selected.payment_charge_window_end)} />
                        </div>
                        {selectedToken?.failure_reason && (
                          <div className="mt-3 rounded-2xl bg-red-50 p-3 text-xs font-bold text-red-700">{selectedToken.failure_reason}</div>
                        )}
                      </div>

                      <button
                        onClick={() => chargeReservation(selected)}
                        disabled={!canCharge || selectedStatus !== 'ready' || chargingId === selected.id}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 px-5 py-4 text-sm font-black text-neutral-950 shadow-lg shadow-amber-300/30 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {chargingId === selected.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                        Cobrar cartão virtual
                      </button>
                      <button
                        onClick={() => markFinancialIssue(selected)}
                        disabled={!canManageFinance || selectedStatus === 'charged'}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-xs font-black text-red-700 disabled:opacity-45"
                      >
                        <AlertTriangle className="h-4 w-4" /> Marcar problema financeiro
                      </button>
                    </div>
                  </div>
                )}

                {detailTab === 'documents' && (
                  <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
                    <div className="space-y-3">
                      <UploadBox
                        label="Anexar nota fiscal"
                        sub="PDF/XML ou imagem da NF vinculada à cobrança."
                        icon={FileText}
                        loading={uploading === 'nota-fiscal'}
                        onFile={(file) => uploadDocument(selected, file, 'nota-fiscal')}
                      />
                      <UploadBox
                        label="Anexar extrato"
                        sub="Extrato do folio, demonstrativo ou documento de conferência."
                        icon={Receipt}
                        loading={uploading === 'extrato'}
                        onFile={(file) => uploadDocument(selected, file, 'extrato')}
                      />
                    </div>
                    <div className="rounded-3xl border border-neutral-200 p-4">
                      <h4 className="font-black text-neutral-950">Documentos anexados</h4>
                      <div className="mt-4 space-y-2">
                        {selectedDocs.map((file) => (
                          <button
                            key={file.id}
                            onClick={() => downloadFile(file)}
                            className="flex w-full items-center justify-between rounded-2xl bg-neutral-50 p-3 text-left hover:bg-neutral-100"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-neutral-900">{file.original_name}</p>
                              <p className="text-xs text-neutral-500">{file.category || file.type} · {dateTimeBR(file.upload_date)} · {money(Number(file.amount || 0))}</p>
                            </div>
                            <Download className="h-4 w-4 text-neutral-400" />
                          </button>
                        ))}
                        {selectedDocs.length === 0 && (
                          <div className="rounded-2xl border border-dashed border-neutral-200 p-8 text-center text-sm font-bold text-neutral-400">
                            Nenhuma NF ou extrato anexado para esta reserva.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {detailTab === 'summary' && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <Metric label="Empresa" value={companyName(selected.company_id)} />
                    <Metric label="Hospede" value={selected.guest_name} />
                    <Metric label="Reserva" value={selected.reservation_code} />
                    <Metric label="UH" value={selected.room_number || '-'} />
                    <Metric label="Check-in" value={dateBR(selected.check_in)} />
                    <Metric label="Check-out" value={dateBR(selected.check_out)} />
                    <Metric label="Centro de custo" value={selected.cost_center || '-'} />
                    <Metric label="Pagamento" value="Cartao virtual" />
                    <div className="md:col-span-2 rounded-3xl border border-neutral-200 p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Instruções fiscais</p>
                      <p className="mt-3 whitespace-pre-line text-sm leading-6 text-neutral-700">{selected.billing_info || selected.billing_obs || 'Sem instruções adicionais.'}</p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Kpi({ label, value, strong = false }: { label: string; value: string | number; strong?: boolean }) {
  return (
    <div className={`${strong ? 'bg-amber-300 text-neutral-950' : 'bg-white/10 text-white'} rounded-2xl p-4`}>
      <p className="text-[10px] font-black uppercase tracking-widest opacity-60">{label}</p>
      <p className="mt-2 text-xl font-black">{value}</p>
    </div>
  );
}

function Metric({ label, value, strong = false }: { label: string; value: string | number; strong?: boolean }) {
  return (
    <div className={`${strong ? 'bg-neutral-950 text-white' : 'bg-neutral-50 text-neutral-950'} rounded-2xl p-3`}>
      <p className="text-[9px] font-black uppercase tracking-widest opacity-50">{label}</p>
      <p className="mt-1 text-sm font-black">{value}</p>
    </div>
  );
}

function UploadBox({
  label, sub, icon: Icon, loading, onFile,
}: {
  label: string;
  sub: string;
  icon: typeof FileText;
  loading: boolean;
  onFile: (file: File) => void;
}) {
  return (
    <label className="block cursor-pointer rounded-3xl border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center transition hover:border-neutral-900 hover:bg-white">
      <input
        type="file"
        className="hidden"
        accept=".pdf,.xml,.jpg,.jpeg,.png,.webp"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.currentTarget.value = '';
        }}
      />
      {loading ? <Loader2 className="mx-auto h-8 w-8 animate-spin text-neutral-400" /> : <Icon className="mx-auto h-8 w-8 text-neutral-900" />}
      <p className="mt-3 font-black text-neutral-950">{label}</p>
      <p className="mt-1 text-xs leading-5 text-neutral-500">{sub}</p>
      <span className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-neutral-950 px-4 py-2 text-xs font-black text-white">
        <Upload className="h-3.5 w-3.5" /> Selecionar arquivo
      </span>
    </label>
  );
}
