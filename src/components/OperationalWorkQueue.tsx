import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Send, UsersRound } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../supabase';
import { sendNotification } from '../lib/audit';
import { UserProfile, UserRole } from '../types';

type Collaborator = Pick<UserProfile, 'id' | 'name' | 'role'>;

const ROLES_BY_DEPARTMENT: Record<OperationalDepartment, UserRole[]> = {
  reservations: ['reservations'],
  reception: ['reception'],
  maintenance: ['maintenance'],
  finance: ['finance', 'faturamento'],
  restaurant: ['restaurant'],
  events: ['eventos'],
  housekeeping: ['housekeeping'],
  admin: ['admin', 'manager'],
};

export type OperationalDepartment =
  | 'reservations'
  | 'reception'
  | 'maintenance'
  | 'finance'
  | 'restaurant'
  | 'events'
  | 'housekeeping'
  | 'admin';

type OperationalTask = {
  id: string;
  title: string;
  description?: string;
  origin_department: OperationalDepartment;
  target_department: OperationalDepartment;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'waiting_other_department' | 'done' | 'cancelled';
  due_at?: string;
  assigned_to?: string;
  related_type?: string;
  related_id?: string;
  related_label?: string;
  last_note?: string;
  created_at: string;
};

type TaskHistory = {
  id: string;
  task_id: string;
  action: string;
  note?: string;
  created_at: string;
};

const departmentLabels: Record<OperationalDepartment, string> = {
  reservations: 'Reservas',
  reception: 'Recepcao',
  maintenance: 'Manutencao',
  finance: 'Financeiro',
  restaurant: 'Restaurante',
  events: 'Eventos',
  housekeeping: 'Governanca',
  admin: 'Admin',
};

const departmentOptions: OperationalDepartment[] = ['reservations', 'reception', 'maintenance', 'finance', 'restaurant', 'events', 'housekeeping', 'admin'];

const priorityColor: Record<OperationalTask['priority'], string> = {
  low: 'bg-neutral-100 text-neutral-600',
  medium: 'bg-amber-50 text-amber-700',
  high: 'bg-orange-50 text-orange-700',
  urgent: 'bg-red-50 text-red-700',
};

export default function OperationalWorkQueue({
  profile,
  department,
  adminView = false,
}: {
  profile: UserProfile;
  department: OperationalDepartment;
  adminView?: boolean;
}) {
  const [tasks, setTasks] = useState<OperationalTask[]>([]);
  const [history, setHistory] = useState<TaskHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [tab, setTab] = useState<'active' | 'in_progress' | 'history'>('active');
  const [noteByTask, setNoteByTask] = useState<Record<string, string>>({});
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [directingTaskId, setDirectingTaskId] = useState<string | null>(null);
  const [directTargetId, setDirectTargetId] = useState<string>('');
  const MAX_ACTIVE_PER_USER = 2;
  const canDirect = profile.role === 'admin' || profile.role === 'manager';
  const canSeeTeam = canDirect || adminView;
  const [inProgressView, setInProgressView] = useState<'mine' | 'team'>(canSeeTeam ? 'team' : 'mine');
  const [form, setForm] = useState({
    title: '',
    description: '',
    target_department: department,
    priority: 'medium' as OperationalTask['priority'],
    due_at: '',
    related_label: '',
  });

  useEffect(() => {
    fetchQueue();
  }, [department, adminView]);

  useEffect(() => {
    if (!canDirect) return;
    loadCollaborators();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canDirect, department]);

  async function loadCollaborators() {
    const deptRoles = ROLES_BY_DEPARTMENT[department] || [];
    const allowedRoles = Array.from(new Set<UserRole>([...deptRoles, 'manager', 'admin']));
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, role')
      .in('role', allowedRoles)
      .order('name', { ascending: true });
    if (error) {
      console.error('Erro ao carregar colaboradores:', error.message);
      return;
    }
    setCollaborators((data || []) as Collaborator[]);
  }

  async function fetchQueue() {
    setLoading(true);
    let query = supabase
      .from('operational_tasks')
      .select('*')
      .order('due_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(adminView ? 120 : 60);

    if (!adminView) {
      query = query.or(`target_department.eq.${department},origin_department.eq.${department}`);
    }

    const { data, error } = await query;
    if (error) {
      toast.error('Erro ao carregar fila operacional: ' + error.message);
      setLoading(false);
      return;
    }

    const rows = (data || []) as OperationalTask[];
    setTasks(rows);

    if (rows.length > 0) {
      const { data: historyRows } = await supabase
        .from('operational_task_history')
        .select('*')
        .in('task_id', rows.map((task) => task.id))
        .order('created_at', { ascending: false })
        .limit(80);
      if (historyRows) setHistory(historyRows as TaskHistory[]);
    } else {
      setHistory([]);
    }
    setLoading(false);
  }

  const metrics = useMemo(() => {
    const active = tasks.filter((task) => !['done', 'cancelled'].includes(task.status));
    const critical = active.filter((task) => task.priority === 'high' || task.priority === 'urgent');
    const waiting = active.filter((task) => task.status === 'waiting_other_department');
    const overdue = active.filter((task) => task.due_at && new Date(task.due_at) < new Date());
    return { active: active.length, critical: critical.length, waiting: waiting.length, overdue: overdue.length };
  }, [tasks]);

  const myActiveCount = useMemo(
    () => tasks.filter((task) => task.assigned_to === profile.id && task.status === 'in_progress').length,
    [tasks, profile.id],
  );

  async function createTask(event: FormEvent) {
    event.preventDefault();
    if (!form.title.trim()) return;
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      origin_department: department,
      target_department: form.target_department,
      priority: form.priority,
      status: 'open',
      due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
      related_type: 'other',
      related_label: form.related_label.trim() || null,
      created_by: profile.id,
    };
    const { data, error } = await supabase.from('operational_tasks').insert([payload]).select().single();
    if (error) {
      toast.error('Erro ao criar tarefa: ' + error.message);
      return;
    }
    await addHistory(data.id, 'created', `Criada por ${departmentLabels[department]}`);
    toast.success('Tarefa operacional criada.');
    setForm({ title: '', description: '', target_department: department, priority: 'medium', due_at: '', related_label: '' });
    setShowCreate(false);
    fetchQueue();
  }

  async function updateTask(task: OperationalTask, status: OperationalTask['status']) {
    const note = noteByTask[task.id]?.trim();

    if (status === 'in_progress') {
      const alreadyMineInProgress = task.assigned_to === profile.id && task.status === 'in_progress';
      if (!alreadyMineInProgress && myActiveCount >= MAX_ACTIVE_PER_USER) {
        toast.error(`Limite atingido: voce ja tem ${MAX_ACTIVE_PER_USER} demandas em andamento. Conclua ou libere uma antes de assumir outra.`);
        return;
      }
    }

    if (status === 'waiting_other_department' && !note) {
      toast.error('Justificativa obrigatoria: descreva o que esta esperando (material, informacao, outro setor).');
      return;
    }

    if (status === 'cancelled' && !note) {
      toast.error('Justificativa obrigatoria para cancelar: explique o motivo.');
      return;
    }

    const updates: Record<string, unknown> = {
      status,
      last_note: note || task.last_note || null,
    };
    if (status === 'in_progress') {
      updates.assigned_to = profile.id;
    }

    const { error } = await supabase
      .from('operational_tasks')
      .update(updates)
      .eq('id', task.id);
    if (error) {
      toast.error('Erro ao atualizar tarefa: ' + error.message);
      return;
    }
    await addHistory(task.id, status, note || `Status alterado para ${status}`);
    setNoteByTask((current) => ({ ...current, [task.id]: '' }));
    toast.success('Fila operacional atualizada.');
    fetchQueue();
  }

  async function addHistory(taskId: string, action: string, note?: string) {
    await supabase.from('operational_task_history').insert([{ task_id: taskId, user_id: profile.id, action, note }]);
  }

  async function directTask(task: OperationalTask) {
    if (!canDirect) return;
    if (!directTargetId) {
      toast.error('Selecione um colaborador para direcionar.');
      return;
    }

    const targetActiveCount = tasks.filter(
      (item) => item.assigned_to === directTargetId && item.status === 'in_progress',
    ).length;
    if (targetActiveCount >= MAX_ACTIVE_PER_USER) {
      toast.error(`O colaborador escolhido ja possui ${MAX_ACTIVE_PER_USER} demandas em andamento.`);
      return;
    }

    const collaborator = collaborators.find((item) => item.id === directTargetId);
    const note = noteByTask[task.id]?.trim();

    const { error } = await supabase
      .from('operational_tasks')
      .update({
        status: 'in_progress',
        assigned_to: directTargetId,
        last_note: note || task.last_note || null,
      })
      .eq('id', task.id);
    if (error) {
      toast.error('Erro ao direcionar tarefa: ' + error.message);
      return;
    }

    await addHistory(
      task.id,
      'directed',
      `Direcionada para ${collaborator?.name || directTargetId} por ${profile.name}${note ? ` - ${note}` : ''}`,
    );

    await sendNotification({
      user_id: directTargetId,
      title: 'Novo chamado direcionado',
      message: `${profile.name} direcionou para voce o chamado: ${task.title}${note ? ` - ${note}` : ''}`,
    });

    setNoteByTask((current) => ({ ...current, [task.id]: '' }));
    setDirectingTaskId(null);
    setDirectTargetId('');
    toast.success(`Chamado direcionado para ${collaborator?.name || 'colaborador'}.`);
    fetchQueue();
  }

  const scopedTasks = tasks.filter((task) => adminView || task.target_department === department || task.origin_department === department);
  const teamInProgressTasks = scopedTasks.filter(
    (task) => task.status === 'in_progress' || task.status === 'waiting_other_department',
  );
  const myInProgressTasks = teamInProgressTasks.filter((task) => task.assigned_to === profile.id);
  const myInProgressIds = new Set(myInProgressTasks.map((task) => task.id));
  const activeTasks = scopedTasks.filter(
    (task) => !['done', 'cancelled'].includes(task.status) && !myInProgressIds.has(task.id) && !task.assigned_to,
  );
  const historyTasks = scopedTasks.filter((task) => ['done', 'cancelled'].includes(task.status));

  const inProgressTabTasks = canSeeTeam && inProgressView === 'team' ? teamInProgressTasks : myInProgressTasks;
  const visibleTasks = tab === 'active' ? activeTasks : tab === 'in_progress' ? inProgressTabTasks : historyTasks;

  const inProgressGroups = useMemo(() => {
    if (!(canSeeTeam && inProgressView === 'team')) return null;
    const groups = new Map<string, { collaborator: Collaborator | null; assigneeId: string | null; tasks: OperationalTask[] }>();
    for (const task of teamInProgressTasks) {
      const key = task.assigned_to || 'unassigned';
      if (!groups.has(key)) {
        const collaborator = task.assigned_to
          ? collaborators.find((collab) => collab.id === task.assigned_to) || null
          : null;
        groups.set(key, { collaborator, assigneeId: task.assigned_to || null, tasks: [] });
      }
      groups.get(key)!.tasks.push(task);
    }
    return Array.from(groups.values()).sort((a, b) =>
      (a.collaborator?.name || 'Sem responsavel').localeCompare(b.collaborator?.name || 'Sem responsavel'),
    );
  }, [canSeeTeam, inProgressView, teamInProgressTasks, collaborators]);

  return (
    <div className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-600">Work Queue</p>
          <h3 className="mt-1 text-xl font-black text-neutral-950">
            {adminView ? 'Centro de Controle Operacional' : `Fila de ${departmentLabels[department]}`}
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-neutral-500">
            Pendencias, alertas, responsaveis, SLA e handoff entre setores. O objetivo e o trabalho chegar no setor certo antes de virar WhatsApp.
          </p>
        </div>
        <button onClick={() => setShowCreate((value) => !value)} className="rounded-2xl bg-neutral-950 px-5 py-3 text-sm font-black text-white">
          Nova tarefa
        </button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <QueueMetric icon={UsersRound} label="Ativas" value={String(metrics.active)} />
        <QueueMetric icon={AlertTriangle} label="Criticas" value={String(metrics.critical)} danger={metrics.critical > 0} />
        <QueueMetric icon={Send} label="Aguardando setor" value={String(metrics.waiting)} />
        <QueueMetric icon={Clock} label="SLA vencido" value={String(metrics.overdue)} danger={metrics.overdue > 0} />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-2xl border border-neutral-200 bg-neutral-50 p-1">
          <button
            onClick={() => setTab('active')}
            className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest transition ${tab === 'active' ? 'bg-neutral-950 text-white' : 'text-neutral-500'}`}
          >
            Ativas ({activeTasks.length})
          </button>
          <button
            onClick={() => setTab('in_progress')}
            className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest transition ${tab === 'in_progress' ? 'bg-neutral-950 text-white' : 'text-neutral-500'}`}
          >
            Em andamento ({canSeeTeam && inProgressView === 'team' ? teamInProgressTasks.length : myInProgressTasks.length})
          </button>
          <button
            onClick={() => setTab('history')}
            className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest transition ${tab === 'history' ? 'bg-neutral-950 text-white' : 'text-neutral-500'}`}
          >
            Historico ({historyTasks.length})
          </button>
        </div>
        <p className={`text-xs font-black uppercase tracking-widest ${myActiveCount >= MAX_ACTIVE_PER_USER ? 'text-red-700' : 'text-neutral-500'}`}>
          Minhas em andamento: {myActiveCount}/{MAX_ACTIVE_PER_USER}
        </p>
      </div>

      {showCreate && (
        <form onSubmit={createTask} className="mt-5 grid gap-3 rounded-3xl border border-neutral-200 bg-neutral-50 p-4 md:grid-cols-2">
          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm" placeholder="Titulo da pendencia" />
          <select value={form.target_department} onChange={(event) => setForm({ ...form, target_department: event.target.value as OperationalDepartment })} className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm">
            {departmentOptions.map((option) => <option key={option} value={option}>{departmentLabels[option]}</option>)}
          </select>
          <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as OperationalTask['priority'] })} className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm">
            <option value="low">Baixa</option>
            <option value="medium">Media</option>
            <option value="high">Alta</option>
            <option value="urgent">Urgente</option>
          </select>
          <input type="datetime-local" value={form.due_at} onChange={(event) => setForm({ ...form, due_at: event.target.value })} className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm" />
          <input value={form.related_label} onChange={(event) => setForm({ ...form, related_label: event.target.value })} className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm" placeholder="Vinculo: reserva, UH, evento, fatura..." />
          <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm md:col-span-2" rows={3} placeholder="Contexto e proxima acao esperada" />
          <button className="rounded-2xl bg-amber-700 px-5 py-3 text-sm font-black text-white md:col-span-2">Criar e enviar para o setor</button>
        </form>
      )}

      {tab === 'in_progress' && canSeeTeam ? (
        <div className="mt-4 inline-flex rounded-2xl border border-neutral-200 bg-neutral-50 p-1">
          <button
            onClick={() => setInProgressView('mine')}
            className={`rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition ${inProgressView === 'mine' ? 'bg-amber-700 text-white' : 'text-neutral-500'}`}
          >
            Minhas ({myInProgressTasks.length})
          </button>
          <button
            onClick={() => setInProgressView('team')}
            className={`rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition ${inProgressView === 'team' ? 'bg-amber-700 text-white' : 'text-neutral-500'}`}
          >
            Equipe ({teamInProgressTasks.length})
          </button>
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {loading ? (
          <div className="rounded-2xl bg-neutral-50 p-5 text-sm font-bold text-neutral-400">Carregando filas...</div>
        ) : visibleTasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-8 text-center text-sm font-bold text-neutral-400">
            {tab === 'active'
              ? 'Nenhuma pendencia operacional para este modulo.'
              : tab === 'in_progress'
                ? canSeeTeam && inProgressView === 'team'
                  ? 'Nenhum chamado em andamento na equipe.'
                  : 'Voce ainda nao assumiu nenhum chamado. Va em "Ativas" para assumir.'
                : 'Nenhuma tarefa concluida ou cancelada no historico.'}
          </div>
        ) : tab === 'in_progress' && inProgressGroups ? (
          inProgressGroups.map((group) => (
            <div key={group.assigneeId || 'unassigned'} className="rounded-3xl border border-neutral-200 bg-white p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between px-2">
                <p className="text-xs font-black uppercase tracking-widest text-neutral-700">
                  {group.collaborator?.name || 'Sem responsavel'}
                  {group.collaborator?.role ? <span className="ml-2 text-neutral-400">({group.collaborator.role})</span> : null}
                </p>
                <p className={`text-[10px] font-black uppercase tracking-widest ${group.tasks.filter((t) => t.status === 'in_progress').length >= MAX_ACTIVE_PER_USER ? 'text-red-700' : 'text-neutral-500'}`}>
                  {group.tasks.filter((t) => t.status === 'in_progress').length}/{MAX_ACTIVE_PER_USER} em andamento
                  {group.tasks.filter((t) => t.status === 'waiting_other_department').length > 0
                    ? ` - ${group.tasks.filter((t) => t.status === 'waiting_other_department').length} aguardando`
                    : ''}
                </p>
              </div>
              <div className="space-y-3">
                {group.tasks.map(renderTaskCard)}
              </div>
            </div>
          ))
        ) : (
          visibleTasks.map(renderTaskCard)
        )}
      </div>
    </div>
  );

  function renderTaskCard(task: OperationalTask) {
          const latestHistory = history.find((item) => item.task_id === task.id);
          const overdue = task.due_at && new Date(task.due_at) < new Date() && !['done', 'cancelled'].includes(task.status);
          const isClosed = ['done', 'cancelled'].includes(task.status);
          const alreadyMine = task.assigned_to === profile.id && task.status === 'in_progress';
          const assumeBlocked = !alreadyMine && myActiveCount >= MAX_ACTIVE_PER_USER;
          const assignedToOther = task.assigned_to && task.assigned_to !== profile.id;
          return (
            <div key={task.id} className={`rounded-3xl border p-4 ${overdue ? 'border-red-200 bg-red-50/70' : 'border-neutral-200 bg-neutral-50'}`}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${priorityColor[task.priority]}`}>{task.priority}</span>
                    <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black uppercase text-neutral-500">{task.status}</span>
                    <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black uppercase text-neutral-500">
                      {departmentLabels[task.origin_department]} {'->'} {departmentLabels[task.target_department]}
                    </span>
                    {task.status === 'waiting_other_department' && (
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black uppercase text-amber-800">Aguardando material/info</span>
                    )}
                    {assignedToOther && !isClosed && (
                      <span className="rounded-full bg-neutral-200 px-2 py-1 text-[10px] font-black uppercase text-neutral-700">Assumida por outro</span>
                    )}
                  </div>
                  <p className="mt-3 text-lg font-black text-neutral-950">{task.title}</p>
                  <p className="mt-1 text-sm leading-6 text-neutral-500">{task.description || 'Sem descricao.'}</p>
                  <p className="mt-2 text-xs font-bold uppercase tracking-widest text-neutral-400">
                    {task.related_label || 'Sem vinculo'} {task.due_at ? `- SLA ${new Date(task.due_at).toLocaleString('pt-BR')}` : ''}
                  </p>
                  {latestHistory ? <p className="mt-2 text-xs text-neutral-400">Ultimo historico: {latestHistory.action} - {latestHistory.note || 'sem nota'}</p> : null}
                </div>
                {isClosed ? null : (
                  <div className="min-w-[280px] space-y-2">
                    <input value={noteByTask[task.id] || ''} onChange={(event) => setNoteByTask((current) => ({ ...current, [task.id]: event.target.value }))} className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm" placeholder="Nota/justificativa" />
                    {tab === 'active' ? (
                      directingTaskId === task.id ? (
                        <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-2">
                          <p className="text-[10px] font-black uppercase tracking-widest text-amber-800">Direcionar para colaborador</p>
                          <select
                            value={directTargetId}
                            onChange={(event) => setDirectTargetId(event.target.value)}
                            className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm"
                          >
                            <option value="">Escolher colaborador...</option>
                            {collaborators
                              .filter((collab) => collab.id !== profile.id)
                              .map((collab) => {
                                const count = tasks.filter((item) => item.assigned_to === collab.id && item.status === 'in_progress').length;
                                return (
                                  <option key={collab.id} value={collab.id} disabled={count >= MAX_ACTIVE_PER_USER}>
                                    {collab.name} ({collab.role}) - {count}/{MAX_ACTIVE_PER_USER}
                                  </option>
                                );
                              })}
                          </select>
                          <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => directTask(task)} className="rounded-xl bg-amber-700 px-3 py-2 text-xs font-black text-white">Confirmar</button>
                            <button
                              onClick={() => {
                                setDirectingTaskId(null);
                                setDirectTargetId('');
                              }}
                              className="rounded-xl bg-neutral-300 px-3 py-2 text-xs font-black text-neutral-700"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => updateTask(task, 'in_progress')}
                            disabled={assumeBlocked}
                            title={assumeBlocked ? `Limite de ${MAX_ACTIVE_PER_USER} demandas em andamento atingido` : undefined}
                            className={`rounded-xl px-3 py-2 text-xs font-black text-white ${assumeBlocked ? 'cursor-not-allowed bg-neutral-300' : 'bg-blue-950'}`}
                          >
                            Assumir
                          </button>
                          {canDirect ? (
                            <button
                              onClick={() => {
                                setDirectingTaskId(task.id);
                                setDirectTargetId('');
                              }}
                              className="rounded-xl bg-amber-700 px-3 py-2 text-xs font-black text-white"
                            >
                              Direcionar
                            </button>
                          ) : null}
                          <button onClick={() => updateTask(task, 'cancelled')} className={`rounded-xl bg-neutral-500 px-3 py-2 text-xs font-black text-white ${canDirect ? 'col-span-2' : ''}`}>Cancelar (req. justif.)</button>
                        </div>
                      )
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => updateTask(task, 'done')} className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black text-white">Concluir</button>
                        {task.status === 'waiting_other_department' ? (
                          <button onClick={() => updateTask(task, 'in_progress')} className="rounded-xl bg-blue-950 px-3 py-2 text-xs font-black text-white">Retomar</button>
                        ) : (
                          <button
                            onClick={() => updateTask(task, 'waiting_other_department')}
                            title="Requer justificativa na nota"
                            className="rounded-xl bg-amber-700 px-3 py-2 text-xs font-black text-white"
                          >
                            Solicitar material/info
                          </button>
                        )}
                        <button onClick={() => updateTask(task, 'cancelled')} className="col-span-2 rounded-xl bg-neutral-500 px-3 py-2 text-xs font-black text-white">Cancelar (req. justificativa)</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
  }
}

function QueueMetric({ icon: Icon, label, value, danger = false }: { icon: typeof Clock; label: string; value: string; danger?: boolean }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${danger ? 'border-red-200 bg-red-50' : 'border-neutral-200 bg-neutral-50'}`}>
      <div className="flex items-center justify-between">
        <Icon className={`h-5 w-5 ${danger ? 'text-red-700' : 'text-amber-700'}`} />
        <p className="text-xl font-black text-neutral-950">{value}</p>
      </div>
      <p className="mt-2 text-[10px] font-black uppercase tracking-[0.18em] text-neutral-400">{label}</p>
    </div>
  );
}
