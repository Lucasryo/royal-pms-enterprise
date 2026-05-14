import { useEffect, useRef, useState, useMemo, type ReactNode, type CSSProperties } from 'react';
import { supabase } from '../supabase';
import { toast } from 'sonner';
import PublicBookingEngine from './PublicBookingEngine';

const WHATSAPP_NUMBER = '5522996105104';
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}`;

// ─── Viewport trigger ─────────────────────────────────────────────────────────

function _watchVisible(
  el: HTMLElement,
  onVisible: () => void,
  { threshold = 0.92, hardTimeout = 1500 }: { threshold?: number; hardTimeout?: number } = {}
) {
  let done = false;
  const trigger = () => { if (done) return; done = true; onVisible(); };
  const check = () => {
    if (done || !el) return false;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight || 800;
    if (r.top < vh * threshold && r.bottom > 0) { trigger(); return true; }
    return false;
  };
  if (check()) return () => {};
  let frames = 0;
  let rafId: number;
  const poll = () => { if (done || frames++ > 30) return; if (check()) return; rafId = requestAnimationFrame(poll); };
  rafId = requestAnimationFrame(poll);
  let io: IntersectionObserver | undefined;
  try {
    io = new IntersectionObserver(([e]) => { if (e.isIntersecting) trigger(); }, { threshold: 0.15 });
    io.observe(el);
  } catch (_) {}
  const onScroll = () => check();
  window.addEventListener('scroll', onScroll, { passive: true });
  const to = setTimeout(trigger, hardTimeout);
  return () => {
    done = true;
    if (rafId) cancelAnimationFrame(rafId);
    if (io) io.disconnect();
    window.removeEventListener('scroll', onScroll);
    clearTimeout(to);
  };
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useScrollReveal({ delay = 0, distance = 28 } = {}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!ref.current || shown) return;
    return _watchVisible(ref.current, () => setTimeout(() => setShown(true), delay));
  }, [delay, shown]);
  return {
    ref,
    style: {
      opacity: shown ? 1 : 0,
      transform: shown ? 'translateY(0)' : `translateY(${distance}px)`,
      transition: 'opacity 900ms cubic-bezier(0.22, 1, 0.36, 1), transform 900ms cubic-bezier(0.22, 1, 0.36, 1)',
    } as CSSProperties,
  };
}

function Reveal({
  delay, distance, as: As = 'div', children, className, style: extra, ...rest
}: {
  delay?: number; distance?: number; as?: React.ElementType;
  children?: ReactNode; className?: string; style?: CSSProperties; [key: string]: unknown;
}) {
  const r = useScrollReveal({ delay, distance });
  return (
    <As ref={r.ref} className={className} style={{ ...r.style, ...extra }} {...rest}>
      {children}
    </As>
  );
}

function useCounter(target: number, { duration = 1600, decimals = 0 } = {}) {
  const ref = useRef<HTMLElement | null>(null);
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    let started = false;
    const start = () => {
      if (started) return; started = true;
      const t0 = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        setValue(target * eased);
        if (t < 1) requestAnimationFrame(tick); else setValue(target);
      };
      requestAnimationFrame(tick);
    };
    return _watchVisible(ref.current, start);
  }, [target, duration]);
  const display = decimals === 0 ? Math.round(value).toString() : value.toFixed(decimals).replace('.', ',');
  return { ref, display };
}

function Counter({ to, prefix = '', suffix = '', decimals = 0, duration }: {
  to: number; prefix?: string; suffix?: string; decimals?: number; duration?: number;
}) {
  const c = useCounter(to, { duration, decimals });
  return <span ref={c.ref as React.RefObject<HTMLSpanElement>}>{prefix}{c.display}{suffix}</span>;
}

function useMagnetic({ strength = 0.25 } = {}) {
  const ref = useRef<HTMLElement | null>(null);
  const [t, setT] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      if (Math.hypot(dx, dy) < 120) setT({ x: dx * strength, y: dy * strength });
      else setT({ x: 0, y: 0 });
    };
    const onLeave = () => setT({ x: 0, y: 0 });
    window.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => { window.removeEventListener('mousemove', onMove); el.removeEventListener('mouseleave', onLeave); };
  }, [strength]);
  return { ref, style: { transform: `translate(${t.x}px, ${t.y}px)`, transition: 'transform 400ms cubic-bezier(0.22, 1, 0.36, 1)' } as CSSProperties };
}

function useTilt({ max = 6 } = {}) {
  const ref = useRef<HTMLElement | null>(null);
  const [t, setT] = useState({ rx: 0, ry: 0 });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      setT({ rx: -(py - 0.5) * max, ry: (px - 0.5) * max });
    };
    const onLeave = () => setT({ rx: 0, ry: 0 });
    el.addEventListener('mousemove', onMove); el.addEventListener('mouseleave', onLeave);
    return () => { el.removeEventListener('mousemove', onMove); el.removeEventListener('mouseleave', onLeave); };
  }, [max]);
  return { ref, style: { transform: `perspective(1400px) rotateX(${t.rx}deg) rotateY(${t.ry}deg)`, transition: 'transform 500ms cubic-bezier(0.22, 1, 0.36, 1)', transformStyle: 'preserve-3d' } as CSSProperties };
}

function useParallax({ speed = 0.2 } = {}) {
  const ref = useRef<HTMLElement | null>(null);
  const [y, setY] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    let ticking = false;
    const update = () => {
      const r = el.getBoundingClientRect();
      setY(-((r.top + r.height / 2 - window.innerHeight / 2) * speed));
      ticking = false;
    };
    const onScroll = () => { if (!ticking) { requestAnimationFrame(update); ticking = true; } };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [speed]);
  return { ref, style: { transform: `translateY(${y}px)`, willChange: 'transform' } as CSSProperties };
}

function useStagger(count: number, { step = 60, baseDelay = 0 } = {}) {
  const ref = useRef<HTMLElement | null>(null);
  const [active, setActive] = useState<boolean[]>(() => new Array(count).fill(false));
  useEffect(() => {
    if (!ref.current) return;
    const start = () => {
      for (let i = 0; i < count; i++) {
        setTimeout(() => {
          setActive(a => { const n = [...a]; n[i] = true; return n; });
        }, baseDelay + i * step);
      }
    };
    return _watchVisible(ref.current, start);
  }, [count, step, baseDelay]);
  return { ref, active };
}

function useRotatingItem(length: number, interval = 3400) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx(i => (i + 1) % length), interval);
    return () => clearInterval(id);
  }, [length, interval]);
  return idx;
}

// ─── Decorative ───────────────────────────────────────────────────────────────

function ScrollProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setP(max > 0 ? window.scrollY / max : 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-[2px] pointer-events-none">
      <div style={{ width: `${p * 100}%`, height: '100%', background: 'linear-gradient(to right, oklch(0.72 0.12 75), oklch(0.92 0.05 85))', transition: 'width 120ms linear' }} />
    </div>
  );
}

function CursorGlow() {
  const [m, setM] = useState({ x: -500, y: -500 });
  useEffect(() => {
    const onMove = (e: MouseEvent) => setM({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);
  return (
    <div aria-hidden className="fixed inset-0 pointer-events-none z-30 mix-blend-multiply hidden md:block"
      style={{ background: `radial-gradient(380px circle at ${m.x}px ${m.y}px, oklch(0.72 0.12 75 / 0.10), transparent 60%)`, transition: 'background 80ms linear' }} />
  );
}

function AnimatedSquiggle({ className = '' }: { className?: string }) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    return _watchVisible(ref.current as unknown as HTMLElement, () => setDrawn(true), { hardTimeout: 1800 });
  }, []);
  return (
    <svg ref={ref} viewBox="0 0 300 12" className={className} preserveAspectRatio="none">
      <path d="M2 8 C 80 2, 160 12, 298 4" stroke="currentColor" strokeWidth="2" fill="none"
        strokeLinecap="round" strokeDasharray="320"
        strokeDashoffset={drawn ? 0 : 320}
        style={{ transition: 'stroke-dashoffset 1400ms cubic-bezier(0.22, 1, 0.36, 1) 600ms' }} />
    </svg>
  );
}

// ─── Login Modal ──────────────────────────────────────────────────────────────

function LoginModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success('Bem-vindo de volta!');
      onClose();
    } catch (err: unknown) {
      toast.error((err as Error).message || 'E-mail ou senha incorretos.');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:px-4 sm:py-6"
      onClick={onClose} style={{ animation: 'loginOverlay 280ms cubic-bezier(0.22, 1, 0.36, 1)' }}>
      <div className="absolute inset-0 bg-ink/70 backdrop-blur-md" />
      <div className="relative w-full max-w-md rounded-t-[2rem] sm:rounded-[2rem] overflow-hidden border border-ink/10 bg-paper"
        onClick={e => e.stopPropagation()}
        style={{ boxShadow: '0 30px 80px -30px rgba(20,15,10,0.45)', animation: 'loginSheet 420ms cubic-bezier(0.22, 1, 0.36, 1)' }}>
        <div aria-hidden className="absolute -right-16 -top-16 h-48 w-48 rounded-full pointer-events-none"
          style={{ background: 'oklch(0.72 0.12 75 / 0.20)', filter: 'blur(40px)' }} />
        <button onClick={onClose} aria-label="Fechar"
          className="absolute right-5 top-5 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-ink/15 bg-paper/80 text-ink/70 hover:text-ink hover:bg-paper transition">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
        <div className="relative p-8 sm:p-10">
          <p className="text-[11px] uppercase tracking-[0.28em] text-stone-500">· Royal PMS</p>
          <h2 className="mt-4 font-display font-light text-3xl leading-[1.05] tracking-[-0.02em] text-ink">
            Bem-vindo de <span className="italic">volta.</span>
          </h2>
          <p className="mt-2 text-sm text-ink/65 leading-relaxed max-w-xs">Entre na sua conta para continuar a operação.</p>
          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="text-[10px] uppercase tracking-[0.18em] text-stone-500">E-mail</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                className="mt-1.5 w-full rounded-full border border-ink/15 bg-white/70 px-5 py-3 text-sm text-ink outline-none focus:border-ink transition placeholder:text-ink/30"
                placeholder="seu@email.com" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.18em] text-stone-500">Senha</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                className="mt-1.5 w-full rounded-full border border-ink bg-white px-5 py-3 text-sm text-ink outline-none placeholder:text-ink/30"
                placeholder="••••••••" />
            </div>
            <button type="submit" disabled={loading}
              className="mt-2 flex w-full items-center justify-center gap-3 rounded-full bg-ink px-5 py-3.5 text-sm font-medium text-paper hover:bg-ink/90 transition disabled:opacity-60">
              {loading ? 'Entrando…' : 'Entrar'}
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gold text-ink text-[11px]">→</span>
            </button>
          </form>
          <div className="mt-7 pt-6 border-t border-ink/10 flex items-center justify-between gap-3">
            <p className="text-[11px] text-ink/55 font-display italic">Não tem acesso?</p>
            <a href="#demo" onClick={onClose} className="text-[11px] uppercase tracking-[0.18em] text-ink hover:text-gold transition border-b border-ink/20 hover:border-gold pb-0.5">
              Solicitar demonstração →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

const navLinks = [
  { href: '#modulos', label: 'Módulos' },
  { href: '#telas', label: 'Telas do sistema' },
  { href: '#operacao', label: 'Operação' },
  { href: '#hospedes', label: 'Hóspedes' },
  { href: '#faq', label: 'Perguntas' },
];

function Header({ onLogin }: { onLogin: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <header className={`fixed inset-x-0 top-0 z-40 transition-all duration-500 ${scrolled ? 'border-b border-ink/10 bg-paper/85 backdrop-blur-xl' : 'bg-transparent'}`}>
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-10">
        <a href="#inicio" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/15 bg-paper">
            <span className="font-display text-base italic leading-none">R</span>
          </div>
          <div className="leading-tight">
            <p className="font-display text-sm font-medium tracking-tight">Royal PMS</p>
            <p className="hidden text-[10px] uppercase tracking-[0.18em] text-stone-500 sm:block">Plataforma de hotelaria</p>
          </div>
        </a>
        <nav className="hidden items-center gap-7 md:flex">
          {navLinks.map(l => (
            <a key={l.href} href={l.href} className="group relative text-sm text-ink/80 transition-colors hover:text-ink">
              {l.label}
              <span className="absolute -bottom-1 left-0 h-px w-0 bg-gold transition-all duration-300 group-hover:w-full" />
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <button onClick={onLogin} className="hidden text-sm text-ink/70 hover:text-ink md:inline">Acessar</button>
          <a href="#demo" className="group inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper hover:bg-ink/90 transition-all">
            Ver demonstração <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </a>
        </div>
      </div>
    </header>
  );
}

// ─── Hero Panel ───────────────────────────────────────────────────────────────

function HeroPanel() {
  const tilt = useTilt({ max: 5 });
  const litCells = [0, 3, 5, 7, 9, 12, 13, 15, 18, 19, 22, 24, 25, 27];
  const floor = useStagger(28, { step: 45, baseDelay: 700 });
  const activities = [
    { dot: 'bg-gold', text: 'UH 312 liberada para governança', t: 'há 2 min' },
    { dot: 'bg-moss', text: 'Pagamento da reserva #1842 conciliado', t: 'há 12 min' },
    { dot: 'bg-ink', text: 'Nova reserva (3 noites) registrada', t: 'há 18 min' },
    { dot: 'bg-gold', text: 'Check-in confirmado · UH 208', t: 'há 28 min' },
    { dot: 'bg-moss', text: 'Folio fechado · reserva #1841', t: 'há 42 min' },
  ];
  const tickerStart = useRotatingItem(activities.length, 3400);
  const visible = [0, 1, 2].map(i => activities[(tickerStart + i) % activities.length]);

  return (
    <div className="relative">
      <div className="absolute -inset-10 -z-10 rounded-[3rem]"
        style={{ background: 'radial-gradient(circle, oklch(0.72 0.12 75 / 0.30), transparent 60%)', filter: 'blur(40px)' }} />
      <div ref={tilt.ref as React.RefObject<HTMLDivElement>} style={{ ...tilt.style, boxShadow: '0 30px 80px -30px rgba(20,15,10,0.25)' }}
        className="relative overflow-hidden rounded-3xl border border-ink/10 bg-white">
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
        <div className="grid gap-4 p-6 sm:grid-cols-5">
          <div className="relative overflow-hidden rounded-2xl bg-ink p-6 text-paper sm:col-span-2 sm:row-span-2">
            <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gold/25" style={{ filter: 'blur(28px)' }} />
            <p className="text-[10px] uppercase tracking-[0.22em] text-paper/50">Ocupação · hoje</p>
            <p className="mt-4 font-display text-6xl font-light tracking-tight"><Counter to={84} suffix="%" /></p>
            <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-paper/10">
              <div className="h-full rounded-full" style={{ width: '84%', background: 'linear-gradient(to right, oklch(0.72 0.12 75), oklch(0.92 0.05 85))' }} />
            </div>
            <p className="mt-3 text-xs text-paper/60">68 das 81 UHs ocupadas</p>
            <div ref={floor.ref as React.RefObject<HTMLDivElement>} className="mt-8 grid grid-cols-7 gap-1">
              {Array.from({ length: 28 }).map((_, i) => (
                <div key={i} className={`h-6 rounded-[3px] ${litCells.includes(i) ? 'bg-gold' : 'bg-paper/10'}`}
                  style={{ opacity: floor.active[i] ? 1 : 0, transform: floor.active[i] ? 'scale(1)' : 'scale(0.6)', transition: 'opacity 400ms cubic-bezier(0.22,1,0.36,1), transform 400ms cubic-bezier(0.22,1,0.36,1)' }} />
              ))}
            </div>
            <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-paper/40">mapa do andar 3</p>
          </div>
          <div className="rounded-2xl border border-ink/10 bg-paper/40 p-5 sm:col-span-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-stone-500">Movimento do dia</p>
            <div className="mt-4 grid grid-cols-3 gap-4">
              <div><p className="text-xs text-stone-500">Check-ins</p><p className="font-display text-3xl font-light"><Counter to={17} /></p></div>
              <div><p className="text-xs text-stone-500">Check-outs</p><p className="font-display text-3xl font-light"><Counter to={13} /></p></div>
              <div><p className="text-xs text-stone-500">Diária média</p><p className="font-display text-3xl font-light">R$<Counter to={286} /></p></div>
            </div>
          </div>
          <div className="rounded-2xl border border-ink/10 bg-paper/40 p-5 sm:col-span-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-[0.22em] text-stone-500">Atividade recente</p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500/70">últimos 30 min</p>
            </div>
            <ul className="mt-4 space-y-3 text-sm" style={{ minHeight: 96 }}>
              {visible.map((a, i) => (
                <li key={`${tickerStart}-${i}`} className="flex items-start gap-3"
                  style={{ animation: 'tickIn 480ms cubic-bezier(0.22,1,0.36,1) both', animationDelay: `${i * 60}ms` }}>
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${a.dot}`} />
                  <p className="flex-1 text-ink/85">{a.text}</p>
                  <span className="text-[10px] uppercase tracking-wider text-stone-500/70">{a.t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function Hero({ onLogin }: { onLogin: () => void }) {
  const rParallax = useParallax({ speed: 0.18 });
  const cta = useMagnetic({ strength: 0.3 });
  return (
    <section id="inicio" className="relative overflow-hidden pt-28 pb-16 sm:pt-32 sm:pb-24 lg:pt-40 lg:pb-32">
      <div ref={rParallax.ref as React.RefObject<HTMLDivElement>} style={rParallax.style} aria-hidden
        className="pointer-events-none absolute -top-10 right-[-8%] select-none font-display text-[18rem] leading-none text-ink/[0.025] sm:text-[28rem]">R</div>
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 sm:px-6 lg:grid-cols-12 lg:px-10">
        <div className="lg:col-span-6">
          <Reveal className="inline-flex items-center gap-3 rounded-full border border-ink/10 bg-paper px-4 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" />
            <span className="text-[11px] uppercase tracking-[0.22em] text-stone-500">PMS para hotelaria independente</span>
          </Reveal>
          <Reveal as="h1" delay={120} className="mt-5 font-display text-4xl font-light leading-[1.02] tracking-[-0.02em] sm:mt-7 sm:text-5xl lg:text-[5.25rem]">
            A operação do hotel,<br />
            <span className="italic text-ink/90">orquestrada</span>{' '}
            <span className="relative inline-block">
              com método.
              <AnimatedSquiggle className="absolute -bottom-2 left-0 w-full text-gold" />
            </span>
          </Reveal>
          <Reveal as="p" delay={260} className="mt-5 max-w-xl text-base leading-relaxed text-ink/70 sm:mt-7 sm:text-lg">
            Reservas, recepção, governança, manutenção, restaurante, eventos e financeiro em uma só plataforma — desenhada para meios de hospedagem que trocam improviso por padrão.
          </Reveal>
          <Reveal delay={400} className="mt-7 flex flex-wrap items-center gap-3 sm:mt-10 sm:gap-4">
            <a href="#demo" ref={cta.ref as React.RefObject<HTMLAnchorElement>} style={cta.style}
              className="group inline-flex items-center gap-3 rounded-full bg-ink px-7 py-4 text-sm font-medium text-paper hover:bg-ink/90 transition-colors">
              Solicitar demonstração
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gold text-ink group-hover:translate-x-0.5 transition-transform">→</span>
            </a>
            <button onClick={onLogin} className="group inline-flex items-center gap-2 px-2 py-3 text-sm font-medium">
              <span className="border-b border-ink/30 pb-0.5 group-hover:border-ink transition">Já tenho acesso</span>
            </button>
          </Reveal>
          <Reveal delay={540} className="mt-8 grid max-w-md grid-cols-3 gap-4 border-t border-ink/10 pt-5 text-xs sm:mt-12 sm:gap-6">
            <div><p className="font-display text-2xl font-light"><Counter to={100} suffix="%" /></p><p className="mt-1 uppercase tracking-[0.16em] text-stone-500">web · sem instalação</p></div>
            <div><p className="font-display text-2xl font-light"><Counter to={24} />/<Counter to={7} duration={900} /></p><p className="mt-1 uppercase tracking-[0.16em] text-stone-500">operação contínua</p></div>
            <div><p className="font-display text-2xl font-light">LGPD</p><p className="mt-1 uppercase tracking-[0.16em] text-stone-500">dados em conformidade</p></div>
          </Reveal>
        </div>
        <div className="lg:col-span-6"><HeroPanel /></div>
      </div>
    </section>
  );
}

// ─── Marquee ──────────────────────────────────────────────────────────────────

const marqueeItems = ['RESERVAS', 'RECEPÇÃO', 'GOVERNANÇA', 'MANUTENÇÃO', 'RESTAURANTE & A&B', 'EVENTOS', 'FINANCEIRO', 'AUDITORIA'];

function Marquee() {
  return (
    <section className="relative border-y border-ink/10 bg-paper py-8 group">
      <div className="mx-auto mb-5 max-w-7xl px-6 lg:px-10">
        <p className="text-center text-[11px] uppercase tracking-[0.28em] text-stone-500">Uma plataforma · toda a operação do hotel</p>
      </div>
      <div className="relative overflow-hidden" style={{ maskImage: 'linear-gradient(to right, transparent, black 12%, black 88%, transparent)', WebkitMaskImage: 'linear-gradient(to right, transparent, black 12%, black 88%, transparent)' }}>
        <div className="flex w-max gap-16 whitespace-nowrap animate-marquee group-hover:[animation-play-state:paused]">
          {[...marqueeItems, ...marqueeItems].map((l, i) => (
            <span key={i} className="font-display text-lg italic tracking-[0.18em] text-ink/60">· {l}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Features Bento — mini tiles ──────────────────────────────────────────────

function MiniCalendar() {
  return (
    <div className="w-full max-w-[280px]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] uppercase tracking-[0.22em] text-stone-500">· 14 mai · quarta</span>
        <span className="text-[9px] uppercase tracking-[0.22em] text-moss">· ao vivo</span>
      </div>
      <div className="space-y-1.5">
        {[
          { id: 1842, name: 'Marina A.', uh: 'UH 312', s: 'positive', sl: 'Em hospedagem' },
          { id: 1843, name: 'Roberto T.', uh: 'UH 208', s: 'motion', sl: 'Confirmada' },
          { id: 1845, name: 'Carla M.', uh: 'UH 105', s: 'outline', sl: 'Pendente' },
        ].map(r => (
          <div key={r.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border border-ink/10 bg-paper/40">
            <span className="text-[10px] text-ink/65 font-display italic">#{r.id}</span>
            <span className="text-[10px] text-ink flex-1 truncate">{r.name}</span>
            <span className="text-[9px] text-ink/65 uppercase tracking-[0.12em]">{r.uh}</span>
            <span className={`text-[9px] font-medium px-2 py-0.5 rounded-full border ${r.s === 'positive' ? 'bg-moss-soft text-moss border-moss/20' : r.s === 'motion' ? 'bg-gold-soft text-ink border-gold/35' : 'bg-transparent text-ink border-ink/25'}`}>{r.sl}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniRoomMap() {
  const cells = [
    { n: 312, s: 'closed', l: 'Ocupada' }, { n: 314, s: 'positive', l: 'Limpa' },
    { n: 316, s: 'motion', l: 'Reserv.' }, { n: 318, s: 'positive', l: 'Insp.' },
    { n: 320, s: 'closed', l: 'Ocupada' }, { n: 322, s: 'motion', l: 'Suja' },
    { n: 324, s: 'positive', l: 'Disp.' }, { n: 326, s: 'outline', l: 'Bloq.' },
  ];
  const cls: Record<string, string> = {
    positive: 'bg-moss-soft text-moss border-moss/20',
    motion: 'bg-gold-soft text-ink border-gold/35',
    closed: 'bg-ink text-paper border-ink',
    outline: 'bg-transparent text-ink/70 border-ink/25',
  };
  return (
    <div className="grid grid-cols-4 gap-1.5 max-w-[260px]">
      {cells.map((c, i) => (
        <div key={i} className="flex flex-col items-start gap-0.5 px-1.5 py-1 rounded-md border border-ink/10 bg-paper/40">
          <span className="text-[10px] font-display text-ink leading-none">{c.n}</span>
          <span className={`text-[8px] font-medium px-1.5 py-0 rounded-full border ${cls[c.s]} leading-tight`}>{c.l}</span>
        </div>
      ))}
    </div>
  );
}

function MiniPriorityLadder() {
  return (
    <div className="w-full max-w-[260px] rounded-xl border border-ink/10 bg-paper/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[9px] font-medium tracking-[0.06em] px-2 py-0.5 rounded-full bg-ink text-paper border border-ink">Urgente</span>
        <span className="text-[9px] uppercase tracking-[0.12em] text-stone-500 flex items-center gap-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-2.5 h-2.5"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" strokeLinecap="round" /></svg>
          8 min
        </span>
      </div>
      <div className="font-display text-lg text-ink mt-2 leading-none">UH 312</div>
      <p className="text-[11px] text-ink/75 mt-1 leading-snug">Vazamento no chuveiro</p>
      <div className="mt-2 pt-2 border-t border-ink/10 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-full bg-gold-soft flex items-center justify-center text-[8px] text-ink">C</div>
          <span className="text-[10px] text-ink/75">Carlos</span>
        </div>
        <span className="text-[9px] uppercase tracking-[0.18em] text-ink">Atender →</span>
      </div>
    </div>
  );
}

function MiniFolio() {
  return (
    <div className="space-y-2 max-w-[220px]">
      {[
        { l: 'Diária × 3', v: 'R$ 858,00' },
        { l: 'A&B · jantar', v: 'R$ 142,00' },
        { l: 'Frigobar', v: 'R$ 48,00' },
        { l: 'Lavanderia', v: 'R$ 32,00' },
      ].map((r, i) => (
        <div key={i} className="flex items-baseline justify-between border-b border-ink/[0.08] pb-1.5">
          <span className="text-[11px] text-ink/65">{r.l}</span>
          <span className="text-[11px] font-display text-ink">{r.v}</span>
        </div>
      ))}
      <div className="flex items-baseline justify-between pt-1">
        <span className="text-[10px] uppercase tracking-[0.22em] text-stone-500">Total</span>
        <span className="font-display text-xl text-ink">R$ 1.080</span>
      </div>
    </div>
  );
}

function MiniCounter() {
  const bars = [56, 62, 71, 76, 82, 88, 78];
  const days = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
  return (
    <div className="w-full max-w-[240px]">
      <div className="flex items-baseline justify-between mb-2">
        <div className="flex items-baseline gap-1">
          <span className="text-base text-ink/65 font-display">R$</span>
          <span className="font-display text-3xl font-light text-ink"><Counter to={142} /></span>
          <span className="font-display text-base text-ink/55 italic">,8k</span>
        </div>
        <span className="text-[10px] uppercase tracking-[0.18em] text-moss font-display italic">+12%</span>
      </div>
      <div className="h-14 flex items-end gap-1">
        {bars.map((h, i) => (
          <div key={i} className="flex-1 flex flex-col items-stretch gap-1">
            <div className="rounded-t-sm" style={{ height: `${h * 0.5}px`, background: i === 5 ? 'oklch(0.72 0.12 75)' : 'oklch(0.16 0.012 60 / 0.18)' }} />
            <span className="text-[8px] text-stone-500 text-center font-medium">{days[i]}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 text-[10px] uppercase tracking-[0.18em] text-stone-500">· 7 dias · meta R$ 180k</div>
    </div>
  );
}

function MiniHotels() {
  const props = [
    { key: 'macae', name: 'Macaé Palace', pct: 84, n: 68, total: 81 },
    { key: 'petr', name: 'Petrópolis', pct: 76, n: 42, total: 55 },
    { key: 'buz', name: 'Búzios', pct: 91, n: 30, total: 33 },
  ];
  const trend7d = [62, 71, 76, 82, 88, 84, 79];
  const active = props[0];
  return (
    <div className="w-full max-w-[420px]">
      <div className="flex items-center gap-1.5 p-1 rounded-full border border-ink/10 bg-paper/60 w-fit">
        {props.map(p => (
          <span key={p.key} className={`px-3 py-1 rounded-full text-[10px] uppercase tracking-[0.16em] transition-colors ${p.key === active.key ? 'bg-ink text-paper' : 'text-ink/60'}`}>{p.name}</span>
        ))}
      </div>
      <div className="mt-6 flex items-end justify-between gap-6">
        <span className="font-display font-light text-7xl text-ink leading-none tracking-tight"><Counter to={active.pct} suffix="%" /></span>
        <div className="flex flex-col items-end gap-1 pb-1">
          <span className="text-[10px] uppercase tracking-[0.22em] text-stone-500">· Ocupação hoje</span>
          <span className="font-display italic text-base text-ink">Royal {active.name}</span>
          <span className="text-[10px] uppercase tracking-[0.16em] text-stone-500">{active.n}/{active.total} UHs</span>
        </div>
      </div>
      <div className="mt-5 pt-5 border-t border-ink/10">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[10px] uppercase tracking-[0.22em] text-stone-500">· 7 dias</span>
          <span className="text-[10px] font-display italic text-moss">média 78,8%</span>
        </div>
        <div className="h-10 flex items-end gap-1">
          {trend7d.map((h, i) => (
            <div key={i} className="flex-1 rounded-t-sm" style={{ height: `${(h / 100) * 40}px`, background: i === trend7d.length - 1 ? 'oklch(0.72 0.12 75)' : 'oklch(0.16 0.012 60 / 0.18)' }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ span, rowSpan, eyebrow, title, body, visual, delay = 0, dark = false }: {
  span: string; rowSpan?: string; eyebrow: string; title: string; body?: string;
  visual?: ReactNode; delay?: number; dark?: boolean;
}) {
  const tilt = useTilt({ max: 3 });
  return (
    <Reveal delay={delay}
      className={`group relative overflow-hidden rounded-3xl border ${dark ? 'border-ink/30' : 'border-ink/10'} ${dark ? 'bg-ink text-paper' : 'bg-white'} ${span} ${rowSpan || ''}`}
      style={{ boxShadow: '0 1px 2px 0 rgb(20 15 10 / 0.05)' }}>
      <div ref={tilt.ref as React.RefObject<HTMLDivElement>} style={tilt.style} className="relative flex h-full flex-col justify-between p-6 sm:p-8">
        <div>
          <p className={`text-[11px] uppercase tracking-[0.22em] ${dark ? 'text-paper/50' : 'text-stone-500'}`}>· {eyebrow}</p>
          <h3 className={`mt-4 font-display font-light text-2xl sm:text-3xl leading-[1.1] tracking-tight ${dark ? 'text-paper' : 'text-ink'}`}>{title}</h3>
          {body && <p className={`mt-3 text-sm leading-relaxed ${dark ? 'text-paper/70' : 'text-ink/65'} max-w-md`}>{body}</p>}
        </div>
        {visual && <div className="mt-6 flex items-end justify-start opacity-90 group-hover:opacity-100 transition-opacity">{visual}</div>}
      </div>
    </Reveal>
  );
}

function FeaturesBento() {
  return (
    <section id="telas" className="relative py-16 sm:py-24 lg:py-36">
      <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <Reveal as="p" className="text-[11px] uppercase tracking-[0.28em] text-stone-500">· O que está dentro</Reveal>
            <Reveal as="h2" delay={120} className="mt-4 font-display text-3xl font-light leading-[1.05] tracking-[-0.02em] sm:mt-5 sm:text-4xl lg:text-6xl">
              Cada detalhe pensado <span className="italic">para hotelaria.</span>
            </Reveal>
          </div>
          <Reveal as="p" delay={240} className="text-sm leading-relaxed text-ink/70 sm:text-base lg:col-span-5 lg:col-start-8 lg:mt-3">
            Seis módulos especializados, uma só base de dados. Operação que conversa entre setores — sem retrabalho, sem planilha cruzada, sem WhatsApp como sistema.
          </Reveal>
        </div>
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 md:auto-rows-[280px] gap-4 sm:gap-5">
          <FeatureCard span="md:col-span-4 md:row-span-2" eyebrow="Reservas"
            title="Disponibilidade, garantia e tarifa — em um só fluxo."
            body="Bloqueios inteligentes por data, empresa e categoria. Solicitação web entra como WEB-DIRETO para a central confirmar."
            visual={<MiniCalendar />} />
          <FeatureCard span="md:col-span-2" eyebrow="Governança" title="Status de UH em tempo real." visual={<MiniRoomMap />} delay={120} />
          <FeatureCard span="md:col-span-2" eyebrow="Manutenção" title="SLA visível pelo chão." visual={<MiniPriorityLadder />} delay={200} />
          <FeatureCard span="md:col-span-3" eyebrow="Folio" title="Conta consolidada — quarto, A&B, eventos, frigobar." visual={<MiniFolio />} delay={280} />
          <FeatureCard span="md:col-span-3" eyebrow="Financeiro" title="Conciliação, contas, DRE."
            body="Extratos, contestações e fila fiscal NFS-e na mesma plataforma." visual={<MiniCounter />} delay={360} />
          <FeatureCard span="md:col-span-4 md:row-span-2" eyebrow="Multi-propriedade" title="Uma central, várias bandeiras."
            body="Cadastre tantos hotéis quantos forem — cada um com inventário, tarifário e equipe próprios, todos sob a mesma sala de comando."
            visual={<MiniHotels />} delay={440} />
          <FeatureCard span="md:col-span-2" eyebrow="POS · A&B" title="Restaurante lança no folio."
            visual={<div className="flex flex-wrap gap-2 max-w-[200px]">{['Sopa do dia','Robalo','Risoto','Vinho · taça','Café'].map((p, i) => <span key={i} className="text-[10px] px-2.5 py-1 rounded-full border border-ink/15 text-ink/75 font-display italic">{p}</span>)}</div>}
            delay={520} />
          <FeatureCard span="md:col-span-2" eyebrow="Eventos" title="Do orçamento ao salão."
            visual={<div className="flex flex-col gap-2 max-w-[200px]">{[{l:'Casamento Mendes',d:'24 mai · Salão Imperial',s:'bg-moss'},{l:'Conv. Petrobras',d:'02 jun · Salão Atlântico',s:'bg-gold'},{l:'Bodas de Prata',d:'15 jun · Aguardando',s:'bg-ink/30'}].map((x,i)=><div key={i} className="flex items-start gap-2"><span className={`mt-1.5 h-1.5 w-1.5 rounded-full ${x.s}`}/><div className="leading-tight"><div className="text-[11px] text-ink">{x.l}</div><div className="text-[9px] uppercase tracking-[0.16em] text-stone-500">{x.d}</div></div></div>)}</div>}
            delay={600} />
        </div>
      </div>
    </section>
  );
}

// ─── Pinned Narrative ─────────────────────────────────────────────────────────

function PinnedNarrative() {
  const phrases = [
    { eyebrow: '06:30 · turno da manhã', big: 'A operação acorda', italic: 'já enxergada.', sub: 'Recepção abre o dia com check-ins, governança e ordens de manutenção sincronizados.' },
    { eyebrow: '13:00 · pico do almoço', big: 'Cada chamado', italic: 'encontra quem responde.', sub: 'Prioridade, SLA, fotos e histórico — sem grupo de WhatsApp.' },
    { eyebrow: '19:45 · troca de turno', big: 'O caderno de turno', italic: 'vira dado.', sub: 'Passagem operacional, lançamentos do POS e folio consolidado — auditável.' },
    { eyebrow: '03:00 · auditoria', big: 'O fechamento', italic: 'se faz sozinho.', sub: 'Fila fiscal NFS-e, conciliação de cartão e relatórios executivos automáticos.' },
  ];
  const ref = useRef<HTMLElement | null>(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const onScroll = () => {
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      setProgress(Math.max(0, Math.min(1, -r.top / total)));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const exact = progress * (phrases.length - 1);
  const idx = Math.round(exact);
  return (
    <section ref={ref as React.RefObject<HTMLElement>} className="relative bg-paper" style={{ height: `${phrases.length * 90}vh` }}>
      <div className="sticky top-0 h-screen w-full overflow-hidden flex items-center"
        style={{ background: `linear-gradient(135deg, oklch(0.975 0.012 85) 0%, oklch(${0.96 - progress * 0.02} ${0.015 + progress * 0.04} ${85 - progress * 12}) 100%)`, transition: 'background 200ms linear' }}>
        <div aria-hidden className="pointer-events-none absolute select-none font-display text-[18rem] sm:text-[28rem] lg:text-[36rem] leading-none text-ink/[0.025]"
          style={{ right: `${-15 + progress * 20}%`, top: `${-5 + progress * 10}%`, transition: 'right 300ms linear, top 300ms linear' }}>R</div>
        <div className="relative mx-auto max-w-7xl w-full px-5 sm:px-6 lg:px-10">
          <div className="absolute right-5 sm:right-6 lg:right-10 top-1/2 -translate-y-1/2 hidden md:flex flex-col gap-3">
            {phrases.map((_, i) => (
              <span key={i} className="block w-1.5 rounded-full transition-all"
                style={{ height: idx === i ? 28 : 8, background: idx === i ? 'oklch(0.72 0.12 75)' : 'oklch(0.16 0.012 60 / 0.20)', transitionDuration: '400ms' }} />
            ))}
          </div>
          <div className="max-w-4xl">
            {phrases.map((p, i) => {
              const dist = Math.abs(exact - i);
              const opacity = Math.max(0, 1 - dist * 1.5);
              const translateY = (i - exact) * 20;
              return (
                <div key={i} className={i === 0 ? 'relative' : 'absolute inset-x-0 top-0'}
                  style={{ opacity, transform: `translateY(${translateY}px)`, transition: 'opacity 350ms ease, transform 350ms ease', pointerEvents: idx === i ? 'auto' : 'none' }}>
                  <p className="text-[11px] uppercase tracking-[0.28em] text-stone-500">· {p.eyebrow}</p>
                  <h2 className="mt-5 sm:mt-7 font-display text-4xl font-light leading-[1.02] tracking-[-0.02em] sm:text-6xl lg:text-[5.5rem]">
                    {p.big}{' '}<span className="italic text-ink/90">{p.italic}</span>
                  </h2>
                  <p className="mt-6 max-w-xl text-base sm:text-lg leading-relaxed text-ink/70">{p.sub}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Modules ──────────────────────────────────────────────────────────────────

const moduleData = [
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
  '01': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" /></svg>,
  '02': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M3 21v-2a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v2" strokeLinecap="round" /><circle cx="12" cy="8" r="4" /></svg>,
  '03': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M3 7l9-4 9 4M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9" /><path d="M9 21V12h6v9" strokeLinecap="round" /></svg>,
  '04': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-2.5z" /></svg>,
  '05': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M4 3v18M4 8h6M10 3v18M14 3l2 5v13M16 8l4 0" strokeLinecap="round" /></svg>,
  '06': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M5 21V8l7-5 7 5v13M9 21v-6h6v6" strokeLinecap="round" /></svg>,
  '07': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M12 1v22M17 5H9a3 3 0 0 0 0 6h6a3 3 0 0 1 0 6H7" strokeLinecap="round" /></svg>,
  '08': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" /></svg>,
};

function ModuleCard({ m, i }: { m: typeof moduleData[0]; i: number }) {
  const tilt = useTilt({ max: 4 });
  return (
    <Reveal as="article" delay={(i % 4) * 90} className="group relative bg-paper transition-colors duration-500 hover:bg-white" style={{ display: 'flex' }}>
      <div ref={tilt.ref as React.RefObject<HTMLDivElement>} style={{ ...tilt.style, width: '100%' }} className="flex flex-col p-5 sm:p-8">
        <div className="flex items-center justify-between">
          <span className="font-display text-sm tracking-[0.2em] text-stone-500/80">{m.n}</span>
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 text-ink/80 transition-all duration-500 group-hover:border-gold group-hover:bg-gold group-hover:text-ink">
            <div className="h-5 w-5">{moduleIcons[m.n]}</div>
          </div>
        </div>
        <h3 className="mt-6 font-display text-xl font-medium sm:mt-10 sm:text-2xl">{m.title}</h3>
        <p className="mt-3 text-sm leading-relaxed text-ink/65">{m.desc}</p>
        <div className="mt-5 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-ink/60 transition-colors group-hover:text-ink sm:mt-8">
          Detalhes <span className="transition-transform group-hover:translate-x-1">→</span>
        </div>
      </div>
    </Reveal>
  );
}

function Modules() {
  return (
    <section id="modulos" className="relative py-16 sm:py-24 lg:py-36">
      <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className="text-[11px] uppercase tracking-[0.28em] text-stone-500">· Módulos do sistema</p>
            <h2 className="mt-4 font-display text-3xl font-light leading-[1.05] tracking-[-0.02em] sm:mt-5 sm:text-4xl lg:text-6xl">
              Toda a operação do hotel em uma <span className="italic">plataforma única.</span>
            </h2>
          </div>
          <p className="text-sm leading-relaxed text-ink/70 sm:text-base lg:col-span-6 lg:col-start-7 lg:mt-3">
            Cada módulo é especializado para a função que executa, mas todos compartilham a mesma base de dados — evitando retrabalho e divergências entre setores. Ative apenas o que faz sentido para o seu meio de hospedagem.
          </p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-ink/10 bg-ink/10 sm:grid-cols-2 sm:mt-16 sm:rounded-3xl lg:grid-cols-4">
          {moduleData.map((m, i) => <ModuleCard key={m.n} m={m} i={i} />)}
        </div>
      </div>
    </section>
  );
}

// ─── Hóspedes ─────────────────────────────────────────────────────────────────

function Hospedes() {
  const guestFeatures = [
    'Pré-check-in com leitura de documento e assinatura digital',
    'Conta consolidada (apartamento, A&B, eventos, frigobar)',
    'Pagamento por link, Pix, cartão ou faturamento corporativo',
    'Histórico de preferências mantido entre estadias',
  ];
  return (
    <section id="hospedes" className="relative py-16 sm:py-24 lg:py-36">
      <div className="mx-auto grid max-w-7xl items-start gap-10 px-5 sm:px-6 sm:gap-16 lg:grid-cols-12 lg:gap-12 lg:px-10">
        <div className="lg:col-span-5">
          <Reveal as="p" className="text-[11px] uppercase tracking-[0.28em] text-stone-500">· Para hóspedes</Reveal>
          <Reveal as="h2" delay={120} className="mt-4 font-display text-3xl font-light leading-[1.05] tracking-[-0.02em] sm:mt-5 sm:text-4xl lg:text-[3.5rem]">
            A discrição da hotelaria fina, <span className="italic">com a fluidez do digital.</span>
          </Reveal>
          <Reveal as="p" delay={240} className="mt-5 max-w-md text-sm leading-relaxed text-ink/70 sm:mt-6 sm:text-base">
            Pré-check-in pelo celular, conta sempre atualizada, comandas do restaurante assinadas no quarto e pagamento em um toque. O hóspede sente serviço — não sistema.
          </Reveal>
          <ul className="mt-7 space-y-4 sm:mt-10 sm:space-y-5">
            {guestFeatures.map((t, i) => (
              <Reveal as="li" key={t} delay={360 + i * 80} className="flex items-start gap-3">
                <span className="mt-2 h-px w-5 shrink-0 bg-gold sm:w-6" />
                <span className="text-sm text-ink/80 sm:text-base">{t}</span>
              </Reveal>
            ))}
          </ul>
          <Reveal as="p" delay={780} className="mt-7 font-display text-sm italic text-ink/70 sm:mt-10 sm:text-base">
            "Hóspede do Royal Macaé Palace? Reserve direto no formulário ao lado e ganhe a melhor tarifa, sem intermediário."
          </Reveal>
        </div>
        <Reveal className="relative lg:col-span-7" delay={200}>
          <div className="absolute -inset-8 -z-10 rounded-full bg-gold/15 blur-3xl sm:-inset-12" />
          <PublicBookingEngine />
        </Reveal>
      </div>
    </section>
  );
}

// ─── How It Works ─────────────────────────────────────────────────────────────

function HowItWorks() {
  const steps = [
    { n: 'I', weeks: 'Semana 1', title: 'Diagnóstico operacional', desc: 'Mapeamos rotinas, gargalos por setor e indicadores que importam para a sua hotelaria.' },
    { n: 'II', weeks: 'Semanas 2–3', title: 'Implantação assistida', desc: 'Migração de dados, configuração de tarifários, treinamento por função e ambiente de homologação.' },
    { n: 'III', weeks: 'Semana 4', title: 'Go-live com supervisão', desc: 'Acompanhamento presencial nos primeiros check-ins, fechamentos e conciliações.' },
    { n: 'IV', weeks: 'A partir do mês 2', title: 'Operação contínua', desc: 'Suporte 24/7, atualizações mensais e revisão trimestral de indicadores com a gestão.' },
  ];
  return (
    <section id="operacao" className="relative bg-ink py-16 text-paper sm:py-24 lg:py-36 overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{ backgroundImage: 'radial-gradient(circle at 20% 0%, oklch(0.72 0.12 75) 0%, transparent 40%), radial-gradient(circle at 90% 100%, oklch(0.36 0.04 145) 0%, transparent 50%)' }} />
      <div className="relative mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
        <div className="max-w-3xl">
          <p className="text-[11px] uppercase tracking-[0.28em] text-paper/50">· Como implantamos</p>
          <h2 className="mt-4 font-display text-3xl font-light leading-[1.05] tracking-[-0.02em] sm:mt-5 sm:text-4xl lg:text-6xl">
            Do <span className="italic text-gold">caderno de turno</span> a decisões em tempo real — em quatro etapas.
          </h2>
        </div>
        <div className="mt-12 grid gap-px bg-paper/10 grid-cols-1 sm:grid-cols-2 sm:mt-16 lg:grid-cols-4 lg:mt-20">
          {steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 130} className="bg-ink p-6 sm:p-8 lg:p-10">
              <div className="flex items-baseline justify-between">
                <span className="font-display text-4xl font-light italic text-gold sm:text-5xl">{s.n}</span>
                <span className="text-[10px] uppercase tracking-[0.22em] text-paper/40">{s.weeks}</span>
              </div>
              <h3 className="mt-6 font-display text-lg font-medium sm:mt-8 sm:text-xl">{s.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-paper/65">{s.desc}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────

function FAQ() {
  const [open, setOpen] = useState(0);
  const faqs = [
    { q: 'Quanto tempo leva a implantação completa?', a: 'O cronograma é definido após o diagnóstico operacional e considera o porte do hotel, número de UHs e módulos ativados. Trabalhamos em fases — diagnóstico, configuração, treinamento e go-live assistido — para que a virada aconteça sem interromper a operação.' },
    { q: 'Vocês migram os dados do meu sistema atual?', a: 'Sim. Migramos cadastros de hóspedes, histórico de reservas, contas a pagar/receber em aberto e tarifários vigentes. Mantemos o sistema antigo em paralelo durante a primeira semana de operação para garantir uma transição segura.' },
    { q: 'Funciona com motor de reservas e channel manager?', a: 'Sim. A plataforma foi desenhada para operar integrada a channel managers e motores de reservas do mercado, mantendo disponibilidade e tarifa sincronizadas em tempo real.' },
    { q: 'Como funciona o suporte?', a: 'Suporte por WhatsApp, telefone e plataforma. Hotéis com operação 24/7 contam com canal prioritário e, no plano Enterprise, gerente de conta dedicado.' },
    { q: 'Os meus dados ficam seguros?', a: 'Toda a infraestrutura roda em nuvem brasileira, com backups criptografados, conformidade LGPD e trilha de auditoria completa de qualquer alteração feita por usuário.' },
  ];
  return (
    <section id="faq" className="relative py-16 sm:py-24 lg:py-36">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-6 sm:gap-16 lg:grid-cols-12 lg:px-10">
        <div className="lg:col-span-4">
          <p className="text-[11px] uppercase tracking-[0.28em] text-stone-500">· Perguntas frequentes</p>
          <h2 className="mt-4 font-display text-3xl font-light leading-[1.05] tracking-[-0.02em] sm:mt-5 sm:text-4xl lg:text-5xl">
            Antes de marcar a <span className="italic">demonstração.</span>
          </h2>
          <p className="mt-5 text-sm text-ink/65 sm:text-base">Não encontrou o que procurava? Fale direto com a nossa equipe comercial.</p>
        </div>
        <div className="divide-y divide-ink/10 border-y border-ink/10 lg:col-span-8">
          {faqs.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={i}>
                <button onClick={() => setOpen(isOpen ? -1 : i)}
                  className="group flex w-full items-center justify-between gap-4 py-5 text-left sm:py-6">
                  <span className="flex items-baseline gap-3 sm:gap-5">
                    <span className="hidden font-display text-sm tracking-[0.2em] text-stone-500/70 sm:inline">{String(i + 1).padStart(2, '0')}</span>
                    <span className="font-display text-base font-medium sm:text-xl md:text-2xl">{f.q}</span>
                  </span>
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ink/15 transition-all sm:h-9 sm:w-9 ${isOpen ? 'rotate-45 bg-ink text-paper' : 'text-ink/60'}`}>
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
                  </span>
                </button>
                {isOpen && <p className="max-w-2xl pb-6 pl-0 text-sm text-ink/70 sm:pl-12 sm:text-base sm:pb-7">{f.a}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── Demo CTA ─────────────────────────────────────────────────────────────────

function DemoCTA() {
  const wa = useMagnetic({ strength: 0.25 });
  return (
    <section id="demo" className="relative overflow-hidden py-16 sm:py-24 lg:py-36">
      <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
        <div className="relative overflow-hidden rounded-2xl bg-ink p-6 text-paper sm:rounded-[2rem] sm:p-10 md:p-14 lg:p-20">
          <div aria-hidden className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-gold/25" style={{ filter: 'blur(48px)' }} />
          <div aria-hidden className="absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-moss/30" style={{ filter: 'blur(48px)' }} />
          <div className="relative grid gap-10 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <p className="text-[11px] uppercase tracking-[0.28em] text-paper/50">· Solicitar demonstração</p>
              <h2 className="mt-4 font-display text-3xl font-light leading-[1.04] tracking-[-0.02em] sm:mt-5 sm:text-4xl lg:text-[3.5rem]">
                Veja o Royal PMS <span className="italic text-gold">no seu cenário.</span>
              </h2>
              <p className="mt-5 max-w-md text-sm text-paper/70 sm:mt-6 sm:text-base">30 minutos, ao vivo, com um especialista em hotelaria. Sem apresentação comercial genérica — abrimos o sistema e simulamos a sua operação.</p>
              <ul className="mt-7 space-y-3 text-sm text-paper/75 sm:mt-10">
                {['Demonstração personalizada por porte do hotel', 'Proposta de implantação com prazo definido', 'Sem compromisso de contratação'].map(t => (
                  <li key={t} className="flex items-center gap-3"><span className="h-1 w-1 rounded-full bg-gold" />{t}</li>
                ))}
              </ul>
            </div>
            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-paper/15 bg-paper/5 p-5 backdrop-blur sm:p-8">
                <p className="text-[11px] uppercase tracking-[0.22em] text-paper/55">· Fale com o time comercial</p>
                <p className="mt-3 font-display text-2xl">Atendemos pelo WhatsApp.</p>
                <p className="mt-2 text-sm text-paper/65">Resposta em até 1 dia útil. Apresentamos o sistema, mapeamos a sua operação e enviamos uma proposta personalizada.</p>
                <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer"
                  ref={wa.ref as React.RefObject<HTMLAnchorElement>} style={wa.style}
                  className="group mt-7 flex w-full items-center justify-between rounded-full bg-gold px-7 py-4 text-sm font-medium text-ink hover:bg-gold-soft transition">
                  <span className="flex items-center gap-2">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1l-.9 1.2c-.2.2-.4.2-.6.1-.3-.2-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2.1-.4 0-.5-.1-.1-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4 0-.1-.3-.2-.6-.3M12 21.8c-1.7 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4c-1-1.6-1.5-3.4-1.5-5.3 0-5.5 4.4-9.9 9.9-9.9 2.6 0 5.1 1 7 2.9 1.9 1.9 2.9 4.4 2.9 7 0 5.5-4.4 9.9-9.9 9.9m8.4-18.3A11.8 11.8 0 0 0 12 0C5.5 0 .2 5.3.2 11.9c0 2.1.5 4.1 1.6 5.9L.1 24l6.3-1.7c1.7.9 3.6 1.4 5.7 1.4 6.5 0 11.9-5.3 11.9-11.9 0-3.2-1.2-6.2-3.5-8.4z" />
                    </svg>
                    Falar no WhatsApp
                  </span>
                  <span className="transition-transform group-hover:translate-x-1">→</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-ink/10 bg-paper">
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-6 sm:py-16 lg:px-10">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/15">
                <span className="font-display text-lg italic">R</span>
              </div>
              <div>
                <p className="font-display text-base">Royal PMS</p>
                <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Plataforma de hotelaria</p>
              </div>
            </div>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-ink/65">Software para hotéis e pousadas que valorizam padrão, discrição e uma operação realmente integrada — do check-in ao fechamento.</p>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 sm:gap-10 lg:col-span-7">
            {[
              { title: 'Plataforma', items: ['Módulos', 'Telas do sistema', 'Como funciona', 'Para hóspedes'] },
              { title: 'Empresa', items: ['Royal Macaé Palace', 'Reservar hospedagem', 'Solicitar demonstração'] },
              { title: 'Contato', items: ['WhatsApp comercial', 'Macaé / RJ — Brasil'] },
            ].map(c => (
              <div key={c.title}>
                <p className="text-[11px] uppercase tracking-[0.22em] text-stone-500">{c.title}</p>
                <ul className="mt-5 space-y-3">
                  {c.items.map(item => <li key={item}><a href="#" className="text-sm text-ink/75 hover:text-ink transition">{item}</a></li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-ink/10 pt-8 text-xs text-stone-500 sm:flex-row sm:items-center sm:mt-16">
          <p>© 2026 Royal PMS — Brasil</p>
          <p className="font-display italic">"Hospitalidade é detalhe."</p>
        </div>
      </div>
    </footer>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function MarketingLanding() {
  const [loginOpen, setLoginOpen] = useState(false);
  return (
    <div className="min-h-screen overflow-x-clip bg-paper text-ink" style={{ fontFamily: 'Inter, system-ui, sans-serif', WebkitFontSmoothing: 'antialiased' }}>
      <ScrollProgress />
      <CursorGlow />
      <Header onLogin={() => setLoginOpen(true)} />
      <main>
        <Hero onLogin={() => setLoginOpen(true)} />
        <Marquee />
        <FeaturesBento />
        <PinnedNarrative />
        <Modules />
        <Hospedes />
        <HowItWorks />
        <FAQ />
        <DemoCTA />
      </main>
      <Footer />
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  );
}
