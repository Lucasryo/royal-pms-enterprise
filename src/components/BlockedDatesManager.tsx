import { FormEvent, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Ban, CalendarRange, CheckCircle2, Loader2, Pencil, Plus, Power, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../supabase';
import { UserProfile } from '../types';

type Category = 'executivo' | 'master' | 'suite presidencial';

type BlockedDate = {
  id: string;
  category: Category | null;
  start_date: string;
  end_date: string;
  reason: string | null;
  active: boolean;
  created_at: string;
};

const CATEGORY_LABELS: Record<Category, string> = {
  executivo: 'Executivo',
  master: 'Master',
  'suite presidencial': 'Suite presidencial',
};

const formatDateBR = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR');

const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = () => ({
  id: '',
  category: '' as Category | '',
  start_date: today(),
  end_date: today(),
  reason: '',
  active: true,
});

type FormState = ReturnType<typeof emptyForm>;

export default function BlockedDatesManager({ profile }: { profile: UserProfile }) {
  const [blocks, setBlocks] = useState<BlockedDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('active');

  const canManage = profile.role === 'admin' || profile.role === 'reservations' || profile.role === 'manager';

  useEffect(() => {
    fetchBlocks();
  }, []);

  async function fetchBlocks() {
    setLoading(true);
    const { data, error } = await supabase
      .from('booking_blocked_dates')
      .select('*')
      .order('start_date', { ascending: false });
    if (error) {
      toast.error('Erro ao carregar bloqueios: ' + error.message);
      setLoading(false);
      return;
    }
    setBlocks((data || []) as BlockedDate[]);
    setLoading(false);
  }

  function startCreate() {
    setForm(emptyForm());
    setShowForm(true);
  }

  function startEdit(block: BlockedDate) {
    setForm({
      id: block.id,
      category: block.category ?? '',
      start_date: block.start_date,
      end_date: block.end_date,
      reason: block.reason ?? '',
      active: block.active,
    });
    setShowForm(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    if (form.end_date < form.start_date) {
      toast.error('Data final deve ser maior ou igual a inicial.');
      return;
    }
    const payload = {
      category: form.category === '' ? null : form.category,
      start_date: form.start_date,
      end_date: form.end_date,
      reason: form.reason.trim() || null,
      active: form.active,
    };

    if (form.id) {
      const { error } = await supabase.from('booking_blocked_dates').update(payload).eq('id', form.id);
      if (error) {
        toast.error('Erro ao atualizar: ' + error.message);
        return;
      }
      toast.success('Bloqueio atualizado.');
    } else {
      const { error } = await supabase
        .from('booking_blocked_dates')
        .insert([{ ...payload, created_by: profile.id }]);
      if (error) {
        toast.error('Erro ao criar: ' + error.message);
        return;
      }
      toast.success('Bloqueio criado. As datas aparecerao como fechadas no calendario de reservas.');
    }
    setShowForm(false);
    setForm(emptyForm());
    fetchBlocks();
  }

  async function toggleActive(block: BlockedDate) {
    const { error } = await supabase
      .from('booking_blocked_dates')
      .update({ active: !block.active })
      .eq('id', block.id);
    if (error) {
      toast.error('Erro: ' + error.message);
      return;
    }
    toast.success(block.active ? 'Bloqueio desativado.' : 'Bloqueio ativado.');
    fetchBlocks();
  }

  async function removeBlock(block: BlockedDate) {
    const label = block.category ? CATEGORY_LABELS[block.category] : 'Todas as categorias';
    if (!confirm(`Excluir bloqueio de ${formatDateBR(block.start_date)} a ${formatDateBR(block.end_date)} (${label})?`)) return;
    const { error } = await supabase.from('booking_blocked_dates').delete().eq('id', block.id);
    if (error) {
      toast.error('Erro: ' + error.message);
      return;
    }
    toast.success('Bloqueio excluido.');
    fetchBlocks();
  }

  const filtered = useMemo(() => {
    return blocks.filter((b) => {
      if (filterStatus === 'active' && !b.active) return false;
      if (filterStatus === 'inactive' && b.active) return false;
      return true;
    });
  }, [blocks, filterStatus]);

  return (
    <div className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-red-600">Bloqueio de datas</p>
          <h3 className="mt-1 text-xl font-black text-neutral-950">Fechar motor de reservas por periodo</h3>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-neutral-500">
            Bloqueie datas especificas no motor de reservas direta — ideal para reveillon, eventos esgotados ou
            manutencao. As datas bloqueadas aparecem como <strong>fechado</strong> no calendario do cliente e
            nenhuma nova reserva publica e aceita para esse periodo.
          </p>
        </div>
        {canManage && (
          <button
            onClick={startCreate}
            className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-neutral-950 px-5 py-3 text-sm font-black text-white"
          >
            <Plus className="h-4 w-4" />
            Novo bloqueio
          </button>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as 'all' | 'active' | 'inactive')}
          className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-bold"
        >
          <option value="all">Todos os status</option>
          <option value="active">Apenas ativos</option>
          <option value="inactive">Apenas inativos</option>
        </select>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mt-5 grid gap-3 rounded-3xl border border-red-200 bg-red-50/40 p-5 lg:grid-cols-12"
        >
          <div className="lg:col-span-4">
            <Label>Categoria (vazio = todas)</Label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as Category | '' })}
              className="mt-2 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm"
            >
              <option value="">Todas as categorias</option>
              <option value="executivo">Executivo</option>
              <option value="master">Master</option>
              <option value="suite presidencial">Suite presidencial</option>
            </select>
          </div>
          <div className="lg:col-span-3">
            <Label>Data inicio</Label>
            <input
              required
              type="date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              className="mt-2 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm"
            />
          </div>
          <div className="lg:col-span-3">
            <Label>Data fim</Label>
            <input
              required
              type="date"
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              className="mt-2 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm"
            />
          </div>
          <div className="lg:col-span-2 flex items-end">
            <label className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-stone-900">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="h-4 w-4 accent-red-700"
              />
              Ativo
            </label>
          </div>

          <div className="lg:col-span-12">
            <Label>Motivo (aparece no tooltip para o cliente)</Label>
            <input
              type="text"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="Ex: Reveillon — lotacao maxima atingida"
              className="mt-2 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm"
            />
          </div>

          <div className="lg:col-span-12 flex flex-wrap gap-3">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-2xl bg-red-700 px-5 py-3 text-sm font-black text-white"
            >
              <CheckCircle2 className="h-4 w-4" />
              {form.id ? 'Salvar alteracoes' : 'Criar bloqueio'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setForm(emptyForm());
              }}
              className="inline-flex items-center gap-2 rounded-2xl bg-neutral-200 px-5 py-3 text-sm font-black text-neutral-700"
            >
              <X className="h-4 w-4" />
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="mt-6">
        {loading ? (
          <div className="flex items-center gap-2 rounded-2xl bg-neutral-50 p-6 text-sm font-bold text-neutral-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando bloqueios...
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-8 text-center text-sm font-bold text-neutral-400">
            Nenhum bloqueio cadastrado.
            {filterStatus !== 'all' && (
              <button
                onClick={() => setFilterStatus('all')}
                className="mt-2 block w-full text-xs text-neutral-500 underline"
              >
                Ver todos
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-neutral-200">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-[10px] font-black uppercase tracking-widest text-neutral-500">
                <tr>
                  <th className="px-4 py-3 text-left">Periodo</th>
                  <th className="px-4 py-3 text-left">Categoria</th>
                  <th className="px-4 py-3 text-left">Motivo</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <tr key={b.id} className="border-t border-neutral-100">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 font-bold text-neutral-900">
                        <CalendarRange className="h-3.5 w-3.5 shrink-0 text-red-600" />
                        <span>
                          {formatDateBR(b.start_date)}
                          {b.start_date !== b.end_date && ` → ${formatDateBR(b.end_date)}`}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-neutral-600">
                      {b.category ? (
                        CATEGORY_LABELS[b.category]
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-red-700">
                          <Ban className="h-3 w-3" />
                          Todas
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{b.reason || <span className="text-neutral-400">—</span>}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${
                          b.active ? 'bg-red-100 text-red-800' : 'bg-neutral-200 text-neutral-600'
                        }`}
                      >
                        {b.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canManage && (
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => toggleActive(b)}
                            title={b.active ? 'Desativar' : 'Ativar'}
                            className="rounded-lg p-1.5 text-neutral-600 hover:bg-neutral-100"
                          >
                            <Power className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => startEdit(b)}
                            title="Editar"
                            className="rounded-lg p-1.5 text-blue-700 hover:bg-blue-50"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => removeBlock(b)}
                            title="Excluir"
                            className="rounded-lg p-1.5 text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!canManage && (
        <p className="mt-5 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
          Voce esta em modo somente-leitura. Apenas admin, manager ou reservas podem gerenciar bloqueios.
        </p>
      )}
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <label className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">{children}</label>;
}
