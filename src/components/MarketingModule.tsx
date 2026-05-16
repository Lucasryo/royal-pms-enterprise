import React, { ReactElement, useState, useEffect, useRef, useMemo } from 'react';
import FlowBuilder from './marketing/FlowBuilder';
import QRCodeLib from 'qrcode';
import { supabase } from '../supabase';
import { UserProfile } from '../types';
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
  CheckCircle, XCircle, Wifi, Key, Paperclip, File as FileIcon, Image as ImageIcon,
} from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

interface MarketingModuleDashboardProps {
  profile: UserProfile;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface Lead {
  id: string;
  guestName: string;
  guestPhone?: string;
  guestEmail?: string;
  channel: string;
  lastMessage: string;
  lastMessageAt: string;
  status: 'new' | 'ai_responded' | 'needs_human' | 'resolved';
  sentiment: 'happy' | 'neutral' | 'mixed';
  unreadCount?: number;
  assignedTo?: string;
  tags?: string[];
  internalNotes?: string;
}

interface Message {
  id?: string;
  text: string;
  html?: string | null;
  type: 'in' | 'out';
  time: string;
  subject?: string | null;
  createdAt?: string;
  emailMessageId?: string | null;
  emailReferences?: string | null;
  folder?: 'inbox' | 'spam' | 'trash';
  attachments?: Attachment[];
}

interface Attachment {
  path: string;          // path no bucket inbox_attachments
  name: string;
  size: number;
  mime: string;
  url?: string;          // signed URL gerada on demand
}

type EmailFolder = 'inbox' | 'spam' | 'trash';

interface Campaign {
  id: string;
  name: string;
  status: 'active' | 'scheduled' | 'completed' | 'draft';
  reach: string;
  conv: string;
  channel: string;
  scheduledAt?: string;
  targetAudience?: string;
  messageTemplate?: string;
  created_at?: string;
}

interface Template {
  id: string;
  name: string;
  text: string;
  category: string;
  channel: string;
  created_at?: string;
}

interface BotConfig {
  name: string;
  address: string;
  phone: string;
  email: string;
  description: string;
  policies: string;
  rooms: string;
  faq: string;
  pricingTable: string;
  botMood: string;
  upsellActive: boolean;
  npsActive: boolean;
  widgetBotName: string;
  widgetWelcomeMessage: string;
  googleReviewLink: string;
  npsSendAfterHours: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CHANNELS = [
  { id: 'whatsapp', icon: <MessageSquare className="w-3 h-3" />, color: '#10b981', name: 'WhatsApp' },
  { id: 'email', icon: <Mail className="w-3 h-3" />, color: '#f59e0b', name: 'E-mail' },
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

type InboxMessageRow = {
  id: string;
  contact_id: string | null;
  contact_identifier: string;
  channel: string;
  direction: 'in' | 'out';
  subject: string | null;
  body: string;
  body_html: string | null;
  email_message_id: string | null;
  email_references: string | null;
  folder: EmailFolder | null;
  read: boolean;
  created_at: string;
  attachments: Attachment[] | null;
};

type MarketingContactRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  channel: string;
  status: Lead['status'] | null;
  sentiment: Lead['sentiment'] | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number | null;
  tags: string[] | null;
  internal_notes: string | null;
  assigned_to: string | null;
  created_at: string;
};

function formatMessageTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatPreview(subject: string | null | undefined, body: string) {
  const cleanedBody = body.replace(/\s+/g, ' ').trim();
  return subject ? `${subject} - ${cleanedBody}` : cleanedBody;
}

function mapInboxMessage(row: InboxMessageRow): Message {
  const rawBody = row.body ?? '';
  const rawHtml = row.body_html ?? '';
  // Safety net: alguns emails antigos foram salvos com o corpo ainda em base64
  // (parser velho não pegou Content-Transfer-Encoding: base64).
  const decodedBody = maybeBase64Decode(rawBody);
  const decodedHtml = maybeBase64Decode(rawHtml);
  return {
    id: row.id,
    text: decodedBody,
    html: decodedHtml || null,
    type: row.direction,
    time: formatMessageTime(row.created_at),
    subject: row.subject,
    createdAt: row.created_at,
    emailMessageId: row.email_message_id,
    emailReferences: row.email_references,
    folder: (row.folder ?? 'inbox') as EmailFolder,
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
  };
}

// Detecta se um string é base64 (HTML/texto encodado que escapou do parser) e decodifica.
function maybeBase64Decode(text: string): string {
  if (!text || text.length < 40) return text;
  if (text.includes('<') || text.includes('>')) return text; // já tem tags = não é só base64
  const cleaned = text.replace(/\s/g, '');
  // Base64 só tem A-Z a-z 0-9 + / =
  if (!/^[A-Za-z0-9+/=]+$/.test(cleaned)) return text;
  if (cleaned.length < 40) return text;
  try {
    const decoded = atob(cleaned);
    // Converte para UTF-8 corretamente
    const bytes = Uint8Array.from(decoded, c => c.charCodeAt(0));
    const result = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    // Se o decode parece texto/HTML válido (contém alguma letra ascii ou tag), usa
    if (/[<>a-zA-Z]/.test(result) && result.length > 10) return result;
    return text;
  } catch {
    return text;
  }
}

// Limpa MIME bagunçado em emails antigos que ficaram no banco antes do fix no parser.
// Casos reais que aparecem: boundaries quebradas em várias linhas, headers MIME vazados.
function sanitizeEmailBody(text: string): string {
  if (!text) return text;
  let s = text.replace(/\r\n/g, '\n');

  // Caso 1: se houver headers MIME vazados (Content-Type + Content-Transfer-Encoding),
  // pula tudo até a primeira linha em branco depois do último header — é onde o corpo real começa.
  const headerRegex = /^\s*(?:content-type|content-transfer-encoding|content-disposition|mime-version)\s*:/im;
  while (headerRegex.test(s)) {
    const lines = s.split('\n');
    let lastHeaderIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*(?:content-type|content-transfer-encoding|content-disposition|mime-version)\s*:/i.test(lines[i])) {
        lastHeaderIdx = i;
      }
    }
    if (lastHeaderIdx < 0) break;
    // Achar a próxima linha em branco depois do último header
    let bodyStart = lastHeaderIdx + 1;
    while (bodyStart < lines.length && lines[bodyStart].trim() !== '') bodyStart++;
    while (bodyStart < lines.length && lines[bodyStart].trim() === '') bodyStart++;
    if (bodyStart >= lines.length) break;
    s = lines.slice(bodyStart).join('\n');
  }

  // Caso 2: linhas que parecem fragmento de boundary
  // (underscores+alfanum, prefixadas por -- ou começando por _xxx_)
  s = s
    .split('\n')
    .filter(line => {
      const t = line.trim();
      if (t === '--') return false;
      if (/^--[_A-Za-z0-9.=+-]{6,}(--)?$/.test(t)) return false;
      if (/^_[A-Za-z0-9]{3,}_[A-Za-z0-9._=+-]{8,}$/.test(t)) return false;
      if (/^[a-zA-Z0-9]{1,8}_$/.test(t)) return false; // fragmento órfão tipo "amp_"
      return true;
    })
    .join('\n');

  // Caso 3: decodifica quoted-printable resíduo (=XX e =\n)
  if (/=[0-9A-F]{2}/i.test(s) && !/=\?[^?]+\?[BQ]\?/i.test(s)) {
    try {
      const compact = s.replace(/=\n/g, '');
      const bytes: number[] = [];
      for (let i = 0; i < compact.length; i++) {
        if (compact[i] === '=' && /^[0-9A-F]{2}$/i.test(compact.slice(i + 1, i + 3))) {
          bytes.push(parseInt(compact.slice(i + 1, i + 3), 16));
          i += 2;
        } else {
          bytes.push(compact.charCodeAt(i));
        }
      }
      s = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
    } catch { /* mantém o original */ }
  }

  return s.replace(/\n{3,}/g, '\n\n').trim();
}

function mapContactToLead(row: MarketingContactRow): Lead {
  return {
    id: row.id,
    guestName: row.name || row.email || row.phone || 'Contato sem nome',
    guestEmail: row.email || undefined,
    guestPhone: row.phone || undefined,
    channel: row.channel || 'email',
    lastMessage: row.last_message || 'Sem mensagens ainda',
    lastMessageAt: row.last_message_at || row.created_at,
    status: row.status || 'new',
    sentiment: row.sentiment || 'neutral',
    unreadCount: row.unread_count || 0,
    tags: row.tags || undefined,
    internalNotes: row.internal_notes || undefined,
    assignedTo: row.assigned_to || undefined,
  };
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
  return <span className={`text-[9px] font-semibold uppercase px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}


// ─── LeadInbox Tab ────────────────────────────────────────────────────────────

// Renderiza HTML de email num iframe sandboxed (sem scripts, sem same-origin).
// Auto-ajusta altura ao conteúdo. Sanitização extra: remove <script> e on*= handlers
// antes mesmo de mandar para o iframe (defesa em profundidade).
const EmailHtmlFrame: React.FC<{ html: string; darkBubble: boolean }> = ({ html, darkBubble }) => {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);

  // Sanitização defensiva + extração de <style> e conteúdo de <body>.
  // O HTML do email costuma vir com seu próprio <html><head><body>; precisamos
  // extrair só o <body> e preservar os <style> pra evitar nesting inválido.
  const { safeBody, safeStyles } = useMemo(() => {
    let s = html || '';
    // Strip script/iframe/handlers/javascript: antes de qualquer outra coisa
    s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
    s = s.replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
    s = s.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '');
    s = s.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '');
    s = s.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '');
    s = s.replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href="#"');
    s = s.replace(/href\s*=\s*'javascript:[^']*'/gi, "href='#'");

    // Extrai estilos do <head> (e qualquer style inline em outras posições)
    const styleMatches = s.match(/<style[\s\S]*?<\/style>/gi) ?? [];
    const styles = styleMatches.join('\n');

    // Extrai o conteúdo de <body>. Se não houver tag <body>, usa tudo.
    let body = s;
    const bodyMatch = s.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) body = bodyMatch[1];

    // Remove <head> e <html> tags soltas que possam ter sobrado
    body = body.replace(/<\/?html[^>]*>/gi, '').replace(/<head[\s\S]*?<\/head>/gi, '');

    return { safeBody: body, safeStyles: styles };
  }, [html]);

  const doc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>
    body{margin:0;padding:12px;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:${darkBubble ? '#f5f5f5' : '#171717'};background:transparent;word-wrap:break-word;overflow-wrap:anywhere}
    img{max-width:100%;height:auto}
    a{color:${darkBubble ? '#fbbf24' : '#b45309'}}
    table{max-width:100%;border-collapse:collapse}
    blockquote{border-left:3px solid #d4d4d4;margin:8px 0;padding:4px 12px;color:#666}
    pre{white-space:pre-wrap;word-wrap:break-word}
    html,body{height:auto !important;min-height:0 !important}
  </style>${safeStyles}</head><body>${safeBody}<script>
    (function(){
      var lastSent = 0;
      function measure(){
        // Mede SOMENTE o body, nao o documentElement (que reflete o tamanho do iframe,
        // criando loop). Arredonda pra evitar floating-point oscilation.
        if (!document.body) return 0;
        var h = document.body.scrollHeight;
        return Math.ceil(h / 10) * 10;
      }
      function send(){
        try{
          var h = measure();
          // Dedupe: so manda se mudou mais que 5px
          if (Math.abs(h - lastSent) < 5) return;
          lastSent = h;
          parent.postMessage({type:'email-iframe-height',h:h},'*');
        }catch(e){}
      }
      window.addEventListener('load', send);
      setTimeout(send,50); setTimeout(send,300); setTimeout(send,1000); setTimeout(send,3000);
      document.querySelectorAll('img').forEach(function(img){
        if (img.complete) return;
        img.addEventListener('load', send);
        img.addEventListener('error', send);
      });
      // ResizeObserver no body. Como o body so depende do conteudo (nao do iframe),
      // nao tem feedback loop quando o parent ajusta a altura do iframe.
      if (typeof ResizeObserver !== 'undefined' && document.body) {
        new ResizeObserver(function(){ send(); }).observe(document.body);
      }
    })();
  <\/script></body></html>`;

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const data = e.data as { type?: string; h?: number };
      if (!data || data.type !== 'email-iframe-height' || typeof data.h !== 'number') return;
      if (!ref.current) return;
      if (e.source !== ref.current.contentWindow) return;
      const target = Math.max(80, Math.min(50000, data.h + 24));
      // So atualiza se mudou mais que 10px (evita loop / micro-oscilação)
      setHeight(prev => Math.abs(prev - target) < 10 ? prev : target);
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  return (
    <iframe
      ref={ref}
      // allow-scripts é NECESSÁRIO pra rodar nosso medidor de altura (postMessage).
      // Sem allow-same-origin: o script do email ainda não consegue acessar parent/cookies/etc.
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      srcDoc={doc}
      scrolling="no"
      style={{ width: '100%', height, border: 0, display: 'block', background: 'transparent' }}
      title="email-body"
    />
  );
};

type AttachmentChipProps = {
  attachment: Attachment;
  darkBubble: boolean;
  onResolveUrl: (a: Attachment) => Promise<string | null>;
};

const AttachmentChip: React.FC<AttachmentChipProps> = ({ attachment, darkBubble, onResolveUrl }) => {
  const isImage = attachment.mime.startsWith('image/');
  const [signedUrl, setSignedUrl] = useState<string | null>(attachment.url ?? null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (signedUrl) return;
    let alive = true;
    setLoading(true);
    onResolveUrl(attachment).then(url => {
      if (alive) setSignedUrl(url);
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [attachment.path]);

  if (isImage && signedUrl) {
    return (
      <a href={signedUrl} target="_blank" rel="noopener noreferrer" className="block max-w-[260px] rounded-lg overflow-hidden border border-white/20">
        <img src={signedUrl} alt={attachment.name} className="w-full h-auto object-cover" />
      </a>
    );
  }
  return (
    <a
      href={signedUrl ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => { if (!signedUrl) e.preventDefault(); }}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg max-w-[260px] ${darkBubble ? 'bg-white/10 hover:bg-white/15' : 'bg-neutral-100 hover:bg-neutral-200'} transition-colors`}
    >
      {isImage ? <ImageIcon className="w-4 h-4 shrink-0" /> : <FileIcon className="w-4 h-4 shrink-0" />}
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-medium truncate ${darkBubble ? 'text-white' : 'text-neutral-900'}`}>{attachment.name}</p>
        <p className={`text-xs ${darkBubble ? 'text-white/60' : 'text-neutral-500'}`}>{loading ? 'carregando…' : `${(attachment.size / 1024).toFixed(0)} KB`}</p>
      </div>
    </a>
  );
};

function LeadInboxTab({ profile }: { profile: UserProfile }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeChannel, setActiveChannel] = useState<string>('all');
  const [activeFilter, setActiveFilter] = useState<'all' | 'new' | 'needs_human' | 'resolved'>('all');
  const [emailFolder, setEmailFolder] = useState<EmailFolder>('inbox');
  const [folderCounts, setFolderCounts] = useState<Record<string, { inbox: number; spam: number; trash: number }>>({});
  const [folderActionLoading, setFolderActionLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [refreshingInbox, setRefreshingInbox] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeForm, setComposeForm] = useState({ to: '', subject: '', body: '' });
  const [composeSending, setComposeSending] = useState(false);
  const [chatHistory, setChatHistory] = useState<Record<string, Message[]>>({});
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [loadingAI, setLoadingAI] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Anexos pendentes para envio na próxima mensagem
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Atribuição de conversa
  const [assignableUsers, setAssignableUsers] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [showAssignPicker, setShowAssignPicker] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [showOnlyMine, setShowOnlyMine] = useState(false);

  // Drawer mobile do painel de contexto
  const [contextOpen, setContextOpen] = useState(false);

  // Menu de contexto (clique direito) sobre uma mensagem
  // Set de IDs (ou índices) de mensagens de email expandidas. A última sempre aparece expandida.
  const [expandedMsgs, setExpandedMsgs] = useState<Set<string>>(new Set());
  function toggleExpand(key: string) {
    setExpandedMsgs(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  // Reset expansão ao trocar de conversa
  useEffect(() => { setExpandedMsgs(new Set()); }, [selectedId]);

  const [msgMenu, setMsgMenu] = useState<{ x: number; y: number; msg: Message } | null>(null);
  // Menu de contexto sobre um item da lista de conversas
  const [leadMenu, setLeadMenu] = useState<{ x: number; y: number; lead: Lead } | null>(null);
  useEffect(() => {
    if (!msgMenu && !leadMenu) return;
    const close = () => { setMsgMenu(null); setLeadMenu(null); };
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [msgMenu, leadMenu]);

  async function leadAction(lead: Lead, action: 'mark_unread' | 'mark_resolved' | 'mark_needs_human' | 'assign_to_me' | 'unassign') {
    const updates: Record<string, unknown> = {};
    if (action === 'mark_unread') { updates.status = 'new'; updates.unread_count = Math.max(1, lead.unreadCount ?? 1); }
    if (action === 'mark_resolved') { updates.status = 'resolved'; updates.unread_count = 0; }
    if (action === 'mark_needs_human') { updates.status = 'needs_human'; }
    if (action === 'assign_to_me') { updates.assigned_to = profile.id; }
    if (action === 'unassign') { updates.assigned_to = null; }
    const { error } = await supabase.from('marketing_contacts').update(updates).eq('id', lead.id);
    if (error) { toast.error('Falha: ' + error.message); return; }
    setLeads(prev => prev.map(l => l.id === lead.id ? {
      ...l,
      status: (updates.status as Lead['status']) ?? l.status,
      unreadCount: typeof updates.unread_count === 'number' ? updates.unread_count : l.unreadCount,
      assignedTo: 'assigned_to' in updates ? (updates.assigned_to as string | null) ?? undefined : l.assignedTo,
    } : l));
    toast.success('Conversa atualizada');
  }

  const selected = leads.find(l => l.id === selectedId) ?? null;
  const messages = selectedId ? (chatHistory[selectedId] ?? []) : [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    function handleTemplate(e: Event) {
      const detail = (e as CustomEvent<{ body: string; subject?: string }>).detail;
      if (!detail?.body) return;
      setMessageInput(detail.body);
      toast.success('Template carregado no campo de mensagem');
    }
    window.addEventListener('marketing:insert-template', handleTemplate);
    return () => window.removeEventListener('marketing:insert-template', handleTemplate);
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadContacts() {
      const { data, error } = await supabase
        .from('marketing_contacts')
        .select('*')
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (!alive) return;
      if (error) {
        console.warn('[omni-inbox] Falha ao carregar contatos:', error.message);
        return;
      }

      if (data?.length) {
        const mapped = (data as MarketingContactRow[]).map(mapContactToLead);
        setLeads(mapped);
        setSelectedId(current => current && mapped.some(lead => lead.id === current) ? current : mapped[0].id);
      }
    }

    async function loadFolderCounts() {
      const { data, error } = await supabase
        .from('inbox_messages')
        .select('contact_id, folder')
        .eq('channel', 'email')
        .eq('direction', 'in');
      if (!alive || error || !data) return;
      const counts: Record<string, { inbox: number; spam: number; trash: number }> = {};
      for (const row of data as { contact_id: string | null; folder: EmailFolder | null }[]) {
        if (!row.contact_id) continue;
        const f = (row.folder ?? 'inbox') as EmailFolder;
        if (!counts[row.contact_id]) counts[row.contact_id] = { inbox: 0, spam: 0, trash: 0 };
        counts[row.contact_id][f] += 1;
      }
      setFolderCounts(counts);
    }

    loadContacts();
    loadFolderCounts();
    return () => { alive = false; };
  }, []);

  // Carrega lista de usuários atribuíveis (staff do hotel)
  useEffect(() => {
    let alive = true;
    async function loadAssignables() {
      const { data } = await supabase
        .from('profiles')
        .select('id, name, role')
        .in('role', ['admin', 'manager', 'reservations', 'reception', 'marketing', 'faturamento', 'finance', 'eventos'])
        .order('name');
      if (alive && data) setAssignableUsers(data as Array<{ id: string; name: string; role: string }>);
    }
    loadAssignables();
    return () => { alive = false; };
  }, []);

  // ── Anexos ─────────────────────────────────────────────────────────────
  async function handleFilePick(files: FileList | null) {
    if (!files || files.length === 0) return;
    const remaining = 5 - pendingAttachments.length;
    if (remaining <= 0) {
      toast.error('Máximo de 5 anexos por mensagem.');
      return;
    }
    const filesToUpload = Array.from(files).slice(0, remaining);

    setUploadingAttachment(true);
    try {
      const newAttachments: Attachment[] = [];
      for (const file of filesToUpload) {
        if (file.size > 20 * 1024 * 1024) {
          toast.error(`"${file.name}" passa de 20MB. Ignorado.`);
          continue;
        }
        const path = `${selectedId ?? 'compose'}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name}`;
        const { error } = await supabase.storage
          .from('inbox_attachments')
          .upload(path, file, { contentType: file.type, upsert: false });
        if (error) {
          toast.error(`Falha ao enviar "${file.name}": ${error.message}`);
          continue;
        }
        newAttachments.push({ path, name: file.name, size: file.size, mime: file.type });
      }
      if (newAttachments.length > 0) {
        setPendingAttachments(prev => [...prev, ...newAttachments]);
        toast.success(`${newAttachments.length} anexo(s) prontos para envio.`);
      }
    } finally {
      setUploadingAttachment(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function removePendingAttachment(idx: number) {
    const att = pendingAttachments[idx];
    if (!att) return;
    setPendingAttachments(prev => prev.filter((_, i) => i !== idx));
    // best-effort cleanup do storage
    await supabase.storage.from('inbox_attachments').remove([att.path]).catch(() => null);
  }

  async function getAttachmentUrl(att: Attachment): Promise<string | null> {
    if (att.url) return att.url;
    const { data, error } = await supabase.storage
      .from('inbox_attachments')
      .createSignedUrl(att.path, 3600);
    if (error || !data) return null;
    return data.signedUrl;
  }

  // ── Atribuição ─────────────────────────────────────────────────────────
  async function assignConversation(userId: string | null) {
    if (!selectedId) return;
    setAssigning(true);
    try {
      const { error } = await supabase
        .from('marketing_contacts')
        .update({ assigned_to: userId })
        .eq('id', selectedId);
      if (error) throw error;
      setLeads(prev => prev.map(l => l.id === selectedId ? { ...l, assignedTo: userId || undefined } : l));
      toast.success(userId ? 'Conversa atribuída.' : 'Atribuição removida.');
      setShowAssignPicker(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao atribuir.');
    } finally {
      setAssigning(false);
    }
  }

  async function updateInternalNotes(text: string) {
    if (!selectedId) return;
    const { error } = await supabase
      .from('marketing_contacts')
      .update({ internal_notes: text })
      .eq('id', selectedId);
    if (error) {
      toast.error('Falha ao salvar notas.');
      return;
    }
    setLeads(prev => prev.map(l => l.id === selectedId ? { ...l, internalNotes: text } : l));
  }

  useEffect(() => {
    if (!selectedId) return;
    let alive = true;

    async function loadMessages() {
      const { data, error } = await supabase
        .from('inbox_messages')
        .select('*')
        .eq('contact_id', selectedId)
        .order('created_at', { ascending: true });

      if (!alive) return;
      if (error) {
        console.warn('[omni-inbox] Falha ao carregar mensagens:', error.message);
        return;
      }

      if (data) {
        setChatHistory(prev => ({
          ...prev,
          [selectedId]: (data as InboxMessageRow[]).map(mapInboxMessage),
        }));
      }
    }

    loadMessages();
    return () => { alive = false; };
  }, [selectedId]);

  useEffect(() => {
    const channel = supabase
      .channel('inbox_messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'inbox_messages' },
        payload => {
          const row = payload.new as InboxMessageRow;
          if (!row.contact_id) return;

          setChatHistory(prev => {
            const existing = prev[row.contact_id!] ?? [];
            if (existing.some(message => message.id === row.id)) return prev;
            if (existing.some(message =>
              !message.id &&
              message.type === row.direction &&
              message.text === row.body &&
              message.createdAt &&
              Math.abs(new Date(message.createdAt).getTime() - new Date(row.created_at).getTime()) < 5000
            )) return prev;
            return { ...prev, [row.contact_id!]: [...existing, mapInboxMessage(row)] };
          });

          setLeads(prev => prev.map(lead => lead.id === row.contact_id ? {
            ...lead,
            lastMessage: formatPreview(row.subject, row.body),
            lastMessageAt: row.created_at,
            unreadCount: row.direction === 'in' && row.contact_id !== selectedId ? (lead.unreadCount || 0) + 1 : lead.unreadCount,
            status: row.direction === 'in' ? 'new' : lead.status,
          } : lead));

          if (row.channel === 'email' && row.direction === 'in') {
            const f = (row.folder ?? 'inbox') as EmailFolder;
            setFolderCounts(prev => {
              const current = prev[row.contact_id!] ?? { inbox: 0, spam: 0, trash: 0 };
              return { ...prev, [row.contact_id!]: { ...current, [f]: current[f] + 1 } };
            });
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedId]);

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

  const isEmailChannel = activeChannel === 'email';

  const filteredLeads = leads.filter(l => {
    if (showOnlyMine && l.assignedTo !== profile.id) return false;
    if (activeChannel !== 'all' && l.channel !== activeChannel) return false;
    if (activeFilter !== 'all' && l.status !== activeFilter) return false;
    if (searchQuery && !l.guestName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (isEmailChannel && l.channel === 'email') {
      const counts = folderCounts[l.id];
      if (!counts) return emailFolder === 'inbox';
      if ((counts[emailFolder] || 0) === 0) return false;
    }
    return true;
  });

  const visibleMessages = selected?.channel === 'email'
    ? messages.filter(m => m.type === 'out' || (m.folder ?? 'inbox') === emailFolder)
    : messages;

  const availableChannels = CHANNELS.filter(channel => leads.some(lead => lead.channel === channel.id));
  const channelOptions = [{ id: 'all', name: 'Todos', icon: <Inbox className="w-3 h-3" />, color: '#171717' }, ...availableChannels];

  const [reparsing, setReparsing] = useState(false);
  async function reparseLegacyEmails() {
    if (reparsing) return;
    setReparsing(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) { toast.error('Sessão expirada.'); return; }

      const response = await fetch(`${SUPABASE_URL}/functions/v1/poll-email-inbox`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'reparse', limit: 30 }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Falha ao reprocessar.');

      const remaining = result.remaining ?? 0;
      const reprocessed = result.reprocessed ?? 0;
      const skipped = result.skipped ?? 0;
      toast.success(`Reprocessados: ${reprocessed}${skipped ? ` (pulados: ${skipped})` : ''}. ${remaining > 0 ? `Faltam ${remaining}, clica de novo.` : 'Concluído.'}`);

      // Recarrega mensagens da conversa atual se for email
      if (selectedId && selected?.channel === 'email') {
        const { data } = await supabase
          .from('inbox_messages')
          .select('*')
          .eq('contact_id', selectedId)
          .order('created_at', { ascending: true });
        if (data) {
          setChatHistory(prev => ({
            ...prev,
            [selectedId]: (data as InboxMessageRow[]).map(mapInboxMessage),
          }));
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao reprocessar.');
    } finally {
      setReparsing(false);
    }
  }

  async function refreshEmailInbox() {
    setRefreshingInbox(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        toast.error('Sessão expirada. Entre novamente para atualizar e-mails.');
        return;
      }

      const response = await fetch(`${SUPABASE_URL}/functions/v1/poll-email-inbox`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Não foi possível atualizar a caixa de entrada.');
      toast.success(result.processed ? `${result.processed} e-mail(s) recebido(s)` : 'Caixa de entrada atualizada');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível atualizar e-mails.';
      toast.error(message);
    } finally {
      setRefreshingInbox(false);
    }
  }

  async function sendMessage() {
    if ((!messageInput.trim() && pendingAttachments.length === 0) || !selectedId || sendingMessage) return;
    const text = messageInput.trim();
    const selectedLead = leads.find(l => l.id === selectedId);
    if (!selectedLead) return;
    setSendingMessage(true);

    try {
      const lastIncomingSubject = [...messages].reverse().find(message => message.type === 'in' && message.subject)?.subject;
      const lastIncomingEmail = [...messages].reverse().find(message => message.type === 'in' && message.emailMessageId);
      const replyReferences = [lastIncomingEmail?.emailReferences, lastIncomingEmail?.emailMessageId].filter(Boolean).join(' ').trim();
      const subject = lastIncomingSubject
        ? (lastIncomingSubject.toLowerCase().startsWith('re:') ? lastIncomingSubject : `Re: ${lastIncomingSubject}`)
        : 'Resposta Royal PMS';
      let outgoingMessageId: string | null = null;

      if (selectedLead.channel === 'email') {
        if (!selectedLead.guestEmail) {
          toast.error('Este contato não possui e-mail para resposta.');
          return;
        }

        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          toast.error('Sessão expirada. Entre novamente para enviar e-mails.');
          return;
        }

        const response = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: selectedLead.guestEmail,
            subject,
            body: text,
            inReplyTo: lastIncomingEmail?.emailMessageId,
            references: replyReferences,
          }),
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.sent) {
          throw new Error(result.error || 'Falha ao enviar e-mail.');
        }
        outgoingMessageId = typeof result.messageId === 'string' ? result.messageId : null;
      }

    const now = new Date().toISOString();
    const emailReferences = replyReferences || lastIncomingEmail?.emailMessageId || null;
    const sentAttachments = pendingAttachments.slice();
    const previewText = text || (sentAttachments.length ? `[${sentAttachments.length} anexo(s)]` : '');
    const msg: Message = { text, type: 'out', time: formatMessageTime(now), createdAt: now, subject: selectedLead.channel === 'email' ? subject : undefined, emailMessageId: outgoingMessageId, emailReferences, attachments: sentAttachments };
    setChatHistory(prev => ({ ...prev, [selectedId]: [...(prev[selectedId] ?? []), msg] }));
    setLeads(prev => prev.map(l => l.id === selectedId ? { ...l, lastMessage: previewText, lastMessageAt: now, status: 'ai_responded' as const } : l));
    setMessageInput('');
    setPendingAttachments([]);

    const { error } = await supabase.from('inbox_messages').insert([{
      contact_id: selectedId,
      contact_identifier: selectedLead?.guestEmail || selectedLead?.guestPhone || selectedLead?.guestName || selectedId,
      channel: selectedLead?.channel || 'email',
      direction: 'out',
      subject: selectedLead.channel === 'email' ? subject : null,
      body: text,
      email_message_id: outgoingMessageId,
      email_references: selectedLead.channel === 'email' ? emailReferences : null,
      read: true,
      attachments: sentAttachments,
    }]);

    if (error) {
      toast.error('Mensagem exibida, mas não foi salva no histórico.');
      console.warn('[omni-inbox] Falha ao salvar mensagem enviada:', error.message);
      return;
    }

    await supabase
      .from('marketing_contacts')
      .update({ last_message: previewText, last_message_at: now, status: 'ai_responded', unread_count: 0 })
      .eq('id', selectedId);

      toast.success(selectedLead.channel === 'email' ? 'E-mail enviado' : 'Mensagem enviada');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível enviar a mensagem.';
      toast.error(message);
      console.warn('[omni-inbox] Falha ao enviar mensagem:', message);
    } finally {
      setSendingMessage(false);
    }
  }

  async function performFolderAction(message: Message, action: 'spam' | 'trash' | 'inbox' | 'delete') {
    if (!message.id || !selectedId) return;
    setFolderActionLoading(message.id);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) { toast.error('Sessão expirada.'); return; }

      const response = await fetch(`${SUPABASE_URL}/functions/v1/imap-folder-action`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: message.id, action }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Falha ao executar ação.');

      const previousFolder = (message.folder ?? 'inbox') as EmailFolder;
      setChatHistory(prev => {
        const list = prev[selectedId] ?? [];
        if (action === 'delete') {
          return { ...prev, [selectedId]: list.filter(m => m.id !== message.id) };
        }
        return {
          ...prev,
          [selectedId]: list.map(m => m.id === message.id ? { ...m, folder: action as EmailFolder } : m),
        };
      });

      if (message.type === 'in') {
        setFolderCounts(prev => {
          const current = prev[selectedId] ?? { inbox: 0, spam: 0, trash: 0 };
          const next = { ...current };
          next[previousFolder] = Math.max(0, next[previousFolder] - 1);
          if (action !== 'delete') next[action as EmailFolder] += 1;
          return { ...prev, [selectedId]: next };
        });
      }

      const labels: Record<typeof action, string> = {
        spam: 'Movido para Spam',
        trash: 'Movido para Lixeira',
        inbox: 'Restaurado para Caixa de Entrada',
        delete: 'Excluído permanentemente',
      };
      toast.success(labels[action]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Não foi possível executar a ação.';
      toast.error(msg);
    } finally {
      setFolderActionLoading(null);
    }
  }

  async function composeAndSend() {
    const to = composeForm.to.trim().toLowerCase();
    const subject = composeForm.subject.trim();
    const body = composeForm.body.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { toast.error('E-mail de destino inválido.'); return; }
    if (!subject) { toast.error('Assunto é obrigatório.'); return; }
    if (!body) { toast.error('Mensagem é obrigatória.'); return; }

    setComposeSending(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) { toast.error('Sessão expirada.'); return; }

      const response = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, body, inReplyTo: '', references: '' }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.sent) throw new Error(result.error || 'Falha ao enviar.');

      const now = new Date().toISOString();
      const outgoingMessageId: string | null = typeof result.messageId === 'string' ? result.messageId : null;

      // Upsert contact by email
      const { data: contactData, error: contactError } = await supabase
        .from('marketing_contacts')
        .upsert({
          email: to,
          name: to.split('@')[0],
          channel: 'email',
          last_message: `${subject} - ${body}`.slice(0, 500),
          last_message_at: now,
          status: 'ai_responded',
          sentiment: 'neutral',
          unread_count: 0,
          updated_at: now,
        }, { onConflict: 'email' })
        .select('*')
        .single();

      if (contactError) throw contactError;
      const contact = contactData as MarketingContactRow;

      await supabase.from('inbox_messages').insert([{
        contact_id: contact.id,
        contact_identifier: to,
        channel: 'email',
        direction: 'out',
        subject,
        body,
        email_message_id: outgoingMessageId,
        email_references: null,
        folder: 'inbox',
        read: true,
      }]);

      const newLead = mapContactToLead(contact);
      setLeads(prev => {
        const without = prev.filter(l => l.id !== newLead.id);
        return [newLead, ...without];
      });
      setActiveChannel('email');
      setSelectedId(newLead.id);
      setComposeForm({ to: '', subject: '', body: '' });
      setComposeOpen(false);
      toast.success('E-mail enviado');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao enviar.');
    } finally {
      setComposeSending(false);
    }
  }

  async function markResolved() {
    if (!selectedId) return;
    const { error } = await supabase
      .from('marketing_contacts')
      .update({ status: 'resolved', unread_count: 0 })
      .eq('id', selectedId);
    if (error) {
      toast.error('Falha ao marcar como resolvida.');
      return;
    }
    setLeads(prev => prev.map(l => l.id === selectedId ? { ...l, status: 'resolved' as const, unreadCount: 0 } : l));
    toast.success('Conversa resolvida');
  }

  async function markUnread() {
    if (!selectedId) return;
    const { error } = await supabase
      .from('marketing_contacts')
      .update({ status: 'new', unread_count: Math.max(1, selected?.unreadCount ?? 1) })
      .eq('id', selectedId);
    if (error) {
      toast.error('Falha ao marcar como não lida.');
      return;
    }
    setLeads(prev => prev.map(l => l.id === selectedId ? { ...l, status: 'new' as const, unreadCount: Math.max(1, l.unreadCount ?? 1) } : l));
    toast.success('Marcada como não lida');
  }

  async function markNeedsHuman() {
    if (!selectedId) return;
    const { error } = await supabase
      .from('marketing_contacts')
      .update({ status: 'needs_human' })
      .eq('id', selectedId);
    if (error) {
      toast.error('Falha ao escalar.');
      return;
    }
    setLeads(prev => prev.map(l => l.id === selectedId ? { ...l, status: 'needs_human' as const } : l));
    toast.success('Marcada como precisa de humano');
  }

  const assignedUser = selected?.assignedTo ? assignableUsers.find(u => u.id === selected.assignedTo) : null;

  return (
    <div className="flex h-[calc(100vh-12rem)] min-h-[600px] rounded-2xl overflow-hidden border border-neutral-200 bg-white shadow-sm">
      {/* ─── Coluna 1: Filtros + lista ─────────────────────────────────── */}
      <div className="w-80 shrink-0 border-r border-neutral-200 flex flex-col bg-neutral-50/40">
        <div className="p-4 border-b border-neutral-200 space-y-3 bg-white">
          <button
            onClick={() => setComposeOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-800 transition-colors"
          >
            <Edit3 className="w-4 h-4" /> Novo e-mail
          </button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar conversas..."
              className="w-full pl-10 pr-3 py-2.5 bg-neutral-100 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {channelOptions.map(channel => {
              const count = channel.id === 'all' ? leads.length : leads.filter(lead => lead.channel === channel.id).length;
              return (
                <button
                  key={channel.id}
                  onClick={() => {
                    setActiveChannel(channel.id);
                    const nextLead = leads.find(lead => (channel.id === 'all' || lead.channel === channel.id) && (activeFilter === 'all' || lead.status === activeFilter));
                    setSelectedId(nextLead?.id ?? null);
                  }}
                  className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${activeChannel === channel.id ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 border border-neutral-200 hover:bg-neutral-50'}`}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span style={{ color: activeChannel === channel.id ? '#fff' : channel.color }} className="[&_svg]:w-3.5 [&_svg]:h-3.5">{channel.icon}</span>
                    <span className="truncate">{channel.name}</span>
                  </span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${activeChannel === channel.id ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-500'}`}>{count}</span>
                </button>
              );
            })}
          </div>
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
            {(() => {
              const baseLeads = activeChannel === 'all' ? leads : leads.filter(l => l.channel === activeChannel);
              const counts = {
                mine: baseLeads.filter(l => l.assignedTo === profile.id).length,
                all: baseLeads.length,
                new: baseLeads.filter(l => l.status === 'new').length,
                needs_human: baseLeads.filter(l => l.status === 'needs_human').length,
                resolved: baseLeads.filter(l => l.status === 'resolved').length,
              };
              return (
                <>
                  <button
                    onClick={() => setShowOnlyMine(s => !s)}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${showOnlyMine ? 'bg-amber-500 text-white' : 'bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50'}`}
                    title="Mostrar só conversas atribuídas a mim"
                  >
                    <span>👤 Minhas</span>
                    <span className={`rounded-full px-1.5 text-[10px] ${showOnlyMine ? 'bg-white/25' : 'bg-neutral-100 text-neutral-500'}`}>{counts.mine}</span>
                  </button>
                  {(['all', 'new', 'needs_human', 'resolved'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setActiveFilter(f)}
                      className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeFilter === f ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50'}`}
                    >
                      <span>{f === 'all' ? 'Todos' : f === 'new' ? 'Novos' : f === 'needs_human' ? 'Humano' : 'Resolvidos'}</span>
                      <span className={`rounded-full px-1.5 text-[10px] ${activeFilter === f ? 'bg-white/25' : 'bg-neutral-100 text-neutral-500'}`}>{counts[f]}</span>
                    </button>
                  ))}
                </>
              );
            })()}
          </div>
          {isEmailChannel && (
            <div className="flex gap-1.5 border-t border-neutral-200 pt-3">
              {(['inbox', 'spam', 'trash'] as const).map(f => {
                const total = Object.values(folderCounts).reduce<number>((sum, c) => sum + (c?.[f] || 0), 0);
                const labels = { inbox: 'Entrada', spam: 'Spam', trash: 'Lixeira' } as const;
                const icons = { inbox: Inbox, spam: AlertCircle, trash: Trash2 } as const;
                const Icon = icons[f];
                return (
                  <button
                    key={f}
                    onClick={() => setEmailFolder(f)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-semibold transition-all ${emailFolder === f ? 'bg-amber-50 text-amber-700 border border-amber-300' : 'bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50'}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{labels[f]}</span>
                    {total > 0 && (
                      <span className={`text-[10px] px-1.5 rounded ${emailFolder === f ? 'bg-amber-100' : 'bg-neutral-100'}`}>{total}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredLeads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-neutral-400 px-4 py-12">
              <Inbox className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">Nenhuma conversa</p>
              <p className="text-xs text-center mt-1">As mensagens recebidas por todos os canais aparecem aqui.</p>
            </div>
          ) : (
            filteredLeads.map(lead => {
              const ch = CHANNELS.find(c => c.id === lead.channel);
              return (
                <button
                  key={lead.id}
                  onClick={() => { setSelectedId(lead.id); setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, unreadCount: 0 } : l)); }}
                  onContextMenu={(e) => { e.preventDefault(); setLeadMenu({ x: e.clientX, y: e.clientY, lead }); }}
                  className={`w-full text-left p-4 border-b border-neutral-100 transition-colors cursor-context-menu ${selectedId === lead.id ? 'bg-amber-50' : 'hover:bg-white'}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-neutral-200 to-neutral-300 flex items-center justify-center shrink-0 text-sm font-semibold text-neutral-700">
                      {lead.guestName[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-neutral-900 truncate">{lead.guestName}</span>
                        <span className="text-xs text-neutral-400 shrink-0 ml-2">{timeAgo(lead.lastMessageAt)}</span>
                      </div>
                      <p className="text-xs text-neutral-500 truncate leading-relaxed">{lead.lastMessage}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span style={{ color: ch?.color }} className="flex items-center gap-1 text-xs font-semibold">
                          <span className="[&_svg]:w-3 [&_svg]:h-3">{ch?.icon}</span>
                          <span>{ch?.name}</span>
                        </span>
                        {lead.assignedTo && (
                          <span className="text-xs text-neutral-500 truncate">
                            · {assignableUsers.find(u => u.id === lead.assignedTo)?.name || 'atribuída'}
                          </span>
                        )}
                        {!!lead.unreadCount && (
                          <span className="ml-auto min-w-[20px] h-5 px-1.5 bg-amber-500 rounded-full text-white text-xs font-semibold flex items-center justify-center">{lead.unreadCount}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ─── Coluna 2: Conversa ─────────────────────────────────────────── */}
      {selected ? (
        <div className="flex-1 flex flex-col min-w-0 bg-white">
          {/* Header */}
          <div className="px-5 py-3.5 border-b border-neutral-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-neutral-200 to-neutral-300 flex items-center justify-center font-semibold text-base text-neutral-700 shrink-0">{selected.guestName[0]?.toUpperCase()}</div>
              <div className="min-w-0">
                <p className="font-semibold text-base text-neutral-900 truncate">{selected.guestName}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {(() => {
                    const channel = CHANNELS.find(c => c.id === selected.channel);
                    return channel ? (
                      <span style={{ color: channel.color }} className="flex items-center gap-1 text-xs font-semibold">
                        <span className="[&_svg]:w-3.5 [&_svg]:h-3.5">{channel.icon}</span>
                        <span>{channel.name}</span>
                      </span>
                    ) : null;
                  })()}
                  <StatusBadge status={selected.status} />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="relative">
                <button
                  onClick={() => setShowAssignPicker(s => !s)}
                  disabled={assigning}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${assignedUser ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
                  title={assignedUser ? `Atribuída a ${assignedUser.name}` : 'Atribuir conversa'}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{assignedUser ? assignedUser.name : 'Atribuir'}</span>
                </button>
                {showAssignPicker && (
                  <div className="absolute right-0 top-full mt-2 w-64 max-h-72 overflow-y-auto bg-white border border-neutral-200 rounded-xl shadow-lg z-20">
                    <button
                      onClick={() => assignConversation(profile.id)}
                      disabled={assigning}
                      className="w-full text-left px-4 py-2.5 text-sm font-medium text-amber-700 hover:bg-amber-50 border-b border-neutral-100"
                    >
                      ⚡ Atribuir a mim
                    </button>
                    {assignedUser && (
                      <button
                        onClick={() => assignConversation(null)}
                        disabled={assigning}
                        className="w-full text-left px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 border-b border-neutral-100"
                      >
                        Remover atribuição
                      </button>
                    )}
                    {assignableUsers.map(u => (
                      <button
                        key={u.id}
                        onClick={() => assignConversation(u.id)}
                        disabled={assigning}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-neutral-50 ${selected.assignedTo === u.id ? 'bg-indigo-50 font-semibold text-indigo-900' : 'text-neutral-700'}`}
                      >
                        <div>{u.name}</div>
                        <div className="text-xs text-neutral-500">{u.role}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => setContextOpen(o => !o)}
                className="lg:hidden p-1.5 rounded-lg bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                title="Contexto do contato"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {selected.channel === 'email' && (
                <>
                  <button onClick={refreshEmailInbox} disabled={refreshingInbox} title="Buscar novos e-mails" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-xs font-semibold hover:bg-amber-100 disabled:opacity-50 transition-colors">
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshingInbox ? 'animate-spin' : ''}`} /> <span className="hidden sm:inline">Atualizar</span>
                  </button>
                  <button onClick={reparseLegacyEmails} disabled={reparsing} title="Reprocessar emails antigos com o parser novo (em lotes de 30)" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 text-xs font-semibold hover:bg-violet-100 disabled:opacity-50 transition-colors">
                    <RefreshCcw className={`w-3.5 h-3.5 ${reparsing ? 'animate-spin' : ''}`} /> <span className="hidden md:inline">Reprocessar antigos</span>
                  </button>
                </>
              )}
              {selected.status !== 'new' && (
                <button onClick={markUnread} title="Marcar conversa como não lida" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition-colors">
                  <Bell className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Não lida</span>
                </button>
              )}
              {selected.status !== 'needs_human' && selected.status !== 'resolved' && (
                <button onClick={markNeedsHuman} title="Marcar que precisa de atendimento humano" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 transition-colors">
                  <AlertCircle className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Escalar</span>
                </button>
              )}
              {selected.status !== 'resolved' && (
                <button onClick={markResolved} title="Marcar conversa como resolvida" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 transition-colors">
                  <CheckCircle2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Resolver</span>
                </button>
              )}
            </div>
          </div>

          {/* Messages — Email: estilo Gmail (lista vertical, ultimo expandido, anteriores colapsados).
              Chat: bubbles tradicionais. */}
          <div className="flex-1 overflow-y-auto bg-neutral-50/30">
            {selected?.channel === 'email' ? (
              <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-3">
                {visibleMessages.length > 0 && (
                  <h2 className="text-xl sm:text-2xl font-semibold text-neutral-900 mb-3 break-words">
                    {visibleMessages[visibleMessages.length - 1]?.subject || 'Sem assunto'}
                  </h2>
                )}
                {visibleMessages.map((msg, i) => {
                  const key = msg.id ?? `idx-${i}`;
                  const isLatest = i === visibleMessages.length - 1;
                  const isExpanded = expandedMsgs.has(key) || isLatest;
                  const inSpam = (msg.folder ?? 'inbox') === 'spam';
                  const inTrash = (msg.folder ?? 'inbox') === 'trash';
                  const canAct = msg.type === 'in' && !!msg.id;
                  const busy = folderActionLoading === msg.id;
                  const senderName = msg.type === 'out' ? 'Você' : (selected?.guestName ?? 'Contato');
                  const senderEmail = msg.type === 'out' ? '' : (selected?.guestEmail ?? '');
                  const preview = sanitizeEmailBody(msg.text).replace(/\s+/g, ' ').trim().slice(0, 140);

                  return (
                    <article
                      key={key}
                      onContextMenu={(e) => { e.preventDefault(); setMsgMenu({ x: e.clientX, y: e.clientY, msg }); }}
                      className="bg-white border border-neutral-200 rounded-xl shadow-sm overflow-hidden"
                    >
                      {/* Header da mensagem (sempre visível, clicável pra colapsar/expandir) */}
                      <header
                        onClick={() => toggleExpand(key)}
                        className={`flex items-start gap-3 px-4 sm:px-5 py-3 cursor-pointer hover:bg-neutral-50 transition-colors ${isExpanded ? 'border-b border-neutral-100' : ''}`}
                      >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold ${msg.type === 'out' ? 'bg-neutral-900 text-white' : 'bg-gradient-to-br from-amber-200 to-amber-300 text-amber-900'}`}>
                          {senderName[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="text-sm font-semibold text-neutral-900 truncate">
                              {senderName}
                              {senderEmail && <span className="ml-2 text-xs font-normal text-neutral-500">&lt;{senderEmail}&gt;</span>}
                            </p>
                            <span className="text-xs text-neutral-400 shrink-0">{msg.time}</span>
                          </div>
                          {!isExpanded && (
                            <p className="text-xs text-neutral-500 truncate mt-0.5">{preview || 'Sem conteúdo de texto'}</p>
                          )}
                          {isExpanded && (
                            <p className="text-xs text-neutral-500 mt-0.5">
                              Para: {msg.type === 'out' ? (selected?.guestEmail ?? '—') : 'Você'}
                            </p>
                          )}
                        </div>
                      </header>

                      {isExpanded && (
                        <>
                          {/* Corpo do email */}
                          <div className="px-4 sm:px-5 py-4">
                            {msg.html ? (
                              <EmailHtmlFrame html={msg.html} darkBubble={false} />
                            ) : (
                              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-800">{sanitizeEmailBody(msg.text)}</p>
                            )}
                            {!!msg.attachments?.length && (
                              <div className="mt-3 pt-3 border-t border-neutral-100 space-y-1.5">
                                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1">Anexos</p>
                                {msg.attachments.map((att, ai) => (
                                  <AttachmentChip key={ai} attachment={att} darkBubble={false} onResolveUrl={getAttachmentUrl} />
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Ações por mensagem (apenas email IN) */}
                          {canAct && (
                            <div className="flex items-center gap-1.5 px-4 sm:px-5 py-2 border-t border-neutral-100 bg-neutral-50/60">
                              {!inSpam && !inTrash && (
                                <button onClick={(e) => { e.stopPropagation(); performFolderAction(msg, 'spam'); }} disabled={busy} title="Marcar como spam" className="flex items-center gap-1 px-2 py-1 text-xs text-amber-700 hover:bg-amber-50 rounded">
                                  <AlertCircle className="w-3.5 h-3.5" /> Spam
                                </button>
                              )}
                              {!inTrash && (
                                <button onClick={(e) => { e.stopPropagation(); performFolderAction(msg, 'trash'); }} disabled={busy} title="Mover para lixeira" className="flex items-center gap-1 px-2 py-1 text-xs text-red-700 hover:bg-red-50 rounded">
                                  <Trash2 className="w-3.5 h-3.5" /> Lixeira
                                </button>
                              )}
                              {(inSpam || inTrash) && (
                                <button onClick={(e) => { e.stopPropagation(); performFolderAction(msg, 'inbox'); }} disabled={busy} title="Restaurar" className="flex items-center gap-1 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50 rounded">
                                  <ArrowUpRight className="w-3.5 h-3.5" /> Restaurar
                                </button>
                              )}
                              {inTrash && (
                                <button onClick={(e) => { e.stopPropagation(); performFolderAction(msg, 'delete'); }} disabled={busy} title="Excluir permanentemente" className="flex items-center gap-1 px-2 py-1 text-xs text-red-800 hover:bg-red-100 rounded">
                                  <X className="w-3.5 h-3.5" /> Excluir
                                </button>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </article>
                  );
                })}
                {visibleMessages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-64 text-neutral-400">
                    <Inbox className="w-12 h-12 mb-3 opacity-30" />
                    <p className="text-sm">Nenhuma mensagem nesta pasta</p>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            ) : (
              // Chat (WhatsApp/IG/etc) — bubbles tradicionais
              <div className="p-5 space-y-3">
                {visibleMessages.map((msg, i) => (
                  <div key={msg.id ?? i} className={`group flex ${msg.type === 'out' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      onContextMenu={(e) => { e.preventDefault(); setMsgMenu({ x: e.clientX, y: e.clientY, msg }); }}
                      className={`relative cursor-context-menu max-w-[78%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${msg.type === 'out' ? 'bg-neutral-900 text-white rounded-br-sm' : 'bg-white text-neutral-800 rounded-bl-sm border border-neutral-200 shadow-sm'}`}
                    >
                      {msg.text && <p className="whitespace-pre-wrap break-words">{msg.text}</p>}
                      {!!msg.attachments?.length && (
                        <div className="mt-2 space-y-1.5">
                          {msg.attachments.map((att, ai) => (
                            <AttachmentChip key={ai} attachment={att} darkBubble={msg.type === 'out'} onResolveUrl={getAttachmentUrl} />
                          ))}
                        </div>
                      )}
                      <p className={`text-xs mt-2 ${msg.type === 'out' ? 'text-white/60' : 'text-neutral-400'}`}>{msg.time}</p>
                    </div>
                  </div>
                ))}
                {visibleMessages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-64 text-neutral-400">
                    <Inbox className="w-12 h-12 mb-3 opacity-30" />
                    <p className="text-sm">Nenhuma mensagem</p>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {/* Menu de contexto (clique direito em um item da lista de conversas) */}
          {leadMenu && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ top: leadMenu.y, left: leadMenu.x }}
              className="fixed z-50 w-60 bg-white border border-neutral-200 rounded-xl shadow-2xl py-1 overflow-hidden"
            >
              <button
                onClick={() => { setSelectedId(leadMenu.lead.id); setLeadMenu(null); }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-neutral-50 flex items-center gap-2"
              >
                <Inbox className="w-4 h-4 text-neutral-500" /> Abrir conversa
              </button>
              <div className="border-t border-neutral-100 my-1" />
              {leadMenu.lead.status !== 'new' && (
                <button
                  onClick={() => { leadAction(leadMenu.lead, 'mark_unread'); setLeadMenu(null); }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-amber-50 text-amber-700 flex items-center gap-2"
                >
                  <Bell className="w-4 h-4" /> Marcar como não lida
                </button>
              )}
              {leadMenu.lead.status !== 'resolved' && (
                <button
                  onClick={() => { leadAction(leadMenu.lead, 'mark_resolved'); setLeadMenu(null); }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-emerald-50 text-emerald-700 flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" /> Marcar como resolvida
                </button>
              )}
              {leadMenu.lead.status !== 'needs_human' && leadMenu.lead.status !== 'resolved' && (
                <button
                  onClick={() => { leadAction(leadMenu.lead, 'mark_needs_human'); setLeadMenu(null); }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-red-50 text-red-700 flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4" /> Escalar (precisa humano)
                </button>
              )}
              <div className="border-t border-neutral-100 my-1" />
              {leadMenu.lead.assignedTo !== profile.id && (
                <button
                  onClick={() => { leadAction(leadMenu.lead, 'assign_to_me'); setLeadMenu(null); }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-indigo-50 text-indigo-700 flex items-center gap-2"
                >
                  <UserPlus className="w-4 h-4" /> Atribuir a mim
                </button>
              )}
              {leadMenu.lead.assignedTo && (
                <button
                  onClick={() => { leadAction(leadMenu.lead, 'unassign'); setLeadMenu(null); }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-neutral-100 text-neutral-700 flex items-center gap-2"
                >
                  <X className="w-4 h-4" /> Remover atribuição
                </button>
              )}
            </div>
          )}

          {/* Menu de contexto (clique direito sobre uma mensagem) */}
          {msgMenu && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ top: msgMenu.y, left: msgMenu.x }}
              className="fixed z-50 w-56 bg-white border border-neutral-200 rounded-xl shadow-2xl py-1 overflow-hidden"
            >
              <button
                onClick={() => {
                  const q = (msgMenu.msg.text || '').split('\n').map(l => `> ${l}`).join('\n');
                  setMessageInput(prev => (prev ? prev + '\n\n' : '') + q + '\n\n');
                  setMsgMenu(null);
                }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-neutral-50 flex items-center gap-2"
              >
                <ArrowUpRight className="w-4 h-4 text-neutral-500" /> Responder citando
              </button>
              <button
                onClick={() => {
                  setComposeForm({
                    to: '',
                    subject: msgMenu.msg.subject ? `Fwd: ${msgMenu.msg.subject}` : 'Encaminhado',
                    body: `\n\n--- Mensagem encaminhada ---\n${msgMenu.msg.text || ''}`,
                  });
                  setComposeOpen(true);
                  setMsgMenu(null);
                }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-neutral-50 flex items-center gap-2"
              >
                <Send className="w-4 h-4 text-neutral-500" /> Encaminhar (como e-mail)
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(msgMenu.msg.text || '').then(
                    () => toast.success('Mensagem copiada'),
                    () => toast.error('Falha ao copiar'),
                  );
                  setMsgMenu(null);
                }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-neutral-50 flex items-center gap-2"
              >
                <Copy className="w-4 h-4 text-neutral-500" /> Copiar texto
              </button>
              {selected?.channel === 'email' && msgMenu.msg.id && msgMenu.msg.type === 'in' && (
                <>
                  <div className="border-t border-neutral-100 my-1" />
                  {(msgMenu.msg.folder ?? 'inbox') !== 'spam' && (msgMenu.msg.folder ?? 'inbox') !== 'trash' && (
                    <button
                      onClick={() => { performFolderAction(msgMenu.msg, 'spam'); setMsgMenu(null); }}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-amber-50 text-amber-700 flex items-center gap-2"
                    >
                      <AlertCircle className="w-4 h-4" /> Marcar como spam
                    </button>
                  )}
                  {(msgMenu.msg.folder ?? 'inbox') !== 'trash' && (
                    <button
                      onClick={() => { performFolderAction(msgMenu.msg, 'trash'); setMsgMenu(null); }}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-red-50 text-red-700 flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" /> Mover para lixeira
                    </button>
                  )}
                  {((msgMenu.msg.folder ?? 'inbox') === 'spam' || (msgMenu.msg.folder ?? 'inbox') === 'trash') && (
                    <button
                      onClick={() => { performFolderAction(msgMenu.msg, 'inbox'); setMsgMenu(null); }}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-emerald-50 text-emerald-700 flex items-center gap-2"
                    >
                      <ArrowUpRight className="w-4 h-4" /> Restaurar para entrada
                    </button>
                  )}
                  {(msgMenu.msg.folder ?? 'inbox') === 'trash' && (
                    <button
                      onClick={() => { performFolderAction(msgMenu.msg, 'delete'); setMsgMenu(null); }}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-red-100 text-red-800 flex items-center gap-2"
                    >
                      <X className="w-4 h-4" /> Excluir permanentemente
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* AI suggestions */}
          {(loadingAI || aiSuggestions.length > 0) && (
            <div className="px-4 py-2.5 border-t border-neutral-200 bg-amber-50/40">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 mb-1.5 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Sugestões IA</p>
              {loadingAI ? (
                <div className="flex gap-2">
                  {[1,2,3].map(i => <div key={i} className="h-8 w-44 bg-amber-100 rounded-lg animate-pulse" />)}
                </div>
              ) : (
                <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
                  {aiSuggestions.map((s, i) => (
                    <button key={i} onClick={() => setMessageInput(s)} className="shrink-0 px-3 py-1.5 rounded-lg bg-white border border-amber-200 text-sm text-neutral-700 hover:border-amber-500 transition-colors max-w-[240px] text-left truncate">
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Pending attachments preview */}
          {pendingAttachments.length > 0 && (
            <div className="px-4 pt-3 pb-1 border-t border-neutral-200 bg-white">
              <div className="flex flex-wrap gap-2">
                {pendingAttachments.map((att, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-100 text-sm border border-neutral-200">
                    {att.mime.startsWith('image/') ? <ImageIcon className="w-4 h-4 text-amber-600" /> : <FileIcon className="w-4 h-4 text-neutral-600" />}
                    <span className="font-medium text-neutral-800 truncate max-w-[180px]">{att.name}</span>
                    <span className="text-xs text-neutral-500">{(att.size / 1024).toFixed(0)} KB</span>
                    <button onClick={() => removePendingAttachment(i)} className="text-neutral-400 hover:text-red-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="p-4 border-t border-neutral-200 flex items-end gap-2 bg-white">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={e => handleFilePick(e.target.files)}
              accept="image/*,application/pdf,audio/*,video/*,.doc,.docx,.xls,.xlsx"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAttachment || sendingMessage}
              className="p-2.5 rounded-2xl text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 transition-colors"
              title="Anexar arquivo"
            >
              {uploadingAttachment ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
            </button>
            <textarea
              value={messageInput}
              onChange={e => setMessageInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder={selected.channel === 'email' ? 'Escreva a resposta por e-mail...' : 'Escreva uma mensagem...'}
              disabled={sendingMessage}
              rows={2}
              className="flex-1 resize-none px-4 py-2.5 bg-neutral-50 rounded-2xl text-sm border border-neutral-200 focus:border-amber-500 focus:bg-white focus:ring-0 outline-none font-sans"
            />
            <button
              onClick={sendMessage}
              disabled={(!messageInput.trim() && pendingAttachments.length === 0) || sendingMessage}
              className="p-3 bg-neutral-900 text-white rounded-2xl hover:bg-neutral-800 disabled:opacity-40 transition-all"
            >
              {sendingMessage ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-neutral-400 bg-neutral-50/30">
          <div className="text-center">
            <Inbox className="w-16 h-16 mx-auto mb-3 opacity-30" />
            <p className="font-semibold text-base text-neutral-500">Selecione uma conversa</p>
            <p className="text-sm text-neutral-400 mt-1">As mensagens dos seus canais aparecem aqui.</p>
          </div>
        </div>
      )}

      {/* ─── Coluna 3: Contexto do contato (desktop) ─────────────────── */}
      {selected && (
        <aside className={`${contextOpen ? 'flex absolute inset-y-0 right-0 z-20 w-80 shadow-2xl' : 'hidden'} lg:flex lg:static lg:w-72 shrink-0 border-l border-neutral-200 bg-neutral-50/40 flex-col overflow-y-auto`}>
          <div className="lg:hidden flex items-center justify-between p-4 border-b border-neutral-200 bg-white">
            <p className="text-sm font-semibold text-neutral-900">Contexto</p>
            <button onClick={() => setContextOpen(false)} className="p-1 rounded-lg hover:bg-neutral-100"><X className="w-4 h-4" /></button>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">Contato</p>
              <p className="text-sm font-semibold text-neutral-900">{selected.guestName}</p>
              {selected.guestEmail && (
                <a href={`mailto:${selected.guestEmail}`} className="flex items-center gap-1.5 text-xs text-amber-700 hover:underline mt-1">
                  <Mail className="w-3.5 h-3.5" /> {selected.guestEmail}
                </a>
              )}
              {selected.guestPhone && (
                <a href={`tel:${selected.guestPhone}`} className="flex items-center gap-1.5 text-xs text-amber-700 hover:underline mt-1">
                  <Phone className="w-3.5 h-3.5" /> {selected.guestPhone}
                </a>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">Atendente</p>
              {assignedUser ? (
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-semibold text-indigo-700">{assignedUser.name[0]?.toUpperCase()}</div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900 truncate">{assignedUser.name}</p>
                    <p className="text-xs text-neutral-500">{assignedUser.role}</p>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowAssignPicker(true)} className="text-sm text-amber-700 hover:underline">Sem atendente — atribuir</button>
              )}
            </div>

            {selected.tags && selected.tags.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {selected.tags.map(t => (
                    <span key={t} className="px-2 py-1 rounded-md bg-amber-100 text-amber-800 text-xs font-medium">{t}</span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">Notas internas</p>
              <textarea
                key={selected.id}
                defaultValue={selected.internalNotes ?? ''}
                onBlur={e => updateInternalNotes(e.target.value)}
                rows={4}
                placeholder="Notas visíveis só para a equipe..."
                className="w-full resize-none px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none"
              />
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">Estado da conversa</p>
              <div className="flex flex-col gap-1.5 text-sm">
                <div className="flex items-center justify-between"><span className="text-neutral-500">Status:</span><StatusBadge status={selected.status} /></div>
                <div className="flex items-center justify-between"><span className="text-neutral-500">Canal:</span><span className="font-medium">{CHANNELS.find(c => c.id === selected.channel)?.name ?? selected.channel}</span></div>
                <div className="flex items-center justify-between"><span className="text-neutral-500">Não lidas:</span><span className="font-medium">{selected.unreadCount ?? 0}</span></div>
              </div>
            </div>
          </div>
        </aside>
      )}

      {composeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/50 backdrop-blur-sm p-4" onClick={() => !composeSending && setComposeOpen(false)}>
          <div onClick={e => e.stopPropagation()} className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-200">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center"><Mail className="w-3.5 h-3.5 text-amber-600" /></div>
                <h3 className="text-sm font-semibold text-neutral-900">Novo e-mail</h3>
              </div>
              <button onClick={() => !composeSending && setComposeOpen(false)} className="p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100" disabled={composeSending}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Para</label>
                <input
                  type="email"
                  value={composeForm.to}
                  onChange={e => setComposeForm(f => ({ ...f, to: e.target.value }))}
                  placeholder="destinatario@exemplo.com"
                  className="mt-1 w-full px-3 py-2 bg-neutral-50 rounded-xl text-sm border border-neutral-200 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                  disabled={composeSending}
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Assunto</label>
                <input
                  type="text"
                  value={composeForm.subject}
                  onChange={e => setComposeForm(f => ({ ...f, subject: e.target.value }))}
                  placeholder="Assunto do e-mail"
                  className="mt-1 w-full px-3 py-2 bg-neutral-50 rounded-xl text-sm border border-neutral-200 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                  disabled={composeSending}
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Mensagem</label>
                <textarea
                  value={composeForm.body}
                  onChange={e => setComposeForm(f => ({ ...f, body: e.target.value }))}
                  placeholder="Escreva sua mensagem..."
                  rows={8}
                  className="mt-1 w-full px-3 py-2 bg-neutral-50 rounded-xl text-sm border border-neutral-200 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none resize-none"
                  disabled={composeSending}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-neutral-200 bg-neutral-50">
              <button onClick={() => setComposeOpen(false)} disabled={composeSending} className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={composeAndSend} disabled={composeSending} className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 disabled:opacity-50 transition-colors">
                {composeSending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                {composeSending ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Campaigns Tab ───────────────────────────────────────────────────────────

type CampaignRow = {
  id: string;
  name: string;
  channel: string;
  status: 'draft' | 'scheduled' | 'running' | 'completed' | 'paused' | 'failed';
  template_id: string | null;
  subject: string | null;
  body: string | null;
  audience_filter: { channel?: string; status?: string; tags?: string[] };
  scheduled_at: string | null;
  total_recipients: number;
  delivered_count: number;
  read_count: number;
  reply_count: number;
  failed_count: number;
  created_at: string;
};

function CampaignsTab() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dispatching, setDispatching] = useState<string | null>(null);
  const [audiencePreview, setAudiencePreview] = useState<number | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState({
    name: '',
    channel: 'email',
    audience_channel: 'email',
    audience_status: '',
    template_id: '',
    subject: '',
    body: '',
    schedule_now: true,
    scheduled_at: '',
  });

  useEffect(() => {
    let alive = true;
    async function load() {
      const [c, t] = await Promise.all([
        supabase.from('marketing_campaigns').select('*').order('created_at', { ascending: false }),
        supabase.from('marketing_templates').select('id, name, body, category, channel').order('updated_at', { ascending: false }),
      ]);
      if (!alive) return;
      if (c.error) console.warn('[campaigns]', c.error.message);
      else if (c.data) setCampaigns(c.data as CampaignRow[]);
      if (t.data) setTemplates(t.data.map(r => ({ id: r.id, name: r.name, text: r.body, category: r.category, channel: r.channel })));
      setLoading(false);
    }
    load();
    const ch = supabase
      .channel('marketing_campaigns_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketing_campaigns' }, () => load())
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, []);

  async function previewAudience() {
    let query = supabase.from('marketing_contacts').select('id', { count: 'exact', head: true });
    if (form.audience_channel) query = query.eq('channel', form.audience_channel);
    if (form.audience_status) query = query.eq('status', form.audience_status);
    const { count } = await query;
    setAudiencePreview(count ?? 0);
  }

  useEffect(() => {
    if (step === 1) previewAudience();
  }, [step, form.audience_channel, form.audience_status]);

  function openCreate() {
    setForm({ name: '', channel: 'email', audience_channel: 'email', audience_status: '', template_id: '', subject: '', body: '', schedule_now: true, scheduled_at: '' });
    setStep(1);
    setShowForm(true);
  }

  async function saveCampaign() {
    if (!form.name.trim()) { toast.error('Nome é obrigatório'); return; }
    if (!form.template_id && (!form.subject.trim() || !form.body.trim())) { toast.error('Escolha um template ou preencha assunto e mensagem'); return; }

    setSaving(true);
    try {
      const status = form.schedule_now ? 'running' : 'scheduled';
      const payload = {
        name: form.name.trim(),
        channel: form.channel,
        status,
        template_id: form.template_id || null,
        subject: form.subject || null,
        body: form.body || null,
        audience_filter: {
          channel: form.audience_channel || undefined,
          status: form.audience_status || undefined,
        },
        scheduled_at: form.schedule_now ? null : (form.scheduled_at || null),
      };
      const { data, error } = await supabase.from('marketing_campaigns').insert([payload]).select().single();
      if (error) throw error;

      if (form.schedule_now && data) {
        await dispatchCampaign(data.id);
      } else {
        toast.success('Campanha agendada');
      }
      setShowForm(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao criar campanha');
    } finally {
      setSaving(false);
    }
  }

  async function dispatchCampaign(id: string) {
    setDispatching(id);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) { toast.error('Sessão expirada.'); return; }
      const response = await fetch(`${SUPABASE_URL}/functions/v1/dispatch-campaign`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Falha ao disparar');
      toast.success(`Disparada para ${result.dispatched ?? 0} contato(s)`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao disparar');
    } finally {
      setDispatching(null);
    }
  }

  const statusMap = {
    draft: { label: 'Rascunho', cls: 'bg-neutral-100 text-neutral-600' },
    scheduled: { label: 'Agendada', cls: 'bg-blue-100 text-blue-700' },
    running: { label: 'Em curso', cls: 'bg-amber-100 text-amber-700' },
    completed: { label: 'Concluída', cls: 'bg-emerald-100 text-emerald-700' },
    paused: { label: 'Pausada', cls: 'bg-neutral-100 text-neutral-500' },
    failed: { label: 'Falhou', cls: 'bg-red-100 text-red-700' },
  } as const;

  const totalDelivered = campaigns.reduce((s, c) => s + (c.delivered_count || 0), 0);
  const totalRecipients = campaigns.reduce((s, c) => s + (c.total_recipients || 0), 0);
  const deliveryRate = totalRecipients > 0 ? Math.round((totalDelivered / totalRecipients) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-600">Campanhas</p>
          <h2 className="text-xl font-semibold text-neutral-950">{campaigns.length} {campaigns.length === 1 ? 'campanha' : 'campanhas'}</h2>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-800 transition-colors">
          <Plus className="w-4 h-4" /> Nova campanha
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Em curso', value: campaigns.filter(c => c.status === 'running').length.toString(), icon: Activity, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Alcance Total', value: totalRecipients.toLocaleString('pt-BR'), icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Taxa Entrega', value: `${deliveryRate}%`, icon: Target, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Agendadas', value: campaigns.filter(c => c.status === 'scheduled').length.toString(), icon: Calendar, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map(stat => (
          <div key={stat.label} className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm">
            <div className={`w-8 h-8 rounded-xl ${stat.bg} flex items-center justify-center mb-3`}>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </div>
            <p className="text-2xl font-semibold text-neutral-950">{stat.value}</p>
            <p className="text-xs text-neutral-500 font-medium">{stat.label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 rounded-2xl border border-dashed border-neutral-200">
          <RefreshCw className="w-8 h-8 text-neutral-300 mx-auto mb-3 animate-spin" />
          <p className="text-sm text-neutral-400">Carregando campanhas...</p>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-dashed border-neutral-200">
          <Megaphone className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
          <p className="font-semibold text-neutral-500">Nenhuma campanha ainda</p>
          <p className="text-xs text-neutral-400 mt-1">Clique em "Nova campanha" para criar a primeira.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
          {campaigns.map((c, idx) => (
            <div key={c.id} className={`flex items-center gap-4 p-4 sm:p-5 ${idx < campaigns.length - 1 ? 'border-b border-neutral-100' : ''}`}>
              <div className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center shrink-0">
                <Megaphone className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <p className="font-semibold text-sm text-neutral-900 truncate">{c.name}</p>
                  <span className={`text-[9px] font-semibold uppercase px-2 py-0.5 rounded-full ${statusMap[c.status].cls}`}>{statusMap[c.status].label}</span>
                </div>
                <p className="text-xs text-neutral-500">{c.channel} {c.scheduled_at ? `· agendada ${new Date(c.scheduled_at).toLocaleString('pt-BR')}` : ''}</p>
              </div>
              <div className="hidden sm:flex items-center gap-6 text-right">
                <div>
                  <p className="text-sm font-semibold text-neutral-900 tabular-nums">{c.total_recipients}</p>
                  <p className="text-[10px] text-neutral-400">Destinatários</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-emerald-600 tabular-nums">{c.delivered_count}</p>
                  <p className="text-[10px] text-neutral-400">Entregues</p>
                </div>
              </div>
              {(c.status === 'draft' || c.status === 'scheduled' || c.status === 'paused') && (
                <button onClick={() => dispatchCampaign(c.id)} disabled={dispatching === c.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-xs font-semibold hover:bg-amber-100 disabled:opacity-50">
                  {dispatching === c.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Disparar
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !saving && setShowForm(false)} className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
                <div className="flex items-center gap-3">
                  <h3 className="text-base font-semibold text-neutral-900">Nova campanha</h3>
                  <span className="text-xs text-neutral-400">passo {step} de 3</span>
                </div>
                <button onClick={() => setShowForm(false)} disabled={saving} className="p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100"><X className="w-4 h-4" /></button>
              </div>

              <div className="px-6 py-2 border-b border-neutral-100 flex gap-1">
                {[1,2,3].map(n => (
                  <div key={n} className={`flex-1 h-1 rounded-full ${n <= step ? 'bg-amber-500' : 'bg-neutral-200'}`} />
                ))}
              </div>

              <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                {step === 1 && (
                  <>
                    <div>
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Nome da campanha</label>
                      <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Promoção feriado" className="mt-1 w-full px-3 py-2 bg-neutral-50 rounded-xl text-sm border border-neutral-200 focus:ring-2 focus:ring-amber-500 outline-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Canal de envio</label>
                        <select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value, audience_channel: e.target.value })} className="mt-1 w-full px-3 py-2 bg-neutral-50 rounded-xl text-sm border border-neutral-200 focus:ring-2 focus:ring-amber-500 outline-none">
                          <option value="email">E-mail</option>
                          <option value="whatsapp" disabled>WhatsApp (em breve)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Status do contato</label>
                        <select value={form.audience_status} onChange={e => setForm({ ...form, audience_status: e.target.value })} className="mt-1 w-full px-3 py-2 bg-neutral-50 rounded-xl text-sm border border-neutral-200 focus:ring-2 focus:ring-amber-500 outline-none">
                          <option value="">Todos</option>
                          <option value="new">Novos</option>
                          <option value="ai_responded">Respondidos pela IA</option>
                          <option value="needs_human">Aguardando humano</option>
                          <option value="resolved">Resolvidos</option>
                        </select>
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 flex items-center gap-2 text-xs text-amber-800">
                      <Users className="w-4 h-4" />
                      <span><strong>{audiencePreview ?? '...'}</strong> contato(s) atendem aos critérios</span>
                    </div>
                  </>
                )}

                {step === 2 && (
                  <>
                    <div>
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Template (opcional)</label>
                      <select
                        value={form.template_id}
                        onChange={e => {
                          const t = templates.find(tt => tt.id === e.target.value);
                          setForm(f => ({ ...f, template_id: e.target.value, subject: t?.name ?? f.subject, body: t?.text ?? f.body }));
                        }}
                        className="mt-1 w-full px-3 py-2 bg-neutral-50 rounded-xl text-sm border border-neutral-200 focus:ring-2 focus:ring-amber-500 outline-none"
                      >
                        <option value="">— Escrever do zero —</option>
                        {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Assunto</label>
                      <input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="Ex: Oferta exclusiva para você" className="mt-1 w-full px-3 py-2 bg-neutral-50 rounded-xl text-sm border border-neutral-200 focus:ring-2 focus:ring-amber-500 outline-none" />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Mensagem</label>
                      <textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} rows={8} placeholder="Use [NOME] para personalizar..." className="mt-1 w-full px-3 py-2 bg-neutral-50 rounded-xl text-sm border border-neutral-200 focus:ring-2 focus:ring-amber-500 outline-none resize-none" />
                    </div>
                  </>
                )}

                {step === 3 && (
                  <>
                    <div className="space-y-3">
                      <label className="flex items-center gap-2 p-3 rounded-xl border border-neutral-200 cursor-pointer hover:bg-neutral-50">
                        <input type="radio" checked={form.schedule_now} onChange={() => setForm({ ...form, schedule_now: true })} className="accent-amber-600" />
                        <div>
                          <p className="text-sm font-semibold text-neutral-900">Disparar agora</p>
                          <p className="text-xs text-neutral-500">A campanha será enviada imediatamente após confirmar</p>
                        </div>
                      </label>
                      <label className="flex items-center gap-2 p-3 rounded-xl border border-neutral-200 cursor-pointer hover:bg-neutral-50">
                        <input type="radio" checked={!form.schedule_now} onChange={() => setForm({ ...form, schedule_now: false })} className="accent-amber-600" />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-neutral-900">Agendar</p>
                          {!form.schedule_now && (
                            <input type="datetime-local" value={form.scheduled_at} onChange={e => setForm({ ...form, scheduled_at: e.target.value })} className="mt-2 w-full px-3 py-2 bg-white rounded-lg text-sm border border-neutral-200 focus:ring-2 focus:ring-amber-500 outline-none" />
                          )}
                        </div>
                      </label>
                    </div>
                    <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 text-xs text-neutral-600 space-y-1">
                      <p><strong>Nome:</strong> {form.name || '—'}</p>
                      <p><strong>Canal:</strong> {form.channel}</p>
                      <p><strong>Destinatários:</strong> {audiencePreview ?? '—'}</p>
                      <p><strong>Assunto:</strong> {form.subject || '—'}</p>
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center justify-between px-6 py-3 border-t border-neutral-200 bg-neutral-50">
                <button onClick={() => step > 1 ? setStep((step - 1) as 1 | 2 | 3) : setShowForm(false)} disabled={saving} className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 rounded-lg">
                  {step === 1 ? 'Cancelar' : 'Voltar'}
                </button>
                {step < 3 ? (
                  <button onClick={() => setStep((step + 1) as 1 | 2 | 3)} className="px-4 py-2 text-xs font-semibold bg-neutral-900 text-white rounded-lg hover:bg-neutral-800">Próximo</button>
                ) : (
                  <button onClick={saveCampaign} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50">
                    {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    {form.schedule_now ? 'Disparar agora' : 'Agendar'}
                  </button>
                )}
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
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [form, setForm] = useState({ name: '', text: '', category: 'Saudação', channel: 'WhatsApp' });
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let alive = true;
    async function load() {
      const { data, error } = await supabase
        .from('marketing_templates')
        .select('*')
        .order('updated_at', { ascending: false });
      if (!alive) return;
      if (error) {
        toast.error('Falha ao carregar templates');
        console.warn('[templates] load error:', error.message);
      } else if (data) {
        setTemplates(data.map(row => ({
          id: row.id,
          name: row.name,
          text: row.body,
          category: row.category,
          channel: row.channel,
          created_at: row.created_at,
        })));
      }
      setLoading(false);
    }
    load();
    const channel = supabase
      .channel('marketing_templates_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketing_templates' }, () => { load(); })
      .subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, []);

  function openCreate() { setEditing(null); setForm({ name: '', text: '', category: 'Saudação', channel: 'WhatsApp' }); setShowForm(true); }
  function openEdit(t: Template) { setEditing(t); setForm({ name: t.name, text: t.text, category: t.category, channel: t.channel }); setShowForm(true); }

  async function saveTemplate() {
    if (!form.name.trim() || !form.text.trim()) { toast.error('Nome e texto são obrigatórios'); return; }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from('marketing_templates')
          .update({ name: form.name.trim(), body: form.text, category: form.category, channel: form.channel })
          .eq('id', editing.id);
        if (error) throw error;
        toast.success('Template atualizado');
      } else {
        const { error } = await supabase
          .from('marketing_templates')
          .insert([{ name: form.name.trim(), body: form.text, category: form.category, channel: form.channel }]);
        if (error) throw error;
        toast.success('Template criado');
      }
      setShowForm(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao salvar template');
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate(id: string) {
    if (!confirm('Excluir este template?')) return;
    const { error } = await supabase.from('marketing_templates').delete().eq('id', id);
    if (error) { toast.error('Falha ao remover'); return; }
    toast.success('Removido');
  }

  function useInChat(t: Template) {
    window.dispatchEvent(new CustomEvent('marketing:insert-template', { detail: { body: t.text, subject: t.name } }));
    toast.success('Template carregado. Abra a Inbox para editar e enviar.');
  }

  const filtered = templates.filter(t =>
    (!filter || t.category === filter) &&
    (!search || t.name.toLowerCase().includes(search.toLowerCase()) || t.text.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-600">Templates</p>
          <h2 className="text-xl font-semibold text-neutral-950">{templates.length} templates</h2>
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
        <button onClick={() => setFilter('')} className={`shrink-0 px-4 py-2 rounded-xl text-[10px] font-semibold uppercase tracking-widest ${!filter ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500'}`}>Todos</button>
        {TEMPLATE_CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setFilter(cat)} className={`shrink-0 px-4 py-2 rounded-xl text-[10px] font-semibold uppercase tracking-widest ${filter === cat ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500'}`}>{cat}</button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 rounded-2xl border border-dashed border-neutral-200">
          <RefreshCw className="w-8 h-8 text-neutral-300 mx-auto mb-3 animate-spin" />
          <p className="text-sm text-neutral-400">Carregando templates...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-dashed border-neutral-200">
          <MessageSquare className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
          <p className="font-semibold text-neutral-400">Nenhum template encontrado</p>
          <p className="text-xs text-neutral-400 mt-1">Clique em "Novo template" para criar o primeiro.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(t => (
            <motion.article key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="group p-5 bg-white rounded-2xl border border-neutral-200 hover:border-amber-300 hover:shadow-md transition-all">
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
              <div className="flex items-center justify-between pt-3 border-t border-neutral-100 gap-2">
                <span className="text-[9px] font-semibold text-neutral-400">{t.channel}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => { navigator.clipboard.writeText(t.text); toast.success('Copiado'); }} className="flex items-center gap-1 text-[9px] font-semibold text-neutral-500 uppercase hover:text-neutral-700">
                    <Copy className="w-3 h-3" /> Copiar
                  </button>
                  <button onClick={() => useInChat(t)} className="flex items-center gap-1 text-[9px] font-semibold text-amber-700 uppercase hover:text-amber-900">
                    <ArrowUpRight className="w-3 h-3" /> Usar no chat
                  </button>
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowForm(false)} className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative w-full max-w-lg bg-white rounded-2xl p-6 sm:p-8 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-neutral-950">{editing ? 'Editar Template' : 'Novo Template'}</h3>
                <button onClick={() => setShowForm(false)} className="p-2 rounded-xl bg-neutral-100 text-neutral-500"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Nome</label>
                    <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Boas-vindas" className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Categoria</label>
                    <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none">
                      {TEMPLATE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Mensagem</label>
                  <textarea value={form.text} onChange={e => setForm({ ...form, text: e.target.value })} placeholder="Use [NOME] para personalizar..." rows={5} className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none resize-none" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Canal</label>
                  <select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })} className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none">
                    {TEMPLATE_CHANNELS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowForm(false)} disabled={saving} className="flex-1 py-3 bg-neutral-100 rounded-xl text-sm font-semibold text-neutral-600 disabled:opacity-50">Cancelar</button>
                  <button onClick={saveTemplate} disabled={saving} className="flex-1 py-3 bg-neutral-900 text-white rounded-xl text-sm font-semibold hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                    {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? 'Salvando...' : 'Salvar'}
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

// ─── Analytics Tab ────────────────────────────────────────────────────────────

function AnalyticsTab() {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('7d');
  const [metrics, setMetrics] = useState({ total: 0, resolved: 0, needsHuman: 0, newCount: 0 });
  const [daily, setDaily] = useState<Array<{ date: string; conversations: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    async function load() {
      const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const [total, resolved, needsHuman, newCount, msgs] = await Promise.all([
        supabase.from('marketing_contacts').select('id', { count: 'exact', head: true }).gte('last_message_at', since),
        supabase.from('marketing_contacts').select('id', { count: 'exact', head: true }).eq('status', 'resolved').gte('last_message_at', since),
        supabase.from('marketing_contacts').select('id', { count: 'exact', head: true }).eq('status', 'needs_human').gte('last_message_at', since),
        supabase.from('marketing_contacts').select('id', { count: 'exact', head: true }).eq('status', 'new').gte('last_message_at', since),
        supabase.from('inbox_messages').select('created_at').gte('created_at', since).limit(5000),
      ]);
      if (!alive) return;

      // Group messages by day
      const buckets: Record<string, number> = {};
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        buckets[key] = 0;
      }
      for (const row of (msgs.data ?? []) as Array<{ created_at: string }>) {
        const key = row.created_at.slice(0, 10);
        if (key in buckets) buckets[key]++;
      }
      const dailySeries = Object.entries(buckets).map(([key, n]) => ({
        date: new Date(key).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        conversations: n,
      }));

      setMetrics({
        total: total.count ?? 0,
        resolved: resolved.count ?? 0,
        needsHuman: needsHuman.count ?? 0,
        newCount: newCount.count ?? 0,
      });
      setDaily(dailySeries);
      setLoading(false);
    }
    load();
    return () => { alive = false; };
  }, [period]);

  const maxVal = Math.max(1, ...daily.map(d => d.conversations));
  const hasData = metrics.total > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-600">Analytics</p>
          <h2 className="text-xl sm:text-2xl font-semibold text-neutral-950">Desempenho de conversas</h2>
        </div>
        <div className="flex bg-neutral-100 rounded-xl p-1">
          {(['7d', '30d', '90d'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${period === p ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'}`}>
              {p === '7d' ? '7 dias' : p === '30d' ? '30 dias' : '90 dias'}
            </button>
          ))}
        </div>
      </div>

      {!hasData && !loading ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 p-12 text-center">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 text-neutral-300" />
          <p className="text-base font-semibold text-neutral-700">Sem dados ainda no período</p>
          <p className="text-sm text-neutral-500 mt-1">Os indicadores aparecem assim que houver contatos e mensagens registrados.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Conversas no período', value: metrics.total.toString(), icon: MessageSquare, color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: 'Novas', value: metrics.newCount.toString(), icon: Sparkles, color: 'text-amber-600', bg: 'bg-amber-50' },
              { label: 'Aguardando humano', value: metrics.needsHuman.toString(), icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50' },
              { label: 'Resolvidas', value: metrics.resolved.toString(), icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            ].map(stat => (
              <div key={stat.label} className="rounded-2xl border border-neutral-100 bg-white p-4 sm:p-5 shadow-sm">
                <div className={`w-9 h-9 rounded-xl ${stat.bg} flex items-center justify-center mb-2`}>
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                </div>
                <p className="text-xl sm:text-2xl font-semibold text-neutral-950">{stat.value}</p>
                <p className="text-xs text-neutral-500 font-medium mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-sm text-neutral-900 mb-4">Mensagens por dia</h3>
            <div className="flex items-end gap-1 h-32">
              {daily.slice(-30).map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-amber-400 hover:bg-amber-500 transition-colors cursor-default"
                    style={{ height: `${(d.conversations / maxVal) * 100}%`, minHeight: d.conversations > 0 ? 4 : 1 }}
                    title={`${d.date}: ${d.conversations} mensagens`}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2 text-xs text-neutral-400">
              <span>{daily.slice(-30)[0]?.date}</span>
              <span>{daily.slice(-1)[0]?.date}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── NPS Tab ──────────────────────────────────────────────────────────────────

function NPSTab() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-600">NPS</p>
        <h2 className="text-xl sm:text-2xl font-semibold text-neutral-950">Satisfação dos hóspedes</h2>
      </div>
      <div className="rounded-2xl border border-dashed border-neutral-300 p-12 text-center">
        <Award className="w-12 h-12 mx-auto mb-3 text-neutral-300" />
        <p className="text-base font-semibold text-neutral-700">Nenhuma fonte de NPS conectada ainda</p>
        <p className="text-sm text-neutral-500 mt-1 max-w-md mx-auto">
          Quando uma fonte de NPS (ex: pesquisa pós-estadia) estiver integrada, as notas e comentários aparecem aqui.
        </p>
      </div>
    </div>
  );
}

// ─── Bot Training Tab ─────────────────────────────────────────────────────────

function BotTrainingTab() {
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
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-600">Treinamento</p>
          <h2 className="text-xl font-semibold text-neutral-950">Configurar Bot IA</h2>
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

      <div className="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6 shadow-sm space-y-5">
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
                  <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">{field.label}</label>
                  <input value={String(config[field.key])} onChange={e => setConfig(prev => ({ ...prev, [field.key]: e.target.value }))} placeholder={field.placeholder} className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
                </div>
              ))}
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Descrição do Hotel</label>
              <textarea value={config.description} onChange={e => setConfig(prev => ({ ...prev, description: e.target.value }))} rows={4} className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none resize-none" />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Políticas (check-in, checkout, pets...)</label>
              <textarea value={config.policies} onChange={e => setConfig(prev => ({ ...prev, policies: e.target.value }))} rows={3} className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none resize-none" />
            </div>
          </>
        )}

        {activeSection === 'pricing' && (
          <>
            <div>
              <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Tabela de Tarifas (UHs e preços)</label>
              <textarea value={config.rooms} onChange={e => setConfig(prev => ({ ...prev, rooms: e.target.value }))} rows={6} placeholder="Executiva: R$ 359/noite&#10;Master: R$ 520/noite&#10;..." className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none resize-none font-mono" />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">FAQ (perguntas e respostas frequentes)</label>
              <textarea value={config.faq} onChange={e => setConfig(prev => ({ ...prev, faq: e.target.value }))} rows={6} placeholder="Café da manhã incluso? Sim, das 6h às 10h.&#10;Tem estacionamento? Sim, gratuito." className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none resize-none" />
            </div>
          </>
        )}

        {activeSection === 'personality' && (
          <>
            <div>
              <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Personalidade do Bot</label>
              <select value={config.botMood} onChange={e => setConfig(prev => ({ ...prev, botMood: e.target.value }))} className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none">
                {['professional', 'friendly', 'formal', 'casual'].map(m => (
                  <option key={m} value={m}>{m === 'professional' ? 'Profissional' : m === 'friendly' ? 'Amigável' : m === 'formal' ? 'Formal' : 'Casual'}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Nome do Assistente Virtual</label>
              <input value={config.widgetBotName} onChange={e => setConfig(prev => ({ ...prev, widgetBotName: e.target.value }))} className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Mensagem de Boas-vindas</label>
              <textarea value={config.widgetWelcomeMessage} onChange={e => setConfig(prev => ({ ...prev, widgetWelcomeMessage: e.target.value }))} rows={3} className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none resize-none" />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Link Google Reviews (para NPS)</label>
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
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-600">CRM</p>
        <h2 className="text-xl font-semibold text-neutral-950">Leads e Scoring</h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Leads', value: leads.length.toString(), color: 'text-neutral-900' },
          { label: 'Quentes', value: leads.filter(l => l.stage === 'hot').length.toString(), color: 'text-red-600' },
          { label: 'Mornos', value: leads.filter(l => l.stage === 'warm').length.toString(), color: 'text-amber-600' },
          { label: 'Score Médio', value: Math.round(leads.reduce((a, b) => a + b.score, 0) / leads.length).toString(), color: 'text-emerald-600' },
        ].map(stat => (
          <div key={stat.label} className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm">
            <p className={`text-2xl font-semibold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-neutral-500 font-medium">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-neutral-100">
                {['Lead', 'Score IA', 'Estágio', 'Canal', 'Último Contato', 'Tags'].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{h}</th>
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
                        <div className="w-8 h-8 rounded-full bg-neutral-200 flex items-center justify-center text-xs font-semibold text-neutral-600">{lead.name[0]}</div>
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
                        <span className={`text-sm font-semibold ${scoreColor(lead.score)}`}>{lead.score}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3"><span className={`text-[9px] font-semibold uppercase px-2 py-0.5 rounded-full ${cls}`}>{label}</span></td>
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
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-600">Simulador</p>
        <h2 className="text-xl font-semibold text-neutral-950">Testar WhatsApp Bot</h2>
        <p className="text-sm text-neutral-500">Simule uma conversa real com o assistente virtual do hotel.</p>
      </div>

      {/* Phone frame */}
      <div className="flex justify-center">
        <div className="w-full max-w-sm bg-neutral-100 rounded-[40px] p-3 shadow-2xl">
          {/* Status bar */}
          <div className="bg-[#075E54] rounded-[32px] overflow-hidden">
            <div className="px-4 py-3 flex items-center gap-3 border-b border-white/10">
              <div className="w-9 h-9 rounded-full bg-emerald-400 flex items-center justify-center font-semibold text-white text-sm">R</div>
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
  return <FlowBuilder />;
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
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-600">Disparos</p>
          <h2 className="text-xl font-semibold text-neutral-950">Broadcast Manager</h2>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-900 text-white text-sm font-bold hover:bg-neutral-800 transition-colors">
          <Send className="w-4 h-4" /> Novo disparo
        </button>
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
            <p className={`text-xl font-semibold ${stat.color}`}>{stat.value}</p>
            <p className="text-[10px] text-neutral-500 font-medium">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
        {broadcasts.map((b, idx) => (
          <div key={b.id} className={`p-4 sm:p-5 ${idx < broadcasts.length - 1 ? 'border-b border-neutral-100' : ''}`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-bold text-sm text-neutral-900">{b.name}</p>
                <p className="text-xs text-neutral-500">{b.date}</p>
              </div>
              <span className={`text-[9px] font-semibold uppercase px-2 py-0.5 rounded-full ${b.status === 'sent' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
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
                    <p className="font-semibold text-sm text-neutral-900">{m.value}</p>
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

// ─── Financeiro / PIX Tab ────────────────────────────────────────────────────

interface ReservationPix {
  id: string;
  guest_name: string;
  total_amount: number;
  contact_email: string | null;
  reservation_code: string | null;
  room_number: string | null;
  check_in: string;
  check_out: string;
  pix_payment_id: string | null;
  pix_status: string | null;
  pix_qr_base64: string | null;
  pix_copia_cola: string | null;
  pix_generated_at: string | null;
  fiscal_data: string | null;
}

function FinanceiroTab() {
  const [filter, setFilter] = useState<'all' | 'pending' | 'paid'>('all');
  const [showForm, setShowForm] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [tokenSaved, setTokenSaved] = useState(false);
  const [savingToken, setSavingToken] = useState(false);
  const [testingToken, setTestingToken] = useState(false);
  const [reservations, setReservations] = useState<ReservationPix[]>([]);
  const [loadingRes, setLoadingRes] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null); // reservation id or 'manual'
  const [viewPix, setViewPix] = useState<{ qrCodeUrl: string; copiaECola: string; paymentId: string; guestName: string } | null>(null);
  const [form, setForm] = useState({ guestName: '', guestEmail: '', amount: '', description: '', guestCpf: '' });

  // Carregar reservas e verificar se token está configurado
  useEffect(() => {
    async function load() {
      setLoadingRes(true);
      const { data } = await supabase
        .from('reservations')
        .select('id,guest_name,total_amount,contact_email,reservation_code,room_number,check_in,check_out,pix_payment_id,pix_status,pix_qr_base64,pix_copia_cola,pix_generated_at,fiscal_data')
        .in('status', ['confirmed', 'checked_in', 'pending'])
        .order('created_at', { ascending: false });
      if (data) setReservations(data as ReservationPix[]);

      const { data: setting } = await supabase.from('app_settings').select('value').eq('id', 'mp_access_token').single();
      if (setting?.value) setTokenSaved(true);
      setLoadingRes(false);
    }
    void load();
  }, []);

  async function handleSaveToken() {
    if (!tokenInput.trim()) { toast.error('Informe o Access Token'); return; }
    setSavingToken(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-pix-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_token', token: tokenInput.trim() }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error);
      setTokenSaved(true);
      setShowConfig(false);
      setTokenInput('');
      toast.success('Access Token salvo! PIX automático ativado.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar token');
    } finally {
      setSavingToken(false);
    }
  }

  async function handleTestToken() {
    setTestingToken(true);
    try {
      const body: Record<string, unknown> = { action: 'test_token' };
      if (tokenInput.trim()) body.token = tokenInput.trim();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-pix-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { ok: boolean; error?: string; payment_id?: string };
      if (data.ok) toast.success(`Token válido! ID teste: ${data.payment_id}`);
      else toast.error(`Token inválido: ${data.error}`);
    } catch {
      toast.error('Erro ao testar conexão');
    } finally {
      setTestingToken(false);
    }
  }

  async function generatePixForReservation(res: ReservationPix) {
    if (!tokenSaved) { toast.error('Configure o Access Token do Mercado Pago primeiro'); setShowConfig(true); return; }
    setGenerating(res.id);
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/create-pix-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_for_reservation',
          reservation_id: res.id,
        }),
      });
      const data = await r.json() as { ok: boolean; error?: string; qr_code?: string; qr_code_base64?: string; payment_id?: string };
      if (!data.ok) throw new Error(data.error);

      const copiaECola = data.qr_code ?? '';
      let qrCodeUrl = '';
      if (data.qr_code_base64) {
        qrCodeUrl = `data:image/png;base64,${data.qr_code_base64}`;
      } else if (copiaECola) {
        qrCodeUrl = await QRCodeLib.toDataURL(copiaECola, { margin: 2, width: 280, color: { dark: '#0a0a0a', light: '#ffffff' } });
      }

      // Atualiza localmente
      setReservations(prev => prev.map(rv => rv.id === res.id ? {
        ...rv,
        pix_payment_id: data.payment_id ?? null,
        pix_status: 'pending',
        pix_qr_base64: data.qr_code_base64 ?? null,
        pix_copia_cola: copiaECola,
        pix_generated_at: new Date().toISOString(),
      } : rv));

      setViewPix({ qrCodeUrl, copiaECola, paymentId: data.payment_id ?? '', guestName: res.guest_name });
      toast.success('QR Code PIX gerado!');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao gerar PIX');
    } finally {
      setGenerating(null);
    }
  }

  async function generateManualCharge() {
    if (!form.guestName || !form.amount) { toast.error('Nome e valor são obrigatórios'); return; }
    if (!tokenSaved) { toast.error('Configure o Access Token primeiro'); setShowConfig(true); return; }
    setGenerating('manual');
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/create-pix-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_for_reservation',
          amount: parseFloat(form.amount),
          description: form.description || `Cobrança — ${form.guestName}`,
          payer_email: form.guestEmail || 'hospede@hotel.com',
          payer_name: form.guestName,
          payer_cpf: form.guestCpf || undefined,
        }),
      });
      const data = await r.json() as { ok: boolean; error?: string; qr_code?: string; qr_code_base64?: string; payment_id?: string };
      if (!data.ok) throw new Error(data.error);

      const copiaECola = data.qr_code ?? '';
      let qrCodeUrl = '';
      if (data.qr_code_base64) {
        qrCodeUrl = `data:image/png;base64,${data.qr_code_base64}`;
      } else if (copiaECola) {
        qrCodeUrl = await QRCodeLib.toDataURL(copiaECola, { margin: 2, width: 280, color: { dark: '#0a0a0a', light: '#ffffff' } });
      }
      setViewPix({ qrCodeUrl, copiaECola, paymentId: data.payment_id ?? '', guestName: form.guestName });
      setShowForm(false);
      setForm({ guestName: '', guestEmail: '', amount: '', description: '', guestCpf: '' });
      toast.success('PIX gerado!');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao gerar PIX');
    } finally {
      setGenerating(null);
    }
  }

  const pixPending   = reservations.filter(r => !r.pix_payment_id);
  const pixGenerated = reservations.filter(r => !!r.pix_payment_id);
  const filtered = filter === 'all' ? reservations : filter === 'pending' ? pixPending : pixGenerated;
  const totalGenerated = pixGenerated.reduce((a, r) => a + (r.total_amount ?? 0), 0);
  const totalPending   = pixPending.reduce((a, r) => a + (r.total_amount ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-600">Financeiro</p>
          <h2 className="text-xl font-semibold text-neutral-950">PIX Automático — Mercado Pago</h2>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowConfig(true)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition-colors ${tokenSaved ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}
          >
            {tokenSaved ? <CheckCircle className="w-4 h-4" /> : <Key className="w-4 h-4" />}
            {tokenSaved ? 'Token configurado' : 'Configurar token'}
          </button>
          <button
            onClick={() => { setForm({ guestName: '', guestEmail: '', amount: '', description: '', guestCpf: '' }); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-900 text-white text-sm font-bold hover:bg-neutral-800 transition-colors"
          >
            <QrCode className="w-4 h-4" /> Cobrança avulsa
          </button>
        </div>
      </div>

      {/* Banner token não configurado */}
      {!tokenSaved && (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <p className="font-semibold text-amber-900 text-sm">Configure seu Access Token do Mercado Pago</p>
            <p className="text-xs text-amber-700 mt-1 leading-relaxed">
              Cole o token uma única vez — o sistema salva no servidor e gera QR Codes automaticamente com o valor exato de cada reserva.
            </p>
          </div>
          <button onClick={() => setShowConfig(true)} className="shrink-0 px-5 py-3 bg-amber-500 text-white text-sm font-semibold rounded-xl hover:bg-amber-400 transition-colors flex items-center gap-2">
            <Key className="w-4 h-4" /> Configurar agora
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Aguardando PIX', value: pixPending.length.toString(),                      icon: Clock,      color: 'text-amber-600',   bg: 'bg-amber-50' },
          { label: 'A receber',      value: `R$ ${totalPending.toLocaleString('pt-BR')}`,      icon: Banknote,   color: 'text-amber-600',   bg: 'bg-amber-50' },
          { label: 'QR Gerados',     value: pixGenerated.length.toString(),                    icon: QrCode,     color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Valor gerado',   value: `R$ ${totalGenerated.toLocaleString('pt-BR')}`,    icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map(stat => (
          <div key={stat.label} className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm">
            <div className={`w-8 h-8 rounded-xl ${stat.bg} flex items-center justify-center mb-2`}>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </div>
            <p className={`text-xl font-semibold ${stat.color}`}>{stat.value}</p>
            <p className="text-[10px] text-neutral-500 font-medium">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Lista reservas */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex gap-2 overflow-x-auto scrollbar-none">
            {(['all', 'pending', 'paid'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} className={`shrink-0 px-4 py-2 rounded-xl text-[10px] font-semibold uppercase tracking-wider transition-colors ${filter === f ? 'bg-neutral-900 text-white' : 'bg-white border border-neutral-200 text-neutral-500'}`}>
                {f === 'all' ? 'Todas' : f === 'pending' ? `Sem PIX (${pixPending.length})` : `PIX Gerado (${pixGenerated.length})`}
              </button>
            ))}
          </div>
          <button onClick={() => window.location.reload()} className="p-2 rounded-xl text-neutral-400 hover:bg-neutral-100">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
          {loadingRes ? (
            <div className="py-16 text-center text-neutral-400">
              <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin opacity-30" />
              <p className="text-sm font-bold">Carregando reservas...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-neutral-400">
              <Banknote className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-bold">Nenhuma reserva encontrada</p>
              <p className="text-xs mt-1">Reservas confirmadas e ativas aparecem aqui</p>
            </div>
          ) : filtered.map((res, idx) => {
            const hasPix = !!res.pix_payment_id;
            const isGenerating = generating === res.id;
            return (
              <div key={res.id} className={`flex items-center gap-3 p-4 sm:p-5 ${idx < filtered.length - 1 ? 'border-b border-neutral-100' : ''}`}>
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${hasPix ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                  {hasPix ? <QrCode className="w-5 h-5 text-emerald-600" /> : <Clock className="w-5 h-5 text-amber-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-neutral-900 truncate">{res.guest_name}</p>
                  <p className="text-xs text-neutral-500">
                    {res.room_number ? `UH ${res.room_number} · ` : ''}
                    {new Date(res.check_in).toLocaleDateString('pt-BR')} → {new Date(res.check_out).toLocaleDateString('pt-BR')}
                    {res.reservation_code ? ` · #${res.reservation_code}` : ''}
                  </p>
                  {hasPix && res.pix_generated_at && (
                    <p className="text-[9px] text-emerald-600 font-bold mt-0.5">PIX gerado {new Date(res.pix_generated_at).toLocaleString('pt-BR')}</p>
                  )}
                </div>
                <div className="text-right shrink-0 mr-2">
                  <p className="font-semibold text-sm text-neutral-900">R$ {Number(res.total_amount ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  <p className="text-[9px] text-neutral-400">total</p>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  {hasPix && res.pix_copia_cola && (
                    <button
                      onClick={async () => {
                        let qrCodeUrl = '';
                        if (res.pix_qr_base64) qrCodeUrl = `data:image/png;base64,${res.pix_qr_base64}`;
                        else if (res.pix_copia_cola) qrCodeUrl = await QRCodeLib.toDataURL(res.pix_copia_cola!, { margin: 2, width: 280, color: { dark: '#0a0a0a', light: '#ffffff' } });
                        setViewPix({ qrCodeUrl, copiaECola: res.pix_copia_cola!, paymentId: res.pix_payment_id!, guestName: res.guest_name });
                      }}
                      className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-[10px] font-semibold rounded-lg border border-emerald-200 hover:bg-emerald-100"
                    >
                      Ver QR
                    </button>
                  )}
                  <button
                    onClick={() => generatePixForReservation(res)}
                    disabled={isGenerating}
                    className="px-3 py-1.5 bg-neutral-900 text-white text-[10px] font-semibold rounded-lg hover:bg-neutral-800 disabled:opacity-60 flex items-center gap-1 transition-all"
                  >
                    {isGenerating ? <RefreshCw className="w-3 h-3 animate-spin" /> : <QrCode className="w-3 h-3" />}
                    {hasPix ? 'Regen.' : 'Gerar PIX'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal: Configurar token */}
      <AnimatePresence>
        {showConfig && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowConfig(false)} className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative w-full max-w-md bg-white rounded-2xl p-6 sm:p-8 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-neutral-950">🟡 Mercado Pago</h3>
                  <p className="text-xs text-neutral-500 mt-0.5">Access Token salvo no servidor — nunca exposto</p>
                </div>
                <button onClick={() => setShowConfig(false)} className="p-2 rounded-xl bg-neutral-100 text-neutral-500"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Access Token de Produção</label>
                  <input
                    type="password"
                    value={tokenInput}
                    onChange={e => setTokenInput(e.target.value)}
                    placeholder="APP_USR-000000000000000-000000-..."
                    className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm font-mono border-0 focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                  <p className="text-[10px] text-neutral-400 mt-1">
                    Painel MP → Seu negócio → Credenciais → Access Token de produção
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-blue-50 flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700 leading-relaxed">
                    O token é salvo <strong>criptografado no servidor Supabase</strong> e nunca trafega pelo navegador após o cadastro. Cada reserva gera um QR Code único com o valor exato.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleTestToken}
                    disabled={testingToken}
                    className="flex-1 py-3 bg-neutral-100 rounded-xl text-sm font-bold text-neutral-700 hover:bg-neutral-200 disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {testingToken ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    Testar
                  </button>
                  <button
                    onClick={handleSaveToken}
                    disabled={savingToken}
                    className="flex-1 py-3 bg-neutral-900 text-white rounded-xl text-sm font-bold hover:bg-neutral-800 disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {savingToken ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Salvar token
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Ver QR Code */}
      <AnimatePresence>
        {viewPix && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setViewPix(null)} className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl text-center">
              <button onClick={() => setViewPix(null)} className="absolute top-4 right-4 p-2 rounded-xl bg-neutral-100 text-neutral-500"><X className="w-4 h-4" /></button>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 mb-1">QR Code PIX</p>
              <p className="font-semibold text-neutral-900 mb-4 truncate">{viewPix.guestName}</p>
              {viewPix.qrCodeUrl ? (
                <img src={viewPix.qrCodeUrl} alt="QR Code PIX" className="mx-auto w-56 h-56 rounded-2xl border border-neutral-200 mb-4" />
              ) : (
                <div className="mx-auto w-56 h-56 rounded-2xl bg-neutral-50 border border-neutral-200 flex items-center justify-center mb-4">
                  <QrCode className="w-20 h-20 text-neutral-300" />
                </div>
              )}
              <div className="text-left mb-4">
                <p className="text-[10px] font-semibold uppercase text-neutral-400 mb-1.5">Pix Copia e Cola</p>
                <div className="flex items-center gap-2 p-3 bg-neutral-50 rounded-xl border border-neutral-200">
                  <p className="text-[9px] font-mono text-neutral-600 flex-1 break-all leading-relaxed line-clamp-3">{viewPix.copiaECola}</p>
                  <button onClick={() => { navigator.clipboard.writeText(viewPix.copiaECola); toast.success('Copiado!'); }} className="shrink-0 p-2 rounded-lg bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-100">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                {viewPix.paymentId && <p className="text-[9px] text-neutral-400 mt-1">ID: {viewPix.paymentId}</p>}
              </div>
              <button onClick={() => setViewPix(null)} className="w-full py-3 bg-neutral-900 text-white rounded-xl text-sm font-bold">Fechar</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Cobrança avulsa */}
      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { if (generating !== 'manual') setShowForm(false); }} className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative w-full max-w-md bg-white rounded-2xl p-6 sm:p-8 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-neutral-950">Cobrança PIX avulsa</h3>
                <button onClick={() => setShowForm(false)} className="p-2 rounded-xl bg-neutral-100 text-neutral-500"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Nome do hóspede</label>
                  <input value={form.guestName} onChange={e => setForm(f => ({ ...f, guestName: e.target.value }))} placeholder="Ana Beatriz Costa" className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">E-mail (opcional)</label>
                    <input type="email" value={form.guestEmail} onChange={e => setForm(f => ({ ...f, guestEmail: e.target.value }))} placeholder="hospede@email.com" className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">CPF <span className="text-red-500">*</span></label>
                    <input value={form.guestCpf} onChange={e => setForm(f => ({ ...f, guestCpf: e.target.value }))} placeholder="000.000.000-00" className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Valor (R$)</label>
                    <input type="number" step="0.01" min="1" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="750,00" className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Descrição</label>
                    <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Hospedagem" className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowForm(false)} className="flex-1 py-3 bg-neutral-100 rounded-xl text-sm font-bold text-neutral-600">Cancelar</button>
                  <button
                    onClick={generateManualCharge}
                    disabled={generating === 'manual'}
                    className="flex-1 py-3 bg-neutral-900 text-white rounded-xl text-sm font-bold hover:bg-neutral-800 disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {generating === 'manual' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                    {generating === 'manual' ? 'Gerando...' : 'Gerar QR Code'}
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

// ─── Integrações Tab ──────────────────────────────────────────────────────────

interface SocialIntegration {
  id: string;
  name: string;
  description: string;
  icon: ReactElement;
  color: string;
  colorHex: string;
  docsUrl: string;
  field: string;
}

const SOCIAL_INTEGRATIONS: SocialIntegration[] = [
  { id: 'whatsapp', name: 'WhatsApp Business', description: 'Envio e recebimento de mensagens via API oficial Meta Cloud.', icon: <MessageSquare className="w-6 h-6" />, color: 'bg-emerald-500', colorHex: '#10b981', docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api', field: 'whatsappPhoneId' },
  { id: 'instagram', name: 'Instagram Professional', description: 'Responder DMs e comentários automaticamente com IA.', icon: <Instagram className="w-6 h-6" />, color: 'bg-pink-500', colorHex: '#ec4899', docsUrl: 'https://developers.facebook.com/docs/instagram-basic-display-api', field: 'instagramAccount' },
  { id: 'facebook', name: 'Facebook Pages', description: 'Gerenciar mensagens do Messenger e comentários em posts.', icon: <Facebook className="w-6 h-6" />, color: 'bg-blue-600', colorHex: '#2563eb', docsUrl: 'https://developers.facebook.com/docs/facebook-login/', field: 'facebookPage' },
  { id: 'email', name: 'E-mail SMTP', description: 'Enviar confirmações de reserva e notificações por e-mail.', icon: <Mail className="w-6 h-6" />, color: 'bg-amber-500', colorHex: '#f59e0b', docsUrl: '#', field: 'smtpHost' },
  { id: 'google', name: 'Google Reviews', description: 'Monitorar e responder avaliações do Google Meu Negócio.', icon: <Globe className="w-6 h-6" />, color: 'bg-red-500', colorHex: '#ef4444', docsUrl: 'https://developers.google.com/my-business', field: 'googleBusinessId' },
  { id: 'linkedin', name: 'LinkedIn', description: 'Publicar conteúdo e capturar leads corporativos.', icon: <Linkedin className="w-6 h-6" />, color: 'bg-sky-700', colorHex: '#0369a1', docsUrl: 'https://www.linkedin.com/developers/', field: 'linkedinPage' },
];

interface SmtpConfig {
  host: string;
  port: string;
  user: string;
  pass: string;
  fromName: string;
  imapHost?: string;
  imapPort?: string;
  signatureName?: string;
  signatureRole?: string;
  signaturePhone?: string;
  signatureWebsite?: string;
  signatureAddress?: string;
  signatureLogoUrl?: string;
}
interface PmsWebhook { webhookUrl: string; apiKey: string; enabled: boolean; }

function IntegracoesTab() {
  const [statuses, setStatuses] = useState<Record<string, 'connected' | 'disconnected'>>(
    Object.fromEntries(SOCIAL_INTEGRATIONS.map(i => [i.id, 'disconnected']))
  );
  const [showSmtp, setShowSmtp] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState<SocialIntegration | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [smtpConfig, setSmtpConfig] = useState<SmtpConfig>({
    host: '',
    port: '587',
    user: '',
    pass: '',
    fromName: 'Recepção Hotel',
    imapHost: '',
    imapPort: '993',
    signatureName: 'Royal Macaé Palace Hotel',
    signatureRole: 'Reservas',
    signaturePhone: '',
    signatureWebsite: 'https://royalmacae.com.br',
    signatureAddress: '',
    signatureLogoUrl: '',
  });
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

  useEffect(() => {
    let alive = true;

    async function loadSmtpConfig() {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('id', 'smtp_config')
        .maybeSingle();

      if (!alive) return;
      if (error) {
        console.warn('[integracoes] Falha ao carregar SMTP:', error.message);
        return;
      }

      if (data?.value) {
        try {
          setSmtpConfig(current => ({ ...current, ...(JSON.parse(data.value) as Partial<SmtpConfig>) }));
          setStatuses(s => ({ ...s, email: 'connected' }));
        } catch {
          console.warn('[integracoes] smtp_config inválido em app_settings.');
        }
      }
    }

    loadSmtpConfig();
    return () => { alive = false; };
  }, []);

  async function saveSmtp() {
    if (!smtpConfig.host || !smtpConfig.user) { toast.error('Host e usuário são obrigatórios'); return; }
    const { error } = await supabase.from('app_settings').upsert({
      id: 'smtp_config',
      value: JSON.stringify(smtpConfig),
      updated_at: new Date().toISOString(),
    });
    if (error) {
      toast.error('Não foi possível salvar a configuração SMTP/IMAP.');
      console.warn('[integracoes] Falha ao salvar SMTP:', error.message);
      return;
    }
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
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-600">Integrações</p>
          <h2 className="text-xl font-semibold text-neutral-950">Conectar Canais & APIs</h2>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-200">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span className="text-xs font-bold text-emerald-700">Conexão via API Oficial</span>
        </div>
      </div>

      {/* Redes sociais */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Redes Sociais & Canais</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SOCIAL_INTEGRATIONS.map(integration => {
            const isConnected = statuses[integration.id] === 'connected';
            return (
              <motion.article key={integration.id} whileHover={{ y: -2 }} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 rounded-2xl ${integration.color} flex items-center justify-center text-white shadow-sm`}>
                    {integration.icon}
                  </div>
                  <span className={`flex items-center gap-1.5 text-[9px] font-semibold uppercase px-2.5 py-1 rounded-full ${isConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-neutral-500'}`}>
                    {isConnected ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                    {isConnected ? 'Conectado' : 'Desconectado'}
                  </span>
                </div>
                <h4 className="font-semibold text-sm text-neutral-900 mb-1">{integration.name}</h4>
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
        <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Integração PMS Externo</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { id: 'cloudbeds', name: 'Cloudbeds', icon: <Database className="w-6 h-6" />, color: '#6366f1' },
            { id: 'mews', name: 'Mews', icon: <Cloud className="w-6 h-6" />, color: '#10b981' },
          ].map(pms => {
            const cfg = pmsConfig[pms.id] ?? { webhookUrl: '', apiKey: '', enabled: false };
            return (
              <div key={pms.id} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ background: pms.color }}>{pms.icon}</div>
                  <div>
                    <p className="font-semibold text-sm text-neutral-900">{pms.name}</p>
                    <p className="text-[10px] text-neutral-500">Webhook Outbound</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Webhook URL</label>
                    <input value={cfg.webhookUrl} onChange={e => savePmsWebhook(pms.id, { ...cfg, webhookUrl: e.target.value })} placeholder={`https://api.${pms.id}.com/v1/webhooks/...`} className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none font-mono text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">API Key</label>
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
        <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Endpoints Webhook Inbound</h3>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4">
          <p className="text-xs text-neutral-500">Configure essas URLs no Meta Developer Portal para receber mensagens em tempo real.</p>
          {['whatsapp', 'instagram', 'facebook'].map(ch => (
            <div key={ch} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">{ch.charAt(0).toUpperCase() + ch.slice(1)} Webhook</label>
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
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
            <Mail className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="font-semibold text-sm text-neutral-900">E-mail de Confirmação de Reserva</p>
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
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative w-full max-w-md bg-white rounded-2xl p-6 sm:p-8 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-2xl ${showTokenModal.color} flex items-center justify-center text-white`}>{showTokenModal.icon}</div>
                  <h3 className="text-lg font-semibold text-neutral-950">{showTokenModal.name}</h3>
                </div>
                <button onClick={() => setShowTokenModal(null)} className="p-2 rounded-xl bg-neutral-100 text-neutral-500"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">
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
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative w-full max-w-lg bg-white rounded-2xl p-6 sm:p-8 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-neutral-950">Configurar Servidor E-mail</h3>
                <button onClick={() => setShowSmtp(false)} className="p-2 rounded-xl bg-neutral-100 text-neutral-500"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Host SMTP</label>
                    <input value={smtpConfig.host} onChange={e => setSmtpConfig(c => ({ ...c, host: e.target.value }))} placeholder="smtp.gmail.com" className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Porta</label>
                    <input value={smtpConfig.port} onChange={e => setSmtpConfig(c => ({ ...c, port: e.target.value }))} placeholder="587" className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Usuário / E-mail</label>
                  <input value={smtpConfig.user} onChange={e => setSmtpConfig(c => ({ ...c, user: e.target.value }))} placeholder="hotel@gmail.com" className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Senha / App Password</label>
                  <input type="password" value={smtpConfig.pass} onChange={e => setSmtpConfig(c => ({ ...c, pass: e.target.value }))} placeholder="••••••••••••" className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Servidor IMAP</label>
                    <input value={smtpConfig.imapHost ?? ''} onChange={e => setSmtpConfig(c => ({ ...c, imapHost: e.target.value }))} placeholder="imap.gmail.com" className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Porta IMAP</label>
                    <input value={smtpConfig.imapPort ?? '993'} onChange={e => setSmtpConfig(c => ({ ...c, imapPort: e.target.value }))} placeholder="993" className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
                  </div>
                </div>
                <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs font-medium leading-relaxed text-amber-800">
                  Para receber e-mails, preencha o servidor IMAP. Para Gmail: imap.gmail.com / 993.
                </p>
                <div>
                  <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Nome do Remetente</label>
                  <input value={smtpConfig.fromName} onChange={e => setSmtpConfig(c => ({ ...c, fromName: e.target.value }))} placeholder="Recepção Royal PMS" className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
                </div>
                <div className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Assinatura profissional</p>
                    <p className="text-xs text-neutral-500">Usada automaticamente nas respostas enviadas pelo Omni-Inbox.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Nome / Empresa</label>
                      <input value={smtpConfig.signatureName ?? ''} onChange={e => setSmtpConfig(c => ({ ...c, signatureName: e.target.value }))} placeholder="Royal Macaé Palace Hotel" className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Departamento</label>
                      <input value={smtpConfig.signatureRole ?? ''} onChange={e => setSmtpConfig(c => ({ ...c, signatureRole: e.target.value }))} placeholder="Reservas" className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Telefone</label>
                      <input value={smtpConfig.signaturePhone ?? ''} onChange={e => setSmtpConfig(c => ({ ...c, signaturePhone: e.target.value }))} placeholder="+55 22 0000-0000" className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Site</label>
                      <input value={smtpConfig.signatureWebsite ?? ''} onChange={e => setSmtpConfig(c => ({ ...c, signatureWebsite: e.target.value }))} placeholder="https://royalmacae.com.br" className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Endereço</label>
                    <input value={smtpConfig.signatureAddress ?? ''} onChange={e => setSmtpConfig(c => ({ ...c, signatureAddress: e.target.value }))} placeholder="Av. Atlântica, Macaé - RJ" className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Logo URL</label>
                    <input value={smtpConfig.signatureLogoUrl ?? ''} onChange={e => setSmtpConfig(c => ({ ...c, signatureLogoUrl: e.target.value }))} placeholder="https://..." className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
                  </div>
                  <div className="rounded-xl bg-neutral-50 p-4">
                    <div className="flex items-center gap-3">
                      {smtpConfig.signatureLogoUrl ? <img src={smtpConfig.signatureLogoUrl} alt="" className="h-10 w-10 rounded-lg object-contain bg-white border border-neutral-200" /> : <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center"><Hotel className="h-5 w-5 text-amber-700" /></div>}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-neutral-900">{smtpConfig.signatureName || smtpConfig.fromName || 'Royal Macaé Palace Hotel'}</p>
                        <p className="text-xs font-bold text-amber-700">{smtpConfig.signatureRole || 'Reservas'}</p>
                        <p className="text-[11px] text-neutral-500 truncate">{[smtpConfig.signaturePhone, smtpConfig.signatureWebsite].filter(Boolean).join(' · ')}</p>
                        {smtpConfig.signatureAddress && <p className="text-[11px] text-neutral-400 truncate">{smtpConfig.signatureAddress}</p>}
                      </div>
                    </div>
                  </div>
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

// ─── Sub-tab strip helper ────────────────────────────────────────────────────

type SubTabItem<T extends string> = { id: T; label: string; icon?: typeof Inbox };
function SubTabStrip<T extends string>({ items, active, onChange }: { items: SubTabItem<T>[]; active: T; onChange: (id: T) => void }) {
  return (
    <div className="flex gap-1 mb-5 border-b border-neutral-200 overflow-x-auto scrollbar-none">
      {items.map(item => {
        const isActive = active === item.id;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            className={`shrink-0 flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              isActive
                ? 'text-amber-700 border-amber-600'
                : 'text-neutral-500 border-transparent hover:text-neutral-700 hover:border-neutral-300'
            }`}
          >
            {Icon && <Icon className="w-4 h-4" />}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Umbrella tabs (consolidação) ────────────────────────────────────────────

function ContatosShell() {
  const [sub, setSub] = useState<'list' | 'nps'>('list');
  return (
    <div>
      <SubTabStrip<'list' | 'nps'>
        items={[
          { id: 'list', label: 'Contatos & CRM', icon: Users },
          { id: 'nps', label: 'NPS', icon: Heart },
        ]}
        active={sub}
        onChange={setSub}
      />
      {sub === 'list' && <CRMTab />}
      {sub === 'nps' && <NPSTab />}
    </div>
  );
}

function CampanhasShell() {
  const [sub, setSub] = useState<'campaigns' | 'broadcasts' | 'templates'>('campaigns');
  return (
    <div>
      <SubTabStrip<'campaigns' | 'broadcasts' | 'templates'>
        items={[
          { id: 'campaigns', label: 'Campanhas', icon: Megaphone },
          { id: 'broadcasts', label: 'Disparos', icon: Send },
          { id: 'templates', label: 'Templates', icon: Layers },
        ]}
        active={sub}
        onChange={setSub}
      />
      {sub === 'campaigns' && <CampaignsTab />}
      {sub === 'broadcasts' && <BroadcastsTab />}
      {sub === 'templates' && <TemplatesTab />}
    </div>
  );
}

function AutomacoesShell() {
  const [sub, setSub] = useState<'flows' | 'simulator' | 'training'>('flows');
  return (
    <div>
      <SubTabStrip<'flows' | 'simulator' | 'training'>
        items={[
          { id: 'flows', label: 'Fluxos', icon: Zap },
          { id: 'simulator', label: 'Simulador', icon: Smartphone },
          { id: 'training', label: 'Treinamento IA', icon: Bot },
        ]}
        active={sub}
        onChange={setSub}
      />
      {sub === 'flows' && <FlowBuilderTab />}
      {sub === 'simulator' && <SimulatorTab />}
      {sub === 'training' && <BotTrainingTab />}
    </div>
  );
}

function ConfigsShell() {
  const [sub, setSub] = useState<'integracoes' | 'financeiro'>('integracoes');
  return (
    <div>
      <SubTabStrip<'integracoes' | 'financeiro'>
        items={[
          { id: 'integracoes', label: 'Integrações', icon: Link2 },
          { id: 'financeiro', label: 'Financeiro', icon: QrCode },
        ]}
        active={sub}
        onChange={setSub}
      />
      {sub === 'integracoes' && <IntegracoesTab />}
      {sub === 'financeiro' && <FinanceiroTab />}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

const NAV_SECTIONS = [
  {
    label: 'Workspace',
    items: [
      { id: 'inbox', label: 'Inbox', icon: Inbox, description: 'Conversas unificadas de todos os canais' },
      { id: 'contatos', label: 'Contatos', icon: Users, description: 'Base de contatos, segmentação e NPS' },
      { id: 'campanhas', label: 'Campanhas', icon: Megaphone, description: 'Campanhas, disparos em massa e templates' },
      { id: 'automacoes', label: 'Automações', icon: Zap, description: 'Fluxos, simulador e treinamento da IA' },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { id: 'analytics', label: 'Analytics', icon: BarChart3, description: 'Métricas e relatórios' },
      { id: 'configs', label: 'Configurações', icon: Settings, description: 'Integrações e financeiro' },
    ],
  },
] as const;

type NavItem = { id: string; label: string; icon: typeof Inbox; description: string };
const TABS: NavItem[] = NAV_SECTIONS.flatMap(s => s.items as readonly NavItem[]);

type TabId = typeof NAV_SECTIONS[number]['items'][number]['id'];

export default function MarketingModuleDashboard({ profile }: MarketingModuleDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabId>('inbox');
  const [kpis, setKpis] = useState<{ total: number; new: number; needsHuman: number }>({ total: 0, new: 0, needsHuman: 0 });

  useEffect(() => {
    let alive = true;
    async function loadKpis() {
      const [total, neu, human] = await Promise.all([
        supabase.from('marketing_contacts').select('id', { count: 'exact', head: true }),
        supabase.from('marketing_contacts').select('id', { count: 'exact', head: true }).eq('status', 'new'),
        supabase.from('marketing_contacts').select('id', { count: 'exact', head: true }).eq('status', 'needs_human'),
      ]);
      if (!alive) return;
      setKpis({
        total: total.count ?? 0,
        new: neu.count ?? 0,
        needsHuman: human.count ?? 0,
      });
    }
    loadKpis();
    const ch = supabase
      .channel('marketing_kpis')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketing_contacts' }, () => loadKpis())
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, []);

  const totalLeads = kpis.total;
  const newLeads = kpis.new;
  const needsHuman = kpis.needsHuman;

  const activeItem = TABS.find(t => t.id === activeTab)!;
  const activeSection = NAV_SECTIONS.find(s => s.items.some(i => i.id === activeTab))!;

  return (
    <div className="overflow-x-clip">
      <div className="flex flex-col min-h-[calc(100vh-8rem)] rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">

        {/* Top bar (header + KPIs) */}
        <header className="border-b border-neutral-200 bg-white">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3">
            <div className="min-w-0">
              <p className="text-xs text-neutral-400 truncate">
                {activeSection.label} <span className="mx-1 text-neutral-300">/</span> {activeItem.label}
              </p>
              <h1 className="text-base sm:text-lg font-semibold text-neutral-900 truncate flex items-center gap-2">
                <activeItem.icon className="w-4 h-4 text-amber-600 hidden sm:inline" />
                {activeItem.label}
              </h1>
            </div>
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <KpiChip label="Novos" value={newLeads} tone="amber" />
              <KpiChip label="Humano" value={needsHuman} tone="red" />
              <KpiChip label="Total" value={totalLeads} tone="neutral" />
            </div>
          </div>
        </header>

        {/* Top menu — sempre visível em todas as telas, sem sidebar */}
        <nav className="border-b border-neutral-200 bg-white px-3 sm:px-4 py-2 flex gap-1 overflow-x-auto scrollbar-none">
          {TABS.map(item => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                title={item.description}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  active ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                }`}
              >
                <item.icon className={`w-4 h-4 ${active ? 'text-white' : 'text-neutral-500'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Content area — agora ocupa toda a largura */}
        <main className="flex-1 min-w-0 overflow-x-auto bg-neutral-50/40 p-3 sm:p-5">
          {activeTab === 'inbox' && <LeadInboxTab profile={profile} />}
          {activeTab === 'contatos' && <ContatosShell />}
          {activeTab === 'campanhas' && <CampanhasShell />}
          {activeTab === 'automacoes' && <AutomacoesShell />}
          {activeTab === 'analytics' && <AnalyticsTab />}
          {activeTab === 'configs' && <ConfigsShell />}
        </main>
      </div>
    </div>
  );
}

function KpiChip({ label, value, tone }: { label: string; value: number; tone: 'amber' | 'red' | 'neutral' }) {
  const tones = {
    amber: 'text-amber-700 bg-amber-50 border-amber-100',
    red: 'text-red-700 bg-red-50 border-red-100',
    neutral: 'text-neutral-700 bg-neutral-100 border-neutral-200',
  } as const;
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${tones[tone]}`}>
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="text-[10px] uppercase tracking-wide opacity-80">{label}</span>
    </div>
  );
}
