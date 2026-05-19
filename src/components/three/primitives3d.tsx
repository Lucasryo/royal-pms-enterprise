import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { useMotionValue, useSpring, useTransform, motion, type MotionValue } from 'motion/react';

/* ============================================================
 * primitives3d — base 3D para os dashboards do PMS
 *  - usePrefersReducedMotion: respeita acessibilidade
 *  - useTilt: parallax de mouse via motion values (sem re-render)
 *  - Stage3D: container com perspective
 *  - TiltCard: cartao com tilt 3D
 *  - ShaderCanvas: WebGL2 + GLSL para fundos animados
 * ============================================================ */

export function usePrefersReducedMotion() {
  const ref = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    ref.current = mq.matches;
    const handler = (e: MediaQueryListEvent) => { ref.current = e.matches; };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return ref;
}

export function useTilt(strength = 10) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 90, damping: 18, mass: 0.55 });
  const sy = useSpring(y, { stiffness: 90, damping: 18, mass: 0.55 });
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
      const nx = ((pending.cx - r.left) / r.width) * 2 - 1;
      const ny = ((pending.cy - r.top) / r.height) * 2 - 1;
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

export function Stage3D({
  children,
  className = '',
  perspective = 1400,
  style,
}: {
  children: ReactNode;
  className?: string;
  perspective?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      className={className}
      style={{
        perspective: `${perspective}px`,
        transformStyle: 'preserve-3d',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function TiltCard({
  children,
  className = '',
  strength = 8,
  glare = true,
}: {
  children: ReactNode;
  className?: string;
  strength?: number;
  glare?: boolean;
}) {
  const { ref, rx, ry, sx, sy } = useTilt(strength);
  const glareX = useTransform(sx, [-1, 1], ['0%', '100%']);
  const glareY = useTransform(sy, [-1, 1], ['0%', '100%']);

  return (
    <motion.div
      ref={ref}
      style={{
        rotateX: rx,
        rotateY: ry,
        transformStyle: 'preserve-3d',
        willChange: 'transform',
      }}
      className={`relative ${className}`}
    >
      {children}
      {glare && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] mix-blend-screen"
          style={{
            background: useTransform(
              [glareX, glareY] as unknown as MotionValue<string>[],
              ([gx, gy]: string[]) =>
                `radial-gradient(380px circle at ${gx} ${gy}, rgba(255,255,255,0.18), transparent 60%)`,
            ),
          }}
        />
      )}
    </motion.div>
  );
}

/* ============================================================
 * ShaderCanvas — WebGL2 com GLSL para auroras/glow de fundo
 *  - leve, sem dependencias, com pause em prefers-reduced-motion
 *  - colorA/colorB em hex (#rrggbb)
 * ============================================================ */
type ShaderProps = {
  className?: string;
  colorA?: string;
  colorB?: string;
  intensity?: number;
};

const VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 u_res;
uniform float u_t;
uniform vec3 u_a;
uniform vec3 u_b;
uniform float u_k;

// hash + noise classico (simplex-ish barato)
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  float a = hash(i); float b = hash(i+vec2(1.0,0.0));
  float c = hash(i+vec2(0.0,1.0)); float d = hash(i+vec2(1.0,1.0));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
}
float fbm(vec2 p){
  float v=0.0; float a=0.5;
  for(int i=0;i<5;i++){ v += a*noise(p); p*=2.02; a*=0.5; }
  return v;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*u_res) / min(u_res.x, u_res.y);
  vec2 q = uv * 1.4;
  float t = u_t * 0.12;
  float n = fbm(q + vec2(t, -t*0.6));
  float m = fbm(q*1.6 + vec2(-t*0.4, t));
  float v = smoothstep(0.15, 0.95, n*0.6 + m*0.6);
  vec3 col = mix(u_a, u_b, v);
  // gold sparkle highlight
  float h = pow(fbm(q*3.0 + t*1.8), 6.0);
  col += h * 0.45 * u_k;
  // vinheta editorial
  float r = length(uv);
  col *= smoothstep(1.25, 0.2, r);
  outColor = vec4(col, 1.0);
}`;

function hexToVec3(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function ShaderCanvas({
  className = '',
  colorA = '#1a1208',
  colorB = '#d6a85a',
  intensity = 1,
}: ShaderProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false });
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.warn('shader err', gl.getShaderInfoLog(sh));
      }
      return sh;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'u_res');
    const uT = gl.getUniformLocation(prog, 'u_t');
    const uA = gl.getUniformLocation(prog, 'u_a');
    const uB = gl.getUniformLocation(prog, 'u_b');
    const uK = gl.getUniformLocation(prog, 'u_k');

    const a = hexToVec3(colorA);
    const b = hexToVec3(colorB);
    gl.uniform3f(uA, a[0], a[1], a[2]);
    gl.uniform3f(uB, b[0], b[1], b[2]);
    gl.uniform1f(uK, intensity);

    let raf = 0;
    const start = performance.now();
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = canvas.clientWidth * dpr;
      const h = canvas.clientHeight * dpr;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
        gl.viewport(0, 0, w, h);
        gl.uniform2f(uRes, w, h);
      }
    };
    const tick = () => {
      resize();
      const t = (performance.now() - start) / 1000;
      gl.uniform1f(uT, t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reduced.current) raf = requestAnimationFrame(tick);
    };
    tick();
    const ro = new ResizeObserver(() => { resize(); if (reduced.current) tick(); });
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      gl.deleteProgram(prog);
      gl.deleteBuffer(buf);
    };
  }, [colorA, colorB, intensity, reduced]);

  return <canvas ref={ref} className={className} aria-hidden />;
}
