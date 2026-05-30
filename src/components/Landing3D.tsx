import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { Check, Menu, X, ArrowRight } from 'lucide-react';
import Login from './Login';

/* ============================================================
 * Royal PMS — Landing editorial com profundidade 3D (perfomática)
 *  - CSS 3D (perspective + rotateX/Y + translateZ) para profundidade
 *  - motion values + spring para parallax SEM re-render do React
 *  - mockups densos, com tipografia e dados reais do produto
 * ============================================================ */

const WHATSAPP_NUMBER = '5522996105104';
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}`;

const navLinks = [
  { href: '#telas',    label: 'Telas do sistema' },
  { href: '#modulos',  label: 'Módulos' },
  { href: '#operacao', label: 'Operação' },
  { href: '#contato',  label: 'Contato' },
];

/* ============================================================
 * Hook: parallax de mouse usando motion values (zero React state)
 * ============================================================ */
function useMouseParallax(strength = 12) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 80, damping: 18, mass: 0.6 });
  const sy = useSpring(y, { stiffness: 80, damping: 18, mass: 0.6 });
  const rx = useTransform(sy, [-1, 1], [strength, -strength]);
  const ry = useTransform(sx, [-1, 1], [-strength, strength]);

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let pending: { cx: number; cy: number } | null = null;
    const apply = () => {
      raf = 0;
      if (!pending) return;
      const r = el.getBoundingClientRect();
      const nx = ((pending.cx - r.left) / r.width)  * 2 - 1;
      const ny = ((pending.cy - r.top)  / r.height) * 2 - 1;
      x.set(Math.max(-1, Math.min(1, nx)));
      y.set(Math.max(-1, Math.min(1, ny)));
      pending = null;
    };
    const onMove = (e: PointerEvent) => {
      pending = { cx: e.clientX, cy: e.clientY };
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onLeave = () => { x.set(0); y.set(0); };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [x, y]);

  return { ref, rx, ry, sx, sy };
}

/* ============================================================
 * Browser frame editorial — moldura usada nos mockups
 * ============================================================ */
function Frame({ url, children, dark, className }: { url: string; children: ReactNode; dark?: boolean; className?: string }) {
  return (
    <div
      className={`crisp-3d overflow-hidden rounded-2xl border-2 ${
        dark ? 'border-paper/15 bg-ink' : 'border-ink/15 bg-white'
      } shadow-[0_50px_120px_-30px_rgba(20,15,10,0.55),_0_8px_24px_-12px_rgba(20,15,10,0.25)] ring-1 ring-inset ${
        dark ? 'ring-paper/5' : 'ring-ink/[0.03]'
      } ${className ?? ''}`}
    >
      <div
        className={`flex items-center justify-between border-b-2 px-5 py-3 ${
          dark
            ? 'border-paper/10 bg-gradient-to-b from-ink to-[oklch(0.13_0.012_60)]'
            : 'border-ink/10 bg-gradient-to-b from-paper to-[oklch(0.96_0.012_85)]'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className={`h-3 w-3 rounded-full ${dark ? 'bg-paper/20' : 'bg-red-400/80'}`} />
          <span className={`h-3 w-3 rounded-full ${dark ? 'bg-paper/20' : 'bg-amber-400/80'}`} />
          <span className={`h-3 w-3 rounded-full ${dark ? 'bg-paper/20' : 'bg-emerald-400/80'}`} />
        </div>
        <span
          className={`rounded-full px-3 py-0.5 text-xs font-medium tracking-[0.04em] ${
            dark ? 'bg-paper/8 text-paper/70' : 'bg-ink/5 text-ink/70'
          }`}
        >
          {url}
        </span>
        <span className="w-14" />
      </div>
      {children}
    </div>
  );
}

/* ============================================================
 * 1. DASHBOARD — tela principal da hero
 * ============================================================ */
function DashboardScreen() {
  const bars = [40, 62, 48, 78, 65, 88, 70, 92, 60, 85, 76, 95];
  const spark = [10, 24, 18, 30, 22, 36, 42, 38, 52, 48, 60, 58, 68, 64, 72];
  const spPath = spark
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${i * (260 / (spark.length - 1))} ${72 - (v / 80) * 60}`)
    .join(' ');

  return (
    <Frame url="royalpms.app · painel" dark>
      <div className="p-5 text-paper sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-paper/45">Painel · Hotel Boutique</p>
            <p className="mt-1 font-display text-xl font-light">Quarta · 18 mai · 14h22</p>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-paper/8 px-3 py-1">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse-dot" />
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-paper/70">ao vivo</span>
          </div>
        </div>

        {/* KPI principal */}
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-paper/[0.04] p-4 ring-1 ring-paper/10">
            <p className="text-xs uppercase tracking-[0.2em] text-paper/45">Ocupação</p>
            <p className="mt-1 font-display text-3xl font-light">84%</p>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-paper/10">
              <div className="h-full w-[84%] rounded-full bg-gradient-to-r from-gold to-gold-soft" />
            </div>
            <p className="mt-1.5 text-xs text-paper/55">68 / 81 UHs</p>
          </div>
          <div className="rounded-xl bg-paper/[0.04] p-4 ring-1 ring-paper/10">
            <p className="text-xs uppercase tracking-[0.2em] text-paper/45">ADR</p>
            <p className="mt-1 font-display text-3xl font-light">R$ 286</p>
            <p className="mt-2.5 text-xs text-emerald-300/90">▲ 4,2% vs semana</p>
          </div>
          <div className="rounded-xl bg-paper/[0.04] p-4 ring-1 ring-paper/10">
            <p className="text-xs uppercase tracking-[0.2em] text-paper/45">RevPAR</p>
            <p className="mt-1 font-display text-3xl font-light">R$ 240</p>
            <p className="mt-2.5 text-xs text-emerald-300/90">▲ 6,8% vs semana</p>
          </div>
        </div>

        {/* Gráfico de barras */}
        <div className="mt-5 rounded-xl bg-paper/[0.04] p-4 ring-1 ring-paper/10">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.2em] text-paper/45">Receita diária · últimos 12 dias</p>
            <p className="text-xs text-paper/55">R$ 142,8 mil acum.</p>
          </div>
          <div className="mt-4 flex h-24 items-end gap-1.5">
            {bars.map((h, i) => (
              <div
                key={i}
                className={`flex-1 rounded-sm ${i === bars.length - 1 ? 'bg-gold' : 'bg-paper/25'}`}
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>

        {/* Sparkline + atividade */}
        <div className="mt-3 grid gap-3 sm:grid-cols-5">
          <div className="rounded-xl bg-paper/[0.04] p-4 ring-1 ring-paper/10 sm:col-span-2">
            <p className="text-xs uppercase tracking-[0.2em] text-paper/45">Tendência ADR · 15d</p>
            <svg viewBox="0 0 260 80" className="mt-2 w-full">
              <defs>
                <linearGradient id="spg" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.72 0.12 75)" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="oklch(0.72 0.12 75)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={`${spPath} L 260 72 L 0 72 Z`} fill="url(#spg)" />
              <path d={spPath} stroke="oklch(0.72 0.12 75)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </svg>
          </div>
          <div className="rounded-xl bg-paper/[0.04] p-4 ring-1 ring-paper/10 sm:col-span-3">
            <p className="text-xs uppercase tracking-[0.2em] text-paper/45">Atividade recente</p>
            <ul className="mt-3 space-y-2 text-xs">
              {[
                ['bg-gold',    'UH 312 liberada para governança',     'há 2 min'],
                ['bg-emerald-400', 'Pagamento reserva #1842 conciliado', 'há 12 min'],
                ['bg-paper/60','Nova reserva (3 noites) registrada',   'há 18 min'],
              ].map(([dot, t, ts], i) => (
                <li key={i} className="flex items-center gap-2.5">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
                  <span className="flex-1 truncate text-paper/85">{t}</span>
                  <span className="text-xs text-paper/45">{ts}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Frame>
  );
}

/* ============================================================
 * 2. RATES CALENDAR — telão de reservas/tarifas
 * ============================================================ */
function RatesScreen() {
  const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const cells = Array.from({ length: 28 }, (_, i) => {
    const occ = [88, 70, 65, 80, 92, 100, 100, 60, 55, 70, 78, 85, 95, 100, 50, 48, 60, 72, 80, 90, 95, 45, 42, 58, 68, 75, 88, 92][i];
    const rate = 240 + Math.round(occ * 1.6);
    return { occ, rate };
  });

  const heat = (o: number) =>
    o >= 90 ? 'bg-ink text-paper'
    : o >= 75 ? 'bg-gold/80 text-ink'
    : o >= 60 ? 'bg-gold/40 text-ink'
    : 'bg-paper text-ink/70 ring-1 ring-ink/10';

  return (
    <Frame url="royalpms.app · reservas / tarifas">
      <div className="p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Tarifário · Maio</p>
            <p className="mt-1 font-display text-xl font-light text-ink">Categoria Luxo Vista Mar</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-stone-500">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ink" /> 90%+</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-gold/80" /> 75%</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-gold/40" /> 60%</span>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-7 gap-1 text-xs">
          {days.map(d => <div key={d} className="text-center font-medium uppercase tracking-wider text-stone-500">{d}</div>)}
          {cells.map((c, i) => (
            <div key={i} className={`rounded-md ${heat(c.occ)} p-1.5`}>
              <p className="text-[10px] opacity-70">{i + 1}</p>
              <p className="mt-0.5 font-display text-xs font-medium leading-none">R${c.rate}</p>
              <p className="mt-0.5 text-[10px] opacity-70">{c.occ}%</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-ink/10 pt-3">
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Channel manager sincronizado</span>
            <span className="text-xs text-stone-500">há 1 min</span>
          </div>
          <button className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-paper">
            Aplicar regra de yield
          </button>
        </div>
      </div>
    </Frame>
  );
}

/* ============================================================
 * 3. HOUSEKEEPING MAP — telão de governança
 * ============================================================ */
function HousekeepingScreen() {
  type S = 'limpo' | 'sujo' | 'manut' | 'inspec' | 'vazio';
  const floor: { n: string; s: S; g?: string }[] = [
    { n: '301', s: 'limpo', g: 'Sra. Andrade' }, { n: '302', s: 'sujo' }, { n: '303', s: 'manut' }, { n: '304', s: 'limpo', g: 'Costa, J.' },
    { n: '305', s: 'limpo', g: 'Família Reis' }, { n: '306', s: 'inspec' }, { n: '307', s: 'sujo' }, { n: '308', s: 'limpo', g: 'Sr. Park' },
    { n: '309', s: 'vazio' }, { n: '310', s: 'limpo', g: 'Aragão, M.' }, { n: '311', s: 'sujo' }, { n: '312', s: 'limpo', g: 'Lopez & Co.' },
  ];
  const meta: Record<S, { cls: string; lbl: string }> = {
    limpo:  { cls: 'bg-emerald-700/90 text-paper border-emerald-900/20', lbl: 'Ocupado' },
    sujo:   { cls: 'bg-amber-600/90 text-paper border-amber-800/20',     lbl: 'Saiu hoje' },
    manut:  { cls: 'bg-red-700/90 text-paper border-red-900/20',         lbl: 'Manutenção' },
    inspec: { cls: 'bg-gold text-ink border-ink/10',                     lbl: 'Inspeção' },
    vazio:  { cls: 'bg-white text-ink/70 border-ink/10',                 lbl: 'Vago' },
  };

  return (
    <Frame url="royalpms.app · governança">
      <div className="p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Governança · Andar 3</p>
            <p className="mt-1 font-display text-xl font-light text-ink">Escala da camareira · Joana M.</p>
          </div>
          <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium uppercase tracking-wider text-emerald-700">
            7 de 12 prontos
          </div>
        </div>

        <div className="mt-5 grid grid-cols-4 gap-2">
          {floor.map(r => (
            <div key={r.n} className={`rounded-lg border ${meta[r.s].cls} p-2.5`}>
              <div className="flex items-center justify-between">
                <p className="font-display text-base font-medium leading-none">{r.n}</p>
                <span className="text-[10px] uppercase tracking-wider opacity-80">{meta[r.s].lbl}</span>
              </div>
              {r.g
                ? <p className="mt-2 text-xs opacity-80 truncate">{r.g}</p>
                : <p className="mt-2 text-xs opacity-50">—</p>}
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-ink/10 pt-3 text-xs">
          <div>
            <p className="text-stone-500">Tempo médio</p>
            <p className="font-display text-lg font-light text-ink">28 min</p>
          </div>
          <div>
            <p className="text-stone-500">UHs fora de ordem</p>
            <p className="font-display text-lg font-light text-ink">1</p>
          </div>
          <div>
            <p className="text-stone-500">Previsão para 16h</p>
            <p className="font-display text-lg font-light text-emerald-700">100%</p>
          </div>
        </div>
      </div>
    </Frame>
  );
}

/* ============================================================
 * 4. MAINTENANCE — fila de chamados
 * ============================================================ */
function MaintenanceScreen() {
  const items = [
    { p: 'P1', t: 'Ar-condicionado UH 412 sem refrigerar', u: 'Carlos R.', sla: '12 min', s: 'em curso',  c: 'text-amber-700 bg-amber-50' },
    { p: 'P1', t: 'Vazamento sob a pia · UH 207',           u: 'Diego S.',  sla: '38 min', s: 'em curso',  c: 'text-amber-700 bg-amber-50' },
    { p: 'P2', t: 'Lâmpada queimada · corredor 3',          u: '—',         sla: '2 h',    s: 'aberto',    c: 'text-stone-600 bg-stone-100' },
    { p: 'P2', t: 'Persiana travada · UH 503',              u: 'Diego S.',  sla: '1 h',    s: 'aberto',    c: 'text-stone-600 bg-stone-100' },
    { p: 'P3', t: 'Pintura de retoque · recepção',          u: 'Equipe A',  sla: '6 h',    s: 'agendado',  c: 'text-blue-700 bg-blue-50' },
  ];
  const pclr = (p: string) => p === 'P1' ? 'bg-red-700 text-paper' : p === 'P2' ? 'bg-amber-600 text-paper' : 'bg-stone-400 text-paper';

  return (
    <Frame url="royalpms.app · manutenção">
      <div className="p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Fila de chamados</p>
            <p className="mt-1 font-display text-xl font-light text-ink">5 abertos · 2 em SLA crítico</p>
          </div>
          <button className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-paper">
            Novo chamado
          </button>
        </div>

        <div className="mt-5 space-y-2">
          {items.map((i, k) => (
            <div key={k} className="flex items-center gap-3 rounded-lg border border-ink/10 bg-paper/40 px-3 py-2.5">
              <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${pclr(i.p)}`}>{i.p}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">{i.t}</p>
                <p className="mt-0.5 text-xs text-stone-500">Responsável: <span className="text-ink/80">{i.u}</span> · SLA {i.sla}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wider ${i.c}`}>{i.s}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-ink/10 pt-3 text-xs">
          <div><p className="text-stone-500">Tempo médio resolução</p><p className="font-display text-base text-ink">47 min</p></div>
          <div><p className="text-stone-500">SLA do mês</p><p className="font-display text-base text-emerald-700">96,4%</p></div>
          <div><p className="text-stone-500">Reincidências</p><p className="font-display text-base text-ink">2</p></div>
        </div>
      </div>
    </Frame>
  );
}

/* ============================================================
 * 5. POS / A&B — comanda do restaurante
 * ============================================================ */
function POSScreen() {
  const items = [
    ['2', 'Espresso duplo', 'R$ 18,00'],
    ['1', 'Sanduíche de pernil', 'R$ 32,00'],
    ['1', 'Salada Caesar', 'R$ 28,00'],
    ['1', 'Vinho Malbec · taça', 'R$ 38,00'],
    ['1', 'Cheesecake de framboesa', 'R$ 24,00'],
  ];
  return (
    <Frame url="royalpms.app · A&B / POS">
      <div className="p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Mesa 04 · Restaurante</p>
            <p className="mt-1 font-display text-xl font-light text-ink">Hóspede · Mariana Aragão · UH 412</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium uppercase tracking-wider text-emerald-700">aberta</span>
        </div>

        <div className="mt-5 divide-y divide-ink/10 rounded-xl border border-ink/10">
          {items.map(([q, n, v]) => (
            <div key={n} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="w-6 rounded bg-paper/60 text-center text-xs font-medium text-ink">{q}</span>
              <span className="flex-1 text-ink/85">{n}</span>
              <span className="font-display text-ink">{v}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-paper/40 p-3">
            <p className="text-xs uppercase tracking-wider text-stone-500">Sub-total</p>
            <p className="font-display text-lg text-ink">R$ 140,00</p>
          </div>
          <div className="rounded-xl bg-ink p-3 text-paper">
            <p className="text-xs uppercase tracking-wider text-paper/55">Total c/ couvert 10%</p>
            <p className="font-display text-lg">R$ 154,00</p>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <button className="flex-1 rounded-lg border border-ink/15 py-2 text-xs font-medium uppercase tracking-wider text-ink/80">
            Dividir conta
          </button>
          <button className="flex-1 rounded-lg bg-gold py-2 text-xs font-medium uppercase tracking-wider text-ink">
            Lançar no apto. 412
          </button>
        </div>
      </div>
    </Frame>
  );
}

/* ============================================================
 * 6. CHECK-IN — recepção
 * ============================================================ */
function ReceptionScreen() {
  return (
    <Frame url="royalpms.app · recepção / check-in">
      <div className="p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Check-in · 14h22</p>
          <span className="rounded-full bg-gold/15 px-3 py-1 text-xs font-medium uppercase tracking-wider text-amber-800">VIP · 3ª estadia</span>
        </div>

        <div className="mt-4 rounded-xl border border-ink/10 bg-paper/50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ink font-display text-lg text-paper">MA</div>
            <div className="min-w-0">
              <p className="font-display text-lg text-ink">Mariana Aragão</p>
              <p className="text-xs text-stone-500">RG verificado · LGPD aceita · pré-check-in feito 09h12</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-white p-2.5 ring-1 ring-ink/5">
              <p className="text-xs text-stone-500">Unidade habitacional</p>
              <p className="mt-0.5 font-display text-base text-ink">412 · Luxo Vista Mar</p>
            </div>
            <div className="rounded-lg bg-white p-2.5 ring-1 ring-ink/5">
              <p className="text-xs text-stone-500">Saída prevista</p>
              <p className="mt-0.5 font-display text-base text-ink">21/mai · 11h00</p>
            </div>
            <div className="rounded-lg bg-white p-2.5 ring-1 ring-ink/5">
              <p className="text-xs text-stone-500">Tarifa / noite</p>
              <p className="mt-0.5 font-display text-base text-ink">R$ 720,00</p>
            </div>
            <div className="rounded-lg bg-white p-2.5 ring-1 ring-ink/5">
              <p className="text-xs text-stone-500">Garantia</p>
              <p className="mt-0.5 font-display text-base text-emerald-700">Pré-paga</p>
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-1.5 text-xs">
          {[
            'FNRH preenchida automaticamente do pré-check-in',
            'Vincular cartão para extras (frigobar, A&B, spa)',
            'Disparar mensagem de boas-vindas no WhatsApp',
          ].map(t => (
            <div key={t} className="flex items-center gap-2 text-ink/75">
              <Check className="h-3 w-3 text-emerald-700" />
              <span>{t}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <button className="flex-1 rounded-lg border border-ink/15 py-2 text-xs font-medium uppercase tracking-wider text-ink/80">Imprimir FNRH</button>
          <button className="flex-1 rounded-lg bg-ink py-2 text-xs font-medium uppercase tracking-wider text-paper">Liberar chave</button>
        </div>
      </div>
    </Frame>
  );
}

/* ============================================================
 * 7. MARKETING — campanhas / segmentos / disparos
 * ============================================================ */
function MarketingScreen() {
  const funnel = [
    { l: 'Base de hóspedes',         v: 4820, w: 100, c: 'bg-ink' },
    { l: 'Segmento · Vista Mar',     v: 1320, w: 72,  c: 'bg-ink/85' },
    { l: 'Aberturas (WhatsApp)',     v:  942, w: 52,  c: 'bg-gold' },
    { l: 'Cliques no link de oferta',v:  286, w: 16,  c: 'bg-gold/70' },
    { l: 'Reservas confirmadas',     v:   38, w: 4,   c: 'bg-emerald-700' },
  ];
  const campaigns = [
    { n: 'Inverno · Vista Mar 3 noites', ch: 'WhatsApp',   st: 'ativa',    cv: '4,1%',  rv: 'R$ 28,4k', cc: 'bg-emerald-50 text-emerald-700' },
    { n: 'Day-use spa · executivos',     ch: 'E-mail',     st: 'agendada', cv: '—',     rv: '—',        cc: 'bg-amber-50 text-amber-700' },
    { n: 'Recompra hóspedes 90d',        ch: 'WhatsApp',   st: 'ativa',    cv: '6,8%',  rv: 'R$ 12,1k', cc: 'bg-emerald-50 text-emerald-700' },
    { n: 'Aniversariantes · upgrade',    ch: 'E-mail+SMS', st: 'rascunho', cv: '—',     rv: '—',        cc: 'bg-stone-100 text-stone-600' },
  ];
  return (
    <Frame url="royalpms.app · marketing">
      <div className="p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Campanhas · Maio</p>
            <p className="mt-1 font-display text-xl font-light text-ink">Funil de conversão</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium uppercase tracking-wider text-emerald-700">+R$ 40,5k geradas</span>
        </div>

        <div className="mt-5 space-y-2">
          {funnel.map(f => (
            <div key={f.l}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-ink/80">{f.l}</span>
                <span className="font-display text-ink">{f.v.toLocaleString('pt-BR')}</span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-paper/60">
                <div className={`h-full rounded-full ${f.c}`} style={{ width: `${f.w}%` }} />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 overflow-hidden rounded-xl border border-ink/10">
          <div className="grid grid-cols-12 border-b border-ink/10 bg-paper/40 px-3 py-2 text-xs uppercase tracking-wider text-stone-500">
            <span className="col-span-6">Campanha</span><span className="col-span-2">Canal</span><span className="col-span-2 text-right">Conv.</span><span className="col-span-2 text-right">Receita</span>
          </div>
          {campaigns.map(c => (
            <div key={c.n} className="grid grid-cols-12 items-center border-b border-ink/5 px-3 py-2 text-xs last:border-0">
              <div className="col-span-6 flex items-center gap-2 min-w-0">
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase ${c.cc}`}>{c.st}</span>
                <span className="truncate text-ink">{c.n}</span>
              </div>
              <span className="col-span-2 text-stone-600">{c.ch}</span>
              <span className="col-span-2 text-right font-display text-ink">{c.cv}</span>
              <span className="col-span-2 text-right font-display text-ink">{c.rv}</span>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

/* ============================================================
 * 8. FINANCEIRO — DRE + conciliação bancária
 * ============================================================ */
function FinanceScreen() {
  const dre = [
    { l: 'Receita bruta',          v: 'R$ 412.840', w: 100, neg: false },
    { l: 'Deduções (impostos)',    v: '-R$ 38.120', w: 9,   neg: true  },
    { l: 'Custos operacionais',    v: '-R$ 168.450', w: 41,  neg: true  },
    { l: 'Despesas administrativas',v:'-R$ 62.300', w: 15,  neg: true  },
    { l: 'GOP',                    v: 'R$ 143.970', w: 35,  neg: false, hl: true },
  ];
  const bank = [
    { d: '17/05', t: 'Pix · reserva #1842',           v: '+R$ 2.160,00', s: 'conciliado', c: 'text-emerald-700 bg-emerald-50' },
    { d: '17/05', t: 'Stone D+1 · cartões 16/05',     v: '+R$ 18.420,90', s: 'conciliado', c: 'text-emerald-700 bg-emerald-50' },
    { d: '17/05', t: 'Fornecedor · lavanderia Aliança',v:'-R$ 4.380,00',  s: 'a conferir', c: 'text-amber-700 bg-amber-50' },
    { d: '16/05', t: 'Folha de pagamento · 1ª parcela', v:'-R$ 38.600,00', s: 'conciliado', c: 'text-emerald-700 bg-emerald-50' },
    { d: '16/05', t: 'Tarifa bancária',                v:'-R$ 89,90',     s: 'conciliado', c: 'text-emerald-700 bg-emerald-50' },
  ];
  return (
    <Frame url="royalpms.app · financeiro">
      <div className="p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-stone-500">DRE · Maio (parcial)</p>
            <p className="mt-1 font-display text-xl font-light text-ink">Margem GOP <span className="text-emerald-700">34,9%</span></p>
          </div>
          <div className="flex gap-1.5">
            {['Maio','Abr','Mar'].map((m,i) => (
              <span key={m} className={`rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-wider ${i===0?'bg-ink text-paper':'bg-paper/60 text-ink/70'}`}>{m}</span>
            ))}
          </div>
        </div>

        <div className="mt-5 space-y-2">
          {dre.map(d => (
            <div key={d.l} className={`rounded-lg ${d.hl ? 'border border-ink/15 bg-ink text-paper' : 'bg-paper/40'} px-3 py-2`}>
              <div className="flex items-center justify-between text-xs">
                <span className={d.hl ? '' : 'text-ink/80'}>{d.l}</span>
                <span className={`font-display text-sm ${d.neg ? 'text-red-700' : d.hl ? 'text-gold' : 'text-ink'}`}>{d.v}</span>
              </div>
              <div className={`mt-1.5 h-1 w-full overflow-hidden rounded-full ${d.hl ? 'bg-paper/15' : 'bg-paper/70'}`}>
                <div className={`h-full rounded-full ${d.neg ? 'bg-red-700/70' : d.hl ? 'bg-gold' : 'bg-ink/60'}`} style={{ width: `${d.w}%` }} />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Conciliação bancária · Itaú 4567-8</p>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">98% conciliado</span>
          </div>
          <div className="mt-2 divide-y divide-ink/10 rounded-xl border border-ink/10">
            {bank.map((b,i) => (
              <div key={i} className="grid grid-cols-12 items-center px-3 py-2 text-xs">
                <span className="col-span-2 text-stone-500">{b.d}</span>
                <span className="col-span-6 truncate text-ink/85">{b.t}</span>
                <span className={`col-span-2 text-right font-display ${b.v.startsWith('+') ? 'text-emerald-700' : 'text-red-700'}`}>{b.v}</span>
                <span className={`col-span-2 text-center rounded-full py-0.5 text-[10px] font-medium uppercase tracking-wider ${b.c}`}>{b.s}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Frame>
  );
}

/* ============================================================
 * 9. EVENTOS — propostas + linha do tempo do salão
 * ============================================================ */
function EventsScreen() {
  const proposals = [
    { c: 'Casamento · Santos & Almeida', d: '14/jun', pax: 180, v: 'R$ 92.400', s: 'fechada',     cl: 'bg-emerald-700 text-paper' },
    { c: 'Convenção · Banco Próspero',   d: '22/jun', pax: 240, v: 'R$ 138.000', s: 'negociação', cl: 'bg-gold text-ink' },
    { c: 'Aniversário · Família Lopes',  d: '02/jul', pax:  60, v: 'R$ 18.600',  s: 'proposta',   cl: 'bg-paper/60 text-ink ring-1 ring-ink/10' },
    { c: 'Workshop · Studio Norte',      d: '08/jul', pax:  35, v: 'R$ 9.200',   s: 'rascunho',   cl: 'bg-stone-200 text-stone-700' },
  ];
  const timeline = [
    { h: '08:00', t: 'Montagem · equipe de produção' },
    { h: '11:30', t: 'Coffee break · 80 pax · Salão Atlântico' },
    { h: '12:30', t: 'Almoço · 240 pax · Salão Boreal' },
    { h: '15:00', t: 'Coffee + brigadeiros · 240 pax' },
    { h: '18:30', t: 'Encerramento + coquetel' },
  ];
  return (
    <Frame url="royalpms.app · eventos">
      <div className="p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Pipeline · próximos 60 dias</p>
            <p className="mt-1 font-display text-xl font-light text-ink">R$ 258,2k em propostas ativas</p>
          </div>
          <button className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-paper">Nova proposta</button>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          {[
            { n: '7', l: 'Propostas em curso' },
            { n: '3', l: 'Salões reservados' },
            { n: '78%', l: 'Conversão (90d)' },
          ].map(s => (
            <div key={s.l} className="rounded-xl bg-paper/40 p-3">
              <p className="font-display text-2xl font-light text-ink">{s.n}</p>
              <p className="mt-0.5 text-xs uppercase tracking-wider text-stone-500">{s.l}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          {proposals.map(p => (
            <div key={p.c} className="flex items-center gap-3 rounded-lg border border-ink/10 bg-paper/40 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">{p.c}</p>
                <p className="mt-0.5 text-xs text-stone-500">{p.d} · {p.pax} pax · <span className="text-ink/80">{p.v}</span></p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wider ${p.cl}`}>{p.s}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-ink/10 bg-ink p-3 text-paper">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.22em] text-paper/55">Linha do tempo · 22/jun · Banco Próspero</p>
            <p className="text-xs text-paper/55">Salão Boreal · 240 pax</p>
          </div>
          <ol className="mt-3 space-y-1.5">
            {timeline.map(e => (
              <li key={e.h} className="flex items-center gap-3 text-xs">
                <span className="w-12 font-display text-gold">{e.h}</span>
                <span className="h-1 w-1 rounded-full bg-gold" />
                <span className="text-paper/85">{e.t}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Frame>
  );
}

/* ============================================================
 * HERO VITRINE — peça única com tilt suave + cards orbitando
 * ============================================================ */
function HeroVitrine() {
  const { ref, rx, ry } = useMouseParallax(8);

  return (
    <div ref={ref} className="relative" style={{ perspective: '1800px' }}>
      {/* sombra/halo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-12 -z-10 rounded-[3rem] blur-3xl"
        style={{ background: 'radial-gradient(closest-side, rgba(218,170,90,0.35), transparent 70%)' }}
      />

      <motion.div style={{ rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d' }} className="relative crisp-3d">
        {/* tela principal */}
        <div style={{ transform: 'translateZ(40px)' }}>
          <DashboardScreen />
        </div>

        {/* card flutuante 1 — KPI rápido (esquerda baixo) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          style={{ transform: 'translateZ(120px)' }}
          className="absolute -left-6 bottom-8 hidden w-56 rounded-2xl border border-ink/10 bg-white p-4 shadow-2xl sm:block"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700/10 text-emerald-700">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M3 12h4l3-9 4 18 3-9h4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Faturamento</p>
              <p className="font-display text-lg font-medium leading-tight text-ink">R$ 142,8 mil</p>
              <p className="text-xs text-stone-500">acumulado · maio</p>
            </div>
          </div>
        </motion.div>

        {/* card flutuante 2 — notificação (direita topo) */}
        <motion.div
          initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.7, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          style={{ transform: 'translateZ(160px)' }}
          className="absolute -right-4 -top-6 hidden w-60 rounded-2xl border border-ink/10 bg-paper/95 p-4 shadow-2xl backdrop-blur md:block"
        >
          <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Reserva confirmada</p>
          <p className="mt-1 font-display text-sm text-ink">Família Carvalho · 3 noites</p>
          <div className="mt-2 flex items-center justify-between text-xs text-stone-500">
            <span>Suíte Master · 28–30 mai</span>
            <span className="font-display text-ink">R$ 4.320</span>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

/* ============================================================
 * TILT CARD para módulos (sem React state, com motion values)
 * ============================================================ */
function TiltCard({ n, title, desc, icon }: { n: string; title: string; desc: string; icon: ReactNode }) {
  const { ref, rx, ry } = useMouseParallax(8);
  return (
    <div ref={ref} style={{ perspective: '900px' }} className="h-full">
      <motion.div
        style={{ rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d' }}
        className="group relative h-full rounded-2xl border border-ink/10 bg-paper p-6 transition-shadow hover:shadow-[0_30px_60px_-20px_rgba(20,15,10,0.25)]"
      >
        <div style={{ transform: 'translateZ(35px)' }} className="flex items-center justify-between">
          <span className="font-display text-2xl font-light italic text-gold">{n}</span>
          <div className="h-9 w-9 text-ink/70">{icon}</div>
        </div>
        <h3 style={{ transform: 'translateZ(25px)' }} className="mt-6 font-display text-xl font-medium text-ink">{title}</h3>
        <p style={{ transform: 'translateZ(15px)' }} className="mt-2 text-sm leading-relaxed text-ink/65">{desc}</p>
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gold to-transparent opacity-0 transition group-hover:opacity-100" />
      </motion.div>
    </div>
  );
}

const ic = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const modules = [
  { n: '01', title: 'Reservas',    desc: 'Disponibilidade, tarifa, garantia e ocupação em um único fluxo.',           icon: ic('M3 10h18M8 3v4M16 3v4M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v15H3z') },
  { n: '02', title: 'Recepção',    desc: 'Check-in expresso, FNRH, leitura de documento e assinatura digital.',       icon: ic('M3 21v-2a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v2M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z') },
  { n: '03', title: 'Governança',  desc: 'Status de UH em tempo real, escalas e checklist de limpeza.',               icon: ic('M3 7l9-4 9 4M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M9 21V12h6v9') },
  { n: '04', title: 'Manutenção',  desc: 'Chamados priorizados por UH, fotos, fila por setor e SLA.',                 icon: ic('M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-2.5z') },
  { n: '05', title: 'A&B / POS',   desc: 'Comandas, débito em conta e ponto de venda integrado.',                     icon: ic('M4 3v18M4 8h6M10 3v18M14 3l2 5v13M16 8h4') },
  { n: '06', title: 'Eventos',     desc: 'Salões, propostas, contratos e produção do orçamento ao faturamento.',      icon: ic('M5 21V8l7-5 7 5v13M9 21v-6h6v6') },
  { n: '07', title: 'Marketing',   desc: 'Campanhas segmentadas por WhatsApp, e-mail e SMS com receita atribuída.',    icon: ic('M3 11l18-8-8 18-2-8-8-2z') },
  { n: '08', title: 'Financeiro',  desc: 'Conciliação bancária, contas a pagar/receber, DRE.',                        icon: ic('M12 1v22M17 5H9a3 3 0 0 0 0 6h6a3 3 0 0 1 0 6H7') },
  { n: '09', title: 'Auditoria',   desc: 'Trilha completa, fechamento noturno e relatórios fiscais.',                  icon: ic('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13l2 2 4-4') },
];

/* ============================================================
 * SHOWCASE — telas do sistema com perspectiva 3D editorial
 * ============================================================ */
function Showcase({
  index, title, kicker, desc, screen, side, accent,
}: {
  index: string; title: string; kicker: string; desc: string;
  screen: ReactNode; side: 'left' | 'right'; accent: string;
}) {
  const { ref, rx, ry } = useMouseParallax(6);
  const tiltY = side === 'left' ? -6 : 6;

  return (
    <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-14">
      <div className={`lg:col-span-5 ${side === 'right' ? 'lg:order-2' : ''}`}>
        <p className="text-xs uppercase tracking-[0.28em] text-stone-500">{kicker}</p>
        <div className="mt-3 flex items-baseline gap-4">
          <span className="font-display text-2xl font-light italic text-gold">{index}</span>
          <h3 className="font-display text-3xl font-light leading-[1.05] tracking-[-0.02em] text-ink sm:text-4xl">{title}</h3>
        </div>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-ink/70 sm:text-base">{desc}</p>
      </div>

      <div ref={ref} className={`lg:col-span-7 ${side === 'right' ? 'lg:order-1' : ''}`} style={{ perspective: '1600px' }}>
        <div
          aria-hidden
          className="pointer-events-none absolute h-full w-full -translate-x-6 translate-y-6 rounded-[2rem] blur-2xl"
          style={{ background: accent, maxWidth: '640px' }}
        />
        <motion.div
          style={{
            rotateX: rx,
            rotateY: useTransform(ry, v => (v as number) + tiltY),
            transformStyle: 'preserve-3d',
          }}
          className="relative crisp-3d"
        >
          {screen}
        </motion.div>
      </div>
    </div>
  );
}

/* ============================================================
 * BACKGROUND DECOR — gradientes CSS estáticos (sem WebGL)
 * ============================================================ */
function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-paper" />
      <div
        className="absolute -top-32 right-[-10%] h-[600px] w-[600px] rounded-full opacity-60 blur-3xl"
        style={{ background: 'radial-gradient(closest-side, oklch(0.92 0.05 85), transparent 70%)' }}
      />
      <div
        className="absolute bottom-[-20%] left-[-10%] h-[500px] w-[500px] rounded-full opacity-50 blur-3xl"
        style={{ background: 'radial-gradient(closest-side, oklch(0.72 0.12 75 / 0.35), transparent 70%)' }}
      />
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(to right, oklch(0.16 0.012 60) 1px, transparent 1px), linear-gradient(to bottom, oklch(0.16 0.012 60) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(ellipse at 50% 30%, black 30%, transparent 75%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 right-[-15%] select-none font-display text-[18rem] leading-none text-ink/[0.025] sm:right-[-5%] sm:text-[26rem] lg:right-[3%]"
      >
        R
      </div>
    </div>
  );
}

/* ============================================================
 * LANDING ROOT
 * ============================================================ */
export default function Landing3D() {
  const [loginOpen, setLoginOpen] = useState(false);
  const [menuOpen, setMenuOpen]   = useState(false);
  const [scrolled, setScrolled]   = useState(false);

  const openLogin = () => {
    setMenuOpen(false);
    setLoginOpen(true);
    if (window.location.hash !== '#login') {
      window.history.replaceState(null, '', '#login');
    }
  };

  const openChannelLogin = () => {
    setMenuOpen(false);
    window.location.assign('/reservas-channel');
  };

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  useEffect(() => {
    if (window.location.hash === '#login') setLoginOpen(true);
  }, []);

  useEffect(() => {
    if (!loginOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLoginOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [loginOpen]);

  return (
    <div className="relative min-h-screen overflow-x-clip bg-paper font-sans text-ink antialiased">
      {/* HEADER */}
      <header className={`fixed inset-x-0 top-0 z-40 transition-all duration-500 ${
        scrolled ? 'border-b border-ink/10 bg-paper/85 backdrop-blur-xl' : 'bg-transparent'
      }`}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-10">
          <a href="#inicio" className="flex items-center gap-2.5" onClick={() => setMenuOpen(false)}>
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/15 bg-paper">
              <span className="font-display text-base italic leading-none text-ink">R</span>
            </div>
            <div className="leading-tight">
              <p className="font-display text-sm font-medium tracking-tight text-ink">Royal PMS</p>
              <p className="hidden text-xs uppercase tracking-[0.18em] text-stone-500 sm:block">Plataforma de hotelaria</p>
            </div>
          </a>

          <nav className="hidden items-center gap-7 md:flex">
            {navLinks.map(l => (
              <a key={l.href} href={l.href} className="group relative text-sm text-ink/80 hover:text-ink">
                {l.label}
                <span className="absolute -bottom-1 left-0 h-px w-0 bg-gold transition-all duration-300 group-hover:w-full" />
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <a href="/" className="hidden text-sm text-ink/70 hover:text-ink md:inline">
              Site do hotel
            </a>
            <button onClick={openLogin} className="hidden text-sm text-ink/70 hover:text-ink md:inline">
              Acessar
            </button>
            <button onClick={openChannelLogin} className="hidden text-sm font-medium text-ink hover:text-gold md:inline">
              Reservas Channel
            </button>
            <a href="#contato" className="group hidden md:inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-all hover:gap-3">
              Ver demonstração <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            <a href="#contato" className="inline-flex md:hidden items-center rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper">
              Demo
            </a>
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="flex md:hidden h-9 w-9 items-center justify-center rounded-full border border-ink/15 bg-paper/80 text-ink"
              aria-label="Menu"
            >
              {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden border-b border-ink/10 bg-paper/95 backdrop-blur-xl md:hidden"
            >
              <nav className="flex flex-col px-5 py-4 gap-1">
                {navLinks.map(l => (
                  <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)}
                    className="py-3 text-base font-medium text-ink/80 border-b border-ink/5 last:border-0">{l.label}</a>
                ))}
                <a
                  href="/"
                  onClick={() => setMenuOpen(false)}
                  className="py-3 text-base font-medium text-ink/80 border-b border-ink/5"
                >
                  Site do hotel
                </a>
                <a
                  href="/reservas-channel"
                  onClick={() => setMenuOpen(false)}
                  className="py-3 text-base font-semibold text-ink border-b border-ink/5"
                >
                  Reservas Channel
                </a>
                <button
                  onClick={openLogin}
                  className="mt-3 w-full rounded-full border border-ink/20 py-3 text-sm font-medium text-ink/70"
                >
                  Já tenho acesso — entrar
                </button>
                <button
                  onClick={openChannelLogin}
                  className="w-full rounded-full bg-ink py-3 text-sm font-medium text-paper"
                >
                  Reservas Channel Manager
                </button>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main>
        {/* HERO */}
        <section id="inicio" className="relative overflow-hidden pt-28 pb-16 sm:pt-36 sm:pb-24 lg:pt-44">
          <HeroBackdrop />
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 sm:px-6 lg:grid-cols-12 lg:gap-10 lg:px-10">
            <div className="lg:col-span-5">
              <motion.div
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
                className="inline-flex items-center gap-3 rounded-full border border-ink/10 bg-paper px-4 py-1.5"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse-dot" />
                <span className="text-xs uppercase tracking-[0.22em] text-stone-500">PMS para hotelaria independente</span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.1 }}
                className="mt-5 font-display text-4xl font-light leading-[1.02] tracking-[-0.02em] text-ink text-balance sm:mt-7 sm:text-5xl lg:text-[5rem]"
              >
                A operação do hotel,
                <br />
                <span className="italic text-ink/90">orquestrada</span>{' '}
                <span className="relative inline-block">
                  com método.
                  <svg viewBox="0 0 300 12" className="absolute -bottom-2 left-0 w-full text-gold" preserveAspectRatio="none">
                    <path d="M2 8 C 80 2, 160 12, 298 4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
                  </svg>
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.25 }}
                className="mt-5 max-w-xl text-base leading-relaxed text-ink/70 text-pretty sm:mt-7 sm:text-lg"
              >
                Reservas, recepção, governança, manutenção, A&amp;B, eventos e financeiro em uma só plataforma —
                desenhada para meios de hospedagem que trocam improviso por padrão.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.4 }}
                className="mt-7 flex flex-wrap items-center gap-3 sm:mt-10 sm:gap-4"
              >
                <a href="#contato" className="group inline-flex items-center gap-3 rounded-full bg-ink px-7 py-4 text-sm font-medium text-paper transition-all hover:bg-ink/90">
                  Solicitar demonstração
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gold text-ink transition-transform group-hover:translate-x-0.5">
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </a>
                <button onClick={openLogin} className="group inline-flex items-center gap-2 px-2 py-3 text-sm font-medium text-ink">
                  <span className="border-b border-ink/30 pb-0.5 transition group-hover:border-ink">Já tenho acesso</span>
                </button>
                <button onClick={openChannelLogin} className="group inline-flex items-center gap-3 rounded-full border border-ink/15 bg-paper px-6 py-4 text-sm font-medium text-ink transition-all hover:border-gold">
                  Reservas Channel Manager
                  <ArrowRight className="h-4 w-4 text-gold transition-transform group-hover:translate-x-0.5" />
                </button>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.6 }}
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

            <div className="lg:col-span-7">
              <HeroVitrine />
            </div>
          </div>
        </section>

        {/* MARQUEE */}
        <section className="relative border-y border-ink/10 bg-paper py-8">
          <div className="mx-auto mb-5 max-w-7xl px-6 lg:px-10">
            <p className="text-center text-xs uppercase tracking-[0.28em] text-stone-500">Uma plataforma · toda a operação do hotel</p>
          </div>
          <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
            <div className="flex w-max animate-marquee gap-16 whitespace-nowrap">
              {[...['RESERVAS','RECEPÇÃO','GOVERNANÇA','MANUTENÇÃO','RESTAURANTE & A&B','EVENTOS','FINANCEIRO','AUDITORIA'],
                ...['RESERVAS','RECEPÇÃO','GOVERNANÇA','MANUTENÇÃO','RESTAURANTE & A&B','EVENTOS','FINANCEIRO','AUDITORIA']].map((l, i) => (
                <span key={i} className="font-display text-lg italic tracking-[0.18em] text-ink/60">· {l}</span>
              ))}
            </div>
          </div>
        </section>

        {/* RESERVAS CHANNEL */}
        <section className="border-b border-ink/10 bg-white/55 py-10">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-10">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold">Reservas Channel Manager</p>
              <h2 className="mt-3 font-display text-3xl font-light tracking-tight text-ink sm:text-4xl">
                Acesso direto ao canal de reservas corporativas por propriedade.
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-ink/65 sm:text-base">
                Cadastre empresas, tarifas, UHs, bloqueios, servicos e configuracoes de cobranca do hotel com separacao por propriedade.
              </p>
            </div>
            <button
              onClick={openChannelLogin}
              className="group inline-flex w-full items-center justify-center gap-3 rounded-full bg-ink px-7 py-4 text-sm font-medium text-paper transition-all hover:bg-ink/90 sm:w-auto"
            >
              Entrar no Reservas Channel
              <ArrowRight className="h-4 w-4 text-gold transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </section>

        {/* TELAS DO SISTEMA — showcase 3D */}
        <section id="telas" className="relative py-20 sm:py-28 lg:py-36">
          <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
            <div className="grid gap-8 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <p className="text-xs uppercase tracking-[0.28em] text-stone-500">· Telas do sistema</p>
                <h2 className="mt-4 font-display text-3xl font-light leading-[1.05] tracking-[-0.02em] text-ink text-balance sm:mt-5 sm:text-4xl lg:text-6xl">
                  Veja o Royal PMS <span className="italic">em ação.</span>
                </h2>
              </div>
              <p className="text-sm leading-relaxed text-ink/70 text-pretty sm:text-base lg:col-span-6 lg:col-start-7 lg:mt-3">
                Interfaces reais — recepção, governança, manutenção, A&amp;B e tarifário — desenhadas para a rotina do
                chão de hotel. Passe o mouse para girar cada peça e perceber a profundidade.
              </p>
            </div>

            <div className="mt-16 space-y-24 sm:space-y-32">
              <Showcase
                index="01" side="left"
                kicker="· Reservas / tarifário"
                title="Tarifário visual, em tempo real."
                desc="Heatmap por dia, regras de yield em um clique e sincronização com channel manager. A equipe vê para onde a ocupação está indo antes de o telefone tocar."
                screen={<RatesScreen />}
                accent="radial-gradient(closest-side, oklch(0.72 0.12 75 / 0.35), transparent 70%)"
              />
              <Showcase
                index="02" side="right"
                kicker="· Governança"
                title="Mapa de UHs por andar, sem ruído."
                desc="Status de limpeza, ocupação, hóspede e inspeção em uma única grade. Camareiras, recepção e gerência leem a mesma fonte — sem caderno, sem ruído de rádio."
                screen={<HousekeepingScreen />}
                accent="radial-gradient(closest-side, oklch(0.55 0.12 145 / 0.35), transparent 70%)"
              />
              <Showcase
                index="03" side="left"
                kicker="· Manutenção"
                title="Fila com prioridade, SLA e responsável."
                desc="Cada chamado nasce com prioridade, prazo e responsável. Fotos pelo celular, histórico por UH e SLA acompanhado em tempo real — para você cobrar pelo dado, não pela memória."
                screen={<MaintenanceScreen />}
                accent="radial-gradient(closest-side, oklch(0.65 0.18 30 / 0.30), transparent 70%)"
              />
              <Showcase
                index="04" side="right"
                kicker="· A&B / POS"
                title="Comanda do restaurante na conta do quarto."
                desc="Lance no apartamento em um toque, divida conta entre hóspedes, aplique couvert e taxa de serviço. O fechamento bate com o financeiro sem digitação dupla."
                screen={<POSScreen />}
                accent="radial-gradient(closest-side, oklch(0.72 0.12 75 / 0.30), transparent 70%)"
              />
              <Showcase
                index="05" side="left"
                kicker="· Recepção"
                title="Check-in em menos de 90 segundos."
                desc="Pré-check-in pelo celular do hóspede, FNRH preenchida automaticamente, garantia pré-validada. A recepção entrega chave — não preenche formulário."
                screen={<ReceptionScreen />}
                accent="radial-gradient(closest-side, oklch(0.85 0.10 75 / 0.40), transparent 70%)"
              />
              <Showcase
                index="06" side="right"
                kicker="· Marketing"
                title="Campanhas que conhecem o hóspede."
                desc="Segmente a base por categoria, frequência e perfil de consumo. Dispare WhatsApp, e-mail e SMS no mesmo fluxo — e acompanhe receita atribuída em tempo real."
                screen={<MarketingScreen />}
                accent="radial-gradient(closest-side, oklch(0.72 0.12 320 / 0.30), transparent 70%)"
              />
              <Showcase
                index="07" side="left"
                kicker="· Financeiro"
                title="DRE em tempo real, conciliação no automático."
                desc="Receitas, custos e despesas por centro de custo, com DRE consolidada e conciliação bancária por OFX. O contador vê o mesmo número que a gerência."
                screen={<FinanceScreen />}
                accent="radial-gradient(closest-side, oklch(0.55 0.12 145 / 0.32), transparent 70%)"
              />
              <Showcase
                index="08" side="right"
                kicker="· Eventos"
                title="Da proposta ao faturamento, em uma linha."
                desc="Salões reservados sem conflito, propostas versionadas, contratos assinados digitalmente e timeline operacional para a equipe de produção — tudo na mesma base."
                screen={<EventsScreen />}
                accent="radial-gradient(closest-side, oklch(0.72 0.12 75 / 0.32), transparent 70%)"
              />
            </div>
          </div>
        </section>

        {/* MÓDULOS */}
        <section id="modulos" className="relative bg-paper py-16 sm:py-24 lg:py-32 border-y border-ink/10">
          <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
            <div className="grid gap-8 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <p className="text-xs uppercase tracking-[0.28em] text-stone-500">· Módulos</p>
                <h2 className="mt-4 font-display text-3xl font-light leading-[1.05] tracking-[-0.02em] text-ink text-balance sm:mt-5 sm:text-4xl lg:text-6xl">
                  Toda a operação <span className="italic">em uma plataforma.</span>
                </h2>
              </div>
              <p className="text-sm leading-relaxed text-ink/70 text-pretty sm:text-base lg:col-span-6 lg:col-start-7 lg:mt-3">
                Mesma base de dados, sem retrabalho entre setores. Ative apenas o que faz sentido para a sua hotelaria.
              </p>
            </div>

            <div className="mt-12 grid grid-cols-1 gap-4 sm:mt-16 sm:grid-cols-2 lg:grid-cols-3">
              {modules.map(m => <TiltCard key={m.n} {...m} />)}
            </div>
          </div>
        </section>

        {/* OPERAÇÃO / NÚMEROS */}
        <section id="operacao" className="relative bg-ink py-20 text-paper sm:py-28 lg:py-32 overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage:
                'radial-gradient(circle at 20% 0%, oklch(0.72 0.12 75) 0%, transparent 40%), radial-gradient(circle at 80% 100%, oklch(0.36 0.04 145) 0%, transparent 50%)',
            }}
          />
          <div className="relative mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
            <div className="max-w-3xl">
              <p className="text-xs uppercase tracking-[0.28em] text-paper/50">· Como entregamos</p>
              <h2 className="mt-4 font-display text-3xl font-light leading-[1.05] tracking-[-0.02em] text-balance sm:mt-5 sm:text-4xl lg:text-6xl">
                Do <span className="italic text-gold">caderno de turno</span> à decisão em tempo real.
              </h2>
            </div>

            <div className="mt-12 grid grid-cols-2 gap-6 sm:gap-10 sm:grid-cols-4 sm:mt-16">
              {[
                { v: '4 sem.', l: 'Da assinatura ao go-live médio' },
                { v: '96%',    l: 'SLA cumprido em manutenção' },
                { v: '< 90s',  l: 'Tempo médio de check-in' },
                { v: '0',      l: 'Servidores locais para gerenciar' },
              ].map(s => (
                <div key={s.l}>
                  <p className="font-display text-4xl font-light text-paper sm:text-5xl">{s.v}</p>
                  <p className="mt-2 text-xs text-paper/60 sm:text-sm">{s.l}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section id="contato" className="relative bg-paper py-20 sm:py-28 lg:py-32">
          <div className="mx-auto max-w-4xl px-5 text-center sm:px-6 lg:px-10">
            <p className="text-xs uppercase tracking-[0.28em] text-stone-500">· Próximo passo</p>
            <h2 className="mt-4 font-display text-4xl font-light leading-[1.05] tracking-[-0.02em] text-ink text-balance sm:mt-5 sm:text-5xl lg:text-6xl">
              Sua operação merece <span className="italic">profundidade.</span>
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-ink/70 text-pretty sm:mt-7 sm:text-base">
              Em até 30 minutos mostramos o sistema rodando sobre o cenário do seu hotel — com seus tarifários, suas UHs e seus indicadores.
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <a href={WHATSAPP_LINK} target="_blank" rel="noreferrer"
                 className="group inline-flex items-center gap-3 rounded-full bg-ink px-8 py-4 text-sm font-medium text-paper transition-all hover:gap-4">
                Falar pelo WhatsApp
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gold text-ink transition-transform group-hover:translate-x-0.5">
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </a>
              <button onClick={openLogin} className="group inline-flex items-center gap-2 text-sm font-medium text-ink">
                <span className="border-b border-ink/30 pb-0.5 group-hover:border-ink">Já sou cliente — entrar</span>
              </button>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="border-t border-ink/10 bg-paper py-10">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 sm:flex-row sm:px-6 lg:px-10">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full border border-ink/15">
                <span className="font-display text-sm italic leading-none text-ink">R</span>
              </div>
              <p className="font-display text-sm text-ink">Royal PMS Enterprise</p>
            </div>
            <div className="flex flex-col items-center gap-2 text-xs text-stone-500 sm:items-end">
              <a href="/" className="font-medium text-ink/70 transition hover:text-ink">Voltar ao site do hotel</a>
              <p>© {new Date().getFullYear()} · Hotelaria orquestrada com método.</p>
            </div>
          </div>
        </footer>
      </main>

      {/* LOGIN MODAL */}
      <AnimatePresence>
        {loginOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4 backdrop-blur-md"
            onClick={() => setLoginOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.96 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="relative w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setLoginOpen(false)}
                className="absolute -right-2 -top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 bg-paper text-ink shadow-lg"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
              <Login />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* keep CSSProperties import-side-effect free */
type _CSS = CSSProperties;
