import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { uploadImage } from '../lib/imgbb';
import { AlertTriangle, Camera, CheckCircle2, Loader2, LogOut, Mic, Send, X as CloseIcon } from 'lucide-react';

type Priority = 'low' | 'medium' | 'high' | 'urgent';
type AuthState = 'loading' | 'login' | 'form';

const ALLOWED_ROLES = ['housekeeping', 'maintenance', 'manager', 'admin', 'reception'];

const PRIORITY_OPTIONS: Array<{ value: Priority; label: string; color: string; description: string }> = [
  { value: 'low',    label: 'Baixa',   color: 'bg-emerald-50 text-emerald-700 border-emerald-200', description: 'Pode aguardar alguns dias' },
  { value: 'medium', label: 'Media',   color: 'bg-amber-50 text-amber-700 border-amber-200',       description: 'Resolver no proximo turno' },
  { value: 'high',   label: 'Alta',    color: 'bg-orange-50 text-orange-700 border-orange-200',    description: 'Resolver hoje' },
  { value: 'urgent', label: 'Urgente', color: 'bg-red-50 text-red-700 border-red-200',             description: 'Atender agora — risco ao hospede' },
];

export default function PublicMaintenanceReport({ roomNumber }: { roomNumber: string }) {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [staffName, setStaffName] = useState('');

  // login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // form fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check existing session on mount
  useEffect(() => {
    void checkSession();
  }, []);

  // Speech recognition setup
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'pt-BR';
    rec.onresult = (event: any) => {
      setDescription((prev) => (prev ? prev + ' ' : '') + event.results[0][0].transcript);
    };
    rec.onend = () => setRecording(false);
    rec.onerror = () => setRecording(false);
    recognitionRef.current = rec;
  }, []);

  async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setAuthState('login'); return; }
    await resolveProfile(session.user.id);
  }

  async function resolveProfile(userId: string) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('name, role')
      .eq('id', userId)
      .single();

    if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
      await supabase.auth.signOut();
      setLoginError('Seu usuario nao tem permissao para abrir chamados via QR.');
      setAuthState('login');
      return;
    }
    setStaffName(profile.name ?? '');
    setAuthState('form');
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: loginEmail.trim(),
      password: loginPassword,
    });
    setLoginLoading(false);
    if (authError || !data.session) {
      setLoginError('Email ou senha incorretos.');
      return;
    }
    await resolveProfile(data.session.user.id);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setStaffName('');
    setLoginEmail('');
    setLoginPassword('');
    setLoginError(null);
    setAuthState('login');
  }

  function toggleRecording() {
    const rec = recognitionRef.current;
    if (!rec) { setError('Navegador sem suporte a voz. Digite manualmente.'); return; }
    if (recording) { rec.stop(); setRecording(false); }
    else { try { rec.start(); setRecording(true); } catch { setRecording(false); } }
  }

  async function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setPhoto({ file, preview });
    setUploadingPhoto(true);
    setError(null);
    try {
      const uploaded = await uploadImage(file);
      setPhotoUrl(uploaded.url);
    } catch (err: any) {
      setError(err.message ?? 'Falha ao enviar foto');
      setPhoto(null);
    } finally {
      setUploadingPhoto(false);
    }
  }

  function clearPhoto() {
    setPhoto(null);
    setPhotoUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) { setError('Descreva brevemente o problema no titulo.'); return; }
    setSubmitting(true);
    setError(null);

    const payload: Record<string, any> = {
      room_number: roomNumber,
      title: title.trim(),
      description: description.trim() || null,
      priority,
      status: 'open',
      status_reason: `Reportado por: ${staffName}`,
    };
    if (photoUrl) payload.resolution_notes = `Foto: ${photoUrl}`;

    const { error: insertError } = await supabase.from('maintenance_tickets').insert([payload]);
    if (insertError) {
      setError('Nao foi possivel enviar: ' + insertError.message);
      setSubmitting(false);
      return;
    }
    setSubmitted(true);
    setSubmitting(false);
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (authState === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-amber-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  // ── Login gate ───────────────────────────────────────────────────────────
  if (authState === 'login') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-amber-50 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-sm bg-white rounded-3xl border border-neutral-200 shadow-xl overflow-hidden">
          <div className="bg-gradient-to-br from-neutral-900 to-neutral-700 text-white p-5 sm:p-7">
            <p className="text-[10px] font-black uppercase tracking-[0.32em] text-amber-300">Royal PMS</p>
            <h1 className="mt-2 text-xl sm:text-2xl font-black">Acesso colaborador</h1>
            <p className="mt-1 text-xs text-neutral-400">Use seu login do PMS para reportar chamados</p>
          </div>
          <form onSubmit={handleLogin} className="p-5 sm:p-7 space-y-4">
            <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-600">UH</span>
              <span className="text-sm font-black text-amber-800">{roomNumber}</span>
            </div>

            <Field label="Email">
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                autoComplete="username"
                className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </Field>

            <Field label="Senha">
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </Field>

            {loginError && (
              <div className="flex gap-2 items-start p-3 bg-red-50 border border-red-200 rounded-xl">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{loginError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full bg-neutral-900 text-white font-bold py-3.5 rounded-xl hover:bg-neutral-800 transition disabled:bg-neutral-300 flex items-center justify-center gap-2"
            >
              {loginLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Entrar
            </button>

            <p className="text-center text-[10px] text-neutral-400">
              Acesso exclusivo para colaboradores do hotel
            </p>
          </form>
        </div>
      </div>
    );
  }

  // ── Submitted ────────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center bg-white rounded-3xl border border-emerald-200 p-6 sm:p-10 shadow-xl">
          <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-5">
            <CheckCircle2 className="w-9 h-9 text-emerald-600" />
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-neutral-900">Chamado registrado!</h1>
          <p className="mt-3 text-sm text-neutral-600">
            A equipe de manutencao foi notificada e ira atender a UH <span className="font-bold">{roomNumber}</span> em breve.
          </p>
          <button
            onClick={() => {
              setSubmitted(false);
              setTitle('');
              setDescription('');
              setPriority('medium');
              clearPhoto();
            }}
            className="mt-7 w-full bg-neutral-900 text-white font-bold py-3 rounded-xl hover:bg-neutral-800 transition"
          >
            Abrir outro chamado
          </button>
          <button onClick={handleLogout} className="mt-3 w-full text-xs text-neutral-400 hover:text-neutral-600 transition py-2">
            Sair da conta
          </button>
        </div>
      </div>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-amber-50 flex items-start sm:items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-lg bg-white rounded-3xl border border-neutral-200 shadow-xl overflow-hidden">
        <div className="bg-gradient-to-br from-neutral-900 to-neutral-700 text-white p-5 sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] sm:text-xs font-black uppercase tracking-[0.32em] text-amber-300">Royal PMS</p>
              <h1 className="mt-2 text-xl sm:text-3xl font-black">Reportar problema</h1>
            </div>
            <button
              onClick={handleLogout}
              title="Sair"
              className="mt-1 p-2 rounded-xl bg-white/10 hover:bg-white/20 transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-3 py-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-200">UH</span>
              <span className="text-base sm:text-lg font-black">{roomNumber}</span>
            </div>
            <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-3 py-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Colaborador</span>
              <span className="text-sm font-bold">{staffName}</span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-7 space-y-4">
          <Field label="Qual o problema?" required>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Vazamento na pia do banheiro"
              required
              className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </Field>

          <Field label="Detalhes (opcional)">
            <div className="relative">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descreva o problema com mais detalhes..."
                rows={3}
                className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
              />
              {recognitionRef.current && (
                <button
                  type="button"
                  onClick={toggleRecording}
                  className={`absolute bottom-2 right-2 p-2 rounded-lg transition ${recording ? 'bg-red-500 text-white animate-pulse' : 'bg-neutral-200 text-neutral-600 hover:bg-neutral-300'}`}
                  title={recording ? 'Parar gravacao' : 'Falar em vez de digitar'}
                >
                  <Mic className="w-4 h-4" />
                </button>
              )}
            </div>
            {recording && <p className="mt-1 text-xs text-red-600 font-bold">Falando... Toque o microfone novamente para parar.</p>}
          </Field>

          <Field label="Foto (opcional)">
            {photo ? (
              <div className="relative">
                <img src={photo.preview} alt="" className="w-full h-48 object-cover rounded-xl border border-neutral-200" />
                {uploadingPhoto && (
                  <div className="absolute inset-0 bg-black/60 rounded-xl flex items-center justify-center">
                    <div className="text-white text-center">
                      <Loader2 className="w-7 h-7 animate-spin mx-auto" />
                      <p className="mt-2 text-xs font-bold uppercase tracking-widest">Enviando...</p>
                    </div>
                  </div>
                )}
                {!uploadingPhoto && (
                  <button type="button" onClick={clearPhoto} className="absolute top-2 right-2 bg-white text-neutral-700 rounded-full p-1.5 shadow-md hover:bg-neutral-100">
                    <CloseIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-6 border-2 border-dashed border-neutral-300 rounded-xl flex flex-col items-center gap-2 text-neutral-500 hover:border-amber-400 hover:text-amber-600 transition"
              >
                <Camera className="w-7 h-7" />
                <span className="text-sm font-bold">Tirar foto / escolher</span>
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} className="hidden" />
          </Field>

          <Field label="Quao urgente e?" required>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PRIORITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPriority(opt.value)}
                  className={`px-3 py-2.5 rounded-xl border-2 text-xs font-black transition ${priority === opt.value ? `${opt.color} ring-2 ring-offset-1 ring-current` : 'bg-white border-neutral-200 text-neutral-500 hover:border-neutral-300'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-neutral-500">
              {PRIORITY_OPTIONS.find((o) => o.value === priority)?.description}
            </p>
          </Field>

          {error && (
            <div className="flex gap-2 items-start p-3 bg-red-50 border border-red-200 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || uploadingPhoto || !title.trim()}
            className="w-full bg-neutral-900 text-white font-bold py-3.5 rounded-xl hover:bg-neutral-800 transition disabled:bg-neutral-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />Enviando...</> : <><Send className="w-4 h-4" />Enviar Chamado</>}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-black uppercase tracking-widest text-neutral-500 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}
