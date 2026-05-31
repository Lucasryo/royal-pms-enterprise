import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../supabase';
import { Company, FiscalFile, Reservation, ReservationRequest, UserProfile } from '../types';
import { logAudit, sendNotification } from '../lib/audit';

type StaffRecipient = { id: string; role: string; company_id?: string | null };
type Focus = 'requests' | 'billing';

const money = (value: number) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dateBR = (value?: string | null) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '-';
const nightsOf = (item: { check_in?: string; check_out?: string }) => {
  if (!item.check_in || !item.check_out) return 0;
  const diff = new Date(`${item.check_out}T12:00:00`).getTime() - new Date(`${item.check_in}T12:00:00`).getTime();
  return Math.max(1, Math.ceil(diff / 86400000));
};

const REQUEST_STATUS: Record<string, { label: string; tone: string; icon: typeof Clock }> = {
  REQUESTED: { label: 'Solicitada', tone: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock },
  APPROVED: { label: 'Aprovada', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  REJECTED: { label: 'Recusada', tone: 'bg-red-50 text-red-700 border-red-200', icon: AlertTriangle },
};

const RESERVATION_STATUS: Record<string, { label: string; tone: string }> = {
  PENDING: { label: 'Pendente', tone: 'bg-amber-50 text-amber-700' },
  CONFIRMED: { label: 'Confirmada', tone: 'bg-blue-50 text-blue-700' },
  CHECKED_IN: { label: 'Hospedado', tone: 'bg-violet-50 text-violet-700' },
  CHECKED_OUT: { label: 'A faturar', tone: 'bg-emerald-50 text-emerald-700' },
  CANCELLED: { label: 'Cancelada', tone: 'bg-red-50 text-red-700' },
};

export default function ReservationsChannelB2BDesk({ profile }: { profile: UserProfile }) {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<ReservationRequest[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [files, setFiles] = useState<FiscalFile[]>([]);
  const [search, setSearch] = useState('');
  const [focus, setFocus] = useState<Focus>('requests');
  const [busyId, setBusyId] = useState<string | null>(null);

  const canApprove = ['admin', 'manager', 'reservations', 'reception'].includes(profile.role);
  const canNotifyFinance = ['admin', 'manager', 'reservations', 'finance', 'faturamento'].includes(profile.role);

  useEffect(() => {
    fetchAll();
    const channel = supabase.channel('reservas-channel-b2b-desk')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservation_requests' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'files' }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchAll() {
    setLoading(true);
    const [reqResult, resResult, companyResult, fileResult] = await Promise.all([
      supabase.from('reservation_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('reservations').select('*').eq('payment_method', 'BILLED').order('check_in', { ascending: false }),
      supabase.from('companies').select('*').order('name'),
      supabase.from('files').select('*').order('upload_date', { ascending: false }),
    ]);

    if (reqResult.error) toast.error(reqResult.error.message);
    if (resResult.error) toast.error(resResult.error.message);
    if (reqResult.data) setRequests(reqResult.data as ReservationRequest[]);
    if (resResult.data) setReservations(resResult.data as Reservation[]);
    if (companyResult.data) setCompanies(companyResult.data as Company[]);
    if (fileResult.data) setFiles(fileResult.data as FiscalFile[]);
    setLoading(false);
  }

  const companyName = (id?: string | null) => companies.find((company) => company.id === id)?.name || 'Sem empresa';
  const docsFor = (reservation: Reservation) => {
    const code = (reservation.reservation_code || '').toLowerCase();
    return files.filter((file) => [
      file.original_name,
      file.storage_path,
      file.period,
      file.category,
    ].filter(Boolean).join(' ').toLowerCase().includes(code));
  };

  const filteredRequests = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((request) => {
      if (!q) return true;
      return [
        request.reservation_code,
        request.guest_name,
        request.requested_by,
        request.cost_center,
        companyName(request.company_id),
      ].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [requests, companies, search]);

  const filteredReservations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reservations.filter((reservation) => {
      if (!q) return true;
      return [
        reservation.reservation_code,
        reservation.guest_name,
        reservation.room_number,
        reservation.cost_center,
        companyName(reservation.company_id),
      ].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [reservations, companies, search]);

  const metrics = useMemo(() => {
    const openRequests = requests.filter((request) => request.status === 'REQUESTED').length;
    const checkedOut = reservations.filter((reservation) => reservation.status === 'CHECKED_OUT');
    const activeBilled = reservations.filter((reservation) => !['CANCELLED'].includes(reservation.status));
    const pendingAmount = checkedOut.reduce((sum, reservation) => sum + Number(reservation.total_amount || 0), 0);
    return {
      openRequests,
      activeBilled: activeBilled.length,
      checkedOut: checkedOut.length,
      pendingAmount,
    };
  }, [requests, reservations]);

  async function recipientsFor(roles: string[]) {
    const { data, error } = await supabase.from('profiles').select('id, role, company_id');
    if (error) throw error;
    return ((data || []) as StaffRecipient[]).filter((user) => roles.includes(user.role));
  }

  async function notifyRoles(roles: string[], title: string, message: string) {
    const recipients = await recipientsFor(roles);
    for (const recipient of recipients) {
      await sendNotification({
        user_id: recipient.id,
        title,
        message,
        link: '/reservas-channel',
      });
    }
    return recipients.length;
  }

  async function approveAsBilled(request: ReservationRequest) {
    if (!canApprove) {
      toast.error('Seu perfil nao pode aprovar solicitacoes.');
      return;
    }
    if (!request.id) return;
    setBusyId(request.id);
    try {
      const { id: _id, status: _status, ...payload } = request as any;
      const { data: reservation, error: insertError } = await supabase
        .from('reservations')
        .insert([{
          ...payload,
          status: 'CONFIRMED',
          payment_method: 'BILLED',
          payment_charge_status: 'not_applicable',
          payment_token_status: null,
          payment_token_provider: null,
          created_at: new Date().toISOString(),
        }])
        .select()
        .single();

      if (insertError) throw insertError;
      const { error: deleteError } = await supabase.from('reservation_requests').delete().eq('id', request.id);
      if (deleteError) throw deleteError;

      await notifyRoles(
        ['finance', 'faturamento', 'admin'],
        'Reserva B2B aprovada para faturamento',
        `Reserva ${request.reservation_code} de ${companyName(request.company_id)} aprovada como faturada. Hospede: ${request.guest_name}.`,
      );

      await logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Reserva B2B aprovada no Reservas Channel',
        details: {
          module: 'reservas-channel',
          reservation_code: request.reservation_code,
          reservation_id: reservation?.id,
          payment_method: 'BILLED',
          summary: `Solicitacao ${request.reservation_code} aprovada como faturada`,
        },
        type: 'create',
      });

      toast.success('Solicitacao aprovada e enviada para faturamento.');
      await fetchAll();
    } catch (error: any) {
      toast.error(error?.message || 'Nao foi possivel aprovar a solicitacao.');
    } finally {
      setBusyId(null);
    }
  }

  async function sendToFinance(reservation: Reservation) {
    if (!canNotifyFinance) {
      toast.error('Seu perfil nao pode acionar o financeiro.');
      return;
    }
    setBusyId(reservation.id);
    try {
      const count = await notifyRoles(
        ['finance', 'faturamento', 'admin'],
        'Reserva B2B para cobranca faturada',
        `Reserva ${reservation.reservation_code} de ${companyName(reservation.company_id)} esta no fluxo faturado. Hospede: ${reservation.guest_name}. Valor: ${money(Number(reservation.total_amount || 0))}.`,
      );
      await logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Reserva B2B enviada ao faturamento',
        details: {
          module: 'reservas-channel',
          reservation_code: reservation.reservation_code,
          recipients: count,
          summary: `Reserva ${reservation.reservation_code} enviada ao financeiro/faturamento`,
        },
        type: 'update',
      });
      toast.success(`Financeiro/faturamento avisado (${count} destinatario(s)).`);
    } catch (error: any) {
      toast.error(error?.message || 'Nao foi possivel avisar o financeiro.');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center rounded-[2rem] border border-neutral-200 bg-white">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-violet-500" />
          <p className="mt-3 text-xs font-black uppercase tracking-[0.22em] text-neutral-400">Sincronizando B2B</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Solicitacoes abertas" value={metrics.openRequests} icon={Clock} tone="amber" />
        <MetricCard label="Reservas faturadas" value={metrics.activeBilled} icon={Building2} tone="violet" />
        <MetricCard label="Check-out a faturar" value={metrics.checkedOut} icon={FileText} tone="emerald" />
        <MetricCard label="Valor pendente" value={money(metrics.pendingAmount)} icon={ShieldCheck} tone="dark" />
      </section>

      <section className="rounded-[2rem] border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por reserva, empresa, hospede, centro de custo..."
              className="h-12 w-full rounded-2xl border border-neutral-200 bg-neutral-50 pl-11 pr-4 text-sm outline-none transition focus:border-violet-400 focus:bg-white"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {([
              ['requests', 'Solicitacoes'],
              ['billing', 'Faturamento'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFocus(id)}
                className={`rounded-2xl px-4 py-2 text-xs font-black transition ${
                  focus === id ? 'bg-neutral-950 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                {label}
              </button>
            ))}
            <button type="button" onClick={fetchAll} className="inline-flex items-center gap-2 rounded-2xl border border-neutral-200 px-4 py-2 text-xs font-black text-neutral-600 hover:bg-neutral-50">
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
          </div>
        </div>
      </section>

      {focus === 'requests' ? (
        <RequestsTable
          requests={filteredRequests}
          companyName={companyName}
          busyId={busyId}
          canApprove={canApprove}
          onApprove={approveAsBilled}
        />
      ) : (
        <BillingTable
          reservations={filteredReservations}
          companyName={companyName}
          docsFor={docsFor}
          busyId={busyId}
          onSendToFinance={sendToFinance}
        />
      )}

      <section className="rounded-[2rem] border border-dashed border-violet-200 bg-violet-50/70 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-violet-600">Roadmap de cobranca</p>
            <h3 className="mt-2 text-lg font-black text-neutral-950">Agora: faturado. Depois: cartao integrado.</h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-600">
              O portal ja organiza solicitacao, aprovacao e fila de faturamento. A cobranca por cartao fica preparada para a fase futura, sem pedir numero completo ou CVV dentro do PMS.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-xs font-black text-violet-700 shadow-sm">
            <ShieldCheck className="h-4 w-4" />
            Billed first
          </span>
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: typeof Clock;
  tone: 'amber' | 'violet' | 'emerald' | 'dark';
}) {
  const tones = {
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    violet: 'bg-violet-50 text-violet-700 border-violet-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    dark: 'bg-neutral-950 text-white border-neutral-950',
  };
  return (
    <div className={`rounded-[1.5rem] border p-4 ${tones[tone]}`}>
      <Icon className="h-5 w-5 opacity-75" />
      <p className="mt-4 text-[10px] font-black uppercase tracking-[0.18em] opacity-60">{label}</p>
      <p className="mt-1 text-2xl font-black tracking-tight">{value}</p>
    </div>
  );
}

function RequestsTable({
  requests,
  companyName,
  busyId,
  canApprove,
  onApprove,
}: {
  requests: ReservationRequest[];
  companyName: (id?: string | null) => string;
  busyId: string | null;
  canApprove: boolean;
  onApprove: (request: ReservationRequest) => void;
}) {
  return (
    <div className="overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-sm">
      <div className="border-b border-neutral-100 px-5 py-4">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-violet-600">Fila sincronizada</p>
        <h3 className="mt-1 text-xl font-black text-neutral-950">Solicitacoes vindas do cliente</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] text-left">
          <thead className="bg-neutral-50 text-[10px] font-black uppercase tracking-widest text-neutral-400">
            <tr>
              <th className="px-5 py-4">Reserva</th>
              <th className="px-5 py-4">Empresa / solicitante</th>
              <th className="px-5 py-4">Periodo</th>
              <th className="px-5 py-4">Faturamento</th>
              <th className="px-5 py-4 text-right">Valor</th>
              <th className="px-5 py-4">Status</th>
              <th className="px-5 py-4 text-right">Acao</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {requests.map((request) => {
              const meta = REQUEST_STATUS[request.status] || REQUEST_STATUS.REQUESTED;
              const StatusIcon = meta.icon;
              return (
                <tr key={request.id || request.reservation_code} className="hover:bg-neutral-50">
                  <td className="px-5 py-4">
                    <p className="font-black text-neutral-950">{request.reservation_code}</p>
                    <p className="text-xs text-neutral-500">{request.guest_name}</p>
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-bold text-neutral-900">{companyName(request.company_id)}</p>
                    <p className="text-xs text-neutral-500">{request.requested_by || request.contact_email || '-'}</p>
                  </td>
                  <td className="px-5 py-4 text-sm text-neutral-700">
                    {dateBR(request.check_in)} - {dateBR(request.check_out)}
                    <p className="text-xs text-neutral-400">{nightsOf(request)} diaria(s)</p>
                  </td>
                  <td className="px-5 py-4">
                    <p className="text-sm font-black text-neutral-950">Faturado</p>
                    <p className="text-xs text-neutral-500">CC {request.cost_center || '-'}</p>
                  </td>
                  <td className="px-5 py-4 text-right font-black tabular-nums text-neutral-950">{money(Number(request.total_amount || 0))}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-black ${meta.tone}`}>
                      <StatusIcon className="h-3.5 w-3.5" />
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      type="button"
                      disabled={!canApprove || request.status !== 'REQUESTED' || busyId === request.id}
                      onClick={() => onApprove(request)}
                      className="inline-flex items-center gap-2 rounded-xl bg-neutral-950 px-4 py-2 text-xs font-black text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {busyId === request.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                      Aprovar faturado
                    </button>
                  </td>
                </tr>
              );
            })}
            {requests.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-sm font-bold text-neutral-400">
                  Nenhuma solicitacao B2B encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BillingTable({
  reservations,
  companyName,
  docsFor,
  busyId,
  onSendToFinance,
}: {
  reservations: Reservation[];
  companyName: (id?: string | null) => string;
  docsFor: (reservation: Reservation) => FiscalFile[];
  busyId: string | null;
  onSendToFinance: (reservation: Reservation) => void;
}) {
  return (
    <div className="overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-sm">
      <div className="border-b border-neutral-100 px-5 py-4">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-600">Financeiro / faturamento</p>
        <h3 className="mt-1 text-xl font-black text-neutral-950">Reservas faturadas para cobrar</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] text-left">
          <thead className="bg-neutral-50 text-[10px] font-black uppercase tracking-widest text-neutral-400">
            <tr>
              <th className="px-5 py-4">Reserva</th>
              <th className="px-5 py-4">Empresa / pax</th>
              <th className="px-5 py-4">Periodo</th>
              <th className="px-5 py-4">Documentos</th>
              <th className="px-5 py-4 text-right">Valor</th>
              <th className="px-5 py-4">Status</th>
              <th className="px-5 py-4 text-right">Acao</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {reservations.map((reservation) => {
              const docs = docsFor(reservation);
              const meta = RESERVATION_STATUS[reservation.status] || RESERVATION_STATUS.PENDING;
              return (
                <tr key={reservation.id} className="hover:bg-neutral-50">
                  <td className="px-5 py-4">
                    <p className="font-black text-neutral-950">{reservation.reservation_code}</p>
                    <p className="text-xs text-neutral-500">UH {reservation.room_number || '-'}</p>
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-bold text-neutral-900">{companyName(reservation.company_id)}</p>
                    <p className="text-xs text-neutral-500">{reservation.guest_name}</p>
                  </td>
                  <td className="px-5 py-4 text-sm text-neutral-700">
                    {dateBR(reservation.check_in)} - {dateBR(reservation.check_out)}
                    <p className="text-xs text-neutral-400">{nightsOf(reservation)} diaria(s)</p>
                  </td>
                  <td className="px-5 py-4">
                    <p className="text-sm font-black text-neutral-950">{docs.length} arquivo(s)</p>
                    <p className="text-xs text-neutral-500">{docs.length ? 'NF/extrato vinculados' : 'Aguardando anexos'}</p>
                  </td>
                  <td className="px-5 py-4 text-right font-black tabular-nums text-neutral-950">{money(Number(reservation.total_amount || 0))}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-black ${meta.tone}`}>{meta.label}</span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      type="button"
                      disabled={busyId === reservation.id}
                      onClick={() => onSendToFinance(reservation)}
                      className="inline-flex items-center gap-2 rounded-xl bg-neutral-950 px-4 py-2 text-xs font-black text-white transition hover:bg-black disabled:opacity-50"
                    >
                      {busyId === reservation.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Avisar financeiro
                    </button>
                  </td>
                </tr>
              );
            })}
            {reservations.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-sm font-bold text-neutral-400">
                  Nenhuma reserva faturada encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
