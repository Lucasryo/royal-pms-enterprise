import { useEffect, useState } from 'react';
import { Loader2, RefreshCw, Send, ShieldCheck, ShieldOff, UserRoundCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../supabase';
import { UserProfile } from '../types';

type TelegramRole = 'admin' | 'technician' | 'inspector';

type TelegramBindingRow = {
  id: string;
  profile_id: string;
  telegram_user_id: number;
  telegram_username: string | null;
  display_name: string | null;
  telegram_role: TelegramRole;
};

type TelegramPendingCode = {
  code: string;
  expires_at: string;
  telegram_role: TelegramRole;
};

type TelegramPermissionProfile = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  telegram_binding: TelegramBindingRow | null;
  pending_code: TelegramPendingCode | null;
};

const TELEGRAM_ROLE_LABELS: Record<TelegramRole, string> = {
  technician: 'Tecnico',
  inspector: 'Vistoria',
  admin: 'Admin',
};

export default function TelegramPermissionsManager({ profile }: { profile: UserProfile }) {
  const [profiles, setProfiles] = useState<TelegramPermissionProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [creatingCodeFor, setCreatingCodeFor] = useState<string | null>(null);
  const [revokingBindingId, setRevokingBindingId] = useState<string | null>(null);
  const [lastCode, setLastCode] = useState<{ profileId: string; code: string; expiresAt: string; role: TelegramRole } | null>(null);

  const canManageTelegram = profile.role === 'admin' || profile.role === 'manager';
  const linkedCount = profiles.filter(item => item.telegram_binding).length;
  const pendingCount = profiles.filter(item => item.pending_code).length;
  const activeCount = profiles.filter(item => item.active).length;

  useEffect(() => {
    if (canManageTelegram) {
      void fetchTelegramPermissions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageTelegram]);

  async function callBotFunction(body: Record<string, unknown>) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Sessao invalida.');

    const supaUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const res = await fetch(`${supaUrl}/functions/v1/notify-maintenance-ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.ok === false) {
      const details = Array.isArray(data?.errors) && data.errors.length
        ? data.errors[0]
        : data?.error;
      throw new Error(details ?? `Falha ao chamar bot (${res.status}).`);
    }
    return data;
  }

  async function fetchTelegramPermissions() {
    if (!canManageTelegram) return;
    setLoading(true);
    try {
      const data = await callBotFunction({ type: 'telegram_permissions' });
      setProfiles((data?.profiles ?? []) as TelegramPermissionProfile[]);
    } catch (error) {
      setProfiles([]);
      toast.error(error instanceof Error ? error.message : 'Erro ao carregar permissoes do Telegram.');
    } finally {
      setLoading(false);
    }
  }

  async function createTelegramLinkCode(profileId: string, role: TelegramRole) {
    setCreatingCodeFor(profileId);
    try {
      const data = await callBotFunction({ type: 'create_telegram_link_code', profile_id: profileId, telegram_role: role });
      const code = data?.code as { code: string; expires_at: string; telegram_role: TelegramRole } | undefined;
      if (!code) throw new Error('Codigo nao retornado pelo bot.');
      setLastCode({ profileId, code: code.code, expiresAt: code.expires_at, role: code.telegram_role });
      toast.success(`Codigo Telegram gerado: ${code.code}`);
      await fetchTelegramPermissions();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao gerar codigo Telegram.');
    } finally {
      setCreatingCodeFor(null);
    }
  }

  async function revokeTelegramBinding(bindingId: string) {
    setRevokingBindingId(bindingId);
    try {
      await callBotFunction({ type: 'revoke_telegram_binding', binding_id: bindingId });
      toast.success('Vinculo Telegram revogado.');
      if (lastCode) setLastCode(null);
      await fetchTelegramPermissions();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao revogar vinculo Telegram.');
    } finally {
      setRevokingBindingId(null);
    }
  }

  if (!canManageTelegram) {
    return (
      <div className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-center gap-3">
          <ShieldOff className="h-5 w-5 text-neutral-400" />
          <div>
            <h2 className="text-xl font-black text-neutral-950 sm:text-2xl">Telegram / Permissoes</h2>
            <p className="mt-1 text-sm text-neutral-500">Seu perfil nao possui permissao para gerenciar vinculos Telegram.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 overflow-x-clip">
      <div className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-600">Telegram</p>
            <h2 className="mt-1 text-xl font-black text-neutral-950 sm:text-2xl">Permissoes do bot</h2>
            <p className="mt-1 text-sm text-neutral-500">Vincule usuarios PMS as contas Telegram usadas na rotina de manutencao.</p>
          </div>
          <button
            type="button"
            onClick={fetchTelegramPermissions}
            disabled={loading}
            className="flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-neutral-950 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white shadow-sm transition-all hover:bg-neutral-800 disabled:opacity-50 sm:w-auto"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <TelegramKpi label="Operacionais" value={profiles.length} />
          <TelegramKpi label="Ativos PMS" value={activeCount} />
          <TelegramKpi label="Vinculados" value={linkedCount} />
          <TelegramKpi label="Codigos" value={pendingCount} />
        </div>
      </div>

      {lastCode && (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Codigo gerado</p>
              <p className="mt-1 font-mono text-2xl font-black tracking-widest text-emerald-950 sm:text-3xl">{lastCode.code}</p>
              <p className="mt-1 text-xs font-bold text-emerald-700">
                Perfil {TELEGRAM_ROLE_LABELS[lastCode.role]}. Valido ate {new Date(lastCode.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.
              </p>
            </div>
            <div className="rounded-2xl bg-white/80 p-3 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200">
              O colaborador deve enviar <span className="font-mono">/vincular {lastCode.code}</span> no Telegram.
            </div>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-100 p-4 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Vinculos oficiais</p>
              <h3 className="mt-1 text-base font-black text-neutral-950">Usuarios PMS x Telegram</h3>
            </div>
            <p className="text-xs font-bold text-neutral-500">{linkedCount} de {profiles.length} usuarios vinculados</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-xs">
            <thead className="bg-neutral-50 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-6 py-4">Colaborador</th>
                <th className="px-6 py-4">PMS</th>
                <th className="px-6 py-4">Telegram</th>
                <th className="px-6 py-4">Codigo</th>
                <th className="px-6 py-4 text-right">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {profiles.map(item => {
                const binding = item.telegram_binding;
                const pending = item.pending_code;
                return (
                  <tr key={item.id} className="transition-colors hover:bg-neutral-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-white">
                          <UserRoundCheck className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-neutral-900">{item.name}</p>
                          <p className="text-xs text-neutral-500">{item.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="border-l border-neutral-100 px-6 py-4">
                      <span className={`rounded-md px-2 py-1 text-[10px] font-black uppercase ${item.active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                        {item.active ? item.role : 'inativo'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {binding ? (
                        <div>
                          <p className="text-sm font-black text-neutral-800">{binding.display_name || binding.telegram_username || binding.telegram_user_id}</p>
                          <p className="text-[10px] font-bold text-neutral-400">
                            {TELEGRAM_ROLE_LABELS[binding.telegram_role]} - {binding.telegram_username ? `@${binding.telegram_username}` : binding.telegram_user_id}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs font-bold text-neutral-400">Nao vinculado</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {pending ? (
                        <div>
                          <span className="font-mono text-sm font-black text-emerald-700">{pending.code}</span>
                          <p className="mt-1 text-[10px] font-bold text-neutral-400">{TELEGRAM_ROLE_LABELS[pending.telegram_role]}</p>
                        </div>
                      ) : (
                        <span className="text-xs font-bold text-neutral-300">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {(['technician', 'inspector', 'admin'] as TelegramRole[]).map(role => (
                          <button
                            key={`${item.id}-${role}`}
                            type="button"
                            onClick={() => createTelegramLinkCode(item.id, role)}
                            disabled={!item.active || creatingCodeFor === item.id}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-100 px-2.5 py-1.5 text-[10px] font-black uppercase text-neutral-700 transition hover:bg-neutral-200 disabled:opacity-40"
                          >
                            {creatingCodeFor === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                            {TELEGRAM_ROLE_LABELS[role]}
                          </button>
                        ))}
                        {binding && (
                          <button
                            type="button"
                            onClick={() => revokeTelegramBinding(binding.id)}
                            disabled={revokingBindingId === binding.id}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-[10px] font-black uppercase text-red-700 transition hover:bg-red-100 disabled:opacity-40"
                          >
                            {revokingBindingId === binding.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                            Revogar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!profiles.length && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm font-bold text-neutral-400">
                    {loading ? 'Carregando permissoes...' : 'Nenhum colaborador operacional encontrado.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TelegramKpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
      <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">{label}</p>
      <p className="mt-2 text-xl font-black tabular-nums text-neutral-950 sm:text-2xl">{value}</p>
    </div>
  );
}
