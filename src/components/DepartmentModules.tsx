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

function MaintenanceTicketsTab({ profile }: { profile: UserProfile }) {
  const [tickets, setTickets] = useState<MaintTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetchTickets();
    const ch = supabase
      .channel('maint-tickets-module')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'maintenance_tickets' }, fetchTickets)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function fetchTickets() {
    const { data, error } = await supabase
      .from('maintenance_tickets')
      .select('id,room_number,title,description,priority,status,status_reason,resolution_notes,created_at,started_at')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false });
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

  const open       = useMemo(() => tickets.filter(t => t.status === 'open').sort((a, b) => {
    const pp = ['urgent','high','medium','low'];
    const pd = pp.indexOf(a.priority) - pp.indexOf(b.priority);
    return pd !== 0 ? pd : a.created_at.localeCompare(b.created_at);
  }), [tickets]);
  const inProgress = useMemo(() => tickets.filter(t => t.status === 'in_progress'), [tickets]);
  const resolved   = useMemo(() => tickets.filter(t => t.status === 'resolved').slice(0, 10), [tickets]);

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
                    <button onClick={() => assume(ticket)} className="shrink-0 rounded-xl bg-neutral-950 px-4 py-2 text-xs font-black text-white hover:bg-amber-700 transition">
                      Assumir
                    </button>
                  </div>
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
                  <button onClick={() => resolve(ticket)} className="shrink-0 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-500 transition">
                    Resolver
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {resolved.length > 0 && (
        <section>
          <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-neutral-400">Resolvidos recentes</h3>
          <div className="space-y-2">
            {resolved.map(ticket => (
              <div key={ticket.id} className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 opacity-70">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[10px] font-black">RESOLVIDO</span>
                  {ticket.room_number && <span className="rounded bg-neutral-900 text-white px-2 py-0.5 text-xs font-black">UH {ticket.room_number}</span>}
                </div>
                <p className="mt-1.5 text-sm font-bold text-neutral-700">{ticket.title}</p>
                {ticket.status_reason && <p className="text-[11px] text-neutral-500">👷 {ticket.status_reason}</p>}
                {ticket.resolution_notes && <p className="text-[11px] text-neutral-500">📝 {ticket.resolution_notes}</p>}
              </div>
            ))}
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
