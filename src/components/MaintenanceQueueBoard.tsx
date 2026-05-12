import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { AlertCircle, Clock, Loader2, Package, SearchCheck, Wrench } from 'lucide-react';

type Ticket = {
  id: string;
  room_number: string | null;
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'resolved' | 'cancelled';
  assigned_to: string | null;
  reported_by: string | null;
  status_reason: string | null;
  resolution_notes: string | null;
  awaiting_parts: boolean | null;
  inspection_status: 'pending' | 'approved' | 'rejected' | null;
  telegram_user_id: number | null;
  created_at: string;
  started_at: string | null;
  resolved_at: string | null;
  updated_at: string | null;
};

const PRIORITY_RANK: Record<Ticket['priority'], number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const PRIORITY_BADGE: Record<Ticket['priority'], string> = {
  urgent: 'bg-red-500 text-white border-red-300',
  high:   'bg-orange-500 text-white border-orange-300',
  medium: 'bg-amber-400 text-amber-950 border-amber-200',
  low:    'bg-neutral-200 text-neutral-700 border-neutral-300',
};

const PRIORITY_LABEL: Record<Ticket['priority'], string> = {
  urgent: 'URGENTE',
  high:   'ALTA',
  medium: 'MEDIA',
  low:    'BAIXA',
};

const formatElapsed = (start: string) => {
  const ms = Date.now() - new Date(start).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return `${h}h${m > 0 ? ` ${m}min` : ''}`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
};

const SLA_LIMIT_MIN: Record<Ticket['priority'], number> = {
  urgent: 15,
  high:   60,
  medium: 240,
  low:    1440,
};

const isSLABreached = (ticket: Ticket) => {
  if (ticket.status !== 'open') return false;
  const min = (Date.now() - new Date(ticket.created_at).getTime()) / 60_000;
  return min > SLA_LIMIT_MIN[ticket.priority];
};

export default function MaintenanceQueueBoard() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setLastUpdate(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetchTickets();
    const channel = supabase
      .channel('maint-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'maintenance_tickets' }, fetchTickets)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchTickets() {
    const { data } = await supabase
      .from('maintenance_tickets')
      .select('*')
      .neq('status', 'cancelled')
      .neq('status', 'resolved')
      .order('created_at', { ascending: false });
    setTickets((data ?? []) as Ticket[]);
    setLoading(false);
  }

  const sortedOpen = useMemo(
    () =>
      tickets
        .filter((t) => t.status === 'open' && !t.awaiting_parts)
        .sort((a, b) => {
          const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
          if (p !== 0) return p;
          return a.created_at.localeCompare(b.created_at);
        }),
    [tickets],
  );

  const sortedInProgress = useMemo(
    () =>
      tickets
        .filter((t) => t.status === 'in_progress' && !t.awaiting_parts && t.inspection_status !== 'pending')
        .sort((a, b) => (a.started_at ?? a.created_at).localeCompare(b.started_at ?? b.created_at)),
    [tickets],
  );

  const sortedAwaitingParts = useMemo(
    () =>
      tickets
        .filter((t) => t.awaiting_parts)
        .sort((a, b) => (a.updated_at ?? a.created_at).localeCompare(b.updated_at ?? b.created_at)),
    [tickets],
  );

  const sortedAwaitingInspection = useMemo(
    () =>
      tickets
        .filter((t) => t.inspection_status === 'pending')
        .sort((a, b) => (a.resolved_at ?? a.created_at).localeCompare(b.resolved_at ?? b.created_at)),
    [tickets],
  );

  const stats = {
    open: sortedOpen.length,
    inProgress: sortedInProgress.length,
    awaitingParts: sortedAwaitingParts.length,
    awaitingInspection: sortedAwaitingInspection.length,
    breached: tickets.filter(isSLABreached).length,
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-neutral-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white p-4 sm:p-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6 sm:mb-8">
        <div>
          <p className="text-[10px] sm:text-xs font-black uppercase tracking-[0.32em] text-amber-400">Royal PMS · Manutencao</p>
          <h1 className="mt-1 text-3xl sm:text-5xl font-black tracking-tight">Quadro de Chamados</h1>
          <p className="mt-1 text-xs sm:text-sm text-neutral-400">Atualizacao em tempo real · {lastUpdate.toLocaleString('pt-BR')}</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <Stat label="Abertos" value={stats.open} tone="amber" />
          <Stat label="Em andamento" value={stats.inProgress} tone="blue" />
          <Stat label="Ag. Peças" value={stats.awaitingParts} tone="orange" />
          <Stat label="Vistoria" value={stats.awaitingInspection} tone="purple" />
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
        <Column
          title="Aberto"
          subtitle="Aguardando assumir"
          accent="bg-amber-500"
          tickets={sortedOpen}
          renderTicket={(t) => <OpenTicketCard key={t.id} ticket={t} />}
          empty="Nenhum chamado aberto!"
        />

        <Column
          title="Em Andamento"
          subtitle="Sendo atendidos agora"
          accent="bg-blue-500"
          tickets={sortedInProgress}
          renderTicket={(t) => <InProgressTicketCard key={t.id} ticket={t} />}
          empty="Nenhum chamado em andamento."
        />

        <Column
          title="Aguardando Peças"
          subtitle="Material em falta"
          accent="bg-orange-500"
          tickets={sortedAwaitingParts}
          renderTicket={(t) => <AwaitingPartsCard key={t.id} ticket={t} />}
          empty="Nenhum chamado aguardando peças."
          icon={<Package className="w-4 h-4 text-orange-400" />}
        />

        <Column
          title="Aguardando Vistoria"
          subtitle="Concluído — pendente vistoria"
          accent="bg-purple-500"
          tickets={sortedAwaitingInspection}
          renderTicket={(t) => <AwaitingInspectionCard key={t.id} ticket={t} />}
          empty="Nenhum chamado aguardando vistoria."
          icon={<SearchCheck className="w-4 h-4 text-purple-400" />}
        />
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'amber' | 'blue' | 'red' | 'orange' | 'purple' }) {
  const tones = {
    amber:  'border-amber-500/40 bg-amber-500/10 text-amber-200',
    blue:   'border-blue-500/40 bg-blue-500/10 text-blue-200',
    red:    'border-red-500/40 bg-red-500/10 text-red-300',
    orange: 'border-orange-500/40 bg-orange-500/10 text-orange-200',
    purple: 'border-purple-500/40 bg-purple-500/10 text-purple-200',
  };
  return (
    <div className={`rounded-2xl border px-3 sm:px-5 py-3 ${tones[tone]}`}>
      <p className="text-[9px] font-black uppercase tracking-widest opacity-80">{label}</p>
      <p className="mt-1 text-2xl sm:text-4xl font-black tabular-nums">{value}</p>
    </div>
  );
}

function Column({
  title, subtitle, accent, tickets, renderTicket, empty, icon,
}: {
  title: string; subtitle: string; accent: string;
  tickets: Ticket[]; renderTicket: (t: Ticket) => React.ReactNode;
  empty: string; icon?: React.ReactNode;
}) {
  return (
    <section className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-4 sm:p-6">
      <div className="flex items-center gap-3 mb-4">
        {icon ?? <div className={`w-2.5 h-2.5 rounded-full ${accent} animate-pulse`} />}
        <div>
          <h2 className="text-base sm:text-lg font-black tracking-tight">{title}</h2>
          <p className="text-[10px] text-neutral-400">{subtitle}</p>
        </div>
        <span className="ml-auto px-2.5 py-1 bg-white/10 rounded-full text-xs font-black tabular-nums">{tickets.length}</span>
      </div>
      {tickets.length === 0 ? (
        <div className="py-10 text-center text-neutral-500 text-sm">{empty}</div>
      ) : (
        <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
          {tickets.map(renderTicket)}
        </div>
      )}
    </section>
  );
}

function OpenTicketCard({ ticket }: { ticket: Ticket }) {
  const breached = isSLABreached(ticket);

  async function assume() {
    const name = prompt('Seu nome (para registro):')?.trim();
    if (name === null) return;
    const { data, error } = await supabase
      .from('maintenance_tickets')
      .update({
        status: 'in_progress',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status_reason: name || null,
        awaiting_parts: false,
      })
      .eq('id', ticket.id)
      .eq('status', 'open')
      .select();
    if (error) {
      alert('Erro ao assumir: ' + error.message);
    } else if (!data || data.length === 0) {
      alert('Chamado já foi assumido por outra pessoa.');
    }
  }

  return (
    <article className={`relative rounded-2xl p-3 sm:p-4 border transition-shadow ${
      ticket.priority === 'urgent'
        ? 'bg-red-950/40 border-red-500/50 shadow-lg shadow-red-500/10'
        : breached ? 'bg-orange-950/30 border-orange-500/40' : 'bg-neutral-900 border-white/10'
    }`}>
      {ticket.priority === 'urgent' && (
        <div className="absolute -top-2 -right-2 bg-red-500 text-white px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest animate-pulse">Urgente</div>
      )}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wider ${PRIORITY_BADGE[ticket.priority]}`}>{PRIORITY_LABEL[ticket.priority]}</span>
            {ticket.room_number && <span className="bg-white text-neutral-900 px-2 py-0.5 rounded font-black text-xs">UH {ticket.room_number}</span>}
            {breached && <span className="flex items-center gap-1 text-orange-300 text-[10px] font-bold"><AlertCircle className="w-3 h-3" /> SLA</span>}
          </div>
          <h3 className="mt-2 font-black text-sm text-white">{ticket.title}</h3>
          {ticket.description && <p className="mt-1 text-xs text-neutral-400 line-clamp-2">{ticket.description}</p>}
        </div>
      </div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/10">
        <div className="flex items-center gap-1.5 text-neutral-400 text-[11px]">
          <Clock className="w-3 h-3" />
          <span>aberto ha {formatElapsed(ticket.created_at)}</span>
        </div>
        <button onClick={assume} className="bg-white text-neutral-900 hover:bg-amber-300 transition px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider">Assumir</button>
      </div>
    </article>
  );
}

function InProgressTicketCard({ ticket }: { ticket: Ticket }) {
  const start = ticket.started_at ?? ticket.created_at;

  async function resolve() {
    const note = prompt('Nota de resolucao (opcional):') ?? '';
    const { data, error } = await supabase
      .from('maintenance_tickets')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...(note ? { resolution_notes: note } : {}),
        inspection_status: null,
        inspector_tg_id: null,
        awaiting_parts: false,
      })
      .eq('id', ticket.id)
      .eq('status', 'in_progress')
      .select();
    if (error) {
      alert('Erro ao resolver: ' + error.message);
    } else if (!data || data.length === 0) {
      alert('Chamado não está mais em andamento.');
    }
  }

  return (
    <article className="rounded-2xl p-3 sm:p-4 border border-blue-500/30 bg-blue-950/30">
      <div className="flex items-start gap-3">
        <div className="bg-blue-500/20 text-blue-300 p-2 rounded-xl shrink-0"><Wrench className="w-4 h-4" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${PRIORITY_BADGE[ticket.priority]}`}>{PRIORITY_LABEL[ticket.priority]}</span>
            {ticket.room_number && <span className="bg-white text-neutral-900 px-2 py-0.5 rounded font-black text-xs">UH {ticket.room_number}</span>}
          </div>
          <h3 className="mt-1.5 font-black text-sm text-white">{ticket.title}</h3>
          {ticket.status_reason && <p className="mt-1 text-[11px] text-blue-200 font-semibold">👷 {ticket.status_reason}</p>}
          <div className="mt-1.5 inline-flex items-center gap-1.5 text-blue-300 text-[11px] font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            em andamento ha <span className="tabular-nums ml-1">{formatElapsed(start)}</span>
          </div>
        </div>
        <button onClick={resolve} className="bg-emerald-500 hover:bg-emerald-400 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider shrink-0">Resolver</button>
      </div>
    </article>
  );
}

function AwaitingPartsCard({ ticket }: { ticket: Ticket }) {
  const since = ticket.updated_at ?? ticket.created_at;

  return (
    <article className="rounded-2xl p-3 sm:p-4 border border-orange-500/30 bg-orange-950/20">
      <div className="flex items-start gap-3">
        <div className="bg-orange-500/20 text-orange-300 p-2 rounded-xl shrink-0"><Package className="w-4 h-4" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${PRIORITY_BADGE[ticket.priority]}`}>{PRIORITY_LABEL[ticket.priority]}</span>
            {ticket.room_number && <span className="bg-white text-neutral-900 px-2 py-0.5 rounded font-black text-xs">UH {ticket.room_number}</span>}
          </div>
          <h3 className="mt-1.5 font-black text-sm text-white">{ticket.title}</h3>
          {ticket.status_reason && <p className="mt-1 text-[11px] text-orange-200 font-semibold">👷 {ticket.status_reason}</p>}
          {ticket.resolution_notes && (
            <p className="mt-1 text-[10px] text-orange-300 line-clamp-2">🔩 {ticket.resolution_notes.replace(/^⚠️ Aguardando pecas:\s*/i, '')}</p>
          )}
          <div className="mt-1.5 inline-flex items-center gap-1.5 text-orange-300 text-[11px] font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
            aguardando ha <span className="tabular-nums ml-1">{formatElapsed(since)}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

function AwaitingInspectionCard({ ticket }: { ticket: Ticket }) {
  const since = ticket.resolved_at ?? ticket.updated_at ?? ticket.created_at;

  return (
    <article className="rounded-2xl p-3 sm:p-4 border border-purple-500/30 bg-purple-950/20">
      <div className="flex items-start gap-3">
        <div className="bg-purple-500/20 text-purple-300 p-2 rounded-xl shrink-0"><SearchCheck className="w-4 h-4" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${PRIORITY_BADGE[ticket.priority]}`}>{PRIORITY_LABEL[ticket.priority]}</span>
            {ticket.room_number && <span className="bg-white text-neutral-900 px-2 py-0.5 rounded font-black text-xs">UH {ticket.room_number}</span>}
          </div>
          <h3 className="mt-1.5 font-black text-sm text-white">{ticket.title}</h3>
          {ticket.status_reason && <p className="mt-1 text-[11px] text-purple-200 font-semibold">👷 Concluído por {ticket.status_reason}</p>}
          {ticket.resolution_notes && <p className="mt-1 text-[11px] text-purple-300 line-clamp-2">📝 {ticket.resolution_notes}</p>}
          <div className="mt-1.5 inline-flex items-center gap-1.5 text-purple-300 text-[11px] font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
            aguardando vistoriador ha <span className="tabular-nums ml-1">{formatElapsed(since)}</span>
          </div>
        </div>
      </div>
    </article>
  );
}
