import React, { useState } from 'react';
import { supabase } from '../supabase';
import { Loader2, ArrowRight, ArrowLeft, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';

type LoginProps = {
  /** Mantido para compatibilidade — o componente agora é sempre auto-contido. */
  embedded?: boolean;
};

type Mode = 'login' | 'reset-request' | 'reset-sent';

export default function Login(_props: LoginProps = {}) {
  const [mode, setMode]         = useState<Mode>('login');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success('Bem-vindo de volta.');
    } catch (err: any) {
      console.error('Login error:', err);
      toast.error(err?.message || 'E-mail ou senha incorretos.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error('Informe o e-mail para receber o link de redefinição.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        // a página recebe o token no hash e App.tsx detecta PASSWORD_RECOVERY
        redirectTo: `${window.location.origin}/#reset`,
      });
      if (error) throw error;
      setMode('reset-sent');
    } catch (err: any) {
      console.error('reset request error:', err);
      // por segurança, não confirmamos se o e-mail existe — mostramos confirmação genérica
      setMode('reset-sent');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full"
    >
      {/* halo externo dourado — sai por trás do cartão */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-10 -z-10 rounded-[3rem] blur-3xl opacity-70"
        style={{ background: 'radial-gradient(closest-side, rgba(218,170,90,0.45), transparent 70%)' }}
      />

      <div className="relative overflow-hidden rounded-3xl border border-ink/10 bg-paper p-8 shadow-[0_50px_120px_-30px_rgba(20,15,10,0.55),_0_8px_24px_-12px_rgba(20,15,10,0.25)] sm:p-10">
        {/* === AURA SUPER SAIYAN (light) === */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
          {/* núcleo quente */}
          <div
            className="absolute left-1/2 top-[26%] h-[180px] w-[180px] rounded-full bg-gold/45 blur-2xl aura-flicker"
          />
          {/* onda média */}
          <div
            className="absolute left-1/2 top-[26%] h-[300px] w-[300px] rounded-full blur-3xl aura-pulse"
            style={{ background: 'radial-gradient(closest-side, rgba(218,170,90,0.55), transparent 70%)' }}
          />
          {/* onda externa rotativa (energia girando) */}
          <div
            className="absolute left-1/2 top-[26%] h-[460px] w-[460px] rounded-full blur-3xl aura-flare"
            style={{
              background:
                'conic-gradient(from 90deg, rgba(218,170,90,0.35), rgba(245,217,160,0.05), rgba(218,170,90,0.35), rgba(245,217,160,0.05), rgba(218,170,90,0.35))',
            }}
          />
          {/* faíscas subindo */}
          {[
            { l: '38%', d: '0s'   },
            { l: '50%', d: '0.6s' },
            { l: '62%', d: '1.2s' },
            { l: '46%', d: '1.8s' },
            { l: '56%', d: '2.4s' },
          ].map((s, i) => (
            <span
              key={i}
              className="absolute h-1.5 w-1.5 rounded-full bg-gold blur-[1px] aura-spark"
              style={{ left: s.l, top: '34%', animationDelay: s.d }}
            />
          ))}
        </div>

        {/* === HEADER === */}
        <div className="relative text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-ink/20 bg-paper">
            <span className="font-display text-lg italic leading-none text-ink">R</span>
          </div>
          <p className="mt-5 text-[11px] uppercase tracking-[0.28em] text-stone-500">
            · Royal PMS · CRM da hotelaria ·
          </p>

          <AnimatePresence mode="wait">
            {mode === 'login' && (
              <motion.div key="h-login" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
                <h2 className="mt-3 font-display text-3xl font-light leading-[1.05] tracking-[-0.02em] text-ink sm:text-[2.5rem]">
                  Onde a operação
                  <br />
                  <span className="aura-text italic text-ink">vira ritual.</span>
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-ink/65">
                  Entre para continuar de onde a equipe parou.
                </p>
              </motion.div>
            )}
            {mode === 'reset-request' && (
              <motion.div key="h-reset" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
                <h2 className="mt-3 font-display text-3xl font-light leading-[1.05] tracking-[-0.02em] text-ink sm:text-[2.5rem]">
                  Esqueceu a senha?
                  <br />
                  <span className="aura-text italic text-ink">Nós lembramos por você.</span>
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-ink/65">
                  Informe o e-mail da sua conta. Mandamos um link seguro para você criar uma nova senha.
                </p>
              </motion.div>
            )}
            {mode === 'reset-sent' && (
              <motion.div key="h-sent" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
                <h2 className="mt-3 font-display text-3xl font-light leading-[1.05] tracking-[-0.02em] text-ink sm:text-[2.5rem]">
                  Link a caminho.
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-ink/65">
                  Se houver uma conta com <span className="font-medium text-ink">{email}</span>, você receberá em instantes
                  um e-mail com o link para redefinir a senha. Verifique também sua caixa de spam.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* === FORMS === */}
        <AnimatePresence mode="wait">
          {mode === 'login' && (
            <motion.form
              key="f-login"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="relative mt-8 space-y-5"
              onSubmit={handleEmailLogin}
            >
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500">E-mail</label>
                <input
                  type="email" required autoComplete="email"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-ink outline-none transition placeholder:text-stone-400 focus:border-gold focus:ring-4 focus:ring-gold/20"
                  placeholder="voce@seuhotel.com"
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <label className="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500">Senha</label>
                  <button
                    type="button"
                    className="text-[11px] text-stone-500 underline-offset-2 hover:text-ink hover:underline"
                    onClick={() => setMode('reset-request')}
                  >
                    Esqueci minha senha
                  </button>
                </div>
                <input
                  type="password" required autoComplete="current-password"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-ink outline-none transition placeholder:text-stone-400 focus:border-gold focus:ring-4 focus:ring-gold/20"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-full bg-ink px-5 py-3.5 text-sm font-medium text-paper transition hover:bg-ink/90 disabled:opacity-60"
              >
                <span aria-hidden className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-gold/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                  <>
                    <span>Entrar na operação</span>
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gold text-ink transition-transform group-hover:translate-x-0.5">
                      <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </>
                )}
              </button>

              <p className="text-center text-[11px] text-stone-500">
                Sessão criptografada · LGPD · infra em nuvem brasileira
              </p>
            </motion.form>
          )}

          {mode === 'reset-request' && (
            <motion.form
              key="f-reset"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="relative mt-8 space-y-5"
              onSubmit={handleResetRequest}
            >
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500">E-mail da conta</label>
                <input
                  type="email" required autoComplete="email" autoFocus
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-ink outline-none transition placeholder:text-stone-400 focus:border-gold focus:ring-4 focus:ring-gold/20"
                  placeholder="voce@seuhotel.com"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !email}
                className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-full bg-ink px-5 py-3.5 text-sm font-medium text-paper transition hover:bg-ink/90 disabled:opacity-60"
              >
                <span aria-hidden className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-gold/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                  <>
                    <Mail className="h-4 w-4" />
                    <span>Enviar link de recuperação</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setMode('login')}
                className="mx-auto flex items-center gap-1.5 text-[12px] text-stone-500 hover:text-ink"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Voltar para o login
              </button>
            </motion.form>
          )}

          {mode === 'reset-sent' && (
            <motion.div
              key="f-sent"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="relative mt-8 space-y-5"
            >
              <div className="flex items-center justify-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/50 px-4 py-4 text-emerald-800">
                <Mail className="h-5 w-5" />
                <span className="text-sm font-medium">Verifique seu e-mail.</span>
              </div>

              <button
                type="button"
                onClick={() => { setMode('login'); setPassword(''); }}
                className="group flex w-full items-center justify-center gap-3 rounded-full border border-ink/15 px-5 py-3 text-sm font-medium text-ink transition hover:bg-ink/5"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar para o login
              </button>

              <p className="text-center text-[11px] text-stone-500">
                Não recebeu em alguns minutos?{' '}
                <button
                  type="button"
                  onClick={() => setMode('reset-request')}
                  className="text-ink underline-offset-2 hover:underline"
                >
                  reenviar
                </button>
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
