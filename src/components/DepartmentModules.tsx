import { ComponentType, ReactNode, useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, BarChart3, BedDouble, Building2, CalendarDays, ClipboardList, CreditCard, FileText, Globe, Hotel, KeyRound, QrCode, Settings, ShieldCheck, Utensils, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../supabase';
import { UserProfile } from '../types';
import SharedHotelCalendar from './SharedHotelCalendar';
import ReservationsDashboard from './ReservationsDashboard';
import CheckInOutDashboard from './CheckInOutDashboard';
import HousekeepingDashboard from './HousekeepingDashboard';
import OperationsDashboard from './OperationsDashboard';
import AdminDashboard from './AdminDashboard';
import AuditDashboard from './AuditDashboard';
import EventsDashboard from './EventsDashboard';
import POSDashboard from './POSDashboard';
import ProfessionalPMSDashboard from './ProfessionalPMSDashboard';
import EnterpriseExtensionsDashboard, { EnterpriseTab } from './EnterpriseExtensionsDashboard';
import OperationalWorkQueue, { OperationalDepartment } from './OperationalWorkQueue';
import PublicRatesManager from './PublicRatesManager';
import BlockedDatesManager from './BlockedDatesManager';
import OccupancyChart from './OccupancyChart';

type ModuleTab<T extends string> = {
  id: T;
  label: string;
  icon: ComponentType<{ className?: string }>;
  render: () => ReactNode;
};

const moduleShellClass = 'space-y-6 pb-12';

export function ReservationsModuleDashboard({ profile }: { profile: UserProfile }) {
  return (
    <ModuleShell
      eyebrow="Modulo Reservas"
      title="Reservas, tarifas e demanda"
      description="Central unica para solicitacoes, reservas internas, tarifas, rate shopper e leitura do calendario do hotel."
      profile={profile}
      queueDepartment="reservations"
      tabs={[
        { id: 'central', label: 'Central de reservas', icon: CalendarDays, render: () => <ReservationsDashboard profile={profile} /> },
        { id: 'occupancy', label: 'Ocupação', icon: Activity, render: () => <OccupancyChart /> },
        { id: 'public-rates', label: 'Tarifas publicas', icon: Globe, render: () => <PublicRatesManager profile={profile} /> },
        { id: 'blocked-dates', label: 'Bloqueio de datas', icon: Hotel, render: () => <BlockedDatesManager profile={profile} /> },
        { id: 'tariffs', label: 'Tarifas corporativas', icon: CreditCard, render: () => <AdminDashboard profile={profile} initialTab="tariffs" /> },
        { id: 'revenue', label: 'Revenue e rate shopper', icon: BarChart3, render: () => <ProfessionalPMSDashboard profile={profile} allowedTabs={['revenue']} /> },
      ]}
    />
  );
}

export function ReceptionModuleDashboard({ profile }: { profile: UserProfile }) {
  return (
    <ModuleShell
      eyebrow="Modulo Recepcao"
      title="Recepcao, hospedagem e governanca"
      description="Check-in/out, walk-in, folio operacional, governanca, UHs, achados e perdidos e passagem de turno no mesmo lugar."
      profile={profile}
      queueDepartment="reception"
      tabs={[
        { id: 'checkin', label: 'Check-in/out', icon: KeyRound, render: () => <CheckInOutDashboard profile={profile} /> },
        { id: 'occupancy', label: 'Ocupação', icon: Activity, render: () => <OccupancyChart /> },
        { id: 'housekeeping', label: 'Governanca e UHs', icon: BedDouble, render: () => <HousekeepingDashboard profile={profile} /> },
        { id: 'shift', label: 'Turno e ocorrencias', icon: ClipboardList, render: () => <OperationsDashboard profile={profile} /> },
      ]}
    />
  );
}

export function MaintenanceModuleDashboard({ profile, canManage }: { profile: UserProfile; canManage: boolean }) {
  return (
    <ModuleShell
      eyebrow="Modulo Manutencao"
      title="Chamados, UHs interditadas e preventiva"
      description="Fila de chamados, tratamento, justificativa, notificacao, acesso as UHs e plano preventivo para manutencao."
      profile={profile}
      queueDepartment="maintenance"
      hideTopQueue
      tabs={[
        { id: 'tickets', label: 'Chamados internos', icon: Wrench, render: () => <OperationalWorkQueue profile={profile} department="maintenance" /> },
        { id: 'qr-tickets', label: 'Chamados QR / Telegram', icon: QrCode, render: () => <MaintenanceTicketsTab profile={profile} /> },
        { id: 'performance', label: 'Desempenho', icon: BarChart3, render: () => <MaintenancePerformanceTab /> },
        { id: 'rooms', label: 'UHs e bloqueios', icon: BedDouble, render: () => <HousekeepingDashboard profile={profile} /> },
        {
          id: 'preventive',
          label: 'Preventiva',
          icon: ClipboardList,
          render: () => <ScopedEnterprise profile={profile} canManage={canManage} initialTab="preventive" allowedTabs={['preventive', 'room-map']} />,
        },
      ]}
    />
  );
}

type MaintTicket = {
  id: string;
  room_number: string | null;
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'resolved' | 'cancelled';
  status_reason: string | null;
  resolution_notes: string | null;
  created_at: string;
  started_at: string | null;
  resolved_at: string | null;
  rating: number | null;
  inspection_status: 'pending' | 'approved' | 'rejected' | null;
  inspector_id: string | null;
  inspection_notes: string | null;
  inspected_at: string | null;
};

const PRIORITY_BADGE: Record<MaintTicket['priority'], string> = {
  urgent: 'bg-red-100 text-red-700 border border-red-200',
  high:   'bg-orange-100 text-orange-700 border border-orange-200',
  medium: 'bg-amber-100 text-amber-700 border border-amber-200',
  low:    'bg-neutral-100 text-neutral-600 border border-neutral-200',
};
const PRIORITY_LABEL: Record<MaintTicket['priority'], string> = { urgent: 'URGENTE', high: 'ALTA', medium: 'MEDIA', low: 'BAIXA' };
const SLA_MIN: Record<MaintTicket['priority'], number> = { urgent: 15, high: 60, medium: 240, low: 1440 };

function elapsed(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h${m % 60 > 0 ? ` ${m % 60}min` : ''}` : `${Math.floor(h / 24)}d`;
}

function fmtMins(m: number): string {
  if (m < 1) return 'menos de 1min';
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}min` : `${h}h`;
}

function resolutionMins(t: { created_at: string; resolved_at: string | null }): number | null {
  if (!t.resolved_at) return null;
  return Math.round((new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime()) / 60_000);
}

type Collaborator = { id: string; name: string; role: string };

function MaintenanceTicketsTab({ profile }: { profile: UserProfile }) {
  const [tickets, setTickets] = useState<MaintTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [directingId, setDirectingId] = useState<string | null>(null);
  const [directTarget, setDirectTarget] = useState<string>('');
  const [inspectingId, setInspectingId] = useState<string | null>(null);
  const [inspectorTarget, setInspectorTarget] = useState<string>('');
  const [, setTick] = useState(0);

  const canDirect = profile.role === 'admin' || profile.role === 'manager';

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetchTickets();
    if (canDirect) loadCollaborators();
    const ch = supabase
      .channel('maint-tickets-module')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'maintenance_tickets' }, fetchTickets)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadCollaborators() {
    const { data } = await supabase
      .from('profiles')
      .select('id, name, role')
      .in('role', ['maintenance', 'manager', 'admin'])
      .order('name', { ascending: true });
    setCollaborators((data ?? []) as Collaborator[]);
  }

  async function fetchTickets() {
    const { data, error } = await supabase
      .from('maintenance_tickets')
      .select('id,room_number,title,description,priority,status,status_reason,resolution_notes,created_at,started_at,resolved_at,rating,inspection_status,inspector_id,inspection_notes,inspected_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) { toast.error('Erro ao carregar chamados: ' + error.message); setLoading(false); return; }
    setTickets((data ?? []) as MaintTicket[]);
    setLoading(false);
  }

  async function assume(ticket: MaintTicket) {
    const { error } = await supabase.from('maintenance_tickets').update({
      status: 'in_progress',
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status_reason: profile.name,
    }).eq('id', ticket.id);
    if (error) toast.error('Erro: ' + error.message);
    else { toast.success('Chamado assumido.'); fetchTickets(); }
  }

  async function resolve(ticket: MaintTicket) {
    const note = prompt('Nota de resolucao (opcional):') ?? '';
    const { error } = await supabase.from('maintenance_tickets').update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...(note ? { resolution_notes: note } : {}),
    }).eq('id', ticket.id);
    if (error) toast.error('Erro: ' + error.message);
    else { toast.success('Chamado resolvido.'); fetchTickets(); }
  }

  async function direct(ticket: MaintTicket) {
    const target = collaborators.find(c => c.id === directTarget);
    if (!target) { toast.error('Escolha um colaborador.'); return; }
    const { error } = await supabase.from('maintenance_tickets').update({
      status: 'in_progress',
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      assigned_to: target.id,
      status_reason: target.name,
    }).eq('id', ticket.id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success(`Direcionado para ${target.name}.`);
    setDirectingId(null);
    setDirectTarget('');
    fetchTickets();
  }

  async function cancel(ticket: MaintTicket) {
    const reason = prompt('Justificativa para cancelar este chamado (obrigatoria):')?.trim();
    if (reason === undefined) return;
    if (!reason) { toast.error('Justificativa obrigatoria para cancelar.'); return; }
    const { error } = await supabase.from('maintenance_tickets').update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
      resolution_notes: `Cancelado: ${reason} (${profile.name})`,
      status_reason: profile.name,
    }).eq('id', ticket.id);
    if (error) toast.error('Erro: ' + error.message);
    else { toast.success('Chamado cancelado. SLA nao sera afetado.'); fetchTickets(); }
  }

  async function reopen(ticket: MaintTicket) {
    const reason = prompt('Motivo da reabertura (obrigatorio):')?.trim();
    if (reason === undefined) return;
    if (!reason) { toast.error('Motivo obrigatorio para reabrir.'); return; }
    const { error } = await supabase.from('maintenance_tickets').update({
      status: 'open',
      assigned_to: null,
      status_reason: null,
      started_at: null,
      resolved_at: null,
      rating: null,
      inspection_status: null,
      inspector_id: null,
      inspection_notes: null,
      inspected_at: null,
      resolution_notes: `Reaberto: ${reason} (${profile.name})`,
      updated_at: new Date().toISOString(),
    }).eq('id', ticket.id);
    if (error) toast.error('Erro: ' + error.message);
    else { toast.success('Chamado reaberto.'); fetchTickets(); }
  }

  async function requestInspection(ticket: MaintTicket, inspectorId: string) {
    const inspector = collaborators.find(c => c.id === inspectorId);
    if (!inspector) return;
    const { error } = await supabase.from('maintenance_tickets').update({
      inspection_status: 'pending',
      inspector_id: inspectorId,
      updated_at: new Date().toISOString(),
    }).eq('id', ticket.id);
    if (error) toast.error('Erro: ' + error.message);
    else { toast.success(`Vistoria solicitada para ${inspector.name}.`); fetchTickets(); }
  }

  async function approveInspection(ticket: MaintTicket) {
    const note = prompt('Observacoes da vistoria (opcional):') ?? '';
    const { error } = await supabase.from('maintenance_tickets').update({
      inspection_status: 'approved',
      inspection_notes: note || null,
      inspected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', ticket.id);
    if (error) toast.error('Erro: ' + error.message);
    else { toast.success('Vistoria aprovada.'); fetchTickets(); }
  }

  async function rejectInspection(ticket: MaintTicket) {
    const note = prompt('Descreva o problema encontrado na vistoria (obrigatorio):')?.trim();
    if (note === undefined) return;
    if (!note) { toast.error('Descricao obrigatoria para reprovar.'); return; }
    const { error } = await supabase.from('maintenance_tickets').update({
      status: 'in_progress',
      inspection_status: 'rejected',
      inspection_notes: note,
      inspected_at: new Date().toISOString(),
      resolved_at: null,
      updated_at: new Date().toISOString(),
    }).eq('id', ticket.id);
    if (error) toast.error('Erro: ' + error.message);
    else { toast.success('Chamado reprovado na vistoria — voltou para em andamento.'); fetchTickets(); }
  }

  const open = useMemo(() => tickets.filter(t => t.status === 'open').sort((a, b) => {
    const pp = ['urgent','high','medium','low'];
    const pd = pp.indexOf(a.priority) - pp.indexOf(b.priority);
    return pd !== 0 ? pd : a.created_at.localeCompare(b.created_at);
  }), [tickets]);
  const inProgress = useMemo(() => tickets.filter(t => t.status === 'in_progress'), [tickets]);
  const pendingInspection = useMemo(() =>
    tickets.filter(t => t.status === 'resolved' && t.inspection_status === 'pending'),
  [tickets]);
  const closed = useMemo(() =>
    tickets
      .filter(t => (t.status === 'resolved' && t.inspection_status !== 'pending') || t.status === 'cancelled')
      .slice(0, 15),
  [tickets]);

  const canInspect = (t: MaintTicket) =>
    t.inspector_id === profile.id || profile.role === 'admin' || profile.role === 'manager';

  if (loading) return <div className="rounded-3xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-400">Carregando chamados...</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Abertos</p>
          <p className="mt-1 text-3xl font-black text-amber-800">{open.length}</p>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Em andamento</p>
          <p className="mt-1 text-3xl font-black text-blue-800">{inProgress.length}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 col-span-2 sm:col-span-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">SLA estourado</p>
          <p className="mt-1 text-3xl font-black text-neutral-800">
            {open.filter(t => (Date.now() - new Date(t.created_at).getTime()) / 60_000 > SLA_MIN[t.priority]).length}
          </p>
        </div>
      </div>

      {open.length > 0 && (
        <section>
          <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-amber-600">Aguardando atendimento</h3>
          <div className="space-y-3">
            {open.map(ticket => {
              const breached = (Date.now() - new Date(ticket.created_at).getTime()) / 60_000 > SLA_MIN[ticket.priority];
              return (
                <div key={ticket.id} className={`rounded-2xl border p-4 ${ticket.priority === 'urgent' ? 'border-red-200 bg-red-50' : breached ? 'border-orange-200 bg-orange-50' : 'border-neutral-200 bg-white'}`}>
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${PRIORITY_BADGE[ticket.priority]}`}>{PRIORITY_LABEL[ticket.priority]}</span>
                        {ticket.room_number && <span className="rounded bg-neutral-900 text-white px-2 py-0.5 text-xs font-black">UH {ticket.room_number}</span>}
                        {breached && <span className="flex items-center gap-1 text-[10px] font-bold text-orange-600"><AlertCircle className="w-3 h-3" />SLA</span>}
                      </div>
                      <p className="mt-2 font-black text-neutral-950">{ticket.title}</p>
                      {ticket.description && <p className="mt-1 text-xs text-neutral-500 line-clamp-2">{ticket.description}</p>}
                      <p className="mt-1.5 text-[11px] text-neutral-400">aberto ha {elapsed(ticket.created_at)}</p>
                    </div>
                    <div className="shrink-0 flex flex-row sm:flex-col gap-2 sm:min-w-[140px]">
                      <button onClick={() => assume(ticket)} className="flex-1 rounded-xl bg-neutral-950 px-4 py-2 text-xs font-black text-white hover:bg-amber-700 transition">
                        Assumir
                      </button>
                      {canDirect && (
                        <button
                          onClick={() => { setDirectingId(directingId === ticket.id ? null : ticket.id); setDirectTarget(''); }}
                          className="flex-1 rounded-xl bg-amber-700 px-4 py-2 text-xs font-black text-white hover:bg-amber-600 transition"
                        >
                          Direcionar
                        </button>
                      )}
                      <button onClick={() => cancel(ticket)} className="flex-1 rounded-xl bg-neutral-200 px-4 py-2 text-xs font-black text-neutral-700 hover:bg-neutral-300 transition">
                        Cancelar
                      </button>
                    </div>
                  </div>

                  {directingId === ticket.id && canDirect && (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-amber-800">Direcionar para colaborador</p>
                      <select
                        value={directTarget}
                        onChange={(e) => setDirectTarget(e.target.value)}
                        className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm"
                      >
                        <option value="">Escolher colaborador...</option>
                        {collaborators
                          .filter(c => c.id !== profile.id)
                          .map(c => (
                            <option key={c.id} value={c.id}>{c.name} ({c.role})</option>
                          ))}
                      </select>
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => direct(ticket)} className="rounded-xl bg-amber-700 px-3 py-2 text-xs font-black text-white">Confirmar</button>
                        <button onClick={() => { setDirectingId(null); setDirectTarget(''); }} className="rounded-xl bg-neutral-300 px-3 py-2 text-xs font-black text-neutral-700">Fechar</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {inProgress.length > 0 && (
        <section>
          <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-blue-600">Em andamento</h3>
          <div className="space-y-3">
            {inProgress.map(ticket => (
              <div key={ticket.id} className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${PRIORITY_BADGE[ticket.priority]}`}>{PRIORITY_LABEL[ticket.priority]}</span>
                      {ticket.room_number && <span className="rounded bg-neutral-900 text-white px-2 py-0.5 text-xs font-black">UH {ticket.room_number}</span>}
                    </div>
                    <p className="mt-2 font-black text-neutral-950">{ticket.title}</p>
                    {ticket.status_reason && <p className="mt-1 text-xs font-bold text-blue-700">👷 {ticket.status_reason}</p>}
                    <p className="mt-1 text-[11px] text-blue-500">em andamento ha {elapsed(ticket.started_at ?? ticket.created_at)}</p>
                  </div>
                  <div className="shrink-0 flex flex-row sm:flex-col gap-2 sm:min-w-[140px]">
                    <button onClick={() => resolve(ticket)} className="flex-1 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-500 transition">
                      Resolver
                    </button>
                    <button onClick={() => cancel(ticket)} className="flex-1 rounded-xl bg-neutral-200 px-4 py-2 text-xs font-black text-neutral-700 hover:bg-neutral-300 transition">
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Vistoria picker for resolved tickets without inspection */}
      {tickets.filter(t => t.status === 'resolved' && !t.inspection_status).length > 0 && canDirect && (
        <section>
          <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-emerald-600">Resolvidos — solicitar vistoria</h3>
          <div className="space-y-2">
            {tickets.filter(t => t.status === 'resolved' && !t.inspection_status).map(ticket => (
              <div key={ticket.id} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-neutral-900">{ticket.title}</p>
                    {ticket.room_number && <span className="text-xs text-neutral-500">UH {ticket.room_number} · </span>}
                    {ticket.status_reason && <span className="text-xs text-neutral-500">Resolvido por {ticket.status_reason}</span>}
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {inspectingId === ticket.id ? (
                      <>
                        <select
                          value={inspectorTarget}
                          onChange={e => setInspectorTarget(e.target.value)}
                          className="rounded-xl border border-emerald-300 bg-white px-3 py-2 text-sm"
                        >
                          <option value="">Escolher vistoriador...</option>
                          {collaborators.filter(c => c.id !== profile.id).map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => { if (inspectorTarget) { requestInspection(ticket, inspectorTarget); setInspectingId(null); setInspectorTarget(''); } else toast.error('Escolha um vistoriador.'); }}
                          className="rounded-xl bg-purple-600 px-3 py-2 text-xs font-black text-white hover:bg-purple-500 transition"
                        >
                          Solicitar
                        </button>
                        <button onClick={() => { setInspectingId(null); setInspectorTarget(''); }} className="rounded-xl bg-neutral-200 px-3 py-2 text-xs font-black text-neutral-700 transition">
                          ✕
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => { setInspectingId(ticket.id); setInspectorTarget(''); }}
                        className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-black text-white hover:bg-purple-500 transition"
                      >
                        🔍 Solicitar Vistoria
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {pendingInspection.length > 0 && (
        <section>
          <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-purple-600">Aguardando vistoria</h3>
          <div className="space-y-3">
            {pendingInspection.map(ticket => {
              const inspector = collaborators.find(c => c.id === ticket.inspector_id);
              const canAct = canInspect(ticket);
              return (
                <div key={ticket.id} className="rounded-2xl border border-purple-200 bg-purple-50 p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-purple-100 text-purple-700 border border-purple-200 px-2 py-0.5 text-[10px] font-black uppercase">VISTORIA</span>
                        {ticket.room_number && <span className="rounded bg-neutral-900 text-white px-2 py-0.5 text-xs font-black">UH {ticket.room_number}</span>}
                      </div>
                      <p className="mt-2 font-black text-neutral-950">{ticket.title}</p>
                      {ticket.status_reason && <p className="mt-1 text-xs text-neutral-500">👷 Resolvido por: {ticket.status_reason}</p>}
                      {inspector && <p className="mt-0.5 text-xs font-bold text-purple-700">🔍 Vistoriador: {inspector.name}</p>}
                    </div>
                    {canAct && (
                      <div className="shrink-0 flex flex-row sm:flex-col gap-2 sm:min-w-[130px]">
                        <button onClick={() => approveInspection(ticket)} className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-500 transition">
                          ✅ Aprovar
                        </button>
                        <button onClick={() => rejectInspection(ticket)} className="flex-1 rounded-xl bg-red-500 px-3 py-2 text-xs font-black text-white hover:bg-red-400 transition">
                          ❌ Reprovar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {closed.length > 0 && (
        <section>
          <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-neutral-400">Encerrados recentes</h3>
          <div className="space-y-2">
            {closed.map(ticket => {
              const isCancelled = ticket.status === 'cancelled';
              const mins = !isCancelled ? resolutionMins(ticket) : null;
              return (
                <div key={ticket.id} className={`rounded-2xl border px-4 py-3 ${isCancelled ? 'border-neutral-300 bg-neutral-100' : 'border-neutral-200 bg-neutral-50'}`}>
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${isCancelled ? 'bg-neutral-200 text-neutral-700 border-neutral-300' : 'bg-emerald-100 text-emerald-700 border-emerald-200'}`}>
                          {isCancelled ? 'CANCELADO' : 'RESOLVIDO'}
                        </span>
                        {ticket.room_number && <span className="rounded bg-neutral-900 text-white px-2 py-0.5 text-xs font-black">UH {ticket.room_number}</span>}
                        {mins !== null && (
                          <span className="rounded-full bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 text-[10px] font-black">⏱ {fmtMins(mins)}</span>
                        )}
                        {ticket.rating !== null && ticket.rating !== undefined && (
                          <span className="rounded-full bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 text-[10px] font-black">⭐ {ticket.rating}/5</span>
                        )}
                      </div>
                      <p className="mt-1.5 text-sm font-bold text-neutral-700">{ticket.title}</p>
                      {ticket.status_reason && <p className="text-[11px] text-neutral-500">👷 {ticket.status_reason}</p>}
                      {ticket.resolution_notes && <p className="text-[11px] text-neutral-500">{isCancelled ? '🚫' : '📝'} {ticket.resolution_notes}</p>}
                    </div>
                    <button
                      onClick={() => reopen(ticket)}
                      className="shrink-0 rounded-xl bg-neutral-200 px-3 py-1.5 text-[11px] font-black text-neutral-700 hover:bg-amber-200 hover:text-amber-800 transition"
                    >
                      🔄 Reabrir
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {open.length === 0 && inProgress.length === 0 && (
        <div className="rounded-3xl border border-dashed border-neutral-200 bg-neutral-50 py-16 text-center text-sm font-bold text-neutral-400">
          Nenhum chamado ativo via QR ou Telegram.
        </div>
      )}
    </div>
  );
}

type BonusTicket = {
  id: string;
  status: string;
  status_reason: string | null;
  created_at: string;
  resolved_at: string | null;
  rating: number | null;
  inspection_status: string | null;
};

type BonusView = 'monthly' | 'weekly';

function MaintenancePerformanceTab() {
  const [tickets, setTickets] = useState<BonusTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<BonusView>('monthly');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
    const { data, error } = await supabase
      .from('maintenance_tickets')
      .select('id,status,status_reason,created_at,resolved_at,rating,inspection_status')
      .eq('status', 'resolved')
      .gte('resolved_at', yearStart)
      .order('resolved_at', { ascending: false })
      .limit(2000);
    if (error) { toast.error('Erro: ' + error.message); setLoading(false); return; }
    setTickets((data ?? []) as BonusTicket[]);
    setLoading(false);
  }

  // ── Monthly bonus matrix ──────────────────────────────────────────────────
  const monthlyData = useMemo(() => {
    const monthSet = new Set<string>();
    const byPerson: Record<string, Record<string, number>> = {};
    const ratingsByPerson: Record<string, number[]> = {};

    for (const t of tickets) {
      const date = new Date(t.resolved_at ?? t.created_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthSet.add(key);
      const name = t.status_reason ?? 'Sem registro';
      if (!byPerson[name]) byPerson[name] = {};
      byPerson[name][key] = (byPerson[name][key] ?? 0) + 1;
      if (t.rating) {
        if (!ratingsByPerson[name]) ratingsByPerson[name] = [];
        ratingsByPerson[name].push(t.rating);
      }
    }

    const months = Array.from(monthSet).sort();
    const PT_MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const monthLabels = months.map(m => {
      const [y, mo] = m.split('-');
      return `${PT_MONTHS[Number(mo) - 1]}/${y.slice(2)}`;
    });

    const people = Object.keys(byPerson).sort((a, b) => {
      const ta = Object.values(byPerson[a]).reduce((s, v) => s + v, 0);
      const tb = Object.values(byPerson[b]).reduce((s, v) => s + v, 0);
      return tb - ta;
    });

    return { months, monthLabels, byPerson, people, ratingsByPerson };
  }, [tickets]);

  // ── Weekly breakdown (current year by ISO week) ────────────────────────
  const weeklyData = useMemo(() => {
    function isoWeek(date: Date): string {
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
      return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
    }

    const weekSet = new Set<string>();
    const byPerson: Record<string, Record<string, number>> = {};

    for (const t of tickets) {
      const date = new Date(t.resolved_at ?? t.created_at);
      const wk = isoWeek(date);
      weekSet.add(wk);
      const name = t.status_reason ?? 'Sem registro';
      if (!byPerson[name]) byPerson[name] = {};
      byPerson[name][wk] = (byPerson[name][wk] ?? 0) + 1;
    }

    const weeks = Array.from(weekSet).sort().slice(-12); // last 12 weeks
    const people = Object.keys(byPerson).sort((a, b) => {
      const ta = Object.values(byPerson[a]).reduce((s, v) => s + v, 0);
      const tb = Object.values(byPerson[b]).reduce((s, v) => s + v, 0);
      return tb - ta;
    });

    return { weeks, byPerson, people };
  }, [tickets]);

  const grandTotal = tickets.length;

  if (loading) return <div className="rounded-3xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-400">Carregando relatorio...</div>;

  return (
    <div className="space-y-6">
      {/* Header + controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Relatorio de bonificacao</p>
          <p className="text-lg font-black text-neutral-900">{grandTotal} resolucoes em {new Date().getFullYear()}</p>
        </div>
        <div className="flex gap-2">
          <div className="flex max-w-full overflow-x-auto gap-2">
            {(['monthly', 'weekly'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`shrink-0 rounded-xl px-4 py-2 text-xs font-black transition ${view === v ? 'bg-neutral-950 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}
              >
                {v === 'monthly' ? 'Mensal' : 'Semanal'}
              </button>
            ))}
          </div>
          <button
            onClick={() => window.print()}
            className="shrink-0 rounded-xl bg-amber-600 px-4 py-2 text-xs font-black text-white hover:bg-amber-500 transition"
          >
            🖨 Imprimir
          </button>
        </div>
      </div>

      {/* Monthly matrix */}
      {view === 'monthly' && (
        monthlyData.people.length > 0 ? (
          <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
            <table className="min-w-[500px] w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50">
                  <th className="sticky left-0 bg-neutral-50 px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-neutral-400 min-w-[140px]">Tecnico</th>
                  {monthlyData.monthLabels.map(m => (
                    <th key={m} className="px-3 py-3 text-center text-[10px] font-black uppercase tracking-widest text-neutral-400 min-w-[60px]">{m}</th>
                  ))}
                  <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-emerald-600 min-w-[60px]">TOTAL</th>
                  <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-amber-600 min-w-[70px]">Avaliacao</th>
                </tr>
              </thead>
              <tbody>
                {monthlyData.people.map((name, i) => {
                  const total = Object.values(monthlyData.byPerson[name]).reduce((s: number, v: number) => s + v, 0);
                  const ratings = monthlyData.ratingsByPerson[name] ?? [];
                  const avgRating = ratings.length > 0 ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : null;
                  return (
                    <tr key={name} className={i % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}>
                      <td className="sticky left-0 bg-inherit px-4 py-3 font-bold text-neutral-900 text-sm">{name}</td>
                      {monthlyData.months.map(m => {
                        const count = monthlyData.byPerson[name][m] ?? 0;
                        return (
                          <td key={m} className="px-3 py-3 text-center">
                            {count > 0 ? (
                              <span className="inline-block min-w-[28px] rounded-lg bg-emerald-100 text-emerald-800 font-black text-xs px-2 py-0.5">{count}</span>
                            ) : (
                              <span className="text-neutral-300 text-xs">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-center font-black text-emerald-700 text-base">{total}</td>
                      <td className="px-4 py-3 text-center font-bold text-amber-600">{avgRating ? `⭐ ${avgRating}` : '—'}</td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-neutral-200 bg-neutral-100 font-black">
                  <td className="sticky left-0 bg-neutral-100 px-4 py-3 text-xs uppercase tracking-widest text-neutral-500">TOTAL</td>
                  {monthlyData.months.map(m => {
                    const total = monthlyData.people.reduce((s, name) => s + (monthlyData.byPerson[name][m] ?? 0), 0);
                    return <td key={m} className="px-3 py-3 text-center font-black text-neutral-700">{total || '—'}</td>;
                  })}
                  <td className="px-4 py-3 text-center font-black text-emerald-700 text-base">{grandTotal}</td>
                  <td className="px-4 py-3" />
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-neutral-200 bg-neutral-50 py-16 text-center text-sm font-bold text-neutral-400">
            Nenhuma resolucao registrada neste ano.
          </div>
        )
      )}

      {/* Weekly matrix */}
      {view === 'weekly' && (
        weeklyData.people.length > 0 ? (
          <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
            <table className="min-w-[500px] w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50">
                  <th className="sticky left-0 bg-neutral-50 px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-neutral-400 min-w-[140px]">Tecnico</th>
                  {weeklyData.weeks.map(w => (
                    <th key={w} className="px-2 py-3 text-center text-[10px] font-black uppercase tracking-widest text-neutral-400 min-w-[52px]">{w.replace(/\d{4}-/, '')}</th>
                  ))}
                  <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-emerald-600 min-w-[60px]">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {weeklyData.people.map((name, i) => {
                  const total = weeklyData.weeks.reduce((s, w) => s + (weeklyData.byPerson[name]?.[w] ?? 0), 0);
                  return (
                    <tr key={name} className={i % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}>
                      <td className="sticky left-0 bg-inherit px-4 py-3 font-bold text-neutral-900 text-sm">{name}</td>
                      {weeklyData.weeks.map(w => {
                        const count = weeklyData.byPerson[name]?.[w] ?? 0;
                        return (
                          <td key={w} className="px-2 py-3 text-center">
                            {count > 0 ? (
                              <span className="inline-block min-w-[24px] rounded-lg bg-emerald-100 text-emerald-800 font-black text-xs px-1.5 py-0.5">{count}</span>
                            ) : (
                              <span className="text-neutral-300 text-xs">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-center font-black text-emerald-700 text-base">{total}</td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-neutral-200 bg-neutral-100 font-black">
                  <td className="sticky left-0 bg-neutral-100 px-4 py-3 text-xs uppercase tracking-widest text-neutral-500">TOTAL</td>
                  {weeklyData.weeks.map(w => {
                    const total = weeklyData.people.reduce((s, name) => s + (weeklyData.byPerson[name]?.[w] ?? 0), 0);
                    return <td key={w} className="px-2 py-3 text-center font-black text-neutral-700">{total || '—'}</td>;
                  })}
                  <td className="px-4 py-3 text-center font-black text-emerald-700 text-base">{weeklyData.people.reduce((s, name) => s + weeklyData.weeks.reduce((ws, w) => ws + (weeklyData.byPerson[name]?.[w] ?? 0), 0), 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-neutral-200 bg-neutral-50 py-16 text-center text-sm font-bold text-neutral-400">
            Nenhuma resolucao nas ultimas 12 semanas.
          </div>
        )
      )}

      <p className="text-center text-[10px] text-neutral-400 uppercase tracking-widest">
        Base: chamados resolvidos e aprovados na vistoria · {new Date().getFullYear()}
      </p>
    </div>
  );
}

export function FinanceBillingModuleDashboard({ profile, canManage }: { profile: UserProfile; canManage: boolean }) {
  return (
    <ModuleShell
      eyebrow="Modulo Financeiro/Faturamento"
      title="Faturamento, financeiro, fiscal e conciliacao"
      description="Um unico modo para faturas, documentos, baixa, extratos, rastreio financeiro, fiscal, AR e controles de pagamento."
      profile={profile}
      queueDepartment="finance"
      tabs={[
        { id: 'finance', label: 'Financeiro', icon: CreditCard, render: () => <AdminDashboard profile={profile} initialTab="finance" /> },
        { id: 'documents', label: 'Faturas e documentos', icon: FileText, render: () => <AdminDashboard profile={profile} initialTab="documents" /> },
        { id: 'tracking', label: 'Rastreio e cobranca', icon: ClipboardList, render: () => <AdminDashboard profile={profile} initialTab="tracking" /> },
        {
          id: 'receivables',
          label: 'AR e pagamentos',
          icon: BarChart3,
          render: () => <ScopedEnterprise profile={profile} canManage={canManage} initialTab="receivables" allowedTabs={['receivables', 'forecast']} />,
        },
        { id: 'fiscal', label: 'Fiscal/NFS-e', icon: ShieldCheck, render: () => <ProfessionalPMSDashboard profile={profile} allowedTabs={['fiscal']} /> },
      ]}
    />
  );
}

export function RestaurantModuleDashboard({ profile }: { profile: UserProfile }) {
  return (
    <ModuleShell
      eyebrow="Modulo Restaurante"
      title="POS, folio e lancamentos"
      description="Operacao do restaurante, consumo em quarto, venda direta, consulta/transferencia de folio e visao do calendario."
      profile={profile}
      queueDepartment="restaurant"
      tabs={[
        { id: 'pos', label: 'POS Restaurante', icon: Utensils, render: () => <POSDashboard profile={profile} /> },
      ]}
    />
  );
}

export function EventsModuleDashboard({ profile }: { profile: UserProfile }) {
  return (
    <ModuleShell
      eyebrow="Modulo Eventos"
      title="Eventos, O.S. e agenda"
      description="Eventos continuam em modulo proprio, mas o calendario e espelhado para todos os demais setores."
      profile={profile}
      queueDepartment="events"
      tabs={[
        { id: 'events', label: 'Eventos', icon: Hotel, render: () => <EventsDashboard profile={profile} /> },
      ]}
    />
  );
}

export function AdminControlModuleDashboard({ profile, canManage }: { profile: UserProfile; canManage: boolean }) {
  return (
    <ModuleShell
      eyebrow="Modulo Admin"
      title="Controle geral do PMS"
      description="Admin controla tudo: usuarios, permissoes, empresas, auditoria, Gestao Pro e operacao enterprise."
      profile={profile}
      queueDepartment="admin"
      adminQueue
      tabs={[
        { id: 'overview', label: 'Gestao Pro', icon: BarChart3, render: () => <ProfessionalPMSDashboard profile={profile} /> },
        { id: 'occupancy', label: 'Ocupação', icon: Activity, render: () => <OccupancyChart /> },
        { id: 'companies', label: 'Empresas', icon: Building2, render: () => <AdminDashboard profile={profile} initialTab="companies" /> },
        { id: 'staff', label: 'Equipe e acesso', icon: Settings, render: () => <AdminDashboard profile={profile} initialTab="registration" /> },
        { id: 'enterprise', label: 'Enterprise', icon: Building2, render: () => <EnterpriseExtensionsDashboard profile={profile} canManage={canManage} /> },
        { id: 'audit', label: 'Auditoria', icon: ShieldCheck, render: () => <AuditDashboard profile={profile} /> },
      ]}
    />
  );
}

function ScopedEnterprise({
  profile,
  canManage,
  initialTab,
  allowedTabs,
}: {
  profile: UserProfile;
  canManage: boolean;
  initialTab: EnterpriseTab;
  allowedTabs: EnterpriseTab[];
}) {
  return <EnterpriseExtensionsDashboard profile={profile} canManage={canManage} initialTab={initialTab} allowedTabs={allowedTabs} />;
}

function ModuleShell<T extends string>({
  eyebrow,
  title,
  description,
  tabs,
  profile,
  queueDepartment,
  adminQueue = false,
  hideTopQueue = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  tabs: Array<ModuleTab<T>>;
  profile: UserProfile;
  queueDepartment: OperationalDepartment;
  adminQueue?: boolean;
  hideTopQueue?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<T>(tabs[0].id);
  const active = tabs.find((tab) => tab.id === activeTab) || tabs[0];

  return (
    <div className={moduleShellClass}>
      <div className="rounded-[2rem] border border-neutral-200 bg-white p-4 sm:p-6 shadow-sm">
        <p className="text-[10px] sm:text-xs font-black uppercase tracking-[0.28em] text-amber-600">{eyebrow}</p>
        <h1 className="mt-2 text-2xl sm:text-3xl font-black tracking-tight text-neutral-950">{title}</h1>
        <p className="mt-2 max-w-4xl text-xs sm:text-sm leading-6 sm:leading-7 text-neutral-500">{description}</p>
      </div>

      <SharedHotelCalendar compact />
      {!hideTopQueue && <OperationalWorkQueue profile={profile} department={queueDepartment} adminView={adminQueue} />}

      <div className="flex gap-2 overflow-x-auto rounded-3xl border border-neutral-200 bg-white p-2 shadow-sm">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const selected = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-2xl px-3 py-2 md:px-4 md:py-3 text-xs font-black transition ${
                selected ? 'bg-neutral-950 text-white' : 'bg-neutral-50 text-neutral-500 hover:bg-neutral-100'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {active.render()}
    </div>
  );
}
