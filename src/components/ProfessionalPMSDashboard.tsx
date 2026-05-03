import { ComponentType, FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { MaintenanceTicket, Reservation, Room, UserProfile } from '../types';
import { hasPermission } from '../lib/permissions';
import { logAudit } from '../lib/audit';
import {
  ClipboardCheck,
  CreditCard,
  FileWarning,
  Loader2,
  PackageCheck,
  Plus,
  Sparkles,
  Star,
  TrendingUp,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import EnterpriseExtensionsDashboard from './EnterpriseExtensionsDashboard';

type ProTab = 'night-audit' | 'revenue' | 'fiscal' | 'crm' | 'inventory' | 'cash' | 'guest-portal' | 'enterprise';

type NightAudit = {
  id: string;
  audit_date: string;
  status: 'open' | 'closed' | 'reopened';
  occupancy_rate: number;
  room_revenue: number;
  pos_revenue: number;
  pending_items: number;
  notes?: string;
  closed_by?: string;
  created_at: string;
};

type RateRule = {
  id: string;
  name: string;
  category: string;
  season_name?: string;
  start_date: string;
  end_date: string;
  base_rate: number;
  min_nights: number;
  weekday_multiplier: number;
  weekend_multiplier: number;
  occupancy_trigger: number;
  active: boolean;
};

type RateShopperCompetitor = {
  id: string;
  name: string;
  city: string;
  locality?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  source?: string;
  observed_rate?: number;
  category?: string;
  notes?: string;
  last_checked_at?: string;
};

type FiscalJob = {
  id: string;
  reservation_code?: string;
  document_type: 'nfse' | 'rps' | 'invoice';
  status: 'pending' | 'processing' | 'issued' | 'error' | 'cancelled';
  amount: number;
  error_message?: string;
  created_at: string;
};

type GuestProfile = {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
  vip_level: 'standard' | 'vip' | 'blacklist';
  preferences?: string;
  restrictions?: string;
  consent_lgpd: boolean;
  last_stay_at?: string;
};

type InventoryItem = {
  id: string;
  sku: string;
  name: string;
  department: 'restaurant' | 'housekeeping' | 'maintenance' | 'frontdesk';
  quantity: number;
  min_quantity: number;
  unit_cost: number;
  supplier?: string;
};

type CashSession = {
  id: string;
  opened_by?: string;
  closed_by?: string;
  department: 'restaurant' | 'frontdesk';
  opening_amount: number;
  closing_amount?: number;
  status: 'open' | 'closed';
  opened_at: string;
  closed_at?: string;
};

type GuestServiceRequest = {
  id: string;
  guest_name: string;
  room_number?: string;
  request_type: 'pre_checkin' | 'amenity' | 'maintenance' | 'late_checkout' | 'document';
  status: 'new' | 'in_progress' | 'done' | 'cancelled';
  notes?: string;
  created_at: string;
};

const tabs: Array<{ id: ProTab; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: 'night-audit', label: 'Auditoria Noturna', icon: ClipboardCheck },
  { id: 'revenue', label: 'Revenue & Tarifas', icon: TrendingUp },
  { id: 'fiscal', label: 'NFS-e/RPS', icon: FileWarning },
  { id: 'crm', label: 'CRM Hospedes', icon: UserRound },
  { id: 'inventory', label: 'Estoque', icon: PackageCheck },
  { id: 'cash', label: 'Caixa POS', icon: CreditCard },
  { id: 'guest-portal', label: 'Portal Hospede', icon: Sparkles },
  { id: 'enterprise', label: 'Enterprise', icon: Star },
];

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function ProfessionalPMSDashboard({ profile, allowedTabs }: { profile: UserProfile; allowedTabs?: ProTab[] }) {
  const canManage = hasPermission(profile, 'canManageProfessionalTools', ['admin', 'manager', 'finance', 'faturamento']);
  const visibleTabs = allowedTabs ? tabs.filter((t) => allowedTabs.includes(t.id)) : tabs;
  const [activeTab, setActiveTab] = useState<ProTab>(visibleTabs[0]?.id ?? 'night-audit');
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const loadedTabs = useRef<Set<ProTab>>(new Set());
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [nightAudits, setNightAudits] = useState<NightAudit[]>([]);
  const [rateRules, setRateRules] = useState<RateRule[]>([]);
  const [competitors, setCompetitors] = useState<RateShopperCompetitor[]>([]);
  const [fiscalJobs, setFiscalJobs] = useState<FiscalJob[]>([]);
  const [guestProfiles, setGuestProfiles] = useState<GuestProfile[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [cashSessions, setCashSessions] = useState<CashSession[]>([]);
  const [guestRequests, setGuestRequests] = useState<GuestServiceRequest[]>([]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchSummary(); fetchTabData(activeTab); }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!loadedTabs.current.has(activeTab)) fetchTabData(activeTab); }, [activeTab]);

  async function fetchSummary() {
    setLoading(true);
    const [res, room, ticket, stock, fiscal] = await Promise.all([
      supabase.from('reservations').select('*'),
      supabase.from('rooms').select('*'),
      supabase.from('maintenance_tickets').select('*'),
      supabase.from('inventory_items').select('*').order('department').order('name'),
      supabase.from('fiscal_jobs').select('*').order('created_at', { ascending: false }).limit(30),
    ]);
    if (res.data) setReservations(res.data as Reservation[]);
    if (room.data) setRooms(room.data as Room[]);
    if (ticket.data) setTickets(ticket.data as MaintenanceTicket[]);
    if (stock.data) setInventory(stock.data as InventoryItem[]);
    if (fiscal.data) setFiscalJobs(fiscal.data as FiscalJob[]);
    setLoading(false);
  }

  async function fetchTabData(tab: ProTab) {
    setTabLoading(true);
    switch (tab) {
      case 'night-audit': {
        const { data } = await supabase.from('night_audits').select('*').order('audit_date', { ascending: false }).limit(20);
        if (data) setNightAudits(data as NightAudit[]);
        break;
      }
      case 'revenue': {
        const [rules, competitorRes] = await Promise.all([
          supabase.from('rate_rules').select('*').order('start_date', { ascending: false }),
          supabase.from('rate_shopper_competitors').select('*').order('last_checked_at', { ascending: false }),
        ]);
        if (rules.data) setRateRules(rules.data as RateRule[]);
        if (competitorRes.data) setCompetitors(competitorRes.data as RateShopperCompetitor[]);
        break;
      }
      case 'crm': {
        const { data } = await supabase.from('guest_profiles').select('*').order('full_name');
        if (data) setGuestProfiles(data as GuestProfile[]);
        break;
      }
      case 'cash': {
        const { data } = await supabase.from('cash_sessions').select('*').order('opened_at', { ascending: false }).limit(20);
        if (data) setCashSessions(data as CashSession[]);
        break;
      }
      case 'guest-portal': {
        const { data } = await supabase.from('guest_service_requests').select('*').order('created_at', { ascending: false }).limit(30);
        if (data) setGuestRequests(data as GuestServiceRequest[]);
        break;
      }
      // 'fiscal', 'inventory', 'enterprise': data comes from fetchSummary or is self-contained
    }
    loadedTabs.current.add(tab);
    setTabLoading(false);
  }

  function refreshData() {
    loadedTabs.current.delete(activeTab);
    fetchSummary();
    fetchTabData(activeTab);
  }

  const checkedIn = reservations.filter((reservation) => reservation.status === 'CHECKED_IN');
  const occupiedRooms = rooms.filter((room) => room.status === 'occupied').length;
  const physicalRooms = rooms.filter((room) => !room.is_virtual);
  const occupancyRate = physicalRooms.length ? Math.round((occupiedRooms / physicalRooms.length) * 100) : 0;
  const roomRevenue = reservations.reduce((sum, reservation) => sum + Number(reservation.total_amount || 0), 0);
  const lowStock = inventory.filter((item) => Number(item.quantity) <= Number(item.min_quantity));
  const openFiscal = fiscalJobs.filter((job) => job.status === 'pending' || job.status === 'error');
  const openTickets = tickets.filter((ticket) => ticket.status === 'open' || ticket.status === 'in_progress');

  const categoryAvailability = useMemo(() => {
    return physicalRooms.reduce<Record<string, { total: number; blocked: number; occupied: number }>>((acc, room) => {
      acc[room.category] = acc[room.category] || { total: 0, blocked: 0, occupied: 0 };
      acc[room.category].total += 1;
      if (room.status === 'maintenance' || room.housekeeping_status === 'out_of_order') acc[room.category].blocked += 1;
      if (room.status === 'occupied') acc[room.category].occupied += 1;
      return acc;
    }, {});
  }, [physicalRooms]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-amber-600">Prioridades altas e medias</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-neutral-950">Gestao Pro do PMS</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-neutral-500">
            Auditoria noturna, revenue, fiscal, CRM, estoque, caixa, portal do hospede e relatorios executivos em uma unica central.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="Ocupacao" value={`${occupancyRate}%`} />
          <Metric label="Receita" value={money(roomRevenue)} />
          <Metric label="Baixo estoque" value={String(lowStock.length)} />
          <Metric label="Pendencias" value={String(openFiscal.length + openTickets.length)} />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto rounded-3xl border border-neutral-200 bg-white p-2 shadow-sm">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-2xl px-3 py-2 md:px-4 md:py-3 text-xs font-black transition ${
                active ? 'bg-neutral-950 text-white' : 'bg-neutral-50 text-neutral-500 hover:bg-neutral-100'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {tabLoading && (
        <div className="flex items-center gap-2 rounded-2xl bg-neutral-50 px-4 py-3 text-xs font-bold text-neutral-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Carregando...
        </div>
      )}
      {activeTab === 'night-audit' && (
        <NightAuditPanel
          canManage={canManage}
          profile={profile}
          audits={nightAudits}
          occupancyRate={occupancyRate}
          roomRevenue={roomRevenue}
          pendingItems={openFiscal.length + openTickets.length}
          onSaved={refreshData}
        />
      )}
      {activeTab === 'revenue' && (
        <RevenuePanel
          canManage={canManage}
          canManageRateShopper={canManage || profile.role === 'reservations' || profile.role === 'admin'}
          rules={rateRules}
          competitors={competitors}
          categoryAvailability={categoryAvailability}
          checkedIn={checkedIn.length}
          totalRooms={physicalRooms.length}
          onSaved={refreshData}
        />
      )}
      {activeTab === 'fiscal' && <FiscalPanel canManage={canManage} jobs={fiscalJobs} reservations={reservations} onSaved={refreshData} />}
      {activeTab === 'crm' && <CrmPanel canManage={canManage} guests={guestProfiles} onSaved={refreshData} />}
      {activeTab === 'inventory' && <InventoryPanel canManage={canManage} items={inventory} onSaved={refreshData} />}
      {activeTab === 'cash' && <CashPanel canManage={canManage} sessions={cashSessions} profile={profile} onSaved={refreshData} />}
      {activeTab === 'guest-portal' && <GuestPortalPanel canManage={canManage} requests={guestRequests} onSaved={refreshData} />}
      {activeTab === 'enterprise' && <EnterpriseExtensionsDashboard profile={profile} canManage={canManage} />}
    </div>
  );
}

function NightAuditPanel({
  canManage,
  profile,
  audits,
  occupancyRate,
  roomRevenue,
  pendingItems,
  onSaved,
}: {
  canManage: boolean;
  profile: UserProfile;
  audits: NightAudit[];
  occupancyRate: number;
  roomRevenue: number;
  pendingItems: number;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  async function closeAudit(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    const { error } = await supabase.from('night_audits').insert([{
      audit_date: date,
      status: 'closed',
      occupancy_rate: occupancyRate,
      room_revenue: roomRevenue,
      pos_revenue: 0,
      pending_items: pendingItems,
      notes,
      closed_by: profile.id,
    }]);
    if (error) {
      toast.error('Erro ao fechar auditoria: ' + error.message);
      return;
    }
    await logAudit({ user_id: profile.id, user_name: profile.name, action: 'Auditoria noturna fechada', details: date, type: 'create' });
    toast.success('Auditoria noturna fechada.');
    setNotes('');
    onSaved();
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <form onSubmit={closeAudit} className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black text-neutral-950">Fechamento do dia</h2>
        <p className="mt-2 text-sm leading-7 text-neutral-500">Trava operacional para virar diaria, revisar pendencias e registrar divergencias.</p>
        <div className="mt-5 grid gap-3">
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm" />
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={5} className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm" placeholder="Divergencias, no-shows, pendencias de caixa, UHs bloqueadas..." />
          <button disabled={!canManage} className="rounded-2xl bg-neutral-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50">
            Fechar auditoria noturna
          </button>
        </div>
      </form>
      <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black text-neutral-950">Historico</h2>
        <div className="mt-5 space-y-3">
          {audits.length === 0 ? <Empty label="Nenhum fechamento registrado." /> : audits.map((audit) => (
            <div key={audit.id} className="rounded-2xl bg-neutral-50 p-4">
              <div className="flex items-center justify-between">
                <p className="font-black text-neutral-900">{new Date(`${audit.audit_date}T12:00:00`).toLocaleDateString('pt-BR')}</p>
                <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase text-emerald-700">{audit.status}</span>
              </div>
              <p className="mt-2 text-sm text-neutral-500">Ocupacao {audit.occupancy_rate}% - Receita {money(Number(audit.room_revenue || 0))} - Pendencias {audit.pending_items}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RevenuePanel({
  canManage,
  canManageRateShopper,
  rules,
  competitors,
  categoryAvailability,
  checkedIn,
  totalRooms,
  onSaved,
}: {
  canManage: boolean;
  canManageRateShopper: boolean;
  rules: RateRule[];
  competitors: RateShopperCompetitor[];
  categoryAvailability: Record<string, { total: number; blocked: number; occupied: number }>;
  checkedIn: number;
  totalRooms: number;
  onSaved: () => void;
}) {
  const [cityQuery, setCityQuery] = useState('');
  const [locating, setLocating] = useState(false);
  const [locatedCompetitors, setLocatedCompetitors] = useState<Array<{
    name: string;
    city: string;
    locality?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    source?: string;
  }>>([]);
  const [form, setForm] = useState({
    name: '',
    category: 'executivo',
    season_name: '',
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    base_rate: '250',
    min_nights: '1',
    weekday_multiplier: '1',
    weekend_multiplier: '1.2',
    occupancy_trigger: '80',
  });

  async function saveRule(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    const { error } = await supabase.from('rate_rules').insert([{
      ...form,
      base_rate: Number(form.base_rate),
      min_nights: Number(form.min_nights),
      weekday_multiplier: Number(form.weekday_multiplier),
      weekend_multiplier: Number(form.weekend_multiplier),
      occupancy_trigger: Number(form.occupancy_trigger),
      active: true,
    }]);
    if (error) {
      toast.error('Erro ao salvar regra tarifaria: ' + error.message);
      return;
    }
    toast.success('Regra tarifaria criada.');
    setForm({ ...form, name: '' });
    onSaved();
  }

  async function locateCompetitors(event: FormEvent) {
    event.preventDefault();
    if (!canManageRateShopper || cityQuery.trim().length < 2) return;
    setLocating(true);
    try {
      const { data, error } = await supabase.functions.invoke('rate-shopper-locate', {
        body: { city: cityQuery.trim() },
      });
      if (error) throw error;
      setLocatedCompetitors(data?.competitors || []);
      if ((data?.competitors || []).length === 0) {
        toast.info('Nenhum concorrente localizado para essa busca.');
      }
    } catch (error) {
      console.error(error);
      toast.error('Nao foi possivel localizar concorrentes agora.');
    } finally {
      setLocating(false);
    }
  }

  async function saveCompetitor(competitor: {
    name: string;
    city: string;
    locality?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    source?: string;
  }) {
    if (!canManageRateShopper) return;
    const { error } = await supabase.from('rate_shopper_competitors').insert([{
      ...competitor,
      observed_rate: null,
      category: 'hotel',
      notes: 'Localizado por busca de cidade/localidade.',
      last_checked_at: new Date().toISOString(),
    }]);
    if (error) {
      toast.error('Erro ao salvar concorrente: ' + error.message);
      return;
    }
    toast.success('Concorrente salvo no rate shopper.');
    onSaved();
  }

  async function updateCompetitorRate(competitor: RateShopperCompetitor, observedRate: string) {
    if (!canManageRateShopper) return;
    const parsed = Number(observedRate);
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error('Informe uma tarifa valida.');
      return;
    }
    const { error } = await supabase
      .from('rate_shopper_competitors')
      .update({ observed_rate: parsed, last_checked_at: new Date().toISOString() })
      .eq('id', competitor.id);
    if (error) {
      toast.error('Erro ao atualizar tarifa: ' + error.message);
      return;
    }
    toast.success('Tarifa concorrente atualizada.');
    onSaved();
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <form onSubmit={saveRule} className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black text-neutral-950">Motor tarifario</h2>
        <p className="mt-2 text-sm leading-7 text-neutral-500">Regras por temporada, categoria, ocupacao, minimo de noites e multiplicador de fim de semana.</p>
        <div className="mt-5 grid gap-3">
          <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm" placeholder="Nome da regra" />
          <div className="grid grid-cols-2 gap-3">
            <input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm" placeholder="Categoria" />
            <input value={form.season_name} onChange={(event) => setForm({ ...form, season_name: event.target.value })} className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm" placeholder="Temporada" />
            <input type="date" value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm" />
            <input type="date" value={form.end_date} onChange={(event) => setForm({ ...form, end_date: event.target.value })} className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm" />
            <input type="number" value={form.base_rate} onChange={(event) => setForm({ ...form, base_rate: event.target.value })} className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm" placeholder="Tarifa base" />
            <input type="number" value={form.min_nights} onChange={(event) => setForm({ ...form, min_nights: event.target.value })} className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm" placeholder="Min noites" />
            <input type="number" step="0.01" value={form.weekday_multiplier} onChange={(event) => setForm({ ...form, weekday_multiplier: event.target.value })} className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm" placeholder="Multiplicador semana" />
            <input type="number" step="0.01" value={form.weekend_multiplier} onChange={(event) => setForm({ ...form, weekend_multiplier: event.target.value })} className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm" placeholder="Multiplicador FDS" />
          </div>
          <button disabled={!canManage} className="rounded-2xl bg-neutral-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50">Salvar regra</button>
        </div>
      </form>
      <div className="space-y-6">
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black text-neutral-950">Rate shopper manual</h2>
          <p className="mt-2 text-sm leading-7 text-neutral-500">
            Localize concorrentes pela cidade/localidade, salve na base e atualize tarifa observada manualmente.
          </p>
          <form onSubmit={locateCompetitors} className="mt-5 flex flex-col gap-3 md:flex-row">
            <input
              value={cityQuery}
              onChange={(event) => setCityQuery(event.target.value)}
              className="flex-1 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm"
              placeholder="Ex: Macae, RJ ou Copacabana, Rio de Janeiro"
            />
            <button
              disabled={!canManageRateShopper || locating}
              className="rounded-2xl bg-amber-700 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
            >
              {locating ? 'Localizando...' : 'Localizar'}
            </button>
          </form>

          {locatedCompetitors.length > 0 && (
            <div className="mt-5 space-y-3">
              {locatedCompetitors.map((competitor) => (
                <div key={`${competitor.name}-${competitor.latitude}-${competitor.longitude}`} className="flex items-start justify-between gap-3 rounded-2xl bg-amber-50 p-4">
                  <div>
                    <p className="font-black text-neutral-900">{competitor.name}</p>
                    <p className="mt-1 text-sm text-neutral-600">{competitor.address || competitor.locality || competitor.city}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => saveCompetitor(competitor)}
                    className="rounded-xl bg-neutral-950 px-3 py-2 text-xs font-black text-white"
                  >
                    Salvar
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 space-y-4">
            {competitors.length === 0 ? <Empty label="Nenhum concorrente salvo." /> : (() => {
              const autoScraped = competitors.filter(c => c.source === 'booking_scraper');
              const manual      = competitors.filter(c => c.source !== 'booking_scraper');
              const lastUpdate  = autoScraped[0]?.last_checked_at;

              return (
                <>
                  {/* ── Captados automaticamente ── */}
                  {autoScraped.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Booking.com</span>
                        <div className="flex-1 h-px bg-neutral-100" />
                        {lastUpdate && (
                          <span className="text-[10px] font-bold text-neutral-400">
                            Atualizado {new Date(lastUpdate).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                      <div className="space-y-2">
                        {autoScraped.map((competitor) => (
                          <div key={competitor.id} className="rounded-2xl bg-amber-50 border border-amber-100 p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-black text-neutral-900 text-sm">{competitor.name}</p>
                                  <span className="text-[9px] font-black uppercase tracking-widest text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Auto</span>
                                </div>
                                <p className="mt-0.5 text-xs text-neutral-500">{competitor.city}</p>
                              </div>
                              {competitor.observed_rate ? (
                                <p className="text-lg font-black text-amber-700 font-mono">{money(Number(competitor.observed_rate))}</p>
                              ) : (
                                <p className="text-xs text-neutral-400 italic">sem preço</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Adicionados manualmente ── */}
                  {manual.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Adicionados manualmente</span>
                        <div className="flex-1 h-px bg-neutral-100" />
                      </div>
                      <div className="space-y-2">
                        {manual.map((competitor) => (
                          <div key={competitor.id} className="rounded-2xl bg-neutral-50 p-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                              <div>
                                <p className="font-black text-neutral-900">{competitor.name}</p>
                                <p className="mt-1 text-sm text-neutral-500">{competitor.city} - {competitor.address || competitor.locality || 'Sem endereço'}</p>
                                {competitor.observed_rate ? (
                                  <p className="mt-1 text-xs font-bold uppercase tracking-widest text-amber-700">Tarifa observada: {money(Number(competitor.observed_rate))}</p>
                                ) : null}
                              </div>
                              <form
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  const value = new FormData(event.currentTarget).get('observed_rate');
                                  updateCompetitorRate(competitor, String(value || ''));
                                }}
                                className="flex gap-2"
                              >
                                <input name="observed_rate" type="number" step="0.01" className="w-32 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm" placeholder="Tarifa" />
                                <button disabled={!canManageRateShopper} className="rounded-xl bg-neutral-950 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Atualizar</button>
                              </form>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>

        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black text-neutral-950">Disponibilidade por categoria</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {Object.entries(categoryAvailability).map(([category, value]) => {
              const available = value.total - value.blocked - value.occupied;
              return <div key={category}><Metric label={category} value={`${available}/${value.total}`} /></div>;
            })}
          </div>
          <p className="mt-4 text-xs font-bold uppercase tracking-widest text-neutral-400">Hospedes in-house: {checkedIn} / UHs fisicas: {totalRooms}</p>
        </div>
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black text-neutral-950">Regras ativas</h2>
          <div className="mt-5 space-y-3">
            {rules.length === 0 ? <Empty label="Nenhuma regra tarifaria criada." /> : rules.map((rule) => (
              <div key={rule.id} className="rounded-2xl bg-neutral-50 p-4">
                <p className="font-black text-neutral-900">{rule.name}</p>
                <p className="mt-1 text-sm text-neutral-500">{rule.category} - {money(Number(rule.base_rate || 0))} - minimo {rule.min_nights} noite(s)</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FiscalPanel({ canManage, jobs, reservations, onSaved }: { canManage: boolean; jobs: FiscalJob[]; reservations: Reservation[]; onSaved: () => void }) {
  async function enqueue(reservation: Reservation) {
    const { error } = await supabase.from('fiscal_jobs').insert([{
      reservation_code: reservation.reservation_code,
      document_type: 'nfse',
      status: 'pending',
      amount: reservation.total_amount || 0,
      payload: { guest_name: reservation.guest_name, company_id: reservation.company_id },
    }]);
    if (error) {
      toast.error('Erro ao criar fila fiscal: ' + error.message);
      return;
    }
    toast.success('Documento fiscal enviado para fila.');
    onSaved();
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card title="Fila NFS-e/RPS" description="Controle de emissao, erro, reenvio e cancelamento fiscal. A integracao municipal entra por worker/API dedicada.">
        {jobs.length === 0 ? <Empty label="Fila fiscal vazia." /> : jobs.map((job) => (
          <div key={job.id}><Row title={`${job.document_type.toUpperCase()} ${job.reservation_code || ''}`} meta={`${job.status} - ${money(Number(job.amount || 0))}`} /></div>
        ))}
      </Card>
      <Card title="Reservas para emissao" description="Base para gerar NFS-e/RPS apos checkout ou faturamento.">
        {reservations.slice(0, 12).map((reservation) => (
          <div key={reservation.id} className="flex items-center justify-between gap-3 rounded-2xl bg-neutral-50 p-4">
            <div>
              <p className="font-black text-neutral-900">{reservation.reservation_code}</p>
              <p className="text-sm text-neutral-500">{reservation.guest_name} - {money(Number(reservation.total_amount || 0))}</p>
            </div>
            <button disabled={!canManage} onClick={() => enqueue(reservation)} className="rounded-xl bg-neutral-950 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Fila fiscal</button>
          </div>
        ))}
      </Card>
    </div>
  );
}

function CrmPanel({ canManage, guests, onSaved }: { canManage: boolean; guests: GuestProfile[]; onSaved: () => void }) {
  const [name, setName] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    const { error } = await supabase.from('guest_profiles').insert([{ full_name: name, vip_level: 'standard', consent_lgpd: true }]);
    if (error) toast.error('Erro ao salvar hospede: ' + error.message);
    else { toast.success('Perfil de hospede criado.'); setName(''); onSaved(); }
  }
  return (
    <div className="grid gap-6 xl:grid-cols-[0.7fr_1.3fr]">
      <form onSubmit={save} className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black text-neutral-950">CRM de hospedes</h2>
        <p className="mt-2 text-sm leading-7 text-neutral-500">Preferencias, VIP, restricoes, blacklist e consentimento LGPD.</p>
        <input value={name} onChange={(event) => setName(event.target.value)} className="mt-5 w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm" placeholder="Nome completo" />
        <button disabled={!canManage || !name} className="mt-3 w-full rounded-2xl bg-neutral-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50">Criar perfil</button>
      </form>
      <Card title="Base de relacionamento" description="Use para historico, preferencias, aniversarios, VIP e LGPD.">
        {guests.length === 0 ? <Empty label="Nenhum perfil de hospede." /> : guests.map((guest) => (
          <div key={guest.id}><Row title={guest.full_name} meta={`${guest.vip_level} - ${guest.consent_lgpd ? 'LGPD ok' : 'sem consentimento'}`} /></div>
        ))}
      </Card>
    </div>
  );
}

function InventoryPanel({ canManage, items, onSaved }: { canManage: boolean; items: InventoryItem[]; onSaved: () => void }) {
  const [name, setName] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    const { error } = await supabase.from('inventory_items').insert([{ sku: `SKU-${Date.now()}`, name, department: 'restaurant', quantity: 0, min_quantity: 5, unit_cost: 0 }]);
    if (error) toast.error('Erro ao cadastrar item: ' + error.message);
    else { toast.success('Item de estoque cadastrado.'); setName(''); onSaved(); }
  }
  return (
    <div className="grid gap-6 xl:grid-cols-[0.7fr_1.3fr]">
      <form onSubmit={save} className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black text-neutral-950">Estoque / Almoxarifado</h2>
        <p className="mt-2 text-sm leading-7 text-neutral-500">Baixa por restaurante, governanca, manutencao e recepcao.</p>
        <input value={name} onChange={(event) => setName(event.target.value)} className="mt-5 w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm" placeholder="Nome do item" />
        <button disabled={!canManage || !name} className="mt-3 w-full rounded-2xl bg-neutral-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50">Cadastrar item</button>
      </form>
      <Card title="Itens e ponto de reposicao" description="Itens abaixo do minimo ficam visiveis para compra/reposicao.">
        {items.length === 0 ? <Empty label="Nenhum item de estoque." /> : items.map((item) => (
          <div key={item.id}><Row title={item.name} meta={`${item.department} - estoque ${item.quantity}/${item.min_quantity} - custo ${money(Number(item.unit_cost || 0))}`} danger={Number(item.quantity) <= Number(item.min_quantity)} /></div>
        ))}
      </Card>
    </div>
  );
}

function CashPanel({ canManage, sessions, profile, onSaved }: { canManage: boolean; sessions: CashSession[]; profile: UserProfile; onSaved: () => void }) {
  async function openCash() {
    if (!canManage) return;
    const { error } = await supabase.from('cash_sessions').insert([{ department: 'restaurant', opening_amount: 0, status: 'open', opened_by: profile.id }]);
    if (error) toast.error('Erro ao abrir caixa: ' + error.message);
    else { toast.success('Caixa aberto.'); onSaved(); }
  }
  return (
    <Card title="Caixa POS" description="Abertura/fechamento, sangria, suprimento e conferencia por operador.">
      <button disabled={!canManage} onClick={openCash} className="mb-4 rounded-2xl bg-neutral-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50">Abrir caixa restaurante</button>
      {sessions.length === 0 ? <Empty label="Nenhum caixa aberto/fechado." /> : sessions.map((session) => (
        <div key={session.id}><Row title={`${session.department} - ${session.status}`} meta={`Abertura ${money(Number(session.opening_amount || 0))} - ${new Date(session.opened_at).toLocaleString('pt-BR')}`} /></div>
      ))}
    </Card>
  );
}

function GuestPortalPanel({ canManage, requests, onSaved }: { canManage: boolean; requests: GuestServiceRequest[]; onSaved: () => void }) {
  async function markDone(request: GuestServiceRequest) {
    const { error } = await supabase.from('guest_service_requests').update({ status: 'done' }).eq('id', request.id);
    if (error) toast.error('Erro ao concluir solicitacao: ' + error.message);
    else { toast.success('Solicitacao concluida.'); onSaved(); }
  }
  return (
    <Card title="Portal do hospede" description="Pre-check-in, upload de documento, assinatura digital e solicitacoes do hospede.">
      {requests.length === 0 ? <Empty label="Nenhuma solicitacao do hospede." /> : requests.map((request) => (
        <div key={request.id} className="flex items-center justify-between gap-3 rounded-2xl bg-neutral-50 p-4">
          <div>
            <p className="font-black text-neutral-900">{request.guest_name}</p>
            <p className="text-sm text-neutral-500">{request.request_type} - {request.status} - UH {request.room_number || '-'}</p>
          </div>
          <button disabled={!canManage || request.status === 'done'} onClick={() => markDone(request)} className="rounded-xl bg-neutral-950 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Concluir</button>
        </div>
      ))}
    </Card>
  );
}


function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-neutral-200 bg-white px-5 py-4 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-400">{label}</p>
      <p className="mt-2 text-xl font-black text-neutral-950">{value}</p>
    </div>
  );
}

function Card({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-black text-neutral-950">{title}</h2>
      <p className="mt-2 text-sm leading-7 text-neutral-500">{description}</p>
      <div className="mt-5 space-y-3">{children}</div>
    </div>
  );
}

function Row({ title, meta, danger = false }: { title: string; meta: string; danger?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 ${danger ? 'bg-red-50' : 'bg-neutral-50'}`}>
      <p className="font-black text-neutral-900">{title}</p>
      <p className="mt-1 text-sm text-neutral-500">{meta}</p>
    </div>
  );
}


function Empty({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-8 text-center text-sm font-bold text-neutral-400">
      {label}
    </div>
  );
}
