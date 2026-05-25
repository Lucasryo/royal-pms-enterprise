import { Building2, CreditCard, LogOut, Menu, Search, ShieldCheck } from 'lucide-react';
import { UserProfile } from '../types';
import { supabase } from '../supabase';
import B2BVirtualCardBilling from './finance/B2BVirtualCardBilling';

export default function ReservationsChannelModule({ profile }: { profile: UserProfile }) {
  return (
    <div className="flex min-h-screen bg-[#f7f7fb] font-sans text-neutral-950">
      <aside className="hidden w-[300px] shrink-0 flex-col bg-[#20134b] p-6 text-white shadow-2xl lg:flex">
        <div className="flex items-center gap-3">
          <Menu className="h-5 w-5 text-white/80" />
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10">
              <ShieldCheck className="h-4 w-4 text-pink-300" />
            </span>
            <span className="text-xl font-black tracking-tight">checkout</span>
          </div>
        </div>

        <div className="mt-10">
          <p className="text-base font-black">{profile.name}</p>
          <p className="mt-1 truncate text-xs text-white/70">{profile.email}</p>
        </div>

        <div className="mt-6 flex items-center gap-3 rounded-lg border border-white/35 px-4 py-3">
          <Building2 className="h-5 w-5 shrink-0 text-white" />
          <span className="truncate text-sm font-black">ROYAL MACAE PALACE</span>
        </div>

        <nav className="mt-3 space-y-2">
          <div className="rounded-lg bg-[#5054c7] px-4 py-3">
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5" />
              <span className="text-sm font-black">Reservas</span>
            </div>
          </div>
          <div className="rounded-lg bg-white/10 px-4 py-3 pl-10 text-sm font-black">
            Cobrança B2B
          </div>
        </nav>

        <div className="mt-auto">
          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            className="flex w-full items-center gap-3 rounded-lg border border-white/40 px-4 py-3 text-sm font-black text-white transition hover:bg-white/10"
          >
            <LogOut className="h-4 w-4" />
            Sair da Conta
          </button>
          <p className="mt-5 text-xs text-white/70">Royal PMS B2B © 2026</p>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#5054c7]">Reservas Channel</p>
              <h1 className="text-base font-black text-neutral-950">Cobrança B2B</h1>
            </div>
            <button
              type="button"
              onClick={() => supabase.auth.signOut()}
              className="rounded-xl border border-neutral-200 p-2 text-neutral-500"
              aria-label="Sair da conta"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="p-4 sm:p-6 lg:p-8">
          <section className="mb-6 overflow-hidden rounded-lg bg-[#20134b] text-white shadow-sm">
            <div className="bg-[linear-gradient(90deg,rgba(32,19,75,1),rgba(66,55,108,.88)),url('/hotel/fachada.jpg')] bg-cover bg-center px-6 py-6">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-white/55">Reservas Channel</p>
              <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Pesquisa de reservas</h1>
            </div>
          </section>

          <section className="mb-6 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto_auto]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <input
                  readOnly
                  placeholder="Código da reserva ou pedido"
                  className="h-11 w-full rounded border border-neutral-300 bg-white pl-10 pr-3 text-sm outline-none"
                />
              </div>
              <input
                readOnly
                placeholder="Nome do hóspede"
                className="h-11 w-full rounded border border-neutral-300 bg-white px-3 text-sm outline-none"
              />
              <button className="h-11 rounded border border-neutral-300 px-5 text-sm font-bold text-neutral-700" type="button">
                + Filtros
              </button>
              <button className="h-11 rounded bg-[#5054c7] px-6 text-sm font-black text-white" type="button">
                Pesquisar
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded bg-neutral-100 px-3 py-2 font-bold text-neutral-600">Check-out</span>
              <span className="rounded bg-neutral-100 px-3 py-2 font-bold text-neutral-600">Últimos 7 dias</span>
              <span className="rounded bg-neutral-100 px-3 py-2 font-bold text-neutral-600">Cobrança B2B</span>
            </div>
          </section>

          <B2BVirtualCardBilling profile={profile} />
        </div>
      </main>
    </div>
  );
}
