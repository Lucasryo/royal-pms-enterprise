import { motion, useTransform } from 'motion/react';
import { KeyRound, BedDouble, Clock } from 'lucide-react';
import { Stage3D, useTilt, ShaderCanvas } from './primitives3d';

/* ============================================================
 * CheckInCards3D — cartoes-chave flutuantes (balcao de recepcao)
 *   - 3 cartoes empilhados em profundidade
 *   - parallax + flutuacao continua
 * ============================================================ */

type CardData = {
  guest: string;
  room?: string;
  eta?: string;
  status: 'arrival' | 'inhouse' | 'departure';
};

const STATUS: Record<CardData['status'], { tag: string; from: string; to: string; ring: string; accent: string }> = {
  arrival:   { tag: 'CHEGADA',  from: '#1d4ed8', to: '#3b82f6', ring: 'ring-blue-300/40',    accent: '#93c5fd' },
  inhouse:   { tag: 'IN-HOUSE', from: '#065f46', to: '#10b981', ring: 'ring-emerald-300/40', accent: '#6ee7b7' },
  departure: { tag: 'SAIDA',    from: '#92400e', to: '#f59e0b', ring: 'ring-amber-300/40',   accent: '#fcd34d' },
};

function Card({ data, depth, offset }: { data: CardData; depth: number; offset: number }) {
  const s = STATUS[data.status];
  return (
    <motion.div
      className={`absolute left-1/2 top-1/2 w-72 -translate-x-1/2 -translate-y-1/2 rounded-2xl ring-2 ${s.ring}`}
      style={{
        background: `linear-gradient(135deg, ${s.from}, ${s.to})`,
        transform: `translate(-50%, -50%) translateZ(${depth}px) translateX(${offset}px) rotateY(-12deg) rotateX(8deg)`,
        boxShadow: `0 30px 60px -20px ${s.from}aa, 0 0 0 1px ${s.accent}55`,
        transformStyle: 'preserve-3d',
      }}
      animate={{ y: [0, -6, 0] }}
      transition={{ duration: 4 + depth / 60, repeat: Infinity, ease: 'easeInOut', delay: offset / 200 }}
    >
      <div className="relative overflow-hidden rounded-2xl p-5 text-white">
        {/* hologram strip */}
        <div
          aria-hidden
          className="absolute -right-6 top-0 h-full w-20 opacity-60"
          style={{
            background: `linear-gradient(135deg, transparent, ${s.accent}80, transparent)`,
            transform: 'skewX(-12deg)',
          }}
        />
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[9px] font-black tracking-[0.25em] opacity-80">{s.tag}</div>
            <div className="mt-2 text-lg font-black leading-tight">{data.guest}</div>
          </div>
          <KeyRound className="h-5 w-5 opacity-90" />
        </div>
        <div className="mt-5 flex items-end justify-between gap-3">
          <div className="rounded-md bg-black/20 px-2.5 py-1.5">
            <div className="text-[8px] uppercase tracking-widest opacity-70">UH</div>
            <div className="font-mono text-lg font-black">{data.room ?? '—'}</div>
          </div>
          <div className="flex flex-col items-end text-right">
            <div className="text-[8px] uppercase tracking-widest opacity-70">{data.status === 'departure' ? 'check-out' : 'previsto'}</div>
            <div className="flex items-center gap-1 text-xs font-bold">
              <Clock className="h-3 w-3" />
              {data.eta ?? '14:00'}
            </div>
          </div>
        </div>
        <div className="mt-4 h-1 w-full rounded-full bg-white/15">
          <div className="h-1 rounded-full bg-white/70" style={{ width: data.status === 'inhouse' ? '60%' : data.status === 'arrival' ? '20%' : '95%' }} />
        </div>
      </div>
    </motion.div>
  );
}

export default function CheckInCards3D({
  arrivals = 0,
  departures = 0,
  inhouse = 0,
  sample = [],
}: {
  arrivals?: number;
  departures?: number;
  inhouse?: number;
  sample?: CardData[];
}) {
  const fallback: CardData[] = [
    { guest: 'Sra. Andrade', room: '402', eta: '14:30', status: 'arrival' },
    { guest: 'PRIO · J. Lopes', room: '208', eta: '23:00', status: 'inhouse' },
    { guest: 'Sr. Tavares', room: '115', eta: '11:00', status: 'departure' },
  ];
  const cards: CardData[] = [
    sample[0] ?? fallback[0],
    sample[1] ?? fallback[1],
    sample[2] ?? fallback[2],
  ];

  const { ref, rx, ry } = useTilt(10);
  const tx = useTransform(ry, [-10, 10], [-10, 10]);
  const ty = useTransform(rx, [-10, 10], [10, -10]);

  return (
    <div className="relative overflow-hidden rounded-3xl border border-neutral-200 bg-gradient-to-br from-[#0b0a0e] via-[#161025] to-[#1f1740] p-5 sm:p-7 text-white">
      <ShaderCanvas
        className="pointer-events-none absolute inset-0 h-full w-full opacity-60"
        colorA="#0b0a0e"
        colorB="#7c3aed"
        intensity={0.7}
      />
      <div className="relative grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">Recepção · Turno em curso</span>
          <h3 className="mt-2 text-lg sm:text-xl font-black">Chaves do turno — visão de balcão</h3>
          <p className="mt-2 text-sm text-white/60">Cartões-chave flutuando representam o turno atual da recepção. Movimente o mouse e veja a profundidade reagir.</p>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-white/5 p-3">
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-blue-300"><BedDouble className="h-3 w-3" /> Chegadas</div>
              <div className="mt-1 text-2xl font-black text-blue-200">{arrivals}</div>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <div className="text-[10px] uppercase tracking-wider text-emerald-300">In-house</div>
              <div className="mt-1 text-2xl font-black text-emerald-200">{inhouse}</div>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <div className="text-[10px] uppercase tracking-wider text-amber-300">Saidas</div>
              <div className="mt-1 text-2xl font-black text-amber-200">{departures}</div>
            </div>
          </div>
        </div>
        <Stage3D className="relative min-h-[260px]" perspective={1400}>
          <motion.div
            ref={ref}
            className="relative h-full w-full"
            style={{ rotateX: tx, rotateY: ty, transformStyle: 'preserve-3d' }}
          >
            <Card data={cards[0]} depth={-60} offset={-70} />
            <Card data={cards[1]} depth={20}  offset={0} />
            <Card data={cards[2]} depth={80}  offset={70} />
          </motion.div>
        </Stage3D>
      </div>
    </div>
  );
}
