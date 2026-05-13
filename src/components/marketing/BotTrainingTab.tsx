import { useState } from 'react';
import type { BotConfig } from '../../types/marketing';
import { toast } from 'sonner';
import { Save, RefreshCw, Hotel, DollarSign, Sparkles } from 'lucide-react';

export function BotTrainingTab() {
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<'info' | 'pricing' | 'personality'>('info');
  const [config, setConfig] = useState<BotConfig>({
    name: 'Royal PMS Palace Hotel',
    address: 'Av. Principal, 1000 - Centro',
    phone: '(22) 99999-0000',
    email: 'contato@royalpms.com',
    description: 'Hotel executivo com localização privilegiada, café da manhã incluso, Wi-Fi de alta velocidade e atendimento 24h.',
    policies: 'Check-in: 14h | Check-out: 11h | Pets não permitidos | Fumantes apenas em áreas externas',
    rooms: 'Standard (2 pessoas): R$ 289/noite\nExecutiva (2 pessoas): R$ 359/noite\nSuíte Master (2 pessoas): R$ 520/noite',
    faq: 'Café da manhã incluso? Sim, servido das 6h às 10h.\nTem estacionamento? Sim, gratuito.\nAceita cartão? Sim, todos os cartões.',
    pricingTable: '',
    botMood: 'professional',
    upsellActive: true,
    npsActive: true,
    widgetBotName: 'Assistente Virtual',
    widgetWelcomeMessage: 'Olá! Como posso ajudar com sua reserva hoje?',
    googleReviewLink: '',
    npsSendAfterHours: 24,
  });

  async function handleSave() {
    setSaving(true);
    await new Promise(r => setTimeout(r, 800));
    setSaving(false);
    toast.success('Configurações salvas com sucesso!');
  }

  const sections = [
    { id: 'info' as const, label: 'Informações', icon: Hotel },
    { id: 'pricing' as const, label: 'Tarifas e FAQ', icon: DollarSign },
    { id: 'personality' as const, label: 'Personalidade', icon: Sparkles },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-600">Treinamento</p>
          <h2 className="text-xl font-black text-neutral-950">Configurar Bot IA</h2>
        </div>
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-neutral-900 text-white text-sm font-bold hover:bg-neutral-800 disabled:opacity-60 transition-all">
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Salvando...' : 'Sincronizar'}
        </button>
      </div>

      {/* Section tabs */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none">
        {sections.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)} className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${activeSection === s.id ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>
            <s.icon className="w-4 h-4" /> {s.label}
          </button>
        ))}
      </div>

      <div className="rounded-3xl border border-neutral-200 bg-white p-5 sm:p-6 shadow-sm space-y-5">
        {activeSection === 'info' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: 'Nome do Hotel', key: 'name' as keyof BotConfig, placeholder: 'Ex: Royal PMS Palace Hotel' },
                { label: 'Telefone / WhatsApp', key: 'phone' as keyof BotConfig, placeholder: '(22) 99999-0000' },
                { label: 'E-mail', key: 'email' as keyof BotConfig, placeholder: 'contato@hotel.com' },
                { label: 'Endereço', key: 'address' as keyof BotConfig, placeholder: 'Av. Principal, 1000' },
              ].map(field => (
                <div key={field.key}>
                  <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">{field.label}</label>
                  <input value={String(config[field.key])} onChange={e => setConfig(prev => ({ ...prev, [field.key]: e.target.value }))} placeholder={field.placeholder} className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
                </div>
              ))}
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">Descrição do Hotel</label>
              <textarea value={config.description} onChange={e => setConfig(prev => ({ ...prev, description: e.target.value }))} rows={4} className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none resize-none" />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">Políticas (check-in, checkout, pets...)</label>
              <textarea value={config.policies} onChange={e => setConfig(prev => ({ ...prev, policies: e.target.value }))} rows={3} className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none resize-none" />
            </div>
          </>
        )}

        {activeSection === 'pricing' && (
          <>
            <div>
              <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">Tabela de Tarifas (UHs e preços)</label>
              <textarea value={config.rooms} onChange={e => setConfig(prev => ({ ...prev, rooms: e.target.value }))} rows={6} placeholder="Executiva: R$ 359/noite&#10;Master: R$ 520/noite&#10;..." className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none resize-none font-mono" />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">FAQ (perguntas e respostas frequentes)</label>
              <textarea value={config.faq} onChange={e => setConfig(prev => ({ ...prev, faq: e.target.value }))} rows={6} placeholder="Café da manhã incluso? Sim, das 6h às 10h.&#10;Tem estacionamento? Sim, gratuito." className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none resize-none" />
            </div>
          </>
        )}

        {activeSection === 'personality' && (
          <>
            <div>
              <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">Personalidade do Bot</label>
              <select value={config.botMood} onChange={e => setConfig(prev => ({ ...prev, botMood: e.target.value }))} className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none">
                {['professional', 'friendly', 'formal', 'casual'].map(m => (
                  <option key={m} value={m}>{m === 'professional' ? 'Profissional' : m === 'friendly' ? 'Amigável' : m === 'formal' ? 'Formal' : 'Casual'}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">Nome do Assistente Virtual</label>
              <input value={config.widgetBotName} onChange={e => setConfig(prev => ({ ...prev, widgetBotName: e.target.value }))} className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">Mensagem de Boas-vindas</label>
              <textarea value={config.widgetWelcomeMessage} onChange={e => setConfig(prev => ({ ...prev, widgetWelcomeMessage: e.target.value }))} rows={3} className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none resize-none" />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">Link Google Reviews (para NPS)</label>
              <input value={config.googleReviewLink} onChange={e => setConfig(prev => ({ ...prev, googleReviewLink: e.target.value }))} placeholder="https://g.page/r/..." className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
            </div>
            <div className="flex items-center justify-between p-4 rounded-2xl bg-neutral-50">
              <div>
                <p className="font-bold text-sm text-neutral-900">Upsell automático</p>
                <p className="text-xs text-neutral-500">Oferecer upgrades durante conversas</p>
              </div>
              <button onClick={() => setConfig(prev => ({ ...prev, upsellActive: !prev.upsellActive }))} className={`w-10 h-6 rounded-full transition-all ${config.upsellActive ? 'bg-amber-500' : 'bg-neutral-300'}`}>
                <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${config.upsellActive ? 'translate-x-5' : 'translate-x-1'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between p-4 rounded-2xl bg-neutral-50">
              <div>
                <p className="font-bold text-sm text-neutral-900">Pesquisa NPS automática</p>
                <p className="text-xs text-neutral-500">Enviar NPS após o checkout</p>
              </div>
              <button onClick={() => setConfig(prev => ({ ...prev, npsActive: !prev.npsActive }))} className={`w-10 h-6 rounded-full transition-all ${config.npsActive ? 'bg-amber-500' : 'bg-neutral-300'}`}>
                <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${config.npsActive ? 'translate-x-5' : 'translate-x-1'}`} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
