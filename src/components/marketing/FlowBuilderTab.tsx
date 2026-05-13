import { useEffect, useState } from 'react';
import { Plus, Trash2, Loader2, ToggleLeft, ToggleRight, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MarketingFlow {
  id: string;
  name: string;
  trigger_type: 'first_message' | 'keyword' | 'no_reply' | 'reservation_event' | 'manual';
  channel: 'whatsapp' | 'instagram' | 'facebook' | 'all';
  status: 'active' | 'inactive';
  steps: unknown[];
  created_at: string;
}

const TRIGGER_LABELS: Record<MarketingFlow['trigger_type'], string> = {
  first_message: 'Primeira mensagem',
  keyword: 'Palavra-chave',
  no_reply: 'Sem resposta',
  reservation_event: 'Evento de reserva',
  manual: 'Manual',
};

const CHANNEL_LABELS: Record<MarketingFlow['channel'], string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  facebook: 'Facebook',
  all: 'Todos os canais',
};

// ─── Skeleton ────────────────────────────────────────────────────────────────

function FlowSkeleton() {
  return (
    <div className="rounded-3xl border border-neutral-200 bg-white overflow-hidden shadow-sm animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className={`flex items-center gap-4 p-4 sm:p-5 ${i < 3 ? 'border-b border-neutral-100' : ''}`}>
          <div className="w-2 h-10 rounded-full bg-neutral-200 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-neutral-200 rounded w-2/5" />
            <div className="h-2.5 bg-neutral-100 rounded w-1/3" />
          </div>
          <div className="hidden sm:flex gap-4">
            <div className="h-5 w-14 bg-neutral-100 rounded-full" />
            <div className="h-5 w-10 bg-neutral-100 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── New flow inline form ─────────────────────────────────────────────────────

interface NewFlowFormProps {
  onCancel: () => void;
  onCreated: (flow: MarketingFlow) => void;
}

function NewFlowForm({ onCancel, onCreated }: NewFlowFormProps) {
  const [name, setName] = useState('');
  const [triggerType, setTriggerType] = useState<MarketingFlow['trigger_type']>('first_message');
  const [channel, setChannel] = useState<MarketingFlow['channel']>('whatsapp');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from('marketing_flows')
      .insert({ name: name.trim(), trigger_type: triggerType, channel, steps: [], status: 'inactive' })
      .select()
      .single();

    setSaving(false);
    if (error) {
      toast.error('Erro ao criar flow: ' + error.message);
      return;
    }
    toast.success('Flow criado com sucesso');
    onCreated(data as MarketingFlow);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-3xl border border-neutral-200 bg-white p-4 sm:p-6 shadow-sm space-y-4"
    >
      <p className="text-sm font-black text-neutral-900">Novo Flow</p>

      <div className="space-y-3">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">
            Nome
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Saudação Inicial"
            className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">
              Trigger
            </label>
            <select
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value as MarketingFlow['trigger_type'])}
              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              {(Object.keys(TRIGGER_LABELS) as MarketingFlow['trigger_type'][]).map((t) => (
                <option key={t} value={t}>{TRIGGER_LABELS[t]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-1">
              Canal
            </label>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as MarketingFlow['channel'])}
              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              {(Object.keys(CHANNEL_LABELS) as MarketingFlow['channel'][]).map((c) => (
                <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-xl text-sm font-bold text-neutral-600 hover:bg-neutral-100 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-900 text-white text-sm font-bold hover:bg-neutral-800 disabled:opacity-50 transition-colors"
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Criar flow
        </button>
      </div>
    </form>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FlowBuilderTab() {
  const [flows, setFlows] = useState<MarketingFlow[]>([]);
  const [execCounts, setExecCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // ── Fetch flows ────────────────────────────────────────────────────────────

  async function fetchFlows() {
    setLoading(true);
    const { data, error } = await supabase
      .from('marketing_flows')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Erro ao carregar flows');
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as MarketingFlow[];
    setFlows(rows);

    // Fetch execution counts in parallel
    if (rows.length > 0) {
      const counts: Record<string, number> = {};
      await Promise.all(
        rows.map(async (f) => {
          const { count } = await supabase
            .from('marketing_flow_executions')
            .select('id', { count: 'exact', head: true })
            .eq('flow_id', f.id);
          counts[f.id] = count ?? 0;
        }),
      );
      setExecCounts(counts);
    }

    setLoading(false);
  }

  useEffect(() => {
    fetchFlows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Toggle status ──────────────────────────────────────────────────────────

  async function toggleStatus(flow: MarketingFlow) {
    const next = flow.status === 'active' ? 'inactive' : 'active';
    setToggling(flow.id);
    const { error } = await supabase
      .from('marketing_flows')
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq('id', flow.id);

    setToggling(null);
    if (error) {
      toast.error('Erro ao atualizar status: ' + error.message);
      return;
    }
    setFlows((prev) =>
      prev.map((f) => (f.id === flow.id ? { ...f, status: next } : f)),
    );
    toast.success(next === 'active' ? 'Flow ativado' : 'Flow desativado');
  }

  // ── Delete flow ────────────────────────────────────────────────────────────

  async function deleteFlow(flow: MarketingFlow) {
    if (!confirm(`Excluir o flow "${flow.name}"? Esta ação não pode ser desfeita.`)) return;
    setDeleting(flow.id);
    const { error } = await supabase.from('marketing_flows').delete().eq('id', flow.id);
    setDeleting(null);
    if (error) {
      toast.error('Erro ao excluir flow: ' + error.message);
      return;
    }
    setFlows((prev) => prev.filter((f) => f.id !== flow.id));
    toast.success('Flow excluído');
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-600">Automações</p>
          <h2 className="text-xl font-black text-neutral-950">Flow Builder</h2>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-900 text-white text-sm font-bold hover:bg-neutral-800 transition-colors"
        >
          <Plus className="w-4 h-4" /> Novo flow
        </button>
      </div>

      {/* Inline creation form */}
      {showForm && (
        <NewFlowForm
          onCancel={() => setShowForm(false)}
          onCreated={(flow) => {
            setFlows((prev) => [flow, ...prev]);
            setExecCounts((prev) => ({ ...prev, [flow.id]: 0 }));
            setShowForm(false);
          }}
        />
      )}

      {/* Loading skeleton */}
      {loading && <FlowSkeleton />}

      {/* Empty state */}
      {!loading && flows.length === 0 && (
        <div className="rounded-3xl border border-dashed border-neutral-200 bg-neutral-50 p-10 flex flex-col items-center gap-3">
          <Zap className="w-8 h-8 text-neutral-300" />
          <p className="text-sm font-bold text-neutral-500">Nenhum flow criado ainda</p>
          <p className="text-xs text-neutral-400 text-center max-w-xs">
            Clique em "Novo flow" para criar seu primeiro fluxo de automação.
          </p>
        </div>
      )}

      {/* Flow list */}
      {!loading && flows.length > 0 && (
        <div className="rounded-3xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
          {flows.map((flow, idx) => (
            <div
              key={flow.id}
              className={`flex items-center gap-3 sm:gap-4 p-4 sm:p-5 ${idx < flows.length - 1 ? 'border-b border-neutral-100' : ''}`}
            >
              {/* Status indicator bar */}
              <div
                className={`w-2 h-10 rounded-full shrink-0 ${flow.status === 'active' ? 'bg-emerald-400' : 'bg-neutral-200'}`}
              />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-neutral-900 truncate">{flow.name}</p>
                <p className="text-xs text-neutral-500 truncate">
                  {TRIGGER_LABELS[flow.trigger_type]} · {CHANNEL_LABELS[flow.channel]}
                </p>
              </div>

              {/* Stats + badges (hidden on small screens) */}
              <div className="hidden sm:flex items-center gap-5 shrink-0">
                <div className="text-center">
                  <p className="font-black text-sm text-neutral-900">{flow.steps?.length ?? 0}</p>
                  <p className="text-[10px] text-neutral-400">Passos</p>
                </div>
                <div className="text-center">
                  <p className="font-black text-sm text-neutral-900">{execCounts[flow.id] ?? 0}</p>
                  <p className="text-[10px] text-neutral-400">Execuções</p>
                </div>
                <span
                  className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                    flow.status === 'active'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-neutral-100 text-neutral-500'
                  }`}
                >
                  {flow.status === 'active' ? 'Ativo' : 'Inativo'}
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                {/* Toggle */}
                <button
                  onClick={() => toggleStatus(flow)}
                  disabled={toggling === flow.id}
                  title={flow.status === 'active' ? 'Desativar' : 'Ativar'}
                  className="p-2 rounded-xl hover:bg-neutral-100 transition-colors disabled:opacity-40"
                >
                  {toggling === flow.id ? (
                    <Loader2 className="w-4 h-4 text-neutral-400 animate-spin" />
                  ) : flow.status === 'active' ? (
                    <ToggleRight className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <ToggleLeft className="w-4 h-4 text-neutral-400" />
                  )}
                </button>

                {/* Delete */}
                <button
                  onClick={() => deleteFlow(flow)}
                  disabled={deleting === flow.id}
                  title="Excluir flow"
                  className="p-2 rounded-xl hover:bg-red-50 text-neutral-300 hover:text-red-500 transition-colors disabled:opacity-40"
                >
                  {deleting === flow.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
