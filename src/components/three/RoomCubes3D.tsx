import { useMemo } from 'react';
import { motion, useTransform } from 'motion/react';
import { Room } from '../../types';
import { Stage3D, useTilt, ShaderCanvas } from './primitives3d';
import { Sparkles, ShieldCheck, Paintbrush, AlertTriangle } from 'lucide-react';

/* ============================================================
 * RoomCubes3D — grid de cubos 3D representando UHs
 *   - cores por housekeeping_status
 *   - altura proporcional ao status (suja levanta, limpa baixa)
 *   - parallax suave no mouse
 * ============================================================ */

type Status = Room['housekeeping_status'];

const FACE_COLORS: Record<Status, { top: string; side: string; glow: string; label: string; icon: typeof Sparkles }> = {
  clean:        { top: '#dbeafe', side: '#60a5fa', glow: 'rgba(59,130,246,0.35)',  label: 'Limpa',         icon: Sparkles },
  dirty:        { top: '#ffedd5', side: '#fb923c', glow: 'rgba(249,115,22,0.40)',  label: 'Suja',          icon: Paintbrush },
  inspected:    { top: '#d1fae5', side: '#34d399', glow: 'rgba(16,185,129,0.40)',  label: 'Inspecionada',  icon: ShieldCheck },
  out_of_order: { top: '#fee2e2', side: '#ef4444', glow: 'rgba(239,68,68,0.45)',   label: 'Bloqueada',     icon: AlertTriangle },
};

const STATUS_HEIGHT: Record<Status, number> = {
  clean: 14,
  dirty: 46,
  inspected: 22,
  out_of_order: 58,
};

type CubeProps = { status: Status; label: string; sub: string; key?: string };
function Cube({ status, label, sub }: CubeProps) {
  const c = FACE_COLORS[status];
  const h = STATUS_HEIGHT[status];

  return (
    <div
      className="relative"
      style={{ width: 78, height: 78, transformStyle: 'preserve-3d' }}
      title={`${label} · ${c.label}`}
    >
      {/* glow base */}
      <div
        aria-hidden
        className="absolute left-1/2 top-full -translate-x-1/2 rounded-full blur-xl"
        style={{ width: 78, height: 18, background: c.glow, transform: 'translateY(-6px)' }}
      />
      {/* TOP face */}
      <div
        className="absolute inset-0 rounded-md border border-black/10"
        style={{
          background: `linear-gradient(135deg, ${c.top}, #ffffff)`,
          transform: `rotateX(60deg) rotateZ(-45deg) translateZ(${h}px)`,
          boxShadow: `0 0 0 1px ${c.glow} inset`,
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-neutral-700">
          {label}
        </div>
      </div>
      {/* RIGHT face */}
      <div
        className="absolute inset-0 rounded-md"
        style={{
          background: `linear-gradient(180deg, ${c.side}, ${c.side}cc)`,
          transform: `rotateX(60deg) rotateZ(-45deg) translateX(${h * 0.71}px) translateY(${h * 0.71}px) rotateY(90deg) translateZ(${h * 0.5}px)`,
          width: h,
          height: 78,
          left: 'auto',
          right: 0,
          opacity: 0.95,
        }}
      />
      {/* FRONT face */}
      <div
        className="absolute inset-0 rounded-md"
        style={{
          background: `linear-gradient(180deg, ${c.side}f0, ${c.side})`,
          transform: `rotateX(60deg) rotateZ(-45deg) translateY(${h * 0.71}px) translateX(-${h * 0.71}px) rotateX(-90deg) translateZ(${h * 0.5}px)`,
          width: 78,
          height: h,
          opacity: 0.9,
        }}
      />
      <div
        className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] font-bold uppercase tracking-wider text-neutral-500"
        style={{ transform: 'translate(-50%, 0) translateZ(80px)' }}
      >
        {sub}
      </div>
    </div>
  );
}

export default function RoomCubes3D({ rooms }: { rooms: Room[] }) {
  const sample = useMemo(() => rooms.slice(0, 24), [rooms]);
  const counts = useMemo(() => {
    const c: Record<Status, number> = { clean: 0, dirty: 0, inspected: 0, out_of_order: 0 };
    rooms.forEach((r) => { c[r.housekeeping_status] = (c[r.housekeeping_status] || 0) + 1; });
    return c;
  }, [rooms]);

  const { ref, rx, ry } = useTilt(8);
  const tx = useTransform(ry, [-8, 8], [-8, 8]);
  const ty = useTransform(rx, [-8, 8], [8, -8]);

  if (sample.length === 0) return null;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-neutral-200 bg-gradient-to-br from-white to-neutral-50 p-5 sm:p-7">
      <ShaderCanvas
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.35]"
        colorA="#f8fafc"
        colorB="#dbeafe"
        intensity={0.4}
      />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-md">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-700">Mapa volumétrico</span>
          <h3 className="mt-2 text-lg sm:text-xl font-black text-neutral-900">UHs em volume — leitura instantânea do status</h3>
          <p className="mt-2 text-sm text-neutral-500">Cada cubo representa uma unidade. Altura e cor indicam o status de governança. Passe o mouse para inclinar a cena.</p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(FACE_COLORS) as Status[]).map((k) => {
              const c = FACE_COLORS[k];
              const I = c.icon;
              return (
                <div key={k} className="flex items-center gap-2 rounded-xl bg-white/70 px-3 py-2 backdrop-blur">
                  <I className="h-3.5 w-3.5" style={{ color: c.side }} />
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">{c.label}</div>
                    <div className="text-sm font-black" style={{ color: c.side }}>{counts[k]}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <Stage3D className="flex-1" perspective={1200}>
          <motion.div
            ref={ref}
            style={{ rotateX: tx, rotateY: ty, transformStyle: 'preserve-3d' }}
            className="mx-auto grid grid-cols-4 gap-6 sm:grid-cols-6 sm:gap-7 max-w-md lg:max-w-xl py-8"
          >
            {sample.map((r) => (
              <Cube
                key={r.id}
                status={r.housekeeping_status}
                label={r.room_number}
                sub={`${r.floor}º`}
              />
            ))}
          </motion.div>
        </Stage3D>
      </div>
    </div>
  );
}
