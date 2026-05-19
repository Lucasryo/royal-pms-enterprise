import React, { useState } from 'react';
import { supabase } from '../supabase';
import { Loader2, ArrowLeft, ArrowRight, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'motion/react';

type LoginProps = {
  /** Mantido para compatibilidade: o componente agora e sempre auto-contido. */
  embedded?: boolean;
};

export default function Login(_props: LoginProps = {}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'forgot-password'>('login');

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

  const handlePasswordResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const redirectTo = `${window.location.origin}${window.location.pathname}`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      toast.success('Se este e-mail existir, enviaremos o link de recuperacao.');
      setMode('login');
    } catch (err: any) {
      console.error('Password reset request error:', err);
      toast.error(err?.message || 'Nao foi possivel enviar o e-mail de recuperacao.');
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
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-10 -z-10 rounded-[3rem] blur-3xl opacity-70"
        style={{ background: 'radial-gradient(closest-side, rgba(218,170,90,0.45), transparent 70%)' }}
      />

      <div className="relative overflow-hidden rounded-3xl border border-ink/10 bg-paper p-8 shadow-[0_50px_120px_-30px_rgba(20,15,10,0.55),_0_8px_24px_-12px_rgba(20,15,10,0.25)] sm:p-10">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
          <div className="absolute left-1/2 top-[26%] h-[180px] w-[180px] rounded-full bg-gold/45 blur-2xl aura-flicker" />
          <div
            className="absolute left-1/2 top-[26%] h-[300px] w-[300px] rounded-full blur-3xl aura-pulse"
            style={{ background: 'radial-gradient(closest-side, rgba(218,170,90,0.55), transparent 70%)' }}
          />
          <div
            className="absolute left-1/2 top-[26%] h-[460px] w-[460px] rounded-full blur-3xl aura-flare"
            style={{
              background:
                'conic-gradient(from 90deg, rgba(218,170,90,0.35), rgba(245,217,160,0.05), rgba(218,170,90,0.35), rgba(245,217,160,0.05), rgba(218,170,90,0.35))',
            }}
          />
          {[
            { l: '38%', d: '0s' },
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

        <div className="relative text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-ink/20 bg-paper">
            <span className="font-display text-lg italic leading-none text-ink">R</span>
          </div>
          <p className="mt-5 text-[11px] uppercase tracking-[0.28em] text-stone-500">
            Royal PMS · CRM da hotelaria
          </p>
          <h2 className="mt-3 font-display text-3xl font-light leading-[1.05] tracking-[-0.02em] text-ink sm:text-[2.5rem]">
            Onde a operacao
            <br />
            <span className="aura-text italic text-ink">vira ritual.</span>
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-ink/65">
            Entre para continuar de onde a equipe parou.
          </p>
        </div>

        {mode === 'login' ? (
          <form className="relative mt-8 space-y-5" onSubmit={handleEmailLogin}>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500">
                E-mail
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-ink outline-none transition placeholder:text-stone-400 focus:border-gold focus:ring-4 focus:ring-gold/20"
                placeholder="voce@seuhotel.com"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <label className="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500">
                  Senha
                </label>
                <button
                  type="button"
                  className="text-[11px] text-stone-500 hover:text-ink"
                  onClick={() => setMode('forgot-password')}
                >
                  Esqueci minha senha
                </button>
              </div>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-ink outline-none transition placeholder:text-stone-400 focus:border-gold focus:ring-4 focus:ring-gold/20"
                placeholder="********"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-full bg-ink px-5 py-3.5 text-sm font-medium text-paper transition hover:bg-ink/90 disabled:opacity-60"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-gold/30 to-transparent transition-transform duration-700 group-hover:translate-x-full"
              />
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <span>Entrar na operacao</span>
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gold text-ink transition-transform group-hover:translate-x-0.5">
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </>
              )}
            </button>

            <p className="text-center text-[11px] text-stone-500">
              Sessao criptografada · LGPD · infra em nuvem brasileira
            </p>
          </form>
        ) : (
          <form className="relative mt-8 space-y-5" onSubmit={handlePasswordResetRequest}>
            <button
              type="button"
              onClick={() => setMode('login')}
              className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-stone-500 transition hover:text-ink"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar ao login
            </button>

            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500">
                E-mail cadastrado
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-ink outline-none transition placeholder:text-stone-400 focus:border-gold focus:ring-4 focus:ring-gold/20"
                placeholder="voce@seuhotel.com"
              />
              <p className="mt-3 text-sm leading-relaxed text-ink/60">
                Enviaremos um link seguro para voce cadastrar uma nova senha.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-full bg-ink px-5 py-3.5 text-sm font-medium text-paper transition hover:bg-ink/90 disabled:opacity-60"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-gold/30 to-transparent transition-transform duration-700 group-hover:translate-x-full"
              />
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <span>Enviar link de recuperacao</span>
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gold text-ink transition-transform group-hover:translate-x-0.5">
                    <Mail className="h-3.5 w-3.5" />
                  </span>
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </motion.div>
  );
}
