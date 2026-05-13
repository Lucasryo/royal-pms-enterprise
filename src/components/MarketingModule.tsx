import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabase';
import { UserProfile } from '../types';
import type {
  Lead, Message, Campaign, Template, BotConfig,
  SocialIntegration, SmtpConfig, PmsWebhook,
} from '../types/marketing';
import { SEED_LEADS, SEED_CAMPAIGNS, SEED_TEMPLATES } from '../constants/marketingSeeds';
import { FinanceiroTab } from './marketing/FinanceiroTab';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import {
  MessageSquare, Instagram, Facebook, Search, CheckCircle2, Clock, Send,
  Zap, Twitter, Linkedin, Video, Globe, Users, Sparkles, ClipboardList,
  AlertCircle, Tag, UserPlus, LayoutGrid, Plus, Trash2, Copy, Edit3, Save,
  X, Star, TrendingUp, BarChart3, Target, Smile, Meh, Frown, ArrowUpRight,
  Calendar, Bell, Smartphone, Filter, Bookmark, MoreVertical, RefreshCw,
  Hotel, MapPin, Phone, BedDouble, DollarSign, Mail, Wand2, MessageCircle,
  ShieldCheck, TrendingDown, ChevronDown, ChevronRight, Eye, ArrowRight,
  Megaphone, Bot, Activity, Heart, Award, Settings, Layers, Inbox,
  QrCode, CreditCard, Banknote, Link2, ExternalLink, RefreshCcw, Database, Cloud,
  CheckCircle, XCircle, Wifi, Key,
} from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

interface MarketingModuleDashboardProps {
  profile: UserProfile;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CHANNELS = [
  { id: 'whatsapp', icon: <MessageSquare className="w-3 h-3" />, color: '#10b981', name: 'WhatsApp' },
  { id: 'instagram', icon: <Instagram className="w-3 h-3" />, color: '#e11d48', name: 'Instagram' },
  { id: 'facebook', icon: <Facebook className="w-3 h-3" />, color: '#3b82f6', name: 'Facebook' },
  { id: 'twitter', icon: <Twitter className="w-3 h-3" />, color: '#0a0a0a', name: 'X / Twitter' },
  { id: 'linkedin', icon: <Linkedin className="w-3 h-3" />, color: '#0ea5e9', name: 'LinkedIn' },
  { id: 'tiktok', icon: <Video className="w-3 h-3" />, color: '#0a0a0a', name: 'TikTok' },
  { id: 'google', icon: <Globe className="w-3 h-3" />, color: '#0ea5e9', name: 'Google Reviews' },
];

const TEMPLATE_CATEGORIES = ['Saudação', 'Preços', 'Confirmação', 'Follow-up', 'Wi-Fi/PIX', 'Check-out', 'Personalizado'];
const TEMPLATE_CHANNELS = ['WhatsApp', 'Instagram', 'Facebook', 'Todos'];

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// ─── Pill Badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Lead['status'] }) {
  const map = {
    new: { label: 'Novo', cls: 'bg-amber-100 text-amber-700' },
    ai_responded: { label: 'IA', cls: 'bg-blue-100 text-blue-700' },
    needs_human: { label: 'Humano', cls: 'bg-red-100 text-red-700' },
    resolved: { label: 'Resolvido', cls: 'bg-emerald-100 text-emerald-700' },
  };
  const { label, cls } = map[status];
  return <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}

function SentimentIcon({ s }: { s: Lead['sentiment'] }) {
  if (s === 'happy') return <Smile className="w-3.5 h-3.5 text-emerald-500" />;
  if (s === 'mixed') return <Meh className="w-3.5 h-3.5 text-amber-500" />;
  return <Frown className="w-3.5 h-3.5 text-red-500" />;
}

// ─── LeadInbox Tab ────────────────────────────────────────────────────────────

function LeadInboxTab() {
  const [leads, setLeads] = useState<Lead[]>(SEED_LEADS);
  const [selectedId, setSelectedId] = useState<string | null>('1');
  const [activeFilter, setActiveFilter] = useState<'all' | 'new' | 'needs_human' | 'resolved'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [chatHistory, setChatHistory] = useState<Record<string, Message[]>>({
    '1': [
      { text: 'Boa tarde! Gostaria de saber a disponibilidade para o próximo feriado.', type: 'in', time: '14:32' },
      { text: 'Olá Ana! Temos disponibilidade para o feriado de Corpus Christi (19-22 jun). UH Executiva: R$ 359/noite. Deseja reservar?', type: 'out', time: '14:33' },
      { text: 'Boa tarde! Gostaria de saber a disponibilidade para o próximo feriado.', type: 'in', time: '14:35' },
    ],
    '2': [
      { text: 'Quanto custa a diária? Vi pelo stories.', type: 'in', time: '13:15' },
    ],
    '3': [
      { text: 'Infelizmente não consegui fazer meu check-in ainda.', type: 'in', time: '11:47' },
    ],
  });
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [loadingAI, setLoadingAI] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const selected = leads.find(l => l.id === selectedId) ?? null;
  const messages = selectedId ? (chatHistory[selectedId] ?? []) : [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!selected) return;
    setLoadingAI(true);
    const timer = setTimeout(() => {
      const name = selected.guestName.split(' ')[0];
      setAiSuggestions([
        `Olá ${name}! Posso ajudar com mais detalhes sobre disponibilidade e tarifas.`,
        `${name}, temos pacotes especiais disponíveis. Gostaria de receber uma proposta?`,
        `Perfeito! Vou verificar nossa disponibilidade agora mesmo para você.`,
      ]);
      setLoadingAI(false);
    }, 800);
    return () => clearTimeout(timer);
  }, [selectedId]);

  const filteredLeads = leads.filter(l => {
    if (activeFilter !== 'all' && l.status !== activeFilter) return false;
    if (searchQuery && !l.guestName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  function sendMessage() {
    if (!messageInput.trim() || !selectedId) return;
    const msg: Message = { text: messageInput, type: 'out', time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) };
    setChatHistory(prev => ({ ...prev, [selectedId]: [...(prev[selectedId] ?? []), msg] }));
    setLeads(prev => prev.map(l => l.id === selectedId ? { ...l, lastMessage: messageInput, status: 'ai_responded' as const } : l));
    setMessageInput('');
  }

  function markResolved() {
    if (!selectedId) return;
    setLeads(prev => prev.map(l => l.id === selectedId ? { ...l, status: 'resolved' as const, unreadCount: 0 } : l));
    toast.success('Conversa resolvida');
  }

  function toggleOptOut() {
    if (!selectedId) return;
    setLeads(prev => prev.map(l => {
      if (l.id !== selectedId) return l;
      const newOptOut = !l.opt_out;
      if (newOptOut) {
        toast.error('Contato marcado como opt-out. Não será incluído em broadcasts.');
      } else {
        toast.success('Opt-out removido.');
      }
      return { ...l, opt_out: newOptOut, opt_out_at: newOptOut ? new Date().toISOString() : null };
    }));
  }

  return (
    <div className="flex h-[75vh] min-h-[500px] rounded-3xl overflow-hidden border border-neutral-200 bg-white shadow-sm">
      {/* Sidebar */}
      <div className="w-72 shrink-0 border-r border-neutral-100 flex flex-col">
        <div className="p-4 border-b border-neutral-100 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar..."
              className="w-full pl-9 pr-3 py-2 bg-neutral-50 rounded-xl text-xs font-medium border-0 focus:ring-2 focus:ring-amber-500 outline-none"
            />
          </div>
          <div className="flex gap-1 overflow-x-auto scrollbar-none">
            {(['all', 'new', 'needs_human', 'resolved'] as const).map(f => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${activeFilter === f ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}
              >
                {f === 'all' ? 'Todos' : f === 'new' ? 'Novos' : f === 'needs_human' ? 'Humano' : 'Resolvidos'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredLeads.map(lead => {
            const ch = CHANNELS.find(c => c.id === lead.channel);
            return (
              <button
                key={lead.id}
                onClick={() => { setSelectedId(lead.id); setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, unreadCount: 0 } : l)); }}
                className={`w-full text-left p-3 border-b border-neutral-50 transition-colors ${selectedId === lead.id ? 'bg-amber-50' : 'hover:bg-neutral-50'}`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-neutral-200 flex items-center justify-center shrink-0 text-xs font-black text-neutral-600">
                    {lead.guestName[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-bold text-neutral-900 truncate">{lead.guestName}</span>
                      <span className="text-[9px] text-neutral-400 shrink-0 ml-1">{timeAgo(lead.lastMessageAt)}</span>
                    </div>
                    <p className="text-[10px] text-neutral-500 truncate leading-snug">{lead.lastMessage}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span style={{ color: ch?.color }} className="flex items-center gap-0.5 text-[9px] font-bold">{ch?.icon}{ch?.name}</span>
                      <SentimentIcon s={lead.sentiment} />
                      {!!lead.unreadCount && (
                        <span className="ml-auto w-4 h-4 bg-amber-500 rounded-full text-white text-[9px] font-black flex items-center justify-center">{lead.unreadCount}</span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Chat area */}
      {selected ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="px-5 py-3 border-b border-neutral-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-neutral-200 flex items-center justify-center font-black text-sm text-neutral-700">{selected.guestName[0]}</div>
              <div>
                <p className="font-bold text-sm text-neutral-900">{selected.guestName}</p>
                <div className="flex items-center gap-2">
                  <StatusBadge status={selected.status} />
                  <SentimentIcon s={selected.sentiment} />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selected.opt_out && (
                <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[9px] font-black uppercase tracking-wider">OPT-OUT</span>
              )}
              <button
                onClick={toggleOptOut}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${selected.opt_out ? 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200' : 'bg-red-50 text-red-700 hover:bg-red-100'}`}
              >
                🚫 {selected.opt_out ? 'Remover opt-out' : 'Opt-out'}
              </button>
              {selected.status !== 'resolved' && (
                <button onClick={markResolved} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition-colors">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Resolver
                </button>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.type === 'out' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-xs leading-relaxed ${msg.type === 'out' ? 'bg-neutral-900 text-white rounded-br-sm' : 'bg-neutral-100 text-neutral-800 rounded-bl-sm'}`}>
                  {msg.text}
                  <p className={`text-[9px] mt-1 ${msg.type === 'out' ? 'text-neutral-400' : 'text-neutral-400'}`}>{msg.time}</p>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* AI suggestions */}
          <div className="px-4 py-2 border-t border-neutral-100 bg-amber-50/50">
            <p className="text-[9px] font-black uppercase tracking-wider text-amber-600 mb-2 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Sugestões IA</p>
            {loadingAI ? (
              <div className="flex gap-2">
                {[1,2,3].map(i => <div key={i} className="h-7 w-40 bg-amber-100 rounded-lg animate-pulse" />)}
              </div>
            ) : (
              <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
                {aiSuggestions.map((s, i) => (
                  <button key={i} onClick={() => setMessageInput(s)} className="shrink-0 px-3 py-1.5 rounded-lg bg-white border border-amber-200 text-xs text-neutral-700 hover:border-amber-500 transition-colors max-w-[220px] text-left truncate">
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-4 border-t border-neutral-100 flex items-end gap-3">
            <textarea
              value={messageInput}
              onChange={e => setMessageInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Escreva uma mensagem..."
              rows={2}
              className="flex-1 resize-none px-4 py-2.5 bg-neutral-50 rounded-2xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none"
            />
            <button
              onClick={sendMessage}
              disabled={!messageInput.trim()}
              className="p-3 bg-neutral-900 text-white rounded-2xl hover:bg-neutral-800 disabled:opacity-40 transition-all"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-neutral-400">
          <div className="text-center">
            <Inbox className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-bold">Selecione uma conversa</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Campaigns Tab ───────────────────────────────────────────────────────────

function CampaignsTab() {
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

// ─── Templates Tab ────────────────────────────────────────────────────────────

function TemplatesTab() {
  const [templates, setTemplates] = useState<Template[]>(SEED_TEMPLATES);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [form, setForm] = useState({ name: '', text: '', category: 'Saudação', channel: 'WhatsApp' });
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function fetchTemplates() {
      setLoadingTemplates(true);
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('id', 'marketing_templates')
        .maybeSingle();
      if (data?.value) {
        try { setTemplates(JSON.parse(data.value) as Template[]); } catch { /* fallback to seeds */ }
      }
      setLoadingTemplates(false);
    }
    fetchTemplates();
  }, []);

  async function persistTemplates(updated: Template[]) {
    await supabase.from('app_settings').upsert({ id: 'marketing_templates', value: JSON.stringify(updated) });
  }

  function openCreate() { setEditing(null); setForm({ name: '', text: '', category: 'Saudação', channel: 'WhatsApp' }); setShowForm(true); }
  function openEdit(t: Template) { setEditing(t); setForm({ name: t.name, text: t.text, category: t.category, channel: t.channel }); setShowForm(true); }

  async function saveTemplate() {
    if (!form.name.trim() || !form.text.trim()) { toast.error('Nome e texto são obrigatórios'); return; }
    let updated: Template[];
    if (editing) {
      updated = templates.map(t => t.id === editing.id ? { ...t, ...form } : t);
      setTemplates(updated);
      toast.success('Template atualizado!');
    } else {
      updated = [{ id: Math.random().toString(36).slice(2), ...form }, ...templates];
      setTemplates(updated);
      toast.success('Template criado!');
    }
    await persistTemplates(updated);
    setShowForm(false);
  }

  async function deleteTemplate(id: string) {
    if (!confirm('Excluir este template?')) return;
    const updated = templates.filter(t => t.id !== id);
    setTemplates(updated);
    await persistTemplates(updated);
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
        <button onClick={openCreate} disabled={loadingTemplates} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-900 text-white text-sm font-bold hover:bg-neutral-800 disabled:opacity-60 transition-colors">
          {loadingTemplates ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {loadingTemplates ? 'Carregando...' : 'Novo template'}
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

// ─── Analytics Tab ────────────────────────────────────────────────────────────

interface AnalyticsData {
  totalSent: number;
  totalFailed: number;
  totalScheduled: number;
  newReservations: number;
  byChannel: { channel: string; sent: number; failed: number }[];
}

function AnalyticsTab() {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('7d');
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData>({
    totalSent: 0, totalFailed: 0, totalScheduled: 0, newReservations: 0, byChannel: [],
  });

  useEffect(() => {
    async function fetchAnalytics() {
      setIsLoading(true);
      const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
      const periodStart = new Date();
      periodStart.setDate(periodStart.getDate() - days);
      const iso = periodStart.toISOString();

      const [msgsRes, resvRes] = await Promise.all([
        supabase.from('guest_messages').select('channel, status').gte('created_at', iso),
        supabase.from('reservations').select('id', { count: 'exact', head: true }).gte('created_at', iso),
      ]);

      const msgs = msgsRes.data ?? [];
      const totalSent = msgs.filter(m => m.status === 'sent').length;
      const totalFailed = msgs.filter(m => m.status === 'failed').length;
      const totalScheduled = msgs.filter(m => m.status === 'scheduled').length;

      const channelMap: Record<string, { sent: number; failed: number }> = {};
      for (const m of msgs) {
        if (!channelMap[m.channel]) channelMap[m.channel] = { sent: 0, failed: 0 };
        if (m.status === 'sent') channelMap[m.channel].sent++;
        if (m.status === 'failed') channelMap[m.channel].failed++;
      }
      const byChannel = Object.entries(channelMap).map(([channel, v]) => ({ channel, ...v }));

      setData({
        totalSent, totalFailed, totalScheduled,
        newReservations: resvRes.count ?? 0,
        byChannel,
      });
      setIsLoading(false);
    }
    fetchAnalytics();
  }, [period]);

  const failureRate = data.totalSent + data.totalFailed > 0
    ? ((data.totalFailed / (data.totalSent + data.totalFailed)) * 100).toFixed(1)
    : '0.0';
  const topChannel = [...data.byChannel].sort((a, b) => b.sent - a.sent)[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-600">Analytics de Mensagens</p>
          <h2 className="text-xl font-black text-neutral-950">Desempenho</h2>
        </div>
        <div className="flex bg-neutral-100 rounded-xl p-1">
          {(['7d', '30d', '90d'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${period === p ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'}`}>
              {p === '7d' ? '7 dias' : p === '30d' ? '30 dias' : '90 dias'}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm animate-pulse">
              <div className="w-8 h-8 rounded-xl bg-neutral-200 mb-2" />
              <div className="h-6 w-12 bg-neutral-200 rounded mb-1" />
              <div className="h-3 w-16 bg-neutral-100 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Mensagens Enviadas', value: data.totalSent.toString(), icon: MessageSquare, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Agendadas', value: data.totalScheduled.toString(), icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Falhas', value: data.totalFailed.toString(), icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50' },
            { label: 'Taxa de Falha', value: `${failureRate}%`, icon: TrendingDown, color: 'text-orange-600', bg: 'bg-orange-50' },
            { label: 'Novas Reservas', value: data.newReservations.toString(), icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50' },
            { label: 'Canal Principal', value: topChannel?.channel ?? '—', icon: Bot, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          ].map(stat => (
            <div key={stat.label} className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm">
              <div className={`w-8 h-8 rounded-xl ${stat.bg} flex items-center justify-center mb-2`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <p className="text-xl font-black text-neutral-950 truncate">{stat.value}</p>
              <p className="text-[10px] text-neutral-500 font-medium">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* By channel */}
        <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h3 className="font-black text-sm text-neutral-900 mb-4">Mensagens por Canal</h3>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-8 bg-neutral-100 rounded-xl animate-pulse" />)}
            </div>
          ) : data.byChannel.length === 0 ? (
            <p className="text-xs text-neutral-400 text-center py-6">Nenhuma mensagem no período</p>
          ) : (
            <div className="space-y-3">
              {[...data.byChannel].sort((a, b) => b.sent - a.sent).map((ch) => (
                <div key={ch.channel} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-neutral-700 capitalize">{ch.channel}</span>
                    <span className="font-black text-neutral-900">{ch.sent} enviadas · <span className="text-red-500">{ch.failed} falhas</span></span>
                  </div>
                  <div className="w-full bg-neutral-100 rounded-full h-1.5">
                    <div className="bg-amber-500 h-1.5 rounded-full transition-all" style={{ width: `${data.totalSent > 0 ? (ch.sent / data.totalSent) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Unavailable bot metrics note */}
        <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm flex flex-col justify-center items-center text-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-neutral-100 flex items-center justify-center">
            <Bot className="w-6 h-6 text-neutral-400" />
          </div>
          <div>
            <p className="font-black text-sm text-neutral-700">Métricas de Bot Indisponíveis</p>
            <p className="text-xs text-neutral-400 mt-1 max-w-xs">Taxa de resolução automática, tempo médio de resposta e conversão requerem integração de bot ativa.</p>
          </div>
          <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-neutral-100 text-neutral-500">Requer integração de bot ativa</span>
        </div>
      </div>
    </div>
  );
}

// ─── NPS Tab ──────────────────────────────────────────────────────────────────

interface NPSTicket {
  id: string;
  rating: number;
  created_at: string;
}

function NPSTab() {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');
  const [isLoading, setIsLoading] = useState(true);
  const [tickets, setTickets] = useState<NPSTicket[]>([]);

  useEffect(() => {
    async function fetchNPS() {
      setIsLoading(true);
      const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
      const periodStart = new Date();
      periodStart.setDate(periodStart.getDate() - days);
      const iso = periodStart.toISOString();

      const { data } = await supabase
        .from('maintenance_tickets')
        .select('id, rating, created_at')
        .not('rating', 'is', null)
        .gte('created_at', iso);

      setTickets(data ?? []);
      setIsLoading(false);
    }
    fetchNPS();
  }, [period]);

  const promoters = tickets.filter(t => t.rating >= 4).length;
  const passives = tickets.filter(t => t.rating === 3).length;
  const detractors = tickets.filter(t => t.rating <= 2).length;
  const total = tickets.length;
  const nps = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : 0;
  const avg = total > 0 ? (tickets.reduce((a, b) => a + b.rating, 0) / total).toFixed(1) : '—';

  function ratingColor(r: number) {
    if (r >= 4) return 'text-emerald-600 bg-emerald-50';
    if (r === 3) return 'text-amber-600 bg-amber-50';
    return 'text-red-600 bg-red-50';
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-600">NPS Engine</p>
          <h2 className="text-xl font-black text-neutral-950">Satisfação dos Hóspedes</h2>
          <p className="text-[10px] text-neutral-400 mt-0.5">Avaliações coletadas via chamados de manutenção</p>
        </div>
        <div className="flex bg-neutral-100 rounded-xl p-1">
          {(['7d', '30d', '90d'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${period === p ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'}`}>
              {p === '7d' ? '7 dias' : p === '30d' ? '30 dias' : '90 dias'}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm animate-pulse">
              <div className="w-8 h-8 rounded-xl bg-neutral-200 mb-2" />
              <div className="h-7 w-10 bg-neutral-200 rounded mb-1" />
              <div className="h-3 w-16 bg-neutral-100 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'NPS Score', value: total > 0 ? `${nps}` : '—', icon: Award, color: nps >= 50 ? 'text-emerald-600' : nps >= 0 ? 'text-amber-600' : 'text-red-600', bg: 'bg-emerald-50' },
            { label: 'Nota Média', value: avg, icon: Star, color: 'text-yellow-500', bg: 'bg-yellow-50' },
            { label: 'Promotores', value: promoters.toString(), icon: Smile, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Detratores', value: detractors.toString(), icon: Frown, color: 'text-red-600', bg: 'bg-red-50' },
          ].map(stat => (
            <div key={stat.label} className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm">
              <div className={`w-8 h-8 rounded-xl ${stat.bg} flex items-center justify-center mb-2`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <p className={`text-2xl font-black ${stat.color}`}>{stat.value}</p>
              <p className="text-[10px] text-neutral-500 font-medium">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* NPS bar */}
      {!isLoading && total > 0 && (
        <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h3 className="font-black text-sm text-neutral-900 mb-4">Distribuição de Notas (1–5)</h3>
          <div className="flex rounded-xl overflow-hidden h-6">
            {detractors > 0 && <div className="bg-red-400 flex items-center justify-center text-[9px] font-black text-white" style={{ width: `${(detractors / total) * 100}%` }}>{Math.round((detractors / total) * 100)}%</div>}
            {passives > 0 && <div className="bg-amber-400 flex items-center justify-center text-[9px] font-black text-white" style={{ width: `${(passives / total) * 100}%` }}>{Math.round((passives / total) * 100)}%</div>}
            {promoters > 0 && <div className="bg-emerald-400 flex items-center justify-center text-[9px] font-black text-white" style={{ width: `${(promoters / total) * 100}%` }}>{Math.round((promoters / total) * 100)}%</div>}
          </div>
          <div className="flex justify-between mt-2 text-[9px] font-bold text-neutral-500">
            <span className="text-red-500">Detratores (1–2)</span>
            <span className="text-amber-500">Neutros (3)</span>
            <span className="text-emerald-500">Promotores (4–5)</span>
          </div>
        </div>
      )}

      {/* Ratings list */}
      {!isLoading && (
        total === 0 ? (
          <div className="text-center py-10 text-sm text-neutral-400">Nenhuma avaliação encontrada no período</div>
        ) : (
          <div className="space-y-3">
            {tickets.slice(0, 20).map(t => (
              <div key={t.id} className="flex items-center gap-4 p-4 rounded-2xl border border-neutral-100 bg-white shadow-sm">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${ratingColor(t.rating)}`}>
                  {t.rating}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-neutral-900">Chamado #{t.id.slice(0, 8)}</p>
                  <p className="text-xs text-neutral-400">Avaliação via chamado de manutenção</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[9px] text-neutral-400">{new Date(t.created_at).toLocaleDateString('pt-BR')}</p>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ─── Bot Training Tab ─────────────────────────────────────────────────────────

const DEFAULT_BOT_CONFIG: BotConfig = {
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
};

function BotTrainingTab() {
  const [saving, setSaving] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [activeSection, setActiveSection] = useState<'info' | 'pricing' | 'personality'>('info');
  const [config, setConfig] = useState<BotConfig>(DEFAULT_BOT_CONFIG);

  useEffect(() => {
    async function fetchConfig() {
      setLoadingConfig(true);
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('id', 'bot_config')
        .maybeSingle();
      if (data?.value) {
        try { setConfig(JSON.parse(data.value) as BotConfig); } catch { /* fallback to defaults */ }
      }
      setLoadingConfig(false);
    }
    fetchConfig();
  }, []);

  async function handleSave() {
    setSaving(true);
    const { error } = await supabase.from('app_settings').upsert({ id: 'bot_config', value: JSON.stringify(config) });
    setSaving(false);
    if (error) { toast.error('Erro ao salvar configurações'); return; }
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
        <button onClick={handleSave} disabled={saving || loadingConfig} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-neutral-900 text-white text-sm font-bold hover:bg-neutral-800 disabled:opacity-60 transition-all">
          {saving || loadingConfig ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {loadingConfig ? 'Carregando...' : saving ? 'Salvando...' : 'Salvar configurações'}
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

// ─── CRM Tab ──────────────────────────────────────────────────────────────────

function CRMTab() {
  const leads = [
    { name: 'Ana Beatriz Costa', score: 92, stage: 'hot', channel: 'whatsapp', lastContact: '2026-05-10', totalConversations: 8, tags: ['VIP', 'Recorrente'] },
    { name: 'Carlos Eduardo Lima', score: 65, stage: 'warm', channel: 'instagram', lastContact: '2026-05-09', totalConversations: 3, tags: ['Novo'] },
    { name: 'Marina Souza', score: 41, stage: 'cold', channel: 'whatsapp', lastContact: '2026-05-07', totalConversations: 1, tags: ['Follow-up'] },
    { name: 'Roberto Ferreira', score: 88, stage: 'hot', channel: 'facebook', lastContact: '2026-05-10', totalConversations: 12, tags: ['VIP', 'Fidelizado'] },
    { name: 'Juliana Alves', score: 74, stage: 'warm', channel: 'google', lastContact: '2026-05-08', totalConversations: 5, tags: ['Empresa'] },
  ];

  function stageLabel(stage: string) {
    return { hot: { label: 'Quente', cls: 'bg-red-100 text-red-700' }, warm: { label: 'Morno', cls: 'bg-amber-100 text-amber-700' }, cold: { label: 'Frio', cls: 'bg-blue-100 text-blue-700' } }[stage] ?? { label: stage, cls: 'bg-neutral-100 text-neutral-600' };
  }

  function scoreColor(score: number) {
    if (score >= 80) return 'text-emerald-600';
    if (score >= 60) return 'text-amber-600';
    return 'text-red-600';
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-600">CRM</p>
        <h2 className="text-xl font-black text-neutral-950">Leads e Scoring</h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Leads', value: leads.length.toString(), color: 'text-neutral-900' },
          { label: 'Quentes', value: leads.filter(l => l.stage === 'hot').length.toString(), color: 'text-red-600' },
          { label: 'Mornos', value: leads.filter(l => l.stage === 'warm').length.toString(), color: 'text-amber-600' },
          { label: 'Score Médio', value: Math.round(leads.reduce((a, b) => a + b.score, 0) / leads.length).toString(), color: 'text-emerald-600' },
        ].map(stat => (
          <div key={stat.label} className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm">
            <p className={`text-2xl font-black ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-neutral-500 font-medium">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-neutral-100">
                {['Lead', 'Score IA', 'Estágio', 'Canal', 'Último Contato', 'Tags'].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-wider text-neutral-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map((lead, i) => {
                const { label, cls } = stageLabel(lead.stage);
                const ch = CHANNELS.find(c => c.id === lead.channel);
                return (
                  <tr key={i} className="border-b border-neutral-50 hover:bg-neutral-50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-neutral-200 flex items-center justify-center text-xs font-black text-neutral-600">{lead.name[0]}</div>
                        <div>
                          <p className="font-bold text-sm text-neutral-900">{lead.name}</p>
                          <p className="text-[10px] text-neutral-400">{lead.totalConversations} conversas</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-neutral-100 rounded-full h-1.5">
                          <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${lead.score}%` }} />
                        </div>
                        <span className={`text-sm font-black ${scoreColor(lead.score)}`}>{lead.score}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3"><span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${cls}`}>{label}</span></td>
                    <td className="px-5 py-3 text-xs" style={{ color: ch?.color }}>{ch?.name}</td>
                    <td className="px-5 py-3 text-xs text-neutral-500">{lead.lastContact}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {lead.tags.map(t => <span key={t} className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600">{t}</span>)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── WhatsApp Simulator Tab ───────────────────────────────────────────────────

function SimulatorTab() {
  const [messages, setMessages] = useState([
    { text: 'Olá! Gostaria de fazer uma reserva para o próximo fim de semana.', type: 'in' as const, time: '10:31' },
    { text: 'Olá! Seja bem-vindo ao Royal PMS Palace Hotel 🏨 Temos disponibilidade! Para 2 pessoas, nossa UH Executiva está R$ 359/noite. Inclui café da manhã, Wi-Fi e estacionamento. Deseja confirmar?', type: 'out' as const, time: '10:31' },
    { text: 'Sim! Vou querer o pacote completo. Tem piscina?', type: 'in' as const, time: '10:32' },
    { text: 'Sim! Temos piscina descoberta disponível das 7h às 22h 🏊 Posso confirmar a reserva agora?', type: 'out' as const, time: '10:32' },
  ]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  function sendMessage() {
    if (!input.trim()) return;
    const userMsg = { text: input, type: 'in' as const, time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) };
    setMessages(prev => [...prev, userMsg]);
    setInput('');

    setTimeout(() => {
      const botReplies = [
        'Perfeito! Vou verificar a disponibilidade para você. 😊',
        'Nossa tarifa inclui café da manhã das 6h às 10h. Posso reservar agora?',
        'Excelente escolha! Você prefere pagar via PIX ou cartão de crédito?',
        'Check-in a partir das 14h e checkout até as 11h. Confirmado?',
        'Obrigado pelo seu interesse! Vou te enviar os dados de pagamento em instantes.',
      ];
      const reply = botReplies[Math.floor(Math.random() * botReplies.length)];
      setMessages(prev => [...prev, { text: reply, type: 'out' as const, time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }]);
    }, 1000);
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-600">Simulador</p>
        <h2 className="text-xl font-black text-neutral-950">Testar WhatsApp Bot</h2>
        <p className="text-sm text-neutral-500">Simule uma conversa real com o assistente virtual do hotel.</p>
      </div>

      {/* Phone frame */}
      <div className="flex justify-center">
        <div className="w-full max-w-sm bg-neutral-100 rounded-[40px] p-3 shadow-2xl">
          {/* Status bar */}
          <div className="bg-[#075E54] rounded-[32px] overflow-hidden">
            <div className="px-4 py-3 flex items-center gap-3 border-b border-white/10">
              <div className="w-9 h-9 rounded-full bg-emerald-400 flex items-center justify-center font-black text-white text-sm">R</div>
              <div>
                <p className="text-white font-bold text-sm">Royal PMS Hotel</p>
                <p className="text-emerald-300 text-[10px]">online</p>
              </div>
            </div>
            {/* Messages area */}
            <div className="h-80 overflow-y-auto p-3 space-y-2" style={{ background: '#0c1a22 url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'%3E%3C/svg%3E")' }}>
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.type === 'out' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-3 py-2 rounded-xl text-xs leading-relaxed ${msg.type === 'out' ? 'bg-[#005C4B] text-white' : 'bg-[#202C33] text-white'}`}>
                    {msg.text}
                    <p className="text-[9px] text-white/50 mt-1 text-right">{msg.time}</p>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            {/* Input */}
            <div className="px-3 pb-3 flex items-center gap-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                placeholder="Mensagem"
                className="flex-1 bg-[#2A3942] text-white text-xs px-4 py-2.5 rounded-full border-0 outline-none placeholder-white/40"
              />
              <button onClick={sendMessage} className="w-9 h-9 bg-[#00A884] rounded-full flex items-center justify-center shrink-0">
                <Send className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Flow Builder Tab ─────────────────────────────────────────────────────────

function FlowBuilderTab() {
  const [flows] = useState([
    { id: '1', name: 'Saudação Inicial', trigger: 'Primeira mensagem', steps: 4, status: 'active', channel: 'WhatsApp' },
    { id: '2', name: 'Qualificação de Lead', trigger: 'Pergunta de preço', steps: 6, status: 'active', channel: 'WhatsApp' },
    { id: '3', name: 'Recuperação de Abandono', trigger: '24h sem resposta', steps: 3, status: 'inactive', channel: 'WhatsApp' },
    { id: '4', name: 'Pós Check-out NPS', trigger: 'Status: checked_out', steps: 5, status: 'active', channel: 'WhatsApp' },
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-600">Automações</p>
          <h2 className="text-xl font-black text-neutral-950">Flow Builder</h2>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-900 text-white text-sm font-bold hover:bg-neutral-800 transition-colors">
          <Plus className="w-4 h-4" /> Novo flow
        </button>
      </div>

      <div className="rounded-3xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
        {flows.map((flow, idx) => (
          <div key={flow.id} className={`flex items-center gap-4 p-4 sm:p-5 ${idx < flows.length - 1 ? 'border-b border-neutral-100' : ''}`}>
            <div className={`w-2 h-10 rounded-full shrink-0 ${flow.status === 'active' ? 'bg-emerald-400' : 'bg-neutral-200'}`} />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-neutral-900">{flow.name}</p>
              <p className="text-xs text-neutral-500">Trigger: {flow.trigger}</p>
            </div>
            <div className="hidden sm:flex items-center gap-6">
              <div className="text-center">
                <p className="font-black text-sm text-neutral-900">{flow.steps}</p>
                <p className="text-[10px] text-neutral-400">Passos</p>
              </div>
              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${flow.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-neutral-500'}`}>
                {flow.status === 'active' ? 'Ativo' : 'Inativo'}
              </span>
            </div>
            <button className="p-2 rounded-xl hover:bg-neutral-100 text-neutral-400 transition-colors">
              <Edit3 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Flow diagram preview */}
      <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h3 className="font-black text-sm text-neutral-900 mb-4">Pré-visualização: Saudação Inicial</h3>
        <div className="flex flex-col items-center gap-3">
          {[
            { icon: Bell, label: 'Trigger', desc: 'Primeira mensagem recebida', color: 'bg-amber-50 border-amber-200 text-amber-700' },
            { icon: Bot, label: 'Mensagem', desc: 'Boas-vindas + menu de opções', color: 'bg-blue-50 border-blue-200 text-blue-700' },
            { icon: Users, label: 'Condição', desc: 'Perguntou sobre preço?', color: 'bg-purple-50 border-purple-200 text-purple-700' },
            { icon: CheckCircle2, label: 'Ação', desc: 'Enviar tabela de tarifas', color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
          ].map((step, i) => (
            <div key={i} className="flex flex-col items-center w-full max-w-xs">
              <div className={`w-full px-4 py-3 rounded-2xl border ${step.color} flex items-center gap-3`}>
                <step.icon className="w-4 h-4 shrink-0" />
                <div>
                  <p className="text-[10px] font-black uppercase">{step.label}</p>
                  <p className="text-xs">{step.desc}</p>
                </div>
              </div>
              {i < 3 && <div className="w-0.5 h-4 bg-neutral-200" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Broadcasts Tab ───────────────────────────────────────────────────────────

function BroadcastsTab() {
  const [showForm, setShowForm] = useState(false);
  const [broadcasts] = useState([
    { id: '1', name: 'Promoção Maio - Hóspedes VIP', sent: 342, delivered: 339, read: 298, replied: 41, date: '2026-05-08', status: 'sent' },
    { id: '2', name: 'Confirmação Reservas Feriado', sent: 87, delivered: 87, read: 82, replied: 23, date: '2026-05-06', status: 'sent' },
    { id: '3', name: 'Campanha Aniversariantes Junho', sent: 0, delivered: 0, read: 0, replied: 0, date: '2026-06-01', status: 'scheduled' },
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-600">Disparos</p>
          <h2 className="text-xl font-black text-neutral-950">Broadcast Manager</h2>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-900 text-white text-sm font-bold hover:bg-neutral-800 transition-colors">
          <Send className="w-4 h-4" /> Novo disparo
        </button>
      </div>

      <div className="flex items-start gap-2 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium">
        <span className="shrink-0">⚠️</span>
        <span>Contatos com opt-out ativo são excluídos automaticamente dos envios (LGPD).</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total enviados', value: '429', icon: Send, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Taxa de leitura', value: '88%', icon: Eye, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Taxa de resposta', value: '18.8%', icon: MessageSquare, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Agendados', value: '1', icon: Calendar, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map(stat => (
          <div key={stat.label} className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm">
            <div className={`w-8 h-8 rounded-xl ${stat.bg} flex items-center justify-center mb-2`}>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </div>
            <p className={`text-xl font-black ${stat.color}`}>{stat.value}</p>
            <p className="text-[10px] text-neutral-500 font-medium">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
        {broadcasts.map((b, idx) => (
          <div key={b.id} className={`p-4 sm:p-5 ${idx < broadcasts.length - 1 ? 'border-b border-neutral-100' : ''}`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-bold text-sm text-neutral-900">{b.name}</p>
                <p className="text-xs text-neutral-500">{b.date}</p>
              </div>
              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${b.status === 'sent' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {b.status === 'sent' ? 'Enviado' : 'Agendado'}
              </span>
            </div>
            {b.sent > 0 && (
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Enviados', value: b.sent },
                  { label: 'Entregues', value: b.delivered },
                  { label: 'Lidos', value: b.read },
                  { label: 'Respondidos', value: b.replied },
                ].map(m => (
                  <div key={m.label} className="text-center p-2 rounded-xl bg-neutral-50">
                    <p className="font-black text-sm text-neutral-900">{m.value}</p>
                    <p className="text-[9px] text-neutral-400">{m.label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}


// ─── Integrações Tab ──────────────────────────────────────────────────────────

const SOCIAL_INTEGRATIONS: SocialIntegration[] = [
  { id: 'whatsapp', name: 'WhatsApp Business', description: 'Envio e recebimento de mensagens via API oficial Meta Cloud.', icon: <MessageSquare className="w-6 h-6" />, color: 'bg-emerald-500', colorHex: '#10b981', docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api', field: 'whatsappPhoneId' },
  { id: 'instagram', name: 'Instagram Professional', description: 'Responder DMs e comentários automaticamente com IA.', icon: <Instagram className="w-6 h-6" />, color: 'bg-pink-500', colorHex: '#ec4899', docsUrl: 'https://developers.facebook.com/docs/instagram-basic-display-api', field: 'instagramAccount' },
  { id: 'facebook', name: 'Facebook Pages', description: 'Gerenciar mensagens do Messenger e comentários em posts.', icon: <Facebook className="w-6 h-6" />, color: 'bg-blue-600', colorHex: '#2563eb', docsUrl: 'https://developers.facebook.com/docs/facebook-login/', field: 'facebookPage' },
  { id: 'email', name: 'E-mail SMTP', description: 'Enviar confirmações de reserva e notificações por e-mail.', icon: <Mail className="w-6 h-6" />, color: 'bg-amber-500', colorHex: '#f59e0b', docsUrl: '#', field: 'smtpHost' },
  { id: 'google', name: 'Google Reviews', description: 'Monitorar e responder avaliações do Google Meu Negócio.', icon: <Globe className="w-6 h-6" />, color: 'bg-red-500', colorHex: '#ef4444', docsUrl: 'https://developers.google.com/my-business', field: 'googleBusinessId' },
  { id: 'linkedin', name: 'LinkedIn', description: 'Publicar conteúdo e capturar leads corporativos.', icon: <Linkedin className="w-6 h-6" />, color: 'bg-sky-700', colorHex: '#0369a1', docsUrl: 'https://www.linkedin.com/developers/', field: 'linkedinPage' },
];

function IntegracoesTab() {
  const [statuses, setStatuses] = useState<Record<string, 'connected' | 'disconnected'>>(
    Object.fromEntries(SOCIAL_INTEGRATIONS.map(i => [i.id, 'disconnected']))
  );
  const [showSmtp, setShowSmtp] = useState(false);
  const [showWebhook, setShowWebhook] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState<SocialIntegration | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [smtpConfig, setSmtpConfig] = useState<SmtpConfig>({ host: '', port: '587', user: '', pass: '', fromName: 'Recepção Hotel' });
  const [pmsConfig, setPmsConfig] = useState<Record<string, PmsWebhook>>({
    cloudbeds: { webhookUrl: '', apiKey: '', enabled: false },
    mews: { webhookUrl: '', apiKey: '', enabled: false },
  });
  const [confirmEmail, setConfirmEmail] = useState('');

  function toggleConnect(id: string) {
    const integration = SOCIAL_INTEGRATIONS.find(i => i.id === id)!;
    if (statuses[id] === 'connected') {
      setStatuses(s => ({ ...s, [id]: 'disconnected' }));
      toast.success(`${integration.name} desconectado`);
    } else {
      if (id === 'email') { setShowSmtp(true); return; }
      setShowTokenModal(integration);
      setTokenInput('');
    }
  }

  function confirmToken() {
    if (!tokenInput.trim()) { toast.error('Informe o token/ID'); return; }
    if (!showTokenModal) return;
    setStatuses(s => ({ ...s, [showTokenModal.id]: 'connected' }));
    toast.success(`${showTokenModal.name} conectado com sucesso!`);
    setShowTokenModal(null);
    setTokenInput('');
  }

  function saveSmtp() {
    if (!smtpConfig.host || !smtpConfig.user) { toast.error('Host e usuário são obrigatórios'); return; }
    setStatuses(s => ({ ...s, email: 'connected' }));
    setShowSmtp(false);
    toast.success('Servidor de e-mail configurado!');
  }

  function savePmsWebhook(pmsId: string, config: PmsWebhook) {
    setPmsConfig(p => ({ ...p, [pmsId]: config }));
    toast.success(`Webhook ${pmsId} salvo!`);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-600">Integrações</p>
          <h2 className="text-xl font-black text-neutral-950">Conectar Canais & APIs</h2>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-200">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span className="text-xs font-bold text-emerald-700">Conexão via API Oficial</span>
        </div>
      </div>

      {/* Redes sociais */}
      <section className="space-y-4">
        <h3 className="text-sm font-black uppercase tracking-wider text-neutral-500">Redes Sociais & Canais</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SOCIAL_INTEGRATIONS.map(integration => {
            const isConnected = statuses[integration.id] === 'connected';
            return (
              <motion.article key={integration.id} whileHover={{ y: -2 }} className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 rounded-2xl ${integration.color} flex items-center justify-center text-white shadow-sm`}>
                    {integration.icon}
                  </div>
                  <span className={`flex items-center gap-1.5 text-[9px] font-black uppercase px-2.5 py-1 rounded-full ${isConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-neutral-500'}`}>
                    {isConnected ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                    {isConnected ? 'Conectado' : 'Desconectado'}
                  </span>
                </div>
                <h4 className="font-black text-sm text-neutral-900 mb-1">{integration.name}</h4>
                <p className="text-xs text-neutral-500 leading-relaxed mb-5">{integration.description}</p>
                <div className="flex items-center justify-between pt-4 border-t border-neutral-100">
                  {!isConnected && (
                    <a href={integration.docsUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[9px] font-bold text-neutral-400 hover:text-amber-600 transition-colors">
                      <ExternalLink className="w-3 h-3" /> Docs
                    </a>
                  )}
                  {isConnected && (
                    <button onClick={() => { toast.info('Verificando conexão...'); setTimeout(() => toast.success('Conexão ativa!'), 1200); }} className="flex items-center gap-1 text-[9px] font-bold text-neutral-400 hover:text-amber-600 transition-colors">
                      <RefreshCcw className="w-3 h-3" /> Testar
                    </button>
                  )}
                  <button
                    onClick={() => toggleConnect(integration.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${isConnected ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-neutral-900 text-white hover:bg-neutral-800'}`}
                  >
                    {isConnected ? 'Desconectar' : 'Conectar'}
                  </button>
                </div>
              </motion.article>
            );
          })}
        </div>
      </section>

      {/* Webhooks PMS */}
      <section className="space-y-4">
        <h3 className="text-sm font-black uppercase tracking-wider text-neutral-500">Integração PMS Externo</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { id: 'cloudbeds', name: 'Cloudbeds', icon: <Database className="w-6 h-6" />, color: '#6366f1' },
            { id: 'mews', name: 'Mews', icon: <Cloud className="w-6 h-6" />, color: '#10b981' },
          ].map(pms => {
            const cfg = pmsConfig[pms.id] ?? { webhookUrl: '', apiKey: '', enabled: false };
            return (
              <div key={pms.id} className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ background: pms.color }}>{pms.icon}</div>
                  <div>
                    <p className="font-black text-sm text-neutral-900">{pms.name}</p>
                    <p className="text-[10px] text-neutral-500">Webhook Outbound</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">Webhook URL</label>
                    <input value={cfg.webhookUrl} onChange={e => savePmsWebhook(pms.id, { ...cfg, webhookUrl: e.target.value })} placeholder={`https://api.${pms.id}.com/v1/webhooks/...`} className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none font-mono text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">API Key</label>
                    <input type="password" value={cfg.apiKey} onChange={e => savePmsWebhook(pms.id, { ...cfg, apiKey: e.target.value })} placeholder="••••••••" className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none font-mono text-xs" />
                  </div>
                  <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl bg-neutral-50">
                    <div onClick={() => savePmsWebhook(pms.id, { ...cfg, enabled: !cfg.enabled })} className={`w-9 h-5 rounded-full transition-all cursor-pointer ${cfg.enabled ? 'bg-amber-500' : 'bg-neutral-300'}`}>
                      <div className={`w-3.5 h-3.5 bg-white rounded-full shadow mt-0.5 transition-transform ${cfg.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </div>
                    <span className="text-xs font-bold text-neutral-700">Envio automático de confirmações</span>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Webhooks URLs do sistema */}
      <section className="space-y-4">
        <h3 className="text-sm font-black uppercase tracking-wider text-neutral-500">Endpoints Webhook Inbound</h3>
        <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4">
          <p className="text-xs text-neutral-500">Configure essas URLs no Meta Developer Portal para receber mensagens em tempo real.</p>
          {['whatsapp', 'instagram', 'facebook'].map(ch => (
            <div key={ch} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">{ch.charAt(0).toUpperCase() + ch.slice(1)} Webhook</label>
                <div className="flex items-center gap-2 px-4 py-3 bg-neutral-50 rounded-xl">
                  <p className="text-xs font-mono text-neutral-600 flex-1 truncate">{`${window.location.origin}/api/webhooks/${ch}`}</p>
                  <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/api/webhooks/${ch}`); toast.success('URL copiada!'); }} className="shrink-0 p-1.5 rounded-lg bg-white border border-neutral-200 text-neutral-500 hover:bg-neutral-100">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* E-mail de confirmação */}
      <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
            <Mail className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="font-black text-sm text-neutral-900">E-mail de Confirmação de Reserva</p>
            <p className="text-xs text-neutral-500">Notificar o gerente quando o bot confirmar uma reserva</p>
          </div>
        </div>
        <div className="flex gap-3">
          <input type="email" value={confirmEmail} onChange={e => setConfirmEmail(e.target.value)} placeholder="gerente@hotel.com" className="flex-1 px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
          <button onClick={() => { if (!confirmEmail) { toast.error('Informe o e-mail'); return; } toast.success('E-mail de confirmação salvo!'); }} className="px-5 py-3 bg-neutral-900 text-white rounded-xl text-sm font-bold hover:bg-neutral-800 transition-colors flex items-center gap-2">
            <Save className="w-4 h-4" /> Salvar
          </button>
        </div>
      </section>

      {/* Token modal */}
      <AnimatePresence>
        {showTokenModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowTokenModal(null)} className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-2xl ${showTokenModal.color} flex items-center justify-center text-white`}>{showTokenModal.icon}</div>
                  <h3 className="text-lg font-black text-neutral-950">{showTokenModal.name}</h3>
                </div>
                <button onClick={() => setShowTokenModal(null)} className="p-2 rounded-xl bg-neutral-100 text-neutral-500"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">
                    {showTokenModal.id === 'instagram' ? 'ID da Conta Instagram' : showTokenModal.id === 'facebook' ? 'ID da Página Facebook' : showTokenModal.id === 'google' ? 'ID do Google Meu Negócio' : showTokenModal.id === 'linkedin' ? 'ID da Página LinkedIn' : 'Phone ID / Access Token'}
                  </label>
                  <input
                    value={tokenInput}
                    onChange={e => setTokenInput(e.target.value)}
                    placeholder={showTokenModal.id === 'whatsapp' ? '106988195493619' : showTokenModal.id === 'instagram' ? '17841400008460056' : 'Cole o ID ou token aqui'}
                    className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm font-mono border-0 focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>
                <p className="text-xs text-neutral-500 leading-relaxed">
                  Obtenha esse ID no{' '}
                  <a href={showTokenModal.docsUrl} target="_blank" rel="noreferrer" className="text-amber-600 font-bold hover:underline">
                    portal de desenvolvedores <ExternalLink className="w-3 h-3 inline" />
                  </a>
                </p>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowTokenModal(null)} className="flex-1 py-3 bg-neutral-100 rounded-xl text-sm font-bold text-neutral-600">Cancelar</button>
                  <button onClick={confirmToken} className="flex-1 py-3 bg-neutral-900 text-white rounded-xl text-sm font-bold hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2">
                    <Link2 className="w-4 h-4" /> Conectar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* SMTP modal */}
      <AnimatePresence>
        {showSmtp && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSmtp(false)} className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative w-full max-w-lg bg-white rounded-3xl p-6 sm:p-8 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-black text-neutral-950">Configurar Servidor E-mail</h3>
                <button onClick={() => setShowSmtp(false)} className="p-2 rounded-xl bg-neutral-100 text-neutral-500"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">Host SMTP</label>
                    <input value={smtpConfig.host} onChange={e => setSmtpConfig(c => ({ ...c, host: e.target.value }))} placeholder="smtp.gmail.com" className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">Porta</label>
                    <input value={smtpConfig.port} onChange={e => setSmtpConfig(c => ({ ...c, port: e.target.value }))} placeholder="587" className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">Usuário / E-mail</label>
                  <input value={smtpConfig.user} onChange={e => setSmtpConfig(c => ({ ...c, user: e.target.value }))} placeholder="hotel@gmail.com" className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">Senha / App Password</label>
                  <input type="password" value={smtpConfig.pass} onChange={e => setSmtpConfig(c => ({ ...c, pass: e.target.value }))} placeholder="••••••••••••" className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">Nome do Remetente</label>
                  <input value={smtpConfig.fromName} onChange={e => setSmtpConfig(c => ({ ...c, fromName: e.target.value }))} placeholder="Recepção Royal PMS" className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowSmtp(false)} className="flex-1 py-3 bg-neutral-100 rounded-xl text-sm font-bold text-neutral-600">Cancelar</button>
                  <button onClick={saveSmtp} className="flex-1 py-3 bg-neutral-900 text-white rounded-xl text-sm font-bold hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2">
                    <Save className="w-4 h-4" /> Salvar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

const TABS = [
  { id: 'inbox', label: 'Omni-Inbox', icon: Inbox },
  { id: 'campaigns', label: 'Campanhas', icon: Megaphone },
  { id: 'broadcasts', label: 'Disparos', icon: Send },
  { id: 'flows', label: 'Automações', icon: Zap },
  { id: 'templates', label: 'Templates', icon: Layers },
  { id: 'crm', label: 'CRM', icon: Users },
  { id: 'nps', label: 'NPS', icon: Heart },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'simulator', label: 'Simulador', icon: Smartphone },
  { id: 'training', label: 'Treinamento', icon: Bot },
  { id: 'financeiro', label: 'Financeiro', icon: QrCode },
  { id: 'integracoes', label: 'Integrações', icon: Link2 },
] as const;

type TabId = typeof TABS[number]['id'];

export default function MarketingModuleDashboard({ profile }: MarketingModuleDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabId>('inbox');

  const totalLeads = SEED_LEADS.length;
  const newLeads = SEED_LEADS.filter(l => l.status === 'new').length;
  const needsHuman = SEED_LEADS.filter(l => l.status === 'needs_human').length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="rounded-3xl border border-neutral-200 bg-white p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] sm:text-xs font-black uppercase tracking-[0.28em] text-amber-600">Marketing & CRM</p>
            <h1 className="mt-1 text-xl sm:text-2xl font-black text-neutral-950">HospedaAI — Central de Marketing</h1>
            <p className="mt-1 text-xs sm:text-sm text-neutral-500">
              Omni-inbox, campanhas, automações, NPS e IA para maximizar conversões.
            </p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <div className="flex flex-col items-center px-4 py-2 rounded-2xl bg-amber-50">
              <span className="text-lg font-black text-amber-700">{newLeads}</span>
              <span className="text-[9px] font-bold text-amber-600 uppercase">Novos</span>
            </div>
            <div className="flex flex-col items-center px-4 py-2 rounded-2xl bg-red-50">
              <span className="text-lg font-black text-red-700">{needsHuman}</span>
              <span className="text-[9px] font-bold text-red-600 uppercase">Humano</span>
            </div>
            <div className="flex flex-col items-center px-4 py-2 rounded-2xl bg-neutral-50">
              <span className="text-lg font-black text-neutral-700">{totalLeads}</span>
              <span className="text-[9px] font-bold text-neutral-500 uppercase">Total</span>
            </div>
          </div>
        </div>
      </header>

      {/* Tab navigation */}
      <nav className="max-w-full overflow-x-auto scrollbar-none">
        <div className="flex gap-2 pb-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === tab.id ? 'bg-neutral-900 text-white' : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}
            >
              <tab.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Tab content */}
      <div>
        {activeTab === 'inbox' && <LeadInboxTab />}
        {activeTab === 'campaigns' && <CampaignsTab />}
        {activeTab === 'broadcasts' && <BroadcastsTab />}
        {activeTab === 'flows' && <FlowBuilderTab />}
        {activeTab === 'templates' && <TemplatesTab />}
        {activeTab === 'crm' && <CRMTab />}
        {activeTab === 'nps' && <NPSTab />}
        {activeTab === 'analytics' && <AnalyticsTab />}
        {activeTab === 'simulator' && <SimulatorTab />}
        {activeTab === 'training' && <BotTrainingTab />}
        {activeTab === 'financeiro' && <FinanceiroTab />}
        {activeTab === 'integracoes' && <IntegracoesTab />}
      </div>
    </div>
  );
}
