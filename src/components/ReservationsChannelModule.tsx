import { ComponentType, ReactNode, useMemo, useState } from 'react';
import { Ban, Building2, CalendarDays, ChevronRight, CreditCard, Inbox, LayoutDashboard, LucideIcon, Settings, ShieldCheck } from 'lucide-react';
import { UserProfile } from '../types';
import BlockedDatesManager from './BlockedDatesManager';
import CompanyManager from './CompanyManager';
import ReservationsDashboard from './ReservationsDashboard';
import TariffManager from './TariffManager';
import B2BVirtualCardBilling from './finance/B2BVirtualCardBilling';

type ChannelTabId = 'billing' | 'pending' | 'settings' | 'companies' | 'tariffs' | 'blocked-dates';

type ChannelTab = {
  id: ChannelTabId;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  render: () => ReactNode;
};

type QuickArea = {
  label: string;
  description: string;
  icon: LucideIcon;
  tab: ChannelTabId;
};

const quickAreas: QuickArea[] = [
  {
    label: 'Cobrancas B2B',
    description: 'Cartao virtual, comprovante e status por reserva.',
    icon: ShieldCheck,
    tab: 'billing',
  },
  {
    label: 'Reservas pendentes',
    description: 'Entrada, aprovacao, mapa e envio ao PMS.',
    icon: Inbox,
    tab: 'pending',
  },
  {
    label: 'Configuracoes',
    description: 'Gateway, Cielo e regras da propriedade.',
    icon: Settings,
    tab: 'settings',
  },
  {
    label: 'Empresas',
    description: 'Cadastro corporativo, dominio de email e aliases.',
    icon: Building2,
    tab: 'companies',
  },
  {
    label: 'Tarifas acordo',
    description: 'Tarifas por empresa, categoria e ocupacao.',
    icon: CreditCard,
    tab: 'tariffs',
  },
  {
    label: 'Bloqueio de datas',
    description: 'Fechamento de periodos para venda direta.',
    icon: Ban,
    tab: 'blocked-dates',
  },
];

export default function ReservationsChannelModule({ profile }: { profile: UserProfile }) {
  const tabs = useMemo<ChannelTab[]>(
    () => [
      {
        id: 'billing',
        label: 'Cobrancas B2B',
        description: 'Reservas a debitar, token/status de gateway, comprovantes, NSU/autorizacao e historico por propriedade.',
        icon: ShieldCheck,
        render: () => <B2BVirtualCardBilling profile={profile} />,
      },
      {
        id: 'pending',
        label: 'Reservas pendentes',
        description: 'Fila de pedidos, reservas confirmadas, documentos e envio operacional para o PMS.',
        icon: CalendarDays,
        render: () => <ReservationsDashboard profile={profile} />,
      },
      {
        id: 'settings',
        label: 'Configuracoes',
        description: 'Credenciais e regras da propriedade para cobranca Cielo/gateway e janela de debito.',
        icon: Settings,
        render: () => <B2BVirtualCardBilling profile={profile} initialTab="settings" />,
      },
      {
        id: 'companies',
        label: 'Empresas',
        description: 'Base corporativa usada por reservas, parser de emails e faturamento.',
        icon: Building2,
        render: () => <CompanyManager profile={profile} />,
      },
      {
        id: 'tariffs',
        label: 'Tarifas',
        description: 'Tarifas corporativas por categoria de UH e tipo de ocupacao.',
        icon: CreditCard,
        render: () => <TariffManager profile={profile} />,
      },
      {
        id: 'blocked-dates',
        label: 'Bloqueios',
        description: 'Datas fechadas para o motor de reservas e periodos sem disponibilidade.',
        icon: Ban,
        render: () => <BlockedDatesManager profile={profile} />,
      },
    ],
    [profile]
  );

  const defaultTab: ChannelTabId = ['admin', 'finance', 'faturamento', 'manager'].includes(profile.role) ? 'billing' : 'pending';
  const [activeTab, setActiveTab] = useState<ChannelTabId>(defaultTab);
  const active = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  return (
    <div className="space-y-6 pb-12">
      <section className="rounded-[2rem] border border-neutral-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-600 sm:text-xs">
              Reservas Channel
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-neutral-950 sm:text-3xl">
              Reservas Channel Manager
            </h1>
            <p className="mt-2 max-w-4xl text-xs leading-6 text-neutral-500 sm:text-sm sm:leading-7">
              Area externa ao PMS para cobrancas B2B, reservas pendentes, empresas, tarifas, bloqueios e configuracoes por propriedade. A reserva aprovada segue para o PMS; a cobranca fica controlada neste Channel.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:w-[560px]">
            {quickAreas.map((area) => {
              const Icon = area.icon;
              const selected = area.tab === activeTab;
              return (
                <button
                  key={area.tab}
                  type="button"
                  onClick={() => setActiveTab(area.tab)}
                  className={`min-h-[92px] rounded-2xl border p-3 text-left transition ${
                    selected
                      ? 'border-neutral-950 bg-neutral-950 text-white'
                      : 'border-neutral-200 bg-neutral-50 text-neutral-700 hover:border-neutral-300 hover:bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <Icon className={`h-4 w-4 ${selected ? 'text-amber-300' : 'text-amber-600'}`} />
                    <ChevronRight className={`h-3.5 w-3.5 ${selected ? 'text-white/50' : 'text-neutral-300'}`} />
                  </div>
                  <p className="mt-2 text-xs font-black leading-4">{area.label}</p>
                  <p className={`mt-1 text-[10px] leading-4 ${selected ? 'text-white/60' : 'text-neutral-500'}`}>
                    {area.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div className="flex gap-2 overflow-x-auto rounded-3xl border border-neutral-200 bg-white p-2 shadow-sm">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const selected = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-black transition md:px-4 md:py-3 ${
                selected ? 'bg-neutral-950 text-white' : 'bg-neutral-50 text-neutral-500 hover:bg-neutral-100'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <section className="rounded-[2rem] border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-col gap-2 border-b border-neutral-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4 text-amber-600" />
              <h2 className="text-sm font-black text-neutral-950 sm:text-base">{active.label}</h2>
            </div>
            <p className="mt-1 text-xs leading-5 text-neutral-500">{active.description}</p>
          </div>
        </div>
        {active.render()}
      </section>
    </div>
  );
}
