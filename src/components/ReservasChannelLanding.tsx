import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  CreditCard,
  FileCheck2,
  Link2,
  LockKeyhole,
  Menu,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  WalletCards,
  Workflow,
  X,
} from 'lucide-react';
import Login from './Login';

const navItems = [
  { href: '#fluxo', label: 'Fluxo' },
  { href: '#b2b', label: 'B2B' },
  { href: '#controle', label: 'Controle' },
  { href: '#portal', label: 'Portal' },
];

const highlights = [
  { label: 'Reservas B2B', value: '1.327', tone: 'bg-[#13231F] text-white' },
  { label: 'Tokens pendentes', value: '18', tone: 'bg-[#F4C15D] text-[#17120D]' },
  { label: 'Prontas para cobrar', value: '42', tone: 'bg-white text-[#17120D]' },
];

const workflow = [
  {
    icon: Building2,
    title: 'Reserva entra limpa',
    text: 'Booking, empresa, hospede, periodo e UH ficam em uma linha operacional unica para o time interno.',
  },
  {
    icon: WalletCards,
    title: 'Cartao virtual acompanhado',
    text: 'Status de token, autorizacao, valor a receber e problema financeiro aparecem antes de virar pendencia.',
  },
  {
    icon: Link2,
    title: 'Vinculos e voucher B2B',
    text: 'Empresas, documentos e vouchers vivem dentro do Reservas Channel, sem aparecer para cliente externo.',
  },
];

const controlItems = [
  { icon: CreditCard, title: 'Cobranca B2B', text: 'Filtro por token, pronto para cobrar, problema financeiro e cobrado.' },
  { icon: FileCheck2, title: 'Voucher corporativo', text: 'Vinculos, anexos e documentos no mesmo contexto da reserva.' },
  { icon: ShieldCheck, title: 'Perfil correto', text: 'Somente reservas, financeiro, faturamento e admin acessam o portal.' },
  { icon: RefreshCw, title: 'Rotina diaria', text: 'Atualizacao rapida, indicadores de carteira e mesa de trabalho objetiva.' },
];

function LoginSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#100C08]/70 px-4 py-5 backdrop-blur-xl sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="relative w-full max-w-md"
            initial={{ opacity: 0, y: 34, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Fechar login"
              onClick={onClose}
              className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white/90 text-neutral-700 shadow-sm transition hover:bg-white hover:text-black"
            >
              <X className="h-4 w-4" />
            </button>
            <Login embedded />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[640px] overflow-hidden rounded-[28px] border border-white/14 bg-[#0E1116] p-3 shadow-[0_34px_90px_-36px_rgba(0,0,0,0.9)]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-white">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-[#F15F5F]" />
          <span className="h-3 w-3 rounded-full bg-[#F4C15D]" />
          <span className="h-3 w-3 rounded-full bg-[#39B883]" />
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
          Portal privado
        </span>
      </div>

      <div className="grid gap-3 p-3 lg:grid-cols-[168px_1fr]">
        <aside className="rounded-2xl bg-[#18122F] p-4 text-white">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/12">
              <ShieldCheck className="h-4 w-4 text-[#F4C15D]" />
            </span>
            <div>
              <p className="text-sm font-black">Reservas Channel</p>
              <p className="text-[11px] text-white/55">Royal Macae Palace</p>
            </div>
          </div>
          <div className="mt-6 space-y-2">
            {['Cobranca B2B', 'Vinculos e Voucher', 'Auditoria'].map((item, index) => (
              <div
                key={item}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${
                  index === 0 ? 'bg-white text-[#17120D]' : 'bg-white/8 text-white/72'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${index === 0 ? 'bg-[#39B883]' : 'bg-white/30'}`} />
                {item}
              </div>
            ))}
          </div>
        </aside>

        <main className="space-y-3">
          <div className="rounded-2xl bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#8A7863]">Mesa de reservas</p>
                <h3 className="mt-1 text-xl font-black text-[#17120D]">Cartao virtual corporativo</h3>
              </div>
              <button className="inline-flex items-center gap-2 rounded-full bg-[#17120D] px-3 py-2 text-xs font-bold text-white">
                <RefreshCw className="h-3.5 w-3.5" />
                Atualizar
              </button>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {highlights.map((item) => (
                <div key={item.label} className={`rounded-2xl p-3 ${item.tone}`}>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-65">{item.label}</p>
                  <p className="mt-2 text-2xl font-black">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl bg-white">
            <div className="grid grid-cols-[1.1fr_0.9fr_0.8fr_0.8fr] gap-3 border-b border-neutral-100 px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-neutral-400">
              <span>Reserva</span>
              <span>Empresa</span>
              <span>Valor</span>
              <span>Status</span>
            </div>
            {[
              ['6991252402', 'Petro Rio', 'R$ 1.842,00', 'Pronto'],
              ['6991252477', 'Onshore Lab', 'R$ 680,00', 'Token'],
              ['6991252521', 'Acu Log', 'R$ 2.210,00', 'Voucher'],
            ].map((row, index) => (
              <div key={row[0]} className="grid grid-cols-[1.1fr_0.9fr_0.8fr_0.8fr] gap-3 border-b border-neutral-100 px-4 py-3 text-xs text-neutral-700 last:border-b-0">
                <span className="font-black text-neutral-950">{row[0]}</span>
                <span>{row[1]}</span>
                <span className="font-bold">{row[2]}</span>
                <span>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-black ${index === 1 ? 'bg-[#FFF4D6] text-[#8A5A00]' : 'bg-[#E9F8EF] text-[#19764E]'}`}>
                    {row[3]}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function ReservasChannelLanding() {
  const [loginOpen, setLoginOpen] = useState(() => window.location.hash === '#login');
  const [menuOpen, setMenuOpen] = useState(false);

  const openLogin = () => {
    setMenuOpen(false);
    setLoginOpen(true);
    if (window.location.hash !== '#login') {
      window.history.replaceState(null, '', `${window.location.pathname}#login`);
    }
  };

  const closeLogin = () => {
    setLoginOpen(false);
    if (window.location.hash === '#login') {
      window.history.replaceState(null, '', window.location.pathname);
    }
  };

  useEffect(() => {
    const syncHash = () => setLoginOpen(window.location.hash === '#login');
    window.addEventListener('hashchange', syncHash);
    syncHash();
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);

  return (
    <div className="min-h-screen bg-[#F6F2EA] font-sans text-[#17120D]">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-black/10 bg-[#F6F2EA]/88 backdrop-blur-xl">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <a href="/" className="flex items-center gap-3" aria-label="Voltar para Royal PMS">
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[#17120D]/15 bg-white text-lg font-semibold italic">
              R
            </span>
            <span>
              <span className="block text-sm font-black leading-none">Reservas Channel</span>
              <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.28em] text-[#8A7863]">Royal PMS</span>
            </span>
          </a>

          <nav className="hidden items-center gap-8 text-sm font-semibold text-[#4A4035] lg:flex">
            {navItems.map((item) => (
              <a key={item.href} href={item.href} className="transition hover:text-black">
                {item.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <a href="/sistema" className="rounded-full px-4 py-2 text-sm font-semibold text-[#4A4035] transition hover:bg-black/5">
              Royal PMS
            </a>
            <button
              type="button"
              onClick={openLogin}
              className="inline-flex items-center gap-2 rounded-full bg-[#17120D] px-5 py-3 text-sm font-black text-white shadow-[0_16px_36px_-18px_rgba(0,0,0,0.7)] transition hover:-translate-y-0.5 hover:bg-black"
            >
              Entrar no portal
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            aria-label="Abrir menu"
            onClick={() => setMenuOpen((value) => !value)}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white lg:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        <AnimatePresence>
          {menuOpen ? (
            <motion.div
              className="border-t border-black/10 bg-[#F6F2EA] px-4 pb-5 lg:hidden"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <div className="mx-auto flex max-w-7xl flex-col gap-2 pt-3">
                {navItems.map((item) => (
                  <a key={item.href} href={item.href} onClick={() => setMenuOpen(false)} className="rounded-2xl px-3 py-3 text-sm font-bold text-[#4A4035] hover:bg-white">
                    {item.label}
                  </a>
                ))}
                <button type="button" onClick={openLogin} className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-[#17120D] px-5 py-3 text-sm font-black text-white">
                  Entrar no portal
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </header>

      <main>
        <section id="portal" className="relative overflow-hidden pt-24">
          <div aria-hidden className="absolute inset-0">
            <img src="/hotel/lobby.jpg" alt="" className="h-full w-full object-cover opacity-18" />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,#F6F2EA_0%,rgba(246,242,234,0.95)_42%,rgba(246,242,234,0.74)_100%)]" />
          </div>

          <div className="relative mx-auto grid min-h-[calc(100svh-6rem)] max-w-7xl items-center gap-10 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:px-8">
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#17120D]/10 bg-white/72 px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-[#705B42] shadow-sm backdrop-blur">
                <Sparkles className="h-3.5 w-3.5 text-[#B57B19]" />
                Portal privado do hotel
              </div>
              <h1 className="mt-6 max-w-3xl text-balance font-display text-5xl font-light leading-[0.95] text-[#17120D] sm:text-6xl lg:text-7xl">
                Reservas Channel para B2B, vouchers e cartoes virtuais.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-[#4A4035]">
                Uma landing propria para o acesso do time do hotel, com o portal separado do PMS e feito para reservas, financeiro e faturamento trabalharem sem abrir telas erradas.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={openLogin}
                  className="inline-flex items-center justify-center gap-3 rounded-full bg-[#17120D] px-6 py-4 text-sm font-black text-white shadow-[0_24px_50px_-26px_rgba(0,0,0,0.85)] transition hover:-translate-y-0.5 hover:bg-black"
                >
                  Entrar no portal
                  <ArrowRight className="h-4 w-4" />
                </button>
                <a
                  href="#fluxo"
                  className="inline-flex items-center justify-center gap-3 rounded-full border border-[#17120D]/14 bg-white/76 px-6 py-4 text-sm font-black text-[#17120D] backdrop-blur transition hover:bg-white"
                >
                  Ver fluxo B2B
                  <Workflow className="h-4 w-4" />
                </a>
              </div>

              <div className="mt-8 grid max-w-xl grid-cols-3 gap-3">
                {[
                  ['Acesso', 'hotel'],
                  ['Cliente', 'externo nao ve'],
                  ['Login', 'direto'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-black/10 bg-white/70 p-4 backdrop-blur">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8A7863]">{label}</p>
                    <p className="mt-1 text-sm font-black text-[#17120D]">{value}</p>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 34, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.82, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}>
              <ProductPreview />
            </motion.div>
          </div>
        </section>

        <section id="fluxo" className="border-y border-black/10 bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-[#8A7863]">Fluxo operacional</p>
                <h2 className="mt-3 max-w-2xl text-4xl font-black tracking-tight text-[#17120D] sm:text-5xl">
                  O caminho certo antes do usuario cair no portal.
                </h2>
              </div>
              <p className="max-w-md text-sm leading-7 text-[#5C5146]">
                A rota publica vende e contextualiza o Reservas Channel. O clique em entrar abre o login. Apos autenticar, o usuario autorizado cai no modulo.
              </p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {workflow.map((item, index) => (
                <div key={item.title} className="rounded-[24px] border border-black/10 bg-[#F6F2EA] p-6">
                  <div className="flex items-center justify-between">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#17120D] text-white">
                      <item.icon className="h-5 w-5" />
                    </span>
                    <span className="text-sm font-black text-[#B57B19]">0{index + 1}</span>
                  </div>
                  <h3 className="mt-6 text-xl font-black text-[#17120D]">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-[#5C5146]">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="b2b" className="bg-[#17120D] py-16 text-white sm:py-20">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
            <div className="overflow-hidden rounded-[28px] border border-white/12">
              <img src="/hotel/fachada.jpg" alt="Fachada do hotel" className="h-full min-h-[360px] w-full object-cover" />
            </div>
            <div className="flex flex-col justify-center">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[#F4C15D]">B2B sem mistura</p>
              <h2 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
                Reservas Channel isolado, com linguagem de receita e operacao.
              </h2>
              <p className="mt-5 text-base leading-8 text-white/72">
                O PMS continua sendo a central do hotel. O Reservas Channel vira a porta dedicada para tratar reservas corporativas, cobranca virtual, vinculos e vouchers sem expor recursos administrativos a cliente externo.
              </p>
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {['Reservas', 'Financeiro', 'Faturamento'].map((role) => (
                  <div key={role} className="flex items-center gap-3 rounded-2xl bg-white/8 p-4">
                    <CheckCircle2 className="h-5 w-5 text-[#39B883]" />
                    <span className="text-sm font-black">{role}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="controle" className="bg-[#F6F2EA] py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[#8A7863]">Controle do hotel</p>
              <h2 className="mt-3 text-4xl font-black tracking-tight text-[#17120D] sm:text-5xl">
                Tudo que era solto no Admin agora pertence ao Reservas Channel.
              </h2>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {controlItems.map((item) => (
                <div key={item.title} className="rounded-[24px] border border-black/10 bg-white p-6 shadow-[0_18px_50px_-38px_rgba(0,0,0,0.7)]">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E9F8EF] text-[#19764E]">
                    <item.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-6 text-lg font-black text-[#17120D]">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-[#5C5146]">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white px-4 py-10 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 rounded-[28px] bg-[#F4C15D] p-8 text-[#17120D] sm:p-10 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] opacity-70">Acesso correto</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Entrar no Reservas Channel</h2>
              <p className="mt-3 max-w-2xl text-sm font-semibold leading-7 opacity-80">
                A landing fica publica. O portal permanece protegido, com login direto e destino certo para o Reservas Channel.
              </p>
            </div>
            <button
              type="button"
              onClick={openLogin}
              className="inline-flex items-center justify-center gap-3 rounded-full bg-[#17120D] px-6 py-4 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-black"
            >
              Abrir login do portal
              <LockKeyhole className="h-4 w-4" />
            </button>
          </div>
        </section>
      </main>

      <LoginSheet open={loginOpen} onClose={closeLogin} />
    </div>
  );
}
