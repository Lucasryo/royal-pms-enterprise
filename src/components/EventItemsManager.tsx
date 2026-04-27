import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { EventItem } from '../types';
import { Plus, Edit2, X, Check, Package } from 'lucide-react';
import { toast } from 'sonner';

const UNITS = [
  { value: 'por_unidade', label: 'Por unidade' },
  { value: 'por_pessoa', label: 'Por pessoa' },
  { value: 'por_hora', label: 'Por hora' },
  { value: 'por_dia', label: 'Por dia' },
];

const CATEGORIES = ['Equipamentos A/V', 'Alimentação & Bebidas', 'Mobiliário', 'Decoração', 'Serviços', 'Outros'];

const EMPTY_ITEM: Partial<EventItem> = { name: '', unit: 'por_unidade', default_price: 0, category: '', description: '', active: true };

export default function EventItemsManager({ userId }: { userId: string }) {
  const [items, setItems] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<EventItem> | null>(null);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => { fetchItems(); }, []);

  async function fetchItems() {
    setLoading(true);
    const { data } = await supabase.from('event_items').select('*').order('name');
    setItems(data || []);
    setLoading(false);
  }

  async function handleSave() {
    if (!editing?.name?.trim() || !editing.unit) return;
    setLoading(true);
    if (isNew) {
      const { error } = await supabase.from('event_items').insert([{
        name: editing.name.trim(),
        description: editing.description || null,
        unit: editing.unit,
        default_price: editing.default_price ?? 0,
        category: editing.category || null,
        active: true,
        created_by: userId,
      }]);
      if (error) toast.error('Erro ao cadastrar item.');
      else toast.success('Item cadastrado com sucesso!');
    } else {
      const { error } = await supabase.from('event_items').update({
        name: editing.name!.trim(),
        description: editing.description || null,
        unit: editing.unit,
        default_price: editing.default_price ?? 0,
        category: editing.category || null,
      }).eq('id', editing.id!);
      if (error) toast.error('Erro ao atualizar item.');
      else toast.success('Item atualizado!');
    }
    setEditing(null);
    setIsNew(false);
    fetchItems();
    setLoading(false);
  }

  async function handleToggleActive(item: EventItem) {
    await supabase.from('event_items').update({ active: !(item.active !== false) }).eq('id', item.id);
    fetchItems();
  }

  const unitLabel = (u: string) => UNITS.find(x => x.value === u)?.label || u;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-stone-500">· Catálogo</p>
          <h3 className="font-display text-2xl font-light text-ink mt-0.5">Itens de Eventos</h3>
        </div>
        <button
          onClick={() => { setEditing({ ...EMPTY_ITEM }); setIsNew(true); }}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-ink text-paper rounded-full text-sm font-medium hover:bg-ink/90 transition-all"
        >
          <Plus className="w-4 h-4" />
          Novo Item
        </button>
      </div>

      {editing && (
        <div className="bg-white border border-neutral-200 rounded-2xl p-6 space-y-4 shadow-sm">
          <p className="text-[11px] uppercase tracking-[0.28em] text-stone-500 mb-2">
            · {isNew ? 'Cadastrar novo item' : 'Editar item'}
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1 block">Nome do Item</label>
              <input
                value={editing.name || ''}
                onChange={e => setEditing({ ...editing, name: e.target.value })}
                className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl font-medium text-sm outline-none focus:ring-2 focus:ring-amber-500/20"
                placeholder="Ex: Microfone com fio"
                autoFocus
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1 block">Unidade de Cobrança</label>
              <select
                value={editing.unit || 'por_unidade'}
                onChange={e => setEditing({ ...editing, unit: e.target.value as EventItem['unit'] })}
                className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl font-medium text-sm outline-none"
              >
                {UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1 block">Preço Padrão (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={editing.default_price ?? 0}
                onChange={e => setEditing({ ...editing, default_price: parseFloat(e.target.value) || 0 })}
                className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl font-medium text-sm outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1 block">Categoria</label>
              <select
                value={editing.category || ''}
                onChange={e => setEditing({ ...editing, category: e.target.value })}
                className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl font-medium text-sm outline-none"
              >
                <option value="">Sem categoria</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1 block">Descrição (opcional)</label>
              <input
                value={editing.description || ''}
                onChange={e => setEditing({ ...editing, description: e.target.value })}
                className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl font-medium text-sm outline-none focus:ring-2 focus:ring-amber-500/20"
                placeholder="Descrição ou observações sobre o item"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
            <button
              onClick={() => { setEditing(null); setIsNew(false); }}
              className="px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 rounded-xl transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={!editing.name?.trim() || loading}
              className="px-5 py-2 bg-neutral-900 text-white text-sm font-medium rounded-xl hover:bg-neutral-800 transition-all disabled:opacity-40 flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              Salvar Item
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {loading ? (
          <div className="py-10 text-center text-sm text-stone-400">Carregando catálogo...</div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center bg-white rounded-2xl border border-neutral-100">
            <Package className="w-10 h-10 text-stone-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-stone-400">Nenhum item no catálogo ainda.</p>
            <p className="text-xs text-stone-300 mt-1">Clique em "Novo Item" para começar.</p>
          </div>
        ) : (
          <>
            {CATEGORIES.concat(['Sem categoria']).map(cat => {
              const catItems = items.filter(i => (i.category || 'Sem categoria') === cat);
              if (catItems.length === 0) return null;
              return (
                <div key={cat} className="space-y-1">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-stone-400 font-medium px-1 pt-3 pb-1">{cat}</p>
                  {catItems.map(item => (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between px-5 py-4 rounded-2xl border transition-all ${
                        item.active !== false
                          ? 'bg-white border-neutral-200 hover:border-neutral-300'
                          : 'bg-neutral-50 border-neutral-100 opacity-50'
                      }`}
                    >
                      <div>
                        <p className={`text-sm font-medium ${item.active !== false ? 'text-ink' : 'text-stone-400 line-through'}`}>
                          {item.name}
                        </p>
                        <p className="text-[11px] text-stone-400 mt-0.5">
                          {unitLabel(item.unit)}
                          {item.description && ` · ${item.description}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-display text-sm font-light text-amber-700">
                          {Number(item.default_price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => { setEditing({ ...item }); setIsNew(false); }}
                            className="p-2 hover:bg-neutral-100 rounded-lg text-stone-400 hover:text-ink transition-colors"
                            title="Editar"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleToggleActive(item)}
                            className={`p-2 rounded-lg transition-colors text-stone-400 ${
                              item.active !== false
                                ? 'hover:bg-red-50 hover:text-red-500'
                                : 'hover:bg-green-50 hover:text-green-600'
                            }`}
                            title={item.active !== false ? 'Desativar' : 'Reativar'}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
