import { useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  BedDouble,
  Building2,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  Clock,
  Hotel,
  Layers3,
  LogIn,
  MessageCircle,
  Receipt,
  Send,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Utensils,
  Wrench,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Login from './Login';
import PublicBookingEngine from './PublicBookingEngine';

const WHATSAPP_NUMBER = '5522996105104';
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}`;

const stats = [
  { label: 'Hotelaria desde', value: '1990', sub: 'Tradição operacional do Royal Macaé Palace' },
  { label: 'Módulos integrados', value: '8+', sub: 'Reservas, recepção, governança, faturamento e mais' },
  { label: 'Operação', value: '24/7', sub: 'Plataforma web disponível em qualquer lugar' },
  { label: 'Implantação', value: '100% web', sub: 'Sem instalação, sem servidor local' },
];

const modules = [
  { name: 'Reservas', description: 'Disponibilidade, tarifa, garantia e ocupação em um só fluxo.', icon: CalendarRange },
  { name: 'Recepção', description: 'Check-in, check-out, walk-in e conta corrente do hóspede.', icon: Hotel },
  { name: 'Governança', description: 'Status de UH, limpeza, inspeção e bloqueios em tempo real.', icon: Layers3 },
  { name: 'Manutenção', description: 'Chamados, fila por setor, direcionamento e SLA.', icon: Wrench },
  { name: 'Restaurante / POS', description: 'Lançamentos em folio, venda direta e integração com a hospedagem.', icon: Utensils },
  { name: 'Eventos', description: 'O.S., agenda, espelho de calendário e roteiro de equipe.', icon: ClipboardList },
  { name: 'Faturamento', description: 'Notas, faturas, baixa, AR e conciliação por forma de pagamento.', icon: Receipt },
  { name: 'Gestão Pro', description: 'Dashboards, ocupação, performance e auditoria entre módulos.', icon: BarChart3 },
];

const benefits = [
  {
    title: 'Menos retrabalho entre setores',
    description: 'Reservas, recepção, governança e financeiro trabalham com a mesma base operacional, sem planilhas paralelas.',
  },
  {
    title: 'Leitura rápida da operação',
    description: 'Ocupação, movimento do dia, pendências e responsabilidades visíveis em um painel único.',
  },
  {
    title: 'Estrutura para crescer',
    description: 'Arquitetura desenhada para padronizar processo e profissionalizar a gestão sem peso desnecessário.',
  },
];

const howItWorks = [
  {
    step: '01',
    title: 'Conversa inicial',
    description: 'Conhecemos sua operação, mapeamos pontos críticos e mostramos como o Royal PMS se encaixa no seu dia a dia.',
  },
  {
    step: '02',
    title: 'Implantação acompanhada',
    description: 'Configuramos UHs, tarifas, perfis de acesso e treinamos o time. Tudo no navegador, sem instalação.',
  },
  {
    step: '03',
    title: 'Operação no ar',
    description: 'Reservas, recepção, faturamento e governança rodando integrados. Suporte direto com quem implantou.',
  },
];

const faq = [
  {
    question: 'Serve para uma operação menor, como pousadas?',
    answer:
      'Sim. A arquitetura atende pousadas e hotéis independentes que precisam profissionalizar a gestão sem adotar uma estrutura excessivamente pesada.',
  },
  {
    question: 'Minha equipe vai ter dificuldade para usar?',
    answer:
      'Cada login entra direto no módulo da sua função. Reservas, recepção, governança e financeiro trabalham com interfaces especializadas e sem ruído.',
  },
  {
    question: 'Precisa instalar algum software no hotel?',
    answer:
      'Não. O Royal PMS é 100% web. Funciona em qualquer navegador, em desktop, tablet ou celular. Atualizações são automáticas.',
  },
  {
    question: 'Como funcionam as permissões e a auditoria?',
    answer:
      'Cada usuário tem permissões granulares por ação. Toda operação relevante (cancelar, alterar tarifa, baixar pagamento) fica registrada em trilha de auditoria consultável.',
  },
  {
    question: 'É possível migrar nossos dados atuais?',
    answer:
      'Sim. Reservas, hóspedes, empresas e tarifas vigentes podem ser importados durante a implantação. Conversamos sobre o formato disponível e ajustamos.',
  },
];

const footerLinks = [
  {
    title: 'Produto',
    links: [
      { label: 'Módulos', href: '#modulos' },
      { label: 'Telas do sistema', href: '#telas' },
      { label: 'Como funciona', href: '#como-funciona' },
    ],
  },
  {
    title: 'Empresa',
    links: [
      { label: 'Royal Macaé Palace', href: 'https://royalmacaepalace.com.br', external: true },
      { label: 'Reservar hospedagem', href: '#reservar' },
      { label: 'Solicitar demonstração', href: '#demo' },
    ],
  },
  {
    title: 'Contato',
    links: [
      { label: 'WhatsApp comercial', href: WHATSAPP_LINK, external: true },
      { label: 'Macaé / RJ — Brasil', href: '#' },
    ],
  },
];

export default function MarketingLanding() {
  const [loginOpen, setLoginOpen] = useState(false);

  // Lock body scroll while modal open
  useEffect(() => {
    if (loginOpen) {
      const previous = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setLoginOpen(false);
      };
      window.addEventListener('keydown', onKey);
      return () => {
        document.body.style.overflow = previous;
        window.removeEventListener('keydown', onKey);
      };
    }
  }, [loginOpen]);

  // If user navigates with #login hash (legacy), open modal
  useEffect(() => {
    if (window.location.hash === '#login') {
      setLoginOpen(true);
    }
  }, []);

  return (
    <div className="min-h-screen bg-white text-stone-900">
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <a href="#inicio" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-stone-200 bg-white p-1">
              <img src="/logo.png" alt="Royal PMS" className="h-full w-full object-contain" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-black uppercase tracking-tight text-stone-950">Royal PMS</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-stone-500">
                Plataforma de hotelaria
              </p>
            </div>
          </a>

          <nav className="hidden items-center gap-7 text-sm font-medium text-stone-600 md:flex">
            <a href="#modulos" className="transition hover:text-stone-950">Módulos</a>
            <a href="#telas" className="transition hover:text-stone-950">Telas do sistema</a>
            <a href="#como-funciona" className="transition hover:text-stone-950">Como funciona</a>
            <a href="#faq" className="transition hover:text-stone-950">Perguntas</a>
            <a href="#reservar" className="transition hover:text-stone-950">Para hóspedes</a>
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setLoginOpen(true)}
              className="hidden min-h-10 items-center justify-center gap-2 rounded-full border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-800 transition hover:-translate-y-0.5 hover:border-stone-400 sm:inline-flex"
            >
              <LogIn className="h-4 w-4" />
              Entrar
            </button>
            <a
              href="#demo"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-amber-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-amber-800"
            >
              Solicitar demonstração
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section id="inicio" className="border-b border-stone-100">
          <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-12 lg:px-8 lg:py-24">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <p className="mb-4 text-xs font-extrabold uppercase tracking-[0.3em] text-amber-700">
                PMS para hotelaria independente
              </p>
              <h1 className="max-w-3xl text-4xl font-black leading-[1.05] tracking-tight text-stone-950 sm:text-5xl lg:text-6xl">
                Profissionalize reservas, operação e faturamento em um só sistema.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-stone-600 sm:text-lg">
                O Royal PMS organiza a rotina do hotel — reservas, recepção, governança, manutenção, restaurante,
                eventos e financeiro — para meios de hospedagem que querem trocar improviso por padrão.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#demo"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-amber-700 px-6 text-sm font-semibold text-white shadow-md shadow-amber-900/20 transition hover:-translate-y-0.5 hover:bg-amber-800"
                >
                  Solicitar demonstração
                  <ArrowRight className="h-4 w-4" />
                </a>
                <button
                  onClick={() => setLoginOpen(true)}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-stone-300 bg-white px-6 text-sm font-semibold text-stone-800 transition hover:-translate-y-0.5 hover:border-stone-400"
                >
                  <LogIn className="h-4 w-4" />
                  Já tenho acesso
                </button>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-4 text-xs font-semibold text-stone-500">
                <div className="inline-flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  100% web
                </div>
                <div className="inline-flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Operando em produção
                </div>
                <div className="inline-flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Trilha de auditoria
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="relative"
            >
              <BrowserFrame url="royal-pms.app/manutencao">
                <WorkQueuePreview />
              </BrowserFrame>

              <div className="absolute -bottom-5 -left-5 hidden rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-xl lg:block">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100">
                    <Receipt className="h-4 w-4 text-emerald-700" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-500">Faturamento</p>
                    <p className="text-sm font-bold text-stone-900">R$ 142,8 mil</p>
                    <p className="text-[10px] text-stone-500">acumulado do mês</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* STATS BANNER */}
        <section className="border-b border-stone-100 bg-stone-50">
          <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
            {stats.map((stat) => (
              <div key={stat.label} className="border-l-2 border-amber-700 pl-4">
                <p className="text-3xl font-black tracking-tight text-stone-950 sm:text-4xl">{stat.value}</p>
                <p className="mt-2 text-sm font-bold uppercase tracking-widest text-stone-700">{stat.label}</p>
                <p className="mt-1 text-xs leading-5 text-stone-500">{stat.sub}</p>
              </div>
            ))}
          </div>
        </section>

        {/* MODULES GRID */}
        <section id="modulos" className="border-b border-stone-100">
          <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="text-xs font-extrabold uppercase tracking-[0.3em] text-amber-700">Módulos do sistema</p>
              <h2 className="mt-4 text-3xl font-black leading-tight tracking-tight text-stone-950 sm:text-4xl lg:text-5xl">
                Toda a operação do hotel em uma plataforma única.
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-7 text-stone-600">
                Cada módulo é especializado para a função que executa, mas todos compartilham a mesma base de dados —
                evitando retrabalho e divergências entre setores.
              </p>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {modules.map((module) => (
                <div
                  key={module.name}
                  className="group rounded-2xl border border-stone-200 bg-white p-6 transition hover:-translate-y-1 hover:border-amber-300 hover:shadow-lg"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-700 transition group-hover:bg-amber-100">
                    <module.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-base font-bold text-stone-950">{module.name}</h3>
                  <p className="mt-2 text-sm leading-6 text-stone-600">{module.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* TELAS DO SISTEMA */}
        <section id="telas" className="border-b border-stone-100 bg-stone-50">
          <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="text-xs font-extrabold uppercase tracking-[0.3em] text-amber-700">Telas do sistema</p>
              <h2 className="mt-4 text-3xl font-black leading-tight tracking-tight text-stone-950 sm:text-4xl lg:text-5xl">
                Veja o Royal PMS em ação.
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-7 text-stone-600">
                Interfaces reais de quem trabalha no chão da operação — sem ruído, sem cliques perdidos.
              </p>
            </div>

            <div className="mt-12 grid gap-6 lg:grid-cols-2">
              <div>
                <BrowserFrame url="royal-pms.app/recepcao">
                  <RoomMapPreview />
                </BrowserFrame>
                <p className="mt-4 text-sm font-bold text-stone-900">Mapa operacional de UHs</p>
                <p className="mt-1 text-sm leading-6 text-stone-600">
                  Status de limpeza, ocupação e bloqueio em uma visão única. Recepção e governança trabalham com a mesma fonte.
                </p>
              </div>

              <div>
                <BrowserFrame url="royal-pms.app/reservas">
                  <ReservationsPreview />
                </BrowserFrame>
                <p className="mt-4 text-sm font-bold text-stone-900">Central de reservas</p>
                <p className="mt-1 text-sm leading-6 text-stone-600">
                  Disponibilidade, garantias, empresas e canais em um fluxo único de criação e alteração.
                </p>
              </div>

              <div>
                <BrowserFrame url="royal-pms.app/admin">
                  <DashboardPreview />
                </BrowserFrame>
                <p className="mt-4 text-sm font-bold text-stone-900">Gestão Pro</p>
                <p className="mt-1 text-sm leading-6 text-stone-600">
                  Ocupação, performance e indicadores financeiros para decisão rápida da gestão.
                </p>
              </div>

              <div>
                <BrowserFrame url="royal-pms.app/financeiro">
                  <BillingPreview />
                </BrowserFrame>
                <p className="mt-4 text-sm font-bold text-stone-900">Faturamento e cobrança</p>
                <p className="mt-1 text-sm leading-6 text-stone-600">
                  Notas, faturas, AR e conciliação. Trilha de auditoria entre lançamento e baixa.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* BENEFITS / VALUE */}
        <section className="border-b border-stone-100 bg-stone-950 text-white">
          <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="text-xs font-extrabold uppercase tracking-[0.3em] text-amber-300">Por que migrar</p>
              <h2 className="mt-4 text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
                Um sistema que organiza a hotelaria onde ela mais perde tempo, controle e dinheiro.
              </h2>
            </div>

            <div className="mt-12 grid gap-5 lg:grid-cols-3">
              {benefits.map((item) => (
                <div key={item.title} className="rounded-2xl border border-white/10 bg-white/5 p-6">
                  <BadgeCheck className="h-6 w-6 text-amber-300" />
                  <h3 className="mt-4 text-lg font-bold text-white">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-white/75">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="como-funciona" className="border-b border-stone-100">
          <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="text-xs font-extrabold uppercase tracking-[0.3em] text-amber-700">Como funciona</p>
              <h2 className="mt-4 text-3xl font-black leading-tight tracking-tight text-stone-950 sm:text-4xl lg:text-5xl">
                Da primeira conversa até a operação no ar em poucas semanas.
              </h2>
            </div>

            <div className="mt-12 grid gap-5 lg:grid-cols-3">
              {howItWorks.map((step) => (
                <div key={step.step} className="rounded-2xl border border-stone-200 bg-white p-7">
                  <p className="text-5xl font-black text-amber-700">{step.step}</p>
                  <h3 className="mt-4 text-xl font-bold text-stone-950">{step.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-stone-600">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SOCIAL PROOF / WHO USES */}
        <section className="border-b border-stone-100 bg-stone-50">
          <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1fr] lg:items-center lg:px-8">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.3em] text-amber-700">Quem está usando</p>
              <h2 className="mt-4 text-3xl font-black leading-tight tracking-tight text-stone-950 sm:text-4xl">
                Validado em operação real.
              </h2>
              <p className="mt-5 text-base leading-7 text-stone-600">
                O Royal PMS roda diariamente no Royal Macaé Palace — um hotel executivo com tradição na cidade desde 1990,
                atendendo empresas, eventos e hóspedes individuais com a mesma plataforma integrada.
              </p>

              <div className="mt-8 flex items-start gap-4 rounded-2xl border border-stone-200 bg-white p-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                  <Building2 className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-stone-950">Royal Macaé Palace</p>
                  <p className="mt-1 text-sm leading-6 text-stone-600">
                    Hotel executivo em Macaé/RJ. Reservas corporativas, eventos e hospedagem operados 24/7 no Royal PMS.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-stone-200 bg-white p-8">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-amber-700" />
                <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-amber-700">Resultado percebido</p>
              </div>
              <p className="mt-6 text-2xl font-bold leading-snug text-stone-950">
                "A operação ficou mais previsível. Reservas, recepção e financeiro pararam de viver de planilha
                paralela e passaram a falar a mesma língua."
              </p>
              <div className="mt-6 flex items-center gap-3 border-t border-stone-200 pt-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-700">
                  <UsersRound className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-bold text-stone-900">Equipe operacional</p>
                  <p className="text-xs text-stone-500">Royal Macaé Palace</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-b border-stone-100">
          <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.3em] text-amber-700">Perguntas frequentes</p>
              <h2 className="mt-4 text-3xl font-black leading-tight tracking-tight text-stone-950 sm:text-4xl">
                Dúvidas comuns na hora de avaliar.
              </h2>
              <p className="mt-5 text-base leading-7 text-stone-600">
                Não encontrou sua dúvida? Fale direto com o time comercial — atendemos pelo WhatsApp.
              </p>
              <a
                href={WHATSAPP_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-800 transition hover:-translate-y-0.5 hover:border-stone-400"
              >
                <MessageCircle className="h-4 w-4" />
                Falar no WhatsApp
              </a>
            </div>

            <div className="space-y-3">
              {faq.map((item) => (
                <details
                  key={item.question}
                  className="group rounded-2xl border border-stone-200 bg-white p-5 transition hover:border-stone-300"
                >
                  <summary className="flex cursor-pointer items-start justify-between gap-4 text-base font-bold text-stone-950 marker:hidden [&::-webkit-details-marker]:hidden">
                    {item.question}
                    <span className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-stone-300 text-stone-700 transition group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-7 text-stone-600">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* BOOKING ENGINE — for guests */}
        <section id="reservar" className="border-b border-stone-100 bg-stone-50">
          <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="mb-8 max-w-3xl">
              <p className="text-xs font-extrabold uppercase tracking-[0.3em] text-amber-700">Para hóspedes</p>
              <h2 className="mt-4 text-3xl font-black leading-tight tracking-tight text-stone-950 sm:text-4xl">
                Vai se hospedar no Royal Macaé Palace? Reserve direto.
              </h2>
              <p className="mt-4 text-base leading-7 text-stone-600">
                Tarifa direta sem intermediário, com confirmação imediata pelo motor de reservas integrado ao PMS.
              </p>
            </div>
            <PublicBookingEngine />
          </div>
        </section>

        {/* DEMO CTA */}
        <section id="demo" className="border-b border-stone-100">
          <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
            <div className="rounded-[2rem] border border-stone-200 bg-stone-950 px-8 py-16 text-center text-white sm:px-16">
              <p className="text-xs font-extrabold uppercase tracking-[0.3em] text-amber-300">Pronto para profissionalizar?</p>
              <h2 className="mx-auto mt-5 max-w-3xl text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
                Agende uma demonstração e veja o Royal PMS rodando na sua operação.
              </h2>
              <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-white/70">
                Sem compromisso. Conhecemos seu hotel, mostramos o sistema e você decide se faz sentido seguir.
              </p>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <a
                  href={WHATSAPP_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-amber-500 px-6 text-sm font-semibold text-stone-950 transition hover:-translate-y-0.5 hover:bg-amber-400"
                >
                  <MessageCircle className="h-4 w-4" />
                  Falar no WhatsApp
                </a>
                <button
                  onClick={() => setLoginOpen(true)}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/30 bg-white/10 px-6 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/20"
                >
                  <LogIn className="h-4 w-4" />
                  Já tenho acesso — entrar
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="bg-stone-950 text-white">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white p-1">
                  <img src="/logo.png" alt="Royal PMS" className="h-full w-full object-contain" />
                </div>
                <div className="leading-tight">
                  <p className="text-sm font-black uppercase tracking-tight text-white">Royal PMS</p>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50">Plataforma de hotelaria</p>
                </div>
              </div>
              <p className="mt-5 max-w-sm text-sm leading-7 text-white/65">
                Sistema integrado para profissionalizar reservas, recepção, governança, manutenção, restaurante,
                eventos e financeiro.
              </p>
            </div>

            {footerLinks.map((column) => (
              <div key={column.title}>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-white/60">{column.title}</p>
                <ul className="mt-5 space-y-3 text-sm">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        target={link.external ? '_blank' : undefined}
                        rel={link.external ? 'noopener noreferrer' : undefined}
                        className="text-white/75 transition hover:text-white"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-white/10 pt-6 text-xs text-white/50 sm:flex-row sm:items-center">
            <p>© {new Date().getFullYear()} Royal PMS. Todos os direitos reservados.</p>
            <div className="flex flex-wrap gap-5">
              <a href="#" className="transition hover:text-white">Política de privacidade</a>
              <a href="#" className="transition hover:text-white">Termos de uso</a>
              <a href="#" className="transition hover:text-white">LGPD</a>
            </div>
          </div>
        </div>
      </footer>

      {/* LOGIN MODAL */}
      <AnimatePresence>
        {loginOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
            onClick={() => setLoginOpen(false)}
          >
            <div className="absolute inset-0 bg-stone-950/70 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setLoginOpen(false)}
                aria-label="Fechar"
                className="absolute -right-2 -top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-700 shadow-lg transition hover:bg-stone-50"
              >
                <X className="h-4 w-4" />
              </button>
              <Login embedded />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ============================================================
 * UI PREVIEWS — renderizadas com as mesmas classes Tailwind
 * dos componentes reais do sistema. Sao essencialmente um
 * "screenshot vivo" do PMS rodando.
 * ============================================================ */

function BrowserFrame({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[0_28px_90px_rgba(20,12,7,0.10)]">
      <div className="flex items-center gap-2 border-b border-stone-200 bg-stone-50 px-4 py-3">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        </div>
        <div className="ml-3 flex flex-1 items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-1 text-xs text-stone-500">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          {url}
        </div>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

function WorkQueuePreview() {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.24em] text-amber-600">Work Queue</p>
          <h3 className="mt-1 text-base font-black text-neutral-950">Fila de Manutenção</h3>
        </div>
        <button className="rounded-xl bg-neutral-950 px-3 py-1.5 text-[10px] font-black text-white">Nova tarefa</button>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        {[
          { icon: UsersRound, label: 'Ativas', value: '4' },
          { icon: AlertTriangle, label: 'Críticas', value: '1', danger: true },
          { icon: Send, label: 'Aguardando', value: '2' },
          { icon: Clock, label: 'SLA vencido', value: '0' },
        ].map((m) => (
          <div
            key={m.label}
            className={`rounded-xl border px-2 py-2 ${m.danger ? 'border-red-200 bg-red-50' : 'border-neutral-200 bg-neutral-50'}`}
          >
            <div className="flex items-center justify-between">
              <m.icon className={`h-3 w-3 ${m.danger ? 'text-red-700' : 'text-amber-700'}`} />
              <p className="text-sm font-black text-neutral-950">{m.value}</p>
            </div>
            <p className="mt-1 text-[8px] font-black uppercase tracking-[0.18em] text-neutral-400">{m.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 inline-flex rounded-xl border border-neutral-200 bg-neutral-50 p-1 text-[9px]">
        <span className="rounded-lg bg-neutral-950 px-2 py-1 font-black uppercase tracking-widest text-white">Ativas (3)</span>
        <span className="px-2 py-1 font-black uppercase tracking-widest text-neutral-500">Em andamento (1)</span>
        <span className="px-2 py-1 font-black uppercase tracking-widest text-neutral-500">Histórico</span>
      </div>

      <div className="mt-3 space-y-2">
        <div className="rounded-2xl border border-red-200 bg-red-50/70 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[8px] font-black uppercase text-red-700">URGENT</span>
            <span className="rounded-full bg-white px-1.5 py-0.5 text-[8px] font-black uppercase text-neutral-500">OPEN</span>
            <span className="rounded-full bg-white px-1.5 py-0.5 text-[8px] font-black uppercase text-neutral-500">RECEPÇÃO → MANUTENÇÃO</span>
          </div>
          <p className="mt-2 text-sm font-black text-neutral-950">Ar-condicionado UH 412</p>
          <p className="text-xs text-neutral-500">Sem ventilação fria. Hóspede aguardando.</p>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[8px] font-black uppercase text-amber-700">MEDIUM</span>
            <span className="rounded-full bg-white px-1.5 py-0.5 text-[8px] font-black uppercase text-neutral-500">OPEN</span>
            <span className="rounded-full bg-white px-1.5 py-0.5 text-[8px] font-black uppercase text-neutral-500">RESERVAS → MANUTENÇÃO</span>
          </div>
          <p className="mt-2 text-sm font-black text-neutral-950">Registro UH 507 quebrado</p>
        </div>
      </div>
    </div>
  );
}

function RoomMapPreview() {
  const rooms: Array<{ n: string; status: 'clean' | 'dirty' | 'occupied' | 'block' | 'inspect' }> = [
    { n: '301', status: 'clean' },
    { n: '302', status: 'occupied' },
    { n: '303', status: 'clean' },
    { n: '304', status: 'dirty' },
    { n: '305', status: 'occupied' },
    { n: '306', status: 'clean' },
    { n: '307', status: 'inspect' },
    { n: '308', status: 'occupied' },
    { n: '309', status: 'clean' },
    { n: '310', status: 'block' },
    { n: '311', status: 'dirty' },
    { n: '312', status: 'clean' },
    { n: '313', status: 'occupied' },
    { n: '314', status: 'occupied' },
    { n: '315', status: 'clean' },
    { n: '316', status: 'dirty' },
  ];
  const statusStyle = {
    clean: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    dirty: 'bg-amber-100 text-amber-800 border-amber-200',
    occupied: 'bg-blue-100 text-blue-800 border-blue-200',
    block: 'bg-red-100 text-red-800 border-red-200',
    inspect: 'bg-purple-100 text-purple-800 border-purple-200',
  };
  const labels = { clean: 'Limpo', dirty: 'Sujo', occupied: 'Ocupado', block: 'Bloqueado', inspect: 'Inspeção' };

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.24em] text-amber-600">Governança</p>
          <h3 className="mt-1 text-base font-black text-neutral-950">Mapa de UHs — andar 3</h3>
        </div>
        <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">81/108 ocupadas (75%)</p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[9px]">
        {(Object.entries(labels) as Array<[keyof typeof labels, string]>).map(([k, v]) => (
          <span key={k} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-black uppercase tracking-widest ${statusStyle[k]}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {v}
          </span>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-8 gap-1.5">
        {rooms.map((r) => (
          <div
            key={r.n}
            className={`flex flex-col items-center justify-center rounded-lg border px-1 py-2 ${statusStyle[r.status]}`}
          >
            <BedDouble className="h-3 w-3" />
            <p className="mt-1 text-[10px] font-black">{r.n}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReservationsPreview() {
  const rows = [
    { code: 'RES-2841', guest: 'Carlos Mendes', company: 'Petrobras', uh: '412', in: '24/04', out: '27/04', status: 'CONFIRMED' },
    { code: 'RES-2842', guest: 'Ana Beatriz', company: 'Reserva direta', uh: '305', in: '24/04', out: '26/04', status: 'CHECKED_IN' },
    { code: 'RES-2843', guest: 'Lucas Pereira', company: 'Halliburton', uh: '208', in: '25/04', out: '29/04', status: 'CONFIRMED' },
    { code: 'RES-2844', guest: 'Renata Costa', company: 'Booking.com', uh: '511', in: '26/04', out: '27/04', status: 'PENDING' },
  ];
  const statusStyle: Record<string, string> = {
    CONFIRMED: 'bg-emerald-100 text-emerald-800',
    CHECKED_IN: 'bg-blue-100 text-blue-800',
    PENDING: 'bg-amber-100 text-amber-800',
  };
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.24em] text-amber-600">Reservas</p>
          <h3 className="mt-1 text-base font-black text-neutral-950">Próximas chegadas</h3>
        </div>
        <button className="rounded-xl bg-amber-700 px-3 py-1.5 text-[10px] font-black text-white">Nova reserva</button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
          <p className="text-[9px] font-black uppercase tracking-widest text-neutral-500">Hoje</p>
          <p className="text-lg font-black text-neutral-950">17 IN</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
          <p className="text-[9px] font-black uppercase tracking-widest text-neutral-500">7 dias</p>
          <p className="text-lg font-black text-neutral-950">98 IN</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
          <p className="text-[9px] font-black uppercase tracking-widest text-neutral-500">Receita prevista</p>
          <p className="text-lg font-black text-neutral-950">R$ 142k</p>
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-neutral-200">
        <table className="w-full text-[10px]">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-2 py-1.5 text-left font-black uppercase tracking-widest">Reserva</th>
              <th className="px-2 py-1.5 text-left font-black uppercase tracking-widest">Hóspede</th>
              <th className="px-2 py-1.5 text-left font-black uppercase tracking-widest">UH</th>
              <th className="px-2 py-1.5 text-left font-black uppercase tracking-widest">Período</th>
              <th className="px-2 py-1.5 text-left font-black uppercase tracking-widest">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code} className="border-t border-neutral-100">
                <td className="px-2 py-1.5 font-black text-neutral-700">{r.code}</td>
                <td className="px-2 py-1.5">
                  <p className="font-bold text-neutral-900">{r.guest}</p>
                  <p className="text-neutral-500">{r.company}</p>
                </td>
                <td className="px-2 py-1.5 font-black">{r.uh}</td>
                <td className="px-2 py-1.5 text-neutral-600">{r.in} → {r.out}</td>
                <td className="px-2 py-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${statusStyle[r.status]}`}>{r.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DashboardPreview() {
  const bars = [42, 58, 71, 65, 82, 78, 84];
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.24em] text-amber-600">Gestão Pro</p>
          <h3 className="mt-1 text-base font-black text-neutral-950">Indicadores da operação</h3>
        </div>
        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">▲ 12% vs semana anterior</p>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        {[
          { l: 'Ocupação', v: '84%' },
          { l: 'ADR', v: 'R$ 286' },
          { l: 'RevPAR', v: 'R$ 240' },
          { l: 'No-show', v: '2%' },
        ].map((m) => (
          <div key={m.l} className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-neutral-500">{m.l}</p>
            <p className="mt-1 text-lg font-black text-neutral-950">{m.v}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-3">
        <p className="text-[9px] font-black uppercase tracking-widest text-neutral-500">Ocupação 7 dias</p>
        <div className="mt-3 flex h-24 items-end justify-between gap-2">
          {bars.map((h, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div className="w-full rounded-t-md bg-amber-700/90" style={{ height: `${h}%` }} />
              <p className="text-[8px] font-bold text-neutral-500">{['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'][i]}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-stone-950 bg-stone-950 p-3 text-white">
          <p className="text-[9px] font-black uppercase tracking-widest text-white/50">Receita do mês</p>
          <p className="mt-1 text-lg font-black">R$ 142,8k</p>
          <p className="text-[9px] text-emerald-300">▲ 8% vs anterior</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-neutral-500">Pendentes</p>
          <p className="mt-1 text-lg font-black text-neutral-950">R$ 18,4k</p>
          <p className="text-[9px] text-amber-700">12 títulos em aberto</p>
        </div>
      </div>
    </div>
  );
}

function BillingPreview() {
  const items = [
    { doc: 'NFS-e 8421', empresa: 'Petrobras', valor: 'R$ 4.280,00', status: 'PAID' },
    { doc: 'NFS-e 8422', empresa: 'Halliburton', valor: 'R$ 2.860,00', status: 'PAID' },
    { doc: 'NFS-e 8423', empresa: 'Schlumberger', valor: 'R$ 1.720,00', status: 'PENDING' },
    { doc: 'NFS-e 8424', empresa: 'Reserva direta', valor: 'R$ 980,00', status: 'PAID' },
    { doc: 'NFS-e 8425', empresa: 'Booking.com', valor: 'R$ 540,00', status: 'CANCELLED' },
  ];
  const styles: Record<string, string> = {
    PAID: 'bg-emerald-100 text-emerald-800',
    PENDING: 'bg-amber-100 text-amber-800',
    CANCELLED: 'bg-stone-200 text-stone-700',
  };
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.24em] text-amber-600">Faturamento</p>
          <h3 className="mt-1 text-base font-black text-neutral-950">Documentos emitidos — abril</h3>
        </div>
        <button className="rounded-xl bg-emerald-700 px-3 py-1.5 text-[10px] font-black text-white">Emitir NFS-e</button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-emerald-50 px-3 py-2">
          <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Recebido</p>
          <p className="text-lg font-black text-emerald-900">R$ 96,2k</p>
        </div>
        <div className="rounded-xl bg-amber-50 px-3 py-2">
          <p className="text-[9px] font-black uppercase tracking-widest text-amber-700">Em aberto</p>
          <p className="text-lg font-black text-amber-900">R$ 18,4k</p>
        </div>
        <div className="rounded-xl bg-stone-100 px-3 py-2">
          <p className="text-[9px] font-black uppercase tracking-widest text-stone-600">Cancelado</p>
          <p className="text-lg font-black text-stone-800">R$ 2,1k</p>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        {items.map((i) => (
          <div key={i.doc} className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[10px]">
            <div>
              <p className="font-black text-neutral-900">{i.doc}</p>
              <p className="text-neutral-500">{i.empresa}</p>
            </div>
            <div className="flex items-center gap-3">
              <p className="font-black text-neutral-900">{i.valor}</p>
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${styles[i.status]}`}>{i.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
