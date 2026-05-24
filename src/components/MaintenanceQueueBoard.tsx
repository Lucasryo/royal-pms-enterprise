import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { AlertTriangle, CheckCircle2, Clock3, Loader2, Package, Radio, SearchCheck, Timer, Wrench } from 'lucide-react';

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

const PRIORITY_LABEL: Record<Ticket['priority'], string> = {
  urgent: 'Urgente',
  high: 'Alta',
  medium: 'Media',
  low: 'Baixa',
};

const PRIORITY_STYLE: Record<Ticket['priority'], string> = {
  urgent: 'border-red-300/70 bg-red-500 text-white shadow-red-500/30',
  high: 'border-orange-300/70 bg-orange-500 text-white shadow-orange-500/25',
  medium: 'border-amber-300/70 bg-amber-300 text-neutral-950 shadow-amber-400/20',
  low: 'border-white/20 bg-white/12 text-white shadow-black/10',
};

const SLA_LIMIT_MIN: Record<Ticket['priority'], number> = {
  urgent: 15,
  high: 60,
  medium: 240,
  low: 1440,
};

const STATUS_COPY = {
  open: { label: 'Aguardando', tone: 'amber' as const },
  in_progress: { label: 'Em atendimento', tone: 'blue' as const },
  awaiting_parts: { label: 'Aguardando pecas', tone: 'orange' as const },
  inspection: { label: 'Aguardando vistoria', tone: 'purple' as const },
};

function formatElapsed(start?: string | null) {
  if (!start) return '-';
  const ms = Date.now() - new Date(start).getTime();
  const min = Math.max(0, Math.floor(ms / 60_000));
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return `${h}h${m > 0 ? ` ${m}min` : ''}`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function minutesSince(start?: string | null) {
  if (!start) return 0;
  return (Date.now() - new Date(start).getTime()) / 60_000;
}

function isSLABreached(ticket: Ticket) {
  if (ticket.status !== 'open') return false;
  return minutesSince(ticket.created_at) > SLA_LIMIT_MIN[ticket.priority];
}

function shortCode(id: string) {
  return id.replace(/-/g, '').slice(0, 6).toUpperCase();
}

function ticketTime(ticket: Ticket) {
  if (ticket.awaiting_parts) return ticket.updated_at ?? ticket.created_at;
  if (ticket.inspection_status === 'pending') return ticket.resolved_at ?? ticket.updated_at ?? ticket.created_at;
  if (ticket.status === 'in_progress') return ticket.started_at ?? ticket.created_at;
  return ticket.created_at;
}

function statusFor(ticket: Ticket) {
  if (ticket.awaiting_parts) return STATUS_COPY.awaiting_parts;
  if (ticket.inspection_status === 'pending') return STATUS_COPY.inspection;
  if (ticket.status === 'in_progress') return STATUS_COPY.in_progress;
  return STATUS_COPY.open;
}

function pickFeatured(open: Ticket[], inProgress: Ticket[]) {
  const openCritical = [...open].sort((a, b) => {
    const aSla = isSLABreached(a) ? 0 : 1;
    const bSla = isSLABreached(b) ? 0 : 1;
    if (a.priority === 'urgent' && b.priority !== 'urgent') return -1;
    if (b.priority === 'urgent' && a.priority !== 'urgent') return 1;
    if (aSla !== bSla) return aSla - bSla;
    const priority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (priority !== 0) return priority;
    return a.created_at.localeCompare(b.created_at);
  });
  return openCritical[0] ?? inProgress[0] ?? null;
}

export default function MaintenanceQueueBoard() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [freshTicketIds, setFreshTicketIds] = useState<string[]>([]);
  const previousIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
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

  useEffect(() => {
    if (freshTicketIds.length === 0) return;
    const timeout = window.setTimeout(() => setFreshTicketIds([]), 9000);
    return () => window.clearTimeout(timeout);
  }, [freshTicketIds]);

  async function fetchTickets() {
    const { data } = await supabase
      .from('maintenance_tickets')
      .select('*')
      .neq('status', 'cancelled')
      .neq('status', 'resolved')
      .order('created_at', { ascending: false });

    const incoming = (data ?? []) as Ticket[];
    const incomingIds = new Set(incoming.map((ticket) => ticket.id));
    const previousIds = previousIdsRef.current;
    if (previousIds) {
      const fresh = incoming.filter((ticket) => !previousIds.has(ticket.id)).map((ticket) => ticket.id);
      if (fresh.length > 0) setFreshTicketIds(fresh);
    }
    previousIdsRef.current = incomingIds;
    setTickets(incoming);
    setLastUpdate(new Date());
    setLoading(false);
  }

  const open = useMemo(
    () =>
      tickets
        .filter((ticket) => ticket.status === 'open' && !ticket.awaiting_parts)
        .sort((a, b) => {
          const priority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
          if (priority !== 0) return priority;
          return a.created_at.localeCompare(b.created_at);
        }),
    [tickets],
  );

  const inProgress = useMemo(
    () =>
      tickets
        .filter((ticket) => ticket.status === 'in_progress' && !ticket.awaiting_parts && ticket.inspection_status !== 'pending')
        .sort((a, b) => (a.started_at ?? a.created_at).localeCompare(b.started_at ?? b.created_at)),
    [tickets],
  );

  const awaitingParts = useMemo(
    () =>
      tickets
        .filter((ticket) => ticket.awaiting_parts)
        .sort((a, b) => (a.updated_at ?? a.created_at).localeCompare(b.updated_at ?? b.created_at)),
    [tickets],
  );

  const awaitingInspection = useMemo(
    () =>
      tickets
        .filter((ticket) => ticket.inspection_status === 'pending')
        .sort((a, b) => (a.resolved_at ?? a.created_at).localeCompare(b.resolved_at ?? b.created_at)),
    [tickets],
  );

  const featured = useMemo(() => pickFeatured(open, inProgress), [open, inProgress, now]);
  const queue = useMemo(
    () => [...open, ...inProgress].filter((ticket) => ticket.id !== featured?.id).slice(0, 7),
    [open, inProgress, featured],
  );

  const stats = {
    open: open.length,
    inProgress: inProgress.length,
    awaitingParts: awaitingParts.length,
    awaitingInspection: awaitingInspection.length,
    breached: tickets.filter(isSLABreached).length,
    active: tickets.length,
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-white">
        <Loader2 className="h-10 w-10 animate-spin text-white/35" />
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-hidden bg-[#06080d] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.22),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.18),transparent_32%)]" />
      <div className="relative flex min-h-screen flex-col p-4 sm:p-6 lg:p-8">
        <header className="grid gap-4 border-b border-white/10 pb-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-emerald-200">
              <Radio className="h-3.5 w-3.5" />
              Ao vivo
            </div>
            <h1 className="mt-3 text-4xl font-black leading-none tracking-tight sm:text-6xl lg:text-7xl">Quadro de Manutencao</h1>
            <p className="mt-2 text-sm font-semibold text-white/45 sm:text-base">Painel operacional interno para chamados, atendimentos e vistorias.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:min-w-[520px]">
            <ClockPanel now={now} lastUpdate={lastUpdate} />
            <Stat label="Ativos" value={stats.active} tone="slate" />
            <Stat label="SLA" value={stats.breached} tone={stats.breached > 0 ? 'red' : 'green'} />
          </div>
        </header>

        <main className="grid flex-1 gap-5 py-5 xl:grid-cols-3">
          <section className="grid gap-5 xl:col-span-2">
            <FeaturedTicket ticket={featured} isFresh={Boolean(featured && freshTicketIds.includes(featured.id))} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatusMetric label="Aguardando" value={stats.open} tone="amber" />
              <StatusMetric label="Em atendimento" value={stats.inProgress} tone="blue" />
              <StatusMetric label="Aguardando pecas" value={stats.awaitingParts} tone="orange" />
              <StatusMetric label="Vistoria" value={stats.awaitingInspection} tone="purple" />
            </div>
          </section>

          <aside className="grid min-h-0 gap-4 lg:grid-cols-2 xl:grid-cols-1">
            <QueuePanel title="Proximos chamados" subtitle="Fila de atencao" tickets={queue} freshTicketIds={freshTicketIds} empty="Fila sem chamados aguardando." />
            <QueuePanel title="Dependencias" subtitle="Pecas e vistoria" tickets={[...awaitingParts, ...awaitingInspection].slice(0, 8)} freshTicketIds={freshTicketIds} empty="Sem pendencias externas." compact />
          </aside>
        </main>
      </div>
    </div>
  );
}

function ClockPanel({ now, lastUpdate }: { now: Date; lastUpdate: Date }) {
  return (
    <div className="col-span-2 rounded-3xl border border-white/10 bg-white/[0.06] p-4 sm:col-span-1">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">Agora</p>
      <p className="mt-1 text-3xl font-black tabular-nums tracking-tight">{now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
      <p className="mt-1 text-[11px] font-semibold text-white/40">Atualizado {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'slate' | 'red' | 'green' }) {
  const tones = {
    slate: 'border-white/10 bg-white/[0.06] text-white',
    red: 'border-red-400/30 bg-red-500/15 text-red-100',
    green: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100',
  };
  return (
    <div className={`rounded-3xl border p-4 ${tones[tone]}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.22em] opacity-55">{label}</p>
      <p className="mt-1 text-4xl font-black tabular-nums tracking-tight">{value}</p>
    </div>
  );
}

function StatusMetric({ label, value, tone }: { label: string; value: number; tone: 'amber' | 'blue' | 'orange' | 'purple' }) {
  const tones = {
    amber: 'from-amber-400/22 to-amber-500/5 text-amber-100',
    blue: 'from-blue-400/22 to-blue-500/5 text-blue-100',
    orange: 'from-orange-400/22 to-orange-500/5 text-orange-100',
    purple: 'from-purple-400/22 to-purple-500/5 text-purple-100',
  };
  return (
    <div className={`rounded-3xl border border-white/10 bg-gradient-to-br ${tones[tone]} p-5`}>
      <p className="text-[10px] font-black uppercase tracking-[0.24em] opacity-60">{label}</p>
      <p className="mt-2 text-5xl font-black tabular-nums tracking-tight">{value}</p>
    </div>
  );
}

function FeaturedTicket({ ticket, isFresh }: { ticket: Ticket | null; isFresh: boolean }) {
  if (!ticket) {
    return (
      <section className="flex min-h-[360px] items-center justify-center rounded-[2rem] border border-emerald-400/20 bg-emerald-400/10 p-8 text-center">
        <div>
          <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-200" />
          <p className="mt-5 text-[11px] font-black uppercase tracking-[0.28em] text-emerald-100/60">Operacao tranquila</p>
          <h2 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">Nenhum chamado ativo</h2>
          <p className="mt-3 text-sm font-semibold text-white/45">A equipe esta sem pendencias no quadro ao vivo.</p>
        </div>
      </section>
    );
  }

  const breached = isSLABreached(ticket);
  const status = statusFor(ticket);
  const elapsedLabel = ticket.status === 'in_progress' ? 'Em atendimento ha' : 'Aberto ha';

  return (
    <section className={`relative overflow-hidden rounded-[2rem] border p-6 shadow-2xl transition ${breached || ticket.priority === 'urgent' ? 'border-red-300/35 bg-red-500/[0.13] shadow-red-950/30' : 'border-white/10 bg-white/[0.075] shadow-black/30'} ${isFresh ? 'ring-4 ring-emerald-300/55' : ''}`}>
      <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-amber-300 via-white to-blue-300" />
      <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
      {isFresh && <FreshBadge className="absolute right-5 top-5" />}
      <div className="relative grid h-full gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <p className="text-[11px] font-black uppercase tracking-[0.3em] text-white/45">Chamado em destaque</p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span className={`rounded-2xl border px-5 py-2 text-sm font-black uppercase tracking-[0.18em] shadow-lg ${PRIORITY_STYLE[ticket.priority]}`}>{PRIORITY_LABEL[ticket.priority]}</span>
            <StatusPill status={status.label} tone={status.tone} />
            {breached && <span className="inline-flex items-center gap-2 rounded-2xl border border-red-300/40 bg-red-500/20 px-4 py-2 text-sm font-black uppercase tracking-wider text-red-100"><AlertTriangle className="h-4 w-4" /> SLA vencido</span>}
          </div>
          <div className="mt-7 flex flex-wrap items-end gap-5">
            <p className="text-6xl font-black leading-none tracking-tight text-white sm:text-8xl">{ticket.room_number ? `UH ${ticket.room_number}` : `#${shortCode(ticket.id)}`}</p>
            {ticket.room_number && <p className="pb-2 text-2xl font-black uppercase tracking-[0.18em] text-white/35">#{shortCode(ticket.id)}</p>}
          </div>
          <h2 className="mt-6 max-w-5xl text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">{ticket.title}</h2>
          {ticket.description && <p className="mt-4 max-w-4xl text-xl font-semibold leading-8 text-white/58 line-clamp-2">{ticket.description}</p>}
        </div>

        <div className="grid content-end gap-3 lg:w-72">
          <InfoTile icon={<Timer className="h-5 w-5" />} label={elapsedLabel} value={formatElapsed(ticketTime(ticket))} />
          <InfoTile icon={<Wrench className="h-5 w-5" />} label="Responsavel" value={ticket.status_reason || 'Aguardando equipe'} />
        </div>
      </div>
    </section>
  );
}

function FreshBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border border-emerald-200/45 bg-emerald-300/20 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-emerald-100 shadow-lg shadow-emerald-950/20 ${className}`}>
      <span className="h-2 w-2 rounded-full bg-emerald-200" />
      Novo chamado
    </span>
  );
}

function StatusPill({ status, tone }: { status: string; tone: 'amber' | 'blue' | 'orange' | 'purple' }) {
  const tones = {
    amber: 'border-amber-300/35 bg-amber-300/15 text-amber-100',
    blue: 'border-blue-300/35 bg-blue-300/15 text-blue-100',
    orange: 'border-orange-300/35 bg-orange-300/15 text-orange-100',
    purple: 'border-purple-300/35 bg-purple-300/15 text-purple-100',
  };
  return <span className={`rounded-2xl border px-4 py-2 text-sm font-black uppercase tracking-wider ${tones[tone]}`}>{status}</span>;
}

function InfoTile({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/18 p-5">
      <div className="flex items-center gap-2 text-white/45">
        {icon}
        <p className="text-[10px] font-black uppercase tracking-[0.22em]">{label}</p>
      </div>
      <p className="mt-2 truncate text-2xl font-black text-white">{value}</p>
    </div>
  );
}

function QueuePanel({ title, subtitle, tickets, freshTicketIds, empty, compact = false }: { title: string; subtitle: string; tickets: Ticket[]; freshTicketIds: string[]; empty: string; compact?: boolean }) {
  return (
    <section className="min-h-0 rounded-[2rem] border border-white/10 bg-white/[0.055] p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/35">{subtitle}</p>
          <h3 className="mt-1 text-2xl font-black tracking-tight">{title}</h3>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-black tabular-nums">{tickets.length}</span>
      </div>
      {tickets.length === 0 ? (
        <div className="flex min-h-36 items-center justify-center rounded-3xl border border-dashed border-white/10 text-center text-sm font-semibold text-white/32">{empty}</div>
      ) : (
        <div className="grid max-h-[54vh] gap-3 overflow-y-auto pr-1">
          {tickets.map((ticket) => <QueueTicket key={ticket.id} ticket={ticket} fresh={freshTicketIds.includes(ticket.id)} compact={compact} />)}
        </div>
      )}
    </section>
  );
}

function QueueTicket({ ticket, fresh, compact }: { ticket: Ticket; fresh: boolean; compact?: boolean }) {
  const status = statusFor(ticket);
  const breached = isSLABreached(ticket);

  return (
    <article className={`rounded-3xl border p-4 transition ${fresh ? 'border-emerald-200/60 bg-emerald-300/12' : breached ? 'border-red-300/30 bg-red-500/12' : 'border-white/10 bg-black/16'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-xl border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${PRIORITY_STYLE[ticket.priority]}`}>{PRIORITY_LABEL[ticket.priority]}</span>
            {fresh && <span className="rounded-xl bg-emerald-300/18 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-100">Novo</span>}
            {breached && <span className="rounded-xl bg-red-300/18 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-red-100">SLA</span>}
          </div>
          <p className="mt-3 text-2xl font-black leading-none">{ticket.room_number ? `UH ${ticket.room_number}` : `#${shortCode(ticket.id)}`}</p>
          <h4 className="mt-2 line-clamp-2 text-sm font-black leading-5 text-white/90">{ticket.title}</h4>
          {!compact && ticket.description && <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-white/40">{ticket.description}</p>}
        </div>
        <div className="shrink-0 text-right">
          <StatusIcon tone={status.tone} />
          <p className="mt-2 text-[10px] font-black uppercase tracking-wider text-white/40">{formatElapsed(ticketTime(ticket))}</p>
        </div>
      </div>
      {ticket.status_reason && <p className="mt-3 truncate border-t border-white/10 pt-3 text-xs font-bold text-white/48">{ticket.status_reason}</p>}
    </article>
  );
}

function StatusIcon({ tone }: { tone: 'amber' | 'blue' | 'orange' | 'purple' }) {
  const common = 'h-10 w-10 rounded-2xl p-2';
  if (tone === 'blue') return <Wrench className={`${common} bg-blue-400/18 text-blue-200`} />;
  if (tone === 'orange') return <Package className={`${common} bg-orange-400/18 text-orange-200`} />;
  if (tone === 'purple') return <SearchCheck className={`${common} bg-purple-400/18 text-purple-200`} />;
  return <Clock3 className={`${common} bg-amber-400/18 text-amber-200`} />;
}
