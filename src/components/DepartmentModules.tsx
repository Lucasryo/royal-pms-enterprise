import { ComponentType, ReactNode, useState } from 'react';
import { Activity, BarChart3, BedDouble, Building2, CalendarDays, ClipboardList, CreditCard, FileText, Globe, Hotel, KeyRound, Settings, ShieldCheck, Utensils, Wrench } from 'lucide-react';
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
        { id: 'tariffs', label: 'Tarifas corporativas', icon: CreditCard, render: () => <AdminDashboard profile={profile} initialTab="tariffs" /> },
        { id: 'revenue', label: 'Revenue e rate shopper', icon: BarChart3, render: () => <ProfessionalPMSDashboard profile={profile} /> },
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
        { id: 'tickets', label: 'Chamados', icon: Wrench, render: () => <OperationalWorkQueue profile={profile} department="maintenance" /> },
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
        { id: 'fiscal', label: 'Fiscal/BI Pro', icon: ShieldCheck, render: () => <ProfessionalPMSDashboard profile={profile} /> },
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
      description="Admin controla tudo: usuarios, permissoes, empresas, tarifas, auditoria, configuracoes, Gestao Pro e operacao enterprise."
      profile={profile}
      queueDepartment="admin"
      adminQueue
      tabs={[
        { id: 'overview', label: 'Gestao Pro', icon: BarChart3, render: () => <ProfessionalPMSDashboard profile={profile} /> },
        { id: 'occupancy', label: 'Ocupação', icon: Activity, render: () => <OccupancyChart /> },
        { id: 'enterprise', label: 'Enterprise', icon: Building2, render: () => <EnterpriseExtensionsDashboard profile={profile} canManage={canManage} /> },
        { id: 'companies', label: 'Empresas', icon: Building2, render: () => <AdminDashboard profile={profile} initialTab="companies" /> },
        { id: 'staff', label: 'Equipe e acesso', icon: Settings, render: () => <AdminDashboard profile={profile} initialTab="registration" /> },
        { id: 'public-rates', label: 'Tarifas publicas', icon: Globe, render: () => <PublicRatesManager profile={profile} /> },
        { id: 'finance', label: 'Financeiro', icon: CreditCard, render: () => <AdminDashboard profile={profile} initialTab="finance" /> },
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
      <div className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-amber-600">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-neutral-950">{title}</h1>
        <p className="mt-2 max-w-4xl text-sm leading-7 text-neutral-500">{description}</p>
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
              className={`flex shrink-0 items-center gap-2 rounded-2xl px-4 py-3 text-xs font-black transition ${
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
