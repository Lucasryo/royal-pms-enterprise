import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useInView, useMotionValue, useSpring } from 'motion/react';
import {
  AlertTriangle,
  BedDouble,
  Clock,
  Menu,
  Send,
  UsersRound,
  X,
} from 'lucide-react';
import Login from './Login';
import PublicBookingEngine from './PublicBookingEngine';

const WHATSAPP_NUMBER = '5522996105104';
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}`;

const navLinks = [
  { href: '#modulos', label: 'Módulos' },
  { href: '#telas', label: 'Telas do sistema' },
  { href: '#operacao', label: 'Operação' },
  { href: '#hospedes', label: 'Hóspedes' },
  { href: '#faq', label: 'Perguntas' },
];

const marqueeFeatures = [
  'RESERVAS',
  'RECEPÇÃO',
  'GOVERNANÇA',
  'MANUTENÇÃO',
  'RESTAURANTE & A&B',
  'EVENTOS',
  'FINANCEIRO',
  'AUDITORIA',
];

const modules = [
  { n: '01', title: 'Reservas', desc: 'Disponibilidade, tarifa, garantia e ocupação em um só fluxo — com bloqueios inteligentes.' },
  { n: '02', title: 'Recepção', desc: 'Check-in expresso, hóspedes acompanhantes, ficha nacional e leitura de documento.' },
  { n: '03', title: 'Governança', desc: 'Status de UH em tempo real, escalas de camareiras e checklist de limpeza.' },
  { n: '04', title: 'Manutenção', desc: 'Chamados por UH, prioridades, fotos, fila por setor e tempo médio de resolução.' },
  { n: '05', title: 'Restaurante & A&B', desc: 'Comandas, débito em conta, integração com o ponto de venda do hotel.' },
  { n: '06', title: 'Eventos', desc: 'Salões, propostas, contratos e produção — do orçamento ao faturamento.' },
  { n: '07', title: 'Financeiro', desc: 'Conciliação bancária, contas a pagar/receber, DRE por centro de custo.' },
  { n: '08', title: 'Auditoria', desc: 'Trilha completa, fechamento de caixa noturno e relatórios fiscais.' },
];

const moduleIcons: Record<string, ReactNode> = {
  '01': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
    </svg>
  ),
  '02': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M3 21v-2a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v2" strokeLinecap="round" />
      <circle cx="12" cy="8" r="4" />
    </svg>
  ),
  '03': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M3 7l9-4 9 4M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9" />
      <path d="M9 21V12h6v9" strokeLinecap="round" />
    </svg>
  ),
  '04': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-2.5z" />
    </svg>
  ),
  '05': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M4 3v18M4 8h6M10 3v18M14 3l2 5v13M16 8l4 0" strokeLinecap="round" />
    </svg>
  ),
  '06': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M5 21V8l7-5 7 5v13M9 21v-6h6v6" strokeLinecap="round" />
    </svg>
  ),
  '07': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M12 1v22M17 5H9a3 3 0 0 0 0 6h6a3 3 0 0 1 0 6H7" strokeLinecap="round" />
    </svg>
  ),
  '08': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M9 13l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

const steps = [
  { n: 'I', weeks: 'Semana 1', title: 'Diagnóstico operacional', desc: 'Mapeamos rotinas, gargalos por setor e indicadores que importam para a sua hotelaria.' },
  { n: 'II', weeks: 'Semanas 2–3', title: 'Implantação assistida', desc: 'Migração de dados, configuração de tarifários, treinamento por função e ambiente de homologação.' },
  { n: 'III', weeks: 'Semana 4', title: 'Go-live com supervisão', desc: 'Acompanhamento presencial nos primeiros check-ins, fechamentos e conciliações.' },
  { n: 'IV', weeks: 'A partir do mês 2', title: 'Operação contínua', desc: 'Suporte 24/7, atualizações mensais e revisão trimestral de indicadores com a gestão.' },
];

const faqs = [
  { q: 'Quanto tempo leva a implantação completa?', a: 'O cronograma é definido após o diagnóstico operacional e considera o porte do hotel, número de UHs e módulos ativados. Trabalhamos em fases — diagnóstico, configuração, treinamento e go-live assistido — para que a virada aconteça sem interromper a operação.' },
  { q: 'Vocês migram os dados do meu sistema atual?', a: 'Sim. Migramos cadastros de hóspedes, histórico de reservas, contas a pagar/receber em aberto e tarifários vigentes. Mantemos o sistema antigo em paralelo durante a primeira semana de operação para garantir uma transição segura.' },
  { q: 'Funciona com motor de reservas e channel manager?', a: 'Sim. A plataforma foi desenhada para operar integrada a channel managers e motores de reservas do mercado, mantendo disponibilidade e tarifa sincronizadas em tempo real.' },
  { q: 'Como funciona o suporte?', a: 'Suporte por WhatsApp, telefone e plataforma. Hotéis com operação 24/7 contam com canal prioritário e, no plano Enterprise, gerente de conta dedicado.' },
  { q: 'Os meus dados ficam seguros?', a: 'Toda a infraestrutura roda em nuvem brasileira, com backups criptografados, conformidade LGPD e trilha de auditoria completa de qualquer alteração feita por usuário.' },
];

const guestFeatures = [
  'Pré-check-in com leitura de documento e assinatura digital',
  'Conta consolidada (apartamento, A&B, eventos, frigobar)',
  'Pagamento por link, Pix, cartão ou faturamento corporativo',
  'Histórico de preferências mantido entre estadias',
];

/* ==========================================================
 * COUNTER (animated number)
 * ========================================================== */
function Counter({ to, prefix = '', suffix = '', decimals = 0 }: { to: number; prefix?: string; suffix?: string; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-20%' });
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { duration: 1800, bounce: 0 });

  useEffect(() => {
    if (inView) mv.set(to);
  }, [inView, mv, to]);

  useEffect(() => {
    return spring.on('change', (v) => {
      if (ref.current) ref.current.textContent = `${prefix}${v.toFixed(decimals).replace('.', ',')}${suffix}`;
    });
  }, [spring, prefix, suffix, decimals]);

  return <span ref={ref}>{prefix}0{suffix}</span>;
}

/* ==========================================================
 * MAIN COMPONENT
 * ========================================================== */
export default function MarketingLanding() {
  const [loginOpen, setLoginOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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

  useEffect(() => {
    if (window.location.hash === '#login') setLoginOpen(true);
  }, []);

  return (
    <div className="relative min-h-screen bg-paper font-sans text-ink antialiased">
      {/* HEADER */}
      <header
        className={`fixed inset-x-0 top-0 z-40 transition-all duration-500 ${
          scrolled ? 'border-b border-ink/10 bg-paper/85 backdrop-blur-xl' : 'bg-transparent'
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-10">
          <a href="#inicio" className="group flex items-center gap-2.5" onClick={() => setMobileMenuOpen(false)}>
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/15 bg-paper">
              <span className="font-display text-base italic leading-none text-ink">R</span>
            </div>
            <div className="leading-tight">
              <p className="font-display text-sm font-medium tracking-tight text-ink">Royal PMS</p>
              <p className="hidden text-[10px] uppercase tracking-[0.18em] text-stone-500 sm:block">Plataforma de hotelaria</p>
            </div>
          </a>

          <nav className="hidden items-center gap-7 md:flex">
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="group relative text-sm text-ink/80 transition-colors hover:text-ink"
              >
                {l.label}
                <span className="absolute -bottom-1 left-0 h-px w-0 bg-gold transition-all duration-300 group-hover:w-full" />
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setLoginOpen(true)}
              className="hidden text-sm text-ink/70 transition hover:text-ink md:inline"
            >
              Acessar
            </button>
            <a
              href="#demo"
              className="group hidden md:inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-all hover:gap-3 hover:bg-ink/90"
            >
              Ver demonstração
              <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
            </a>
            {/* Mobile: CTA + hamburger */}
            <a
              href="#demo"
              className="inline-flex md:hidden items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper"
            >
              Demonstração
            </a>
            <button
              onClick={() => setMobileMenuOpen((o) => !o)}
              className="flex md:hidden h-9 w-9 items-center justify-center rounded-full border border-ink/15 bg-paper/80 text-ink"
              aria-label="Menu"
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Mobile nav sheet */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden border-b border-ink/10 bg-paper/95 backdrop-blur-xl md:hidden"
            >
              <nav className="flex flex-col px-5 py-4 gap-1">
                {navLinks.map((l) => (
                  <a
                    key={l.href}
                    href={l.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="py-3 text-base font-medium text-ink/80 border-b border-ink/5 last:border-0 hover:text-ink transition-colors"
                  >
                    {l.label}
                  </a>
                ))}
                <button
                  onClick={() => { setMobileMenuOpen(false); setLoginOpen(true); }}
                  className="mt-3 w-full rounded-full border border-ink/20 py-3 text-sm font-medium text-ink/70 hover:bg-ink/5 transition"
                >
                  Já tenho acesso — entrar
                </button>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main>
        {/* HERO */}
        <section id="inicio" className="relative overflow-hidden pt-28 pb-16 sm:pt-32 sm:pb-24 lg:pt-40 lg:pb-32">
          {/* decorative serif R */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-10 right-[-20%] select-none font-display text-[18rem] leading-none text-ink/[0.025] sm:right-[-8%] sm:text-[28rem] lg:right-[5%]"
          >
            R
          </div>

          <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 sm:px-6 lg:grid-cols-12 lg:gap-10 lg:px-10">
            <div className="lg:col-span-6">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="inline-flex items-center gap-3 rounded-full border border-ink/10 bg-paper px-4 py-1.5"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-gold" />
                <span className="text-[11px] uppercase tracking-[0.22em] text-stone-500">
                  PMS para hotelaria independente
                </span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.1 }}
                className="mt-5 font-display text-4xl font-light leading-[1.02] tracking-[-0.02em] text-ink text-balance sm:mt-7 sm:text-5xl lg:text-[5.25rem]"
              >
                A operação do hotel,
                <br />
                <span className="italic text-ink/90">orquestrada</span>{' '}
                <span className="relative inline-block">
                  com método.
                  <svg
                    viewBox="0 0 300 12"
                    className="absolute -bottom-2 left-0 w-full text-gold"
                    preserveAspectRatio="none"
                  >
                    <path d="M2 8 C 80 2, 160 12, 298 4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
                  </svg>
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.25 }}
                className="mt-5 max-w-xl text-base leading-relaxed text-ink/70 text-pretty sm:mt-7 sm:text-lg"
              >
                Reservas, recepção, governança, manutenção, restaurante, eventos e financeiro em uma só plataforma —
                desenhada para meios de hospedagem que trocam improviso por padrão.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.4 }}
                className="mt-7 flex flex-wrap items-center gap-3 sm:mt-10 sm:gap-4"
              >
                <a
                  href="#demo"
                  className="group inline-flex items-center gap-3 rounded-full bg-ink px-7 py-4 text-sm font-medium text-paper transition-all hover:bg-ink/90"
                >
                  Solicitar demonstração
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gold text-ink transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </a>
                <button
                  onClick={() => setLoginOpen(true)}
                  className="group inline-flex items-center gap-2 px-2 py-3 text-sm font-medium text-ink"
                >
                  <span className="border-b border-ink/30 pb-0.5 transition group-hover:border-ink">
                    Já tenho acesso
                  </span>
                </button>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.6 }}
                className="mt-8 grid max-w-md grid-cols-3 gap-4 border-t border-ink/10 pt-5 text-xs sm:mt-12 sm:gap-6 sm:pt-6"
              >
                <div>
                  <p className="font-display text-2xl font-light text-ink">100%</p>
                  <p className="mt-1 uppercase tracking-[0.16em] text-stone-500">web · sem instalação</p>
                </div>
                <div>
                  <p className="font-display text-2xl font-light text-ink">24/7</p>
                  <p className="mt-1 uppercase tracking-[0.16em] text-stone-500">operação contínua</p>
                </div>
                <div>
                  <p className="font-display text-2xl font-light text-ink">LGPD</p>
                  <p className="mt-1 uppercase tracking-[0.16em] text-stone-500">dados em conformidade</p>
                </div>
              </motion.div>
            </div>

            <div className="lg:col-span-6">
              <HeroPanel />
            </div>
          </div>
        </section>

        {/* MARQUEE */}
        <section className="relative border-y border-ink/10 bg-paper py-8">
          <div className="mx-auto mb-5 max-w-7xl px-6 lg:px-10">
            <p className="text-center text-[11px] uppercase tracking-[0.28em] text-stone-500">
              Uma plataforma · toda a operação do hotel
            </p>
          </div>
          <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
            <div className="flex w-max animate-marquee gap-16 whitespace-nowrap">
              {[...marqueeFeatures, ...marqueeFeatures].map((l, i) => (
                <span key={i} className="font-display text-lg italic tracking-[0.18em] text-ink/60">
                  · {l}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* MODULES */}
        <section id="modulos" className="relative py-16 sm:py-24 lg:py-36">
          <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
            <div className="grid gap-8 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <p className="text-[11px] uppercase tracking-[0.28em] text-stone-500">· Módulos do sistema</p>
                <h2 className="mt-4 font-display text-3xl font-light leading-[1.05] tracking-[-0.02em] text-ink text-balance sm:mt-5 sm:text-4xl lg:text-6xl">
                  Toda a operação do hotel em uma <span className="italic">plataforma única.</span>
                </h2>
              </div>
              <p className="text-sm leading-relaxed text-ink/70 text-pretty sm:text-base lg:col-span-6 lg:col-start-7 lg:mt-3">
                Cada módulo é especializado para a função que executa, mas todos compartilham a mesma base de dados —
                evitando retrabalho e divergências entre setores. Ative apenas o que faz sentido para o seu meio de hospedagem.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-ink/10 bg-ink/10 sm:grid-cols-2 sm:mt-16 sm:rounded-3xl lg:grid-cols-4">
              {modules.map((m, i) => (
                <motion.article
                  key={m.n}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-10%' }}
                  transition={{ duration: 0.5, delay: (i % 4) * 0.07 }}
                  className="group relative flex flex-col bg-paper p-5 sm:p-8 transition-colors duration-500 hover:bg-white"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display text-sm tracking-[0.2em] text-stone-500/80">{m.n}</span>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 text-ink/80 transition-all duration-500 group-hover:border-gold group-hover:bg-gold group-hover:text-ink">
                      <div className="h-5 w-5">{moduleIcons[m.n]}</div>
                    </div>
                  </div>
                  <h3 className="mt-6 font-display text-xl font-medium text-ink sm:mt-10 sm:text-2xl">{m.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-ink/65 text-pretty">{m.desc}</p>
                  <div className="mt-5 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-ink/60 transition-colors group-hover:text-ink sm:mt-8">
                    Detalhes
                    <span className="transition-transform group-hover:translate-x-1">→</span>
                  </div>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        {/* TELAS DO SISTEMA */}
        <section id="telas" className="relative bg-paper py-16 sm:py-24 lg:py-36">
          <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
            <div className="grid gap-8 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <p className="text-[11px] uppercase tracking-[0.28em] text-stone-500">· Telas do sistema</p>
                <h2 className="mt-4 font-display text-3xl font-light leading-[1.05] tracking-[-0.02em] text-ink text-balance sm:mt-5 sm:text-4xl lg:text-6xl">
                  Veja o Royal PMS <span className="italic">em ação.</span>
                </h2>
              </div>
              <p className="text-sm leading-relaxed text-ink/70 text-pretty sm:text-base lg:col-span-6 lg:col-start-7 lg:mt-3">
                Interfaces reais de quem trabalha no chão da operação — sem ruído, sem cliques perdidos. Quatro telas
                que ilustram o dia a dia: chamados de manutenção, mapa de UHs, central de reservas e indicadores
                gerenciais.
              </p>
            </div>

            <div className="mt-10 grid gap-8 sm:mt-16 sm:gap-10 lg:grid-cols-2">
              {[
                { url: 'royalpms.app/manutencao', title: 'Fila de chamados', desc: 'Tarefas com priorização, direcionamento por colaborador e SLA visível para a recepção e governança.', preview: <WorkQueuePreview /> },
                { url: 'royalpms.app/recepcao', title: 'Mapa operacional de UHs', desc: 'Status de limpeza, ocupação e bloqueio em uma visão única. Recepção e governança com a mesma fonte.', preview: <RoomMapPreview /> },
                { url: 'royalpms.app/reservas', title: 'Central de reservas', desc: 'Disponibilidade, garantias, empresas e canais em um fluxo único de criação e alteração.', preview: <ReservationsPreview /> },
                { url: 'royalpms.app/admin', title: 'Indicadores da gestão', desc: 'Ocupação, ADR, RevPAR e receita acumulada em tempo real para decisão rápida.', preview: <DashboardPreview /> },
              ].map((s, i) => (
                <motion.div
                  key={s.url}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-10%' }}
                  transition={{ duration: 0.6, delay: (i % 2) * 0.12 }}
                >
                  <BrowserFrame url={s.url}>{s.preview}</BrowserFrame>
                  <div className="mt-5 flex items-baseline gap-4">
                    <span className="font-display text-sm tracking-[0.2em] text-stone-500/70">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <h3 className="font-display text-xl font-medium text-ink">{s.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-ink/65 text-pretty">{s.desc}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="operacao" className="relative bg-ink py-16 text-paper sm:py-24 lg:py-36">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                'radial-gradient(circle at 20% 0%, oklch(0.72 0.12 75) 0%, transparent 40%), radial-gradient(circle at 90% 100%, oklch(0.36 0.04 145) 0%, transparent 50%)',
            }}
          />
          <div className="relative mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
            <div className="max-w-3xl">
              <p className="text-[11px] uppercase tracking-[0.28em] text-paper/50">· Como implantamos</p>
              <h2 className="mt-4 font-display text-3xl font-light leading-[1.05] tracking-[-0.02em] text-balance sm:mt-5 sm:text-4xl lg:text-6xl">
                Do <span className="italic text-gold">caderno de turno</span> a decisões em tempo real — em quatro etapas.
              </h2>
            </div>

            <div className="mt-12 grid gap-px bg-paper/10 grid-cols-1 sm:grid-cols-2 sm:mt-16 lg:grid-cols-4 lg:mt-20">
              {steps.map((s, i) => (
                <motion.div
                  key={s.n}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-10%' }}
                  transition={{ duration: 0.6, delay: i * 0.1 }}
                  className="relative bg-ink p-6 sm:p-8 lg:p-10"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-display text-4xl font-light italic text-gold sm:text-5xl">{s.n}</span>
                    <span className="text-[10px] uppercase tracking-[0.22em] text-paper/40">{s.weeks}</span>
                  </div>
                  <h3 className="mt-6 font-display text-lg font-medium leading-tight text-paper sm:mt-8 sm:text-xl">{s.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-paper/65 text-pretty">{s.desc}</p>
                </motion.div>
              ))}
            </div>

            <div className="mt-12 grid gap-8 border-t border-paper/15 pt-10 sm:mt-20 sm:gap-10 sm:pt-12 sm:grid-cols-3">
              <div>
                <p className="font-display text-4xl font-light text-paper sm:text-5xl">
                  <span className="text-gold">×</span> 0
                </p>
                <p className="mt-2 text-sm text-paper/60">Servidores locais para gerenciar — tudo na nuvem.</p>
              </div>
              <div>
                <p className="font-display text-4xl font-light text-paper sm:text-5xl">100%</p>
                <p className="mt-2 text-sm text-paper/60">Acesso via navegador — qualquer dispositivo, em qualquer lugar.</p>
              </div>
              <div>
                <p className="font-display text-4xl font-light text-paper sm:text-5xl">LGPD</p>
                <p className="mt-2 text-sm text-paper/60">Infraestrutura em nuvem brasileira, com backups criptografados.</p>
              </div>
            </div>
          </div>
        </section>

        {/* GUESTS / BOOKING */}
        <section id="hospedes" className="relative py-16 sm:py-24 lg:py-36">
          <div className="mx-auto grid max-w-7xl items-start gap-10 px-5 sm:px-6 sm:gap-16 lg:grid-cols-12 lg:gap-12 lg:px-10">
            <div className="lg:col-span-5">
              <p className="text-[11px] uppercase tracking-[0.28em] text-stone-500">· Para hóspedes</p>
              <h2 className="mt-4 font-display text-3xl font-light leading-[1.05] tracking-[-0.02em] text-ink text-balance sm:mt-5 sm:text-4xl lg:text-[3.5rem]">
                A discrição da hotelaria fina, <span className="italic">com a fluidez do digital.</span>
              </h2>
              <p className="mt-5 max-w-md text-sm leading-relaxed text-ink/70 text-pretty sm:mt-6 sm:text-base">
                Pré-check-in pelo celular, conta sempre atualizada, comandas do restaurante assinadas no quarto e
                pagamento em um toque. O hóspede sente serviço — não sistema.
              </p>

              <ul className="mt-7 space-y-4 sm:mt-10 sm:space-y-5">
                {guestFeatures.map((t) => (
                  <li key={t} className="flex items-start gap-3">
                    <span className="mt-2 h-px w-5 shrink-0 bg-gold sm:w-6" />
                    <span className="text-sm text-ink/80 sm:text-base">{t}</span>
                  </li>
                ))}
              </ul>

              <p className="mt-7 font-display text-sm italic text-ink/70 sm:mt-10 sm:text-base">
                "Hóspede do Royal Macaé Palace? Reserve direto no formulário ao lado e ganhe a melhor tarifa, sem intermediário."
              </p>
            </div>

            <div className="relative lg:col-span-7">
              <div className="absolute -inset-8 -z-10 rounded-full bg-gold/15 blur-3xl sm:-inset-12" />
              <div className="rounded-2xl border border-ink/10 bg-paper p-4 shadow-[0_30px_80px_-30px_rgba(20,15,10,0.25)] sm:rounded-[2rem] sm:p-6 md:p-8">
                <PublicBookingEngine />
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="relative py-16 sm:py-24 lg:py-36">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-6 sm:gap-16 lg:grid-cols-12 lg:gap-12 lg:px-10">
            <div className="lg:col-span-4">
              <p className="text-[11px] uppercase tracking-[0.28em] text-stone-500">· Perguntas frequentes</p>
              <h2 className="mt-4 font-display text-3xl font-light leading-[1.05] tracking-[-0.02em] text-ink text-balance sm:mt-5 sm:text-4xl lg:text-5xl">
                Antes de marcar a <span className="italic">demonstração.</span>
              </h2>
              <p className="mt-5 text-sm text-ink/65 text-pretty sm:mt-6 sm:text-base">
                Não encontrou o que procurava? Fale direto com a nossa equipe comercial.
              </p>
              <a
                href={WHATSAPP_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex items-center gap-2 border-b border-ink/30 pb-1 text-sm font-medium text-ink hover:border-ink sm:mt-6"
              >
                Conversar pelo WhatsApp →
              </a>
            </div>

            <div className="divide-y divide-ink/10 border-y border-ink/10 lg:col-span-8">
              {faqs.map((f, i) => {
                const isOpen = openFaq === i;
                return (
                  <div key={i}>
                    <button
                      onClick={() => setOpenFaq(isOpen ? null : i)}
                      className="group flex w-full items-center justify-between gap-4 py-5 text-left sm:gap-6 sm:py-6"
                    >
                      <span className="flex items-baseline gap-3 sm:gap-5">
                        <span className="hidden font-display text-sm tracking-[0.2em] text-stone-500/70 sm:inline">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="font-display text-base font-medium text-ink sm:text-xl md:text-2xl">{f.q}</span>
                      </span>
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ink/15 transition-all sm:h-9 sm:w-9 ${
                          isOpen ? 'rotate-45 bg-ink text-paper' : 'text-ink/60'
                        }`}
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                        </svg>
                      </span>
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                          className="overflow-hidden"
                        >
                          <p className="max-w-2xl pb-6 pl-0 text-sm text-ink/70 text-pretty sm:pl-12 sm:text-base sm:pb-7">{f.a}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* DEMO CTA */}
        <section id="demo" className="relative overflow-hidden py-16 sm:py-24 lg:py-36">
          <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
            <div className="relative overflow-hidden rounded-2xl bg-ink p-6 text-paper sm:rounded-[2rem] sm:p-10 md:p-14 lg:p-20">
              <div aria-hidden className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-gold/25 blur-3xl" />
              <div aria-hidden className="absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-moss/30 blur-3xl" />

              <div className="relative grid gap-10 lg:grid-cols-12 lg:gap-12">
                <div className="lg:col-span-7">
                  <p className="text-[11px] uppercase tracking-[0.28em] text-paper/50">· Solicitar demonstração</p>
                  <h2 className="mt-4 font-display text-3xl font-light leading-[1.04] tracking-[-0.02em] text-balance sm:mt-5 sm:text-4xl lg:text-[3.5rem]">
                    Veja o Royal PMS <span className="italic text-gold">no seu cenário.</span>
                  </h2>
                  <p className="mt-5 max-w-md text-sm text-paper/70 text-pretty sm:mt-6 sm:text-base">
                    30 minutos, ao vivo, com um especialista em hotelaria. Sem apresentação comercial genérica —
                    abrimos o sistema e simulamos a sua operação.
                  </p>

                  <ul className="mt-7 space-y-3 text-sm text-paper/75 sm:mt-10">
                    {['Demonstração personalizada por porte do hotel', 'Proposta de implantação com prazo definido', 'Sem compromisso de contratação'].map((t) => (
                      <li key={t} className="flex items-center gap-3">
                        <span className="h-1 w-1 shrink-0 rounded-full bg-gold" />
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="lg:col-span-5">
                  <div className="rounded-2xl border border-paper/15 bg-paper/5 p-5 backdrop-blur sm:p-8">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-paper/55">· Fale com o time comercial</p>
                    <p className="mt-3 font-display text-2xl text-paper">Atendemos pelo WhatsApp.</p>
                    <p className="mt-2 text-sm text-paper/65">
                      Resposta em até 1 dia útil. Apresentamos o sistema, mapeamos a sua operação e enviamos uma proposta
                      personalizada.
                    </p>
                    <a
                      href={WHATSAPP_LINK}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group mt-7 flex w-full items-center justify-between rounded-full bg-gold px-7 py-4 text-sm font-medium text-ink transition hover:bg-gold-soft"
                    >
                      <span className="flex items-center gap-2">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                        </svg>
                        Falar no WhatsApp
                      </span>
                      <span className="transition-transform group-hover:translate-x-1">→</span>
                    </a>
                    <button
                      onClick={() => setLoginOpen(true)}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-paper/25 bg-paper/0 px-7 py-3.5 text-sm font-medium text-paper transition hover:bg-paper/10"
                    >
                      Já tenho acesso — entrar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-ink/10 bg-paper">
        <div className="mx-auto max-w-7xl px-5 py-12 sm:px-6 sm:py-16 lg:px-10">
          <div className="grid gap-10 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/15">
                  <span className="font-display text-lg italic text-ink">R</span>
                </div>
                <div>
                  <p className="font-display text-base text-ink">Royal PMS</p>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Plataforma de hotelaria</p>
                </div>
              </div>
              <p className="mt-5 max-w-sm text-sm leading-relaxed text-ink/65 text-pretty">
                Software para hotéis e pousadas que valorizam padrão, discrição e uma operação realmente integrada — do
                check-in ao fechamento.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 sm:gap-10 lg:col-span-7">
              <FCol title="Plataforma" items={[{ l: 'Módulos', h: '#modulos' }, { l: 'Telas do sistema', h: '#telas' }, { l: 'Como funciona', h: '#operacao' }, { l: 'Para hóspedes', h: '#hospedes' }]} />
              <FCol title="Empresa" items={[{ l: 'Royal Macaé Palace', h: 'https://royalmacaepalace.com.br', external: true }, { l: 'Reservar hospedagem', h: '#hospedes' }, { l: 'Solicitar demonstração', h: '#demo' }]} />
              <FCol title="Contato" items={[{ l: 'WhatsApp comercial', h: WHATSAPP_LINK, external: true }, { l: 'Macaé / RJ — Brasil', h: '#' }]} />
            </div>
          </div>

          <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-ink/10 pt-8 text-xs text-stone-500 sm:flex-row sm:items-center sm:mt-16">
            <p>© {new Date().getFullYear()} Royal PMS — Brasil</p>
            <p className="font-display italic">"Hospitalidade é detalhe."</p>
          </div>
        </div>
      </footer>

      {/* LOGIN MODAL — slides from bottom on mobile, centered on desktop */}
      <AnimatePresence>
        {loginOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:px-4 sm:py-6"
            onClick={() => setLoginOpen(false)}
          >
            <div className="absolute inset-0 bg-ink/70 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, y: '100%' }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="relative w-full max-w-md rounded-t-3xl sm:rounded-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setLoginOpen(false)}
                aria-label="Fechar"
                className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-ink/15 bg-paper text-ink shadow-lg transition hover:bg-white"
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

function FCol({ title, items }: { title: string; items: Array<{ l: string; h: string; external?: boolean }> }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.22em] text-stone-500">{title}</p>
      <ul className="mt-5 space-y-3">
        {items.map((i) => (
          <li key={i.l}>
            <a
              href={i.h}
              target={i.external ? '_blank' : undefined}
              rel={i.external ? 'noopener noreferrer' : undefined}
              className="text-sm text-ink/75 transition hover:text-ink"
            >
              {i.l}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ==========================================================
 * HERO PANEL — Lovable-style editorial dashboard
 * ========================================================== */
function HeroPanel() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
      className="relative"
    >
      <div className="absolute -inset-10 -z-10 rounded-[3rem] bg-gradient-to-br from-gold/30 via-transparent to-moss/10 blur-3xl" />

      <div className="relative overflow-hidden rounded-3xl border border-ink/10 bg-white shadow-[0_30px_80px_-30px_rgba(20,15,10,0.25)]">
        <div className="flex items-center justify-between border-b border-ink/10 bg-paper/60 px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-ink/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-ink/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-ink/15" />
            <span className="ml-3 text-[10px] uppercase tracking-[0.2em] text-stone-500">royalpms.app / painel</span>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-moss/10 px-3 py-1">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-moss/60 animate-pulse-dot" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-moss" />
            </span>
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-moss">ao vivo</span>
          </div>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-5 sm:p-6">
          <div className="relative overflow-hidden rounded-2xl bg-ink p-6 text-paper sm:col-span-2 sm:row-span-2">
            <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gold/25 blur-2xl" />
            <p className="text-[10px] uppercase tracking-[0.22em] text-paper/50">Ocupação · hoje</p>
            <p className="mt-4 font-display text-6xl font-light tracking-tight">
              <Counter to={84} suffix="%" />
            </p>
            <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-paper/10">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: '84%' }}
                transition={{ duration: 1.4, delay: 0.6, ease: 'easeOut' }}
                className="h-full rounded-full bg-gradient-to-r from-gold to-gold-soft"
              />
            </div>
            <p className="mt-3 text-xs text-paper/60">68 das 81 UHs ocupadas</p>

            <div className="mt-8 grid grid-cols-7 gap-1">
              {Array.from({ length: 28 }).map((_, i) => (
                <div
                  key={i}
                  className={`h-6 rounded-[3px] ${
                    [0, 3, 5, 7, 9, 12, 13, 15, 18, 19, 22, 24, 25, 27].includes(i) ? 'bg-gold' : 'bg-paper/10'
                  }`}
                />
              ))}
            </div>
            <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-paper/40">mapa do andar 3</p>
          </div>

          <div className="rounded-2xl border border-ink/10 bg-paper/40 p-5 sm:col-span-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-stone-500">Movimento do dia</p>
            <div className="mt-4 grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-stone-500">Check-ins</p>
                <p className="font-display text-3xl font-light text-ink"><Counter to={17} /></p>
              </div>
              <div>
                <p className="text-xs text-stone-500">Check-outs</p>
                <p className="font-display text-3xl font-light text-ink"><Counter to={13} /></p>
              </div>
              <div>
                <p className="text-xs text-stone-500">Diária média</p>
                <p className="font-display text-3xl font-light text-ink">R$<Counter to={286} /></p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-ink/10 bg-paper/40 p-5 sm:col-span-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-[0.22em] text-stone-500">Atividade recente</p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500/70">últimos 30 min</p>
            </div>
            <ul className="mt-4 space-y-3 text-sm">
              {[
                { dot: 'bg-gold', text: 'UH 312 liberada para governança', t: 'há 2 min' },
                { dot: 'bg-moss', text: 'Pagamento da reserva #1842 conciliado', t: 'há 12 min' },
                { dot: 'bg-ink', text: 'Nova reserva (3 noites) registrada', t: 'há 18 min' },
              ].map((a, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.8 + i * 0.15, duration: 0.5 }}
                  className="flex items-start gap-3"
                >
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${a.dot}`} />
                  <p className="flex-1 text-ink/85">{a.text}</p>
                  <span className="text-[10px] uppercase tracking-wider text-stone-500/70">{a.t}</span>
                </motion.li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 1.1, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="absolute -bottom-8 -left-6 hidden w-64 rounded-2xl border border-ink/10 bg-white p-4 shadow-2xl sm:block"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-moss/10 text-moss">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M3 12h4l3-9 4 18 3-9h4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Faturamento</p>
            <p className="font-display text-xl font-medium text-ink">R$ 142,8 mil</p>
            <p className="text-[10px] text-stone-500">acumulado do mês</p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ============================================================
 * UI PREVIEWS — telas do sistema (BrowserFrame)
 * ============================================================ */

function BrowserFrame({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-[0_30px_80px_-30px_rgba(20,15,10,0.25)]">
      <div className="flex items-center gap-2 border-b border-ink/10 bg-paper/60 px-4 py-3">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-ink/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-ink/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-ink/15" />
        </div>
        <div className="ml-3 flex flex-1 items-center gap-2 rounded-lg border border-ink/10 bg-white px-3 py-1 text-xs text-stone-500">
          <span className="h-2 w-2 rounded-full bg-moss" />
          <span className="font-mono text-[10px] uppercase tracking-widest">{url}</span>
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
    { n: '301', status: 'clean' }, { n: '302', status: 'occupied' }, { n: '303', status: 'clean' },
    { n: '304', status: 'dirty' }, { n: '305', status: 'occupied' }, { n: '306', status: 'clean' },
    { n: '307', status: 'inspect' }, { n: '308', status: 'occupied' }, { n: '309', status: 'clean' },
    { n: '310', status: 'block' }, { n: '311', status: 'dirty' }, { n: '312', status: 'clean' },
    { n: '313', status: 'occupied' }, { n: '314', status: 'occupied' }, { n: '315', status: 'clean' },
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
          <div key={r.n} className={`flex flex-col items-center justify-center rounded-lg border px-1 py-2 ${statusStyle[r.status]}`}>
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
