import { useMemo, useState } from 'react';
import {
  Activity, Bell, Building2, CalendarDays, ChevronRight, CreditCard, Hotel,
  Link2, LogOut, Menu, Search, Settings, ShieldCheck, Sparkles, WalletCards,
} from 'lucide-react';
import { UserProfile } from '../types';
import { supabase } from '../supabase';
import B2BVirtualCardBilling from './finance/B2BVirtualCardBilling';
import AdminRegistrationCenter from './AdminRegistrationCenter';

type ChannelTab = 'billing' | 'gateway' | 'b2b-settings';

const tabs: Array<{
  id: ChannelTab;
  label: string;
  eyebrow: string;
  description: string;
  icon: typeof CreditCard;
}> = [
  {
    id: 'billing',
    label: 'Cobranças',
    eyebrow: 'Virtual card desk',
    description: 'Pesquisa, conciliação e ação financeira por reserva.',
    icon: CreditCard,
  },
  {
    id: 'gateway',
    label: 'Gateway',
    eyebrow: 'Configuração',
    description: 'Regras de captura, provedor e janela de cobrança.',
    icon: Settings,
  },
  {
    id: 'b2b-settings',
    label: 'Vínculos e Voucher',
    eyebrow: 'Base corporativa',
    description: 'Clientes vinculados, perfis fiscais e modelo do voucher.',
    icon: Link2,
  },
];

export default function ReservationsChannelModule({ profile }: { profile: UserProfile }) {
  const [activeTab, setActiveTab] = useState<ChannelTab>('billing');
  const active = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
  const initials = useMemo(() => {
    const parts = profile.name.trim().split(/\s+/).slice(0, 2);
    return parts.map((part) => part[0]?.toUpperCase()).join('') || 'R';
  }, [profile.name]);

  return (
    <div className="min-h-screen bg-[#f5f6fb] text-neutral-950">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[292px] border-r border-white/10 bg-[#160b3f] text-white shadow-2xl lg:flex lg:flex-col">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(139,92,246,.28),transparent_32%),radial-gradient(circle_at_90%_0%,rgba(236,72,153,.16),transparent_30%)]" />
        <div className="relative flex min-h-0 flex-1 flex-col p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
              <ShieldCheck className="h-5 w-5 text-pink-200" />
            </span>
            <div>
              <p className="text-lg font-black tracking-tight">Reservas Channel</p>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/45">Corporate desk</p>
            </div>
          </div>

          <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.07] p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-sm font-black text-[#160b3f]">
                {initials}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-black">{profile.name}</p>
                <p className="truncate text-xs text-white/55">{profile.email}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-white/15 bg-[#0f0830] px-3 py-3">
              <Building2 className="h-4 w-4 shrink-0 text-violet-200" />
              <span className="truncate text-xs font-black uppercase tracking-wide">Royal Macaé Palace</span>
            </div>
          </div>

          <nav className="mt-6 space-y-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`group flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition ${
                    selected ? 'bg-white text-[#160b3f] shadow-xl shadow-black/20' : 'text-white/72 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className={`h-5 w-5 ${selected ? 'text-violet-700' : 'text-white/55 group-hover:text-white'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-black">{tab.label}</span>
                    <span className={`block truncate text-[10px] font-bold ${selected ? 'text-[#160b3f]/55' : 'text-white/35'}`}>{tab.eyebrow}</span>
                  </span>
                  <ChevronRight className={`h-4 w-4 ${selected ? 'text-violet-700' : 'text-white/25'}`} />
                </button>
              );
            })}
          </nav>

          <div className="mt-auto space-y-3">
            <div className="rounded-3xl border border-emerald-300/20 bg-emerald-300/10 p-4">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,.9)]" />
                <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-100">Online</p>
              </div>
              <p className="mt-2 text-xs leading-5 text-white/58">Portal isolado do PMS, com acesso restrito para reservas e financeiro.</p>
            </div>
            <button
              type="button"
              onClick={() => supabase.auth.signOut()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-black text-white transition hover:bg-white/10"
            >
              <LogOut className="h-4 w-4" />
              Sair da conta
            </button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 lg:pl-[292px]">
        <header className="sticky top-0 z-20 border-b border-neutral-200/80 bg-white/90 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button className="flex h-10 w-10 items-center justify-center rounded-2xl border border-neutral-200 text-neutral-500 lg:hidden" type="button" aria-label="Menu">
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-violet-600">Reservas Channel</p>
                <h1 className="truncate text-lg font-black tracking-tight text-neutral-950 sm:text-xl">{active.label}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="hidden h-10 items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-3 text-xs font-black text-neutral-600 shadow-sm sm:flex" type="button">
                <Bell className="h-4 w-4" />
                Alertas
              </button>
              <button
                type="button"
                onClick={() => supabase.auth.signOut()}
                className="flex h-10 items-center gap-2 rounded-2xl bg-neutral-950 px-4 text-xs font-black text-white shadow-sm lg:hidden"
              >
                <LogOut className="h-4 w-4" />
                Sair
              </button>
            </div>
          </div>
        </header>

        <div className="space-y-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          <section className="overflow-hidden rounded-[2rem] border border-[#2f2461]/10 bg-[#160b3f] text-white shadow-2xl shadow-violet-950/10">
            <div className="relative grid gap-8 p-6 sm:p-8 xl:grid-cols-[minmax(0,1fr)_420px]">
              <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(22,11,63,.96),rgba(42,29,91,.9)),url('/hotel/fachada.jpg')] bg-cover bg-center" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_74%_18%,rgba(236,72,153,.32),transparent_28%),radial-gradient(circle_at_10%_85%,rgba(99,102,241,.35),transparent_28%)]" />
              <div className="relative">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-pink-200" />
                  <span className="text-[10px] font-black uppercase tracking-[0.22em] text-white/70">{active.eyebrow}</span>
                </div>
                <h2 className="mt-5 max-w-3xl text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
                  Central viva para reservas corporativas, cartões virtuais e vouchers B2B.
                </h2>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-white/68 sm:text-base">
                  {active.description} Tudo separado do PMS operacional para o time de reservas e financeiro trabalhar com foco.
                </p>
                <div className="mt-6 grid max-w-3xl gap-3 sm:grid-cols-3">
                  <HeroMetric icon={CalendarDays} label="Janela ativa" value="7 dias" />
                  <HeroMetric icon={WalletCards} label="Fluxo" value="B2B card" />
                  <HeroMetric icon={Activity} label="Status" value="Ao vivo" />
                </div>
              </div>

              <div className="relative rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-white/55">Busca rápida</p>
                  <Hotel className="h-4 w-4 text-white/45" />
                </div>
                <div className="mt-4 space-y-3">
                  <label className="relative block">
                    <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
                    <input
                      readOnly
                      placeholder="Reserva, hóspede, empresa ou UH"
                      className="h-12 w-full rounded-2xl border border-white/15 bg-white/10 pl-11 pr-4 text-sm text-white outline-none placeholder:text-white/42"
                    />
                  </label>
                  <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-black">
                    <span className="rounded-2xl bg-white px-3 py-2 text-[#160b3f]">Checkout</span>
                    <span className="rounded-2xl bg-white/10 px-3 py-2 text-white/70">Token</span>
                    <span className="rounded-2xl bg-white/10 px-3 py-2 text-white/70">Voucher</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="grid gap-3 xl:grid-cols-3">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-3xl border p-4 text-left transition ${
                    selected
                      ? 'border-violet-300 bg-white shadow-xl shadow-violet-950/10'
                      : 'border-neutral-200 bg-white/70 hover:border-violet-200 hover:bg-white'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${selected ? 'bg-violet-600 text-white' : 'bg-neutral-100 text-neutral-500'}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-black text-neutral-950">{tab.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-neutral-500">{tab.description}</span>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <section className="min-w-0">
            {activeTab === 'billing' && <B2BVirtualCardBilling profile={profile} shell="channel" initialTab="charges" />}
            {activeTab === 'gateway' && <B2BVirtualCardBilling profile={profile} shell="channel" initialTab="settings" />}
            {activeTab === 'b2b-settings' && (
              <div className="rounded-[2rem] border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
                <AdminRegistrationCenter profile={profile} mode="channel" />
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function HeroMetric({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/15 bg-white/10 p-4">
      <Icon className="h-4 w-4 text-pink-200" />
      <p className="mt-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/45">{label}</p>
      <p className="mt-1 text-xl font-black text-white">{value}</p>
    </div>
  );
}
