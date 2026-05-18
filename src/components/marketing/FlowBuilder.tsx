import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Handle,
  Position,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toast } from 'sonner';
import {
  Plus, Zap, MessageSquare, Settings, ArrowLeft, Save, RefreshCw, Play, Pause, Edit3, Trash2,
} from 'lucide-react';
import { supabase } from '../../supabase';

type FlowStatus = 'draft' | 'active' | 'paused';
type TriggerType = 'keyword' | 'event' | 'schedule' | 'manual';

type FlowRow = {
  id: string;
  name: string;
  description: string | null;
  trigger_type: TriggerType;
  trigger_config?: { keyword?: string };
  status: FlowStatus;
  nodes: Node[];
  edges: Edge[];
  updated_at: string;
};

type NodeVariant = 'trigger' | 'message' | 'action';

const NODE_PALETTE: Array<{ type: NodeVariant; label: string; icon: typeof Zap; color: string; description: string }> = [
  { type: 'trigger', label: 'Gatilho', icon: Zap, color: 'text-amber-600', description: 'Inicia o fluxo' },
  { type: 'message', label: 'Mensagem', icon: MessageSquare, color: 'text-blue-600', description: 'Envia texto' },
  { type: 'action', label: 'Acao', icon: Settings, color: 'text-emerald-600', description: 'Tag ou status' },
];

function FlowNode({ data, selected }: NodeProps) {
  const variant = (data as { variant?: NodeVariant }).variant ?? 'trigger';
  const label = (data as { label?: string }).label ?? '';
  const subtitle = (data as { subtitle?: string }).subtitle ?? '';

  const styles = {
    trigger: { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700', icon: Zap },
    message: { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700', icon: MessageSquare },
    action: { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-700', icon: Settings },
  } as const;
  const s = styles[variant] ?? styles.trigger;
  const Icon = s.icon;

  return (
    <div className={`min-w-[180px] rounded-xl ${s.bg} border-2 ${selected ? 'border-neutral-900' : s.border} shadow-sm`}>
      {variant !== 'trigger' && <Handle type="target" position={Position.Top} className="!bg-neutral-400 !w-2 !h-2" />}
      <div className="px-3 py-2.5 flex items-center gap-2">
        <Icon className={`w-4 h-4 shrink-0 ${s.text}`} />
        <div className="min-w-0">
          <p className={`text-[10px] font-semibold uppercase tracking-wide ${s.text}`}>{label || variant}</p>
          {subtitle && <p className="text-xs text-neutral-700 truncate max-w-[180px]">{subtitle}</p>}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-neutral-400 !w-2 !h-2" />
    </div>
  );
}

const nodeTypes = { flow: FlowNode };

function FlowList({ onOpen, onCreate }: { onOpen: (id: string) => void; onCreate: () => void }) {
  const [flows, setFlows] = useState<FlowRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      const { data, error } = await supabase
        .from('marketing_flows')
        .select('*')
        .order('updated_at', { ascending: false });
      if (!alive) return;
      if (error) toast.error('Falha ao carregar fluxos');
      else if (data) setFlows(data as FlowRow[]);
      setLoading(false);
    }
    load();
    const ch = supabase
      .channel('marketing_flows_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketing_flows' }, () => load())
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, []);

  async function toggleStatus(flow: FlowRow) {
    const next = flow.status === 'active' ? 'paused' : 'active';
    const { error } = await supabase.from('marketing_flows').update({ status: next }).eq('id', flow.id);
    if (error) toast.error('Falha ao alterar status');
    else toast.success(next === 'active' ? 'Fluxo ativado' : 'Fluxo pausado');
  }

  async function deleteFlow(flow: FlowRow) {
    if (!confirm(`Excluir o fluxo "${flow.name}"?`)) return;
    const { error } = await supabase.from('marketing_flows').delete().eq('id', flow.id);
    if (error) toast.error('Falha ao excluir');
    else toast.success('Fluxo excluido');
  }

  const statusMap = {
    active: { label: 'Ativo', cls: 'bg-emerald-100 text-emerald-700' },
    paused: { label: 'Pausado', cls: 'bg-amber-100 text-amber-700' },
    draft: { label: 'Rascunho', cls: 'bg-neutral-100 text-neutral-600' },
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-600">Automacoes</p>
          <h2 className="text-xl sm:text-2xl font-semibold text-neutral-950">Fluxos de automacao</h2>
        </div>
        <button onClick={onCreate} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-800 transition-colors">
          <Plus className="w-4 h-4" /> Novo fluxo
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 rounded-2xl border border-dashed border-neutral-200">
          <RefreshCw className="w-8 h-8 text-neutral-300 mx-auto mb-3 animate-spin" />
          <p className="text-sm text-neutral-400">Carregando fluxos...</p>
        </div>
      ) : flows.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-dashed border-neutral-200">
          <Zap className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
          <p className="font-semibold text-neutral-500">Nenhum fluxo criado ainda</p>
          <p className="text-xs text-neutral-400 mt-1 mb-4">Crie automacoes visuais que respondem aos seus contatos.</p>
          <button onClick={onCreate} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700">
            <Plus className="w-4 h-4" /> Criar primeiro fluxo
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
          {flows.map((flow, idx) => (
            <div key={flow.id} className={`flex items-center gap-4 p-4 sm:p-5 ${idx < flows.length - 1 ? 'border-b border-neutral-100' : ''}`}>
              <div className={`w-2 h-10 rounded-full shrink-0 ${flow.status === 'active' ? 'bg-emerald-400' : flow.status === 'paused' ? 'bg-amber-400' : 'bg-neutral-200'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <p className="font-semibold text-sm text-neutral-900 truncate">{flow.name}</p>
                  <span className={`text-[9px] font-semibold uppercase px-2 py-0.5 rounded-full ${statusMap[flow.status].cls}`}>{statusMap[flow.status].label}</span>
                </div>
                <p className="text-xs text-neutral-500">Trigger: {flow.trigger_type} - {Array.isArray(flow.nodes) ? flow.nodes.length : 0} nos</p>
              </div>
              <button onClick={() => toggleStatus(flow)} className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-500" title={flow.status === 'active' ? 'Pausar' : 'Ativar'}>
                {flow.status === 'active' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <button onClick={() => onOpen(flow.id)} className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-500" title="Editar">
                <Edit3 className="w-4 h-4" />
              </button>
              <button onClick={() => deleteFlow(flow)} className="p-2 rounded-lg hover:bg-red-50 hover:text-red-600 text-neutral-400" title="Excluir">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FlowCanvas({ flowId, onClose }: { flowId: string | 'new'; onClose: () => void }) {
  const [name, setName] = useState('Novo fluxo');
  const [triggerType, setTriggerType] = useState<TriggerType>('manual');
  const [status, setStatus] = useState<FlowStatus>('draft');
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(flowId !== 'new');
  const [saving, setSaving] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(flowId === 'new' ? null : flowId);

  useEffect(() => {
    if (flowId === 'new') {
      setStatus('draft');
      setNodes([{
        id: 'trigger-1',
        type: 'flow',
        position: { x: 250, y: 50 },
        data: { variant: 'trigger', label: 'Gatilho', subtitle: 'palavra-chave' },
      }]);
      setLoading(false);
      return;
    }
    let alive = true;
    async function load() {
      const { data, error } = await supabase.from('marketing_flows').select('*').eq('id', flowId).maybeSingle();
      if (!alive) return;
      if (error || !data) { toast.error('Fluxo nao encontrado'); onClose(); return; }
      const row = data as FlowRow;
      setName(row.name);
      setTriggerType(row.trigger_type);
      setStatus(row.status ?? 'draft');
      setNodes(Array.isArray(row.nodes) ? row.nodes : []);
      setEdges(Array.isArray(row.edges) ? row.edges : []);
      setLoading(false);
    }
    load();
    return () => { alive = false; };
  }, [flowId, onClose]);

  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes(ns => applyNodeChanges(changes, ns)), []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges(es => applyEdgeChanges(changes, es)), []);
  const onConnect = useCallback((connection: Connection) => setEdges(es => addEdge({ ...connection, animated: true }, es)), []);

  function addNode(variant: NodeVariant) {
    const id = `${variant}-${Date.now()}`;
    const yOffset = 80 + nodes.length * 110;
    const newNode: Node = {
      id,
      type: 'flow',
      position: { x: 250 + (Math.random() - 0.5) * 200, y: yOffset },
      data: {
        variant,
        label: variant === 'trigger' ? 'Gatilho' : variant === 'message' ? 'Mensagem' : 'Acao',
        subtitle: variant === 'message' ? 'Mensagem automatica' : variant === 'action' ? 'tag: interessado' : 'palavra-chave',
      },
    };
    setNodes(ns => [...ns, newNode]);
  }

  function editNode(node: Node) {
    const current = (node.data as { subtitle?: string }).subtitle ?? '';
    const variant = (node.data as { variant?: NodeVariant }).variant ?? 'trigger';
    const help = variant === 'trigger'
      ? 'Palavra-chave do gatilho:'
      : variant === 'action'
        ? 'Acao: use "status: needs_human" ou "tag: nome-da-tag"'
        : 'Mensagem automatica:';
    const next = prompt(help, current);
    if (next == null) return;
    setNodes(ns => ns.map(n => n.id === node.id ? { ...n, data: { ...n.data, subtitle: next } } : n));
  }

  const triggerKeyword = useMemo(() => {
    const triggerNode = nodes.find(n => (n.data as { variant?: NodeVariant }).variant === 'trigger');
    return String((triggerNode?.data as { subtitle?: string } | undefined)?.subtitle ?? '').trim();
  }, [nodes]);

  async function save() {
    if (!name.trim()) { toast.error('De um nome ao fluxo'); return; }
    if (triggerType === 'keyword' && !triggerKeyword) { toast.error('Informe a palavra-chave no no de gatilho'); return; }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        trigger_type: triggerType,
        trigger_config: triggerType === 'keyword' ? { keyword: triggerKeyword } : {},
        nodes,
        edges,
        status,
      };
      if (currentId) {
        const { error } = await supabase.from('marketing_flows').update(payload).eq('id', currentId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('marketing_flows').insert([payload]).select().single();
        if (error) throw error;
        if (data) setCurrentId(data.id);
      }
      toast.success('Fluxo salvo');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  }

  const memoizedNodeTypes = useMemo(() => nodeTypes, []);

  if (loading) {
    return (
      <div className="text-center py-16">
        <RefreshCw className="w-8 h-8 text-neutral-300 mx-auto mb-3 animate-spin" />
        <p className="text-sm text-neutral-400">Carregando fluxo...</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <button onClick={onClose} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-100">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do fluxo" className="flex-1 min-w-0 px-3 py-2 bg-white rounded-lg text-sm font-semibold border border-neutral-200 focus:ring-2 focus:ring-amber-500 outline-none" />
        <select value={triggerType} onChange={e => setTriggerType(e.target.value as TriggerType)} className="px-3 py-2 bg-white rounded-lg text-sm border border-neutral-200 focus:ring-2 focus:ring-amber-500 outline-none">
          <option value="manual">Manual</option>
          <option value="keyword">Palavra-chave</option>
          <option value="event">Evento</option>
          <option value="schedule">Agendado</option>
        </select>
        <select value={status} onChange={e => setStatus(e.target.value as FlowStatus)} className="px-3 py-2 bg-white rounded-lg text-sm border border-neutral-200 focus:ring-2 focus:ring-amber-500 outline-none">
          <option value="draft">Rascunho</option>
          <option value="active">Ativo</option>
          <option value="paused">Pausado</option>
        </select>
        <button onClick={save} disabled={saving} className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-800 disabled:opacity-50">
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 h-[68vh] min-h-[520px]">
        <div className="lg:w-48 shrink-0 bg-white rounded-2xl border border-neutral-200 p-3 space-y-2 overflow-x-auto lg:overflow-visible">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 px-2 mb-1">Adicionar no</p>
          <div className="flex lg:block gap-2 lg:space-y-2">
            {NODE_PALETTE.map(p => {
              const Icon = p.icon;
              return (
                <button
                  key={p.type}
                  onClick={() => addNode(p.type)}
                  className="shrink-0 lg:w-full flex items-start gap-2 px-2.5 py-2 rounded-lg text-left hover:bg-neutral-50 border border-transparent hover:border-neutral-200"
                >
                  <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${p.color}`} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-neutral-900">{p.label}</p>
                    <p className="text-[10px] text-neutral-500">{p.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="pt-2 mt-2 border-t border-neutral-200">
            <p className="text-[10px] text-neutral-400 px-2">Duplo clique num no para editar o conteudo.</p>
          </div>
        </div>

        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-neutral-200 overflow-hidden">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDoubleClick={(_, node) => editNode(node)}
            nodeTypes={memoizedNodeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} color="#e5e5e5" />
            <Controls position="bottom-right" />
            <MiniMap pannable zoomable nodeColor={(n) => {
              const v = (n.data as { variant?: NodeVariant }).variant;
              return v === 'message' ? '#3b82f6' : v === 'action' ? '#10b981' : '#f59e0b';
            }} />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}

export default function FlowBuilder() {
  const [mode, setMode] = useState<'list' | { editing: string | 'new' }>('list');

  if (mode === 'list') {
    return (
      <FlowList
        onCreate={() => setMode({ editing: 'new' })}
        onOpen={(id) => setMode({ editing: id })}
      />
    );
  }
  return <FlowCanvas flowId={mode.editing} onClose={() => setMode('list')} />;
}
