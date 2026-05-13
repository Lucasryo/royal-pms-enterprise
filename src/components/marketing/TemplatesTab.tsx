import { useState } from 'react';
import type { Template } from '../../types/marketing';
import { SEED_TEMPLATES } from '../../constants/marketingSeeds';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import {
  Search, Plus, Trash2, Copy, Edit3, Save, X, MessageSquare,
} from 'lucide-react';

const TEMPLATE_CATEGORIES = ['Saudação', 'Preços', 'Confirmação', 'Follow-up', 'Wi-Fi/PIX', 'Check-out', 'Personalizado'];
const TEMPLATE_CHANNELS = ['WhatsApp', 'Instagram', 'Facebook', 'Todos'];

export function TemplatesTab() {
  const [templates, setTemplates] = useState<Template[]>(SEED_TEMPLATES);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [form, setForm] = useState({ name: '', text: '', category: 'Saudação', channel: 'WhatsApp' });
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');

  function openCreate() { setEditing(null); setForm({ name: '', text: '', category: 'Saudação', channel: 'WhatsApp' }); setShowForm(true); }
  function openEdit(t: Template) { setEditing(t); setForm({ name: t.name, text: t.text, category: t.category, channel: t.channel }); setShowForm(true); }

  function saveTemplate() {
    if (!form.name.trim() || !form.text.trim()) { toast.error('Nome e texto são obrigatórios'); return; }
    if (editing) {
      setTemplates(prev => prev.map(t => t.id === editing.id ? { ...t, ...form } : t));
      toast.success('Template atualizado!');
    } else {
      setTemplates(prev => [{ id: Math.random().toString(36).slice(2), ...form }, ...prev]);
      toast.success('Template criado!');
    }
    setShowForm(false);
  }

  function deleteTemplate(id: string) {
    if (!confirm('Excluir este template?')) return;
    setTemplates(prev => prev.filter(t => t.id !== id));
    toast.success('Removido');
  }

  const filtered = templates.filter(t =>
    (!filter || t.category === filter) &&
    (!search || t.name.toLowerCase().includes(search.toLowerCase()) || t.text.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-600">Templates</p>
          <h2 className="text-xl font-black text-neutral-950">{templates.length} templates</h2>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-900 text-white text-sm font-bold hover:bg-neutral-800 transition-colors">
          <Plus className="w-4 h-4" /> Novo template
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar templates..." className="w-full pl-10 pr-4 py-2.5 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
        <button onClick={() => setFilter('')} className={`shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${!filter ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500'}`}>Todos</button>
        {TEMPLATE_CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setFilter(cat)} className={`shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${filter === cat ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500'}`}>{cat}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 rounded-3xl border border-dashed border-neutral-200">
          <MessageSquare className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
          <p className="font-bold text-neutral-400">Nenhum template encontrado</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(t => (
            <motion.article key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="group p-5 bg-white rounded-3xl border border-neutral-200 hover:border-amber-300 hover:shadow-md transition-all">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="font-bold text-sm text-neutral-900">{t.name}</h4>
                  <span className="text-[9px] font-bold text-amber-600 uppercase bg-amber-50 px-2 py-0.5 rounded-full">{t.category}</span>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400"><Edit3 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => deleteTemplate(t.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-neutral-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <p className="text-xs text-neutral-500 line-clamp-3 leading-relaxed mb-4">{t.text}</p>
              <div className="flex items-center justify-between pt-3 border-t border-neutral-100">
                <span className="text-[9px] font-bold text-neutral-400">{t.channel}</span>
                <button onClick={() => { navigator.clipboard.writeText(t.text); toast.success('Copiado!'); }} className="flex items-center gap-1 text-[9px] font-black text-amber-600 uppercase hover:text-amber-800">
                  <Copy className="w-3 h-3" /> Copiar
                </button>
              </div>
            </motion.article>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowForm(false)} className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative w-full max-w-lg bg-white rounded-3xl p-6 sm:p-8 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-black text-neutral-950">{editing ? 'Editar Template' : 'Novo Template'}</h3>
                <button onClick={() => setShowForm(false)} className="p-2 rounded-xl bg-neutral-100 text-neutral-500"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">Nome</label>
                    <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Boas-vindas" className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">Categoria</label>
                    <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none">
                      {TEMPLATE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">Mensagem</label>
                  <textarea value={form.text} onChange={e => setForm({ ...form, text: e.target.value })} placeholder="Use [NOME] para personalizar..." rows={5} className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none resize-none" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">Canal</label>
                  <select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })} className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none">
                    {TEMPLATE_CHANNELS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowForm(false)} className="flex-1 py-3 bg-neutral-100 rounded-xl text-sm font-bold text-neutral-600">Cancelar</button>
                  <button onClick={saveTemplate} className="flex-1 py-3 bg-neutral-900 text-white rounded-xl text-sm font-bold hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2"><Save className="w-4 h-4" /> Salvar</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
