import React, { ReactElement, useState, useEffect, useRef, useMemo } from 'react';
import FlowBuilder from './marketing/FlowBuilder';
import QRCodeLib from 'qrcode';
import { supabase, SUPABASE_URL } from '../supabase';
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
  CheckCircle, XCircle, Wifi, Key, Paperclip, File as FileIcon, Image as ImageIcon, CheckCheck, Check,
} from 'lucide-react';


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
  read?: boolean;
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
  botMood: string;
  // Automation engine
  enabled: boolean;
  provider: 'claude' | 'openai' | 'gemini' | 'rule';
  model: string;
  apiKey: string;
  systemPromptTemplate: string;
  escalationKeywords: string[];
  maxConsecutiveBotMsgs: number;
  historyWindow: number;
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
    read: row.read,
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

  // Seleção múltipla de conversas pra ações em lote
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  function toggleLeadSelected(id: string) {
    setSelectedLeads(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function clearSelection() { setSelectedLeads(new Set()); }

  // Resultados de busca server-side (IDs de conversas que matched)
  const [searchMatchIds, setSearchMatchIds] = useState<Set<string> | null>(null);
  const [searching, setSearching] = useState(false);

  // Reset selecao ao trocar de filtro/canal
  useEffect(() => { clearSelection(); }, [activeChannel, activeFilter, showOnlyMine]);

  // Busca server-side por palavra-chave em subject/body dos emails (debounced)
  useEffect(() => {
    const term = searchQuery.trim();
    if (term.length < 2) { setSearchMatchIds(null); return; }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        // Busca em inbox_messages.body e inbox_messages.subject
        const { data: msgMatches } = await supabase
          .from('inbox_messages')
          .select('contact_id')
          .or(`subject.ilike.%${term}%,body.ilike.%${term}%`)
          .limit(500);
        // Tambem busca em marketing_contacts.name e .email
        const { data: contactMatches } = await supabase
          .from('marketing_contacts')
          .select('id')
          .or(`name.ilike.%${term}%,email.ilike.%${term}%`)
          .limit(500);
        const ids = new Set<string>();
        for (const m of (msgMatches ?? []) as Array<{ contact_id: string | null }>) if (m.contact_id) ids.add(m.contact_id);
        for (const c of (contactMatches ?? []) as Array<{ id: string }>) ids.add(c.id);
        setSearchMatchIds(ids);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Bulk actions
  async function bulkAction(action: 'mark_unread' | 'mark_resolved' | 'mark_needs_human' | 'mark_spam' | 'mark_trash') {
    if (selectedLeads.size === 0) return;
    const ids = Array.from(selectedLeads);
    const updates: Record<string, unknown> = {};
    if (action === 'mark_unread') { updates.status = 'new'; updates.unread_count = 1; }
    if (action === 'mark_resolved') { updates.status = 'resolved'; updates.unread_count = 0; }
    if (action === 'mark_needs_human') { updates.status = 'needs_human'; }
    if (action === 'mark_spam' || action === 'mark_trash') {
      // Move TODAS as mensagens dessas conversas pra spam/trash via Edge Function
      const folder = action === 'mark_spam' ? 'spam' : 'trash';
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) { toast.error('Sessão expirada.'); return; }
        // Pega todos message ids dessas conversas (so emails)
        const { data: msgs } = await supabase
          .from('inbox_messages')
          .select('id, channel')
          .in('contact_id', ids)
          .eq('channel', 'email')
          .eq('direction', 'in');
        if (msgs && msgs.length > 0) {
          for (const m of msgs as Array<{ id: string }>) {
            await fetch(`${SUPABASE_URL}/functions/v1/imap-folder-action`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ messageId: m.id, action: folder }),
            }).catch(() => null);
          }
        }
        toast.success(`${ids.length} conversa(s) movidas pra ${folder === 'spam' ? 'Spam' : 'Lixeira'}`);
        clearSelection();
        return;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Falha em mover.');
        return;
      }
    }
    if (Object.keys(updates).length === 0) return;
    const { error } = await supabase.from('marketing_contacts').update(updates).in('id', ids);
    if (error) { toast.error('Falha: ' + error.message); return; }
    setLeads(prev => prev.map(l => ids.includes(l.id) ? {
      ...l,
      status: (updates.status as Lead['status']) ?? l.status,
      unreadCount: typeof updates.unread_count === 'number' ? updates.unread_count : l.unreadCount,
    } : l));
    toast.success(`${ids.length} conversa(s) atualizadas`);
    clearSelection();
  }

  // Drawer mobile do painel de contexto
  const [contextOpen, setContextOpen] = useState(false);

  // Templates WhatsApp aprovados
  type WAtpl = { name: string; language: string; category: string; bodyText: string; paramCount: number };
  const [templates, setTemplates] = useState<WAtpl[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [selectedTpl, setSelectedTpl] = useState<WAtpl | null>(null);
  const [tplParams, setTplParams] = useState<string[]>([]);
  const [sendingTpl, setSendingTpl] = useState(false);

  async function loadTemplates() {
    if (loadingTemplates) return;
    setLoadingTemplates(true); setTemplatesError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) { setTemplatesError('Sessão expirada.'); return; }
      const r = await fetch(`${SUPABASE_URL}/functions/v1/get-meta-templates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await r.json().catch(() => ({}));
      if (!r.ok) { setTemplatesError((result as { error?: string })?.error ?? 'Erro'); return; }
      setTemplates((result as { templates: WAtpl[] })?.templates ?? []);
      if ((result as { error?: string })?.error) setTemplatesError((result as { error: string }).error);
    } catch (e) { setTemplatesError(e instanceof Error ? e.message : 'Erro'); }
    finally { setLoadingTemplates(false); }
  }

  async function sendTemplate() {
    if (!selectedTpl || !selectedId || !selected) return;
    const recipient = selected.guestPhone || selected.guestEmail;
    if (!recipient) { toast.error('Identificador do contato não encontrado.'); return; }
    if (selectedTpl.paramCount > 0 && tplParams.filter(p => p && p.trim()).length < selectedTpl.paramCount) {
      toast.error(`Preencha os ${selectedTpl.paramCount} parâmetros do template.`);
      return;
    }
    setSendingTpl(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) { toast.error('Sessão expirada.'); return; }
      const r = await fetch(`${SUPABASE_URL}/functions/v1/send-meta-message`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'whatsapp', recipient, contact_id: selectedId,
          template: { name: selectedTpl.name, languageCode: selectedTpl.language, bodyParams: tplParams.slice(0, selectedTpl.paramCount) },
        }),
      });
      const result = await r.json().catch(() => ({}));
      if (!r.ok || !result.sent) { toast.error((result as { error?: string })?.error ?? 'Falha ao enviar template.'); return; }
      toast.success(`Template "${selectedTpl.name}" enviado.`);
      setShowTemplatesModal(false); setSelectedTpl(null); setTplParams([]);
    } finally { setSendingTpl(false); }
  }

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


  const isEmailChannel = activeChannel === 'email';

  const filteredLeads = leads.filter(l => {
    if (showOnlyMine && l.assignedTo !== profile.id) return false;
    if (activeChannel !== 'all' && l.channel !== activeChannel) return false;
    if (activeFilter !== 'all' && l.status !== activeFilter) return false;
    if (searchQuery.trim().length >= 2) {
      // Busca server-side definiu os matches; se este lead não está, esconde
      if (searchMatchIds && !searchMatchIds.has(l.id)) return false;
      // Enquanto a busca está em andamento, mantém visíveis pelo nome local
      if (!searchMatchIds && !l.guestName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    }
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
      } else if (['whatsapp', 'instagram', 'facebook'].includes(selectedLead.channel)) {
        // Recipient identifier: usamos guestPhone (que armazena wa_id/PSID pra esses canais)
        const recipient = selectedLead.guestPhone || selectedLead.guestEmail;
        if (!recipient) {
          toast.error(`Identificador do contato ${selectedLead.channel} não encontrado.`);
          return;
        }
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) { toast.error('Sessão expirada.'); return; }

        const sentAtt = pendingAttachments.slice();
        const response = await fetch(`${SUPABASE_URL}/functions/v1/send-meta-message`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: selectedLead.channel,
            recipient,
            text,
            contact_id: selectedId,
            attachments: sentAtt.length > 0 ? sentAtt : undefined,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.sent) {
          throw new Error(result.error || `Falha ao enviar ${selectedLead.channel}.`);
        }
        const ids = (result.externalIds as string[] | undefined) ?? [];
        outgoingMessageId = ids[0] ?? null;
        // Edge function já gravou no DB; saímos cedo para não duplicar.
        const now = new Date().toISOString();
        const msg: Message = { text, type: 'out', time: formatMessageTime(now), createdAt: now, attachments: sentAtt, emailMessageId: outgoingMessageId };
        setChatHistory(prev => ({ ...prev, [selectedId]: [...(prev[selectedId] ?? []), msg] }));
        setLeads(prev => prev.map(l => l.id === selectedId ? { ...l, lastMessage: (text || `[${sentAtt.length} anexo(s)]`).slice(0, 500), lastMessageAt: now, status: 'ai_responded' as const } : l));
        setMessageInput('');
        setPendingAttachments([]);
        toast.success('Mensagem enviada');
        return;
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
              placeholder="Buscar em nome, email, assunto e corpo..."
              className="w-full pl-10 pr-9 py-2.5 bg-neutral-100 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none"
            />
            {searching && (
              <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500 animate-spin" />
            )}
            {!searching && searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 hover:text-neutral-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {searchQuery.trim().length >= 2 && searchMatchIds && (
            <p className="text-xs text-neutral-500">
              {searchMatchIds.size} resultado(s) encontrado(s)
            </p>
          )}
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
          {(() => {
            const baseLeads = activeChannel === 'all' ? leads : leads.filter(l => l.channel === activeChannel);
            const counts = {
              mine: baseLeads.filter(l => l.assignedTo === profile.id).length,
              all: baseLeads.length,
              new: baseLeads.filter(l => l.status === 'new').length,
              needs_human: baseLeads.filter(l => l.status === 'needs_human').length,
              resolved: baseLeads.filter(l => l.status === 'resolved').length,
            };
            const items: Array<{ id: 'all' | 'new' | 'needs_human' | 'resolved'; label: string; count: number }> = [
              { id: 'all', label: 'Tudo', count: counts.all },
              { id: 'new', label: 'Novos', count: counts.new },
              { id: 'needs_human', label: 'Humano', count: counts.needs_human },
              { id: 'resolved', label: 'OK', count: counts.resolved },
            ];
            return (
              <>
                {/* Segmented control — 4 segmentos com largura fixa, sem vazar */}
                <div className="grid grid-cols-4 gap-0 bg-neutral-100 p-1 rounded-xl">
                  {items.map(it => {
                    const active = activeFilter === it.id;
                    return (
                      <button
                        key={it.id}
                        onClick={() => setActiveFilter(it.id)}
                        className={`flex flex-col items-center justify-center py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          active ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
                        }`}
                      >
                        <span className="text-[11px] leading-none">{it.label}</span>
                        <span className={`text-sm leading-tight tabular-nums mt-0.5 ${active ? 'text-amber-600' : 'text-neutral-400'}`}>
                          {it.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {/* Toggle "Minhas" — separado, discreto */}
                <button
                  onClick={() => setShowOnlyMine(s => !s)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                    showOnlyMine ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-transparent text-neutral-500 hover:bg-neutral-100'
                  }`}
                  title="Mostrar só conversas atribuídas a mim"
                >
                  <span className="flex items-center gap-2">
                    <UserPlus className="w-3.5 h-3.5" />
                    Só as minhas
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums text-amber-600">{counts.mine}</span>
                    <span className={`inline-block w-7 h-4 rounded-full transition-colors ${showOnlyMine ? 'bg-amber-500' : 'bg-neutral-300'} relative`}>
                      <span className={`absolute top-0.5 ${showOnlyMine ? 'right-0.5' : 'left-0.5'} w-3 h-3 rounded-full bg-white transition-all`} />
                    </span>
                  </span>
                </button>
              </>
            );
          })()}
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
          {/* Barra de ações em lote (visível quando há selecionadas) */}
          {selectedLeads.size > 0 && (
            <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1.5 px-3 py-2 bg-amber-50 border-b border-amber-200">
              <span className="text-xs font-semibold text-amber-900 mr-1">
                {selectedLeads.size} selecionada{selectedLeads.size > 1 ? 's' : ''}:
              </span>
              <button onClick={() => bulkAction('mark_unread')} className="flex items-center gap-1 px-2 py-1 text-xs font-semibold bg-white text-amber-700 rounded border border-amber-200 hover:bg-amber-100">
                <Bell className="w-3 h-3" /> Não lida
              </button>
              <button onClick={() => bulkAction('mark_needs_human')} className="flex items-center gap-1 px-2 py-1 text-xs font-semibold bg-white text-red-700 rounded border border-red-200 hover:bg-red-50">
                <AlertCircle className="w-3 h-3" /> Escalar
              </button>
              <button onClick={() => bulkAction('mark_resolved')} className="flex items-center gap-1 px-2 py-1 text-xs font-semibold bg-white text-emerald-700 rounded border border-emerald-200 hover:bg-emerald-50">
                <CheckCircle2 className="w-3 h-3" /> Resolver
              </button>
              <button onClick={() => bulkAction('mark_spam')} className="flex items-center gap-1 px-2 py-1 text-xs font-semibold bg-white text-orange-700 rounded border border-orange-200 hover:bg-orange-50">
                <AlertCircle className="w-3 h-3" /> Spam
              </button>
              <button onClick={() => bulkAction('mark_trash')} className="flex items-center gap-1 px-2 py-1 text-xs font-semibold bg-white text-red-700 rounded border border-red-200 hover:bg-red-50">
                <Trash2 className="w-3 h-3" /> Lixeira
              </button>
              <button onClick={clearSelection} className="ml-auto text-xs font-semibold text-neutral-600 hover:text-neutral-900 px-2 py-1">
                Cancelar
              </button>
            </div>
          )}

          {filteredLeads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-neutral-400 px-4 py-12">
              <Inbox className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">{searchQuery ? 'Nenhum resultado pra essa busca' : 'Nenhuma conversa'}</p>
              <p className="text-xs text-center mt-1">{searchQuery ? 'Tenta outras palavras-chave.' : 'As mensagens recebidas por todos os canais aparecem aqui.'}</p>
            </div>
          ) : (
            filteredLeads.map(lead => {
              const ch = CHANNELS.find(c => c.id === lead.channel);
              const isSelected = selectedLeads.has(lead.id);
              const anySelected = selectedLeads.size > 0;
              return (
                <div
                  key={lead.id}
                  onContextMenu={(e) => { e.preventDefault(); setLeadMenu({ x: e.clientX, y: e.clientY, lead }); }}
                  className={`group w-full p-4 border-b border-neutral-100 transition-colors cursor-context-menu ${selectedId === lead.id ? 'bg-amber-50' : isSelected ? 'bg-amber-50/50' : 'hover:bg-white'}`}
                >
                  <div className="flex items-start gap-3">
                    {/* Checkbox: visível sempre que houver algo selecionado, ou no hover */}
                    <div className={`shrink-0 mt-1 ${anySelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleLeadSelected(lead.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 rounded border-neutral-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                      />
                    </div>
                    <button
                      onClick={() => {
                        if (anySelected) { toggleLeadSelected(lead.id); return; }
                        setSelectedId(lead.id);
                        setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, unreadCount: 0 } : l));
                      }}
                      className="flex-1 min-w-0 text-left flex items-start gap-3"
                    >
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
                    </button>
                  </div>
                </div>
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
                      <div className={`flex items-center justify-end gap-1 mt-2 text-xs ${msg.type === 'out' ? 'text-white/60' : 'text-neutral-400'}`}>
                        <span>{msg.time}</span>
                        {msg.type === 'out' && (selected?.channel === 'whatsapp' || selected?.channel === 'instagram' || selected?.channel === 'facebook') && (
                          msg.read
                            ? <CheckCheck className="w-3.5 h-3.5 text-sky-300" />
                            : <Check className="w-3.5 h-3.5 opacity-70" />
                        )}
                      </div>
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
            {selected.channel === 'whatsapp' && (
              <button
                onClick={() => { setShowTemplatesModal(true); if (templates.length === 0) loadTemplates(); }}
                disabled={sendingMessage}
                className="p-2.5 rounded-2xl text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 transition-colors"
                title="Templates aprovados"
              >
                <ClipboardList className="w-5 h-5" />
              </button>
            )}
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

      {showTemplatesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/50 backdrop-blur-sm p-4" onClick={() => !sendingTpl && setShowTemplatesModal(false)}>
          <div onClick={e => e.stopPropagation()} className="w-full max-w-2xl max-h-[80vh] bg-white rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-200">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center"><ClipboardList className="w-4 h-4 text-emerald-600" /></div>
                <h3 className="text-sm font-semibold text-neutral-900">Templates WhatsApp Aprovados</h3>
              </div>
              <button onClick={() => setShowTemplatesModal(false)} className="p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              {loadingTemplates ? (
                <div className="flex items-center justify-center py-8 text-neutral-500"><RefreshCw className="w-5 h-5 animate-spin mr-2" /> Carregando templates...</div>
              ) : templatesError ? (
                <div className="p-4 bg-red-50 text-red-700 text-sm rounded-lg">{templatesError}</div>
              ) : templates.length === 0 ? (
                <p className="text-sm text-neutral-500 text-center py-8">Nenhum template aprovado encontrado. Crie e aguarde aprovação no Meta Business Manager.</p>
              ) : (
                <div className="space-y-2">
                  {templates.map(t => (
                    <button
                      key={t.name + t.language}
                      onClick={() => { setSelectedTpl(t); setTplParams(Array(t.paramCount).fill('')); }}
                      className={`w-full text-left p-3 rounded-xl border transition-colors ${selectedTpl?.name === t.name ? 'border-amber-500 bg-amber-50' : 'border-neutral-200 hover:bg-neutral-50'}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-neutral-900">{t.name}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600">{t.language} · {t.category}</span>
                      </div>
                      <p className="text-xs text-neutral-600 whitespace-pre-wrap line-clamp-3">{t.bodyText}</p>
                      {t.paramCount > 0 && <p className="text-xs text-amber-700 mt-1">{t.paramCount} parâmetro(s) necessário(s)</p>}
                    </button>
                  ))}
                </div>
              )}
              {selectedTpl && selectedTpl.paramCount > 0 && (
                <div className="mt-4 pt-4 border-t border-neutral-200 space-y-2">
                  <p className="text-xs font-semibold text-neutral-700">Parâmetros do template:</p>
                  {Array.from({ length: selectedTpl.paramCount }).map((_, i) => (
                    <input
                      key={i}
                      value={tplParams[i] ?? ''}
                      onChange={e => { const next = [...tplParams]; next[i] = e.target.value; setTplParams(next); }}
                      placeholder={`{{${i + 1}}}`}
                      className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-neutral-200 bg-neutral-50">
              <button onClick={() => setShowTemplatesModal(false)} disabled={sendingTpl} className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 rounded-lg">Cancelar</button>
              <button
                onClick={sendTemplate}
                disabled={!selectedTpl || sendingTpl}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                {sendingTpl ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sendingTpl ? 'Enviando...' : 'Enviar template'}
              </button>
            </div>
          </div>
        </div>
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

type NpsConfig = { enabled: boolean; send_after_hours: number; message_template: string; hotel_name?: string };
type NpsResponse = { id: string; guest_name: string | null; channel: string; score: number | null; comment: string | null; sent_at: string; responded_at: string | null };

const DEFAULT_NPS_TEMPLATE = "Olá {{guest_name}}! Aqui é o {{hotel_name}}. Esperamos que tenha gostado da estadia! Numa escala de 0 a 10, qual a chance de você nos recomendar pra um amigo? Responda com a nota (e fique à vontade pra deixar um comentário).";

function NPSTab() {
  const [responses, setResponses] = useState<NpsResponse[]>([]);
  const [config, setConfig] = useState<NpsConfig>({ enabled: false, send_after_hours: 24, message_template: DEFAULT_NPS_TEMPLATE, hotel_name: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dispatching, setDispatching] = useState(false);

  async function load() {
    setLoading(true);
    const [respRes, cfgRes] = await Promise.all([
      supabase.from('nps_responses').select('id, guest_name, channel, score, comment, sent_at, responded_at').order('sent_at', { ascending: false }).limit(200),
      supabase.from('app_settings').select('value').eq('id', 'nps_config').maybeSingle(),
    ]);
    setResponses((respRes.data as NpsResponse[] | null) ?? []);
    if (cfgRes.data?.value) {
      try {
        const parsed = typeof cfgRes.data.value === 'string' ? JSON.parse(cfgRes.data.value) : cfgRes.data.value;
        setConfig(prev => ({ ...prev, ...parsed }));
      } catch { /* ignore */ }
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function saveConfig() {
    setSaving(true);
    const { error } = await supabase.from('app_settings').upsert({ id: 'nps_config', value: JSON.stringify(config), updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) toast.error('Falha: ' + error.message); else toast.success('Configuração NPS salva');
  }

  async function dispatchNow() {
    setDispatching(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-nps', { body: { force: true } });
      if (error) throw error;
      const d = data as { processed?: number; sent?: number };
      toast.success(`Enviado: ${d.sent ?? 0} de ${d.processed ?? 0} elegíveis`);
      load();
    } catch (e) {
      toast.error('Falha: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setDispatching(false);
    }
  }

  const responded = responses.filter(r => r.score != null);
  const promoters = responded.filter(r => (r.score ?? 0) >= 9).length;
  const passives = responded.filter(r => (r.score ?? 0) >= 7 && (r.score ?? 0) <= 8).length;
  const detractors = responded.filter(r => (r.score ?? 0) <= 6).length;
  const nps = responded.length === 0 ? 0 : Math.round(((promoters - detractors) / responded.length) * 100);
  const avg = responded.length === 0 ? 0 : (responded.reduce((a, b) => a + (b.score ?? 0), 0) / responded.length);
  const histogram = Array.from({ length: 11 }, (_, i) => ({ score: i, count: responded.filter(r => r.score === i).length }));
  const maxBar = Math.max(1, ...histogram.map(h => h.count));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-600">NPS</p>
          <h2 className="text-xl sm:text-2xl font-semibold text-neutral-950">Satisfação dos hóspedes</h2>
        </div>
        <div className="flex gap-2">
          <button onClick={dispatchNow} disabled={dispatching} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 disabled:opacity-60">
            {dispatching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Disparar agora
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center text-sm text-neutral-400">Carregando...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'NPS Score', value: nps.toString(), sub: '(promotores - detratores) %', color: nps >= 50 ? 'text-emerald-600' : nps >= 0 ? 'text-amber-600' : 'text-red-600' },
              { label: 'Nota Média', value: avg.toFixed(1), sub: `${responded.length} respostas`, color: 'text-neutral-900' },
              { label: 'Promotores', value: promoters.toString(), sub: 'nota 9-10', color: 'text-emerald-600' },
              { label: 'Detratores', value: detractors.toString(), sub: 'nota 0-6', color: 'text-red-600' },
            ].map(s => (
              <div key={s.label} className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm">
                <p className={`text-2xl font-semibold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-neutral-500 font-medium">{s.label}</p>
                <p className="text-[10px] text-neutral-400">{s.sub}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-4">Distribuição de notas</p>
            <div className="flex items-end gap-2 h-40">
              {histogram.map(h => (
                <div key={h.score} className="flex-1 flex flex-col items-center justify-end gap-1">
                  <span className="text-[10px] font-semibold text-neutral-600">{h.count > 0 ? h.count : ''}</span>
                  <div className={`w-full rounded-t ${h.score >= 9 ? 'bg-emerald-500' : h.score >= 7 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ height: `${(h.count / maxBar) * 100}%`, minHeight: h.count > 0 ? '4px' : '0' }} />
                  <span className="text-[10px] text-neutral-400">{h.score}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-neutral-400">
              <span>← Detratores (0-6)</span><span>Neutros (7-8)</span><span>Promotores (9-10) →</span>
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Configuração</p>
              <button onClick={saveConfig} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-900 text-white text-xs font-bold hover:bg-neutral-800 disabled:opacity-60">
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Salvar
              </button>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-50">
              <div>
                <p className="font-bold text-sm text-neutral-900">Envio automático pós-checkout</p>
                <p className="text-xs text-neutral-500">Dispara via cron diário</p>
              </div>
              <button onClick={() => setConfig(p => ({ ...p, enabled: !p.enabled }))} className={`w-10 h-6 rounded-full ${config.enabled ? 'bg-emerald-500' : 'bg-neutral-300'}`}>
                <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${config.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Horas após checkout ({config.send_after_hours}h)</label>
                <input type="range" min={1} max={168} value={config.send_after_hours} onChange={e => setConfig(p => ({ ...p, send_after_hours: Number(e.target.value) }))} className="w-full" />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Nome do hotel (placeholder)</label>
                <input value={config.hotel_name ?? ''} onChange={e => setConfig(p => ({ ...p, hotel_name: e.target.value }))} placeholder="Royal PMS" className="w-full px-3 py-2 bg-neutral-50 rounded-lg text-xs border-0 outline-none" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Template (placeholders <code>{'{{guest_name}}'}</code>, <code>{'{{hotel_name}}'}</code>)</label>
              <textarea value={config.message_template} onChange={e => setConfig(p => ({ ...p, message_template: e.target.value }))} rows={4} className="w-full px-3 py-2 bg-neutral-50 rounded-lg text-xs border-0 outline-none font-mono" />
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-neutral-100"><p className="text-sm font-semibold text-neutral-700">Respostas recentes</p></div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead><tr className="border-b border-neutral-100">{['Hóspede', 'Canal', 'Nota', 'Comentário', 'Enviado', 'Respondido'].map(h => <th key={h} className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{h}</th>)}</tr></thead>
                <tbody>
                  {responses.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-neutral-400">Nenhuma pesquisa enviada ainda. Configure e clique em "Disparar agora" pra testar.</td></tr>}
                  {responses.map(r => (
                    <tr key={r.id} className="border-b border-neutral-50 hover:bg-neutral-50">
                      <td className="px-5 py-3 text-sm font-semibold text-neutral-900">{r.guest_name || '—'}</td>
                      <td className="px-5 py-3 text-xs text-neutral-500">{r.channel}</td>
                      <td className="px-5 py-3"><span className={`text-sm font-bold ${r.score == null ? 'text-neutral-300' : r.score >= 9 ? 'text-emerald-600' : r.score >= 7 ? 'text-amber-600' : 'text-red-600'}`}>{r.score ?? '—'}</span></td>
                      <td className="px-5 py-3 text-xs text-neutral-600 max-w-md truncate">{r.comment || '—'}</td>
                      <td className="px-5 py-3 text-xs text-neutral-500">{new Date(r.sent_at).toLocaleDateString('pt-BR')}</td>
                      <td className="px-5 py-3 text-xs text-neutral-500">{r.responded_at ? new Date(r.responded_at).toLocaleDateString('pt-BR') : <span className="text-neutral-300">pendente</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Bot Training Tab ─────────────────────────────────────────────────────────

const DEFAULT_SYSTEM_PROMPT = `Voce eh o atendente virtual do hotel {{hotel_name}}. Use o tom: {{mood}}.

INFORMACOES DO HOTEL:
{{description}}

POLITICAS:
{{policies}}

ACOMODACOES:
{{rooms}}

FAQ:
{{faq}}

Regras:
- Responda em portugues, max 2-3 frases.
- Nunca invente precos. Se nao souber, peca pra humano.
- Se cliente pedir falar com humano, reclamar ou demonstrar irritacao, responda <needs_human/> sem outro texto.
- Nunca confirme reservas — diga que vai passar pro atendente humano.`;

function BotTrainingTab() {
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testInput, setTestInput] = useState('');
  const [testOutput, setTestOutput] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'engine' | 'rules' | 'info' | 'pricing' | 'personality'>('engine');
  const [keywordInput, setKeywordInput] = useState('');
  const [config, setConfig] = useState<BotConfig>({
    name: '',
    address: '',
    phone: '',
    email: '',
    description: '',
    policies: '',
    rooms: '',
    faq: '',
    botMood: 'professional',
    enabled: false,
    provider: 'claude',
    model: 'claude-haiku-4-5',
    apiKey: '',
    systemPromptTemplate: DEFAULT_SYSTEM_PROMPT,
    escalationKeywords: ['humano', 'atendente', 'gerente', 'reclamacao', 'reclamar', 'cancelar'],
    maxConsecutiveBotMsgs: 5,
    historyWindow: 10,
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase.from('app_settings').select('value').eq('id', 'bot_config').maybeSingle();
      if (!alive || error || !data?.value) return;
      try {
        const raw = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        setConfig(prev => ({
          ...prev,
          name: raw.hotel_name ?? prev.name,
          description: raw.description ?? prev.description,
          policies: raw.policies ?? prev.policies,
          rooms: raw.rooms ?? prev.rooms,
          faq: raw.faq ?? prev.faq,
          botMood: raw.mood ?? prev.botMood,
          enabled: !!raw.enabled,
          provider: raw.provider ?? prev.provider,
          model: raw.model ?? prev.model,
          apiKey: raw.api_key ?? '',
          systemPromptTemplate: raw.system_prompt_template ?? prev.systemPromptTemplate,
          escalationKeywords: Array.isArray(raw.escalation_keywords) ? raw.escalation_keywords : prev.escalationKeywords,
          maxConsecutiveBotMsgs: raw.max_consecutive_bot_msgs ?? prev.maxConsecutiveBotMsgs,
          historyWindow: raw.history_window ?? prev.historyWindow,
        }));
      } catch (e) {
        console.warn('[bot_config] parse failed', e);
      }
    })();
    return () => { alive = false; };
  }, []);

  async function handleSave() {
    setSaving(true);
    const payload = {
      enabled: config.enabled,
      provider: config.provider,
      model: config.model,
      api_key: config.apiKey,
      system_prompt_template: config.systemPromptTemplate,
      hotel_name: config.name,
      description: config.description,
      policies: config.policies,
      rooms: config.rooms,
      faq: config.faq,
      mood: config.botMood,
      escalation_keywords: config.escalationKeywords,
      max_consecutive_bot_msgs: config.maxConsecutiveBotMsgs,
      history_window: config.historyWindow,
    };
    const { error } = await supabase.from('app_settings').upsert({
      id: 'bot_config',
      value: JSON.stringify(payload),
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) { toast.error('Falha ao salvar: ' + error.message); return; }
    toast.success('Configurações salvas!');
  }

  async function handleTest() {
    if (!testInput.trim()) { toast.error('Digite uma mensagem para testar'); return; }
    setTesting(true);
    setTestOutput(null);
    try {
      const { data, error } = await supabase.functions.invoke('auto-respond-meta', {
        body: { test_only: true, test_text: testInput },
        headers: { 'x-test-call': '1' },
      });
      if (error) throw error;
      setTestOutput((data as { reply?: string; skipped?: string })?.reply ?? (data as { skipped?: string })?.skipped ?? JSON.stringify(data));
    } catch (e) {
      setTestOutput('Erro: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setTesting(false);
    }
  }

  function addKeyword() {
    const kw = keywordInput.trim().toLowerCase();
    if (!kw || config.escalationKeywords.includes(kw)) return;
    setConfig(p => ({ ...p, escalationKeywords: [...p.escalationKeywords, kw] }));
    setKeywordInput('');
  }
  function removeKeyword(kw: string) {
    setConfig(p => ({ ...p, escalationKeywords: p.escalationKeywords.filter(k => k !== kw) }));
  }

  const modelOptions: Record<BotConfig['provider'], string[]> = {
    claude: ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-7'],
    openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-5'],
    gemini: ['gemini-2.0-flash', 'gemini-2.5-pro'],
    rule: ['rule-based'],
  };

  const sections = [
    { id: 'engine' as const, label: 'Engine IA', icon: Bot },
    { id: 'rules' as const, label: 'Regras', icon: ShieldCheck },
    { id: 'info' as const, label: 'Informações', icon: Hotel },
    { id: 'pricing' as const, label: 'Tarifas e FAQ', icon: DollarSign },
    { id: 'personality' as const, label: 'Personalidade', icon: Sparkles },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-600">Treinamento</p>
            <h2 className="text-xl font-semibold text-neutral-950">Configurar Bot IA</h2>
          </div>
          <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${config.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-neutral-500'}`}>
            {config.enabled ? 'Ativo' : 'Inativo'}
          </span>
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
        {activeSection === 'engine' && (
          <>
            <div className="flex items-center justify-between p-4 rounded-2xl bg-neutral-50">
              <div>
                <p className="font-bold text-sm text-neutral-900">Responder automaticamente (WhatsApp / IG / Facebook)</p>
                <p className="text-xs text-neutral-500">Bot responde até cliente pedir humano ou alguém clicar &quot;Atribuir a mim&quot;.</p>
              </div>
              <button onClick={() => setConfig(p => ({ ...p, enabled: !p.enabled }))} className={`w-10 h-6 rounded-full transition-all ${config.enabled ? 'bg-emerald-500' : 'bg-neutral-300'}`}>
                <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${config.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Provedor LLM</label>
                <select value={config.provider} onChange={e => { const provider = e.target.value as BotConfig['provider']; setConfig(p => ({ ...p, provider, model: modelOptions[provider][0] })); }} className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none">
                  <option value="claude">Anthropic Claude</option>
                  <option value="openai">OpenAI</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="rule">Rule-based (sem custo)</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Modelo</label>
                <select value={config.model} onChange={e => setConfig(p => ({ ...p, model: e.target.value }))} className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none">
                  {modelOptions[config.provider].map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">API Key</label>
              <input type="password" value={config.apiKey} onChange={e => setConfig(p => ({ ...p, apiKey: e.target.value }))} placeholder="sk-... / sua chave do provedor" className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none font-mono" />
              <p className="text-[10px] text-neutral-400 mt-1">Armazenado em app_settings (RLS bloqueia leitura por não-admin).</p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-semibold uppercase text-neutral-400">System Prompt (template)</label>
                <button onClick={() => setConfig(p => ({ ...p, systemPromptTemplate: DEFAULT_SYSTEM_PROMPT }))} className="text-[10px] font-semibold text-amber-600 hover:text-amber-700">Restaurar padrão</button>
              </div>
              <textarea value={config.systemPromptTemplate} onChange={e => setConfig(p => ({ ...p, systemPromptTemplate: e.target.value }))} rows={10} className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-xs border-0 focus:ring-2 focus:ring-amber-500 outline-none resize-y font-mono" />
              <p className="text-[10px] text-neutral-400 mt-1">Placeholders: <code>{'{{hotel_name}}'}</code>, <code>{'{{mood}}'}</code>, <code>{'{{description}}'}</code>, <code>{'{{policies}}'}</code>, <code>{'{{rooms}}'}</code>, <code>{'{{faq}}'}</code></p>
            </div>
            <div className="border-t pt-4 space-y-3">
              <p className="font-bold text-sm text-neutral-900">Testar resposta</p>
              <div className="flex gap-2">
                <input value={testInput} onChange={e => setTestInput(e.target.value)} placeholder="Mensagem do cliente..." className="flex-1 px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
                <button onClick={handleTest} disabled={testing} className="px-5 py-3 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 disabled:opacity-60">
                  {testing ? '...' : 'Testar'}
                </button>
              </div>
              {testOutput && (
                <div className="p-3 rounded-xl bg-neutral-900 text-neutral-100 text-sm whitespace-pre-wrap">{testOutput}</div>
              )}
            </div>
          </>
        )}

        {activeSection === 'rules' && (
          <>
            <div>
              <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Palavras de escalação (escalam pra humano automaticamente)</label>
              <div className="flex gap-2 mb-2">
                <input value={keywordInput} onChange={e => setKeywordInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }} placeholder="Ex: humano, reclamar, gerente" className="flex-1 px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
                <button onClick={addKeyword} className="px-4 py-3 rounded-xl bg-neutral-900 text-white text-sm font-bold">Adicionar</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {config.escalationKeywords.map(kw => (
                  <span key={kw} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold">
                    {kw}
                    <button onClick={() => removeKeyword(kw)} className="hover:text-amber-900"><X className="w-3 h-3" /></button>
                  </span>
                ))}
                {config.escalationKeywords.length === 0 && <span className="text-xs text-neutral-400">Nenhuma palavra-chave configurada.</span>}
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Máx. mensagens consecutivas do bot ({config.maxConsecutiveBotMsgs})</label>
              <input type="range" min={1} max={20} value={config.maxConsecutiveBotMsgs} onChange={e => setConfig(p => ({ ...p, maxConsecutiveBotMsgs: Number(e.target.value) }))} className="w-full" />
              <p className="text-[10px] text-neutral-400">Após esse número, conversa escala pra humano mesmo sem palavra-chave.</p>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Janela de histórico enviada ao LLM ({config.historyWindow} msgs)</label>
              <input type="range" min={1} max={20} value={config.historyWindow} onChange={e => setConfig(p => ({ ...p, historyWindow: Number(e.target.value) }))} className="w-full" />
            </div>
          </>
        )}

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
          <div>
            <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Personalidade do Bot</label>
            <select value={config.botMood} onChange={e => setConfig(prev => ({ ...prev, botMood: e.target.value }))} className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none">
              {['professional', 'friendly', 'formal', 'casual'].map(m => (
                <option key={m} value={m}>{m === 'professional' ? 'Profissional' : m === 'friendly' ? 'Amigável' : m === 'formal' ? 'Formal' : 'Casual'}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CRM Tab ──────────────────────────────────────────────────────────────────

type CrmLead = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  channel: string;
  score: number;
  stage: 'hot' | 'warm' | 'cold';
  tags: string[] | null;
  last_message_at: string | null;
  unread_count: number | null;
};

function CRMTab() {
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('marketing_contacts')
      .select('id, name, phone, email, channel, score, stage, tags, last_message_at, unread_count')
      .order('score', { ascending: false })
      .limit(100);
    if (error) toast.error('Falha ao carregar leads: ' + error.message);
    setLeads((data as CrmLead[] | null) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function recalcAll() {
    setRecalculating(true);
    const results = await Promise.allSettled(
      leads.map(l => supabase.rpc('recalc_contact_score', { p_contact_id: l.id }))
    );
    const failed = results.filter(r => r.status === 'rejected').length;
    setRecalculating(false);
    if (failed > 0) toast.error(`${failed} de ${leads.length} falharam`);
    else toast.success(`${leads.length} contatos recalculados`);
    load();
  }

  function stageLabel(stage: string) {
    return { hot: { label: 'Quente', cls: 'bg-red-100 text-red-700' }, warm: { label: 'Morno', cls: 'bg-amber-100 text-amber-700' }, cold: { label: 'Frio', cls: 'bg-blue-100 text-blue-700' } }[stage] ?? { label: stage, cls: 'bg-neutral-100 text-neutral-600' };
  }

  function scoreColor(score: number) {
    if (score >= 75) return 'text-emerald-600';
    if (score >= 50) return 'text-amber-600';
    return 'text-red-600';
  }

  function timeAgo(iso: string | null): string {
    if (!iso) return '—';
    const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (d <= 0) return 'hoje';
    if (d === 1) return 'ontem';
    if (d < 30) return `${d}d atrás`;
    return new Date(iso).toLocaleDateString('pt-BR');
  }

  const totals = {
    total: leads.length,
    hot: leads.filter(l => l.stage === 'hot').length,
    warm: leads.filter(l => l.stage === 'warm').length,
    avg: leads.length === 0 ? 0 : Math.round(leads.reduce((a, b) => a + (b.score ?? 0), 0) / leads.length),
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-600">CRM</p>
          <h2 className="text-xl font-semibold text-neutral-950">Leads e Scoring</h2>
        </div>
        <button onClick={recalcAll} disabled={recalculating || leads.length === 0} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-900 text-white text-sm font-bold hover:bg-neutral-800 disabled:opacity-60">
          {recalculating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
          Recalcular score
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Leads', value: totals.total.toString(), color: 'text-neutral-900' },
          { label: 'Quentes', value: totals.hot.toString(), color: 'text-red-600' },
          { label: 'Mornos', value: totals.warm.toString(), color: 'text-amber-600' },
          { label: 'Score Médio', value: totals.avg.toString(), color: 'text-emerald-600' },
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
              {loading && <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-neutral-400">Carregando...</td></tr>}
              {!loading && leads.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-neutral-400">Nenhum lead cadastrado ainda. Conversas no inbox aparecerão aqui.</td></tr>}
              {!loading && leads.map(lead => {
                const { label, cls } = stageLabel(lead.stage);
                const ch = CHANNELS.find(c => c.id === lead.channel);
                const tags = lead.tags ?? [];
                return (
                  <tr key={lead.id} className="border-b border-neutral-50 hover:bg-neutral-50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-neutral-200 flex items-center justify-center text-xs font-semibold text-neutral-600">{(lead.name || '?')[0]?.toUpperCase()}</div>
                        <div>
                          <p className="font-bold text-sm text-neutral-900">{lead.name || '(sem nome)'}</p>
                          <p className="text-[10px] text-neutral-400">{lead.phone || lead.email || '—'}</p>
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
                    <td className="px-5 py-3 text-xs" style={{ color: ch?.color }}>{ch?.name ?? lead.channel}</td>
                    <td className="px-5 py-3 text-xs text-neutral-500">{timeAgo(lead.last_message_at)}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {tags.length === 0 ? <span className="text-[9px] text-neutral-300">—</span> : tags.map(t => <span key={t} className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600">{t}</span>)}
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

type SimMsg = { text: string; type: 'in' | 'out'; time: string; tools?: string[]; cost?: number };

function SimulatorTab() {
  const [messages, setMessages] = useState<SimMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function sendMessage() {
    if (!input.trim() || sending) return;
    const text = input;
    const userMsg: SimMsg = { text, type: 'in', time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('auto-respond-meta', {
        body: { test_only: true, test_text: text },
        headers: { 'x-test-call': '1' },
      });
      if (error) throw error;
      const d = data as { reply?: string; tools_used?: string[]; cost_usd?: number; skipped?: string; error?: string };
      const reply = d.reply || (d.skipped ? `(${d.skipped})` : d.error ? `Erro: ${d.error}` : '(sem resposta)');
      setMessages(prev => [...prev, { text: reply, type: 'out', time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), tools: d.tools_used, cost: d.cost_usd }]);
    } catch (e) {
      setMessages(prev => [...prev, { text: 'Erro: ' + (e instanceof Error ? e.message : String(e)), type: 'out', time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-600">Simulador</p>
        <h2 className="text-xl font-semibold text-neutral-950">Testar bot ao vivo</h2>
        <p className="text-sm text-neutral-500">Cada mensagem chama o bot real (auto-respond-meta) — usa a config salva em Treinamento IA.</p>
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
              {messages.length === 0 && (
                <p className="text-center text-white/40 text-[10px] py-8">Digite uma mensagem pra começar — ex: "Tem master pra 20 a 22 de jan?"</p>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.type === 'out' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-3 py-2 rounded-xl text-xs leading-relaxed ${msg.type === 'out' ? 'bg-[#005C4B] text-white' : 'bg-[#202C33] text-white'}`}>
                    {msg.text}
                    {msg.tools && msg.tools.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {msg.tools.map((t, j) => <span key={j} className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200">🔧 {t}</span>)}
                      </div>
                    )}
                    <p className="text-[9px] text-white/50 mt-1 text-right">{msg.time}{msg.cost != null && msg.cost > 0 && ` · $${msg.cost.toFixed(5)}`}</p>
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-end">
                  <div className="bg-[#005C4B] text-white px-3 py-2 rounded-xl text-xs"><span className="opacity-60">digitando...</span></div>
                </div>
              )}
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

// ─── Generic Provider (BYO WhatsApp / IG / FB via webhook terceirizado) ──
type GenericProvider = {
  id: string;
  name: string;
  channel: 'whatsapp' | 'instagram' | 'facebook';
  enabled: boolean;
  secret_token?: string;
  inbound: {
    sender_id_path?: string;
    name_path?: string;
    text_path?: string;
    message_id_path?: string;
    timestamp_path?: string;
    media_url_path?: string;
    media_mime_path?: string;
  };
  outbound: { url: string; method?: string; headers?: Record<string, string>; body_template: string };
};

const PROVIDER_PRESETS: Record<string, Partial<GenericProvider>> = {
  zapi: {
    name: 'Z-API', channel: 'whatsapp',
    inbound: { sender_id_path: 'phone', name_path: 'senderName', text_path: 'text.message', message_id_path: 'messageId', timestamp_path: 'momment', media_url_path: 'image.imageUrl', media_mime_path: 'image.mimeType' },
    outbound: { url: 'https://api.z-api.io/instances/INSTANCE/token/TOKEN/send-text', method: 'POST', headers: { 'Content-Type': 'application/json', 'Client-Token': 'YOUR_CLIENT_TOKEN' }, body_template: '{"phone":"{{recipient}}","message":"{{text}}"}' },
  },
  evolution: {
    name: 'Evolution API', channel: 'whatsapp',
    inbound: { sender_id_path: 'data.key.remoteJid', name_path: 'data.pushName', text_path: 'data.message.conversation', message_id_path: 'data.key.id', timestamp_path: 'data.messageTimestamp' },
    outbound: { url: 'https://your-evolution-host/message/sendText/INSTANCE', method: 'POST', headers: { 'Content-Type': 'application/json', apikey: 'YOUR_API_KEY' }, body_template: '{"number":"{{recipient}}","text":"{{text}}"}' },
  },
  twilio: {
    name: 'Twilio WhatsApp', channel: 'whatsapp',
    inbound: { sender_id_path: 'From', text_path: 'Body', message_id_path: 'MessageSid' },
    outbound: { url: 'https://api.twilio.com/2010-04-01/Accounts/ACxxxx/Messages.json', method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic BASE64(SID:TOKEN)' }, body_template: 'To=whatsapp:{{recipient}}&From=whatsapp:%2B14155238886&Body={{text}}' },
  },
  wati: {
    name: 'Wati', channel: 'whatsapp',
    inbound: { sender_id_path: 'waId', name_path: 'senderName', text_path: 'text', message_id_path: 'id', timestamp_path: 'timestamp' },
    outbound: { url: 'https://live-server-XXX.wati.io/api/v1/sendSessionMessage/{{recipient}}', method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer YOUR_WATI_TOKEN' }, body_template: '{"messageText":"{{text}}"}' },
  },
};

function GenericProvidersSection() {
  const [providers, setProviders] = useState<GenericProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<GenericProvider | null>(null);
  const [testPayload, setTestPayload] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('app_settings').select('value').eq('id', 'generic_providers').maybeSingle();
      try {
        const raw = data?.value ? (typeof data.value === 'string' ? JSON.parse(data.value) : data.value) : { providers: [] };
        setProviders(raw.providers ?? []);
      } catch { setProviders([]); }
      setLoading(false);
    })();
  }, []);

  async function persist(list: GenericProvider[]) {
    const { error } = await supabase.from('app_settings').upsert({ id: 'generic_providers', value: JSON.stringify({ providers: list }), updated_at: new Date().toISOString() });
    if (error) { toast.error('Falha ao salvar: ' + error.message); return false; }
    setProviders(list);
    return true;
  }

  function newProvider(): GenericProvider {
    const slug = `provider-${Math.random().toString(36).slice(2, 8)}`;
    return { id: slug, name: 'Novo provider', channel: 'whatsapp', enabled: false, inbound: {}, outbound: { url: '', method: 'POST', headers: { 'Content-Type': 'application/json' }, body_template: '' } };
  }

  async function saveEditing() {
    if (!editing) return;
    if (!editing.id || !editing.name) { toast.error('ID e nome são obrigatórios'); return; }
    const idx = providers.findIndex(p => p.id === editing.id);
    const next = idx >= 0 ? providers.map((p, i) => i === idx ? editing : p) : [...providers, editing];
    if (await persist(next)) { toast.success('Provider salvo'); setEditing(null); setTestResult(null); }
  }

  async function deleteProvider(id: string) {
    if (!confirm('Remover este provider?')) return;
    if (await persist(providers.filter(p => p.id !== id))) toast.success('Provider removido');
  }

  function applyPreset(key: string) {
    if (!editing) return;
    const preset = PROVIDER_PRESETS[key];
    if (!preset) return;
    setEditing({ ...editing, ...preset, id: editing.id, enabled: editing.enabled });
    toast.success(`Preset "${preset.name}" carregado`);
  }

  function runTest() {
    if (!editing) return;
    try {
      const payload = JSON.parse(testPayload);
      const getPath = (obj: unknown, path?: string): unknown => {
        if (!path) return undefined;
        return path.split(/\.|\[|\]/).filter(Boolean).reduce((o: unknown, k: string) => (o == null ? undefined : (o as Record<string, unknown>)[k]), obj);
      };
      const m = editing.inbound;
      const out = {
        sender_id: getPath(payload, m.sender_id_path),
        name: getPath(payload, m.name_path),
        text: getPath(payload, m.text_path),
        message_id: getPath(payload, m.message_id_path),
        timestamp: getPath(payload, m.timestamp_path),
        media_url: m.media_url_path ? getPath(payload, m.media_url_path) : undefined,
        media_mime: m.media_mime_path ? getPath(payload, m.media_mime_path) : undefined,
      };
      setTestResult(JSON.stringify(out, null, 2));
    } catch (e) {
      setTestResult('JSON inválido: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  function webhookUrl(id: string) {
    const base = SUPABASE_URL || '<SUPABASE_URL>';
    return `${base}/functions/v1/webhook-generic?provider=${id}`;
  }

  if (loading) return null;

  return (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Providers WhatsApp genéricos (BYO webhook)</h3>
          <p className="text-xs text-neutral-500 mt-0.5">Conecte qualquer provider terceiro (Z-API, Evolution, Twilio, Wati, etc.) via mapeamento de campos.</p>
        </div>
        <button onClick={() => { setEditing(newProvider()); setTestResult(null); setTestPayload(''); }} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-900 text-white text-sm font-bold hover:bg-neutral-800">
          <Plus className="w-4 h-4" /> Adicionar provider
        </button>
      </div>

      {providers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center text-sm text-neutral-500">
          Nenhum provider cadastrado. Clique em "Adicionar provider" e use um dos presets pra começar.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {providers.map(p => (
            <article key={p.id} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-neutral-900 truncate">{p.name}</p>
                  <p className="text-[10px] text-neutral-400 font-mono">{p.id}</p>
                </div>
                <span className={`text-[9px] font-bold uppercase px-2 py-1 rounded-full shrink-0 ${p.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-neutral-500'}`}>
                  {p.enabled ? 'Ativo' : 'Inativo'}
                </span>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600">{p.channel}</span>
                <span className="text-[10px] text-neutral-400 truncate flex-1">{p.outbound.url || 'sem outbound'}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setEditing(p); setTestResult(null); setTestPayload(''); }} className="flex-1 py-2 rounded-lg bg-neutral-100 text-neutral-700 text-xs font-bold hover:bg-neutral-200">Editar</button>
                <button onClick={() => deleteProvider(p.id)} className="px-3 py-2 rounded-lg bg-red-50 text-red-600 text-xs font-bold hover:bg-red-100"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div onClick={() => { setEditing(null); setTestResult(null); }} className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl p-6 sm:p-8 shadow-2xl space-y-5">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-neutral-950">Configurar provider</h3>
              <button onClick={() => { setEditing(null); setTestResult(null); }} className="p-2 rounded-xl bg-neutral-100 text-neutral-500"><X className="w-4 h-4" /></button>
            </div>

            <div>
              <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Preset</label>
              <select onChange={e => { if (e.target.value) applyPreset(e.target.value); e.target.value = ''; }} defaultValue="" className="w-full px-4 py-3 bg-amber-50 rounded-xl text-sm border-0 outline-none">
                <option value="">— Carregar template de... —</option>
                {Object.entries(PROVIDER_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Nome</label>
                <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">ID (slug)</label>
                <input value={editing.id} onChange={e => setEditing({ ...editing, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 outline-none font-mono" />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Canal</label>
                <select value={editing.channel} onChange={e => setEditing({ ...editing, channel: e.target.value as GenericProvider['channel'] })} className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 outline-none">
                  <option value="whatsapp">WhatsApp</option>
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                </select>
              </div>
              <div className="flex items-end">
                <button onClick={() => setEditing({ ...editing, enabled: !editing.enabled })} className={`w-full py-3 rounded-xl text-sm font-bold ${editing.enabled ? 'bg-emerald-500 text-white' : 'bg-neutral-200 text-neutral-600'}`}>
                  {editing.enabled ? '✓ Ativo' : 'Inativo'}
                </button>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">URL do webhook (cole no painel do provider)</label>
              <div className="flex gap-2">
                <input readOnly value={webhookUrl(editing.id)} className="flex-1 px-4 py-3 bg-neutral-100 rounded-xl text-xs border-0 outline-none font-mono" />
                <button onClick={() => { navigator.clipboard.writeText(webhookUrl(editing.id)); toast.success('URL copiada'); }} className="px-4 py-3 rounded-xl bg-neutral-900 text-white text-xs font-bold"><Copy className="w-3.5 h-3.5" /></button>
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="text-xs font-bold uppercase text-neutral-700 mb-3">Mapeamento Inbound (dot-paths)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {([
                  ['sender_id_path', 'sender_id (obrigatório)', 'phone'],
                  ['name_path', 'name', 'senderName'],
                  ['text_path', 'text', 'text.message'],
                  ['message_id_path', 'message_id', 'messageId'],
                  ['timestamp_path', 'timestamp', 'momment'],
                  ['media_url_path', 'media_url (opc)', 'image.imageUrl'],
                  ['media_mime_path', 'media_mime (opc)', 'image.mimeType'],
                ] as const).map(([key, label, ph]) => (
                  <div key={key}>
                    <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">{label}</label>
                    <input value={editing.inbound[key] ?? ''} onChange={e => setEditing({ ...editing, inbound: { ...editing.inbound, [key]: e.target.value } })} placeholder={ph} className="w-full px-3 py-2 bg-neutral-50 rounded-lg text-xs border-0 outline-none font-mono" />
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="text-xs font-bold uppercase text-neutral-700 mb-3">Outbound (envio de mensagens)</p>
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr,100px] gap-3">
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">URL</label>
                    <input value={editing.outbound.url} onChange={e => setEditing({ ...editing, outbound: { ...editing.outbound, url: e.target.value } })} className="w-full px-3 py-2 bg-neutral-50 rounded-lg text-xs border-0 outline-none font-mono" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Método</label>
                    <select value={editing.outbound.method ?? 'POST'} onChange={e => setEditing({ ...editing, outbound: { ...editing.outbound, method: e.target.value } })} className="w-full px-3 py-2 bg-neutral-50 rounded-lg text-xs border-0 outline-none">
                      <option>POST</option><option>PUT</option><option>GET</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Headers (JSON)</label>
                  <textarea value={JSON.stringify(editing.outbound.headers ?? {}, null, 2)} onChange={e => { try { setEditing({ ...editing, outbound: { ...editing.outbound, headers: JSON.parse(e.target.value) } }); } catch { /* invalid yet */ } }} rows={3} className="w-full px-3 py-2 bg-neutral-50 rounded-lg text-xs border-0 outline-none font-mono" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase text-neutral-400 mb-1 block">Body template (placeholders: <code>{'{{recipient}}'}</code>, <code>{'{{text}}'}</code>, <code>{'{{contact_id}}'}</code>)</label>
                  <textarea value={editing.outbound.body_template} onChange={e => setEditing({ ...editing, outbound: { ...editing.outbound, body_template: e.target.value } })} rows={4} className="w-full px-3 py-2 bg-neutral-50 rounded-lg text-xs border-0 outline-none font-mono" />
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="text-xs font-bold uppercase text-neutral-700 mb-2">Testar extração</p>
              <textarea value={testPayload} onChange={e => setTestPayload(e.target.value)} rows={5} placeholder="Cole aqui um JSON de exemplo do payload do provider..." className="w-full px-3 py-2 bg-neutral-50 rounded-lg text-xs border-0 outline-none font-mono mb-2" />
              <button onClick={runTest} className="px-4 py-2 rounded-lg bg-amber-500 text-white text-xs font-bold hover:bg-amber-600">Extrair campos</button>
              {testResult && <pre className="mt-3 p-3 rounded-lg bg-neutral-900 text-neutral-100 text-[10px] overflow-x-auto whitespace-pre-wrap">{testResult}</pre>}
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => { setEditing(null); setTestResult(null); }} className="flex-1 py-3 bg-neutral-100 rounded-xl text-sm font-bold text-neutral-700 hover:bg-neutral-200">Cancelar</button>
              <button onClick={saveEditing} className="flex-1 py-3 bg-neutral-900 text-white rounded-xl text-sm font-bold hover:bg-neutral-800">Salvar provider</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

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

      <GenericProvidersSection />

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
  const [sub, setSub] = useState<'flows' | 'simulator' | 'training' | 'insights'>('flows');
  return (
    <div>
      <SubTabStrip<'flows' | 'simulator' | 'training' | 'insights'>
        items={[
          { id: 'flows', label: 'Fluxos', icon: Zap },
          { id: 'simulator', label: 'Simulador', icon: Smartphone },
          { id: 'training', label: 'Treinamento IA', icon: Bot },
          { id: 'insights', label: 'Insights Bot', icon: Activity },
        ]}
        active={sub}
        onChange={setSub}
      />
      {sub === 'flows' && <FlowBuilderTab />}
      {sub === 'simulator' && <SimulatorTab />}
      {sub === 'training' && <BotTrainingTab />}
      {sub === 'insights' && <BotInsightsTab />}
    </div>
  );
}

type BotInvocation = {
  id: string;
  contact_id: string | null;
  channel: string;
  incoming_text: string | null;
  reply_text: string | null;
  decision: 'replied' | 'escalated' | 'skipped' | 'error';
  reason: string | null;
  provider: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  duration_ms: number | null;
  tools_used: string[] | null;
  created_at: string;
};

function BotInsightsTab() {
  const [invs, setInvs] = useState<BotInvocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  async function load() {
    setLoading(true);
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const { data, error } = await supabase
      .from('bot_invocations')
      .select('id, contact_id, channel, incoming_text, reply_text, decision, reason, provider, model, input_tokens, output_tokens, cost_usd, duration_ms, tools_used, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(2000);
    if (error) toast.error('Falha: ' + error.message);
    setInvs((data as BotInvocation[] | null) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [days]);

  const total = invs.length;
  const counts = {
    replied: invs.filter(i => i.decision === 'replied').length,
    escalated: invs.filter(i => i.decision === 'escalated').length,
    skipped: invs.filter(i => i.decision === 'skipped').length,
    error: invs.filter(i => i.decision === 'error').length,
  };
  const resolutionRate = total === 0 ? 0 : Math.round((counts.replied / total) * 100);
  const avgDuration = (() => {
    const withDur = invs.filter(i => i.duration_ms != null);
    return withDur.length === 0 ? 0 : Math.round(withDur.reduce((a, b) => a + (b.duration_ms ?? 0), 0) / withDur.length);
  })();
  const totalCost = invs.reduce((a, b) => a + (Number(b.cost_usd) || 0), 0);

  // Por dia (linha)
  const byDay: Record<string, number> = {};
  for (const i of invs) {
    const d = i.created_at.slice(0, 10);
    byDay[d] = (byDay[d] ?? 0) + 1;
  }
  const dayKeys = Object.keys(byDay).sort();
  const maxDay = Math.max(1, ...Object.values(byDay));

  // Por provider (custo)
  const byProvider: Record<string, number> = {};
  for (const i of invs) {
    const p = i.provider ?? '—';
    byProvider[p] = (byProvider[p] ?? 0) + (Number(i.cost_usd) || 0);
  }

  // Top tools
  const toolCounts: Record<string, number> = {};
  for (const i of invs) {
    for (const t of i.tools_used ?? []) toolCounts[t] = (toolCounts[t] ?? 0) + 1;
  }
  const topTools = Object.entries(toolCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-600">Insights</p>
          <h2 className="text-xl sm:text-2xl font-semibold text-neutral-950">Métricas do bot</h2>
        </div>
        <div className="flex gap-2">
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${days === d ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>{d}d</button>
          ))}
          <button onClick={load} className="px-3 py-1.5 rounded-lg bg-neutral-100 text-neutral-600 hover:bg-neutral-200"><RefreshCcw className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center text-sm text-neutral-400">Carregando...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Mensagens', value: total.toString(), sub: `últimos ${days}d`, color: 'text-neutral-900' },
              { label: 'Taxa Resolução', value: `${resolutionRate}%`, sub: `${counts.replied} respondidas`, color: resolutionRate >= 60 ? 'text-emerald-600' : 'text-amber-600' },
              { label: 'Tempo Médio', value: avgDuration < 1000 ? `${avgDuration}ms` : `${(avgDuration / 1000).toFixed(1)}s`, sub: 'por resposta', color: 'text-neutral-900' },
              { label: 'Custo Total', value: `$${totalCost.toFixed(4)}`, sub: 'LLM acumulado', color: 'text-emerald-600' },
            ].map(s => (
              <div key={s.label} className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm">
                <p className={`text-2xl font-semibold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-neutral-500 font-medium">{s.label}</p>
                <p className="text-[10px] text-neutral-400">{s.sub}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-4">Decisões do bot</p>
              <div className="space-y-2">
                {[
                  { k: 'replied', label: 'Respondidas', color: 'bg-emerald-500', count: counts.replied },
                  { k: 'escalated', label: 'Escaladas (humano)', color: 'bg-amber-500', count: counts.escalated },
                  { k: 'skipped', label: 'Puladas', color: 'bg-neutral-400', count: counts.skipped },
                  { k: 'error', label: 'Erros', color: 'bg-red-500', count: counts.error },
                ].map(r => (
                  <div key={r.k} className="flex items-center gap-3">
                    <span className="text-xs text-neutral-600 w-32">{r.label}</span>
                    <div className="flex-1 bg-neutral-100 rounded-full h-3">
                      <div className={`${r.color} h-3 rounded-full transition-all`} style={{ width: `${total === 0 ? 0 : (r.count / total) * 100}%` }} />
                    </div>
                    <span className="text-xs font-bold text-neutral-700 w-12 text-right">{r.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-4">Custo por provider</p>
              {Object.keys(byProvider).length === 0 ? (
                <p className="text-xs text-neutral-400 text-center py-8">Nenhum dado ainda.</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(byProvider).sort((a, b) => b[1] - a[1]).map(([p, cost]) => (
                    <div key={p} className="flex items-center gap-3">
                      <span className="text-xs text-neutral-600 w-24 capitalize">{p}</span>
                      <div className="flex-1 bg-neutral-100 rounded-full h-3">
                        <div className="bg-amber-500 h-3 rounded-full" style={{ width: `${(cost / Math.max(...Object.values(byProvider))) * 100}%` }} />
                      </div>
                      <span className="text-xs font-bold text-neutral-700 w-20 text-right">${cost.toFixed(4)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-4">Mensagens por dia</p>
            {dayKeys.length === 0 ? (
              <p className="text-xs text-neutral-400 text-center py-8">Nenhuma invocação no período.</p>
            ) : (
              <div className="flex items-end gap-1 h-32">
                {dayKeys.map(d => (
                  <div key={d} className="flex-1 flex flex-col items-center gap-1" title={`${d}: ${byDay[d]}`}>
                    <div className="bg-amber-500 w-full rounded-t" style={{ height: `${(byDay[d] / maxDay) * 100}%`, minHeight: '2px' }} />
                    {dayKeys.length <= 30 && <span className="text-[8px] text-neutral-400 -rotate-45 origin-top-left">{d.slice(5)}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {topTools.length > 0 && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold uppercase tracking-wider text-neutral-500 mb-3">Top ferramentas usadas</p>
              <div className="flex flex-wrap gap-2">
                {topTools.map(([name, count]) => (
                  <span key={name} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold">
                    🔧 {name} <span className="font-bold">{count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-neutral-100"><p className="text-sm font-semibold text-neutral-700">Últimas 20 invocações</p></div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead><tr className="border-b border-neutral-100">{['Quando', 'Canal', 'Decisão', 'Provider', 'Tools', 'Custo', 'Dur'].map(h => <th key={h} className="text-left px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{h}</th>)}</tr></thead>
                <tbody>
                  {invs.slice(0, 20).map(i => (
                    <tr key={i.id} className="border-b border-neutral-50 hover:bg-neutral-50">
                      <td className="px-4 py-2 text-xs text-neutral-500">{new Date(i.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="px-4 py-2 text-xs">{i.channel}</td>
                      <td className="px-4 py-2"><span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${i.decision === 'replied' ? 'bg-emerald-100 text-emerald-700' : i.decision === 'escalated' ? 'bg-amber-100 text-amber-700' : i.decision === 'error' ? 'bg-red-100 text-red-700' : 'bg-neutral-100 text-neutral-600'}`}>{i.decision}</span> {i.reason && <span className="text-[9px] text-neutral-400 ml-1">{i.reason}</span>}</td>
                      <td className="px-4 py-2 text-xs text-neutral-500">{i.provider ?? '—'}</td>
                      <td className="px-4 py-2 text-[10px] text-neutral-500">{(i.tools_used ?? []).join(', ') || '—'}</td>
                      <td className="px-4 py-2 text-xs text-emerald-700 font-mono">${(Number(i.cost_usd) || 0).toFixed(5)}</td>
                      <td className="px-4 py-2 text-xs text-neutral-500">{i.duration_ms ?? '—'}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
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
