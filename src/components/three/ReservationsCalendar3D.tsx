import { Fragment, useMemo } from 'react';
import { motion } from 'motion/react';
import { Reservation } from '../../types';
import { Stage3D, useTilt, ShaderCanvas } from './primitives3d';
import { CalendarDays, TrendingUp } from 'lucide-react';

/* ============================================================
 * ReservationsCalendar3D — calendario 14 dias x N UHs em camadas
 *   - cada celula ocupada cresce em Z proporcional ao ticket
 *   - ondulacao suave por dia
 * ============================================================ */

const STATUS_TONE: Record<Reservation['status'], { fill: string; edge: string }> = {
  PENDING:     { fill: '#fde68a', edge: '#f59e0b' },
  CONFIRMED:   { fill: '#bfdbfe', edge: '#3b82f6' },
  CHECKED_IN:  { fill: '#bbf7d0', edge: '#10b981' },
  CHECKED_OUT: { fill: '#e5e7eb', edge: '#9ca3af' },
  CANCELLED:   { fill: '#fecaca', edge: '#ef4444' },
};

const DAYS = 14;

function toKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ReservationsCalendar3D({ reservations }: { reservations: Reservation[] }) {
  const active = useMemo(() => reservations.filter((r) => r.status !== 'CANCELLED'), [reservations]);
  const rooms = useMemo(() => {
    const set = new Set<string>();
    active.forEach((r) => { if (r.room_number) set.add(r.room_number); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })).slice(0, 10);
  }, [active]);

  const days = useMemo(() => {
    const arr: Date[] = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 0; i < DAYS; i++) {
      const d = new Date(today); d.setDate(today.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, []);

  // celula: status + ticket por (room, day)
  const grid = useMemo(() => {
    const map = new Map<string, { res: Reservation; height: number }>();
    const maxAmount = Math.max(1, ...active.map((r) => Number(r.total_amount) || 0));
    active.forEach((res) => {
      if (!res.room_number) return;
      const ci = new Date(res.check_in); const co = new Date(res.check_out);
      const h = 6 + Math.min(48, ((Number(res.total_amount) || 0) / maxAmount) * 48);
      days.forEach((d) => {
        if (d >= ci && d < co) {
          map.set(`${res.room_number}|${toKey(d)}`, { res, height: h });
        }
      });
    });
    return map;
  }, [active, days]);

  const { ref, rx, ry } = useTilt(6);

  const totalCells = rooms.length * DAYS;
  const occupiedCells = grid.size;
  const occupancy = totalCells === 0 ? 0 : Math.round((occupiedCells / totalCells) * 100);

  if (rooms.length === 0) {
    return null;
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border border-neutral-200 bg-gradient-to-br from-neutral-950 to-neutral-800 p-5 sm:p-7 text-white">
      <ShaderCanvas
        className="pointer-events-none absolute inset-0 h-full w-full opacity-50"
        colorA="#0a0a0a"
        colorB="#1e40af"
        intensity={0.55}
      />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center">
        <div className="max-w-sm">
          <div className="flex items-center gap-2 text-blue-300">
            <CalendarDays className="h-4 w-4" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Calendario em camadas</span>
          </div>
          <h3 className="mt-2 text-lg sm:text-xl font-black">Ocupação dos próximos {DAYS} dias</h3>
          <p className="mt-2 text-sm text-white/60">Cada bloco cresce em volume conforme a tarifa da reserva. Bloco baixo = ocupado padrão. Bloco alto = ticket forte.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/5 px-3 py-2 backdrop-blur">
              <div className="text-[10px] font-bold uppercase tracking-wide text-white/50">Ocupação</div>
              <div className="text-2xl font-black text-emerald-300">{occupancy}%</div>
            </div>
            <div className="rounded-xl bg-white/5 px-3 py-2 backdrop-blur">
              <div className="text-[10px] font-bold uppercase tracking-wide text-white/50 flex items-center gap-1"><TrendingUp className="h-3 w-3" />Reservas</div>
              <div className="text-2xl font-black text-blue-300">{active.length}</div>
            </div>
          </div>
        </div>
        <Stage3D className="flex-1" perspective={1500}>
          <motion.div
            ref={ref}
            style={{ rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d' }}
            className="mx-auto overflow-x-auto py-6"
          >
            <div
              className="inline-grid gap-1.5"
              style={{
                gridTemplateColumns: `52px repeat(${DAYS}, 28px)`,
                transform: 'rotateX(40deg) rotateZ(-12deg)',
                transformStyle: 'preserve-3d',
              }}
            >
              <div />
              {days.map((d) => (
                <div key={toKey(d)} className="text-center text-[9px] font-bold uppercase tracking-wider text-white/60">
                  {d.getDate()}
                </div>
              ))}
              {rooms.map((room) => (
                <Fragment key={`row-${room}`}>
                  <div className="text-[10px] font-black text-white/80 self-center">UH {room}</div>
                  {days.map((d) => {
                    const cell = grid.get(`${room}|${toKey(d)}`);
                    if (!cell) {
                      return (
                        <div
                          key={`${room}-${toKey(d)}`}
                          className="rounded-[3px] bg-white/[0.04]"
                          style={{ width: 28, height: 18 }}
                        />
                      );
                    }
                    const tone = STATUS_TONE[cell.res.status];
                    return (
                      <div key={`${room}-${toKey(d)}`} style={{ width: 28, height: 18, transformStyle: 'preserve-3d' }}>
                        <div
                          className="rounded-[3px]"
                          style={{
                            width: 28,
                            height: 18,
                            background: tone.fill,
                            transform: `translateZ(${cell.height}px)`,
                            boxShadow: `0 0 0 1px ${tone.edge}88, 0 8px 16px -6px ${tone.edge}66`,
                          }}
                        />
                      </div>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </motion.div>
        </Stage3D>
      </div>
    </div>
  );
}
