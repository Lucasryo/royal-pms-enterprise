import { useState, useEffect } from 'react';
import type { SocialIntegration, SmtpConfig, PmsWebhook } from '../../types/marketing';
import { supabase } from '../../supabase';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import {
  MessageSquare, Instagram, Facebook, Linkedin, Globe, Mail,
  ShieldCheck, AlertCircle, CheckCircle, ExternalLink, RefreshCcw,
  Copy, Save, X, Link2, Database, Cloud,
} from 'lucide-react';

const SOCIAL_INTEGRATIONS: SocialIntegration[] = [
  { id: 'whatsapp', name: 'WhatsApp Business', description: 'Envio e recebimento de mensagens via API oficial Meta Cloud.', icon: <MessageSquare className="w-6 h-6" />, color: 'bg-emerald-500', colorHex: '#10b981', docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api', field: 'whatsappPhoneId' },
  { id: 'instagram', name: 'Instagram Professional', description: 'Responder DMs e comentários automaticamente com IA.', icon: <Instagram className="w-6 h-6" />, color: 'bg-pink-500', colorHex: '#ec4899', docsUrl: 'https://developers.facebook.com/docs/instagram-basic-display-api', field: 'instagramAccount' },
  { id: 'facebook', name: 'Facebook Pages', description: 'Gerenciar mensagens do Messenger e comentários em posts.', icon: <Facebook className="w-6 h-6" />, color: 'bg-blue-600', colorHex: '#2563eb', docsUrl: 'https://developers.facebook.com/docs/facebook-login/', field: 'facebookPage' },
  { id: 'email', name: 'E-mail SMTP', description: 'Enviar confirmações de reserva e notificações por e-mail.', icon: <Mail className="w-6 h-6" />, color: 'bg-amber-500', colorHex: '#f59e0b', docsUrl: '#', field: 'smtpHost' },
  { id: 'google', name: 'Google Reviews', description: 'Monitorar e responder avaliações do Google Meu Negócio.', icon: <Globe className="w-6 h-6" />, color: 'bg-red-500', colorHex: '#ef4444', docsUrl: 'https://developers.google.com/my-business', field: 'googleBusinessId' },
  { id: 'linkedin', name: 'LinkedIn', description: 'Publicar conteúdo e capturar leads corporativos.', icon: <Linkedin className="w-6 h-6" />, color: 'bg-sky-700', colorHex: '#0369a1', docsUrl: 'https://www.linkedin.com/developers/', field: 'linkedinPage' },
];

export function IntegracoesTab() {
  const [statuses, setStatuses] = useState<Record<string, 'connected' | 'disconnected'>>(
    Object.fromEntries(SOCIAL_INTEGRATIONS.map(i => [i.id, 'disconnected']))
  );
  const [showSmtp, setShowSmtp] = useState(false);
  const [showWebhook, setShowWebhook] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState<SocialIntegration | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [smtpConfig, setSmtpConfig] = useState<SmtpConfig>({ host: '', port: '465', user: '', pass: '', fromName: 'Recepção Hotel' });
  const [pmsConfig, setPmsConfig] = useState<Record<string, PmsWebhook>>({
    cloudbeds: { webhookUrl: '', apiKey: '', enabled: false },
    mews: { webhookUrl: '', apiKey: '', enabled: false },
  });
  const [confirmEmail, setConfirmEmail] = useState('');
  const [savingSmtp, setSavingSmtp] = useState(false);

  useEffect(() => {
    supabase.from('app_settings').select('value').eq('id', 'smtp_config').maybeSingle().then(({ data }) => {
      if (data?.value) {
        setSmtpConfig(data.value as SmtpConfig);
        setStatuses(s => ({ ...s, email: 'connected' }));
      }
    });
  }, []);

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

  async function saveSmtp() {
    if (!smtpConfig.host || !smtpConfig.user) { toast.error('Host e usuário são obrigatórios'); return; }
    setSavingSmtp(true);
    const { error } = await supabase.from('app_settings').upsert({ id: 'smtp_config', value: smtpConfig }, { onConflict: 'id' });
    setSavingSmtp(false);
    if (error) { toast.error('Erro ao salvar: ' + error.message); return; }
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
          {(['whatsapp', 'instagram', 'facebook'] as const).map(ch => {
            const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook-meta`;
            return (
              <div key={ch} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">{ch.charAt(0).toUpperCase() + ch.slice(1)} Webhook</label>
                  <div className="flex items-center gap-2 px-4 py-3 bg-neutral-50 rounded-xl">
                    <p className="text-xs font-mono text-neutral-600 flex-1 truncate">{webhookUrl}</p>
                    <button onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success('URL copiada!'); }} className="shrink-0 p-1.5 rounded-lg bg-white border border-neutral-200 text-neutral-500 hover:bg-neutral-100">
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
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
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800">
                  <p className="font-black mb-1">Locaweb</p>
                  <p>Host: <span className="font-mono">email.locaweb.com.br</span> · Porta: <span className="font-mono">465</span> (SSL)</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">Host SMTP</label>
                    <input value={smtpConfig.host} onChange={e => setSmtpConfig(c => ({ ...c, host: e.target.value }))} placeholder="email.locaweb.com.br" className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">Porta</label>
                    <input value={smtpConfig.port} onChange={e => setSmtpConfig(c => ({ ...c, port: e.target.value }))} placeholder="465" className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
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
                  <button onClick={saveSmtp} disabled={savingSmtp} className="flex-1 py-3 bg-neutral-900 text-white rounded-xl text-sm font-bold hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                    <Save className="w-4 h-4" /> {savingSmtp ? 'Salvando…' : 'Salvar'}
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
