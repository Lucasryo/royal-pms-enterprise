import { Fragment, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { supabase } from '../supabase';

type Category = 'executivo' | 'master' | 'suite presidencial';

const CATEGORY_LABELS: Record<Category, string> = {
  executivo: 'Executivo',
  master: 'Master',
  'suite presidencial': 'Suíte presidencial',
};

const CATEGORY_ORDER: Category[] = ['executivo', 'master', 'suite presidencial'];

type Reservation = {
  category: string;
  check_in: string;
  check_out: string;
  status: string;
  guest_name?: string | null;
  reservation_code?: string | null;
  source?: string | null;
};

type DayCell = {
  date: string;
  occupied: number;
  total: number;
  reservations: Reservation[];
};

const monthNames = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const WEEKDAY_LABELS = ['Do.', '2ª', '3ª', '4ª', '5ª', '6ª', 'Sa.'];

function pad(n: number) {
  return String(n).padStart(2, '0');
}
function toISO(y: number, m: number, d: number) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}
function todayISO() {
  const d = new Date();
  return toISO(d.getFullYear(), d.getMonth(), d.getDate());
}
function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}
function firstDayOfMonth(y: number, m: number) {
  return new Date(y, m, 1).getDay();
}
function addMonths(base: { y: number; m: number }, delta: number) {
  const total = base.y * 12 + base.m + delta;
  return { y: Math.floor(total / 12), m: ((total % 12) + 12) % 12 };
}

function getRateColor(rate: number): { bg: string; text: string; label: string } {
  if (rate === 0) return { bg: 'bg-stone-50', text: 'text-stone-600', label: 'Vazio' };
  if (rate < 50) return { bg: 'bg-emerald-100', text: 'text-emerald-900', label: 'Baixa' };
  if (rate < 80) return { bg: 'bg-amber-100', text: 'text-amber-900', label: 'Média' };
  if (rate < 100) return { bg: 'bg-orange-200', text: 'text-orange-900', label: 'Alta' };
  return { bg: 'bg-red-300', text: 'text-red-900', label: 'Lotado' };
}

export default function OccupancyChart() {
  const initial = useMemo(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  }, []);
  const [anchor, setAnchor] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [requests, setRequests] = useState<Reservation[]>([]);
  const [inventory, setInventory] = useState<Record<Category, number>>({
    executivo: 0,
    master: 0,
    'suite presidencial': 0,
  });
  const [selectedDay, setSelectedDay] = useState<{ date: string; category: Category } | null>(null);

  // Fetch inventory once
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('rooms')
        .select('category')
        .eq('is_virtual', false);
      if (error || !data) return;
      const counts: Record<Category, number> = { executivo: 0, master: 0, 'suite presidencial': 0 };
      for (const row of data as Array<{ category: string }>) {
        const c = row.category as Category;
        if (CATEGORY_ORDER.includes(c)) counts[c]++;
      }
      setInventory(counts);
    })();
  }, []);

  // Fetch reservations + requests overlapping the visible window
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const start = toISO(anchor.y, anchor.m, 1);
    const next = addMonths(anchor, 1);
    const end = toISO(next.y, next.m, daysInMonth(next.y, next.m));

    (async () => {
      try {
        const [reservationsRes, requestsRes] = await Promise.all([
          supabase
            .from('reservations')
            .select('category, check_in, check_out, status, guest_name, reservation_code, source')
            .neq('status', 'CANCELLED')
            .lte('check_in', end)
            .gt('check_out', start),
          supabase
            .from('reservation_requests')
            .select('category, check_in, check_out, status, guest_name, reservation_code, source')
            .neq('status', 'REJECTED')
            .lte('check_in', end)
            .gt('check_out', start),
        ]);
        if (cancelled) return;
        setReservations((reservationsRes.data || []) as Reservation[]);
        setRequests((requestsRes.data || []) as Reservation[]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [anchor]);

  const months = [anchor, addMonths(anchor, 1)];
  const today = useMemo(() => todayISO(), []);

  const cellsByCategory: Record<Category, Record<string, DayCell>> = useMemo(() => {
    const allReservations = [...reservations, ...requests];
    const result: Record<Category, Record<string, DayCell>> = {
      executivo: {},
      master: {},
      'suite presidencial': {},
    };

    // Iterate days for the 2 months
    for (const m of months) {
      const total = daysInMonth(m.y, m.m);
      for (let d = 1; d <= total; d++) {
        const date = toISO(m.y, m.m, d);
        for (const cat of CATEGORY_ORDER) {
          const overlapping = allReservations.filter((r) => {
            if (r.category !== cat) return false;
            return r.check_in <= date && r.check_out > date;
          });
          result[cat][date] = {
            date,
            occupied: overlapping.length,
            total: inventory[cat] || 0,
            reservations: overlapping,
          };
        }
      }
    }
    return result;
  }, [reservations, requests, inventory, anchor]);

  const overbooked = useMemo(() => {
    let count = 0;
    let nearFull = 0;
    for (const cat of CATEGORY_ORDER) {
      for (const [, cell] of Object.entries(cellsByCategory[cat])) {
        const total = inventory[cat] || 0;
        if (total === 0) continue;
        const rate = (cell.occupied / total) * 100;
        if (rate >= 100) count++;
        else if (rate >= 80) nearFull++;
      }
    }
    return { full: count, nearFull };
  }, [cellsByCategory, inventory]);

  const selectedCell = selectedDay
    ? cellsByCategory[selectedDay.category]?.[selectedDay.date]
    : null;

  return (
    <div className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-600">Chart de ocupação</p>
          <h3 className="mt-1 text-xl font-black text-neutral-950">
            Ocupação por categoria — {monthNames[anchor.m]} {anchor.y} → {monthNames[months[1].m]} {months[1].y}
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-neutral-500">
            Confirma reservas (status ≠ cancelled) + requests (status ≠ rejected) por dia e categoria. Sem
            atribuição de quarto específico — só contagem para evitar overbooking.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAnchor(addMonths(anchor, -1))}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 transition hover:bg-neutral-50"
            aria-label="Mes anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setAnchor(initial)}
            className="rounded-full border border-neutral-200 px-4 py-2 text-xs font-bold uppercase tracking-widest transition hover:bg-neutral-50"
          >
            Hoje
          </button>
          <button
            onClick={() => setAnchor(addMonths(anchor, 1))}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 transition hover:bg-neutral-50"
            aria-label="Proximo mes"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Resumo / alertas */}
      <div className="mt-4 flex flex-wrap gap-2">
        {(Object.keys(inventory) as Category[]).map((cat) => (
          <div key={cat} className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-2 text-xs">
            <span className="font-bold text-neutral-700">{CATEGORY_LABELS[cat]}</span>
            <span className="ml-2 text-neutral-500">{inventory[cat]} UHs</span>
          </div>
        ))}
        {overbooked.full > 0 && (
          <div className="inline-flex items-center gap-2 rounded-2xl bg-red-50 px-4 py-2 text-xs font-bold text-red-800">
            <AlertTriangle className="h-3.5 w-3.5" />
            {overbooked.full} dia(s) lotado(s) — risco de overbooking
          </div>
        )}
        {overbooked.nearFull > 0 && (
          <div className="inline-flex items-center gap-2 rounded-2xl bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5" />
            {overbooked.nearFull} dia(s) com ocupação alta (≥80%)
          </div>
        )}
      </div>

      {/* Heatmap legenda */}
      <div className="mt-5 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-widest">
        {[
          { rate: 0, label: 'Vazio' },
          { rate: 30, label: 'Baixa <50%' },
          { rate: 65, label: 'Média 50-79%' },
          { rate: 90, label: 'Alta 80-99%' },
          { rate: 100, label: 'Lotado 100%+' },
        ].map(({ rate, label }) => {
          const c = getRateColor(rate);
          return (
            <span key={label} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${c.bg} ${c.text}`}>
              <span className="h-2 w-2 rounded-full bg-current" />
              {label}
            </span>
          );
        })}
      </div>

      {loading ? (
        <div className="mt-6 flex items-center gap-3 rounded-2xl bg-neutral-50 p-6 text-sm text-neutral-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando ocupação...
        </div>
      ) : (
        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          {months.map((m) => (
            <Fragment key={`${m.y}-${m.m}`}>
              <MonthHeatmap
                year={m.y}
                month={m.m}
                today={today}
                inventory={inventory}
                cells={cellsByCategory}
                onSelect={(date, cat) => setSelectedDay({ date, category: cat })}
              />
            </Fragment>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selectedDay && selectedCell && (
        <DetailModal
          date={selectedDay.date}
          category={selectedDay.category}
          cell={selectedCell}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}

function MonthHeatmap({
  year,
  month,
  today,
  inventory,
  cells,
  onSelect,
}: {
  year: number;
  month: number;
  today: string;
  inventory: Record<Category, number>;
  cells: Record<Category, Record<string, DayCell>>;
  onSelect: (date: string, cat: Category) => void;
}) {
  const total = daysInMonth(year, month);
  const offset = firstDayOfMonth(year, month);

  return (
    <div>
      <p className="mb-3 text-center text-sm font-bold text-neutral-900">
        {monthNames[month]} {year}
      </p>

      {CATEGORY_ORDER.map((cat) => (
        <div key={cat} className="mb-4">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-700">
              {CATEGORY_LABELS[cat]}
            </p>
            <p className="text-[10px] text-neutral-400">{inventory[cat]} UHs total</p>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-[9px]">
            {WEEKDAY_LABELS.map((l) => (
              <div key={l} className="py-0.5 text-center font-bold uppercase tracking-widest text-neutral-400">
                {l}
              </div>
            ))}
            {Array.from({ length: offset }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: total }).map((_, i) => {
              const day = i + 1;
              const date = toISO(year, month, day);
              const cell = cells[cat]?.[date];
              const totalRooms = inventory[cat] || 1;
              const rate = cell ? (cell.occupied / totalRooms) * 100 : 0;
              const c = getRateColor(rate);
              const past = date < today;
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => onSelect(date, cat)}
                  className={`flex flex-col items-center justify-center rounded-md py-1.5 transition hover:ring-2 hover:ring-amber-400 ${c.bg} ${past ? 'opacity-50' : ''}`}
                  title={cell ? `${cell.occupied}/${cell.total} — ${rate.toFixed(0)}%` : ''}
                >
                  <span className={`text-[10px] font-bold ${c.text}`}>{day}</span>
                  <span className={`text-[8px] tabular-nums ${c.text}`}>
                    {cell ? `${cell.occupied}/${cell.total}` : '—'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function DetailModal({
  date,
  category,
  cell,
  onClose,
}: {
  date: string;
  category: Category;
  cell: DayCell;
  onClose: () => void;
}) {
  const rate = cell.total > 0 ? (cell.occupied / cell.total) * 100 : 0;
  const c = getRateColor(rate);
  const formatDate = new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-stone-950/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg rounded-3xl border border-neutral-200 bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 hover:bg-neutral-50"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-600">
          {CATEGORY_LABELS[category]}
        </p>
        <h3 className="mt-1 text-lg font-black text-neutral-950">{formatDate}</h3>

        <div className={`mt-4 flex items-center justify-between rounded-2xl px-4 py-3 ${c.bg}`}>
          <div>
            <p className={`text-2xl font-black ${c.text}`}>{cell.occupied}/{cell.total}</p>
            <p className={`text-xs uppercase tracking-widest ${c.text}`}>{c.label}</p>
          </div>
          <p className={`text-3xl font-black ${c.text}`}>{rate.toFixed(0)}%</p>
        </div>

        <div className="mt-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
            Reservas / requests ativas no dia ({cell.reservations.length})
          </p>
          {cell.reservations.length === 0 ? (
            <p className="mt-3 rounded-xl bg-neutral-50 p-4 text-center text-sm text-neutral-500">
              Nenhuma reserva ativa para esta categoria neste dia.
            </p>
          ) : (
            <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
              {cell.reservations.map((r, idx) => (
                <li key={idx} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold text-neutral-900">{r.guest_name || '—'}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${
                      r.status === 'CHECKED_IN'
                        ? 'bg-blue-100 text-blue-800'
                        : r.status === 'CONFIRMED' || r.status === 'APPROVED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                    }`}>
                      {r.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    {r.reservation_code || ''}
                    {r.source ? ` · ${r.source}` : ''}
                    {' · '}
                    {new Date(`${r.check_in}T12:00:00`).toLocaleDateString('pt-BR')} →{' '}
                    {new Date(`${r.check_out}T12:00:00`).toLocaleDateString('pt-BR')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
