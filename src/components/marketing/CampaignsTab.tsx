import { useState } from 'react';
import type { Campaign } from '../../types/marketing';
import { SEED_CAMPAIGNS } from '../../constants/marketingSeeds';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import {
  Plus, Megaphone, Activity, Users, Target, Calendar, X,
} from 'lucide-react';

export function CampaignsTab() {
  const [campaigns, setCampaigns] = useState<Campaign[]>(SEED_CAMPAIGNS);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', channel: 'WhatsApp', audience: '', message: '', scheduledAt: '' });

  function saveCampaign() {
    if (!form.name.trim()) { toast.error('Nome é obrigatório'); return; }
    const newC: Campaign = {
      id: Math.random().toString(36).slice(2),
      name: form.name,
      status: form.scheduledAt ? 'scheduled' : 'draft',
      reach: '0',
      conv: '0%',
      channel: form.channel,
      scheduledAt: form.scheduledAt || undefined,
      targetAudience: form.audience,
      messageTemplate: form.message,
    };
    setCampaigns(prev => [newC, ...prev]);
    setShowForm(false);
    setForm({ name: '', channel: 'WhatsApp', audience: '', message: '', scheduledAt: '' });
    toast.success('Campanha criada!');
  }

  const statusMap = {
    active: { label: 'Ativa', cls: 'bg-emerald-100 text-emerald-700' },
    scheduled: { label: 'Agendada', cls: 'bg-blue-100 text-blue-700' },
    completed: { label: 'Concluída', cls: 'bg-neutral-100 text-neutral-600' },
    draft: { label: 'Rascunho', cls: 'bg-amber-100 text-amber-700' },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-600">Campanhas</p>
          <h2 className="text-xl font-black text-neutral-950">{campaigns.length} campanhas</h2>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-900 text-white text-sm font-bold hover:bg-neutral-800 transition-colors"
        >
          <Plus className="w-4 h-4" /> Nova campanha
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Ativas', value: campaigns.filter(c => c.status === 'active').length.toString(), icon: Activity, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Alcance Total', value: '8.858', icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Conversão Média', value: '13.1%', icon: Target, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Agendadas', value: campaigns.filter(c => c.status === 'scheduled').length.toString(), icon: Calendar, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map(stat => (
          <div key={stat.label} className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm">
            <div className={`w-8 h-8 rounded-xl ${stat.bg} flex items-center justify-center mb-3`}>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </div>
            <p className="text-2xl font-black text-neutral-950">{stat.value}</p>
            <p className="text-xs text-neutral-500 font-medium">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Campaign list */}
      <div className="rounded-3xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
        {campaigns.map((c, idx) => (
          <div key={c.id} className={`flex items-center gap-4 p-4 sm:p-5 ${idx < campaigns.length - 1 ? 'border-b border-neutral-100' : ''}`}>
            <div className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center shrink-0">
              <Megaphone className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="font-bold text-sm text-neutral-900 truncate">{c.name}</p>
                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${statusMap[c.status].cls}`}>{statusMap[c.status].label}</span>
              </div>
              <p className="text-xs text-neutral-500">{c.channel} {c.scheduledAt ? `· ${c.scheduledAt}` : ''}</p>
            </div>
            <div className="hidden sm:flex items-center gap-6 text-right">
              <div>
                <p className="text-sm font-black text-neutral-900">{c.reach}</p>
                <p className="text-[10px] text-neutral-400">Alcance</p>
              </div>
              <div>
                <p className="text-sm font-black text-emerald-600">{c.conv}</p>
                <p className="text-[10px] text-neutral-400">Conversão</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create form modal */}
      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowForm(false)} className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative w-full max-w-lg bg-white rounded-3xl p-6 sm:p-8 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-black text-neutral-950">Nova Campanha</h3>
                <button onClick={() => setShowForm(false)} className="p-2 rounded-xl bg-neutral-100 text-neutral-500 hover:bg-neutral-200"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">Nome</label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Promoção Julho" className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none font-medium" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">Canal</label>
                    <select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })} className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none font-medium">
                      {['WhatsApp', 'Instagram', 'Facebook', 'E-mail'].map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">Agendar para</label>
                    <input type="date" value={form.scheduledAt} onChange={e => setForm({ ...form, scheduledAt: e.target.value })} className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none font-medium" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">Público-alvo</label>
                  <input value={form.audience} onChange={e => setForm({ ...form, audience: e.target.value })} placeholder="Ex: Hóspedes dos últimos 6 meses" className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none font-medium" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">Mensagem</label>
                  <textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} placeholder="Use [NOME] para personalizar..." rows={3} className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none font-medium resize-none" />
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowForm(false)} className="flex-1 py-3 bg-neutral-100 rounded-xl text-sm font-bold text-neutral-600 hover:bg-neutral-200 transition-colors">Cancelar</button>
                  <button onClick={saveCampaign} className="flex-1 py-3 bg-neutral-900 text-white rounded-xl text-sm font-bold hover:bg-neutral-800 transition-colors">Criar Campanha</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
