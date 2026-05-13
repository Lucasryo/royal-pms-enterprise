import { useState, useEffect, useRef } from 'react';
import type { Lead, Message } from '../../types/marketing';
import { SEED_LEADS } from '../../constants/marketingSeeds';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import {
  Search, CheckCircle2, Send, Sparkles, Smile, Meh, Frown, Inbox,
  MessageSquare, Instagram, Facebook, Twitter, Linkedin, Video, Globe, Mail,
} from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

const CHANNELS = [
  { id: 'whatsapp', icon: <MessageSquare className="w-3 h-3" />, color: '#10b981', name: 'WhatsApp' },
  { id: 'instagram', icon: <Instagram className="w-3 h-3" />, color: '#e11d48', name: 'Instagram' },
  { id: 'facebook', icon: <Facebook className="w-3 h-3" />, color: '#3b82f6', name: 'Facebook' },
  { id: 'twitter', icon: <Twitter className="w-3 h-3" />, color: '#0a0a0a', name: 'X / Twitter' },
  { id: 'linkedin', icon: <Linkedin className="w-3 h-3" />, color: '#0ea5e9', name: 'LinkedIn' },
  { id: 'tiktok', icon: <Video className="w-3 h-3" />, color: '#0a0a0a', name: 'TikTok' },
  { id: 'google', icon: <Globe className="w-3 h-3" />, color: '#0ea5e9', name: 'Google Reviews' },
  { id: 'email', icon: <Mail className="w-3 h-3" />, color: '#f59e0b', name: 'E-mail' },
];

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

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

export function LeadInboxTab() {
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
  const [emailSubject, setEmailSubject] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
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

  async function sendMessage() {
    if (!messageInput.trim() || !selectedId) return;
    const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    if (selected?.channel === 'email') {
      if (!emailSubject.trim()) { toast.error('Informe o assunto do e-mail'); return; }
      if (!selected.email) { toast.error('Este contato não tem e-mail cadastrado'); return; }
      setSendingEmail(true);
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: selected.email, subject: emailSubject, body: messageInput }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error ?? 'Falha ao enviar e-mail');
        toast.success('E-mail enviado!');
        setEmailSubject('');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erro ao enviar e-mail');
        setSendingEmail(false);
        return;
      }
      setSendingEmail(false);
    }

    const msg: Message = { text: messageInput, type: 'out', time: now };
    setChatHistory(prev => ({ ...prev, [selectedId]: [...(prev[selectedId] ?? []), msg] }));
    setLeads(prev => prev.map(l => l.id === selectedId ? { ...l, lastMessage: messageInput, status: 'ai_responded' as const } : l));
    setMessageInput('');
  }

  function markResolved() {
    if (!selectedId) return;
    setLeads(prev => prev.map(l => l.id === selectedId ? { ...l, status: 'resolved' as const, unreadCount: 0 } : l));
    toast.success('Conversa resolvida');
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
          <div className="p-4 border-t border-neutral-100 flex flex-col gap-2">
            {selected?.channel === 'email' && (
              <input
                value={emailSubject}
                onChange={e => setEmailSubject(e.target.value)}
                placeholder="Assunto do e-mail..."
                className="w-full px-4 py-2 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none"
              />
            )}
            <div className="flex items-end gap-3">
            <textarea
              value={messageInput}
              onChange={e => setMessageInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder={selected?.channel === 'email' ? 'Corpo do e-mail...' : 'Escreva uma mensagem...'}
              rows={2}
              className="flex-1 resize-none px-4 py-2.5 bg-neutral-50 rounded-2xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none"
            />
            <button
              onClick={sendMessage}
              disabled={!messageInput.trim() || sendingEmail}
              className="p-3 bg-neutral-900 text-white rounded-2xl hover:bg-neutral-800 disabled:opacity-40 transition-all"
            >
              <Send className="w-4 h-4" />
            </button>
            </div>
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
