import { useEffect, useMemo, useRef } from 'react';
import { TrendingUp, DollarSign } from 'lucide-react';
import { usePrefersReducedMotion } from './primitives3d';

/* ============================================================
 * FinanceChart3D — barras 3D em WebGL2 (GLSL puro, sem libs)
 *   - barras com gradiente de altura + glow superior
 *   - rotacao suave continua + parallax do mouse
 *   - input: serie de pontos {label, value}
 * ============================================================ */

type Point = { label: string; value: number };

const VERT = `#version 300 es
in vec3 a_pos;          // 0..1 em cubo
in vec3 a_offset;       // posicao do bar (x,y,z) em mundo
in vec3 a_size;         // largura, altura, profundidade
in vec3 a_color;        // cor base
out vec3 v_color;
out float v_hy;         // altura normalizada
out vec3 v_local;
uniform mat4 u_mvp;
void main(){
  vec3 p = a_pos;
  vec3 world = a_offset + (p - 0.5) * a_size + vec3(0.0, a_size.y * 0.5, 0.0);
  gl_Position = u_mvp * vec4(world, 1.0);
  v_color = a_color;
  v_hy = p.y;
  v_local = p;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec3 v_color;
in float v_hy;
in vec3 v_local;
out vec4 outColor;
uniform float u_t;
void main(){
  // gradiente vertical (escuro embaixo, brilhante no topo)
  vec3 base = mix(v_color * 0.35, v_color, v_hy);
  // glow no topo
  float top = smoothstep(0.78, 1.0, v_hy);
  base += top * v_color * 0.7;
  // banda animada (energia subindo)
  float band = smoothstep(0.02, 0.0, abs(fract(v_hy * 2.0 - u_t * 0.35) - 0.5));
  base += band * v_color * 0.25;
  // edge highlight
  float edgeX = step(0.95, max(v_local.x, 1.0 - v_local.x));
  float edgeZ = step(0.95, max(v_local.z, 1.0 - v_local.z));
  base += (edgeX + edgeZ) * 0.05;
  outColor = vec4(base, 1.0);
}`;

function mat4Mul(a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[i * 4 + k] * b[k * 4 + j];
    o[i * 4 + j] = s;
  }
  return o;
}
function mat4Perspective(fovy: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}
function mat4LookAt(ex: number, ey: number, ez: number, cx: number, cy: number, cz: number) {
  const fx = cx - ex, fy = cy - ey, fz = cz - ez;
  const fl = Math.hypot(fx, fy, fz);
  const fxn = fx / fl, fyn = fy / fl, fzn = fz / fl;
  const ux = 0, uy = 1, uz = 0;
  // s = f x u
  let sx = fyn * uz - fzn * uy;
  let sy = fzn * ux - fxn * uz;
  let sz = fxn * uy - fyn * ux;
  const sl = Math.hypot(sx, sy, sz); sx /= sl; sy /= sl; sz /= sl;
  // u' = s x f
  const uxn = sy * fzn - sz * fyn;
  const uyn = sz * fxn - sx * fzn;
  const uzn = sx * fyn - sy * fxn;
  return new Float32Array([
    sx, uxn, -fxn, 0,
    sy, uyn, -fyn, 0,
    sz, uzn, -fzn, 0,
    -(sx * ex + sy * ey + sz * ez),
    -(uxn * ex + uyn * ey + uzn * ez),
    fxn * ex + fyn * ey + fzn * ez,
    1,
  ]);
}
function mat4Rotate(rotX: number, rotY: number) {
  const cx = Math.cos(rotX), sx = Math.sin(rotX);
  const cy = Math.cos(rotY), sy = Math.sin(rotY);
  // Ry then Rx
  const ry = new Float32Array([cy, 0, sy, 0,  0, 1, 0, 0,  -sy, 0, cy, 0,  0, 0, 0, 1]);
  const rx = new Float32Array([1, 0, 0, 0,  0, cx, -sx, 0,  0, sx, cx, 0,  0, 0, 0, 1]);
  return mat4Mul(rx, ry);
}

// cubo unitario (0..1) com indices nao indexados (36 verts)
const CUBE_POS = new Float32Array((() => {
  const f = [
    // bottom
    0, 0, 0,  1, 0, 0,  1, 0, 1,
    0, 0, 0,  1, 0, 1,  0, 0, 1,
    // top
    0, 1, 0,  1, 1, 1,  1, 1, 0,
    0, 1, 0,  0, 1, 1,  1, 1, 1,
    // front (+z)
    0, 0, 1,  1, 0, 1,  1, 1, 1,
    0, 0, 1,  1, 1, 1,  0, 1, 1,
    // back (-z)
    0, 0, 0,  1, 1, 0,  1, 0, 0,
    0, 0, 0,  0, 1, 0,  1, 1, 0,
    // right (+x)
    1, 0, 0,  1, 1, 0,  1, 1, 1,
    1, 0, 0,  1, 1, 1,  1, 0, 1,
    // left (-x)
    0, 0, 0,  0, 1, 1,  0, 1, 0,
    0, 0, 0,  0, 0, 1,  0, 1, 1,
  ];
  return f;
})());

function hex(h: string): [number, number, number] {
  const n = parseInt(h.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export default function FinanceChart3D({
  title = 'Receita por dia',
  series,
  total,
  growth,
}: {
  title?: string;
  series: Point[];
  total?: number;
  growth?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();
  const stateRef = useRef({ mx: 0, my: 0 });

  const data = useMemo(() => series.slice(-14), [series]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;
    const gl = canvas.getContext('webgl2', { antialias: true });
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(sh));
      return sh;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    // posicoes do cubo
    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, CUBE_POS, gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

    // dados por instancia
    const max = Math.max(...data.map((p) => p.value), 1);
    const n = data.length;
    const spacing = 1.05;
    const widthPerBar = 0.7;
    const totalWidth = n * spacing;
    const offsets = new Float32Array(n * 3);
    const sizes = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const c1 = hex('#f59e0b'); const c2 = hex('#10b981');
    for (let i = 0; i < n; i++) {
      const t = i / Math.max(1, n - 1);
      const h = (data[i].value / max) * 3.0 + 0.05;
      offsets[i * 3] = (i * spacing) - totalWidth / 2 + widthPerBar / 2;
      offsets[i * 3 + 1] = 0;
      offsets[i * 3 + 2] = 0;
      sizes[i * 3] = widthPerBar;
      sizes[i * 3 + 1] = h;
      sizes[i * 3 + 2] = widthPerBar;
      colors[i * 3] = c1[0] * (1 - t) + c2[0] * t;
      colors[i * 3 + 1] = c1[1] * (1 - t) + c2[1] * t;
      colors[i * 3 + 2] = c1[2] * (1 - t) + c2[2] * t;
    }

    const mkInstanced = (name: string, arr: Float32Array, size: number) => {
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(loc, 1);
      return buf;
    };
    const offBuf = mkInstanced('a_offset', offsets, 3);
    const sizeBuf = mkInstanced('a_size', sizes, 3);
    const colBuf = mkInstanced('a_color', colors, 3);

    const uMvp = gl.getUniformLocation(prog, 'u_mvp');
    const uT = gl.getUniformLocation(prog, 'u_t');

    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);

    let raf = 0;
    const start = performance.now();
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth * dpr;
      const h = canvas.clientHeight * dpr;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };
    const tick = () => {
      resize();
      const t = (performance.now() - start) / 1000;
      const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
      const proj = mat4Perspective(Math.PI / 3.4, aspect, 0.1, 100);
      const baseRotY = Math.sin(t * 0.25) * 0.3 + stateRef.current.mx * 0.6;
      const baseRotX = -0.45 + stateRef.current.my * 0.3;
      const rot = mat4Rotate(baseRotX, baseRotY);
      const view = mat4LookAt(0, 1.8, totalWidth * 0.95 + 3.5, 0, 1.2, 0);
      const mvp = mat4Mul(proj, mat4Mul(view, rot));
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix4fv(uMvp, false, mvp);
      gl.uniform1f(uT, t);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, n);
      if (!reduced.current) raf = requestAnimationFrame(tick);
    };
    tick();

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      stateRef.current.mx = ((e.clientX - r.left) / r.width) * 2 - 1;
      stateRef.current.my = ((e.clientY - r.top) / r.height) * 2 - 1;
    };
    const onLeave = () => { stateRef.current.mx = 0; stateRef.current.my = 0; };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    const ro = new ResizeObserver(() => { resize(); if (reduced.current) tick(); });
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      gl.deleteProgram(prog);
      [posBuf, offBuf, sizeBuf, colBuf].forEach((b) => gl.deleteBuffer(b));
    };
  }, [data, reduced]);

  const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

  return (
    <div className="relative overflow-hidden rounded-3xl border border-neutral-200 bg-gradient-to-br from-[#0a0a0a] to-[#1f2937] p-5 sm:p-7 text-white">
      <div className="relative grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <div className="flex items-center gap-2 text-amber-300">
            <DollarSign className="h-4 w-4" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Performance financeira</span>
          </div>
          <h3 className="mt-2 text-lg sm:text-xl font-black">{title}</h3>
          <p className="mt-2 text-sm text-white/60">Render WebGL2 com shader GLSL próprio — barras 3D reais com profundidade, glow no topo e rotação contínua.</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {typeof total === 'number' && (
              <div className="rounded-xl bg-white/5 p-3">
                <div className="text-[10px] uppercase tracking-wider text-amber-300">Acumulado</div>
                <div className="mt-1 text-2xl font-black text-amber-200">{money(total)}</div>
              </div>
            )}
            {typeof growth === 'number' && (
              <div className="rounded-xl bg-white/5 p-3">
                <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-300"><TrendingUp className="h-3 w-3" /> Variação</div>
                <div className={`mt-1 text-2xl font-black ${growth >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                  {growth >= 0 ? '+' : ''}{growth.toFixed(1)}%
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="relative min-h-[280px]">
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between px-4 text-[9px] font-bold text-white/40">
            {data.length > 0 && <span>{data[0].label}</span>}
            {data.length > 1 && <span>{data[data.length - 1].label}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
