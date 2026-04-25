import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Building2,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  Hotel,
  Layers3,
  MessageCircle,
  Receipt,
  ShieldCheck,
  Sparkles,
  Users,
  Utensils,
  Wrench,
} from 'lucide-react';
import { motion } from 'motion/react';
import Login from './Login';
import PublicBookingEngine from './PublicBookingEngine';

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
      { label: 'Como funciona', href: '#como-funciona' },
      { label: 'Acessar plataforma', href: '#login' },
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
      { label: 'WhatsApp comercial', href: 'https://wa.me/5522999999999', external: true },
      { label: 'Suporte técnico', href: 'mailto:suporte@royalpms.com.br', external: true },
      { label: 'Macaé / RJ — Brasil', href: '#' },
    ],
  },
];

export default function MarketingLanding() {
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
            <a href="#como-funciona" className="transition hover:text-stone-950">Como funciona</a>
            <a href="#faq" className="transition hover:text-stone-950">Perguntas</a>
            <a href="#reservar" className="transition hover:text-stone-950">Para hóspedes</a>
            <a href="#login" className="transition hover:text-stone-950">Acessar</a>
          </nav>

          <a
            href="#demo"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-amber-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-amber-800"
          >
            Solicitar demonstração
            <ArrowRight className="h-4 w-4" />
          </a>
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
                <a
                  href="#modulos"
                  className="inline-flex min-h-12 items-center justify-center rounded-full border border-stone-300 bg-white px-6 text-sm font-semibold text-stone-800 transition hover:-translate-y-0.5 hover:border-stone-400"
                >
                  Conhecer os módulos
                </a>
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
              <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-[0_28px_90px_rgba(20,12,7,0.10)]">
                <div className="flex items-center justify-between gap-4">
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-stone-700">
                    Painel operacional
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Ao vivo
                  </span>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl bg-stone-950 p-5 text-white">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">Ocupação hoje</p>
                    <p className="mt-3 text-4xl font-black">84%</p>
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                      <div className="h-full w-[84%] rounded-full bg-amber-400" />
                    </div>
                    <p className="mt-3 text-xs leading-5 text-white/70">68 das 81 UHs ocupadas</p>
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 p-5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-500">Movimento do dia</p>
                    <div className="mt-3 space-y-2 text-sm text-stone-700">
                      <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2">
                        <span>Check-ins</span>
                        <strong>17</strong>
                      </div>
                      <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2">
                        <span>Check-outs</span>
                        <strong>13</strong>
                      </div>
                      <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2">
                        <span>Diária média</span>
                        <strong>R$ 286</strong>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-500">Atividade recente</p>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">Últimos 30min</p>
                  </div>
                  <div className="mt-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-1 h-2.5 w-2.5 rounded-full bg-amber-600" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-stone-900">UH 312 liberada para governança</p>
                        <p className="text-xs text-stone-500">há 2 min</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-600" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-stone-900">Pagamento da reserva #1842 conciliado</p>
                        <p className="text-xs text-stone-500">há 12 min</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="mt-1 h-2.5 w-2.5 rounded-full bg-sky-600" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-stone-900">Nova reserva (3 noites) — empresa Petrobras</p>
                        <p className="text-xs text-stone-500">há 18 min</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="absolute -bottom-4 -left-4 hidden rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-xl lg:block">
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
                  <Users className="h-4 w-4" />
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
                href="https://wa.me/5522999999999"
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
                  href="https://wa.me/5522999999999"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-amber-500 px-6 text-sm font-semibold text-stone-950 transition hover:-translate-y-0.5 hover:bg-amber-400"
                >
                  <MessageCircle className="h-4 w-4" />
                  Falar no WhatsApp
                </a>
                <a
                  href="#login"
                  className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/30 bg-white/10 px-6 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/20"
                >
                  Já tenho acesso — entrar
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* LOGIN */}
        <section id="login" className="border-b border-stone-100">
          <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_0.85fr] lg:items-center lg:px-8">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.3em] text-amber-700">Acessar plataforma</p>
              <h2 className="mt-4 text-3xl font-black leading-tight tracking-tight text-stone-950 sm:text-4xl">
                Entre com seu login operacional.
              </h2>
              <p className="mt-5 text-base leading-7 text-stone-600">
                Cada usuário entra direto no módulo da sua função — reservas, recepção, governança, financeiro,
                manutenção, eventos ou administração geral.
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                  <ShieldCheck className="h-5 w-5 text-amber-700" />
                  <p className="mt-2 text-sm font-bold text-stone-900">Permissões granulares</p>
                </div>
                <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <p className="mt-2 text-sm font-bold text-stone-900">Trilha de auditoria</p>
                </div>
                <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                  <Sparkles className="h-5 w-5 text-amber-700" />
                  <p className="mt-2 text-sm font-bold text-stone-900">Atualização contínua</p>
                </div>
              </div>
            </div>

            <div className="lg:justify-self-end">
              <Login embedded />
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
    </div>
  );
}
