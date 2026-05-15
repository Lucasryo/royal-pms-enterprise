import { ComponentType, ReactNode, useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, BarChart3, BedDouble, Building2, CalendarDays, ClipboardList, CreditCard, FileText, Globe, Hotel, KeyRound, Maximize2, Monitor, QrCode, Settings, ShieldCheck, Utensils, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../supabase';
import { UserProfile } from '../types';
import SharedHotelCalendar from './SharedHotelCalendar';
import ReservationsDashboard from './ReservationsDashboard';
import CheckInOutDashboard from './CheckInOutDashboard';
import HousekeepingDashboard from './HousekeepingDashboard';
import OperationsDashboard from './OperationsDashboard';
import AdminDashboard from './AdminDashboard';
import AuditDashboard from './AuditDashboard';
import EventsDashboard from './EventsDashboard';
import POSDashboard from './POSDashboard';
import RevenuePanelDashboard from './RevenuePanelDashboard';
import FiscalPanelDashboard from './FiscalPanelDashboard';
import OperationalWorkQueue, { OperationalDepartment } from './OperationalWorkQueue';
import PublicRatesManager from './PublicRatesManager';
import BlockedDatesManager from './BlockedDatesManager';
import OccupancyChart from './OccupancyChart';
import MaintenanceQueueBoard from './MaintenanceQueueBoard';

type ModuleTab<T extends string> = {
  id: T;
  label: string;
  icon: ComponentType<{ className?: string }>;
  render: () => ReactNode;
};

const moduleShellClass = 'space-y-6 pb-12';

export function ReservationsModuleDashboard({ profile }: { profile: UserProfile }) {
  return (
    <ModuleShell
      eyebrow="Modulo Reservas"
      title="Reservas, tarifas e demanda"
      description="Central unica para solicitacoes, reservas internas, tarifas, rate shopper e leitura do calendario do hotel."
      profile={profile}
      queueDepartment="reservations"
      tabs={[
        { id: 'central', label: 'Central de reservas', icon: CalendarDays, render: () => <ReservationsDashboard profile={profile} /> },
        { id: 'occupancy', label: 'Ocupação', icon: Activity, render: () => <OccupancyChart /> },
        { id: 'public-rates', label: 'Tarifas publicas', icon: Globe, render: () => <PublicRatesManager profile={profile} /> },
        { id: 'blocked-dates', label: 'Bloqueio de datas', icon: Hotel, render: () => <BlockedDatesManager profile={profile} /> },
        { id: 'tariffs', label: 'Tarifas corporativas', icon: CreditCard, render: () => <AdminDashboard profile={profile} initialTab="tariffs" /> },
        { id: 'revenue', label: 'Revenue e rate shopper', icon: BarChart3, render: () => <RevenuePanelDashboard profile={profile} /> },
      ]}
    />
  );
}

export function ReceptionModuleDashboard({ profile }: { profile: UserProfile }) {
  return (
    <ModuleShell
      eyebrow="Modulo Recepcao"
      title="Recepcao, hospedagem e governanca"
      description="Check-in/out, walk-in, folio operacional, governanca, UHs, achados e perdidos e passagem de turno no mesmo lugar."
      profile={profile}
      queueDepartment="reception"
      tabs={[
        { id: 'checkin', label: 'Check-in/out', icon: KeyRound, render: () => <CheckInOutDashboard profile={profile} /> },
        { id: 'housekeeping', label: 'Governanca e UHs', icon: BedDouble, render: () => <HousekeepingDashboard profile={profile} /> },
        { id: 'shift', label: 'Turno e ocorrencias', icon: ClipboardList, render: () => <OperationsDashboard profile={profile} /> },
      ]}
    />
  );
}

export function MaintenanceModuleDashboard({ profile }: { profile: UserProfile }) {
  return (
    <ModuleShell
      eyebrow="Modulo Manutencao"
      title="Chamados, UHs interditadas e preventiva"
      description="Fila de chamados, tratamento, justificativa, notificacao, acesso as UHs e plano preventivo para manutencao."
      profile={profile}
      queueDepartment="maintenance"
      hideTopQueue
      tabs={[
        { id: 'tickets', label: 'Chamados internos', icon: Wrench, render: () => <OperationalWorkQueue profile={profile} department="maintenance" /> },
        { id: 'qr-tickets', label: 'Chamados QR / Telegram', icon: QrCode, render: () => <MaintenanceTicketsTab profile={profile} /> },
        { id: 'board', label: 'Quadro ao Vivo', icon: Monitor, render: () => <BoardTab /> },
        { id: 'performance', label: 'Desempenho', icon: BarChart3, render: () => <MaintenancePerformanceTab /> },
        { id: 'rooms', label: 'UHs e bloqueios', icon: BedDouble, render: () => <HousekeepingDashboard profile={profile} /> },
      ]}
    />
  );
}

type MaintTicket = {
  id: string;
  room_number: string | null;
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'resolved' | 'cancelled';
  status_reason: string | null;
  resolution_notes: string | null;
  created_at: string;
  started_at: string | null;
  resolved_at: string | null;
  rating: number | null;
  inspection_status: 'pending' | 'approved' | 'rejected' | null;
  inspector_id: string | null;
  inspection_notes: string | null;
  inspected_at: string | null;
  awaiting_parts: boolean | null;
  telegram_user_id: number | null;
  telegram_message_id: number | null;
  telegram_card_updated_at: string | null;
};

const PRIORITY_BADGE: Record<MaintTicket['priority'], string> = {
  urgent: 'bg-red-100 text-red-700 border border-red-200',
  high:   'bg-orange-100 text-orange-700 border border-orange-200',
  medium: 'bg-amber-100 text-amber-700 border border-amber-200',
  low:    'bg-neutral-100 text-neutral-600 border border-neutral-200',
};
const PRIORITY_LABEL: Record<MaintTicket['priority'], string> = { urgent: 'URGENTE', high: 'ALTA', medium: 'MEDIA', low: 'BAIXA' };
const SLA_MIN: Record<MaintTicket['priority'], number> = { urgent: 15, high: 60, medium: 240, low: 1440 };

function elapsed(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h${m % 60 > 0 ? ` ${m % 60}min` : ''}` : `${Math.floor(h / 24)}d`;
}

function fmtMins(m: number): string {
  if (m < 1) return 'menos de 1min';
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}min` : `${h}h`;
}

function resolutionMins(t: { created_at: string; resolved_at: string | null }): number | null {
  if (!t.resolved_at) return null;
  return Math.round((new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime()) / 60_000);
}

type Collaborator = { id: string; name: string; role: string };
type TelegramLog = {
  id: string;
  ticket_id: string | null;
  recipient_name: string | null;
  channel: string;
  event_type: string;
  status: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};
type BotHealth = {
  ok: boolean;
  bot_configured: boolean;
  webhook_secret_configured: boolean;
  last_event_at: string | null;
  last_bot_maintenance_at: string | null;
  last_bot_maintenance: BotMaintenancePayload | null;
  persistent_failures: BotPersistentFailure[];
  failures_24h: number;
  open_count: number;
  in_progress_count: number;
  unowned_in_progress_count: number;
  pending_inspection_count: number;
  missing_card_count: number;
  missing_card_ticket_ids: string[];
  recent_logs: TelegramLog[];
};
type BotMaintenanceResult = {
  ok: boolean;
  checked: number;
  repaired: number;
  retry_failed: number;
  persistent_failures: number;
};
type BotPersistentFailure = {
  id: string;
  ticket_id: string | null;
  event_type: string;
  status: string;
  created_at: string;
  reason: string | null;
};
type BotMaintenancePayload = Partial<BotMaintenanceResult> & {
  failed_ticket_ids?: string[];
  missing_cards_checked?: number;
  recent_failures_checked?: number;
};

function BoardTab() {
  function openFullscreen() {
    const el = document.getElementById('maint-board-embed');
    if (!el) return;
    if (el.requestFullscreen) el.requestFullscreen();
    else if ((el as unknown as { webkitRequestFullscreen?: () => void }).webkitRequestFullscreen)
      (el as unknown as { webkitRequestFullscreen: () => void }).webkitRequestFullscreen();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-500">Atualização em tempo real — ideal para TV da manutenção ou gerência.</p>
        <button
          onClick={openFullscreen}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-900 text-white hover:bg-neutral-700 text-xs font-black transition"
        >
          <Maximize2 className="w-4 h-4" />
          Tela cheia
        </button>
      </div>
      <div
        id="maint-board-embed"
        className="rounded-3xl overflow-hidden border border-neutral-200 shadow-sm"
        style={{ minHeight: '80vh' }}
      >
        <MaintenanceQueueBoard />
      </div>
    </div>
  );
}

function MaintenanceTicketsTab({ profile }: { profile: UserProfile }) {
  const [tickets, setTickets] = useState<MaintTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [directingId, setDirectingId] = useState<string | null>(null);
  const [directTarget, setDirectTarget] = useState<string>('');
  const [inspectingId, setInspectingId] = useState<string | null>(null);
  const [inspectorTarget, setInspectorTarget] = useState<string>('');
  const [, setTick] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [filterPriority, setFilterPriority] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTech, setFilterTech] = useState('');
  const [filterUH, setFilterUH] = useState('');
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [notifExpandedId, setNotifExpandedId] = useState<string | null>(null);
  const [notifLogs, setNotifLogs] = useState<Record<string, TelegramLog[]>>({});
  const [botHealth, setBotHealth] = useState<BotHealth | null>(null);
  const [botHealthLoading, setBotHealthLoading] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupAllLoading, setCleanupAllLoading] = useState(false);
  const [botMaintenanceLoading, setBotMaintenanceLoading] = useState(false);
  const [lastBotMaintenance, setLastBotMaintenance] = useState<BotMaintenanceResult | null>(null);
  const [recreatingCardId, setRecreatingCardId] = useState<string | null>(null);
  const [showBotManual, setShowBotManual] = useState(false);
  const [botLogMode, setBotLogMode] = useState<'all' | 'failures'>('failures');

  const canDirect = profile.role === 'admin' || profile.role === 'manager';

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetchTickets();
    void fetchBotHealth();
    if (canDirect) loadCollaborators();
    const ch = supabase
      .channel('maint-tickets-module')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'maintenance_tickets' }, fetchTickets)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadCollaborators() {
    const { data } = await supabase
      .from('profiles')
      .select('id, name, role')
      .in('role', ['maintenance', 'manager', 'admin'])
      .order('name', { ascending: true });
    setCollaborators((data ?? []) as Collaborator[]);
  }

  async function fetchTickets() {
    const { data, error } = await supabase
      .from('maintenance_tickets')
      .select('id,room_number,title,description,priority,status,status_reason,resolution_notes,created_at,started_at,resolved_at,rating,inspection_status,inspector_id,inspection_notes,inspected_at,awaiting_parts,telegram_user_id,telegram_message_id,telegram_card_updated_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) { toast.error('Erro ao carregar chamados: ' + error.message); setLoading(false); return; }
    setTickets((data ?? []) as MaintTicket[]);
    setLoading(false);
  }

  async function callBotFunction(body: Record<string, unknown>) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Sessao invalida.');
    const supaUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const res = await fetch(`${supaUrl}/functions/v1/notify-maintenance-ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.ok === false) throw new Error(data?.error ?? 'Falha ao chamar bot.');
    return data;
  }

  async function logMaintenanceEvent(ticketId: string, event: string, prevStatus: string | null, newStatus: string | null, notes?: string) {
    await supabase.from('maintenance_ticket_events').insert({
      ticket_id: ticketId,
      actor_type: 'pms_user',
      actor_id: profile.id,
      actor_name: profile.name,
      event,
      prev_status: prevStatus,
      new_status: newStatus,
      notes: notes ?? null,
    });
  }

  async function fetchBotHealth() {
    setBotHealthLoading(true);
    try {
      const data = await callBotFunction({ type: 'bot_health' });
      setBotHealth(data as BotHealth);
    } catch {
      setBotHealth(null);
    } finally {
      setBotHealthLoading(false);
    }
  }

  async function assume(ticket: MaintTicket) {
    const { data, error } = await supabase.from('maintenance_tickets').update({
      status: 'in_progress',
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status_reason: profile.name,
      awaiting_parts: false,
    }).eq('id', ticket.id).eq('status', 'open').select();
    if (error) toast.error('Erro: ' + error.message);
    else if (!data || data.length === 0) toast.error('Chamado já foi assumido por outra pessoa.');
    else { toast.success('Chamado assumido.'); fetchTickets(); void notifyBot('manual_resend', ticket.id); }
  }

  async function resolve(ticket: MaintTicket) {
    const note = prompt('Nota de resolucao (opcional):') ?? '';
    const { data, error } = await supabase.from('maintenance_tickets').update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status_reason: profile.name,
      ...(note ? { resolution_notes: note } : {}),
      inspection_status: null,
      inspector_tg_id: null,
      awaiting_parts: false,
      inspection_requested_at: new Date().toISOString(),
    }).eq('id', ticket.id).eq('status', 'in_progress').select();
    if (error) toast.error('Erro: ' + error.message);
    else if (!data || data.length === 0) toast.error('Chamado não está mais em andamento.');
    else { toast.success('Chamado resolvido.'); fetchTickets(); void notifyBot('manual_resend', ticket.id); }
  }

  async function direct(ticket: MaintTicket) {
    const target = collaborators.find(c => c.id === directTarget);
    if (!target) { toast.error('Escolha um colaborador.'); return; }
    const { error } = await supabase.from('maintenance_tickets').update({
      status: 'in_progress',
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      assigned_to: target.id,
      status_reason: target.name,
    }).eq('id', ticket.id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success(`Direcionado para ${target.name}.`);
    setDirectingId(null);
    setDirectTarget('');
    fetchTickets();
    void notifyBot('manual_resend', ticket.id);
  }

  async function cancel(ticket: MaintTicket) {
    const reason = prompt('Justificativa para cancelar este chamado (obrigatoria):')?.trim();
    if (reason === undefined) return;
    if (!reason) { toast.error('Justificativa obrigatoria para cancelar.'); return; }
    const { error } = await supabase.from('maintenance_tickets').update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
      resolution_notes: `Cancelado: ${reason} (${profile.name})`,
      status_reason: profile.name,
    }).eq('id', ticket.id);
    if (error) toast.error('Erro: ' + error.message);
    else { toast.success('Chamado cancelado. SLA nao sera afetado.'); fetchTickets(); void notifyBot('manual_resend', ticket.id); }
  }

  async function reopen(ticket: MaintTicket) {
    const reason = prompt('Motivo da reabertura (obrigatorio):')?.trim();
    if (reason === undefined) return;
    if (!reason) { toast.error('Motivo obrigatorio para reabrir.'); return; }
    const { data, error } = await supabase.from('maintenance_tickets').update({
      status: 'open',
      assigned_to: null,
      status_reason: null,
      started_at: null,
      resolved_at: null,
      rating: null,
      rated_by_tg_id: null,
      inspection_status: null,
      inspector_id: null,
      inspector_tg_id: null,
      inspection_notes: null,
      inspected_at: null,
      inspection_requested_at: null,
      awaiting_parts: false,
      telegram_user_id: null,
      resolution_notes: `Reaberto: ${reason} (${profile.name})`,
      updated_at: new Date().toISOString(),
    }).eq('id', ticket.id).neq('status', 'open').select();
    if (error) toast.error('Erro: ' + error.message);
    else if (!data || data.length === 0) toast.error('Chamado já está aberto.');
    else { toast.success('Chamado reaberto.'); fetchTickets(); void notifyBot('manual_resend', ticket.id); }
  }

  async function requestInspection(ticket: MaintTicket, inspectorId: string) {
    const inspector = collaborators.find(c => c.id === inspectorId);
    if (!inspector) return;
    const { error } = await supabase.from('maintenance_tickets').update({
      inspection_status: 'pending',
      inspector_id: inspectorId,
      inspector_tg_id: null,
      rating: null,
      rated_by_tg_id: null,
      updated_at: new Date().toISOString(),
    }).eq('id', ticket.id);
    if (error) toast.error('Erro: ' + error.message);
    else { toast.success(`Vistoria solicitada para ${inspector.name}.`); fetchTickets(); void notifyBot('request_inspection', ticket.id); }
  }

  async function approveInspection(ticket: MaintTicket) {
    const note = prompt('Observacoes da vistoria (opcional):') ?? '';
    const { error } = await supabase.from('maintenance_tickets').update({
      inspection_status: 'approved',
      inspection_notes: note || null,
      inspected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', ticket.id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    await logMaintenanceEvent(ticket.id, 'inspection_approved_admin', 'pending', 'approved', note || 'Aprovado via PMS.');

    // Pede avaliação pelo Telegram apenas após aprovação da vistoria
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const supaUrl = import.meta.env.VITE_SUPABASE_URL as string;
        await fetch(`${supaUrl}/functions/v1/notify-maintenance-ticket`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({ type: 'request_rating', ticket_id: ticket.id }),
        });
      }
    } catch { /* silent — não bloqueia o fluxo principal */ }

    toast.success('Vistoria aprovada.'); fetchTickets();
  }

  async function rejectInspection(ticket: MaintTicket) {
    const note = prompt('Descreva o problema encontrado na vistoria (obrigatorio):')?.trim();
    if (note === undefined) return;
    if (!note) { toast.error('Descricao obrigatoria para reprovar.'); return; }
    const { error } = await supabase.from('maintenance_tickets').update({
      status: 'in_progress',
      inspection_status: 'rejected',
      inspection_notes: note,
      inspected_at: new Date().toISOString(),
      resolved_at: null,
      awaiting_parts: false,
      inspector_tg_id: null,
      inspection_requested_at: null,
      updated_at: new Date().toISOString(),
    }).eq('id', ticket.id);
    if (error) toast.error('Erro: ' + error.message);
    else {
      await logMaintenanceEvent(ticket.id, 'inspection_rejected_admin', 'resolved', 'in_progress', note);
      toast.success('Chamado reprovado na vistoria — voltou para em andamento.');
      fetchTickets();
      void notifyBot('manual_resend', ticket.id);
    }
  }

  async function toggleNotifLogs(ticketId: string) {
    if (notifExpandedId === ticketId) { setNotifExpandedId(null); return; }
    setNotifExpandedId(ticketId);
    if (notifLogs[ticketId]) return;
    const { data } = await supabase
      .from('maintenance_notification_logs')
      .select('id,recipient_name,channel,event_type,status,payload,created_at')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: false })
      .limit(20);
    setNotifLogs(prev => ({ ...prev, [ticketId]: (data ?? []) as TelegramLog[] }));
  }

  // 2A/2B/2C: notifica o bot Telegram após ações do PMS (best-effort)
  async function notifyBot(type: string, ticketId: string) {
    try {
      await callBotFunction({ type, ticket_id: ticketId, actor_name: profile.name });
      void fetchBotHealth();
    } catch { /* notificação é best-effort — não bloqueia ação do PMS */ }
  }

  async function resendNotification(ticket: MaintTicket) {
    setResendingId(ticket.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('Sessao invalida.'); return; }
      const supaUrl = import.meta.env.VITE_SUPABASE_URL as string;

      // Notifica via phone webhook
      const phoneRes = await fetch(`${supaUrl}/functions/v1/maintenance-phone-notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({
          event: 'status_changed',
          ticket_id: ticket.id,
          title: ticket.title,
          room_number: ticket.room_number,
          priority: ticket.priority,
          status: ticket.status,
          actor_name: profile.name,
          reason: `Reenvio manual por ${profile.name}`,
        }),
      });

      // Notifica o bot Telegram com contexto de reenvio manual
      // Se reaberto → bot direciona para alguém assumir; se em andamento → lembrete para o técnico
      const tgData = await callBotFunction({
        type: 'manual_resend',
        ticket_id: ticket.id,
        actor_name: profile.name,
      });

      if (phoneRes.ok || tgData?.ok) toast.success('Notificacao reenviada para Telegram e equipe.');
      else toast.error('Falha ao reenviar notificacao.');
      void fetchBotHealth();
    } catch { toast.error('Erro ao reenviar notificacao.'); }
    finally { setResendingId(null); }
  }

  async function recreateTelegramCard(ticket: MaintTicket) {
    if (!canDirect) return;
    setRecreatingCardId(ticket.id);
    try {
      const data = await callBotFunction({ type: 'recreate_card', ticket_id: ticket.id });
      if (data?.ok) toast.success('Card do Telegram recriado.');
      else toast.error('Nao foi possivel recriar o card.');
      await fetchTickets();
      await fetchBotHealth();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao recriar card.');
    } finally {
      setRecreatingCardId(null);
    }
  }

  async function runBotMaintenance() {
    if (!canDirect) return;
    setBotMaintenanceLoading(true);
    try {
      const data = await callBotFunction({ type: 'bot_maintenance' }) as BotMaintenanceResult;
      setLastBotMaintenance(data);
      toast.success(`Verificacao concluida: ${data.repaired ?? 0}/${data.checked ?? 0} cards recuperados.`);
      await fetchTickets();
      await fetchBotHealth();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao verificar o bot.');
    } finally {
      setBotMaintenanceLoading(false);
    }
  }

  async function cleanupTestTickets() {
    if (!canDirect) return;
    const ok = confirm('Limpar chamados de teste das ultimas 24h e apagar cards rastreados no Telegram? Esta acao remove os registros de teste do PMS/Supabase.');
    if (!ok) return;
    setCleanupLoading(true);
    try {
      const data = await callBotFunction({ type: 'cleanup_test_tickets', hours: 24 });
      toast.success(`Limpeza concluida: ${data.tickets_deleted ?? 0} chamados e ${data.telegram_cards_deleted ?? 0} cards removidos.`);
      await fetchTickets();
      await fetchBotHealth();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao limpar testes.');
    } finally {
      setCleanupLoading(false);
    }
  }

  async function cleanupAllTickets() {
    if (!canDirect) return;
    const typed = prompt('Esta acao apaga TODOS os chamados de manutencao do PMS/Supabase e os cards rastreados no Telegram. Digite LIMPAR TODOS para confirmar:');
    if (typed !== 'LIMPAR TODOS') {
      if (typed !== null) toast.error('Confirmacao invalida. Nada foi apagado.');
      return;
    }
    setCleanupAllLoading(true);
    try {
      const data = await callBotFunction({ type: 'cleanup_all_tickets', confirm: 'LIMPAR TODOS' });
      toast.success(`Limpeza total: ${data.tickets_deleted ?? 0} chamados, ${data.telegram_cards_deleted ?? 0} cards removidos.`);
      if ((data.telegram_cards_failed ?? 0) > 0) toast.error(`${data.telegram_cards_failed} cards nao puderam ser apagados do Telegram.`);
      await fetchTickets();
      await fetchBotHealth();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao limpar chamados.');
    } finally {
      setCleanupAllLoading(false);
    }
  }

  // Reincidencia: UHs com 2+ chamados (nao cancelados) nos ultimos 30 dias
  const reincidentUHs = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const counts: Record<string, number> = {};
    for (const t of tickets) {
      if (!t.room_number || t.status === 'cancelled') continue;
      if (new Date(t.created_at).getTime() < cutoff) continue;
      counts[t.room_number] = (counts[t.room_number] ?? 0) + 1;
    }
    return new Set(Object.entries(counts).filter(([, c]) => c >= 2).map(([uh]) => uh));
  }, [tickets]);

  // Listas derivadas de técnicos e UHs únicas para o filtro
  const uniqueTechs = useMemo(() => {
    const s = new Set<string>();
    for (const t of tickets) { if (t.status_reason) s.add(t.status_reason); }
    return Array.from(s).sort();
  }, [tickets]);
  const uniqueUHs = useMemo(() => {
    const s = new Set<string>();
    for (const t of tickets) { if (t.room_number) s.add(t.room_number); }
    return Array.from(s).sort((a, b) => Number(a) - Number(b));
  }, [tickets]);

  const activeFilterCount = [filterPriority, filterStatus, filterTech, filterUH].filter(Boolean).length;

  const filtered = useMemo(() => {
    let t = tickets;
    if (filterPriority) t = t.filter(x => x.priority === filterPriority);
    if (filterStatus)   t = t.filter(x => x.status === filterStatus);
    if (filterTech)     t = t.filter(x => x.status_reason === filterTech);
    if (filterUH)       t = t.filter(x => x.room_number === filterUH);
    return t;
  }, [tickets, filterPriority, filterStatus, filterTech, filterUH]);

  const open = useMemo(() => filtered.filter(t => t.status === 'open').sort((a, b) => {
    const pp = ['urgent','high','medium','low'];
    const pd = pp.indexOf(a.priority) - pp.indexOf(b.priority);
    return pd !== 0 ? pd : a.created_at.localeCompare(b.created_at);
  }), [filtered]);
  const inProgress = useMemo(() => filtered.filter(t => t.status === 'in_progress'), [filtered]);
  const pendingInspection = useMemo(() =>
    filtered.filter(t => t.status === 'resolved' && t.inspection_status === 'pending'),
  [filtered]);
  const closed = useMemo(() =>
    filtered
      .filter(t => (t.status === 'resolved' && t.inspection_status !== 'pending') || t.status === 'cancelled')
      .slice(0, 15),
  [filtered]);
  const botRecentLogs = useMemo(() => {
    const logs = botHealth?.recent_logs ?? [];
    return botLogMode === 'failures' ? logs.filter(log => log.status === 'failed') : logs;
  }, [botHealth, botLogMode]);

  // 1E: apenas admin/manager podem aprovar/reprovar vistorias
  const canInspect = () => profile.role === 'admin' || profile.role === 'manager';

  if (loading) return <div className="rounded-3xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-400">Carregando chamados...</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Abertos</p>
          <p className="mt-1 text-3xl font-black text-amber-800">{open.length}</p>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Em andamento</p>
          <p className="mt-1 text-3xl font-black text-blue-800">{inProgress.length}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">SLA estourado</p>
          <p className="mt-1 text-3xl font-black text-neutral-800">
            {open.filter(t => (Date.now() - new Date(t.created_at).getTime()) / 60_000 > SLA_MIN[t.priority]).length}
          </p>
        </div>
        <div className={`rounded-2xl border px-4 py-3 ${botHealth?.bot_configured ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
          <p className={`text-[10px] font-black uppercase tracking-widest ${botHealth?.bot_configured ? 'text-emerald-600' : 'text-red-600'}`}>Bot Telegram</p>
          <p className={`mt-1 text-xl sm:text-2xl font-black ${botHealth?.bot_configured ? 'text-emerald-800' : 'text-red-800'}`}>
            {botHealthLoading ? '...' : botHealth?.bot_configured ? 'Online' : 'Verificar'}
          </p>
          <p className="mt-1 text-[10px] font-bold text-neutral-500">
            {botHealth?.last_event_at ? `Ultimo: ${new Date(botHealth.last_event_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}` : 'Sem eventos recentes'}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-widest text-neutral-400">Saude do bot</p>
            <p className="mt-1 text-sm font-bold text-neutral-700">
              {botHealth
                ? `${botHealth.failures_24h} falhas nas ultimas 24h · ${botHealth.pending_inspection_count} vistorias pendentes`
                : 'Clique em atualizar para consultar o status da funcao Telegram.'}
            </p>
            {botHealth && (
              <p className="mt-1 text-xs font-bold text-blue-700">
                {botHealth.missing_card_count ?? 0} chamados ativos sem card · {botHealth.unowned_in_progress_count ?? 0} em andamento sem Telegram vinculado.
              </p>
            )}
            {botHealth?.last_bot_maintenance_at && (
              <p className="mt-1 text-xs font-bold text-neutral-500">
                Blindagem automatica: {new Date(botHealth.last_bot_maintenance_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
                {botHealth.last_bot_maintenance ? ` · ${botHealth.last_bot_maintenance.repaired ?? 0}/${botHealth.last_bot_maintenance.checked ?? 0} recuperados` : ''}
              </p>
            )}
            {lastBotMaintenance && (
              <p className="mt-1 text-xs font-bold text-emerald-700">
                Ultima verificacao: {lastBotMaintenance.repaired}/{lastBotMaintenance.checked} recuperados, {lastBotMaintenance.persistent_failures} falhas persistentes.
              </p>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={fetchBotHealth}
              disabled={botHealthLoading}
              className="rounded-xl bg-neutral-900 px-4 py-2 text-xs font-black text-white transition hover:bg-neutral-700 disabled:opacity-50"
            >
              {botHealthLoading ? 'Atualizando...' : 'Atualizar status'}
            </button>
            {canDirect && (
              <>
                <button
                  onClick={runBotMaintenance}
                  disabled={botMaintenanceLoading}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white transition hover:bg-blue-500 disabled:opacity-50"
                >
                  {botMaintenanceLoading ? 'Verificando...' : 'Verificar agora'}
                </button>
                <button
                  onClick={cleanupTestTickets}
                  disabled={cleanupLoading}
                  className="rounded-xl bg-red-50 px-4 py-2 text-xs font-black text-red-700 ring-1 ring-red-200 transition hover:bg-red-100 disabled:opacity-50"
                >
                  {cleanupLoading ? 'Limpando...' : 'Limpar testes'}
                </button>
                <button
                  onClick={cleanupAllTickets}
                  disabled={cleanupAllLoading}
                  className="rounded-xl bg-red-600 px-4 py-2 text-xs font-black text-white transition hover:bg-red-500 disabled:opacity-50"
                >
                  {cleanupAllLoading ? 'Limpando tudo...' : 'Limpar todos'}
                </button>
              </>
            )}
          </div>
        </div>
        {botHealth && (botHealth.failures_24h > 0 || botHealth.missing_card_count > 0) && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
            Atencao: {botHealth.failures_24h} falhas nas ultimas 24h e {botHealth.missing_card_count} chamados ativos sem card. Use Verificar agora se precisar recuperar imediatamente.
          </div>
        )}
        {botHealth?.persistent_failures?.length ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-red-600">Falhas persistentes</p>
            <div className="mt-2 space-y-2">
              {botHealth.persistent_failures.slice(0, 4).map(failure => (
                <div key={failure.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs">
                  <span className="font-black text-red-800">{failure.event_type}</span>
                  <span className="text-red-700">{failure.reason ?? 'Sem detalhe retornado pelo Telegram'}</span>
                  <span className="font-mono text-[10px] text-red-500">{failure.ticket_id ?? '-'}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {botHealth?.recent_logs?.length ? (
          <div className="mt-4 max-w-full overflow-x-auto">
            <div className="mb-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Historico do bot</p>
              <div className="inline-flex rounded-xl bg-neutral-100 p-1 text-[10px] font-black uppercase text-neutral-500">
                <button
                  onClick={() => setBotLogMode('failures')}
                  className={`rounded-lg px-3 py-1.5 transition ${botLogMode === 'failures' ? 'bg-white text-red-600 shadow-sm' : 'hover:text-neutral-800'}`}
                >
                  Falhas
                </button>
                <button
                  onClick={() => setBotLogMode('all')}
                  className={`rounded-lg px-3 py-1.5 transition ${botLogMode === 'all' ? 'bg-white text-neutral-900 shadow-sm' : 'hover:text-neutral-800'}`}
                >
                  Todos
                </button>
              </div>
            </div>
            <table className="min-w-[620px] w-full text-left text-xs">
              <thead className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                <tr>
                  <th className="py-2 pr-3">Quando</th>
                  <th className="py-2 pr-3">Evento</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Chamado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {botRecentLogs.slice(0, 5).map(log => (
                  <tr key={log.id}>
                    <td className="py-2 pr-3 text-neutral-500">{new Date(log.created_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}</td>
                    <td className="py-2 pr-3 font-bold text-neutral-700">{log.event_type}</td>
                    <td className={`py-2 pr-3 font-black ${log.status === 'failed' ? 'text-red-600' : 'text-emerald-700'}`}>{log.status}</td>
                    <td className="py-2 pr-3 font-mono text-[10px] text-neutral-400">{log.ticket_id ?? '-'}</td>
                  </tr>
                ))}
                {botRecentLogs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-xs font-bold text-neutral-400">Nenhuma falha recente.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-widest text-neutral-400">Manual rapido do fluxo</p>
            <p className="mt-1 text-sm font-bold text-neutral-700">QR abre o chamado, Telegram opera o card e PMS audita tudo.</p>
          </div>
          <button
            onClick={() => setShowBotManual(value => !value)}
            className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase text-emerald-700 transition hover:bg-emerald-200"
          >
            {showBotManual ? 'Ocultar' : 'Ver fluxo'}
          </button>
        </div>
        {showBotManual && (
          <>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="rounded-xl bg-white p-4 ring-1 ring-neutral-200">
                <p className="font-black text-neutral-900">1. Abertura</p>
                <p className="mt-1 text-neutral-500">Hospede ou equipe abre pelo QR. O bot cria um card unico no grupo.</p>
              </div>
              <div className="rounded-xl bg-white p-4 ring-1 ring-neutral-200">
                <p className="font-black text-neutral-900">2. Operacao</p>
                <p className="mt-1 text-neutral-500">Assumir, pecas, concluir, transferir e vistoria atualizam o mesmo card.</p>
              </div>
              <div className="rounded-xl bg-white p-4 ring-1 ring-neutral-200">
                <p className="font-black text-neutral-900">3. Auditoria</p>
                <p className="mt-1 text-neutral-500">PMS guarda status, notificacoes e falhas para conferencia da gerencia.</p>
              </div>
            </div>
            <p className="mt-3 text-[11px] font-bold text-neutral-500">
              Mensagens no grupo ficam reservadas para eventos operacionais: assumiu, concluiu, pecas, transferencia e vistoria. Erros simples aparecem como alerta no proprio botao.
            </p>
          </>
        )}
      </div>
      {/* 3E: Banner de paginação — avisa quando o limite de 100 foi atingido */}
      {tickets.length >= 100 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700">
          ⚠️ Exibindo os 100 chamados mais recentes. Use os filtros para localizar chamados mais antigos.
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(f => !f)}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black transition ${activeFilterCount > 0 ? 'bg-amber-600 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}
          >
            🔍 Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </button>
          {activeFilterCount > 0 && (
            <button
              onClick={() => { setFilterPriority(''); setFilterStatus(''); setFilterTech(''); setFilterUH(''); }}
              className="rounded-xl px-3 py-2 text-xs font-black text-neutral-500 hover:text-red-600 transition"
            >
              ✕ Limpar
            </button>
          )}
        </div>
        {showFilters && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
            <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-bold">
              <option value="">Prioridade</option>
              <option value="urgent">Urgente</option>
              <option value="high">Alta</option>
              <option value="medium">Media</option>
              <option value="low">Baixa</option>
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-bold">
              <option value="">Status</option>
              <option value="open">Aberto</option>
              <option value="in_progress">Em andamento</option>
              <option value="resolved">Resolvido</option>
              <option value="cancelled">Cancelado</option>
            </select>
            <select value={filterTech} onChange={e => setFilterTech(e.target.value)} className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-bold">
              <option value="">Tecnico</option>
              {uniqueTechs.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filterUH} onChange={e => setFilterUH(e.target.value)} className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-bold">
              <option value="">UH</option>
              {uniqueUHs.map(uh => <option key={uh} value={uh}>UH {uh}</option>)}
            </select>
          </div>
        )}
      </div>

      {open.length > 0 && (
        <section>
          <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-amber-600">Aguardando atendimento</h3>
          <div className="space-y-3">
            {open.map(ticket => {
              const breached = (Date.now() - new Date(ticket.created_at).getTime()) / 60_000 > SLA_MIN[ticket.priority];
              return (
                <div key={ticket.id} className={`rounded-2xl border p-4 ${ticket.priority === 'urgent' ? 'border-red-200 bg-red-50' : breached ? 'border-orange-200 bg-orange-50' : 'border-neutral-200 bg-white'}`}>
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${PRIORITY_BADGE[ticket.priority]}`}>{PRIORITY_LABEL[ticket.priority]}</span>
                        {ticket.room_number && <span className="rounded bg-neutral-900 text-white px-2 py-0.5 text-xs font-black">UH {ticket.room_number}</span>}
                        {!ticket.telegram_message_id && <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-black uppercase text-blue-700">Sem card</span>}
                        {breached && <span className="flex items-center gap-1 text-[10px] font-bold text-orange-600"><AlertCircle className="w-3 h-3" />SLA</span>}
                        {ticket.room_number && reincidentUHs.has(ticket.room_number) && (
                          <span className="rounded-full bg-red-600 text-white px-2 py-0.5 text-[10px] font-black uppercase">🔁 Reincidente</span>
                        )}
                      </div>
                      <p className="mt-2 font-black text-neutral-950">{ticket.title}</p>
                      {ticket.description && <p className="mt-1 text-xs text-neutral-500 line-clamp-2">{ticket.description}</p>}
                      <p className="mt-1.5 text-[11px] text-neutral-400">aberto ha {elapsed(ticket.created_at)}</p>
                    </div>
                    <div className="shrink-0 flex flex-row sm:flex-col gap-2 sm:min-w-[140px]">
                      <button onClick={() => assume(ticket)} className="flex-1 rounded-xl bg-neutral-950 px-4 py-2 text-xs font-black text-white hover:bg-amber-700 transition">
                        Assumir
                      </button>
                      {canDirect && (
                        <button
                          onClick={() => { setDirectingId(directingId === ticket.id ? null : ticket.id); setDirectTarget(''); }}
                          className="flex-1 rounded-xl bg-amber-700 px-4 py-2 text-xs font-black text-white hover:bg-amber-600 transition"
                        >
                          Direcionar
                        </button>
                      )}
                      <button onClick={() => cancel(ticket)} className="flex-1 rounded-xl bg-neutral-200 px-4 py-2 text-xs font-black text-neutral-700 hover:bg-neutral-300 transition">
                        Cancelar
                      </button>
                      <button
                        onClick={() => resendNotification(ticket)}
                        disabled={resendingId === ticket.id}
                        className="flex-1 rounded-xl bg-blue-100 px-4 py-2 text-xs font-black text-blue-700 hover:bg-blue-200 transition disabled:opacity-50"
                        title="Reenviar notificacao"
                      >
                        {resendingId === ticket.id ? '...' : '📲 Reenviar'}
                      </button>
                      {canDirect && (
                        <button
                          onClick={() => recreateTelegramCard(ticket)}
                          disabled={recreatingCardId === ticket.id}
                          className="flex-1 rounded-xl bg-white px-4 py-2 text-xs font-black text-blue-700 ring-1 ring-blue-200 hover:bg-blue-50 transition disabled:opacity-50"
                        >
                          {recreatingCardId === ticket.id ? '...' : 'Card'}
                        </button>
                      )}
                    </div>
                  </div>

                  {directingId === ticket.id && canDirect && (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-amber-800">Direcionar para colaborador</p>
                      <select
                        value={directTarget}
                        onChange={(e) => setDirectTarget(e.target.value)}
                        className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm"
                      >
                        <option value="">Escolher colaborador...</option>
                        {collaborators
                          .filter(c => c.id !== profile.id)
                          .map(c => (
                            <option key={c.id} value={c.id}>{c.name} ({c.role})</option>
                          ))}
                      </select>
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => direct(ticket)} className="rounded-xl bg-amber-700 px-3 py-2 text-xs font-black text-white">Confirmar</button>
                        <button onClick={() => { setDirectingId(null); setDirectTarget(''); }} className="rounded-xl bg-neutral-300 px-3 py-2 text-xs font-black text-neutral-700">Fechar</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {inProgress.length > 0 && (
        <section>
          <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-blue-600">Em andamento</h3>
          <div className="space-y-3">
            {inProgress.map(ticket => (
              <div key={ticket.id} className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${PRIORITY_BADGE[ticket.priority]}`}>{PRIORITY_LABEL[ticket.priority]}</span>
                      {ticket.room_number && <span className="rounded bg-neutral-900 text-white px-2 py-0.5 text-xs font-black">UH {ticket.room_number}</span>}
                      {!ticket.telegram_message_id && <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-black uppercase text-blue-700">Sem card</span>}
                    </div>
                    <p className="mt-2 font-black text-neutral-950">{ticket.title}</p>
                    {ticket.awaiting_parts && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-orange-100 border border-orange-300 px-2 py-0.5 text-[10px] font-black text-orange-700 uppercase tracking-wider">
                        🔩 Aguardando Peças
                      </span>
                    )}
                    {ticket.status_reason && <p className="mt-1 text-xs font-bold text-blue-700">👷 {ticket.status_reason}</p>}
                    {ticket.awaiting_parts && ticket.resolution_notes && (
                      <p className="mt-1 text-[11px] text-orange-600 font-medium">{ticket.resolution_notes.replace(/^⚠️ Aguardando pecas: /, '')}</p>
                    )}
                    <p className="mt-1 text-[11px] text-blue-500">em andamento ha {elapsed(ticket.started_at ?? ticket.created_at)}</p>
                  </div>
                  <div className="shrink-0 flex flex-row sm:flex-col gap-2 sm:min-w-[140px]">
                    <button onClick={() => resolve(ticket)} className="flex-1 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-500 transition">
                      Resolver
                    </button>
                    <button onClick={() => cancel(ticket)} className="flex-1 rounded-xl bg-neutral-200 px-4 py-2 text-xs font-black text-neutral-700 hover:bg-neutral-300 transition">
                      Cancelar
                    </button>
                    <button
                      onClick={() => resendNotification(ticket)}
                      disabled={resendingId === ticket.id}
                      className="flex-1 rounded-xl bg-blue-100 px-4 py-2 text-xs font-black text-blue-700 hover:bg-blue-200 transition disabled:opacity-50"
                    >
                      {resendingId === ticket.id ? '...' : '📲 Reenviar'}
                    </button>
                    {canDirect && (
                      <button
                        onClick={() => recreateTelegramCard(ticket)}
                        disabled={recreatingCardId === ticket.id}
                        className="flex-1 rounded-xl bg-white px-4 py-2 text-xs font-black text-blue-700 ring-1 ring-blue-200 hover:bg-blue-50 transition disabled:opacity-50"
                      >
                        {recreatingCardId === ticket.id ? '...' : 'Card'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Vistoria picker for resolved tickets without inspection */}
      {tickets.filter(t => t.status === 'resolved' && !t.inspection_status).length > 0 && canDirect && (
        <section>
          <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-emerald-600">Resolvidos — solicitar vistoria</h3>
          <div className="space-y-2">
            {tickets.filter(t => t.status === 'resolved' && !t.inspection_status).map(ticket => (
              <div key={ticket.id} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-neutral-900">{ticket.title}</p>
                    {ticket.room_number && <span className="text-xs text-neutral-500">UH {ticket.room_number} · </span>}
                    {ticket.status_reason && <span className="text-xs text-neutral-500">Resolvido por {ticket.status_reason}</span>}
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {inspectingId === ticket.id ? (
                      <>
                        <select
                          value={inspectorTarget}
                          onChange={e => setInspectorTarget(e.target.value)}
                          className="rounded-xl border border-emerald-300 bg-white px-3 py-2 text-sm"
                        >
                          <option value="">Escolher vistoriador...</option>
                          {collaborators.filter(c => c.id !== profile.id).map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => { if (inspectorTarget) { requestInspection(ticket, inspectorTarget); setInspectingId(null); setInspectorTarget(''); } else toast.error('Escolha um vistoriador.'); }}
                          className="rounded-xl bg-purple-600 px-3 py-2 text-xs font-black text-white hover:bg-purple-500 transition"
                        >
                          Solicitar
                        </button>
                        <button onClick={() => { setInspectingId(null); setInspectorTarget(''); }} className="rounded-xl bg-neutral-200 px-3 py-2 text-xs font-black text-neutral-700 transition">
                          ✕
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => { setInspectingId(ticket.id); setInspectorTarget(''); }}
                        className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-black text-white hover:bg-purple-500 transition"
                      >
                        🔍 Solicitar Vistoria
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {pendingInspection.length > 0 && (
        <section>
          <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-purple-600">Aguardando vistoria</h3>
          <div className="space-y-3">
            {pendingInspection.map(ticket => {
              const inspector = collaborators.find(c => c.id === ticket.inspector_id);
              const canAct = canInspect();
              return (
                <div key={ticket.id} className="rounded-2xl border border-purple-200 bg-purple-50 p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-purple-100 text-purple-700 border border-purple-200 px-2 py-0.5 text-[10px] font-black uppercase">VISTORIA</span>
                        {ticket.room_number && <span className="rounded bg-neutral-900 text-white px-2 py-0.5 text-xs font-black">UH {ticket.room_number}</span>}
                        {!ticket.telegram_message_id && <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-black uppercase text-blue-700">Sem card</span>}
                      </div>
                      <p className="mt-2 font-black text-neutral-950">{ticket.title}</p>
                      {ticket.status_reason && <p className="mt-1 text-xs text-neutral-500">👷 Resolvido por: {ticket.status_reason}</p>}
                      {ticket.resolution_notes && <p className="mt-0.5 text-[11px] text-purple-600">📝 {ticket.resolution_notes}</p>}
                      {inspector && <p className="mt-0.5 text-xs font-bold text-purple-700">🔍 Vistoriador: {inspector.name}</p>}
                    </div>
                    {canAct && (
                      <div className="shrink-0 flex flex-row sm:flex-col gap-2 sm:min-w-[130px]">
                        <button onClick={() => approveInspection(ticket)} className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-500 transition">
                          ✅ Aprovar
                        </button>
                        <button onClick={() => rejectInspection(ticket)} className="flex-1 rounded-xl bg-red-500 px-3 py-2 text-xs font-black text-white hover:bg-red-400 transition">
                          ❌ Reprovar
                        </button>
                        <button
                          onClick={() => recreateTelegramCard(ticket)}
                          disabled={recreatingCardId === ticket.id}
                          className="flex-1 rounded-xl bg-white px-3 py-2 text-xs font-black text-blue-700 ring-1 ring-blue-200 hover:bg-blue-50 transition disabled:opacity-50"
                        >
                          {recreatingCardId === ticket.id ? '...' : 'Card'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {closed.length > 0 && (
        <section>
          <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-neutral-400">Encerrados recentes</h3>
          <div className="space-y-2">
            {closed.map(ticket => {
              const isCancelled = ticket.status === 'cancelled';
              const mins = !isCancelled ? resolutionMins(ticket) : null;
              return (
                <div key={ticket.id} className={`rounded-2xl border px-4 py-3 ${isCancelled ? 'border-neutral-300 bg-neutral-100' : 'border-neutral-200 bg-neutral-50'}`}>
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${isCancelled ? 'bg-neutral-200 text-neutral-700 border-neutral-300' : 'bg-emerald-100 text-emerald-700 border-emerald-200'}`}>
                          {isCancelled ? 'CANCELADO' : 'RESOLVIDO'}
                        </span>
                        {ticket.room_number && <span className="rounded bg-neutral-900 text-white px-2 py-0.5 text-xs font-black">UH {ticket.room_number}</span>}
                        {mins !== null && (
                          <span className="rounded-full bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 text-[10px] font-black">⏱ {fmtMins(mins)}</span>
                        )}
                        {ticket.rating !== null && ticket.rating !== undefined && (
                          <span className="rounded-full bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 text-[10px] font-black">⭐ {ticket.rating}/5</span>
                        )}
                      </div>
                      <p className="mt-1.5 text-sm font-bold text-neutral-700">{ticket.title}</p>
                      {ticket.status_reason && <p className="text-[11px] text-neutral-500">👷 {ticket.status_reason}</p>}
                      {ticket.resolution_notes && <p className="text-[11px] text-neutral-500">{isCancelled ? '🚫' : '📝'} {ticket.resolution_notes}</p>}
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => reopen(ticket)}
                        className="rounded-xl bg-neutral-200 px-3 py-1.5 text-[11px] font-black text-neutral-700 hover:bg-amber-200 hover:text-amber-800 transition"
                      >
                        🔄 Reabrir
                      </button>
                      <button
                        onClick={() => toggleNotifLogs(ticket.id)}
                        className="rounded-xl bg-neutral-100 px-3 py-1.5 text-[11px] font-black text-neutral-500 hover:bg-blue-100 hover:text-blue-700 transition"
                      >
                        {notifExpandedId === ticket.id ? '▲ Notif.' : '📋 Notif.'}
                      </button>
                    </div>
                  </div>
                  {notifExpandedId === ticket.id && (
                    <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2">Historico de notificacoes</p>
                      {(notifLogs[ticket.id] ?? []).length === 0 ? (
                        <p className="text-xs text-neutral-400">Nenhuma notificacao registrada.</p>
                      ) : (
                        <div className="space-y-1">
                          {notifLogs[ticket.id].map(log => (
                            <div key={log.id} className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="font-bold text-neutral-700">{log.recipient_name ?? log.channel}</span>
                              <span className={log.status === 'failed' ? 'text-red-600' : 'text-neutral-400'}>{log.event_type} · {log.status}</span>
                              <span className="text-neutral-400 shrink-0">{new Date(log.created_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {open.length === 0 && inProgress.length === 0 && (
        <div className="rounded-3xl border border-dashed border-neutral-200 bg-neutral-50 py-16 text-center text-sm font-bold text-neutral-400">
          Nenhum chamado ativo via QR ou Telegram.
        </div>
      )}
    </div>
  );
}

type BonusTicket = {
  id: string;
  status: string;
  status_reason: string | null;
  created_at: string;
  resolved_at: string | null;
  rating: number | null;
  inspection_status: string | null;
};

type BonusView = 'monthly' | 'weekly';

function printPerformanceReport(
  view: BonusView,
  grandTotal: number,
  monthlyData: {
    months: string[];
    monthLabels: string[];
    byPerson: Record<string, Record<string, number>>;
    people: string[];
    ratingsByPerson: Record<string, number[]>;
    tmrByPerson: Record<string, number | null>;
  },
  weeklyData: {
    weeks: string[];
    byPerson: Record<string, Record<string, number>>;
    people: string[];
  },
) {
  const year = new Date().getFullYear();
  const now = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  let tableHTML = '';

  if (view === 'monthly') {
    const headerCols = monthlyData.monthLabels
      .map(m => `<th style="padding:8px 10px;text-align:center;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;color:#737373;min-width:52px">${m}</th>`)
      .join('');

    const bodyRows = monthlyData.people.map((name, i) => {
      const total = Object.values(monthlyData.byPerson[name]).reduce((s: number, v: number) => s + v, 0);
      const ratings = monthlyData.ratingsByPerson[name] ?? [];
      const avgRating = ratings.length > 0 ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : null;
      const bg = i % 2 === 0 ? '#ffffff' : '#fafafa';
      const dataCols = monthlyData.months.map(m => {
        const count = monthlyData.byPerson[name][m] ?? 0;
        return count > 0
          ? `<td style="padding:8px 10px;text-align:center"><span style="display:inline-block;min-width:24px;border-radius:6px;background:#dcfce7;color:#166534;font-weight:900;font-size:11px;padding:2px 6px">${count}</span></td>`
          : `<td style="padding:8px 10px;text-align:center;color:#d4d4d4;font-size:11px">—</td>`;
      }).join('');
      const tmr = monthlyData.tmrByPerson[name];
      const tmrLabel = tmr !== null ? fmtMins(tmr) : '—';
      return `<tr style="background:${bg}">
        <td style="padding:8px 12px;font-weight:700;font-size:12px;color:#0a0a0a;border-right:1px solid #e5e5e5">${name}</td>
        ${dataCols}
        <td style="padding:8px 10px;text-align:center;font-weight:900;color:#15803d;font-size:14px">${total}</td>
        <td style="padding:8px 10px;text-align:center;font-weight:700;color:#2563eb;font-size:11px">${tmrLabel}</td>
        <td style="padding:8px 10px;text-align:center;font-weight:700;color:#d97706">${avgRating ? `★ ${avgRating}` : '—'}</td>
      </tr>`;
    }).join('');

    const totalRow = monthlyData.months.map(m => {
      const t = monthlyData.people.reduce((s, name) => s + (monthlyData.byPerson[name][m] ?? 0), 0);
      return `<td style="padding:8px 10px;text-align:center;font-weight:900;color:#404040">${t || '—'}</td>`;
    }).join('');

    tableHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="background:#f5f5f5;border-bottom:2px solid #e5e5e5">
            <th style="padding:10px 12px;text-align:left;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;color:#737373;min-width:140px;border-right:1px solid #e5e5e5">Técnico</th>
            ${headerCols}
            <th style="padding:10px 10px;text-align:center;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;color:#16a34a;min-width:56px">TOTAL</th>
            <th style="padding:10px 10px;text-align:center;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;color:#2563eb;min-width:72px">TMR</th>
            <th style="padding:10px 10px;text-align:center;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;color:#d97706;min-width:64px">Avaliação</th>
          </tr>
        </thead>
        <tbody>
          ${bodyRows}
          <tr style="background:#f5f5f5;border-top:2px solid #d4d4d4">
            <td style="padding:8px 12px;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;color:#737373;border-right:1px solid #e5e5e5">TOTAL</td>
            ${totalRow}
            <td style="padding:8px 10px;text-align:center;font-weight:900;color:#15803d;font-size:14px">${grandTotal}</td>
            <td style="padding:8px 10px"></td>
            <td style="padding:8px 10px"></td>
          </tr>
        </tbody>
      </table>`;
  } else {
    const headerCols = weeklyData.weeks
      .map(w => `<th style="padding:8px 8px;text-align:center;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.1em;color:#737373;min-width:44px">${w.replace(/\d{4}-/, '')}</th>`)
      .join('');

    const bodyRows = weeklyData.people.map((name, i) => {
      const total = weeklyData.weeks.reduce((s, w) => s + (weeklyData.byPerson[name]?.[w] ?? 0), 0);
      const bg = i % 2 === 0 ? '#ffffff' : '#fafafa';
      const dataCols = weeklyData.weeks.map(w => {
        const count = weeklyData.byPerson[name]?.[w] ?? 0;
        return count > 0
          ? `<td style="padding:8px 8px;text-align:center"><span style="display:inline-block;min-width:20px;border-radius:6px;background:#dcfce7;color:#166534;font-weight:900;font-size:11px;padding:2px 5px">${count}</span></td>`
          : `<td style="padding:8px 8px;text-align:center;color:#d4d4d4;font-size:11px">—</td>`;
      }).join('');
      return `<tr style="background:${bg}">
        <td style="padding:8px 12px;font-weight:700;font-size:12px;color:#0a0a0a;border-right:1px solid #e5e5e5">${name}</td>
        ${dataCols}
        <td style="padding:8px 10px;text-align:center;font-weight:900;color:#15803d;font-size:14px">${total}</td>
      </tr>`;
    }).join('');

    const weeklyGrandTotal = weeklyData.people.reduce((s, name) => s + weeklyData.weeks.reduce((ws, w) => ws + (weeklyData.byPerson[name]?.[w] ?? 0), 0), 0);
    const totalRow = weeklyData.weeks.map(w => {
      const t = weeklyData.people.reduce((s, name) => s + (weeklyData.byPerson[name]?.[w] ?? 0), 0);
      return `<td style="padding:8px 8px;text-align:center;font-weight:900;color:#404040">${t || '—'}</td>`;
    }).join('');

    tableHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="background:#f5f5f5;border-bottom:2px solid #e5e5e5">
            <th style="padding:10px 12px;text-align:left;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;color:#737373;min-width:140px;border-right:1px solid #e5e5e5">Técnico</th>
            ${headerCols}
            <th style="padding:10px 10px;text-align:center;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;color:#16a34a;min-width:56px">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${bodyRows}
          <tr style="background:#f5f5f5;border-top:2px solid #d4d4d4">
            <td style="padding:8px 12px;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;color:#737373;border-right:1px solid #e5e5e5">TOTAL</td>
            ${totalRow}
            <td style="padding:8px 10px;text-align:center;font-weight:900;color:#15803d;font-size:14px">${weeklyGrandTotal}</td>
          </tr>
        </tbody>
      </table>`;
  }

  const contentHTML = `
    <div style="font-family:system-ui,-apple-system,sans-serif;color:#0a0a0a;padding:0;margin:0">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #0a0a0a">
        <div>
          <p style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.28em;color:#d97706;margin:0 0 4px">Royal PMS Enterprise</p>
          <h1 style="font-size:20px;font-weight:900;color:#0a0a0a;margin:0 0 2px">Relatório de Desempenho — Manutenção</h1>
          <p style="font-size:11px;color:#737373;margin:0">${view === 'monthly' ? `Matriz mensal · ${year}` : `Últimas 12 semanas · ${year}`}</p>
        </div>
        <div style="text-align:right">
          <p style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.16em;color:#737373;margin:0">Emitido em</p>
          <p style="font-size:11px;font-weight:700;color:#0a0a0a;margin:2px 0 0">${now}</p>
          <p style="font-size:9px;color:#737373;margin:4px 0 0">${grandTotal} resoluções no ano</p>
        </div>
      </div>
      <div style="border:1px solid #e5e5e5;border-radius:8px;overflow:hidden">
        ${tableHTML}
      </div>
      <div style="margin-top:20px;padding-top:10px;border-top:1px solid #e5e5e5;display:flex;justify-content:space-between;align-items:center">
        <p style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.18em;color:#a3a3a3;margin:0">Base: chamados resolvidos e aprovados na vistoria · ${year}</p>
        <p style="font-size:9px;color:#d4d4d4;margin:0">Royal PMS Enterprise</p>
      </div>
    </div>`;

  const fullHTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Relatório de Desempenho — Manutenção ${year}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { padding: 24px; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #0a0a0a; }
    @page { size: A4 landscape; margin: 12mm; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>${contentHTML}</body>
</html>`;

  // Use an iframe — most reliable across desktop browsers, including Chrome/Safari.
  // For iOS Safari (which can route iframe.print() to the parent window), we fall back
  // to a DOM overlay technique using display:none/block (visibility-only fails on Safari).
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;

  if (!isIOS) {
    // Desktop: hidden iframe approach
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!doc) {
      iframe.remove();
      toast.error('Não foi possível abrir a janela de impressão.');
      return;
    }
    doc.open();
    doc.write(fullHTML);
    doc.close();

    const triggerPrint = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        console.error('Print failed:', e);
      }
      setTimeout(() => iframe.remove(), 2000);
    };

    // Wait for iframe to render the written content before printing
    if (iframe.contentWindow?.document.readyState === 'complete') {
      setTimeout(triggerPrint, 200);
    } else {
      iframe.onload = () => setTimeout(triggerPrint, 200);
      // Fallback in case onload never fires
      setTimeout(triggerPrint, 800);
    }
    return;
  }

  // iOS Safari: DOM overlay with display:none/block (visibility approach fails on iOS)
  const OVERLAY_ID = 'royal-perf-print-overlay';
  const STYLE_ID = 'royal-perf-print-style';
  document.getElementById(OVERLAY_ID)?.remove();
  document.getElementById(STYLE_ID)?.remove();

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${OVERLAY_ID} { display: none; }
    @page { size: A4 landscape; margin: 12mm; }
    @media print {
      html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
      body > *:not(#${OVERLAY_ID}) { display: none !important; }
      #${OVERLAY_ID} {
        display: block !important;
        position: static !important;
        width: 100% !important;
        padding: 0 !important;
        margin: 0 !important;
        background: #fff !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
    }
  `;

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.innerHTML = contentHTML;

  document.head.appendChild(style);
  document.body.appendChild(overlay);

  // Give the browser a tick to apply the styles before invoking print
  setTimeout(() => window.print(), 100);

  const cleanup = () => {
    document.getElementById(OVERLAY_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  setTimeout(cleanup, 60000);
}

function MaintenancePerformanceTab() {
  const [tickets, setTickets] = useState<BonusTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<BonusView>('monthly');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
    const { data, error } = await supabase
      .from('maintenance_tickets')
      .select('id,status,status_reason,created_at,resolved_at,rating,inspection_status')
      .eq('status', 'resolved')
      .gte('resolved_at', yearStart)
      .order('resolved_at', { ascending: false })
      .limit(2000);
    if (error) { toast.error('Erro: ' + error.message); setLoading(false); return; }
    setTickets((data ?? []) as BonusTicket[]);
    setLoading(false);
  }

  // ── Monthly bonus matrix ──────────────────────────────────────────────────
  const monthlyData = useMemo(() => {
    const monthSet = new Set<string>();
    const byPerson: Record<string, Record<string, number>> = {};
    const ratingsByPerson: Record<string, number[]> = {};

    for (const t of tickets) {
      const date = new Date(t.resolved_at ?? t.created_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthSet.add(key);
      const name = t.status_reason ?? 'Sem registro';
      if (!byPerson[name]) byPerson[name] = {};
      byPerson[name][key] = (byPerson[name][key] ?? 0) + 1;
      if (t.rating) {
        if (!ratingsByPerson[name]) ratingsByPerson[name] = [];
        ratingsByPerson[name].push(t.rating);
      }
    }

    const months = Array.from(monthSet).sort();
    const PT_MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const monthLabels = months.map(m => {
      const [y, mo] = m.split('-');
      return `${PT_MONTHS[Number(mo) - 1]}/${y.slice(2)}`;
    });

    const people = Object.keys(byPerson).sort((a, b) => {
      const ta = Object.values(byPerson[a]).reduce((s, v) => s + v, 0);
      const tb = Object.values(byPerson[b]).reduce((s, v) => s + v, 0);
      return tb - ta;
    });

    // TMR (tempo médio de resolução) por pessoa
    const tmrByPerson: Record<string, number | null> = {};
    for (const name of people) {
      const pts = tickets.filter(t => (t.status_reason ?? 'Sem registro') === name && t.resolved_at);
      const mins = pts.map(t => Math.round((new Date(t.resolved_at!).getTime() - new Date(t.created_at).getTime()) / 60_000));
      tmrByPerson[name] = mins.length > 0 ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : null;
    }

    return { months, monthLabels, byPerson, people, ratingsByPerson, tmrByPerson };
  }, [tickets]);

  // ── Weekly breakdown (current year by ISO week) ────────────────────────
  const weeklyData = useMemo(() => {
    function isoWeek(date: Date): string {
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
      return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
    }

    const weekSet = new Set<string>();
    const byPerson: Record<string, Record<string, number>> = {};

    for (const t of tickets) {
      const date = new Date(t.resolved_at ?? t.created_at);
      const wk = isoWeek(date);
      weekSet.add(wk);
      const name = t.status_reason ?? 'Sem registro';
      if (!byPerson[name]) byPerson[name] = {};
      byPerson[name][wk] = (byPerson[name][wk] ?? 0) + 1;
    }

    const weeks = Array.from(weekSet).sort().slice(-12); // last 12 weeks
    const people = Object.keys(byPerson).sort((a, b) => {
      const ta = Object.values(byPerson[a]).reduce((s, v) => s + v, 0);
      const tb = Object.values(byPerson[b]).reduce((s, v) => s + v, 0);
      return tb - ta;
    });

    return { weeks, byPerson, people };
  }, [tickets]);

  const grandTotal = tickets.length;

  if (loading) return <div className="rounded-3xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-400">Carregando relatorio...</div>;

  return (
    <div className="space-y-6">
      {/* Header + controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Relatorio de bonificacao</p>
          <p className="text-lg font-black text-neutral-900">{grandTotal} resolucoes em {new Date().getFullYear()}</p>
        </div>
        <div className="flex gap-2">
          <div className="flex max-w-full overflow-x-auto gap-2">
            {(['monthly', 'weekly'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`shrink-0 rounded-xl px-4 py-2 text-xs font-black transition ${view === v ? 'bg-neutral-950 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}
              >
                {v === 'monthly' ? 'Mensal' : 'Semanal'}
              </button>
            ))}
          </div>
          <button
            onClick={() => printPerformanceReport(view, grandTotal, monthlyData, weeklyData)}
            className="shrink-0 rounded-xl bg-amber-600 px-4 py-2 text-xs font-black text-white hover:bg-amber-500 transition"
          >
            🖨 Imprimir
          </button>
        </div>
      </div>

      {/* Monthly matrix */}
      {view === 'monthly' && (
        monthlyData.people.length > 0 ? (
          <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
            <table className="min-w-[500px] w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50">
                  <th className="sticky left-0 bg-neutral-50 px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-neutral-400 min-w-[140px]">Tecnico</th>
                  {monthlyData.monthLabels.map(m => (
                    <th key={m} className="px-3 py-3 text-center text-[10px] font-black uppercase tracking-widest text-neutral-400 min-w-[60px]">{m}</th>
                  ))}
                  <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-emerald-600 min-w-[60px]">TOTAL</th>
                  <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-blue-600 min-w-[80px]">TMR</th>
                  <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-amber-600 min-w-[70px]">Avaliacao</th>
                </tr>
              </thead>
              <tbody>
                {monthlyData.people.map((name, i) => {
                  const total = Object.values(monthlyData.byPerson[name]).reduce((s: number, v: number) => s + v, 0);
                  const ratings = monthlyData.ratingsByPerson[name] ?? [];
                  const avgRating = ratings.length > 0 ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : null;
                  const tmr = monthlyData.tmrByPerson[name];
                  return (
                    <tr key={name} className={i % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}>
                      <td className="sticky left-0 bg-inherit px-4 py-3 font-bold text-neutral-900 text-sm">{name}</td>
                      {monthlyData.months.map(m => {
                        const count = monthlyData.byPerson[name][m] ?? 0;
                        return (
                          <td key={m} className="px-3 py-3 text-center">
                            {count > 0 ? (
                              <span className="inline-block min-w-[28px] rounded-lg bg-emerald-100 text-emerald-800 font-black text-xs px-2 py-0.5">{count}</span>
                            ) : (
                              <span className="text-neutral-300 text-xs">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-center font-black text-emerald-700 text-base">{total}</td>
                      <td className="px-4 py-3 text-center font-bold text-blue-600 text-xs">{tmr !== null ? fmtMins(tmr) : '—'}</td>
                      <td className="px-4 py-3 text-center font-bold text-amber-600">{avgRating ? `⭐ ${avgRating}` : '—'}</td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-neutral-200 bg-neutral-100 font-black">
                  <td className="sticky left-0 bg-neutral-100 px-4 py-3 text-xs uppercase tracking-widest text-neutral-500">TOTAL</td>
                  {monthlyData.months.map(m => {
                    const total = monthlyData.people.reduce((s, name) => s + (monthlyData.byPerson[name][m] ?? 0), 0);
                    return <td key={m} className="px-3 py-3 text-center font-black text-neutral-700">{total || '—'}</td>;
                  })}
                  <td className="px-4 py-3 text-center font-black text-emerald-700 text-base">{grandTotal}</td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3" />
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-neutral-200 bg-neutral-50 py-16 text-center text-sm font-bold text-neutral-400">
            Nenhuma resolucao registrada neste ano.
          </div>
        )
      )}

      {/* Weekly matrix */}
      {view === 'weekly' && (
        weeklyData.people.length > 0 ? (
          <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
            <table className="min-w-[500px] w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50">
                  <th className="sticky left-0 bg-neutral-50 px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-neutral-400 min-w-[140px]">Tecnico</th>
                  {weeklyData.weeks.map(w => (
                    <th key={w} className="px-2 py-3 text-center text-[10px] font-black uppercase tracking-widest text-neutral-400 min-w-[52px]">{w.replace(/\d{4}-/, '')}</th>
                  ))}
                  <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-emerald-600 min-w-[60px]">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {weeklyData.people.map((name, i) => {
                  const total = weeklyData.weeks.reduce((s, w) => s + (weeklyData.byPerson[name]?.[w] ?? 0), 0);
                  return (
                    <tr key={name} className={i % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}>
                      <td className="sticky left-0 bg-inherit px-4 py-3 font-bold text-neutral-900 text-sm">{name}</td>
                      {weeklyData.weeks.map(w => {
                        const count = weeklyData.byPerson[name]?.[w] ?? 0;
                        return (
                          <td key={w} className="px-2 py-3 text-center">
                            {count > 0 ? (
                              <span className="inline-block min-w-[24px] rounded-lg bg-emerald-100 text-emerald-800 font-black text-xs px-1.5 py-0.5">{count}</span>
                            ) : (
                              <span className="text-neutral-300 text-xs">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-center font-black text-emerald-700 text-base">{total}</td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-neutral-200 bg-neutral-100 font-black">
                  <td className="sticky left-0 bg-neutral-100 px-4 py-3 text-xs uppercase tracking-widest text-neutral-500">TOTAL</td>
                  {weeklyData.weeks.map(w => {
                    const total = weeklyData.people.reduce((s, name) => s + (weeklyData.byPerson[name]?.[w] ?? 0), 0);
                    return <td key={w} className="px-2 py-3 text-center font-black text-neutral-700">{total || '—'}</td>;
                  })}
                  <td className="px-4 py-3 text-center font-black text-emerald-700 text-base">{weeklyData.people.reduce((s, name) => s + weeklyData.weeks.reduce((ws, w) => ws + (weeklyData.byPerson[name]?.[w] ?? 0), 0), 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-neutral-200 bg-neutral-50 py-16 text-center text-sm font-bold text-neutral-400">
            Nenhuma resolucao nas ultimas 12 semanas.
          </div>
        )
      )}

      <p className="text-center text-[10px] text-neutral-400 uppercase tracking-widest">
        Base: chamados resolvidos e aprovados na vistoria · {new Date().getFullYear()}
      </p>
    </div>
  );
}

export function FinanceBillingModuleDashboard({ profile }: { profile: UserProfile }) {
  return (
    <ModuleShell
      eyebrow="Modulo Financeiro/Faturamento"
      title="Faturamento, financeiro, fiscal e conciliacao"
      description="Um unico modo para faturas, documentos, baixa, extratos, rastreio financeiro, fiscal, AR e controles de pagamento."
      profile={profile}
      queueDepartment="finance"
      tabs={[
        { id: 'finance', label: 'Financeiro', icon: CreditCard, render: () => <AdminDashboard profile={profile} initialTab="finance" /> },
        { id: 'documents', label: 'Faturas e documentos', icon: FileText, render: () => <AdminDashboard profile={profile} initialTab="documents" /> },
        { id: 'tracking', label: 'Rastreio e cobranca', icon: ClipboardList, render: () => <AdminDashboard profile={profile} initialTab="tracking" /> },
        { id: 'fiscal', label: 'Fiscal/NFS-e', icon: ShieldCheck, render: () => <FiscalPanelDashboard profile={profile} /> },
      ]}
    />
  );
}

export function RestaurantModuleDashboard({ profile }: { profile: UserProfile }) {
  return (
    <ModuleShell
      eyebrow="Modulo Restaurante"
      title="POS, folio e lancamentos"
      description="Operacao do restaurante, consumo em quarto, venda direta, consulta/transferencia de folio e visao do calendario."
      profile={profile}
      queueDepartment="restaurant"
      tabs={[
        { id: 'pos', label: 'POS Restaurante', icon: Utensils, render: () => <POSDashboard profile={profile} /> },
      ]}
    />
  );
}

export function EventsModuleDashboard({ profile }: { profile: UserProfile }) {
  return (
    <ModuleShell
      eyebrow="Modulo Eventos"
      title="Eventos, O.S. e agenda"
      description="Eventos continuam em modulo proprio, mas o calendario e espelhado para todos os demais setores."
      profile={profile}
      queueDepartment="events"
      tabs={[
        { id: 'events', label: 'Eventos', icon: Hotel, render: () => <EventsDashboard profile={profile} /> },
      ]}
    />
  );
}

export function AdminControlModuleDashboard({ profile }: { profile: UserProfile }) {
  return (
    <ModuleShell
      eyebrow="Modulo Admin"
      title="Controle geral do PMS"
      description="Admin controla tudo: usuarios, permissoes, empresas e auditoria."
      profile={profile}
      queueDepartment="admin"
      adminQueue
      tabs={[
        { id: 'companies', label: 'Empresas', icon: Building2, render: () => <AdminDashboard profile={profile} initialTab="companies" /> },
        { id: 'staff', label: 'Equipe e acesso', icon: Settings, render: () => <AdminDashboard profile={profile} initialTab="registration" /> },
        { id: 'audit', label: 'Auditoria', icon: ShieldCheck, render: () => <AuditDashboard profile={profile} /> },
      ]}
    />
  );
}


function ModuleShell<T extends string>({
  eyebrow,
  title,
  description,
  tabs,
  profile,
  queueDepartment,
  adminQueue = false,
  hideTopQueue = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  tabs: Array<ModuleTab<T>>;
  profile: UserProfile;
  queueDepartment: OperationalDepartment;
  adminQueue?: boolean;
  hideTopQueue?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<T>(tabs[0].id);
  const active = tabs.find((tab) => tab.id === activeTab) || tabs[0];

  return (
    <div className={moduleShellClass}>
      <div className="rounded-[2rem] border border-neutral-200 bg-white p-4 sm:p-6 shadow-sm">
        <p className="text-[10px] sm:text-xs font-black uppercase tracking-[0.28em] text-amber-600">{eyebrow}</p>
        <h1 className="mt-2 text-2xl sm:text-3xl font-black tracking-tight text-neutral-950">{title}</h1>
        <p className="mt-2 max-w-4xl text-xs sm:text-sm leading-6 sm:leading-7 text-neutral-500">{description}</p>
      </div>

      <SharedHotelCalendar compact />
      {!hideTopQueue && <OperationalWorkQueue profile={profile} department={queueDepartment} adminView={adminQueue} />}

      <div className="flex gap-2 overflow-x-auto rounded-3xl border border-neutral-200 bg-white p-2 shadow-sm">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const selected = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-2xl px-3 py-2 md:px-4 md:py-3 text-xs font-black transition ${
                selected ? 'bg-neutral-950 text-white' : 'bg-neutral-50 text-neutral-500 hover:bg-neutral-100'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {active.render()}
    </div>
  );
}
