import React, { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { supabase } from '../supabase';

type ResetPasswordProps = {
  onDone: () => void;
};

export default function ResetPassword({ onDone }: ResetPasswordProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 8) {
      toast.error('Use uma senha com pelo menos 8 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('As senhas digitadas nao conferem.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success('Senha atualizada com sucesso.');
      onDone();
    } catch (err: any) {
      console.error('Password update error:', err);
      toast.error(err?.message || 'Nao foi possivel atualizar a senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5efe3] px-4 py-10 flex items-center justify-center text-ink">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-10 -z-10 rounded-[3rem] blur-3xl opacity-70"
          style={{ background: 'radial-gradient(closest-side, rgba(218,170,90,0.45), transparent 70%)' }}
        />

        <div className="relative overflow-hidden rounded-3xl border border-ink/10 bg-paper p-8 shadow-[0_50px_120px_-30px_rgba(20,15,10,0.55),_0_8px_24px_-12px_rgba(20,15,10,0.25)] sm:p-10">
          <div className="text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-ink/20 bg-paper">
              <span className="font-display text-lg italic leading-none text-ink">R</span>
            </div>
            <p className="mt-5 text-[11px] uppercase tracking-[0.28em] text-stone-500">
              Royal PMS · seguranca da conta
            </p>
            <h1 className="mt-3 font-display text-3xl font-light leading-[1.05] tracking-[-0.02em] text-ink sm:text-[2.5rem]">
              Cadastre uma
              <br />
              <span className="aura-text italic text-ink">nova senha.</span>
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-ink/65">
              Informe a nova senha para concluir a recuperacao do acesso.
            </p>
          </div>

          <form className="relative mt-8 space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500">
                Nova senha
              </label>
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-ink outline-none transition placeholder:text-stone-400 focus:border-gold focus:ring-4 focus:ring-gold/20"
                placeholder="Minimo de 8 caracteres"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500">
                Confirmar senha
              </label>
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-ink outline-none transition placeholder:text-stone-400 focus:border-gold focus:ring-4 focus:ring-gold/20"
                placeholder="Repita a nova senha"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-full bg-ink px-5 py-3.5 text-sm font-medium text-paper transition hover:bg-ink/90 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                <>
                  <span>Atualizar senha</span>
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gold text-ink">
                    <KeyRound className="h-3.5 w-3.5" />
                  </span>
                </>
              )}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
