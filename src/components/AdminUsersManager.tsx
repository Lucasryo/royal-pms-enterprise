import { ComponentType, ReactNode, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, KeyRound, Link2Off, Loader2, Mail, Phone, RefreshCw, Save, Search, ShieldCheck, UserCog, Users } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../supabase';
import { Company, UserPermissions, UserProfile, UserRole } from '../types';
import { DEFAULT_PERMISSIONS } from '../lib/defaultPermissions';
import PermissionsSelector from './PermissionsSelector';

type TelegramRole = 'admin' | 'technician' | 'inspector';

type TelegramBinding = {
  id: string;
  profile_id: string;
  telegram_user_id: number;
  telegram_username: string | null;
  display_name: string | null;
  telegram_role: TelegramRole;
  linked_at: string;
};

type ManagedUser = UserProfile & {
  created_at?: string;
  telegram_binding: TelegramBinding | null;
};

type EditableUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  company_id: string;
  active: boolean;
  permissions: UserPermissions;
};

const ROLE_OPTIONS: Array<{ value: UserRole; label: string }> = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Gerente' },
  { value: 'reservations', label: 'Reservas' },
  { value: 'reception', label: 'Recepcao' },
  { value: 'finance', label: 'Financeiro' },
  { value: 'faturamento', label: 'Faturamento' },
  { value: 'eventos', label: 'Eventos' },
  { value: 'restaurant', label: 'Restaurante' },
  { value: 'housekeeping', label: 'Governanca' },
  { value: 'maintenance', label: 'Manutencao' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'client', label: 'Cliente' },
  { value: 'external_client', label: 'Cliente externo' },
];

const TELEGRAM_ROLE_LABELS: Record<TelegramRole, string> = {
  technician: 'Tecnico',
  inspector: 'Vistoria',
  admin: 'Admin',
};

export default function AdminUsersManager({ profile }: { profile: UserProfile }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [draft, setDraft] = useState<EditableUser | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [revokingBinding, setRevokingBinding] = useState(false);

  const canManage = profile.role === 'admin';

  useEffect(() => {
    if (canManage) void fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage]);

  const selectedUser = users.find(user => user.id === selectedId) || null;
  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter(user => {
      const matchesTerm = !term || user.name.toLowerCase().includes(term) || user.email.toLowerCase().includes(term);
      const matchesRole = !roleFilter || user.role === roleFilter;
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? user.active !== false : user.active === false);
      return matchesTerm && matchesRole && matchesStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  const activeCount = users.filter(user => user.active !== false).length;
  const linkedTelegramCount = users.filter(user => user.telegram_binding).length;
  const changedPermissionCount = draft
    ? (Object.keys(draft.permissions) as Array<keyof UserPermissions>).filter(key => draft.permissions[key] !== (DEFAULT_PERMISSIONS[draft.role] || DEFAULT_PERMISSIONS.client)[key]).length
    : 0;
  const selectedCompany = draft?.company_id ? companies.find(company => company.id === draft.company_id) : null;
  const selectedPermissionCount = draft ? Object.values(draft.permissions).filter(Boolean).length : 0;

  async function callManageFunction(body: Record<string, unknown>) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Sessao invalida.');

    const { data, error } = await supabase.functions.invoke('admin-manage-user', {
      body,
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (error) throw new Error((error as any)?.context?.error || error.message || 'Falha ao gerenciar usuario.');
    if (data?.ok === false || data?.error) throw new Error(data.error || 'Falha ao gerenciar usuario.');
    return data;
  }

  async function fetchUsers() {
    setLoading(true);
    try {
      const data = await callManageFunction({ action: 'list' });
      const nextUsers = (data?.users ?? []) as ManagedUser[];
      setUsers(nextUsers);
      setCompanies((data?.companies ?? []) as Company[]);
      const nextSelected = selectedId && nextUsers.some(user => user.id === selectedId)
        ? selectedId
        : nextUsers[0]?.id || '';
      setSelectedId(nextSelected);
      setDraft(nextUsers.find(user => user.id === nextSelected) ? toDraft(nextUsers.find(user => user.id === nextSelected)!) : null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao carregar usuarios.');
    } finally {
      setLoading(false);
    }
  }

  function selectUser(user: ManagedUser) {
    setSelectedId(user.id);
    setDraft(toDraft(user));
    setPassword('');
  }

  function updateDraft(patch: Partial<EditableUser>) {
    setDraft(prev => prev ? { ...prev, ...patch } : prev);
  }

  function handleRoleChange(role: UserRole) {
    updateDraft({ role, permissions: DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.client });
  }

  async function saveProfile() {
    if (!draft) return;
    if (!draft.name.trim() || !draft.email.trim()) {
      toast.error('Nome e e-mail sao obrigatorios.');
      return;
    }

    setSaving(true);
    try {
      await callManageFunction({
        action: 'update_profile',
        profile_id: draft.id,
        name: draft.name.trim(),
        email: draft.email.trim(),
        phone: draft.phone.trim(),
        role: draft.role,
        company_id: draft.company_id || null,
        active: draft.active,
        permissions: draft.permissions,
      });
      toast.success('Usuario atualizado.');
      await fetchUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar usuario.');
    } finally {
      setSaving(false);
    }
  }

  async function updatePassword() {
    if (!draft) return;
    if (password.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setSavingPassword(true);
    try {
      await callManageFunction({ action: 'update_password', profile_id: draft.id, password });
      setPassword('');
      toast.success('Senha atualizada.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao alterar senha.');
    } finally {
      setSavingPassword(false);
    }
  }

  async function revokeTelegramBinding() {
    if (!selectedUser?.telegram_binding) return;
    setRevokingBinding(true);
    try {
      await callManageFunction({ action: 'revoke_telegram_binding', binding_id: selectedUser.telegram_binding.id });
      toast.success('Vinculo Telegram revogado.');
      await fetchUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao revogar vinculo Telegram.');
    } finally {
      setRevokingBinding(false);
    }
  }

  if (!canManage) {
    return (
      <div className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-xl font-black text-neutral-950 sm:text-2xl">Usuarios</h2>
        <p className="mt-2 text-sm text-neutral-500">Seu perfil nao possui permissao para gerenciar usuarios.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 overflow-x-clip">
      <div className="rounded-[1.5rem] border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-sky-600">Acessos</p>
            <h2 className="mt-1 text-lg font-black tracking-tight text-neutral-950 sm:text-xl">Gestao de usuarios PMS</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-500">
              Edite perfil, status, permissoes, senha, empresa e vinculo Telegram de cada usuario.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchUsers}
            disabled={loading}
            className="flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-neutral-950 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white transition hover:bg-neutral-800 disabled:opacity-50 sm:w-auto"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <UserKpi label="Usuarios" value={users.length} />
          <UserKpi label="Ativos" value={activeCount} />
          <UserKpi label="Inativos" value={users.length - activeCount} />
          <UserKpi label="Telegram" value={linkedTelegramCount} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[460px_minmax(0,1fr)]">
        <section className="min-w-0 overflow-hidden rounded-[1.5rem] border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-100 bg-neutral-950 p-4 text-white sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-sky-300">Diretorio</p>
                <h3 className="mt-1 text-lg font-black">Usuarios cadastrados</h3>
                <p className="mt-1 text-xs font-medium leading-5 text-neutral-300">Filtre e selecione um perfil para editar.</p>
              </div>
              <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white ring-1 ring-white/10">
                {filteredUsers.length}/{users.length}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2">
              <div className="relative min-w-0">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
                <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por nome ou e-mail" className="w-full rounded-xl border border-white/10 bg-white py-2.5 pl-10 pr-3 text-sm text-neutral-950 outline-none focus:ring-4 focus:ring-sky-300/20" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select value={roleFilter} onChange={event => setRoleFilter(event.target.value)} className="rounded-xl border border-white/10 bg-white px-3 py-2.5 text-xs font-bold text-neutral-900 outline-none focus:ring-4 focus:ring-sky-300/20">
                  <option value="">Perfil</option>
                  {ROLE_OPTIONS.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}
                </select>
                <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)} className="rounded-xl border border-white/10 bg-white px-3 py-2.5 text-xs font-bold text-neutral-900 outline-none focus:ring-4 focus:ring-sky-300/20">
                  <option value="all">Todos</option>
                  <option value="active">Ativos</option>
                  <option value="inactive">Inativos</option>
                </select>
              </div>
            </div>
          </div>

          <div className="max-h-[760px] overflow-y-auto bg-neutral-50 p-2">
            {filteredUsers.map(user => {
              const selected = user.id === selectedId;
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => selectUser(user)}
                  className={`mb-2 w-full rounded-2xl border p-3 text-left transition ${
                    selected ? 'border-neutral-950 bg-white text-neutral-950 shadow-sm ring-2 ring-neutral-950/5' : 'border-neutral-200 bg-white/70 text-neutral-800 hover:border-neutral-300 hover:bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <UserAvatar name={user.name} active={selected} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black">{user.name}</p>
                        <p className="truncate text-xs font-bold text-neutral-500">{user.email}</p>
                      </div>
                    </div>
                    <StatusPill active={user.active !== false} />
                  </div>
                  <div className="ml-11 mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-neutral-100 px-2 py-1 text-[10px] font-black uppercase text-neutral-600 ring-1 ring-neutral-200">{roleLabel(user.role)}</span>
                    {user.telegram_binding && (
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase text-emerald-700 ring-1 ring-emerald-100">Telegram</span>
                    )}
                  </div>
                </button>
              );
            })}
            {!filteredUsers.length && (
              <div className="rounded-2xl bg-neutral-50 p-8 text-center text-sm font-bold text-neutral-400">Nenhum usuario encontrado.</div>
            )}
          </div>
        </section>

        <div className="min-w-0 space-y-5">
          {!draft || !selectedUser ? (
            <div className="rounded-[1.5rem] border border-neutral-200 bg-white p-8 text-center text-sm font-bold text-neutral-400 shadow-sm">
              {loading ? 'Carregando usuarios...' : 'Selecione um usuario para editar.'}
            </div>
          ) : (
            <>
              <section className="overflow-hidden rounded-[1.5rem] border border-neutral-200 bg-white shadow-sm">
                <div className="border-b border-neutral-100 bg-white p-4 sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-center gap-4">
                      <UserAvatar name={selectedUser.name} active size="lg" />
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">Perfil selecionado</p>
                        <h3 className="mt-1 truncate text-xl font-black text-neutral-950 sm:text-2xl">{selectedUser.name}</h3>
                        <p className="mt-1 truncate text-sm font-bold text-neutral-500">{selectedUser.email}</p>
                      </div>
                    </div>
                    <label className="flex w-full shrink-0 cursor-pointer items-center justify-between gap-3 rounded-2xl bg-neutral-50 p-3 ring-1 ring-neutral-200 sm:w-56">
                      <span>
                        <span className="block text-[10px] font-black uppercase tracking-widest text-neutral-400">Status</span>
                        <span className={`block text-sm font-black ${draft.active ? 'text-emerald-700' : 'text-red-700'}`}>{draft.active ? 'Ativo' : 'Inativo'}</span>
                      </span>
                      <input type="checkbox" checked={draft.active} onChange={event => updateDraft({ active: event.target.checked })} className="h-5 w-5 accent-neutral-950" />
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-0 2xl:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="min-w-0 space-y-5 p-4 sm:p-5">
                    <div>
                      <div className="flex items-center gap-3">
                        <EditorStep value="1" />
                        <div>
                          <h4 className="text-base font-black text-neutral-950">Identidade e contato</h4>
                          <p className="mt-1 text-sm font-medium text-neutral-500">Dados exibidos no PMS e usados nos logs.</p>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <UserField label="Nome" icon={Users}>
                          <input value={draft.name} onChange={event => updateDraft({ name: event.target.value })} className={inputClass} />
                        </UserField>
                        <UserField label="E-mail" icon={Mail}>
                          <input type="email" value={draft.email} onChange={event => updateDraft({ email: event.target.value })} className={inputClass} />
                        </UserField>
                        <UserField label="Telefone" icon={Phone}>
                          <input value={draft.phone} onChange={event => updateDraft({ phone: event.target.value })} className={inputClass} />
                        </UserField>
                        <label className="space-y-1">
                          <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Perfil</span>
                          <select value={draft.role} onChange={event => handleRoleChange(event.target.value as UserRole)} className={selectClass}>
                            {ROLE_OPTIONS.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}
                          </select>
                        </label>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-3">
                        <EditorStep value="2" />
                        <div>
                          <h4 className="text-base font-black text-neutral-950">Empresa e acesso</h4>
                          <p className="mt-1 text-sm font-medium text-neutral-500">Vinculo corporativo e escopo operacional.</p>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                        <label className="space-y-1">
                          <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Empresa vinculada</span>
                          <select value={draft.company_id} onChange={event => updateDraft({ company_id: event.target.value })} className={selectClass}>
                            <option value="">Sem empresa</option>
                            {companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
                          </select>
                        </label>
                        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                          <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Empresa atual</p>
                          <p className="mt-1 truncate text-sm font-black text-neutral-950">{selectedCompany?.name || 'Sem vinculo'}</p>
                        </div>
                      </div>
                    </div>

                    <div className="min-w-0 rounded-2xl border border-neutral-200 bg-neutral-50 p-3 sm:p-4">
                      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                          <EditorStep value="3" />
                          <div>
                            <h4 className="text-base font-black text-neutral-950">Permissoes granulares</h4>
                            <p className="mt-1 text-xs font-bold text-neutral-500">{changedPermissionCount} excecao(oes) em relacao ao perfil.</p>
                          </div>
                        </div>
                        <button type="button" onClick={() => updateDraft({ permissions: DEFAULT_PERMISSIONS[draft.role] || DEFAULT_PERMISSIONS.client })} className="w-full rounded-xl bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-600 ring-1 ring-neutral-200 hover:text-neutral-950 sm:w-auto">
                          Restaurar perfil
                        </button>
                      </div>
                      <div className="min-w-0 rounded-xl bg-white">
                        <PermissionsSelector permissions={draft.permissions} onChange={permissions => updateDraft({ permissions })} role={draft.role} />
                      </div>
                    </div>

                    <button type="button" onClick={saveProfile} disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-neutral-950 px-4 py-3 text-sm font-black uppercase tracking-widest text-white transition hover:bg-neutral-800 disabled:opacity-60">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Salvar alteracoes
                    </button>
                  </div>

                  <aside className="border-t border-neutral-100 bg-neutral-50 p-4 2xl:border-l 2xl:border-t-0">
                    <div className="grid grid-cols-2 gap-2">
                      <UserMetric label="Permissoes" value={selectedPermissionCount} />
                      <UserMetric label="Excecoes" value={changedPermissionCount} />
                    </div>
                    <div className="mt-3 rounded-2xl bg-white p-4 ring-1 ring-neutral-200">
                      <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Resumo</p>
                      <p className="mt-2 text-sm font-black text-neutral-950">{roleLabel(draft.role)}</p>
                      <p className="mt-1 text-xs font-bold leading-5 text-neutral-500">
                        {selectedCompany?.name || 'Sem empresa vinculada'}
                      </p>
                    </div>
                    <div className="mt-3 rounded-2xl bg-white p-4 ring-1 ring-neutral-200">
                      <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Estado</p>
                      <div className="mt-2"><StatusPill active={draft.active} /></div>
                    </div>
                  </aside>
                </div>
              </section>

              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <div className="rounded-[1.5rem] border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-neutral-950 p-3 text-white"><KeyRound className="h-5 w-5" /></div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Senha</p>
                      <h4 className="mt-1 text-base font-black text-neutral-950">Trocar senha de acesso</h4>
                    </div>
                  </div>
                  <input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Nova senha temporaria" className="mt-4 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none focus:border-neutral-900 focus:bg-white" />
                  <button type="button" onClick={updatePassword} disabled={savingPassword || !password} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white transition hover:bg-neutral-700 disabled:opacity-50">
                    {savingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                    Atualizar senha
                  </button>
                </div>

                <div className="rounded-[1.5rem] border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700"><ShieldCheck className="h-5 w-5" /></div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Telegram</p>
                      <h4 className="mt-1 text-base font-black text-neutral-950">ID e vinculo</h4>
                    </div>
                  </div>
                  {selectedUser.telegram_binding ? (
                    <div className="mt-4 space-y-3">
                      <TelegramInfo label="Telegram ID" value={String(selectedUser.telegram_binding.telegram_user_id)} />
                      <TelegramInfo label="Usuario" value={selectedUser.telegram_binding.telegram_username ? `@${selectedUser.telegram_binding.telegram_username}` : selectedUser.telegram_binding.display_name || '-'} />
                      <TelegramInfo label="Papel" value={TELEGRAM_ROLE_LABELS[selectedUser.telegram_binding.telegram_role]} />
                      <button type="button" onClick={revokeTelegramBinding} disabled={revokingBinding} className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-red-700 transition hover:bg-red-100 disabled:opacity-50">
                        {revokingBinding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2Off className="h-4 w-4" />}
                        Revogar vinculo
                      </button>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl bg-neutral-50 p-4 text-sm font-bold text-neutral-500 ring-1 ring-neutral-200">
                      Sem vinculo Telegram ativo. Gere o codigo em Admin &gt; Cadastro &gt; Telegram.
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function toDraft(user: ManagedUser): EditableUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    role: user.role,
    company_id: user.company_id || '',
    active: user.active !== false,
    permissions: user.permissions || DEFAULT_PERMISSIONS[user.role] || DEFAULT_PERMISSIONS.client,
  };
}

function roleLabel(role: UserRole) {
  return ROLE_OPTIONS.find(item => item.value === role)?.label || role;
}

const inputClass = 'w-full rounded-xl border border-neutral-200 bg-neutral-50 py-3 pl-10 pr-4 text-sm text-neutral-900 outline-none transition focus:border-neutral-900 focus:bg-white focus:ring-4 focus:ring-neutral-900/5';
const selectClass = 'w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-bold text-neutral-900 outline-none transition focus:border-neutral-900 focus:bg-white focus:ring-4 focus:ring-neutral-900/5';

function UserAvatar({ name, active, size = 'md' }: { name: string; active?: boolean; size?: 'md' | 'lg' }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || 'U';
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-2xl font-black ${
      size === 'lg' ? 'h-14 w-14 text-base' : 'h-9 w-9 text-xs'
    } ${active ? 'bg-neutral-950 text-white' : 'bg-neutral-100 text-neutral-500 ring-1 ring-neutral-200'}`}>
      {initials}
    </span>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest ${
      active ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-red-50 text-red-700 ring-1 ring-red-100'
    }`}>
      {active ? 'Ativo' : 'Inativo'}
    </span>
  );
}

function EditorStep({ value }: { value: string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-neutral-950 text-xs font-black text-white">
      {value}
    </span>
  );
}

function UserMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white p-3 ring-1 ring-neutral-200">
      <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">{label}</p>
      <p className="mt-1 text-xl font-black tabular-nums text-neutral-950">{value}</p>
    </div>
  );
}

function UserField({ label, icon: Icon, children }: { label: string; icon: ComponentType<{ className?: string }>; children: ReactNode }) {
  return (
    <label className="space-y-1">
      <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">{label}</span>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        {children}
      </div>
    </label>
  );
}

function UserKpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
      <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">{label}</p>
      <p className="mt-2 text-xl font-black tabular-nums text-neutral-950 sm:text-2xl">{value}</p>
    </div>
  );
}

function TelegramInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-neutral-50 p-3 ring-1 ring-neutral-200">
      <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">{label}</p>
      <p className="mt-1 break-words text-sm font-black text-neutral-950">{value}</p>
    </div>
  );
}
