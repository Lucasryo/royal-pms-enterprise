import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Menu, X } from 'lucide-react';
import Login from './Login';

/* ============================================================
 * Royal PMS — Landing 3D
 * ----------------------------------------------------------------
 * • WebGL + GLSL  → fragment shader animado no background da hero
 * • CSS 3D        → perspective / rotateX / rotateY / translateZ
 * • JS parallax   → rotação dos painéis seguindo o mouse e o scroll
 * • React + Motion→ orquestração de entrada e estado
 * ============================================================ */

const WHATSAPP_NUMBER = '5522996105104';
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}`;

const navLinks = [
  { href: '#telas', label: 'Telas em 3D' },
  { href: '#modulos', label: 'Módulos' },
  { href: '#operacao', label: 'Operação' },
  { href: '#contato', label: 'Contato' },
];

/* ============================================================
 * 1. GLSL SHADER BACKGROUND (WebGL puro, sem three.js)
 * ============================================================ */
const VERTEX_SHADER = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;
uniform vec2  u_resolution;
uniform float u_time;
uniform vec2  u_mouse;

// — simplex-like cheap noise —
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
float fbm(vec2 p){
  float v = 0.0; float a = 0.5;
  for(int i = 0; i < 5; i++){
    v += a * noise(p);
    p *= 2.02; a *= 0.5;
  }
  return v;
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 p  = uv * 2.0 - 1.0;
  p.x *= u_resolution.x / u_resolution.y;

  // mouse parallax shift
  vec2 m = (u_mouse / u_resolution.xy) * 2.0 - 1.0;
  p += m * 0.18;

  float t = u_time * 0.06;

  // flowing field
  vec2  q  = vec2(fbm(p + t), fbm(p - t + 5.2));
  float n  = fbm(p + 1.8 * q + t * 0.5);

  // editorial palette: paper → soft gold → ink
  vec3 paper = vec3(0.972, 0.957, 0.918);
  vec3 gold  = vec3(0.866, 0.682, 0.345);
  vec3 moss  = vec3(0.211, 0.286, 0.227);
  vec3 ink   = vec3(0.105, 0.090, 0.075);

  vec3 col = mix(paper, gold, smoothstep(0.30, 0.85, n));
  col      = mix(col,   moss, smoothstep(0.55, 1.00, n) * 0.35);
  col      = mix(col,   ink,  smoothstep(0.78, 1.05, n) * 0.55);

  // soft vignette
  float vign = smoothstep(1.35, 0.30, length(p));
  col *= mix(0.70, 1.05, vign);

  // film grain
  float g = fract(sin(dot(uv * u_resolution.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (g - 0.5) * 0.025;

  gl_FragColor = vec4(col, 1.0);
}
`;

function ShaderCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef  = useRef<[number, number]>([0, 0]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { antialias: true, premultipliedAlpha: false });
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.warn('GLSL compile error:', gl.getShaderInfoLog(sh));
      }
      return sh;
    };

    const vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const loc = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes   = gl.getUniformLocation(prog, 'u_resolution');
    const uTime  = gl.getUniformLocation(prog, 'u_time');
    const uMouse = gl.getUniformLocation(prog, 'u_mouse');

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
      canvas.width  = canvas.clientWidth  * dpr;
      canvas.height = canvas.clientHeight * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);

    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      mouseRef.current = [
        (e.clientX - r.left) * (canvas.width  / r.width),
        (r.height - (e.clientY - r.top)) * (canvas.height / r.height),
      ];
    };
    window.addEventListener('mousemove', onMove);

    let raf = 0;
    const t0 = performance.now();
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, t);
      gl.uniform2f(uMouse, mouseRef.current[0], mouseRef.current[1]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 -z-10 h-full w-full"
      aria-hidden
    />
  );
}

/* ============================================================
 * 2. SCREEN 3D — painel "tela do sistema" em perspectiva
 * ============================================================ */
function Screen3D({
  rx, ry, tz, x, y, scale = 1, delay = 0, children, glow,
}: {
  rx: number; ry: number; tz: number;
  x: string; y: string; scale?: number; delay?: number;
  children: ReactNode; glow?: string;
}) {
  const style: CSSProperties = {
    left: x, top: y,
    transform: `translate(-50%, -50%) translateZ(${tz}px) rotateX(${rx}deg) rotateY(${ry}deg) scale(${scale})`,
    transformStyle: 'preserve-3d',
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 60 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1.1, delay, ease: [0.22, 1, 0.36, 1] }}
      className="absolute w-[280px] sm:w-[340px] lg:w-[400px]"
      style={style}
    >
      {glow && (
        <div
          aria-hidden
          className="absolute -inset-10 -z-10 rounded-[3rem] blur-3xl opacity-60"
          style={{ background: glow }}
        />
      )}
      <div className="overflow-hidden rounded-2xl border border-ink/15 bg-white shadow-[0_40px_100px_-25px_rgba(20,15,10,0.55)]">
        <div className="flex items-center justify-between border-b border-ink/10 bg-paper/70 px-4 py-2">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-ink/15" />
            <span className="h-2 w-2 rounded-full bg-ink/15" />
            <span className="h-2 w-2 rounded-full bg-ink/15" />
          </div>
          <div className="text-[9px] uppercase tracking-[0.2em] text-stone-500">royalpms.app</div>
        </div>
        {children}
      </div>
    </motion.div>
  );
}

/* — Mockups das telas reais — */
function MiniReservas() {
  return (
    <div className="p-4">
      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500">Central de reservas</p>
      <div className="mt-3 grid grid-cols-7 gap-1 text-[8px]">
        {['S','T','Q','Q','S','S','D'].map(d => <div key={d} className="text-center text-stone-400">{d}</div>)}
        {Array.from({length: 28}).map((_, i) => {
          const filled = [3,4,5,9,10,11,12,16,17,22,23,24,25].includes(i);
          const half = [6,18].includes(i);
          return (
            <div key={i} className={`h-5 rounded-[3px] ${filled ? 'bg-ink' : half ? 'bg-gold/60' : 'bg-paper border border-ink/10'}`} />
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between text-[10px]">
        <span className="text-stone-500">Ocupação · semana</span>
        <span className="font-display text-base text-ink">87%</span>
      </div>
    </div>
  );
}

function MiniGovernanca() {
  const rooms = [
    {n:'301', s:'limpo'}, {n:'302', s:'sujo'}, {n:'303', s:'manut'}, {n:'304', s:'limpo'},
    {n:'305', s:'limpo'}, {n:'306', s:'sujo'}, {n:'307', s:'limpo'}, {n:'308', s:'inspec'},
    {n:'309', s:'limpo'}, {n:'310', s:'sujo'}, {n:'311', s:'limpo'}, {n:'312', s:'limpo'},
  ];
  const color = (s:string) => s==='limpo'?'bg-moss/80 text-paper': s==='sujo'?'bg-amber-700/80 text-paper': s==='manut'?'bg-red-700/80 text-paper':'bg-gold text-ink';
  return (
    <div className="p-4">
      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500">Governança · andar 3</p>
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {rooms.map(r => (
          <div key={r.n} className={`rounded-md ${color(r.s)} px-1.5 py-2 text-center`}>
            <p className="text-[10px] font-medium">{r.n}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-3 text-[9px] text-stone-500">
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-moss"/>limpo</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-700"/>sujo</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-red-700"/>manut.</span>
      </div>
    </div>
  );
}

function MiniDashboard() {
  return (
    <div className="bg-ink p-4 text-paper">
      <p className="text-[10px] uppercase tracking-[0.18em] text-paper/50">Indicadores · hoje</p>
      <p className="mt-2 font-display text-4xl font-light">84%</p>
      <p className="text-[10px] text-paper/60">68 / 81 UHs</p>
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-paper/10">
        <div className="h-full w-[84%] rounded-full bg-gradient-to-r from-gold to-gold-soft" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-[10px]">
        <div><p className="text-paper/50">ADR</p><p className="font-display text-base">R$286</p></div>
        <div><p className="text-paper/50">RevPAR</p><p className="font-display text-base">R$240</p></div>
        <div><p className="text-paper/50">GOP</p><p className="font-display text-base">38%</p></div>
      </div>
      <div className="mt-3 flex h-8 items-end gap-1">
        {[40, 65, 50, 80, 70, 90, 75, 95, 60, 85, 78, 92].map((h, i) => (
          <div key={i} className="flex-1 rounded-sm bg-gold/80" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

function MiniManutencao() {
  const items = [
    { p:'P1', t:'Ar-cond. UH 412', s:'em curso' },
    { p:'P2', t:'Lâmpada corredor 3', s:'aberto' },
    { p:'P1', t:'Vazamento UH 207', s:'em curso' },
    { p:'P3', t:'Pintura recepção',  s:'agendado' },
  ];
  return (
    <div className="p-4">
      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500">Fila de manutenção</p>
      <ul className="mt-3 space-y-2">
        {items.map((i, k) => (
          <li key={k} className="flex items-center gap-2 rounded-md border border-ink/10 bg-paper/40 px-2 py-1.5">
            <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${i.p==='P1'?'bg-red-700 text-paper':i.p==='P2'?'bg-amber-600 text-paper':'bg-stone-400 text-paper'}`}>{i.p}</span>
            <span className="flex-1 text-[10px] text-ink">{i.t}</span>
            <span className="text-[9px] uppercase tracking-wider text-stone-500">{i.s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MiniPOS() {
  return (
    <div className="p-4">
      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500">A&amp;B · Comanda</p>
      <div className="mt-3 space-y-1.5 text-[11px]">
        {[
          ['2x Espresso', 'R$ 18,00'],
          ['1x Sanduíche', 'R$ 32,00'],
          ['1x Vinho Malbec', 'R$ 89,00'],
          ['1x Sobremesa',  'R$ 24,00'],
        ].map(([t,v]) => (
          <div key={t} className="flex justify-between border-b border-ink/5 pb-1">
            <span className="text-ink/80">{t}</span>
            <span className="text-ink">{v}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-between border-t border-ink/15 pt-2">
        <span className="text-[10px] uppercase tracking-wider text-stone-500">Total</span>
        <span className="font-display text-lg text-ink">R$ 163,00</span>
      </div>
      <button className="mt-3 w-full rounded-lg bg-ink py-1.5 text-[10px] font-medium uppercase tracking-wider text-paper">
        Lançar no apto. 412
      </button>
    </div>
  );
}

function MiniRecepcao() {
  return (
    <div className="p-4">
      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500">Check-in · 14h22</p>
      <div className="mt-3 rounded-lg border border-ink/10 bg-paper/60 p-2.5">
        <p className="font-display text-sm text-ink">Mariana Aragão</p>
        <p className="text-[10px] text-stone-500">RG verificado · LGPD aceita</p>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
        <div className="rounded bg-paper/40 p-1.5">
          <p className="text-stone-500">UH</p>
          <p className="font-display text-sm text-ink">412 · Luxo</p>
        </div>
        <div className="rounded bg-paper/40 p-1.5">
          <p className="text-stone-500">Saída</p>
          <p className="font-display text-sm text-ink">21/05</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button className="flex-1 rounded-md border border-ink/20 py-1 text-[10px] text-ink/80">Imprimir FNRH</button>
        <button className="flex-1 rounded-md bg-gold py-1 text-[10px] font-medium text-ink">Liberar chave</button>
      </div>
    </div>
  );
}

/* ============================================================
 * 3. SCENE 3D — palco com parallax de mouse + rotação contínua
 * ============================================================ */
function Scene3D() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const el = stageRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width)  * 2 - 1;
      const ny = ((e.clientY - r.top)  / r.height) * 2 - 1;
      setTilt({ rx: -ny * 6, ry: nx * 10 });
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  return (
    <div
      ref={stageRef}
      className="relative h-[560px] w-full sm:h-[640px] lg:h-[720px]"
      style={{ perspective: '1600px', perspectiveOrigin: '50% 45%' }}
    >
      <motion.div
        className="absolute inset-0"
        animate={{ rotateX: tilt.rx, rotateY: tilt.ry }}
        transition={{ type: 'spring', stiffness: 60, damping: 18, mass: 0.6 }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* central / front — Dashboard */}
        <Screen3D
          x="50%" y="50%" tz={120} rx={4} ry={-6} scale={1.05} delay={0.15}
          glow="radial-gradient(closest-side, rgba(218,170,90,0.55), transparent 70%)"
        >
          <MiniDashboard />
        </Screen3D>

        {/* left back — Reservas */}
        <Screen3D
          x="22%" y="38%" tz={-80} rx={6} ry={22} scale={0.85} delay={0.35}
          glow="radial-gradient(closest-side, rgba(180,83,9,0.35), transparent 70%)"
        >
          <MiniReservas />
        </Screen3D>

        {/* right back — Governança */}
        <Screen3D
          x="78%" y="36%" tz={-60} rx={5} ry={-22} scale={0.85} delay={0.45}
          glow="radial-gradient(closest-side, rgba(56,90,72,0.45), transparent 70%)"
        >
          <MiniGovernanca />
        </Screen3D>

        {/* bottom left — Manutenção */}
        <Screen3D
          x="18%" y="78%" tz={40} rx={-8} ry={18} scale={0.78} delay={0.55}
        >
          <MiniManutencao />
        </Screen3D>

        {/* bottom right — POS */}
        <Screen3D
          x="82%" y="80%" tz={50} rx={-10} ry={-18} scale={0.78} delay={0.65}
        >
          <MiniPOS />
        </Screen3D>

        {/* floating top — Recepção */}
        <Screen3D
          x="62%" y="14%" tz={200} rx={12} ry={-14} scale={0.7} delay={0.75}
          glow="radial-gradient(closest-side, rgba(218,170,90,0.5), transparent 70%)"
        >
          <MiniRecepcao />
        </Screen3D>

        {/* decorative golden ring far back */}
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-gold/30"
          style={{ transform: 'translate(-50%, -50%) translateZ(-300px) rotateX(70deg)' }}
        />
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-ink/10"
          style={{ transform: 'translate(-50%, -50%) translateZ(-400px) rotateX(70deg)' }}
        />
      </motion.div>
    </div>
  );
}

/* ============================================================
 * 4. TILT CARD — módulo do sistema com 3D no hover
 * ============================================================ */
function TiltCard({ n, title, desc, icon }: { n: string; title: string; desc: string; icon: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [t, setT] = useState({ rx: 0, ry: 0 });

  const onMove = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width)  * 2 - 1;
    const ny = ((e.clientY - r.top)  / r.height) * 2 - 1;
    setT({ rx: -ny * 8, ry: nx * 10 });
  };

  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={() => setT({ rx: 0, ry: 0 })} style={{ perspective: '900px' }}>
      <motion.div
        animate={{ rotateX: t.rx, rotateY: t.ry }}
        transition={{ type: 'spring', stiffness: 200, damping: 18 }}
        className="relative h-full rounded-2xl border border-ink/10 bg-paper p-6 transition-shadow hover:shadow-[0_30px_60px_-20px_rgba(20,15,10,0.25)]"
        style={{ transformStyle: 'preserve-3d' }}
      >
        <div style={{ transform: 'translateZ(40px)' }} className="flex items-center justify-between">
          <span className="font-display text-2xl font-light italic text-gold">{n}</span>
          <div className="h-9 w-9 text-ink/70">{icon}</div>
        </div>
        <h3 style={{ transform: 'translateZ(30px)' }} className="mt-6 font-display text-xl font-medium text-ink">{title}</h3>
        <p style={{ transform: 'translateZ(20px)' }} className="mt-2 text-sm leading-relaxed text-ink/65">{desc}</p>
      </motion.div>
    </div>
  );
}

const moduleIcon = (path: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d={path} />
  </svg>
);

const modules = [
  { n: '01', title: 'Reservas',     desc: 'Disponibilidade, tarifa, garantia e ocupação em um único fluxo.', icon: moduleIcon('M3 10h18M8 3v4M16 3v4M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v15H3z') },
  { n: '02', title: 'Recepção',     desc: 'Check-in expresso, FNRH, leitura de documento e assinatura digital.', icon: moduleIcon('M3 21v-2a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v2M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z') },
  { n: '03', title: 'Governança',   desc: 'Status de UH em tempo real, escalas e checklist de limpeza.', icon: moduleIcon('M3 7l9-4 9 4M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M9 21V12h6v9') },
  { n: '04', title: 'Manutenção',   desc: 'Chamados priorizados por UH, fotos, fila por setor e SLA.', icon: moduleIcon('M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-2.5z') },
  { n: '05', title: 'A&B / POS',    desc: 'Comandas, débito em conta e ponto de venda integrado.', icon: moduleIcon('M4 3v18M4 8h6M10 3v18M14 3l2 5v13M16 8h4') },
  { n: '06', title: 'Eventos',      desc: 'Salões, propostas, contratos e produção do orçamento ao faturamento.', icon: moduleIcon('M5 21V8l7-5 7 5v13M9 21v-6h6v6') },
  { n: '07', title: 'Financeiro',   desc: 'Conciliação bancária, contas a pagar/receber, DRE.', icon: moduleIcon('M12 1v22M17 5H9a3 3 0 0 0 0 6h6a3 3 0 0 1 0 6H7') },
  { n: '08', title: 'Auditoria',    desc: 'Trilha completa, fechamento noturno e relatórios fiscais.', icon: moduleIcon('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13l2 2 4-4') },
];

/* ============================================================
 * 5. CAROUSEL 3D — telas do sistema rotacionando sobre cilindro
 * ============================================================ */
const screens = [
  { title: 'Central de reservas',    panel: <MiniReservas /> },
  { title: 'Mapa de governança',     panel: <MiniGovernanca /> },
  { title: 'Indicadores gerenciais', panel: <MiniDashboard /> },
  { title: 'Fila de manutenção',     panel: <MiniManutencao /> },
  { title: 'Ponto de venda (A&B)',   panel: <MiniPOS /> },
  { title: 'Check-in da recepção',   panel: <MiniRecepcao /> },
];

function Carousel3D() {
  const [angle, setAngle] = useState(0);
  const dragging = useRef<{ x: number; a: number } | null>(null);
  const radius = 480;
  const step   = 360 / screens.length;

  useEffect(() => {
    const id = setInterval(() => {
      if (!dragging.current) setAngle(a => a - 0.25);
    }, 50);
    return () => clearInterval(id);
  }, []);

  const onDown = (e: React.PointerEvent) => {
    dragging.current = { x: e.clientX, a: angle };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    setAngle(dragging.current.a + (e.clientX - dragging.current.x) * 0.35);
  };
  const onUp = (e: React.PointerEvent) => {
    dragging.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <div
      className="relative h-[460px] w-full select-none sm:h-[520px]"
      style={{ perspective: '1400px' }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <div
        className="relative left-1/2 top-1/2 h-0 w-0"
        style={{
          transformStyle: 'preserve-3d',
          transform: `translate(-50%, -50%) rotateX(-8deg) rotateY(${angle}deg)`,
          transition: dragging.current ? 'none' : 'transform 0.1s linear',
        }}
      >
        {screens.map((s, i) => (
          <div
            key={i}
            className="absolute w-[280px] sm:w-[320px]"
            style={{
              left: '-160px',
              top:  '-180px',
              transform: `rotateY(${i * step}deg) translateZ(${radius}px)`,
              transformStyle: 'preserve-3d',
            }}
          >
            <div className="overflow-hidden rounded-2xl border border-ink/15 bg-white shadow-[0_30px_80px_-25px_rgba(20,15,10,0.6)]">
              <div className="flex items-center justify-between border-b border-ink/10 bg-paper/70 px-4 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-ink/15" />
                  <span className="h-2 w-2 rounded-full bg-ink/15" />
                  <span className="h-2 w-2 rounded-full bg-ink/15" />
                </div>
                <span className="text-[9px] uppercase tracking-[0.18em] text-stone-500">{s.title}</span>
              </div>
              {s.panel}
            </div>
          </div>
        ))}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-[10px] uppercase tracking-[0.22em] text-stone-500">
        arraste para girar
      </div>
    </div>
  );
}

/* ============================================================
 * 6. LANDING — componente raiz
 * ============================================================ */
export default function Landing3D() {
  const [loginOpen, setLoginOpen]   = useState(false);
  const [menuOpen,  setMenuOpen]    = useState(false);
  const [scrolled,  setScrolled]    = useState(false);

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
      <header
        className={`fixed inset-x-0 top-0 z-40 transition-all duration-500 ${
          scrolled ? 'border-b border-ink/10 bg-paper/85 backdrop-blur-xl' : 'bg-transparent'
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-10">
          <a href="#inicio" className="flex items-center gap-2.5" onClick={() => setMenuOpen(false)}>
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/15 bg-paper">
              <span className="font-display text-base italic leading-none text-ink">R</span>
            </div>
            <div className="leading-tight">
              <p className="font-display text-sm font-medium tracking-tight text-ink">Royal PMS</p>
              <p className="hidden text-[10px] uppercase tracking-[0.18em] text-stone-500 sm:block">Plataforma 3D · hotelaria</p>
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
            <button onClick={() => setLoginOpen(true)} className="hidden text-sm text-ink/70 hover:text-ink md:inline">
              Acessar
            </button>
            <a
              href="#contato"
              className="group hidden md:inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-all hover:gap-3"
            >
              Ver demonstração <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
            </a>
            <a
              href="#contato"
              className="inline-flex md:hidden items-center rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper"
            >
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
                <button
                  onClick={() => { setMenuOpen(false); setLoginOpen(true); }}
                  className="mt-3 w-full rounded-full border border-ink/20 py-3 text-sm font-medium text-ink/70"
                >
                  Já tenho acesso — entrar
                </button>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main>
        {/* HERO com WebGL/GLSL + cena 3D */}
        <section id="inicio" className="relative overflow-hidden pt-24 pb-12 sm:pt-32 sm:pb-20 lg:pt-40">
          <ShaderCanvas />
          {/* paper fade na base para amarrar com a próxima sessão */}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-paper" />

          <div className="relative mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
            <div className="grid items-center gap-10 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <motion.div
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
                  className="inline-flex items-center gap-3 rounded-full border border-ink/15 bg-paper/70 px-4 py-1.5 backdrop-blur"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse-dot" />
                  <span className="text-[11px] uppercase tracking-[0.22em] text-stone-700">
                    Nova experiência · 3D
                  </span>
                </motion.div>

                <motion.h1
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.1 }}
                  className="mt-5 font-display text-4xl font-light leading-[1.02] tracking-[-0.02em] text-ink text-balance sm:mt-7 sm:text-5xl lg:text-[5.25rem]"
                >
                  A operação do hotel,
                  <br />
                  <span className="italic text-ink/90">em três dimensões.</span>
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.25 }}
                  className="mt-5 max-w-xl text-base leading-relaxed text-ink/75 text-pretty sm:mt-7 sm:text-lg"
                >
                  Reservas, recepção, governança, manutenção, A&amp;B, eventos e financeiro — orquestrados em uma só
                  plataforma. Cada tela do sistema, agora, gira no espaço.
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.4 }}
                  className="mt-7 flex flex-wrap items-center gap-3 sm:mt-10 sm:gap-4"
                >
                  <a
                    href="#contato"
                    className="group inline-flex items-center gap-3 rounded-full bg-ink px-7 py-4 text-sm font-medium text-paper transition-all hover:bg-ink/90"
                  >
                    Solicitar demonstração
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gold text-ink transition-transform group-hover:translate-x-0.5">→</span>
                  </a>
                  <button
                    onClick={() => setLoginOpen(true)}
                    className="group inline-flex items-center gap-2 px-2 py-3 text-sm font-medium text-ink"
                  >
                    <span className="border-b border-ink/30 pb-0.5 group-hover:border-ink">Já tenho acesso</span>
                  </button>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.6 }}
                  className="mt-8 grid max-w-md grid-cols-3 gap-4 border-t border-ink/15 pt-5 text-xs sm:mt-12 sm:gap-6 sm:pt-6"
                >
                  <div>
                    <p className="font-display text-2xl font-light text-ink">WebGL</p>
                    <p className="mt-1 uppercase tracking-[0.16em] text-stone-600">render acelerado por GPU</p>
                  </div>
                  <div>
                    <p className="font-display text-2xl font-light text-ink">24/7</p>
                    <p className="mt-1 uppercase tracking-[0.16em] text-stone-600">operação contínua</p>
                  </div>
                  <div>
                    <p className="font-display text-2xl font-light text-ink">LGPD</p>
                    <p className="mt-1 uppercase tracking-[0.16em] text-stone-600">dados em conformidade</p>
                  </div>
                </motion.div>
              </div>

              <div className="lg:col-span-7">
                <Scene3D />
              </div>
            </div>
          </div>
        </section>

        {/* TELAS 3D — carrossel cilíndrico */}
        <section id="telas" className="relative bg-ink py-16 text-paper sm:py-24 lg:py-32 overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage:
                'radial-gradient(circle at 20% 0%, oklch(0.72 0.12 75) 0%, transparent 40%), radial-gradient(circle at 80% 100%, oklch(0.36 0.04 145) 0%, transparent 50%)',
            }}
          />
          <div className="relative mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
            <div className="grid gap-8 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <p className="text-[11px] uppercase tracking-[0.28em] text-paper/50">· Telas do sistema</p>
                <h2 className="mt-4 font-display text-3xl font-light leading-[1.05] tracking-[-0.02em] text-balance sm:mt-5 sm:text-4xl lg:text-6xl">
                  Seis módulos, <span className="italic text-gold">um palco</span>.
                </h2>
              </div>
              <p className="text-sm leading-relaxed text-paper/70 text-pretty sm:text-base lg:col-span-6 lg:col-start-7 lg:mt-3">
                Cada painel é uma tela real do Royal PMS — recepção, governança, manutenção, A&amp;B, indicadores e reservas
                — projetada num cilindro 3D que você arrasta para girar. Sem screenshot, sem maquete: é a interface viva.
              </p>
            </div>

            <div className="mt-12 sm:mt-16">
              <Carousel3D />
            </div>
          </div>
        </section>

        {/* MÓDULOS — tilt 3D no hover */}
        <section id="modulos" className="relative py-16 sm:py-24 lg:py-32">
          <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
            <div className="grid gap-8 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <p className="text-[11px] uppercase tracking-[0.28em] text-stone-500">· Módulos</p>
                <h2 className="mt-4 font-display text-3xl font-light leading-[1.05] tracking-[-0.02em] text-ink text-balance sm:mt-5 sm:text-4xl lg:text-6xl">
                  Toda a operação <span className="italic">em uma plataforma única.</span>
                </h2>
              </div>
              <p className="text-sm leading-relaxed text-ink/70 text-pretty sm:text-base lg:col-span-6 lg:col-start-7 lg:mt-3">
                Mesma base de dados, sem retrabalho entre setores. Ative apenas o que faz sentido para a sua hotelaria —
                e passe o mouse nos cartões para sentir o relevo de cada módulo.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-4 sm:mt-16 sm:grid-cols-2 lg:grid-cols-4">
              {modules.map(m => (
                <TiltCard key={m.n} {...m} />
              ))}
            </div>
          </div>
        </section>

        {/* OPERAÇÃO — bloco de stack tecnológica (transparência sobre o "como") */}
        <section id="operacao" className="relative bg-paper py-16 sm:py-24 lg:py-32 border-y border-ink/10">
          <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-10">
            <div className="grid gap-8 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <p className="text-[11px] uppercase tracking-[0.28em] text-stone-500">· Stack que move tudo</p>
                <h2 className="mt-4 font-display text-3xl font-light leading-[1.05] tracking-[-0.02em] text-ink text-balance sm:mt-5 sm:text-4xl lg:text-5xl">
                  Engenharia <span className="italic">sem improviso.</span>
                </h2>
              </div>
              <p className="text-sm leading-relaxed text-ink/70 text-pretty sm:text-base lg:col-span-6 lg:col-start-7 lg:mt-3">
                Esta landing usa WebGL com shader em GLSL para o background, CSS 3D com perspective real e parallax
                controlado por JavaScript — orquestrado em React. A plataforma por trás roda em nuvem, com banco
                Postgres em tempo real e auditoria criptografada de cada alteração.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-2 gap-3 sm:mt-16 sm:gap-6 sm:grid-cols-3 lg:grid-cols-6">
              {['React 19', 'TypeScript', 'WebGL / GLSL', 'CSS 3D', 'Postgres', 'Realtime'].map((s, i) => (
                <motion.div
                  key={s}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-10%' }}
                  transition={{ duration: 0.5, delay: i * 0.05 }}
                  className="rounded-xl border border-ink/10 bg-paper px-4 py-5 text-center"
                >
                  <p className="font-display text-base text-ink">{s}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA / CONTATO */}
        <section id="contato" className="relative bg-ink py-20 text-paper sm:py-28 lg:py-36 overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                'radial-gradient(circle at 50% 50%, oklch(0.72 0.12 75 / 0.2) 0%, transparent 55%)',
            }}
          />
          <div className="relative mx-auto max-w-4xl px-5 text-center sm:px-6 lg:px-10">
            <p className="text-[11px] uppercase tracking-[0.28em] text-paper/50">· Próximo passo</p>
            <h2 className="mt-4 font-display text-4xl font-light leading-[1.05] tracking-[-0.02em] text-balance sm:mt-5 sm:text-5xl lg:text-6xl">
              Sua operação merece <span className="italic text-gold">profundidade</span>.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-paper/70 text-pretty sm:mt-7 sm:text-base">
              Marque uma demonstração ao vivo. Em até 30 minutos mostramos o sistema rodando sobre o cenário do seu hotel.
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <a
                href={WHATSAPP_LINK}
                target="_blank"
                rel="noreferrer"
                className="group inline-flex items-center gap-3 rounded-full bg-gold px-8 py-4 text-sm font-medium text-ink transition-all hover:gap-4"
              >
                Falar pelo WhatsApp
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-gold transition-transform group-hover:translate-x-0.5">→</span>
              </a>
              <button
                onClick={() => setLoginOpen(true)}
                className="group inline-flex items-center gap-2 text-sm font-medium text-paper/90"
              >
                <span className="border-b border-paper/40 pb-0.5 group-hover:border-paper">Já sou cliente — entrar</span>
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
            <p className="text-xs text-stone-500">© {new Date().getFullYear()} · Hotelaria em três dimensões.</p>
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
              animate={{ opacity: 1, y: 0,  scale: 1 }}
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
