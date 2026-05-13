import { useState, useEffect } from 'react';
import QRCodeLib from 'qrcode';
import { supabase } from '../../supabase';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import {
  QrCode, Clock, Banknote, TrendingUp, Key, CheckCircle, RefreshCw,
  X, Copy, ShieldCheck, Save, Zap,
} from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

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

export function FinanceiroTab() {
  const [filter, setFilter] = useState<'all' | 'pending' | 'paid'>('all');
  const [showForm, setShowForm] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  // tokenSaved: token exists on server; tokenEditing: user wants to change it
  const [tokenSaved, setTokenSaved] = useState(false);
  const [tokenEditing, setTokenEditing] = useState(false);
  const [savingToken, setSavingToken] = useState(false);
  const [testingToken, setTestingToken] = useState(false);
  const [reservations, setReservations] = useState<ReservationPix[]>([]);
  const [loadingRes, setLoadingRes] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null); // reservation id or 'manual'
  const [isGenerating, setIsGenerating] = useState(false);
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
      if (setting?.value) {
        setTokenSaved(true);
        setTokenEditing(false);
      }
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
      setTokenEditing(false);
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
    setIsGenerating(true);
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
      setIsGenerating(false);
    }
  }

  async function generateManualCharge() {
    if (!form.guestName || !form.amount) { toast.error('Nome e valor são obrigatórios'); return; }
    if (!tokenSaved) { toast.error('Configure o Access Token primeiro'); setShowConfig(true); return; }
    setGenerating('manual');
    setIsGenerating(true);
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
      setIsGenerating(false);
    }
  }

  const pixPending   = reservations.filter(r => !r.pix_payment_id);
  const pixGenerated = reservations.filter(r => !!r.pix_payment_id);
  const filtered = filter === 'all' ? reservations : filter === 'pending' ? pixPending : pixGenerated;
  const totalGenerated = pixGenerated.reduce((a, r) => a + (r.total_amount ?? 0), 0);
  const totalPending   = pixPending.reduce((a, r) => a + (r.total_amount ?? 0), 0);

  // Whether to show the token input field (new or editing)
  const showTokenInput = !tokenSaved || tokenEditing;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-600">Financeiro</p>
          <h2 className="text-xl font-black text-neutral-950">PIX Automático — Mercado Pago</h2>
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
        <div className="rounded-3xl border-2 border-amber-300 bg-amber-50 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <p className="font-black text-amber-900 text-sm">Configure seu Access Token do Mercado Pago</p>
            <p className="text-xs text-amber-700 mt-1 leading-relaxed">
              Cole o token uma única vez — o sistema salva no servidor e gera QR Codes automaticamente com o valor exato de cada reserva.
            </p>
          </div>
          <button onClick={() => setShowConfig(true)} className="shrink-0 px-5 py-3 bg-amber-500 text-white text-sm font-black rounded-xl hover:bg-amber-400 transition-colors flex items-center gap-2">
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
            <p className={`text-xl font-black ${stat.color}`}>{stat.value}</p>
            <p className="text-[10px] text-neutral-500 font-medium">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Lista reservas */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex gap-2 overflow-x-auto scrollbar-none">
            {(['all', 'pending', 'paid'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} className={`shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors ${filter === f ? 'bg-neutral-900 text-white' : 'bg-white border border-neutral-200 text-neutral-500'}`}>
                {f === 'all' ? 'Todas' : f === 'pending' ? `Sem PIX (${pixPending.length})` : `PIX Gerado (${pixGenerated.length})`}
              </button>
            ))}
          </div>
          <button onClick={() => window.location.reload()} className="p-2 rounded-xl text-neutral-400 hover:bg-neutral-100">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="rounded-3xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
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
            const isRowGenerating = generating === res.id;
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
                  <p className="font-black text-sm text-neutral-900">R$ {Number(res.total_amount ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
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
                      className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-[10px] font-black rounded-lg border border-emerald-200 hover:bg-emerald-100"
                    >
                      Ver QR
                    </button>
                  )}
                  <button
                    onClick={() => generatePixForReservation(res)}
                    disabled={isGenerating || isRowGenerating}
                    className={`px-3 py-1.5 bg-neutral-900 text-white text-[10px] font-black rounded-lg hover:bg-neutral-800 flex items-center gap-1 transition-all ${(isGenerating || isRowGenerating) ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {isRowGenerating ? <RefreshCw className="w-3 h-3 animate-spin" /> : <QrCode className="w-3 h-3" />}
                    {isRowGenerating ? 'Gerando...' : hasPix ? 'Regen.' : 'Gerar PIX'}
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
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-lg font-black text-neutral-950">🟡 Mercado Pago</h3>
                  <p className="text-xs text-neutral-500 mt-0.5">Access Token salvo no servidor — nunca exposto</p>
                </div>
                <button onClick={() => { setShowConfig(false); setTokenEditing(false); setTokenInput(''); }} className="p-2 rounded-xl bg-neutral-100 text-neutral-500"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">Access Token de Produção</label>

                  {/* Masked display when token is saved and not editing */}
                  {tokenSaved && !tokenEditing ? (
                    <div className="flex items-center gap-2 w-full px-4 py-3 bg-neutral-50 rounded-xl border border-neutral-200">
                      <span className="flex-1 font-mono text-sm text-neutral-500 tracking-widest select-none">••••••••••••••••••••••••</span>
                      <button
                        type="button"
                        onClick={() => { setTokenEditing(true); setTokenInput(''); }}
                        className="shrink-0 text-[10px] font-black uppercase text-amber-600 hover:text-amber-500 transition-colors"
                      >
                        Alterar
                      </button>
                    </div>
                  ) : (
                    <input
                      type="password"
                      value={tokenInput}
                      onChange={e => setTokenInput(e.target.value)}
                      placeholder="APP_USR-000000000000000-000000-..."
                      className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm font-mono border-0 focus:ring-2 focus:ring-amber-500 outline-none"
                      autoFocus
                    />
                  )}

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
                    disabled={testingToken || (tokenSaved && !tokenEditing)}
                    className="flex-1 py-3 bg-neutral-100 rounded-xl text-sm font-bold text-neutral-700 hover:bg-neutral-200 disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {testingToken ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    Testar
                  </button>
                  <button
                    onClick={handleSaveToken}
                    disabled={savingToken || (tokenSaved && !tokenEditing)}
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
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl text-center">
              <button onClick={() => setViewPix(null)} className="absolute top-4 right-4 p-2 rounded-xl bg-neutral-100 text-neutral-500"><X className="w-4 h-4" /></button>
              <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-1">QR Code PIX</p>
              <p className="font-black text-neutral-900 mb-4 truncate">{viewPix.guestName}</p>
              {viewPix.qrCodeUrl ? (
                <img src={viewPix.qrCodeUrl} alt="QR Code PIX" className="mx-auto w-56 h-56 rounded-2xl border border-neutral-200 mb-4" />
              ) : (
                <div className="mx-auto w-56 h-56 rounded-2xl bg-neutral-50 border border-neutral-200 flex items-center justify-center mb-4">
                  <QrCode className="w-20 h-20 text-neutral-300" />
                </div>
              )}
              <div className="text-left mb-4">
                <p className="text-[10px] font-black uppercase text-neutral-400 mb-1.5">Pix Copia e Cola</p>
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
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { if (!isGenerating) setShowForm(false); }} className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-black text-neutral-950">Cobrança PIX avulsa</h3>
                <button onClick={() => setShowForm(false)} className="p-2 rounded-xl bg-neutral-100 text-neutral-500"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">Nome do hóspede</label>
                  <input value={form.guestName} onChange={e => setForm(f => ({ ...f, guestName: e.target.value }))} placeholder="Ana Beatriz Costa" className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">E-mail (opcional)</label>
                    <input type="email" value={form.guestEmail} onChange={e => setForm(f => ({ ...f, guestEmail: e.target.value }))} placeholder="hospede@email.com" className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">CPF <span className="text-red-500">*</span></label>
                    <input value={form.guestCpf} onChange={e => setForm(f => ({ ...f, guestCpf: e.target.value }))} placeholder="000.000.000-00" className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">Valor (R$)</label>
                    <input type="number" step="0.01" min="1" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="750,00" className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-neutral-400 mb-1 block">Descrição</label>
                    <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Hospedagem" className="w-full px-4 py-3 bg-neutral-50 rounded-xl text-sm border-0 focus:ring-2 focus:ring-amber-500 outline-none" />
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowForm(false)} className="flex-1 py-3 bg-neutral-100 rounded-xl text-sm font-bold text-neutral-600">Cancelar</button>
                  <button
                    onClick={generateManualCharge}
                    disabled={generating === 'manual' || isGenerating}
                    className={`flex-1 py-3 bg-neutral-900 text-white rounded-xl text-sm font-bold hover:bg-neutral-800 flex items-center justify-center gap-2 ${(generating === 'manual' || isGenerating) ? 'opacity-50 cursor-not-allowed' : ''}`}
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
