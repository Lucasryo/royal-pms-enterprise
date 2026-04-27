import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { supabase } from '../supabase';

type DayInfo = { rate: number; weekend: boolean; label: string; min_nights: number };
type BlockedInfo = { reason: string };

type CalendarResponse =
  | { ok: true; rates_by_date: Record<string, DayInfo>; blocked_dates?: Record<string, BlockedInfo>; min_rate: number | null; max_rate: number | null; currency: string }
  | { ok: false; error: string };

const WEEKDAY_LABELS = ['Do.', '2ª', '3ª', '4ª', '5ª', '6ª', 'Sa.'];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function toISO(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function todayISO(): string {
  const d = new Date();
  return toISO(d.getFullYear(), d.getMonth(), d.getDate());
}

type MonthAnchor = { y: number; m: number };

function addMonths(base: MonthAnchor, delta: number): MonthAnchor {
  const total = base.y * 12 + base.m + delta;
  return { y: Math.floor(total / 12), m: ((total % 12) + 12) % 12 };
}

function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}

function firstDayOfMonth(y: number, m: number) {
  return new Date(y, m, 1).getDay(); // 0=Sun
}

const monthNames = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const formatBRLCompact = (n: number) =>
  n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

export type RatesCalendarValue = { check_in: string; check_out: string };

export default function RatesCalendar({
  category,
  value,
  onChange,
  minNights = 1,
}: {
  category: string;
  value: RatesCalendarValue;
  onChange: (v: RatesCalendarValue) => void;
  minNights?: number;
}) {
  const todayDate: string = useMemo(() => todayISO(), []);
  const initialAnchor = useMemo<MonthAnchor>(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  }, []);
  const [anchor, setAnchor] = useState<MonthAnchor>(initialAnchor);
  const [ratesMap, setRatesMap] = useState<Record<string, DayInfo>>({});
  const [blockedMap, setBlockedMap] = useState<Record<string, BlockedInfo>>({});
  const [loading, setLoading] = useState(false);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [phase, setPhase] = useState<'pick-in' | 'pick-out'>('pick-in');

  // Range covers anchor month + next month + a buffer
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const startISO = toISO(anchor.y, anchor.m, 1);
    const next = addMonths(anchor, 2);
    const endISO = toISO(next.y, next.m, daysInMonth(next.y, next.m));

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('public-rates-calendar', {
          body: { category, start_date: startISO, end_date: endISO },
        });
        if (cancelled) return;
        if (error) {
          setRatesMap({});
          return;
        }
        const resp = data as CalendarResponse;
        if (resp.ok) {
          setRatesMap((current) => ({ ...current, ...resp.rates_by_date }));
          setBlockedMap((current) => ({ ...current, ...(resp.blocked_dates ?? {}) }));
        } else {
          setRatesMap({});
        }
      } catch {
        if (!cancelled) setRatesMap({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [category, anchor]);

  const months: MonthAnchor[] = [anchor, addMonths(anchor, 1)];
  const canGoBack = !(anchor.y === initialAnchor.y && anchor.m === initialAnchor.m);

  function isBlocked(dateISO: string): boolean {
    return !!blockedMap[dateISO];
  }

  function handleDayClick(dateISO: string) {
    if (dateISO < todayDate) return;
    if (isBlocked(dateISO)) return;
    if (phase === 'pick-in') {
      onChange({ check_in: dateISO, check_out: '' });
      setPhase('pick-out');
      return;
    }
    if (dateISO <= value.check_in) {
      // user clicked earlier — restart from this day
      onChange({ check_in: dateISO, check_out: '' });
      setPhase('pick-out');
      return;
    }
    onChange({ check_in: value.check_in, check_out: dateISO });
    setPhase('pick-in');
  }

  function isInRange(dateISO: string): boolean {
    const start = value.check_in;
    const end = value.check_out || (phase === 'pick-out' ? hoverDate : '');
    if (!start || !end) return false;
    return dateISO > start && dateISO < end;
  }

  function isCheckIn(dateISO: string): boolean {
    return dateISO === value.check_in;
  }
  function isCheckOut(dateISO: string): boolean {
    return dateISO === value.check_out;
  }

  function nightsForRange(): number {
    if (!value.check_in || !value.check_out) return 0;
    const a = new Date(`${value.check_in}T12:00:00`);
    const b = new Date(`${value.check_out}T12:00:00`);
    return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
  }

  const nights = nightsForRange();

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => canGoBack && setAnchor(addMonths(anchor, -1))}
          disabled={!canGoBack}
          aria-label="Mes anterior"
          className={`flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 transition ${
            canGoBack ? 'text-stone-700 hover:bg-stone-50' : 'cursor-not-allowed text-stone-300'
          }`}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-stone-500">
          {phase === 'pick-in' ? 'Selecione a data de entrada' : 'Selecione a data de saida'}
          {loading && (
            <span className="ml-2 inline-flex items-center gap-1 text-stone-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              carregando
            </span>
          )}
        </p>

        <button
          type="button"
          onClick={() => setAnchor(addMonths(anchor, 1))}
          aria-label="Proximo mes"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 text-stone-700 transition hover:bg-stone-50"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        {months.map((m) => (
          <Fragment key={`${m.y}-${m.m}`}>
            <Month
              year={m.y}
              month={m.m}
              today={todayDate}
              ratesMap={ratesMap}
              blockedMap={blockedMap}
              checkIn={value.check_in}
              checkOut={value.check_out}
              hoverDate={hoverDate}
              phase={phase}
              onDayClick={handleDayClick}
              onDayHover={setHoverDate}
              isInRange={isInRange}
              isCheckIn={isCheckIn}
              isCheckOut={isCheckOut}
            />
          </Fragment>
        ))}
      </div>

      <div className="mt-5 flex flex-col items-center gap-2 border-t border-stone-100 pt-4 text-center">
        <p className="text-xs text-stone-500">
          Precos aproximados em BRL para uma estadia de 1 diaria
          {minNights > 1 && ` · estadia minima ${minNights} noites`}
        </p>
        <p className="text-sm font-bold text-stone-900">
          {value.check_in
            ? new Date(`${value.check_in}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
            : '—'}
          {' - '}
          {value.check_out
            ? new Date(`${value.check_out}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
            : '—'}
          {nights > 0 && ` · ${nights} ${nights === 1 ? 'diaria' : 'diarias'}`}
        </p>
      </div>
    </div>
  );
}

type MonthProps = {
  year: number;
  month: number;
  today: string;
  ratesMap: Record<string, DayInfo>;
  blockedMap: Record<string, BlockedInfo>;
  checkIn: string;
  checkOut: string;
  hoverDate: string | null;
  phase: 'pick-in' | 'pick-out';
  onDayClick: (iso: string) => void;
  onDayHover: (iso: string | null) => void;
  isInRange: (iso: string) => boolean;
  isCheckIn: (iso: string) => boolean;
  isCheckOut: (iso: string) => boolean;
};

function Month({
  year,
  month,
  today,
  ratesMap,
  blockedMap,
  checkIn,
  checkOut,
  hoverDate,
  phase,
  onDayClick,
  onDayHover,
  isInRange,
  isCheckIn,
  isCheckOut,
}: MonthProps) {
  const total = daysInMonth(year, month);
  const offset = firstDayOfMonth(year, month);
  const cells: Array<{ iso?: string; day?: number }> = [];
  for (let i = 0; i < offset; i++) cells.push({});
  for (let d = 1; d <= total; d++) cells.push({ iso: toISO(year, month, d), day: d });

  return (
    <div>
      <p className="mb-3 text-center text-sm font-bold text-stone-900">
        {monthNames[month]} {year}
      </p>
      <div className="grid grid-cols-7 gap-y-1 text-xs">
        {WEEKDAY_LABELS.map((l) => (
          <div key={l} className="py-1 text-center text-[10px] font-bold uppercase tracking-widest text-stone-400">
            {l}
          </div>
        ))}
        {cells.map((cell, idx) => {
          if (!cell.iso) return <div key={`e-${idx}`} />;
          const iso = cell.iso;
          const day = cell.day!;
          const past = iso < today;
          const blockedInfo = blockedMap[iso];
          const blocked = !!blockedInfo;
          const info = ratesMap[iso];
          const ci = isCheckIn(iso);
          const co = isCheckOut(iso);
          const inRange = isInRange(iso);
          const inHoverRange = phase === 'pick-out' && hoverDate && checkIn && hoverDate > checkIn && iso > checkIn && iso < hoverDate;
          const selected = ci || co;
          const unavailable = past || blocked;

          let cls = 'flex flex-col items-center justify-center rounded-md py-1 transition';
          if (blocked) {
            cls += ' cursor-not-allowed bg-red-50 text-red-300 relative';
          } else if (past) {
            cls += ' cursor-not-allowed text-stone-300';
          } else if (selected) {
            cls += ' bg-stone-950 text-white shadow-sm';
          } else if (inRange) {
            cls += ' bg-stone-100 text-stone-900';
          } else if (inHoverRange) {
            cls += ' bg-stone-50 text-stone-900';
          } else {
            cls += ' text-stone-900 hover:bg-stone-50 cursor-pointer';
          }

          return (
            <button
              type="button"
              key={iso}
              disabled={unavailable}
              onClick={() => onDayClick(iso)}
              onMouseEnter={() => !unavailable && onDayHover(iso)}
              onMouseLeave={() => onDayHover(null)}
              title={blocked ? (blockedInfo.reason || 'Indisponivel') : undefined}
              className={cls}
            >
              <span className={`text-sm font-medium ${selected ? 'text-white' : blocked ? 'line-through text-red-300' : ''}`}>{day}</span>
              {blocked ? (
                <span className="mt-0.5 text-[9px] text-red-400">fechado</span>
              ) : info && !past ? (
                <span className={`mt-0.5 text-[9px] tabular-nums ${selected ? 'text-white/80' : info.weekend ? 'text-amber-700' : 'text-stone-400'}`}>
                  {formatBRLCompact(info.rate)}
                </span>
              ) : (
                <span className="mt-0.5 text-[9px] text-transparent">—</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
