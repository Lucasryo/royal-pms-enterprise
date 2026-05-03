import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Hotel,
  Calendar,
  DollarSign,
  BarChart3,
  Users,
  Building2,
  RefreshCw,
  FileWarning,
  Package,
  Wrench,
} from 'lucide-react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachMonthOfInterval,
  parseISO,
  differenceInDays,
  isWithinInterval,
  subMonths,
  startOfYear,
  endOfYear,
  subYears,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '../supabase';
import { UserProfile } from '../types';
import { toast } from 'sonner';

type PeriodKey = '3m' | '6m' | 'thisYear' | 'lastYear';

interface RawReservation {
  id: string;
  guest_name: string;
  check_in: string;
  check_out: string;
  status: 'PENDING' | 'CONFIRMED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED';
  total_amount: number;
  category: string;
  company_id: string | null;
  tariff: number;
}

interface RawEvent {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
  total_value: number;
  is_quote: boolean;
  event_type: string;
  attendees_count: number;
}

interface RawRoom {
  id: string;
  category: string;
  is_virtual: boolean;
}

interface RawCompany {
  id: string;
  name: string;
}

interface RawFiscalJob {
  id: string;
  status: string;
}

interface RawInventoryItem {
  id: string;
  quantity: number;
  min_quantity: number;
}

interface RawMaintenanceTix {
  id: string;
  status: string;
}

interface RawBillingFile {
  id: string;
  company_id: string | null;
  amount: number | null;
  status: string;
  due_date: string | null;
  proof_date: string | null;
}

interface BiEntry {
  id: string;
  name: string;
  avgTicket: number;
  avgLeadTime: number;
  totalPaid: number;
  paymentRate: number;
}

interface FetchedData {
  reservations: RawReservation[];
  events: RawEvent[];
  rooms: RawRoom[];
  companies: RawCompany[];
  fiscalJobs: RawFiscalJob[];
  inventoryItems: RawInventoryItem[];
  maintenanceTix: RawMaintenanceTix[];
  billingFiles: RawBillingFile[];
}

function getPeriodRange(key: PeriodKey): { rangeStart: Date; rangeEnd: Date } {
  const today = new Date();
  switch (key) {
    case '3m':
      return { rangeStart: startOfMonth(subMonths(today, 2)), rangeEnd: endOfMonth(today) };
    case '6m':
      return { rangeStart: startOfMonth(subMonths(today, 5)), rangeEnd: endOfMonth(today) };
    case 'thisYear':
      return { rangeStart: startOfYear(today), rangeEnd: endOfYear(today) };
    case 'lastYear': {
      const ly = subYears(today, 1);
      return { rangeStart: startOfYear(ly), rangeEnd: endOfYear(ly) };
    }
  }
}

function fmtBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtPct(value: number): string {
  return value.toFixed(1) + '%';
}

function clampedDays(checkIn: string, checkOut: string, rangeStart: Date, rangeEnd: Date): number {
  const start = parseISO(checkIn);
  const end = parseISO(checkOut);
  const clampedStart = start < rangeStart ? rangeStart : start;
  const clampedEnd = end > rangeEnd ? rangeEnd : end;
  const days = differenceInDays(clampedEnd, clampedStart);
  return days > 0 ? days : 0;
}

function reservationOverlapsRange(r: RawReservation, rangeStart: Date, rangeEnd: Date): boolean {
  const checkIn = parseISO(r.check_in);
  const checkOut = parseISO(r.check_out);
  return checkIn < rangeEnd && checkOut > rangeStart;
}

const ACTIVE_STATUSES = new Set(['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT']);

const CATEGORY_LABELS: Record<string, string> = {
  executivo: 'Executivo',
  master: 'Master',
  'suite presidencial': 'Suite Presidencial',
};

const PERIOD_TABS: { key: PeriodKey; label: string }[] = [
  { key: '3m', label: 'Últimos 3 meses' },
  { key: '6m', label: 'Últimos 6 meses' },
  { key: 'thisYear', label: 'Ano atual' },
  { key: 'lastYear', label: 'Ano anterior' },
];

function TrendBadge({ value }: { value: number }) {
  if (!isFinite(value) || value === 0) return null;
  const positive = value > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-black px-1.5 py-0.5 rounded-full ${positive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}
    >
      {positive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {positive ? '+' : ''}
      {value.toFixed(1)}%
    </span>
  );
}

function KpiCard({
  label,
  value,
  sub,
  trend,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  trend?: number;
  icon?: React.ElementType;
}) {
  return (
    <div className="bg-white rounded-3xl border border-neutral-200 shadow-sm p-6 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">{label}</p>
        {Icon && (
          <span className="p-2 bg-amber-50 rounded-xl">
            <Icon size={16} className="text-[#C49A3C]" />
          </span>
        )}
      </div>
      <div className="flex items-end gap-2">
        <p className="font-display text-3xl font-light text-ink leading-none">{value}</p>
        {trend !== undefined && <TrendBadge value={trend} />}
      </div>
      {sub && <p className="text-[11px] text-stone-400">{sub}</p>}
    </div>
  );
}

export default function ReportsDashboard({ profile }: { profile: UserProfile }) {
  const [period, setPeriod] = useState<PeriodKey>('3m');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<FetchedData>({
    reservations: [],
    events: [],
    rooms: [],
    companies: [],
    fiscalJobs: [],
    inventoryItems: [],
    maintenanceTix: [],
    billingFiles: [],
  });

  const { rangeStart, rangeEnd } = useMemo(() => getPeriodRange(period), [period]);

  useEffect(() => {
    fetchData();
  }, [period]);

  async function fetchData() {
    setLoading(true);
    try {
      const rangeStartStr = format(rangeStart, 'yyyy-MM-dd');
      const rangeEndStr = format(rangeEnd, 'yyyy-MM-dd');

      const [resResult, evtResult, roomResult, coResult, fjResult, invResult, mxResult, bfResult] = await Promise.all([
        supabase
          .from('reservations')
          .select('id,guest_name,check_in,check_out,status,total_amount,category,company_id,tariff')
          .or(`check_in.lte.${rangeEndStr},check_out.gte.${rangeStartStr}`),
        supabase
          .from('hotel_events')
          .select('id,name,start_date,end_date,status,total_value,is_quote,event_type,attendees_count')
          .gte('start_date', rangeStartStr)
          .lte('start_date', rangeEndStr),
        supabase.from('rooms').select('id,category,is_virtual'),
        supabase.from('companies').select('id,name'),
        supabase.from('fiscal_jobs').select('id,status'),
        supabase.from('inventory_items').select('id,quantity,min_quantity'),
        supabase.from('maintenance_tickets').select('id,status'),
        supabase
          .from('files')
          .select('id,company_id,amount,status,due_date,proof_date')
          .neq('is_deleted', true)
          .gte('due_date', rangeStartStr)
          .lte('due_date', rangeEndStr),
      ]);

      if (resResult.error) throw resResult.error;
      if (evtResult.error) throw evtResult.error;
      if (roomResult.error) throw roomResult.error;
      if (coResult.error) throw coResult.error;

      setData({
        reservations: (resResult.data as RawReservation[]) ?? [],
        events: (evtResult.data as RawEvent[]) ?? [],
        rooms: (roomResult.data as RawRoom[]) ?? [],
        companies: (coResult.data as RawCompany[]) ?? [],
        fiscalJobs: (fjResult.data as RawFiscalJob[]) ?? [],
        inventoryItems: (invResult.data as RawInventoryItem[]) ?? [],
        maintenanceTix: (mxResult.data as RawMaintenanceTix[]) ?? [],
        billingFiles: (bfResult.data as RawBillingFile[]) ?? [],
      });
    } catch (err) {
      toast.error('Erro ao carregar relatórios');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const metrics = useMemo(() => {
    const { reservations, events, rooms } = data;

    const physicalRooms = rooms.filter((r) => !r.is_virtual);
    const totalRooms = physicalRooms.length;

    const daysInRange = differenceInDays(rangeEnd, rangeStart) || 1;
    const availableRoomNights = totalRooms * daysInRange;

    const activeReservations = reservations.filter(
      (r) => ACTIVE_STATUSES.has(r.status) && reservationOverlapsRange(r, rangeStart, rangeEnd)
    );

    let occupiedRoomNights = 0;
    let accommodationRevenue = 0;

    for (const r of activeReservations) {
      const daysInRes = differenceInDays(parseISO(r.check_out), parseISO(r.check_in)) || 1;
      const daysOverlap = clampedDays(r.check_in, r.check_out, rangeStart, rangeEnd);
      occupiedRoomNights += daysOverlap;
      const prorated = (daysOverlap / daysInRes) * r.total_amount;
      accommodationRevenue += prorated;
    }

    const occupancy = availableRoomNights > 0 ? (occupiedRoomNights / availableRoomNights) * 100 : 0;
    const adr = occupiedRoomNights > 0 ? accommodationRevenue / occupiedRoomNights : 0;
    const revpar = availableRoomNights > 0 ? accommodationRevenue / availableRoomNights : 0;

    const confirmedEvents = events.filter((e) => !e.is_quote && e.status !== 'cancelled');
    const eventRevenue = confirmedEvents.reduce((s, e) => s + (e.total_value ?? 0), 0);
    const totalRevenue = accommodationRevenue + eventRevenue;

    const midPoint = new Date((rangeStart.getTime() + rangeEnd.getTime()) / 2);

    const firstHalfRes = reservations.filter(
      (r) =>
        ACTIVE_STATUSES.has(r.status) &&
        reservationOverlapsRange(r, rangeStart, midPoint)
    );
    const secondHalfRes = reservations.filter(
      (r) =>
        ACTIVE_STATUSES.has(r.status) &&
        reservationOverlapsRange(r, midPoint, rangeEnd)
    );

    function halfRevenue(resArr: RawReservation[], start: Date, end: Date) {
      return resArr.reduce((s, r) => {
        const daysInRes = differenceInDays(parseISO(r.check_out), parseISO(r.check_in)) || 1;
        const overlap = clampedDays(r.check_in, r.check_out, start, end);
        return s + (overlap / daysInRes) * r.total_amount;
      }, 0);
    }

    const rev1 = halfRevenue(firstHalfRes, rangeStart, midPoint);
    const rev2 = halfRevenue(secondHalfRes, midPoint, rangeEnd);
    const revTrend = rev1 > 0 ? ((rev2 - rev1) / rev1) * 100 : 0;

    const halfDays1 = differenceInDays(midPoint, rangeStart) || 1;
    const halfDays2 = differenceInDays(rangeEnd, midPoint) || 1;
    const avail1 = totalRooms * halfDays1;
    const avail2 = totalRooms * halfDays2;
    const occ1Nights = firstHalfRes.reduce(
      (s, r) => s + clampedDays(r.check_in, r.check_out, rangeStart, midPoint),
      0
    );
    const occ2Nights = secondHalfRes.reduce(
      (s, r) => s + clampedDays(r.check_in, r.check_out, midPoint, rangeEnd),
      0
    );
    const occ1 = avail1 > 0 ? (occ1Nights / avail1) * 100 : 0;
    const occ2 = avail2 > 0 ? (occ2Nights / avail2) * 100 : 0;
    const occTrend = occ1 > 0 ? occ2 - occ1 : 0;

    const adr1 = occ1Nights > 0 ? rev1 / occ1Nights : 0;
    const adr2 = occ2Nights > 0 ? rev2 / occ2Nights : 0;
    const adrTrend = adr1 > 0 ? ((adr2 - adr1) / adr1) * 100 : 0;

    const categories = ['executivo', 'master', 'suite presidencial'];
    const categoryOccupancy = categories.map((cat) => {
      const catRooms = physicalRooms.filter((r) => r.category === cat).length;
      const catAvail = catRooms * daysInRange;
      const catNights = activeReservations
        .filter((r) => r.category === cat)
        .reduce((s, r) => s + clampedDays(r.check_in, r.check_out, rangeStart, rangeEnd), 0);
      const catOcc = catAvail > 0 ? (catNights / catAvail) * 100 : 0;
      return { category: cat, occ: catOcc, nights: catNights, avail: catAvail };
    });

    const companyMap = new Map<string, { name: string; count: number; revenue: number }>();
    for (const r of activeReservations) {
      const cid = r.company_id ?? '__none__';
      const comp = data.companies.find((c) => c.id === cid);
      const name = comp?.name ?? 'Sem empresa';
      if (!companyMap.has(cid)) companyMap.set(cid, { name, count: 0, revenue: 0 });
      const entry = companyMap.get(cid)!;
      entry.count += 1;
      const daysInRes = differenceInDays(parseISO(r.check_out), parseISO(r.check_in)) || 1;
      const overlap = clampedDays(r.check_in, r.check_out, rangeStart, rangeEnd);
      entry.revenue += (overlap / daysInRes) * r.total_amount;
    }
    const topCompanies = Array.from(companyMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((c) => ({ ...c, avgTicket: c.count > 0 ? c.revenue / c.count : 0 }));

    const months = eachMonthOfInterval({ start: rangeStart, end: rangeEnd });
    const monthlyData = months.map((monthDate) => {
      const mStart = startOfMonth(monthDate);
      const mEnd = endOfMonth(monthDate);
      const mResRevenue = activeReservations.reduce((s, r) => {
        if (!reservationOverlapsRange(r, mStart, mEnd)) return s;
        const daysInRes = differenceInDays(parseISO(r.check_out), parseISO(r.check_in)) || 1;
        const overlap = clampedDays(r.check_in, r.check_out, mStart, mEnd);
        return s + (overlap / daysInRes) * r.total_amount;
      }, 0);
      const mEvtRevenue = confirmedEvents
        .filter((e) => {
          const sd = parseISO(e.start_date);
          return isWithinInterval(sd, { start: mStart, end: mEnd });
        })
        .reduce((s, e) => s + (e.total_value ?? 0), 0);
      return {
        month: format(monthDate, 'MMM', { locale: ptBR }),
        hospedagem: Math.round(mResRevenue),
        eventos: Math.round(mEvtRevenue),
      };
    });

    const eventTypeCounts = new Map<string, number>();
    for (const e of confirmedEvents) {
      const t = e.event_type ?? 'Outro';
      eventTypeCounts.set(t, (eventTypeCounts.get(t) ?? 0) + 1);
    }
    const eventTypeRows = Array.from(eventTypeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count }));

    const totalAttendees = confirmedEvents.reduce((s, e) => s + (e.attendees_count ?? 0), 0);

    const fiscalPending = data.fiscalJobs.filter(
      (j) => j.status === 'pending' || j.status === 'error'
    ).length;
    const inventoryCritical = data.inventoryItems.filter(
      (i) => Number(i.quantity) <= Number(i.min_quantity)
    ).length;
    const maintenanceActive = data.maintenanceTix.filter(
      (t) => t.status === 'open' || t.status === 'in_progress'
    ).length;

    const companyStats: Record<string, {
      name: string;
      totalAmount: number;
      count: number;
      paidCount: number;
      totalLeadTime: number;
      paidAmount: number;
    }> = {};
    data.companies.forEach((c) => {
      companyStats[c.id] = { name: c.name, totalAmount: 0, count: 0, paidCount: 0, totalLeadTime: 0, paidAmount: 0 };
    });
    data.billingFiles.forEach((f) => {
      const cid = f.company_id;
      if (!cid || !companyStats[cid]) return;
      companyStats[cid].totalAmount += Number(f.amount) || 0;
      companyStats[cid].count += 1;
      if (f.status === 'PAID') {
        companyStats[cid].paidCount += 1;
        companyStats[cid].paidAmount += Number(f.amount) || 0;
        if (f.due_date && f.proof_date) {
          const diffDays = Math.floor(
            (new Date(f.proof_date).getTime() - new Date(f.due_date).getTime()) / (1000 * 60 * 60 * 24)
          );
          companyStats[cid].totalLeadTime += diffDays;
        }
      }
    });
    const biData: BiEntry[] = Object.entries(companyStats)
      .filter(([, s]) => s.count > 0)
      .map(([id, s]) => ({
        id,
        name: s.name,
        avgTicket: s.count > 0 ? s.totalAmount / s.count : 0,
        avgLeadTime: s.paidCount > 0 ? s.totalLeadTime / s.paidCount : 0,
        totalPaid: s.paidAmount,
        paymentRate: s.count > 0 ? (s.paidCount / s.count) * 100 : 0,
      }))
      .sort((a, b) => b.totalPaid - a.totalPaid);

    const avgTicketGlobal = biData.length > 0 ? biData.reduce((s, e) => s + e.avgTicket, 0) / biData.length : 0;
    const avgLeadTimeGlobal = biData.length > 0 ? biData.reduce((s, e) => s + e.avgLeadTime, 0) / biData.length : 0;
    const avgPaymentRateGlobal = biData.length > 0 ? biData.reduce((s, e) => s + e.paymentRate, 0) / biData.length : 0;

    return {
      totalRooms,
      physicalRooms,
      occupancy,
      occupiedRoomNights,
      availableRoomNights,
      adr,
      revpar,
      accommodationRevenue,
      eventRevenue,
      totalRevenue,
      revTrend,
      occTrend,
      adrTrend,
      categoryOccupancy,
      topCompanies,
      monthlyData,
      confirmedEvents,
      totalAttendees,
      eventTypeRows,
      daysInRange,
      fiscalPending,
      inventoryCritical,
      maintenanceActive,
      biData,
      avgTicketGlobal,
      avgLeadTimeGlobal,
      avgPaymentRateGlobal,
    };
  }, [data, rangeStart, rangeEnd]);

  const periodLabel = `${format(rangeStart, "d 'de' MMM yyyy", { locale: ptBR })} – ${format(rangeEnd, "d 'de' MMM yyyy", { locale: ptBR })}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <RefreshCw size={24} className="animate-spin text-[#C49A3C]" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-stone-500">Gestão</p>
          <h1 className="font-display text-2xl font-light text-ink">Relatórios</h1>
          <p className="text-xs text-stone-400 mt-1">{periodLabel}</p>
        </div>
        <div className="flex items-center gap-1 bg-neutral-100 rounded-2xl p-1">
          {PERIOD_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setPeriod(tab.key)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all ${
                period === tab.key
                  ? 'bg-white text-ink shadow-sm'
                  : 'text-stone-400 hover:text-stone-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Total UHs"
          value={String(metrics.totalRooms)}
          sub={`Exec: ${metrics.physicalRooms.filter((r) => r.category === 'executivo').length} · Master: ${metrics.physicalRooms.filter((r) => r.category === 'master').length} · Suite: ${metrics.physicalRooms.filter((r) => r.category === 'suite presidencial').length}`}
          icon={Hotel}
        />
        <KpiCard
          label="Taxa de Ocupação"
          value={fmtPct(metrics.occupancy)}
          sub={`${metrics.occupiedRoomNights} noites vendidas de ${metrics.availableRoomNights} disponíveis`}
          trend={metrics.occTrend}
          icon={BarChart3}
        />
        <KpiCard
          label="ADR – Diária Média"
          value={fmtBRL(metrics.adr)}
          sub={`RevPAR: ${fmtBRL(metrics.revpar)}`}
          trend={metrics.adrTrend}
          icon={DollarSign}
        />
        <KpiCard
          label="Receita Total"
          value={fmtBRL(metrics.totalRevenue)}
          sub={`Hospedagem: ${fmtBRL(metrics.accommodationRevenue)} · Eventos: ${fmtBRL(metrics.eventRevenue)}`}
          trend={metrics.revTrend}
          icon={TrendingUp}
        />
      </div>

      <div className="bg-white rounded-3xl border border-neutral-200 shadow-sm p-6">
        <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1">Receita Mensal</p>
        <p className="font-display text-lg font-light text-ink mb-6">Hospedagem vs Eventos</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={metrics.monthlyData} barGap={4} barCategoryGap="30%">
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: '#78716C' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#78716C' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`}
              width={64}
            />
            <Tooltip
              formatter={(value: number, name: string) => [
                fmtBRL(value),
                name === 'hospedagem' ? 'Hospedagem' : 'Eventos',
              ]}
              contentStyle={{ borderRadius: 12, border: '1px solid #e5e5e5', fontSize: 12 }}
              cursor={{ fill: '#f5f5f4' }}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              formatter={(v) => (v === 'hospedagem' ? 'Hospedagem' : 'Eventos')}
              wrapperStyle={{ fontSize: 11 }}
            />
            <Bar dataKey="hospedagem" fill="#1E293B" radius={[6, 6, 0, 0]} />
            <Bar dataKey="eventos" fill="#C49A3C" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-3xl border border-neutral-200 shadow-sm p-6">
          <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1">Ocupação</p>
          <p className="font-display text-lg font-light text-ink mb-6">Por Categoria</p>
          <div className="space-y-5">
            {metrics.categoryOccupancy.map(({ category, occ, nights, avail }) => (
              <div key={category}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[11px] font-black uppercase text-stone-500 tracking-wide">
                    {CATEGORY_LABELS[category] ?? category}
                  </span>
                  <span className="text-sm font-light text-ink">{fmtPct(occ)}</span>
                </div>
                <div className="h-2 w-full bg-neutral-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(occ, 100)}%`, backgroundColor: '#C49A3C' }}
                  />
                </div>
                <p className="text-[10px] text-stone-400 mt-1">
                  {nights} noites vendidas de {avail} disponíveis
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-neutral-200 shadow-sm p-6">
          <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1">Empresas</p>
          <p className="font-display text-lg font-light text-ink mb-6">Top 5 por Reservas</p>
          {metrics.topCompanies.length === 0 ? (
            <p className="text-sm text-stone-400">Nenhum dado disponível.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-100">
                    <th className="text-left pb-2 text-[10px] font-black uppercase text-neutral-400 tracking-widest">#</th>
                    <th className="text-left pb-2 text-[10px] font-black uppercase text-neutral-400 tracking-widest">Empresa</th>
                    <th className="text-right pb-2 text-[10px] font-black uppercase text-neutral-400 tracking-widest">Res.</th>
                    <th className="text-right pb-2 text-[10px] font-black uppercase text-neutral-400 tracking-widest">Receita</th>
                    <th className="text-right pb-2 text-[10px] font-black uppercase text-neutral-400 tracking-widest">Ticket Médio</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.topCompanies.map((c, i) => (
                    <tr key={i} className="border-b border-neutral-50 hover:bg-stone-50 transition-colors">
                      <td className="py-2.5 pr-2 text-[11px] font-black text-neutral-300">{i + 1}</td>
                      <td className="py-2.5 font-light text-ink truncate max-w-[120px]">{c.name}</td>
                      <td className="py-2.5 text-right tabular-nums text-stone-600">{c.count}</td>
                      <td className="py-2.5 text-right tabular-nums text-stone-600">{fmtBRL(c.revenue)}</td>
                      <td className="py-2.5 text-right tabular-nums text-stone-600">{fmtBRL(c.avgTicket)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-neutral-200 shadow-sm p-6">
        <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1">Eventos</p>
        <p className="font-display text-lg font-light text-ink mb-6">Resumo do Período</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-neutral-50 rounded-2xl p-4 flex flex-col gap-1">
            <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest flex items-center gap-1">
              <Calendar size={11} className="text-[#C49A3C]" />
              Total de Eventos
            </p>
            <p className="font-display text-2xl font-light text-ink">{metrics.confirmedEvents.length}</p>
          </div>
          <div className="bg-neutral-50 rounded-2xl p-4 flex flex-col gap-1">
            <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest flex items-center gap-1">
              <Users size={11} className="text-[#C49A3C]" />
              Total de Participantes
            </p>
            <p className="font-display text-2xl font-light text-ink">
              {metrics.totalAttendees.toLocaleString('pt-BR')}
            </p>
          </div>
          <div className="bg-neutral-50 rounded-2xl p-4 flex flex-col gap-1">
            <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest flex items-center gap-1">
              <DollarSign size={11} className="text-[#C49A3C]" />
              Receita de Eventos
            </p>
            <p className="font-display text-2xl font-light text-ink">{fmtBRL(metrics.eventRevenue)}</p>
          </div>
        </div>

        {metrics.eventTypeRows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100">
                  <th className="text-left pb-2 text-[10px] font-black uppercase text-neutral-400 tracking-widest">Tipo de Evento</th>
                  <th className="text-right pb-2 text-[10px] font-black uppercase text-neutral-400 tracking-widest">Quantidade</th>
                </tr>
              </thead>
              <tbody>
                {metrics.eventTypeRows.map(({ type, count }) => (
                  <tr key={type} className="border-b border-neutral-50 hover:bg-stone-50 transition-colors">
                    <td className="py-2.5 font-light text-ink">{type}</td>
                    <td className="py-2.5 text-right tabular-nums text-stone-600">{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Indicadores Operacionais */}
      <div className="bg-white rounded-3xl border border-neutral-200 shadow-sm p-6">
        <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1">Operacional</p>
        <p className="font-display text-lg font-light text-ink mb-6">Indicadores Operacionais</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard
            label="Fiscal Pendente"
            value={String(metrics.fiscalPending)}
            sub="Fila NFS-e/RPS"
            icon={FileWarning}
          />
          <KpiCard
            label="Estoque Crítico"
            value={String(metrics.inventoryCritical)}
            sub="Itens abaixo do mínimo"
            icon={Package}
          />
          <KpiCard
            label="Chamados Ativos"
            value={String(metrics.maintenanceActive)}
            sub="Manutenção e SLA"
            icon={Wrench}
          />
        </div>
      </div>

      {/* BI Financeiro */}
      <div className="space-y-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-stone-500">Financeiro</p>
          <h2 className="font-display text-2xl font-light text-ink">BI Financeiro</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard
            label="Ticket Médio Geral"
            value={fmtBRL(metrics.avgTicketGlobal)}
            sub="Média ponderada por empresa"
            icon={DollarSign}
          />
          <KpiCard
            label="Lead Time Médio"
            value={`${metrics.avgLeadTimeGlobal.toFixed(1)} dias`}
            sub="Tempo médio para liquidação"
            icon={Calendar}
          />
          <KpiCard
            label="Taxa de Adimplência"
            value={fmtPct(metrics.avgPaymentRateGlobal)}
            sub="Média de faturas pagas"
            icon={TrendingUp}
          />
        </div>

        {metrics.biData.length > 0 && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-3xl border border-neutral-200 shadow-sm p-6">
                <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1">Faturamento</p>
                <p className="font-display text-lg font-light text-ink mb-6">Ticket Médio por Empresa</p>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={metrics.biData.slice(0, 10)} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke="#f0f0f0" />
                    <XAxis
                      type="number"
                      fontSize={10}
                      tick={{ fill: '#78716C' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
                    />
                    <YAxis
                      dataKey="name"
                      type="category"
                      fontSize={10}
                      width={110}
                      tick={{ fill: '#78716C' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      formatter={(v: number) => [fmtBRL(v), 'Ticket Médio']}
                      contentStyle={{ borderRadius: 12, border: '1px solid #e5e5e5', fontSize: 12 }}
                      cursor={{ fill: '#f5f5f4' }}
                    />
                    <Bar dataKey="avgTicket" fill="#3b82f6" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-3xl border border-neutral-200 shadow-sm p-6">
                <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1">Pagamentos</p>
                <p className="font-display text-lg font-light text-ink mb-6">Lead Time de Pagamento (dias)</p>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={metrics.biData.slice(0, 10)} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke="#f0f0f0" />
                    <XAxis
                      type="number"
                      fontSize={10}
                      tick={{ fill: '#78716C' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      dataKey="name"
                      type="category"
                      fontSize={10}
                      width={110}
                      tick={{ fill: '#78716C' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      formatter={(v: number) => [`${v.toFixed(1)} dias`, 'Lead Time']}
                      contentStyle={{ borderRadius: 12, border: '1px solid #e5e5e5', fontSize: 12 }}
                      cursor={{ fill: '#f5f5f4' }}
                    />
                    <Bar dataKey="avgLeadTime" fill="#C49A3C" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-neutral-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-neutral-100">
                <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1">Ranking</p>
                <p className="font-display text-lg font-light text-ink">Performance por Cliente</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-100 bg-neutral-50">
                      <th className="text-left px-6 py-3 text-[10px] font-black uppercase text-neutral-400 tracking-widest">Empresa</th>
                      <th className="text-right px-6 py-3 text-[10px] font-black uppercase text-neutral-400 tracking-widest">Ticket Médio</th>
                      <th className="text-right px-6 py-3 text-[10px] font-black uppercase text-neutral-400 tracking-widest">Faturamento Pago</th>
                      <th className="text-center px-6 py-3 text-[10px] font-black uppercase text-neutral-400 tracking-widest">Lead Time</th>
                      <th className="text-center px-6 py-3 text-[10px] font-black uppercase text-neutral-400 tracking-widest">Adimplência</th>
                      <th className="text-center px-6 py-3 text-[10px] font-black uppercase text-neutral-400 tracking-widest">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-50">
                    {metrics.biData.map((item) => (
                      <tr key={item.id} className="hover:bg-stone-50 transition-colors">
                        <td className="px-6 py-3 font-light text-ink truncate max-w-[160px]">{item.name}</td>
                        <td className="px-6 py-3 text-right tabular-nums text-stone-600">{fmtBRL(item.avgTicket)}</td>
                        <td className="px-6 py-3 text-right tabular-nums font-medium text-emerald-600">{fmtBRL(item.totalPaid)}</td>
                        <td className="px-6 py-3 text-center">
                          <span className={`text-sm font-medium ${item.avgLeadTime > 5 ? 'text-red-600' : item.avgLeadTime > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {item.avgLeadTime.toFixed(1)} dias
                          </span>
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-16 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all ${item.paymentRate > 90 ? 'bg-emerald-500' : item.paymentRate > 70 ? 'bg-amber-500' : 'bg-red-500'}`}
                                style={{ width: `${item.paymentRate}%` }}
                              />
                            </div>
                            <span className="text-[11px] font-black text-stone-600 tabular-nums">{item.paymentRate.toFixed(0)}%</span>
                          </div>
                        </td>
                        <td className="px-6 py-3 text-center">
                          {item.paymentRate > 90 && item.avgLeadTime <= 2 ? (
                            <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-black uppercase">Excelente</span>
                          ) : item.paymentRate < 70 || item.avgLeadTime > 7 ? (
                            <span className="px-2 py-1 bg-red-50 text-red-700 rounded-full text-[10px] font-black uppercase">Risco</span>
                          ) : (
                            <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded-full text-[10px] font-black uppercase">Atenção</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
