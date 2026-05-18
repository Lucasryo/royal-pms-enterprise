import React, { useState } from 'react';
import { supabase } from '../supabase';
import { Loader2, ArrowRight, Check, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'motion/react';

/**
 * Tela mostrada quando o usuário chega de volta pelo link de
 * recuperação enviado por e-mail (evento PASSWORD_RECOVERY).
 *
 * O Supabase já consumiu o token na URL e estabeleceu uma sessão
 * temporária — basta chamar updateUser({ password }) para concluir.
 */
export default function ResetPassword({ onDone }: { onDone?: () => void }) {
  const [password, setPassword]       = useState('');
  const [confirm,  setConfirm]        = useState('');
  const [loading,  setLoading]        = useState(false);
  const [done,     setDone]           = useState(false);

  const score = passwordScore(password);
  const valid = password.length >= 8 && password === confirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) {
      toast.error('A senha precisa ter ao menos 8 caracteres e coincidir com a confirmação.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      toast.success('Senha redefinida. Entre novamente para continuar.');
      // desloga a sessão temporária de recuperação para forçar novo login
      await supabase.auth.signOut();
      // limpa o hash da URL (#access_token=...)
      try { window.history.replaceState({}, '', window.location.pathname); } catch {}
      setTimeout(() => onDone?.(), 1800);
    } catch (err: any) {
      console.error('reset password error:', err);
      toast.error(err?.message || 'Não foi possível redefinir a senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-paper font-sans text-ink antialiased">
      <div className="mx-auto flex min-h-screen max-w-md items-center justify-center px-5 py-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-10 -z-10 rounded-[3rem] blur-3xl opacity-70"
            style={{ background: 'radial-gradient(closest-side, rgba(218,170,90,0.4), transparent 70%)' }}
          />

          <div className="relative overflow-hidden rounded-3xl border border-ink/10 bg-paper p-8 shadow-[0_50px_120px_-30px_rgba(20,15,10,0.55),_0_8px_24px_-12px_rgba(20,15,10,0.25)] sm:p-10">
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-ink/20 bg-paper">
                <ShieldCheck className="h-5 w-5 text-gold" />
              </div>
              <p className="mt-5 text-[11px] uppercase tracking-[0.28em] text-stone-500">
                · Royal PMS · redefinição segura ·
              </p>
              <h2 className="mt-3 font-display text-3xl font-light leading-[1.05] tracking-[-0.02em] text-ink sm:text-[2.25rem]">
                {done ? 'Senha atualizada.' : 'Defina sua nova senha.'}
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-ink/65">
                {done
                  ? 'Sua sessão antiga foi encerrada. Redirecionando para o login…'
                  : 'Use ao menos 8 caracteres. Combine letras e números para mais segurança.'}
              </p>
            </div>

            {!done && (
              <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500">
                    Nova senha
                  </label>
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-ink outline-none transition placeholder:text-stone-400 focus:border-gold focus:ring-4 focus:ring-gold/20"
                    placeholder="••••••••"
                  />
                  {/* medidor de força */}
                  <div className="mt-2 flex items-center gap-1">
                    {[1, 2, 3, 4].map(i => (
                      <span
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          score >= i
                            ? score >= 3 ? 'bg-emerald-600' : score >= 2 ? 'bg-gold' : 'bg-amber-500'
                            : 'bg-ink/10'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] text-stone-500">
                    {password.length === 0 ? 'Aguardando…'
                      : score >= 3 ? 'Forte'
                      : score >= 2 ? 'Razoável'
                      : 'Fraca — adicione números ou símbolos.'}
                  </p>
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500">
                    Confirmar senha
                  </label>
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    minLength={8}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className={`w-full rounded-xl border bg-white px-4 py-3 text-ink outline-none transition placeholder:text-stone-400 focus:ring-4 ${
                      confirm.length === 0
                        ? 'border-ink/15 focus:border-gold focus:ring-gold/20'
                        : confirm === password
                          ? 'border-emerald-600/50 focus:border-emerald-600 focus:ring-emerald-600/20'
                          : 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20'
                    }`}
                    placeholder="••••••••"
                  />
                  {confirm.length > 0 && confirm !== password && (
                    <p className="mt-1.5 text-[11px] text-red-600">As senhas não coincidem.</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || !valid}
                  className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-full bg-ink px-5 py-3.5 text-sm font-medium text-paper transition hover:bg-ink/90 disabled:opacity-50"
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-gold/30 to-transparent transition-transform duration-700 group-hover:translate-x-full"
                  />
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <span>Redefinir senha</span>
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gold text-ink transition-transform group-hover:translate-x-0.5">
                        <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </>
                  )}
                </button>
              </form>
            )}

            {done && (
              <div className="mt-8 flex items-center justify-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/50 px-4 py-4 text-emerald-800">
                <Check className="h-5 w-5" />
                <span className="text-sm font-medium">Senha redefinida com sucesso.</span>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function passwordScore(p: string): number {
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return Math.min(s, 4);
}
