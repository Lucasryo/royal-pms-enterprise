import { type ComponentType, type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { LostFoundItem, MaintenanceTicket, Room, ShiftHandover, UserProfile } from '../types';
import { hasPermission } from '../lib/permissions';
import { logAudit, sendNotification } from '../lib/audit';
import {
  AlertTriangle,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Wrench,
  X as CloseIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';

type Tab = 'maintenance' | 'lost-found' | 'handover';

type MaintenanceAction = 'in_progress' | 'resolved' | 'cancelled';

const PRIORITY_LABELS: Record<MaintenanceTicket['priority'], string> = {
  low: 'Baixa',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente',
};

const PRIORITY_STYLES: Record<MaintenanceTicket['priority'], string> = {
  low: 'bg-neutral-100 text-neutral-600',
  medium: 'bg-blue-50 text-blue-700',
  high: 'bg-amber-50 text-amber-700',
  urgent: 'bg-red-50 text-red-700',
};

const TICKET_STATUS_LABELS: Record<MaintenanceTicket['status'], string> = {
  open: 'Aberta',
  in_progress: 'Em andamento',
  resolved: 'Resolvida',
  cancelled: 'Cancelada',
};

const STATUS_ACTION_COPY: Record<MaintenanceAction, { title: string; label: string; placeholder: string; audit: string }> = {
  in_progress: {
    title: 'Assumir chamado',
    label: 'Assumir e iniciar atendimento',
    placeholder: 'Informe a triagem inicial, causa provavel ou observacao para o solicitante.',
    audit: 'Chamado assumido',
  },
  resolved: {
    title: 'Concluir chamado',
    label: 'Concluir chamado',
    placeholder: 'Descreva o que foi feito, peca substituida, teste realizado ou proxima recomendacao.',
    audit: 'Chamado concluido',
  },
  cancelled: {
    title: 'Cancelar chamado',
    label: 'Cancelar chamado',
    placeholder: 'Explique por que o chamado foi cancelado ou duplicado.',
    audit: 'Chamado cancelado',
  },
};

const LOST_STATUS_LABELS: Record<LostFoundItem['status'], string> = {
  stored: 'Guardado',
  claimed: 'Retirado',
  discarded: 'Descartado',
};

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function OperationsDashboard({ profile }: { profile: UserProfile }) {
  const canManage = hasPermission(profile, 'canManageOperations', ['admin', 'reception', 'eventos', 'restaurant', 'housekeeping', 'maintenance']);
  const canReceiveMaintenance = profile.role === 'maintenance' || profile.role === 'admin';
  const [activeTab, setActiveTab] = useState<Tab>('maintenance');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [lostItems, setLostItems] = useState<LostFoundItem[]>([]);
  const [handovers, setHandovers] = useState<ShiftHandover[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [ticketModal, setTicketModal] = useState(false);
  const [lostModal, setLostModal] = useState(false);
  const [handoverModal, setHandoverModal] = useState(false);
  const [ticketAction, setTicketAction] = useState<{ ticket: MaintenanceTicket; status: MaintenanceAction } | null>(null);

  useEffect(() => {
    fetchAll();
    const channel = supabase
      .channel('operations-center')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'maintenance_tickets' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lost_found_items' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_handovers' }, fetchAll)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchAll() {
    setLoading(true);
    const [ticketRes, lostRes, handoverRes, roomRes] = await Promise.all([
      supabase.from('maintenance_tickets').select('*').order('created_at', { ascending: false }),
      supabase.from('lost_found_items').select('*').order('found_at', { ascending: false }),
      supabase.from('shift_handovers').select('*').order('created_at', { ascending: false }).limit(30),
      supabase.from('rooms').select('*').order('room_number'),
    ]);

    if (ticketRes.error) toast.error('Erro ao carregar manutencao: ' + ticketRes.error.message);
    if (lostRes.error) toast.error('Erro ao carregar achados: ' + lostRes.error.message);
    if (handoverRes.error) toast.error('Erro ao carregar passagem de turno: ' + handoverRes.error.message);

    setTickets((ticketRes.data || []) as MaintenanceTicket[]);
    setLostItems((lostRes.data || []) as LostFoundItem[]);
    setHandovers((handoverRes.data || []) as ShiftHandover[]);
    setRooms((roomRes.data || []) as Room[]);
    setLoading(false);
  }

  const stats = {
    openTickets: tickets.filter((ticket) => ticket.status === 'open' || ticket.status === 'in_progress').length,
    urgentTickets: tickets.filter((ticket) => ticket.priority === 'urgent' && ticket.status !== 'resolved').length,
    storedItems: lostItems.filter((item) => item.status === 'stored').length,
    todayHandovers: handovers.filter((handover) => handover.shift_date === todayISO()).length,
  };

  const filteredTickets = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tickets.filter((ticket) =>
      !term ||
      ticket.title.toLowerCase().includes(term) ||
      ticket.description?.toLowerCase().includes(term) ||
      ticket.room_number?.toLowerCase().includes(term),
    );
  }, [tickets, search]);

  const filteredLostItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return lostItems.filter((item) =>
      !term ||
      item.item_name.toLowerCase().includes(term) ||
      item.description?.toLowerCase().includes(term) ||
      item.guest_name?.toLowerCase().includes(term) ||
      item.room_number?.toLowerCase().includes(term),
    );
  }, [lostItems, search]);

  async function updateTicket(ticket: MaintenanceTicket, patch: Partial<MaintenanceTicket>, action: string) {
    const payload = {
      ...patch,
      assigned_to: patch.status === 'in_progress' ? profile.id : patch.assigned_to ?? ticket.assigned_to,
      resolved_at: patch.status === 'resolved' ? new Date().toISOString() : ticket.resolved_at,
    };
    const { error } = await supabase.from('maintenance_tickets').update(payload).eq('id', ticket.id);
    if (error) {
      toast.error('Erro ao atualizar chamado: ' + error.message);
      return;
    }
    await logAudit({ user_id: profile.id, user_name: profile.name, action, details: ticket.title, type: 'update' });
    if (patch.status === 'in_progress' && ticket.reported_by && ticket.reported_by !== profile.id) {
      await sendNotification({
        user_id: ticket.reported_by,
        title: 'Chamado assumido',
        message: `${profile.name} assumiu o chamado: ${ticket.title}`,
        link: '/dashboard',
      });
    }
    toast.success('Chamado atualizado.');
    fetchAll();
  }

  async function transitionTicket(ticket: MaintenanceTicket, status: MaintenanceAction, reason: string) {
    const patch: Partial<MaintenanceTicket> = {
      status,
      status_reason: reason,
      resolution_notes: status === 'resolved' ? reason : ticket.resolution_notes,
      started_at: status === 'in_progress' ? ticket.started_at || new Date().toISOString() : ticket.started_at,
    };
    await updateTicket(ticket, patch, STATUS_ACTION_COPY[status].audit);
    await notifyMaintenancePhoneEvent({
      event: 'status_changed',
      ticket: { ...ticket, ...patch },
      actorName: profile.name,
      reason,
    });
  }

  async function updateLostItem(item: LostFoundItem, patch: Partial<LostFoundItem>, action: string) {
    const payload = {
      ...patch,
      resolved_at: patch.status && patch.status !== 'stored' ? new Date().toISOString() : item.resolved_at,
    };
    const { error } = await supabase.from('lost_found_items').update(payload).eq('id', item.id);
    if (error) {
      toast.error('Erro ao atualizar item: ' + error.message);
      return;
    }
    await logAudit({ user_id: profile.id, user_name: profile.name, action, details: item.item_name, type: 'update' });
    toast.success('Item atualizado.');
    fetchAll();
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-gray-900">Operacoes</h1>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Manutencao, achados e perdidos, passagem de turno
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={fetchAll}
            className="rounded-xl border border-neutral-200 bg-white p-2 text-neutral-500 transition-all hover:bg-neutral-50"
            title="Atualizar"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          {canManage && (
            <>
              <button onClick={() => setTicketModal(true)} className="flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-sm font-bold text-white hover:bg-neutral-800">
                <Wrench className="h-4 w-4" />
                Chamado
              </button>
              <button onClick={() => setLostModal(true)} className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-50">
                <Briefcase className="h-4 w-4" />
                Achado
              </button>
              <button onClick={() => setHandoverModal(true)} className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-50">
                <ClipboardList className="h-4 w-4" />
                Turno
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard label="Chamados ativos" value={stats.openTickets} icon={Wrench} tone="neutral" />
        <StatCard label="Urgentes" value={stats.urgentTickets} icon={AlertTriangle} tone="red" />
        <StatCard label="Achados guardados" value={stats.storedItems} icon={Briefcase} tone="amber" />
        <StatCard label="Turnos hoje" value={stats.todayHandovers} icon={CalendarClock} tone="blue" />
      </div>

      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-700">Central substituta do WhatsApp</p>
            <p className="mt-2 text-sm leading-6 text-amber-900">
              Chamados abertos aqui notificam automaticamente manutencao e administradores no sino do sistema.
              A equipe assume, resolve e deixa rastreabilidade por prioridade, UH e responsavel.
            </p>
          </div>
          {canReceiveMaintenance && (
            <span className="rounded-full bg-amber-900 px-4 py-2 text-xs font-black uppercase tracking-widest text-white">
              Voce recebe alertas
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm md:flex-row md:items-center">
        <div className="flex gap-2">
          {[
            { id: 'maintenance' as const, label: 'Manutencao', icon: Wrench },
            { id: 'lost-found' as const, label: 'Achados', icon: Briefcase },
            { id: 'handover' as const, label: 'Turnos', icon: ClipboardList },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                  active ? 'bg-neutral-900 text-white' : 'bg-neutral-50 text-neutral-500 hover:bg-neutral-100'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por UH, hospede, item ou ocorrencia"
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 py-2 pl-9 pr-4 text-sm outline-none focus:border-neutral-900 focus:bg-white"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
        </div>
      ) : activeTab === 'maintenance' ? (
        <MaintenanceList
          tickets={filteredTickets}
          canManage={canManage}
          onOpenAction={(ticket, status) => setTicketAction({ ticket, status })}
        />
      ) : activeTab === 'lost-found' ? (
        <LostFoundList items={filteredLostItems} canManage={canManage} onUpdate={updateLostItem} />
      ) : (
        <HandoverList handovers={handovers} />
      )}

      <AnimatePresence>
        {ticketModal && (
          <TicketModal
            profile={profile}
            rooms={rooms}
            onClose={() => setTicketModal(false)}
            onCreated={() => {
              setTicketModal(false);
              fetchAll();
            }}
          />
        )}
        {ticketAction && (
          <TicketActionModal
            ticket={ticketAction.ticket}
            action={ticketAction.status}
            onClose={() => setTicketAction(null)}
            onConfirm={async (reason) => {
              await transitionTicket(ticketAction.ticket, ticketAction.status, reason);
              setTicketAction(null);
            }}
          />
        )}
        {lostModal && (
          <LostFoundModal
            profile={profile}
            rooms={rooms}
            onClose={() => setLostModal(false)}
            onCreated={() => {
              setLostModal(false);
              fetchAll();
            }}
          />
        )}
        {handoverModal && (
          <HandoverModal
            profile={profile}
            onClose={() => setHandoverModal(false)}
            onCreated={() => {
              setHandoverModal(false);
              fetchAll();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: ComponentType<{ className?: string }>;
  tone: 'neutral' | 'red' | 'amber' | 'blue';
}) {
  const tones = {
    neutral: 'bg-neutral-50 text-neutral-700',
    red: 'bg-red-50 text-red-700',
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-blue-50 text-blue-700',
  };
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className={`rounded-xl p-2 ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <span className="text-2xl font-black text-neutral-900">{value}</span>
      </div>
      <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-neutral-400">{label}</p>
    </div>
  );
}

function MaintenanceList({
  tickets,
  canManage,
  onOpenAction,
}: {
  tickets: MaintenanceTicket[];
  canManage: boolean;
  onOpenAction: (ticket: MaintenanceTicket, status: MaintenanceAction) => void;
}) {
  if (tickets.length === 0) return <EmptyState icon={Wrench} label="Nenhum chamado encontrado" />;
  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      {tickets.map((ticket) => (
        <div key={ticket.id} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${PRIORITY_STYLES[ticket.priority]}`}>
                  {PRIORITY_LABELS[ticket.priority]}
                </span>
                <span className="rounded-full bg-neutral-100 px-2 py-1 text-[9px] font-bold uppercase text-neutral-500">
                  {TICKET_STATUS_LABELS[ticket.status]}
                </span>
              </div>
              <h3 className="mt-3 font-black text-neutral-900">{ticket.title}</h3>
              <p className="mt-1 text-sm text-neutral-500">{ticket.description || 'Sem descricao.'}</p>
            </div>
            {ticket.room_number && (
              <span className="rounded-xl bg-neutral-900 px-3 py-2 text-xs font-black text-white">UH {ticket.room_number}</span>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
            <span>{new Date(ticket.created_at).toLocaleString('pt-BR')}</span>
            {ticket.due_at && <span>Prazo: {new Date(ticket.due_at).toLocaleString('pt-BR')}</span>}
            {ticket.assigned_to && <span>Responsavel atribuido</span>}
          </div>
          {ticket.status_reason && (
            <div className="mt-4 rounded-2xl bg-neutral-50 p-3 text-xs leading-6 text-neutral-600">
              <span className="font-black uppercase tracking-widest text-neutral-400">Ultima justificativa: </span>
              {ticket.status_reason}
            </div>
          )}
          {canManage && ticket.status !== 'resolved' && (
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => onOpenAction(ticket, 'in_progress')}
                className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100"
              >
                Assumir
              </button>
              <button
                onClick={() => onOpenAction(ticket, 'resolved')}
                className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
              >
                Resolver
              </button>
              <button
                onClick={() => onOpenAction(ticket, 'cancelled')}
                className="rounded-xl bg-neutral-100 px-3 py-2 text-xs font-bold text-neutral-600 hover:bg-neutral-200"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function LostFoundList({
  items,
  canManage,
  onUpdate,
}: {
  items: LostFoundItem[];
  canManage: boolean;
  onUpdate: (item: LostFoundItem, patch: Partial<LostFoundItem>, action: string) => void;
}) {
  if (items.length === 0) return <EmptyState icon={Briefcase} label="Nenhum item encontrado" />;
  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
      {items.map((item) => (
        <div key={item.id} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-black text-neutral-900">{item.item_name}</h3>
              <p className="mt-1 text-sm text-neutral-500">{item.description || 'Sem descricao.'}</p>
            </div>
            <span className="rounded-full bg-neutral-100 px-2 py-1 text-[9px] font-black uppercase text-neutral-500">
              {LOST_STATUS_LABELS[item.status]}
            </span>
          </div>
          <div className="mt-4 space-y-1 text-xs text-neutral-500">
            <p>UH: <span className="font-bold text-neutral-800">{item.room_number || '-'}</span></p>
            <p>Hospede: <span className="font-bold text-neutral-800">{item.guest_name || '-'}</span></p>
            <p>Guarda: <span className="font-bold text-neutral-800">{item.storage_location || '-'}</span></p>
            <p>Encontrado: <span className="font-bold text-neutral-800">{new Date(item.found_at).toLocaleString('pt-BR')}</span></p>
          </div>
          {canManage && item.status === 'stored' && (
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => onUpdate(item, { status: 'claimed' }, 'Achado retirado')}
                className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
              >
                Retirado
              </button>
              <button
                onClick={() => onUpdate(item, { status: 'discarded' }, 'Achado descartado')}
                className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100"
              >
                Descartar
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function HandoverList({ handovers }: { handovers: ShiftHandover[] }) {
  if (handovers.length === 0) return <EmptyState icon={ClipboardList} label="Nenhuma passagem de turno registrada" />;
  return (
    <div className="space-y-3">
      {handovers.map((handover) => (
        <div key={handover.id} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-neutral-900 px-2 py-1 text-[9px] font-black uppercase text-white">
                  {handover.shift_name}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                  {new Date(handover.shift_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                </span>
              </div>
              <p className="mt-3 text-sm font-bold text-neutral-900">{handover.summary}</p>
              {handover.open_items && <p className="mt-2 text-sm text-neutral-500">{handover.open_items}</p>}
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
              {new Date(handover.created_at).toLocaleString('pt-BR')}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ icon: Icon, label }: { icon: ComponentType<{ className?: string }>; label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-200 bg-white py-20 text-center">
      <Icon className="mx-auto mb-3 h-10 w-10 text-neutral-200" />
      <p className="font-bold text-neutral-400">{label}</p>
    </div>
  );
}

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-neutral-100 p-6">
          <h3 className="font-black text-neutral-900">{title}</h3>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-neutral-100">
            <CloseIcon className="h-5 w-5 text-neutral-400" />
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}

function TicketModal({
  profile,
  rooms,
  onClose,
  onCreated,
}: {
  profile: UserProfile;
  rooms: Room[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [roomNumber, setRoomNumber] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<MaintenanceTicket['priority']>('medium');
  const [dueAt, setDueAt] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    const room = rooms.find((item) => item.room_number === roomNumber);
    const { data: ticket, error } = await supabase.from('maintenance_tickets').insert([{
      room_id: room?.id ?? null,
      room_number: roomNumber || null,
      title,
      description,
      priority,
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
      reported_by: profile.id,
    }]).select().single();
    if (error) {
      toast.error('Erro ao abrir chamado: ' + error.message);
      return;
    }
    if (roomNumber) {
      await supabase
        .from('rooms')
        .update({ status: 'maintenance', housekeeping_status: 'out_of_order', maintenance_notes: title })
        .eq('room_number', roomNumber);
    }
    await logAudit({ user_id: profile.id, user_name: profile.name, action: 'Chamado de manutencao aberto', details: title, type: 'create' });
    await notifyMaintenanceTeam({
      ticketId: ticket?.id,
      title,
      roomNumber,
      priority,
      reporterId: profile.id,
      reporterName: profile.name,
    });
    if (ticket) {
      await notifyMaintenancePhoneEvent({
        event: 'opened',
        ticket: ticket as MaintenanceTicket,
        actorName: profile.name,
        reason: description,
      });
    }
    toast.success('Chamado aberto.');
    onCreated();
  }

  return (
    <ModalShell title="Novo chamado" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 p-6">
        <select value={roomNumber} onChange={(event) => setRoomNumber(event.target.value)} className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none">
          <option value="">Sem UH vinculada</option>
          {rooms.filter((room) => !room.is_virtual).map((room) => <option key={room.id} value={room.room_number}>UH {room.room_number}</option>)}
        </select>
        <input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Titulo do chamado" className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none" />
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Descricao" className="min-h-[100px] w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <select value={priority} onChange={(event) => setPriority(event.target.value as MaintenanceTicket['priority'])} className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none">
            <option value="low">Baixa</option>
            <option value="medium">Media</option>
            <option value="high">Alta</option>
            <option value="urgent">Urgente</option>
          </select>
          <input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none" />
        </div>
        <ModalActions onClose={onClose} label="Abrir chamado" />
      </form>
    </ModalShell>
  );
}

function TicketActionModal({
  ticket,
  action,
  onClose,
  onConfirm,
}: {
  ticket: MaintenanceTicket;
  action: MaintenanceAction;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
}) {
  const copy = STATUS_ACTION_COPY[action];
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (reason.trim().length < 8) {
      toast.error('Informe uma justificativa mais detalhada.');
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(reason.trim());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title={copy.title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 p-6">
        <div className="rounded-2xl bg-neutral-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-neutral-400">Chamado</p>
          <p className="mt-2 text-sm font-black text-neutral-900">{ticket.title}</p>
          <p className="mt-1 text-xs text-neutral-500">{ticket.room_number ? `UH ${ticket.room_number}` : 'Sem UH vinculada'}</p>
        </div>
        <textarea
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={copy.placeholder}
          className="min-h-[140px] w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none focus:border-neutral-900"
        />
        <div className="flex gap-3 border-t border-neutral-100 pt-4">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl px-4 py-2 text-sm font-bold text-neutral-500 hover:bg-neutral-100">
            Voltar
          </button>
          <button disabled={submitting} type="submit" className="flex-1 rounded-xl bg-neutral-900 px-4 py-2 text-sm font-bold text-white hover:bg-neutral-800 disabled:opacity-50">
            {submitting ? 'Salvando...' : copy.label}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

async function notifyMaintenancePhoneEvent({
  event,
  ticket,
  actorName,
  reason,
}: {
  event: 'opened' | 'status_changed';
  ticket: MaintenanceTicket;
  actorName: string;
  reason?: string;
}) {
  try {
    await supabase.functions.invoke('maintenance-phone-notify', {
      body: {
        event,
        ticket_id: ticket.id,
        title: ticket.title,
        room_number: ticket.room_number,
        priority: ticket.priority,
        status: ticket.status,
        actor_name: actorName,
        reason,
      },
    });
  } catch (error) {
    console.warn('Phone notification skipped:', error);
  }
}

async function notifyMaintenanceTeam({
  ticketId,
  title,
  roomNumber,
  priority,
  reporterId,
  reporterName,
}: {
  ticketId?: string;
  title: string;
  roomNumber: string;
  priority: MaintenanceTicket['priority'];
  reporterId: string;
  reporterName: string;
}) {
  const { data: recipients, error } = await supabase
    .from('profiles')
    .select('id, role')
    .in('role', ['maintenance', 'admin']);

  if (error || !recipients?.length) return;

  const message = [
    `${reporterName} abriu chamado de ${PRIORITY_LABELS[priority].toLowerCase()}: ${title}`,
    roomNumber ? `UH ${roomNumber}` : 'Sem UH vinculada',
  ].join(' - ');

  await Promise.all(
    recipients
      .filter((recipient) => recipient.id !== reporterId)
      .map((recipient) => sendNotification({
        user_id: recipient.id,
        title: 'Novo chamado de manutencao',
        message,
        link: ticketId ? `/dashboard?ticket=${ticketId}` : '/dashboard',
      })),
  );
}

function LostFoundModal({
  profile,
  rooms,
  onClose,
  onCreated,
}: {
  profile: UserProfile;
  rooms: Room[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [roomNumber, setRoomNumber] = useState('');
  const [itemName, setItemName] = useState('');
  const [guestName, setGuestName] = useState('');
  const [description, setDescription] = useState('');
  const [storageLocation, setStorageLocation] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    const { error } = await supabase.from('lost_found_items').insert([{
      room_number: roomNumber || null,
      guest_name: guestName || null,
      item_name: itemName,
      description,
      storage_location: storageLocation,
      found_by: profile.id,
      found_at: new Date().toISOString(),
    }]);
    if (error) {
      toast.error('Erro ao registrar item: ' + error.message);
      return;
    }
    await logAudit({ user_id: profile.id, user_name: profile.name, action: 'Achado e perdido registrado', details: itemName, type: 'create' });
    toast.success('Item registrado.');
    onCreated();
  }

  return (
    <ModalShell title="Novo achado" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 p-6">
        <select value={roomNumber} onChange={(event) => setRoomNumber(event.target.value)} className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none">
          <option value="">Sem UH</option>
          {rooms.filter((room) => !room.is_virtual).map((room) => <option key={room.id} value={room.room_number}>UH {room.room_number}</option>)}
        </select>
        <input required value={itemName} onChange={(event) => setItemName(event.target.value)} placeholder="Item encontrado" className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none" />
        <input value={guestName} onChange={(event) => setGuestName(event.target.value)} placeholder="Hospede associado" className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none" />
        <input value={storageLocation} onChange={(event) => setStorageLocation(event.target.value)} placeholder="Local de guarda" className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none" />
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Descricao" className="min-h-[90px] w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none" />
        <ModalActions onClose={onClose} label="Registrar item" />
      </form>
    </ModalShell>
  );
}

function HandoverModal({
  profile,
  onClose,
  onCreated,
}: {
  profile: UserProfile;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [shiftDate, setShiftDate] = useState(todayISO());
  const [shiftName, setShiftName] = useState<ShiftHandover['shift_name']>('manha');
  const [summary, setSummary] = useState('');
  const [openItems, setOpenItems] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    const { error } = await supabase.from('shift_handovers').insert([{
      shift_date: shiftDate,
      shift_name: shiftName,
      summary,
      open_items: openItems,
      created_by: profile.id,
    }]);
    if (error) {
      toast.error('Erro ao registrar turno: ' + error.message);
      return;
    }
    await logAudit({ user_id: profile.id, user_name: profile.name, action: 'Passagem de turno registrada', details: summary, type: 'create' });
    toast.success('Passagem registrada.');
    onCreated();
  }

  return (
    <ModalShell title="Passagem de turno" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 p-6">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <input type="date" value={shiftDate} onChange={(event) => setShiftDate(event.target.value)} className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none" />
          <select value={shiftName} onChange={(event) => setShiftName(event.target.value as ShiftHandover['shift_name'])} className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none">
            <option value="manha">Manha</option>
            <option value="tarde">Tarde</option>
            <option value="noite">Noite</option>
          </select>
        </div>
        <textarea required value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Resumo do turno" className="min-h-[110px] w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none" />
        <textarea value={openItems} onChange={(event) => setOpenItems(event.target.value)} placeholder="Pendencias para o proximo turno" className="min-h-[90px] w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none" />
        <ModalActions onClose={onClose} label="Registrar passagem" />
      </form>
    </ModalShell>
  );
}

function ModalActions({ onClose, label }: { onClose: () => void; label: string }) {
  return (
    <div className="flex gap-3 border-t border-neutral-100 pt-4">
      <button type="button" onClick={onClose} className="flex-1 rounded-xl px-4 py-2 text-sm font-bold text-neutral-500 hover:bg-neutral-100">
        Cancelar
      </button>
      <button type="submit" className="flex-1 rounded-xl bg-neutral-900 px-4 py-2 text-sm font-bold text-white hover:bg-neutral-800">
        {label}
      </button>
    </div>
  );
}
