import { Fragment, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { supabase } from '../supabase';

type Category = 'executivo' | 'master' | 'suite presidencial';

const CATEGORY_LABELS: Record<Category, string> = {
  executivo: 'Executivo',
  master: 'Master',
  'suite presidencial': 'Suíte presidencial',
};

const CATEGORY_SHORT: Record<Category, string> = {
  executivo: 'Exec',
  master: 'Master',
  'suite presidencial': 'Suíte',
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

type GlobalCell = {
  date: string;
  occupied: number;
  total: number;
  byCategory: Record<Category, { occupied: number; total: number }>;
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
function addDaysISO(iso: string, delta: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function getRateColor(rate: number): { bg: string; text: string; label: string; ring: string } {
  if (rate === 0) return { bg: 'bg-stone-50', text: 'text-stone-600', label: 'Vazio', ring: 'ring-stone-200' };
  if (rate < 50) return { bg: 'bg-emerald-100', text: 'text-emerald-900', label: 'Baixa', ring: 'ring-emerald-300' };
  if (rate < 80) return { bg: 'bg-amber-100', text: 'text-amber-900', label: 'Média', ring: 'ring-amber-300' };
  if (rate < 100) return { bg: 'bg-orange-200', text: 'text-orange-900', label: 'Alta', ring: 'ring-orange-400' };
  return { bg: 'bg-red-300', text: 'text-red-900', label: 'Lotado', ring: 'ring-red-500' };
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
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const totalInventory = inventory.executivo + inventory.master + inventory['suite presidencial'];

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

  // Fetch reservations + requests overlapping the visible window (2 months + 14 days extra for upcoming table)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const start = toISO(anchor.y, anchor.m, 1);
    const next = addMonths(anchor, 1);
    const end = addDaysISO(toISO(next.y, next.m, daysInMonth(next.y, next.m)), 14);

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

  const today = useMemo(() => todayISO(), []);
  const months = [anchor, addMonths(anchor, 1)];

  // Per-category cells per date (for modal details)
  const cellsByCategory: Record<Category, Record<string, DayCell>> = useMemo(() => {
    const allReservations = [...reservations, ...requests];
    const result: Record<Category, Record<string, DayCell>> = {
      executivo: {},
      master: {},
      'suite presidencial': {},
    };
    for (const m of months) {
      const total = daysInMonth(m.y, m.m);
      for (let d = 1; d <= total; d++) {
        const date = toISO(m.y, m.m, d);
        for (const cat of CATEGORY_ORDER) {
          const overlapping = allReservations.filter((r) => r.category === cat && r.check_in <= date && r.check_out > date);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservations, requests, inventory, anchor]);

  // Global cells (sum across categories)
  const globalCellsByDate: Record<string, GlobalCell> = useMemo(() => {
    const result: Record<string, GlobalCell> = {};
    for (const m of months) {
      const total = daysInMonth(m.y, m.m);
      for (let d = 1; d <= total; d++) {
        const date = toISO(m.y, m.m, d);
        let totalOcc = 0;
        let totalCap = 0;
        const byCategory: Record<Category, { occupied: number; total: number }> = {
          executivo: { occupied: 0, total: 0 },
          master: { occupied: 0, total: 0 },
          'suite presidencial': { occupied: 0, total: 0 },
        };
        for (const cat of CATEGORY_ORDER) {
          const cell = cellsByCategory[cat]?.[date];
          if (!cell) continue;
          totalOcc += cell.occupied;
          totalCap += cell.total;
          byCategory[cat] = { occupied: cell.occupied, total: cell.total };
        }
        result[date] = { date, occupied: totalOcc, total: totalCap, byCategory };
      }
    }
    return result;
  }, [cellsByCategory, anchor]);

  // Upcoming days table (14 dias a partir de hoje, ou do dia selecionado)
  const upcomingDays = useMemo(() => {
    const startDate = selectedDay && selectedDay >= today ? selectedDay : today;
    return Array.from({ length: 14 }).map((_, i) => addDaysISO(startDate, i));
  }, [today, selectedDay]);

  function getAvailability(date: string) {
    const allReservations = [...reservations, ...requests];
    const occByCat: Record<Category, number> = { executivo: 0, master: 0, 'suite presidencial': 0 };
    for (const r of allReservations) {
      if (r.check_in <= date && r.check_out > date && CATEGORY_ORDER.includes(r.category as Category)) {
        occByCat[r.category as Category]++;
      }
    }
    return {
      executivo: { available: Math.max(0, inventory.executivo - occByCat.executivo), total: inventory.executivo, occupied: occByCat.executivo },
      master: { available: Math.max(0, inventory.master - occByCat.master), total: inventory.master, occupied: occByCat.master },
      'suite presidencial': { available: Math.max(0, inventory['suite presidencial'] - occByCat['suite presidencial']), total: inventory['suite presidencial'], occupied: occByCat['suite presidencial'] },
      totalAvailable: Math.max(0, totalInventory - (occByCat.executivo + occByCat.master + occByCat['suite presidencial'])),
      totalOccupied: occByCat.executivo + occByCat.master + occByCat['suite presidencial'],
    };
  }

  const overbooked = useMemo(() => {
    let count = 0;
    let nearFull = 0;
    for (const cell of Object.values(globalCellsByDate)) {
      if (cell.total === 0) continue;
      const rate = (cell.occupied / cell.total) * 100;
      if (rate >= 100) count++;
      else if (rate >= 80) nearFull++;
    }
    return { full: count, nearFull };
  }, [globalCellsByDate]);

  const selectedCellGlobal = selectedDay ? globalCellsByDate[selectedDay] : null;

  return (
    <div className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-600">Chart de ocupação</p>
          <h3 className="mt-1 text-xl font-black text-neutral-950">
            Ocupação geral — {monthNames[anchor.m]} {anchor.y} → {monthNames[months[1].m]} {months[1].y}
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-neutral-500">
            Visão consolidada do hotel todo. Sem upgrade entre categorias — cada reserva ocupa apenas a categoria pedida.
            Click em um dia para ver detalhes e abrir o painel de disponibilidade por categoria.
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

      {/* Resumo */}
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Inventário total" value={`${totalInventory} UHs`} />
        <SummaryCard label="Executivo" value={`${inventory.executivo} UHs`} accent="text-stone-700" />
        <SummaryCard label="Master" value={`${inventory.master} UHs`} accent="text-amber-700" />
        <SummaryCard label="Suíte presidencial" value={`${inventory['suite presidencial']} UHs`} accent="text-emerald-700" />
      </div>

      {(overbooked.full > 0 || overbooked.nearFull > 0) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {overbooked.full > 0 && (
            <div className="inline-flex items-center gap-2 rounded-full bg-red-50 px-4 py-2 text-xs font-bold text-red-800">
              <AlertTriangle className="h-3.5 w-3.5" />
              {overbooked.full} dia(s) lotado(s) no periodo
            </div>
          )}
          {overbooked.nearFull > 0 && (
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5" />
              {overbooked.nearFull} dia(s) com ≥80% — atenção
            </div>
          )}
        </div>
      )}

      {/* Heatmap legenda */}
      <div className="mt-5 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-widest">
        {[
          { rate: 0, label: 'Vazio' },
          { rate: 30, label: 'Baixa <50%' },
          { rate: 65, label: 'Média 50-79%' },
          { rate: 90, label: 'Alta 80-99%' },
          { rate: 100, label: 'Lotado 100%' },
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
        <>
          {/* Heatmap global - 2 meses lado a lado */}
          <div className="mt-6 grid gap-8 lg:grid-cols-2">
            {months.map((m) => (
              <Fragment key={`${m.y}-${m.m}`}>
                <GlobalMonth
                  year={m.y}
                  month={m.m}
                  today={today}
                  selectedDay={selectedDay}
                  cells={globalCellsByDate}
                  onSelect={setSelectedDay}
                />
              </Fragment>
            ))}
          </div>

          {/* Tabela de disponibilidade por categoria - 14 dias */}
          <div className="mt-8">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-600">
                Disponibilidade por categoria — próximos 14 dias
                {selectedDay && selectedDay > today && ` (a partir de ${new Date(`${selectedDay}T12:00:00`).toLocaleDateString('pt-BR')})`}
              </p>
              {selectedDay && selectedDay > today && (
                <button
                  onClick={() => setSelectedDay(null)}
                  className="text-xs font-bold text-neutral-500 hover:text-neutral-900"
                >
                  Voltar para hoje
                </button>
              )}
            </div>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-neutral-200">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-[10px] font-black uppercase tracking-widest text-neutral-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Data</th>
                    <th className="px-4 py-3 text-right">Executivo (162)</th>
                    <th className="px-4 py-3 text-right">Master (30)</th>
                    <th className="px-4 py-3 text-right">Suíte (3)</th>
                    <th className="px-4 py-3 text-right">Total disp.</th>
                    <th className="px-4 py-3 text-right">Ocupação</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingDays.map((date) => {
                    const a = getAvailability(date);
                    const totalOcc = totalInventory > 0 ? (a.totalOccupied / totalInventory) * 100 : 0;
                    const c = getRateColor(totalOcc);
                    const dateObj = new Date(`${date}T12:00:00`);
                    return (
                      <tr key={date} className="cursor-pointer border-t border-neutral-100 hover:bg-neutral-50" onClick={() => setSelectedDay(date)}>
                        <td className="px-4 py-2.5">
                          <p className="text-sm font-bold text-neutral-900">
                            {dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                          </p>
                          <p className="text-[10px] uppercase tracking-widest text-neutral-400">
                            {dateObj.toLocaleDateString('pt-BR', { weekday: 'short' })}
                          </p>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${a.executivo.available === 0 ? 'bg-red-100 text-red-800' : a.executivo.available <= 5 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                            {a.executivo.available} <span className="text-[9px] opacity-70">disp.</span>
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${a.master.available === 0 ? 'bg-red-100 text-red-800' : a.master.available <= 3 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                            {a.master.available} <span className="text-[9px] opacity-70">disp.</span>
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${a['suite presidencial'].available === 0 ? 'bg-red-100 text-red-800' : a['suite presidencial'].available <= 1 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                            {a['suite presidencial'].available} <span className="text-[9px] opacity-70">disp.</span>
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className="text-sm font-black text-neutral-900 tabular-nums">{a.totalAvailable}</span>
                          <span className="ml-1 text-[10px] text-neutral-400">/{totalInventory}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-black ${c.bg} ${c.text}`}>
                            {totalOcc.toFixed(0)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[10px] text-neutral-500">
              Cores das colunas por categoria: <span className="font-bold text-emerald-700">verde</span> ok ·{' '}
              <span className="font-bold text-amber-700">âmbar</span> próximo do limite ·{' '}
              <span className="font-bold text-red-700">vermelho</span> esgotado.
            </p>
          </div>
        </>
      )}

      {/* Detail modal */}
      {selectedDay && selectedCellGlobal && (
        <DetailModal
          date={selectedDay}
          globalCell={selectedCellGlobal}
          cellsByCategory={cellsByCategory}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">{label}</p>
      <p className={`mt-1 text-lg font-black ${accent || 'text-neutral-900'}`}>{value}</p>
    </div>
  );
}

function GlobalMonth({
  year,
  month,
  today,
  selectedDay,
  cells,
  onSelect,
}: {
  year: number;
  month: number;
  today: string;
  selectedDay: string | null;
  cells: Record<string, GlobalCell>;
  onSelect: (date: string) => void;
}) {
  const total = daysInMonth(year, month);
  const offset = firstDayOfMonth(year, month);

  return (
    <div>
      <p className="mb-3 text-center text-sm font-bold text-neutral-900">
        {monthNames[month]} {year}
      </p>
      <div className="grid grid-cols-7 gap-1 text-[10px]">
        {WEEKDAY_LABELS.map((l) => (
          <div key={l} className="py-1 text-center font-bold uppercase tracking-widest text-neutral-400">
            {l}
          </div>
        ))}
        {Array.from({ length: offset }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {Array.from({ length: total }).map((_, i) => {
          const day = i + 1;
          const date = toISO(year, month, day);
          const cell = cells[date];
          const totalRooms = cell?.total || 0;
          const rate = cell && totalRooms > 0 ? (cell.occupied / totalRooms) * 100 : 0;
          const c = getRateColor(rate);
          const past = date < today;
          const isSelected = selectedDay === date;
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelect(date)}
              className={`flex flex-col items-center justify-center rounded-md py-2 transition ring-1 ring-inset ${c.bg} ${past ? 'opacity-50' : ''} ${isSelected ? `ring-2 ${c.ring}` : 'ring-transparent'} hover:ring-2 hover:ring-amber-400`}
              title={cell ? `${cell.occupied}/${cell.total} — ${rate.toFixed(0)}%` : ''}
            >
              <span className={`text-xs font-bold ${c.text}`}>{day}</span>
              <span className={`mt-0.5 text-[9px] tabular-nums ${c.text}`}>
                {cell ? `${cell.occupied}/${cell.total}` : '—'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DetailModal({
  date,
  globalCell,
  cellsByCategory,
  onClose,
}: {
  date: string;
  globalCell: GlobalCell;
  cellsByCategory: Record<Category, Record<string, DayCell>>;
  onClose: () => void;
}) {
  const rate = globalCell.total > 0 ? (globalCell.occupied / globalCell.total) * 100 : 0;
  const c = getRateColor(rate);
  const formatDate = new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  // All reservations for this date across categories
  const allReservations = useMemo(() => {
    const out: Array<Reservation & { cat: Category }> = [];
    for (const cat of CATEGORY_ORDER) {
      const cell = cellsByCategory[cat]?.[date];
      if (!cell) continue;
      for (const r of cell.reservations) out.push({ ...r, cat });
    }
    return out;
  }, [cellsByCategory, date]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-stone-950/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl rounded-3xl border border-neutral-200 bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 hover:bg-neutral-50"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-600">Ocupação do dia</p>
        <h3 className="mt-1 text-lg font-black text-neutral-950">{formatDate}</h3>

        <div className={`mt-4 flex items-center justify-between rounded-2xl px-5 py-4 ${c.bg}`}>
          <div>
            <p className={`text-3xl font-black ${c.text}`}>{globalCell.occupied}/{globalCell.total}</p>
            <p className={`text-xs uppercase tracking-widest ${c.text}`}>{c.label}</p>
          </div>
          <p className={`text-4xl font-black ${c.text}`}>{rate.toFixed(0)}%</p>
        </div>

        {/* Per-category breakdown */}
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {CATEGORY_ORDER.map((cat) => {
            const cell = cellsByCategory[cat]?.[date];
            const occ = cell?.occupied || 0;
            const tot = cell?.total || 0;
            const avail = Math.max(0, tot - occ);
            const r = tot > 0 ? (occ / tot) * 100 : 0;
            const cc = getRateColor(r);
            return (
              <div key={cat} className={`rounded-2xl px-4 py-3 ${cc.bg}`}>
                <p className={`text-[10px] font-black uppercase tracking-widest ${cc.text}`}>{CATEGORY_SHORT[cat]}</p>
                <p className={`mt-1 text-2xl font-black tabular-nums ${cc.text}`}>{avail}<span className="text-sm opacity-60"> / {tot}</span></p>
                <p className={`text-[10px] uppercase tracking-widest ${cc.text}`}>disponível</p>
              </div>
            );
          })}
        </div>

        <div className="mt-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
            Reservas / requests ativas no dia ({allReservations.length})
          </p>
          {allReservations.length === 0 ? (
            <p className="mt-3 rounded-xl bg-neutral-50 p-4 text-center text-sm text-neutral-500">
              Nenhuma reserva ativa para este dia.
            </p>
          ) : (
            <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
              {allReservations.map((r, idx) => (
                <li key={idx} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold text-neutral-900">{r.guest_name || '—'}</p>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-stone-700">
                        {CATEGORY_SHORT[r.cat as keyof typeof CATEGORY_SHORT]}
                      </span>
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
