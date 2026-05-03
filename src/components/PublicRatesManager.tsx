import { FormEvent, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CalendarRange, CheckCircle2, Loader2, Pencil, Plus, Power, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../supabase';
import { UserProfile } from '../types';

type Category = 'executivo' | 'master' | 'suite presidencial';

type PublicRate = {
  id: string;
  category: Category;
  label: string;
  start_date: string;
  end_date: string;
  weekday_rate: number;
  weekend_rate: number | null;
  guests_included: number;
  extra_guest_fee: number;
  min_nights: number;
  active: boolean;
  priority: number;
  description: string | null;
  created_at: string;
  updated_at: string;
};

const CATEGORY_LABELS: Record<Category, string> = {
  executivo: 'Executivo',
  master: 'Master',
  'suite presidencial': 'Suite presidencial',
};

const formatBRL = (n: number | null | undefined) => {
  if (n == null) return '—';
  return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const formatDateBR = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR');

const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = () => ({
  id: '' as string,
  category: 'executivo' as Category,
  label: '',
  start_date: today(),
  end_date: today(),
  weekday_rate: 350,
  weekend_rate: '' as string | number,
  guests_included: 2,
  extra_guest_fee: 0,
  min_nights: 1,
  priority: 0,
  description: '',
  active: true,
});

type FormState = ReturnType<typeof emptyForm>;

export default function PublicRatesManager({ profile }: { profile: UserProfile }) {
  const [rates, setRates] = useState<PublicRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [filterCategory, setFilterCategory] = useState<'all' | Category>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');

  const canManage = profile.role === 'admin' || profile.role === 'reservations' || profile.role === 'manager';

  useEffect(() => {
    fetchRates();
  }, []);

  async function fetchRates() {
    setLoading(true);
    const { data, error } = await supabase
      .from('public_rates')
      .select('*')
      .order('category', { ascending: true })
      .order('priority', { ascending: false })
      .order('start_date', { ascending: false });
    if (error) {
      toast.error('Erro ao carregar tarifas: ' + error.message);
      setLoading(false);
      return;
    }
    setRates((data || []) as PublicRate[]);
    setLoading(false);
  }

  function startCreate() {
    setForm(emptyForm());
    setShowForm(true);
  }

  function startEdit(rate: PublicRate) {
    setForm({
      id: rate.id,
      category: rate.category,
      label: rate.label,
      start_date: rate.start_date,
      end_date: rate.end_date,
      weekday_rate: Number(rate.weekday_rate),
      weekend_rate: rate.weekend_rate == null ? '' : Number(rate.weekend_rate),
      guests_included: rate.guests_included,
      extra_guest_fee: Number(rate.extra_guest_fee),
      min_nights: rate.min_nights,
      priority: rate.priority,
      description: rate.description || '',
      active: rate.active,
    });
    setShowForm(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    if (!form.label.trim()) {
      toast.error('Informe um rotulo (ex: Padrao, Alta temporada, Carnaval).');
      return;
    }
    if (form.end_date < form.start_date) {
      toast.error('Data final deve ser maior ou igual a inicial.');
      return;
    }
    const payload = {
      category: form.category,
      label: form.label.trim(),
      start_date: form.start_date,
      end_date: form.end_date,
      weekday_rate: Number(form.weekday_rate) || 0,
      weekend_rate:
        form.weekend_rate === '' || form.weekend_rate == null ? null : Number(form.weekend_rate),
      guests_included: Math.max(1, Number(form.guests_included) || 1),
      extra_guest_fee: Math.max(0, Number(form.extra_guest_fee) || 0),
      min_nights: Math.max(1, Number(form.min_nights) || 1),
      priority: Number(form.priority) || 0,
      description: form.description.trim() || null,
      active: form.active,
    };

    if (form.id) {
      const { error } = await supabase.from('public_rates').update(payload).eq('id', form.id);
      if (error) {
        toast.error('Erro ao atualizar: ' + error.message);
        return;
      }
      toast.success('Tarifa atualizada.');
    } else {
      const { error } = await supabase.from('public_rates').insert([{ ...payload, created_by: profile.id }]);
      if (error) {
        toast.error('Erro ao criar: ' + error.message);
        return;
      }
      toast.success('Tarifa criada.');
    }
    setShowForm(false);
    setForm(emptyForm());
    fetchRates();
  }

  async function toggleActive(rate: PublicRate) {
    const { error } = await supabase.from('public_rates').update({ active: !rate.active }).eq('id', rate.id);
    if (error) {
      toast.error('Erro: ' + error.message);
      return;
    }
    toast.success(rate.active ? 'Tarifa desativada.' : 'Tarifa ativada.');
    fetchRates();
  }

  async function removeRate(rate: PublicRate) {
    if (!confirm(`Excluir tarifa "${rate.label}" (${CATEGORY_LABELS[rate.category]})?`)) return;
    const { error } = await supabase.from('public_rates').delete().eq('id', rate.id);
    if (error) {
      toast.error('Erro: ' + error.message);
      return;
    }
    toast.success('Tarifa excluida.');
    fetchRates();
  }

  const filtered = useMemo(() => {
    return rates.filter((r) => {
      if (filterCategory !== 'all' && r.category !== filterCategory) return false;
      if (filterStatus === 'active' && !r.active) return false;
      if (filterStatus === 'inactive' && r.active) return false;
      return true;
    });
  }, [rates, filterCategory, filterStatus]);

  const groups = useMemo(() => {
    const map = new Map<Category, PublicRate[]>();
    for (const r of filtered) {
      const list = map.get(r.category) || [];
      list.push(r);
      map.set(r.category, list);
    }
    return map;
  }, [filtered]);

  return (
    <div className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-600">Tarifas publicas</p>
          <h3 className="mt-1 text-xl font-black text-neutral-950">Motor de reservas — preco direto na landing</h3>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-neutral-500">
            Defina diaria por categoria, periodo, fim de semana e hospedes incluidos. O preco aparece para o
            cliente automaticamente no formulario de reserva publica.
          </p>
        </div>
        {canManage && (
          <button
            onClick={startCreate}
            className="inline-flex items-center gap-2 rounded-2xl bg-neutral-950 px-5 py-3 text-sm font-black text-white"
          >
            <Plus className="h-4 w-4" />
            Nova tarifa
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="mt-5 flex flex-wrap gap-2">
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value as 'all' | Category)}
          className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-bold"
        >
          <option value="all">Todas as categorias</option>
          <option value="executivo">Executivo</option>
          <option value="master">Master</option>
          <option value="suite presidencial">Suite presidencial</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as 'all' | 'active' | 'inactive')}
          className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-bold"
        >
          <option value="all">Todos os status</option>
          <option value="active">Apenas ativas</option>
          <option value="inactive">Apenas inativas</option>
        </select>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mt-5 grid gap-3 rounded-3xl border border-amber-200 bg-amber-50/50 p-5 lg:grid-cols-12">
          <div className="lg:col-span-3">
            <Label>Categoria</Label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
              className="mt-2 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm"
            >
              <option value="executivo">Executivo</option>
              <option value="master">Master</option>
              <option value="suite presidencial">Suite presidencial</option>
            </select>
          </div>
          <div className="lg:col-span-4">
            <Label>Rotulo da tarifa</Label>
            <input
              required
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Padrao, Alta temporada, Carnaval, Reveillon..."
              className="mt-2 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm"
            />
          </div>
          <div className="lg:col-span-2">
            <Label>Prioridade</Label>
            <input
              type="number"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
              className="mt-2 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm"
            />
          </div>
          <div className="lg:col-span-3 flex items-end">
            <label className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-stone-900">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="h-4 w-4 accent-amber-700"
              />
              Tarifa ativa
            </label>
          </div>

          <div className="lg:col-span-3">
            <Label>Vigencia — inicio</Label>
            <input
              required
              type="date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              className="mt-2 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm"
            />
          </div>
          <div className="lg:col-span-3">
            <Label>Vigencia — fim</Label>
            <input
              required
              type="date"
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              className="mt-2 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm"
            />
          </div>
          <div className="lg:col-span-3">
            <Label>Diaria (semana)</Label>
            <input
              required
              type="number"
              step="0.01"
              min="0"
              value={form.weekday_rate}
              onChange={(e) => setForm({ ...form, weekday_rate: Number(e.target.value) })}
              className="mt-2 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm"
            />
          </div>
          <div className="lg:col-span-3">
            <Label>Diaria (fim de semana)</Label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Vazio = mesma da semana"
              value={form.weekend_rate}
              onChange={(e) => setForm({ ...form, weekend_rate: e.target.value === '' ? '' : Number(e.target.value) })}
              className="mt-2 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm"
            />
          </div>

          <div className="lg:col-span-3">
            <Label>Hospedes incluidos</Label>
            <input
              required
              type="number"
              min="1"
              value={form.guests_included}
              onChange={(e) => setForm({ ...form, guests_included: Number(e.target.value) })}
              className="mt-2 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm"
            />
          </div>
          <div className="lg:col-span-3">
            <Label>Adicional por hospede extra</Label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.extra_guest_fee}
              onChange={(e) => setForm({ ...form, extra_guest_fee: Number(e.target.value) })}
              className="mt-2 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm"
            />
          </div>
          <div className="lg:col-span-3">
            <Label>Estadia minima (noites)</Label>
            <input
              required
              type="number"
              min="1"
              value={form.min_nights}
              onChange={(e) => setForm({ ...form, min_nights: Number(e.target.value) })}
              className="mt-2 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm"
            />
          </div>

          <div className="lg:col-span-12">
            <Label>Descricao interna (opcional)</Label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Notas para o time de reservas — nao aparece para o cliente."
              className="mt-2 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm"
            />
          </div>

          <div className="lg:col-span-12 flex flex-wrap gap-3">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-2xl bg-amber-700 px-5 py-3 text-sm font-black text-white"
            >
              <CheckCircle2 className="h-4 w-4" />
              {form.id ? 'Salvar alteracoes' : 'Criar tarifa'}
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

      <div className="mt-6 space-y-5">
        {loading ? (
          <div className="rounded-2xl bg-neutral-50 p-6 text-sm font-bold text-neutral-400">Carregando tarifas...</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-8 text-center text-sm font-bold text-neutral-400">
            Nenhuma tarifa cadastrada com esse filtro.
          </div>
        ) : (
          (Array.from(groups.entries()) as Array<[Category, PublicRate[]]>).map(([cat, list]) => (
            <div key={cat}>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-neutral-500">
                {CATEGORY_LABELS[cat]} <span className="text-neutral-400">· {list.length} tarifa(s)</span>
              </p>
              <div className="mt-3 overflow-x-auto rounded-2xl border border-neutral-200">
                <table className="w-full text-sm min-w-[480px]">
                  <thead className="bg-neutral-50 text-[10px] font-black uppercase tracking-widest text-neutral-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Rotulo</th>
                      <th className="px-4 py-3 text-left">Vigencia</th>
                      <th className="px-4 py-3 text-right">Semana</th>
                      <th className="px-4 py-3 text-right">Fim de semana</th>
                      <th className="px-4 py-3 text-center">Inclui</th>
                      <th className="px-4 py-3 text-right">Extra</th>
                      <th className="px-4 py-3 text-center">Min</th>
                      <th className="px-4 py-3 text-center">Prio</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-right">Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => (
                      <tr key={r.id} className="border-t border-neutral-100">
                        <td className="px-4 py-3">
                          <p className="font-bold text-neutral-900">{r.label}</p>
                          {r.description && <p className="text-xs text-neutral-500">{r.description}</p>}
                        </td>
                        <td className="px-4 py-3 text-xs text-neutral-600">
                          <div className="flex items-center gap-1">
                            <CalendarRange className="h-3 w-3 text-amber-700" />
                            <span>{formatDateBR(r.start_date)} → {formatDateBR(r.end_date)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-black">{formatBRL(r.weekday_rate)}</td>
                        <td className="px-4 py-3 text-right text-neutral-700">{r.weekend_rate ? formatBRL(r.weekend_rate) : <span className="text-neutral-400">—</span>}</td>
                        <td className="px-4 py-3 text-center">{r.guests_included}</td>
                        <td className="px-4 py-3 text-right">{r.extra_guest_fee > 0 ? formatBRL(r.extra_guest_fee) : <span className="text-neutral-400">—</span>}</td>
                        <td className="px-4 py-3 text-center">{r.min_nights}</td>
                        <td className="px-4 py-3 text-center text-neutral-600">{r.priority}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${r.active ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-200 text-neutral-600'}`}>
                            {r.active ? 'Ativa' : 'Inativa'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {canManage && (
                            <div className="inline-flex items-center gap-1">
                              <button onClick={() => toggleActive(r)} title={r.active ? 'Desativar' : 'Ativar'} className="rounded-lg p-1.5 text-neutral-600 hover:bg-neutral-100">
                                <Power className="h-4 w-4" />
                              </button>
                              <button onClick={() => startEdit(r)} title="Editar" className="rounded-lg p-1.5 text-blue-700 hover:bg-blue-50">
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button onClick={() => removeRate(r)} title="Excluir" className="rounded-lg p-1.5 text-red-700 hover:bg-red-50">
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
            </div>
          ))
        )}
      </div>

      {!canManage && (
        <p className="mt-5 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
          Voce esta em modo somente-leitura. Apenas admin, manager ou reservas podem editar tarifas.
        </p>
      )}
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <label className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">{children}</label>;
}
