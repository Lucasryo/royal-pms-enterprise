import { useMemo } from 'react';
import { motion, useTransform } from 'motion/react';
import { Room } from '../../types';
import { Stage3D, useTilt, ShaderCanvas } from './primitives3d';
import { Sparkles, ShieldCheck, Paintbrush, AlertTriangle } from 'lucide-react';

/* ============================================================
 * RoomCubes3D - grid de cubos isométricos representando UHs
 *   - cores por housekeeping_status
 *   - altura proporcional ao status
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
  const height = STATUS_HEIGHT[status];
  const topY = 64 - height;
  const bottomY = 92;
  const idSafe = `${status}-${label}`.replace(/[^a-zA-Z0-9_-]/g, '-');

  return (
    <div
      className="relative flex flex-col items-center"
      style={{ width: 72, height: 112 }}
      title={`${label} - ${c.label}`}
    >
      <div
        aria-hidden
        className="absolute left-1/2 top-[86px] -translate-x-1/2 rounded-full blur-xl"
        style={{ width: 64, height: 18, background: c.glow }}
      />

      <svg
        aria-hidden
        viewBox="0 0 72 112"
        className="absolute inset-0 h-full w-full overflow-visible"
        style={{ filter: `drop-shadow(0 12px 14px ${c.glow})` }}
      >
        <defs>
          <linearGradient id={`room-cube-top-${idSafe}`} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor={c.top} />
          </linearGradient>
          <linearGradient id={`room-cube-left-${idSafe}`} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor={c.side} stopOpacity="0.88" />
            <stop offset="100%" stopColor={c.side} stopOpacity="0.55" />
          </linearGradient>
          <linearGradient id={`room-cube-right-${idSafe}`} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor={c.side} stopOpacity="0.98" />
            <stop offset="100%" stopColor={c.side} stopOpacity="0.72" />
          </linearGradient>
        </defs>

        <polygon
          points={`36,${topY + 34} 66,${topY + 17} 66,${bottomY - 18} 36,${bottomY}`}
          fill={`url(#room-cube-right-${idSafe})`}
          stroke="rgba(15,23,42,0.12)"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <polygon
          points={`36,${topY + 34} 6,${topY + 17} 6,${bottomY - 18} 36,${bottomY}`}
          fill={`url(#room-cube-left-${idSafe})`}
          stroke="rgba(15,23,42,0.12)"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <polygon
          points={`36,${topY} 66,${topY + 17} 36,${topY + 34} 6,${topY + 17}`}
          fill={`url(#room-cube-top-${idSafe})`}
          stroke="rgba(15,23,42,0.14)"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <text
          x="36"
          y={topY + 20}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-neutral-700 text-[9px] font-black"
        >
          {label}
        </text>
      </svg>

      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[9px] font-bold uppercase tracking-wider text-neutral-500">
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
          <h3 className="mt-2 text-lg sm:text-xl font-black text-neutral-900">UHs em volume - leitura instantânea do status</h3>
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
            className="mx-auto grid max-w-md grid-cols-4 gap-x-3 gap-y-1 py-6 sm:max-w-xl sm:grid-cols-6 sm:gap-x-4"
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
