import { ComponentType, FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import {
  BedDouble,
  Building2,
  CalendarRange,
  CreditCard,
  Factory,
  LockKeyhole,
  MailCheck,
  PackagePlus,
  Shirt,
  TrendingUp,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../supabase';
import { MaintenanceTicket, Reservation, Room, UserProfile } from '../types';

export type EnterpriseTab =
  | 'groups'
  | 'room-map'
  | 'preventive'
  | 'messages'
  | 'receivables'
  | 'purchasing'
  | 'laundry'
  | 'minibar'
  | 'forecast'
  | 'security'
  | 'properties';

type GroupBlock = {
  id: string;
  group_name: string;
  company_name?: string;
  status: 'prospect' | 'tentative' | 'confirmed' | 'released' | 'cancelled';
  arrival_date: string;
  departure_date: string;
  rooms_blocked: number;
  rooms_picked_up: number;
  cut_off_date?: string;
  rate: number;
  notes?: string;
};

type PreventiveTask = {
  id: string;
  asset_name: string;
  room_number?: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
  next_due_at: string;
  status: 'scheduled' | 'in_progress' | 'done' | 'overdue';
  estimated_cost: number;
};

type GuestMessage = {
  id: string;
  guest_name: string;
  channel: 'whatsapp' | 'email' | 'sms' | 'internal';
  template_name: string;
  status: 'draft' | 'scheduled' | 'sent' | 'failed';
  scheduled_at?: string;
  body: string;
};

type AccountReceivable = {
  id: string;
  debtor_name: string;
  document_number?: string;
  amount: number;
  due_date: string;
  status: 'open' | 'partial' | 'paid' | 'overdue' | 'written_off';
  aging_bucket?: string;
};

type PaymentControl = {
  id: string;
  payer_name: string;
  payment_type: 'pix' | 'credit_card' | 'debit_card' | 'cash' | 'bank_transfer' | 'manual_preauth';
  amount: number;
  status: 'pending' | 'authorized' | 'captured' | 'reconciled' | 'cancelled';
  reconciliation_ref?: string;
};

type PurchaseRequest = {
  id: string;
  department: 'restaurant' | 'housekeeping' | 'maintenance' | 'frontdesk' | 'admin';
  item_name: string;
  quantity: number;
  estimated_cost: number;
  supplier?: string;
  status: 'requested' | 'quoted' | 'approved' | 'ordered' | 'received' | 'cancelled';
};

type LaundryBatch = {
  id: string;
  batch_code: string;
  department: 'rooms' | 'restaurant' | 'spa' | 'events';
  item_type: string;
  quantity_sent: number;
  quantity_returned: number;
  losses: number;
  status: 'sent' | 'washing' | 'returned' | 'loss_reported';
};

type MinibarControl = {
  id: string;
  room_number: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  status: 'pending' | 'posted' | 'replenished' | 'divergence';
};

type RevenueForecast = {
  id: string;
  forecast_date: string;
  demand_level: 'low' | 'medium' | 'high' | 'compression';
  expected_occupancy: number;
  suggested_rate: number;
  pickup_rooms: number;
  city_event?: string;
};

type SecurityControl = {
  id: string;
  control_name: string;
  category: 'password' | 'session' | 'backup' | 'audit' | 'monitoring';
  status: 'planned' | 'active' | 'review' | 'incident';
  owner?: string;
  last_review_at?: string;
  notes?: string;
};

type HotelProperty = {
  id: string;
  name: string;
  code: string;
  city: string;
  status: 'active' | 'inactive' | 'opening';
  rooms_count: number;
};

const enterpriseTabs: Array<{ id: EnterpriseTab; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: 'groups', label: 'Grupos', icon: CalendarRange },
  { id: 'room-map', label: 'Mapa UHs', icon: BedDouble },
  { id: 'preventive', label: 'Preventiva', icon: Wrench },
  { id: 'messages', label: 'Mensagens', icon: MailCheck },
  { id: 'receivables', label: 'AR/Pagamentos', icon: CreditCard },
  { id: 'purchasing', label: 'Compras', icon: PackagePlus },
  { id: 'laundry', label: 'Lavanderia', icon: Shirt },
  { id: 'minibar', label: 'Minibar', icon: Factory },
  { id: 'forecast', label: 'Forecast/BI', icon: TrendingUp },
  { id: 'security', label: 'Seguranca', icon: LockKeyhole },
  { id: 'properties', label: 'Multi-hotel', icon: Building2 },
];

const currency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const inputClass = 'rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none transition focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-500/10';
const buttonClass = 'rounded-2xl bg-neutral-950 px-5 py-3 text-sm font-black text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50';

export default function EnterpriseExtensionsDashboard({
  profile,
  canManage,
  initialTab = 'groups',
  allowedTabs,
}: {
  profile: UserProfile;
  canManage: boolean;
  initialTab?: EnterpriseTab;
  allowedTabs?: EnterpriseTab[];
}) {
  const visibleTabs = allowedTabs ? enterpriseTabs.filter((tab) => allowedTabs.includes(tab.id)) : enterpriseTabs;
  const [activeTab, setActiveTab] = useState<EnterpriseTab>(visibleTabs.some((tab) => tab.id === initialTab) ? initialTab : visibleTabs[0]?.id || 'groups');
  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [groups, setGroups] = useState<GroupBlock[]>([]);
  const [preventiveTasks, setPreventiveTasks] = useState<PreventiveTask[]>([]);
  const [messages, setMessages] = useState<GuestMessage[]>([]);
  const [receivables, setReceivables] = useState<AccountReceivable[]>([]);
  const [payments, setPayments] = useState<PaymentControl[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRequest[]>([]);
  const [laundry, setLaundry] = useState<LaundryBatch[]>([]);
  const [minibar, setMinibar] = useState<MinibarControl[]>([]);
  const [forecasts, setForecasts] = useState<RevenueForecast[]>([]);
  const [securityControls, setSecurityControls] = useState<SecurityControl[]>([]);
  const [properties, setProperties] = useState<HotelProperty[]>([]);

  const canOperateRevenue = canManage || ['admin', 'manager', 'reservations', 'finance', 'faturamento'].includes(profile.role);
  const canOperateOps = canManage || ['admin', 'manager', 'reception', 'maintenance', 'housekeeping'].includes(profile.role);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    const [
      roomRes,
      reservationRes,
      ticketRes,
      groupRes,
      preventiveRes,
      messageRes,
      receivableRes,
      paymentRes,
      purchaseRes,
      laundryRes,
      minibarRes,
      forecastRes,
      securityRes,
      propertyRes,
    ] = await Promise.all([
      supabase.from('rooms').select('*').order('floor').order('room_number'),
      supabase.from('reservations').select('*').order('check_in', { ascending: false }).limit(200),
      supabase.from('maintenance_tickets').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('group_blocks').select('*').order('arrival_date', { ascending: false }),
      supabase.from('preventive_maintenance_tasks').select('*').order('next_due_at'),
      supabase.from('guest_messages').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('accounts_receivable').select('*').order('due_date'),
      supabase.from('payment_controls').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('purchase_requests').select('*').order('created_at', { ascending: false }).limit(80),
      supabase.from('laundry_batches').select('*').order('created_at', { ascending: false }).limit(80),
      supabase.from('minibar_controls').select('*').order('created_at', { ascending: false }).limit(80),
      supabase.from('revenue_forecasts').select('*').order('forecast_date'),
      supabase.from('security_controls').select('*').order('category').order('control_name'),
      supabase.from('hotel_properties').select('*').order('name'),
    ]);

    if (roomRes.data) setRooms(roomRes.data as Room[]);
    if (reservationRes.data) setReservations(reservationRes.data as Reservation[]);
    if (ticketRes.data) setTickets(ticketRes.data as MaintenanceTicket[]);
    if (groupRes.data) setGroups(groupRes.data as GroupBlock[]);
    if (preventiveRes.data) setPreventiveTasks(preventiveRes.data as PreventiveTask[]);
    if (messageRes.data) setMessages(messageRes.data as GuestMessage[]);
    if (receivableRes.data) setReceivables(receivableRes.data as AccountReceivable[]);
    if (paymentRes.data) setPayments(paymentRes.data as PaymentControl[]);
    if (purchaseRes.data) setPurchases(purchaseRes.data as PurchaseRequest[]);
    if (laundryRes.data) setLaundry(laundryRes.data as LaundryBatch[]);
    if (minibarRes.data) setMinibar(minibarRes.data as MinibarControl[]);
    if (forecastRes.data) setForecasts(forecastRes.data as RevenueForecast[]);
    if (securityRes.data) setSecurityControls(securityRes.data as SecurityControl[]);
    if (propertyRes.data) setProperties(propertyRes.data as HotelProperty[]);
    setLoading(false);
  }

  const enterpriseMetrics = useMemo(() => {
    const arOpen = receivables.filter((item) => item.status !== 'paid').reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const pickup = forecasts.reduce((sum, item) => sum + Number(item.pickup_rooms || 0), 0);
    const overduePreventive = preventiveTasks.filter((task) => task.status === 'overdue' || new Date(task.next_due_at) < new Date()).length;
    const minibarPending = minibar.filter((item) => item.status === 'pending' || item.status === 'divergence').length;
    return { arOpen, pickup, overduePreventive, minibarPending };
  }, [forecasts, minibar, preventiveTasks, receivables]);

  if (loading) return <PanelShell title="Enterprise PMS" description="Carregando camadas avancadas..." />;

  return (
    <div className="space-y-6">
      <div className="rounded-[2rem] border border-neutral-200 bg-gradient-to-br from-neutral-950 via-neutral-900 to-amber-950 p-4 sm:p-6 text-white shadow-sm">
        <p className="text-[10px] sm:text-xs font-black uppercase tracking-[0.3em] text-amber-300">Hotel gigante</p>
        <h2 className="mt-2 text-xl sm:text-2xl font-black">Camadas enterprise sem dependencias externas</h2>
        <p className="mt-2 max-w-4xl text-xs sm:text-sm leading-6 sm:leading-7 text-white/70">
          Grupos, mapa de UHs, preventiva, mensagens, AR, compras, lavanderia, minibar, forecast, controles de seguranca e multi-propriedade operando de forma manual/auditavel.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <MiniMetric label="AR aberto" value={currency(enterpriseMetrics.arOpen)} />
          <MiniMetric label="Pickup forecast" value={String(enterpriseMetrics.pickup)} />
          <MiniMetric label="Preventivas criticas" value={String(enterpriseMetrics.overduePreventive)} />
          <MiniMetric label="Minibar pendente" value={String(enterpriseMetrics.minibarPending)} />
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
              className={`flex shrink-0 items-center gap-2 rounded-2xl px-4 py-3 text-xs font-black transition ${
                active ? 'bg-amber-700 text-white' : 'bg-neutral-50 text-neutral-500 hover:bg-neutral-100'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'groups' && <GroupsPanel canManage={canOperateRevenue} groups={groups} onSaved={fetchAll} />}
      {activeTab === 'room-map' && <RoomMapPanel canManage={canOperateOps} rooms={rooms} reservations={reservations} onSaved={fetchAll} />}
      {activeTab === 'preventive' && <PreventivePanel canManage={canOperateOps} tasks={preventiveTasks} tickets={tickets} onSaved={fetchAll} />}
      {activeTab === 'messages' && <MessagesPanel canManage={canOperateRevenue || canOperateOps} messages={messages} onSaved={fetchAll} />}
      {activeTab === 'receivables' && <ReceivablesPanel canManage={canOperateRevenue} receivables={receivables} payments={payments} onSaved={fetchAll} />}
      {activeTab === 'purchasing' && <PurchasingPanel canManage={canManage} purchases={purchases} onSaved={fetchAll} />}
      {activeTab === 'laundry' && <LaundryPanel canManage={canOperateOps} batches={laundry} onSaved={fetchAll} />}
      {activeTab === 'minibar' && <MinibarPanel canManage={canOperateOps} controls={minibar} onSaved={fetchAll} />}
      {activeTab === 'forecast' && <ForecastPanel canManage={canOperateRevenue} forecasts={forecasts} reservations={reservations} rooms={rooms} onSaved={fetchAll} />}
      {activeTab === 'security' && <SecurityPanel canManage={canManage} controls={securityControls} onSaved={fetchAll} />}
      {activeTab === 'properties' && <PropertiesPanel canManage={canManage} properties={properties} onSaved={fetchAll} />}
    </div>
  );
}

function GroupsPanel({ canManage, groups, onSaved }: { canManage: boolean; groups: GroupBlock[]; onSaved: () => void }) {
  const [form, setForm] = useState({ group_name: '', company_name: '', arrival_date: today(), departure_date: today(3), rooms_blocked: '20', rate: '300' });
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    const { error } = await supabase.from('group_blocks').insert([{ ...form, rooms_blocked: Number(form.rooms_blocked), rooms_picked_up: 0, rate: Number(form.rate), status: 'tentative' }]);
    if (error) toast.error('Erro ao criar grupo: ' + error.message);
    else { toast.success('Bloqueio de grupo criado.'); setForm({ ...form, group_name: '' }); onSaved(); }
  }
  return (
    <TwoColumn>
      <form onSubmit={save} className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-black text-neutral-950">Reservas de grupo</h3>
        <p className="mt-2 text-sm leading-7 text-neutral-500">Rooming list, allotment, cut-off e pickup por grupo.</p>
        <div className="mt-5 grid gap-3">
          <input required value={form.group_name} onChange={(event) => setForm({ ...form, group_name: event.target.value })} className={inputClass} placeholder="Nome do grupo/evento" />
          <input value={form.company_name} onChange={(event) => setForm({ ...form, company_name: event.target.value })} className={inputClass} placeholder="Empresa/agencia" />
          <div className="grid grid-cols-2 gap-3">
            <input type="date" value={form.arrival_date} onChange={(event) => setForm({ ...form, arrival_date: event.target.value })} className={inputClass} />
            <input type="date" value={form.departure_date} onChange={(event) => setForm({ ...form, departure_date: event.target.value })} className={inputClass} />
            <input type="number" value={form.rooms_blocked} onChange={(event) => setForm({ ...form, rooms_blocked: event.target.value })} className={inputClass} placeholder="UHs bloqueadas" />
            <input type="number" value={form.rate} onChange={(event) => setForm({ ...form, rate: event.target.value })} className={inputClass} placeholder="Tarifa" />
          </div>
          <button disabled={!canManage || !form.group_name} className={buttonClass}>Criar bloqueio</button>
        </div>
      </form>
      <PanelShell title="Pipeline de grupos" description="Controle comercial e operacional de grupos antes da reserva individual.">
        {groups.length === 0 ? <EmptyState label="Nenhum grupo cadastrado." /> : groups.map((group) => (
          <div key={group.id}><ListRow title={group.group_name} meta={`${group.status} - ${group.rooms_picked_up}/${group.rooms_blocked} UHs - ${currency(Number(group.rate || 0))}`} /></div>
        ))}
      </PanelShell>
    </TwoColumn>
  );
}

function RoomMapPanel({ canManage, rooms, reservations, onSaved }: { canManage: boolean; rooms: Room[]; reservations: Reservation[]; onSaved: () => void }) {
  const floors = useMemo(() => {
    return rooms.reduce<Record<string, Room[]>>((acc, room) => {
      acc[String(room.floor)] = acc[String(room.floor)] || [];
      acc[String(room.floor)].push(room);
      return acc;
    }, {});
  }, [rooms]);
  async function toggleMaintenance(room: Room) {
    if (!canManage) return;
    const maintenance = room.status === 'maintenance';
    const { error } = await supabase.from('rooms').update({
      status: maintenance ? 'available' : 'maintenance',
      housekeeping_status: maintenance ? 'dirty' : 'out_of_order',
      maintenance_notes: maintenance ? null : 'Interditada pelo mapa visual enterprise.',
    }).eq('id', room.id);
    if (error) toast.error('Erro ao atualizar UH: ' + error.message);
    else { toast.success(maintenance ? 'UH liberada.' : 'UH interditada.'); onSaved(); }
  }
  return (
    <div className="space-y-5">
      <PanelShell title="Mapa visual de UHs" description="Visao por andar para ocupacao, governanca e manutencao. Clique para interditar/liberar quando permitido." />
      {(Object.entries(floors) as Array<[string, Room[]]>).map(([floor, floorRooms]) => (
        <div key={floor} className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-400">Andar {floor}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-8">
            {floorRooms.map((room) => {
              const current = reservations.find((reservation) => reservation.room_number === room.room_number && reservation.status === 'CHECKED_IN');
              const color = room.status === 'maintenance' || room.housekeeping_status === 'out_of_order' ? 'border-red-200 bg-red-50 text-red-800' : room.status === 'occupied' ? 'border-blue-200 bg-blue-50 text-blue-800' : room.housekeeping_status === 'dirty' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800';
              return (
                <button key={room.id} disabled={!canManage} onClick={() => toggleMaintenance(room)} className={`rounded-2xl border p-4 text-left transition hover:scale-[1.02] disabled:cursor-default ${color}`}>
                  <p className="text-lg font-black">{room.room_number}</p>
                  <p className="mt-1 text-[10px] font-black uppercase tracking-widest">{room.status}</p>
                  <p className="mt-1 truncate text-xs">{current?.guest_name || room.housekeeping_status}</p>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function PreventivePanel({ canManage, tasks, tickets, onSaved }: { canManage: boolean; tasks: PreventiveTask[]; tickets: MaintenanceTicket[]; onSaved: () => void }) {
  const [asset, setAsset] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    const { error } = await supabase.from('preventive_maintenance_tasks').insert([{ asset_name: asset, frequency: 'monthly', next_due_at: today(30), status: 'scheduled', estimated_cost: 0 }]);
    if (error) toast.error('Erro ao criar preventiva: ' + error.message);
    else { toast.success('Preventiva programada.'); setAsset(''); onSaved(); }
  }
  return (
    <TwoColumn>
      <form onSubmit={save} className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-black text-neutral-950">Manutencao preventiva</h3>
        <p className="mt-2 text-sm leading-7 text-neutral-500">Equipamentos, recorrencia, SLA, custo previsto e historico por UH.</p>
        <input value={asset} onChange={(event) => setAsset(event.target.value)} className={`${inputClass} mt-5 w-full`} placeholder="Ex: Chiller torre A, Elevador social, UH 1204 AC" />
        <button disabled={!canManage || !asset} className={`${buttonClass} mt-3 w-full`}>Programar preventiva</button>
      </form>
      <PanelShell title="Plano e chamados" description={`${tickets.filter((ticket) => ticket.status !== 'resolved').length} chamados corretivos ainda ativos.`}>
        {tasks.length === 0 ? <EmptyState label="Nenhuma preventiva programada." /> : tasks.map((task) => (
          <div key={task.id}><ListRow title={task.asset_name} meta={`${task.frequency} - ${task.status} - proxima ${new Date(`${task.next_due_at}T12:00:00`).toLocaleDateString('pt-BR')} - ${currency(Number(task.estimated_cost || 0))}`} danger={task.status === 'overdue' || new Date(task.next_due_at) < new Date()} /></div>
        ))}
      </PanelShell>
    </TwoColumn>
  );
}

function MessagesPanel({ canManage, messages, onSaved }: { canManage: boolean; messages: GuestMessage[]; onSaved: () => void }) {
  const [guest, setGuest] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    const { error } = await supabase.from('guest_messages').insert([{ guest_name: guest, channel: 'whatsapp', template_name: 'Confirmacao manual', status: 'draft', body: 'Ola, sua reserva esta em atendimento pela nossa central.' }]);
    if (error) toast.error('Erro ao criar mensagem: ' + error.message);
    else { toast.success('Mensagem criada como rascunho.'); setGuest(''); onSaved(); }
  }
  return (
    <TwoColumn>
      <form onSubmit={save} className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-black text-neutral-950">Central de mensagens</h3>
        <p className="mt-2 text-sm leading-7 text-neutral-500">Templates e agendamentos manuais para pre-check-in, cobranca, confirmacao e pos-estadia.</p>
        <input value={guest} onChange={(event) => setGuest(event.target.value)} className={`${inputClass} mt-5 w-full`} placeholder="Nome do hospede" />
        <button disabled={!canManage || !guest} className={`${buttonClass} mt-3 w-full`}>Criar rascunho</button>
      </form>
      <PanelShell title="Fila de comunicacao" description="Sem envio externo automatico; pronto para operacao manual ou futura integracao.">
        {messages.length === 0 ? <EmptyState label="Nenhuma mensagem criada." /> : messages.map((message) => (
          <div key={message.id}><ListRow title={`${message.guest_name} - ${message.template_name}`} meta={`${message.channel} - ${message.status}`} /></div>
        ))}
      </PanelShell>
    </TwoColumn>
  );
}

function ReceivablesPanel({ canManage, receivables, payments, onSaved }: { canManage: boolean; receivables: AccountReceivable[]; payments: PaymentControl[]; onSaved: () => void }) {
  const [debtor, setDebtor] = useState('');
  async function createReceivable(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    const { error } = await supabase.from('accounts_receivable').insert([{ debtor_name: debtor, amount: 0, due_date: today(7), status: 'open', aging_bucket: '0-30' }]);
    if (error) toast.error('Erro ao criar AR: ' + error.message);
    else { toast.success('Titulo criado.'); setDebtor(''); onSaved(); }
  }
  async function markReconciled(payment: PaymentControl) {
    if (!canManage) return;
    const { error } = await supabase.from('payment_controls').update({ status: 'reconciled', reconciliation_ref: `MANUAL-${Date.now()}` }).eq('id', payment.id);
    if (error) toast.error('Erro ao conciliar: ' + error.message);
    else { toast.success('Pagamento conciliado.'); onSaved(); }
  }
  return (
    <TwoColumn>
      <form onSubmit={createReceivable} className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-black text-neutral-950">AR e pagamentos manuais</h3>
        <p className="mt-2 text-sm leading-7 text-neutral-500">Contas a receber, limite operacional, ageing e conciliacao manual sem gateway.</p>
        <input value={debtor} onChange={(event) => setDebtor(event.target.value)} className={`${inputClass} mt-5 w-full`} placeholder="Empresa/hospede devedor" />
        <button disabled={!canManage || !debtor} className={`${buttonClass} mt-3 w-full`}>Criar titulo</button>
      </form>
      <PanelShell title="Carteira e conciliacao" description={`${payments.length} controles de pagamento cadastrados.`}>
        {receivables.map((item) => <div key={item.id}><ListRow title={item.debtor_name} meta={`${item.status} - ${currency(Number(item.amount || 0))} - vence ${new Date(`${item.due_date}T12:00:00`).toLocaleDateString('pt-BR')}`} danger={item.status === 'overdue'} /></div>)}
        {payments.slice(0, 5).map((payment) => (
          <div key={payment.id} className="flex items-center justify-between gap-3 rounded-2xl bg-neutral-50 p-4">
            <div>
              <p className="font-black text-neutral-900">{payment.payer_name}</p>
              <p className="text-sm text-neutral-500">{payment.payment_type} - {payment.status} - {currency(Number(payment.amount || 0))}</p>
            </div>
            <button disabled={!canManage || payment.status === 'reconciled'} onClick={() => markReconciled(payment)} className="rounded-xl bg-neutral-950 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Conciliar</button>
          </div>
        ))}
        {receivables.length === 0 && payments.length === 0 ? <EmptyState label="Nenhum titulo ou pagamento." /> : null}
      </PanelShell>
    </TwoColumn>
  );
}

function PurchasingPanel({ canManage, purchases, onSaved }: { canManage: boolean; purchases: PurchaseRequest[]; onSaved: () => void }) {
  const [item, setItem] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    const { error } = await supabase.from('purchase_requests').insert([{ department: 'housekeeping', item_name: item, quantity: 1, estimated_cost: 0, status: 'requested' }]);
    if (error) toast.error('Erro ao criar compra: ' + error.message);
    else { toast.success('Requisicao de compra criada.'); setItem(''); onSaved(); }
  }
  return <SimpleCreateList title="Compras e almoxarifado" description="Requisicao, cotacao, aprovacao, pedido e recebimento." value={item} setValue={setItem} onSubmit={save} disabled={!canManage} placeholder="Item solicitado" items={purchases.map((purchase) => ({ id: purchase.id, title: purchase.item_name, meta: `${purchase.department} - ${purchase.status} - qtd ${purchase.quantity} - ${currency(Number(purchase.estimated_cost || 0))}` }))} empty="Nenhuma compra solicitada." />;
}

function LaundryPanel({ canManage, batches, onSaved }: { canManage: boolean; batches: LaundryBatch[]; onSaved: () => void }) {
  const [item, setItem] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    const { error } = await supabase.from('laundry_batches').insert([{ batch_code: `LAV-${Date.now()}`, department: 'rooms', item_type: item, quantity_sent: 1, quantity_returned: 0, losses: 0, status: 'sent' }]);
    if (error) toast.error('Erro ao criar lote: ' + error.message);
    else { toast.success('Lote de lavanderia criado.'); setItem(''); onSaved(); }
  }
  return <SimpleCreateList title="Lavanderia e enxoval" description="Controle de rouparia, perdas, retorno e custo operacional." value={item} setValue={setItem} onSubmit={save} disabled={!canManage} placeholder="Tipo de enxoval" items={batches.map((batch) => ({ id: batch.id, title: `${batch.batch_code} - ${batch.item_type}`, meta: `${batch.status} - enviado ${batch.quantity_sent}, retorno ${batch.quantity_returned}, perdas ${batch.losses}`, danger: batch.losses > 0 }))} empty="Nenhum lote de lavanderia." />;
}

function MinibarPanel({ canManage, controls, onSaved }: { canManage: boolean; controls: MinibarControl[]; onSaved: () => void }) {
  const [room, setRoom] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    const { error } = await supabase.from('minibar_controls').insert([{ room_number: room, item_name: 'Agua mineral', quantity: 1, unit_price: 8, status: 'pending' }]);
    if (error) toast.error('Erro ao criar minibar: ' + error.message);
    else { toast.success('Consumo de minibar registrado.'); setRoom(''); onSaved(); }
  }
  return <SimpleCreateList title="Minibar" description="Reposicao, consumo por UH, divergencia e lancamento manual ao folio." value={room} setValue={setRoom} onSubmit={save} disabled={!canManage} placeholder="UH" items={controls.map((control) => ({ id: control.id, title: `UH ${control.room_number} - ${control.item_name}`, meta: `${control.status} - qtd ${control.quantity} - ${currency(Number(control.unit_price || 0))}`, danger: control.status === 'divergence' }))} empty="Nenhum controle de minibar." />;
}

function ForecastPanel({ canManage, forecasts, reservations, rooms, onSaved }: { canManage: boolean; forecasts: RevenueForecast[]; reservations: Reservation[]; rooms: Room[]; onSaved: () => void }) {
  const [eventName, setEventName] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    const { error } = await supabase.from('revenue_forecasts').insert([{ forecast_date: today(1), demand_level: 'medium', expected_occupancy: 70, suggested_rate: 300, pickup_rooms: 0, city_event: eventName }]);
    if (error) toast.error('Erro ao criar forecast: ' + error.message);
    else { toast.success('Forecast criado.'); setEventName(''); onSaved(); }
  }
  const roomRevenue = reservations.reduce((sum, reservation) => sum + Number(reservation.total_amount || 0), 0);
  const adr = reservations.length ? roomRevenue / reservations.length : 0;
  const revpar = rooms.length ? roomRevenue / rooms.length : 0;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <MiniMetric light label="ADR" value={currency(adr)} />
        <MiniMetric light label="RevPAR" value={currency(revpar)} />
        <MiniMetric light label="Reservas base" value={String(reservations.length)} />
        <MiniMetric light label="UHs" value={String(rooms.length)} />
      </div>
      <SimpleCreateList title="Forecast, pickup e eventos da cidade" description="Demanda prevista, tarifa sugerida e compressao sem motor externo." value={eventName} setValue={setEventName} onSubmit={save} disabled={!canManage} placeholder="Evento da cidade / demanda" items={forecasts.map((forecast) => ({ id: forecast.id, title: `${new Date(`${forecast.forecast_date}T12:00:00`).toLocaleDateString('pt-BR')} - ${forecast.demand_level}`, meta: `Ocupacao ${forecast.expected_occupancy}% - tarifa sugerida ${currency(Number(forecast.suggested_rate || 0))} - pickup ${forecast.pickup_rooms}` }))} empty="Nenhum forecast cadastrado." />
    </div>
  );
}

function SecurityPanel({ canManage, controls, onSaved }: { canManage: boolean; controls: SecurityControl[]; onSaved: () => void }) {
  const [name, setName] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    const { error } = await supabase.from('security_controls').insert([{ control_name: name, category: 'audit', status: 'planned', last_review_at: today(), notes: 'Controle interno sem 2FA.' }]);
    if (error) toast.error('Erro ao criar controle: ' + error.message);
    else { toast.success('Controle de seguranca criado.'); setName(''); onSaved(); }
  }
  return <SimpleCreateList title="Seguranca operacional" description="Politicas de senha, sessao, auditoria, backup e monitoramento. 2FA fica fora desta rodada." value={name} setValue={setName} onSubmit={save} disabled={!canManage} placeholder="Controle ou politica" items={controls.map((control) => ({ id: control.id, title: control.control_name, meta: `${control.category} - ${control.status} - revisao ${control.last_review_at ? new Date(`${control.last_review_at}T12:00:00`).toLocaleDateString('pt-BR') : '-'}`, danger: control.status === 'incident' }))} empty="Nenhum controle de seguranca." />;
}

function PropertiesPanel({ canManage, properties, onSaved }: { canManage: boolean; properties: HotelProperty[]; onSaved: () => void }) {
  const [name, setName] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    const { error } = await supabase.from('hotel_properties').insert([{ name, code: `HTL-${Date.now()}`, city: 'Macae', status: 'active', rooms_count: 0 }]);
    if (error) toast.error('Erro ao criar propriedade: ' + error.message);
    else { toast.success('Hotel/propriedade cadastrada.'); setName(''); onSaved(); }
  }
  return <SimpleCreateList title="Multi-propriedade" description="Cadastro de hoteis do grupo para consolidacao futura de operacao e BI." value={name} setValue={setName} onSubmit={save} disabled={!canManage} placeholder="Nome do hotel" items={properties.map((property) => ({ id: property.id, title: `${property.name} (${property.code})`, meta: `${property.city} - ${property.status} - ${property.rooms_count} UHs` }))} empty="Nenhuma propriedade cadastrada." />;
}

function SimpleCreateList({
  title,
  description,
  value,
  setValue,
  onSubmit,
  disabled,
  placeholder,
  items,
  empty,
}: {
  title: string;
  description: string;
  value: string;
  setValue: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  disabled: boolean;
  placeholder: string;
  items: Array<{ id: string; title: string; meta: string; danger?: boolean }>;
  empty: string;
}) {
  return (
    <TwoColumn>
      <form onSubmit={onSubmit} className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-black text-neutral-950">{title}</h3>
        <p className="mt-2 text-sm leading-7 text-neutral-500">{description}</p>
        <input value={value} onChange={(event) => setValue(event.target.value)} className={`${inputClass} mt-5 w-full`} placeholder={placeholder} />
        <button disabled={disabled || !value} className={`${buttonClass} mt-3 w-full`}>Criar registro</button>
      </form>
      <PanelShell title="Registros" description="Fila operacional auditavel para acompanhamento gerencial.">
        {items.length === 0 ? <EmptyState label={empty} /> : items.map((item) => <div key={item.id}><ListRow title={item.title} meta={item.meta} danger={item.danger} /></div>)}
      </PanelShell>
    </TwoColumn>
  );
}

function TwoColumn({ children }: { children: ReactNode }) {
  return <div className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">{children}</div>;
}

function PanelShell({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return (
    <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      <h3 className="text-xl font-black text-neutral-950">{title}</h3>
      <p className="mt-2 text-sm leading-7 text-neutral-500">{description}</p>
      {children ? <div className="mt-5 space-y-3">{children}</div> : null}
    </div>
  );
}

function ListRow({ title, meta, danger = false }: { title: string; meta: string; danger?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 ${danger ? 'bg-red-50' : 'bg-neutral-50'}`}>
      <p className="font-black text-neutral-900">{title}</p>
      <p className="mt-1 text-sm text-neutral-500">{meta}</p>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-8 text-center text-sm font-bold text-neutral-400">{label}</div>;
}

function MiniMetric({ label, value, light = false }: { label: string; value: string; light?: boolean }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${light ? 'border-neutral-200 bg-white text-neutral-950' : 'border-white/10 bg-white/10 text-white'}`}>
      <p className={`text-[10px] font-black uppercase tracking-[0.18em] ${light ? 'text-neutral-400' : 'text-white/50'}`}>{label}</p>
      <p className="mt-1 text-lg font-black">{value}</p>
    </div>
  );
}

function today(daysAhead = 0) {
  return new Date(Date.now() + daysAhead * 86400000).toISOString().slice(0, 10);
}
