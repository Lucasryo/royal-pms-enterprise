import React, { ComponentType, useEffect, useMemo, useState } from 'react';
import { Building2, CheckCircle2, KeyRound, Link2, Loader2, Mail, Phone, RefreshCw, Save, Search, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../supabase';
import { Company, UserPermissions, UserProfile, UserRole } from '../types';
import { DEFAULT_PERMISSIONS } from '../lib/defaultPermissions';
import { logAudit } from '../lib/audit';
import PermissionsSelector from './PermissionsSelector';
import ProfileAccessMatrix from './ProfileAccessMatrix';
import TelegramPermissionsManager from './TelegramPermissionsManager';

type CadastroTab = 'user' | 'company' | 'link' | 'telegram';

const ROLE_OPTIONS: Array<{ value: UserRole; label: string; detail: string }> = [
  { value: 'client', label: 'Cliente', detail: 'Portal financeiro e documentos' },
  { value: 'external_client', label: 'Cliente externo', detail: 'Reservas e acompanhamento restrito' },
  { value: 'reservations', label: 'Reservas', detail: 'Central de reservas e tarifas' },
  { value: 'faturamento', label: 'Faturamento', detail: 'Arquivos, baixa e conferencia' },
  { value: 'finance', label: 'Financeiro', detail: 'Gestao financeira completa' },
  { value: 'reception', label: 'Recepcao', detail: 'Check-in, checkout e folio' },
  { value: 'eventos', label: 'Eventos', detail: 'Agenda, O.S. e eventos' },
  { value: 'restaurant', label: 'Restaurante', detail: 'POS e lancamentos' },
  { value: 'housekeeping', label: 'Governanca', detail: 'UHs e limpeza' },
  { value: 'maintenance', label: 'Manutencao', detail: 'Chamados e vistorias' },
  { value: 'manager', label: 'Gerente', detail: 'Gestao operacional' },
  { value: 'admin', label: 'Admin', detail: 'Controle total do PMS' },
  { value: 'marketing', label: 'Marketing', detail: 'Campanhas e canais' },
];

const COMPANY_LINKED_ROLES: UserRole[] = ['client', 'external_client', 'reservations'];

const emptyUserForm = {
  name: '',
  email: '',
  phone: '',
  password: '',
  role: 'client' as UserRole,
  companyId: '',
};

const emptyCompanyForm = {
  name: '',
  cnpj: '',
  email: '',
  emailDomain: '',
  phone: '',
  address: '',
  slug: '',
  aliases: '',
  status: 'active' as 'active' | 'inactive',
};

export default function AdminRegistrationCenter({ profile }: { profile: UserProfile }) {
  const [activeTab, setActiveTab] = useState<CadastroTab>('user');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingUser, setSavingUser] = useState(false);
  const [savingCompany, setSavingCompany] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [companyForm, setCompanyForm] = useState(emptyCompanyForm);
  const [permissions, setPermissions] = useState<UserPermissions>(DEFAULT_PERMISSIONS.client);

  useEffect(() => {
    void fetchCadastroData();
  }, []);

  const clients = useMemo(
    () => users.filter(user => user.role === 'client' || user.role === 'external_client'),
    [users],
  );

  const linkedClients = clients.filter(user => user.company_id).length;
  const activeUsers = users.filter(user => (user as UserProfile & { active?: boolean }).active !== false).length;
  const selectedRole = ROLE_OPTIONS.find(role => role.value === userForm.role) || ROLE_OPTIONS[0];
  const defaultPermissions = DEFAULT_PERMISSIONS[userForm.role] || DEFAULT_PERMISSIONS.client;
  const enabledPermissionCount = Object.values(permissions).filter(Boolean).length;
  const changedPermissionCount = (Object.keys(permissions) as Array<keyof UserPermissions>)
    .filter(key => permissions[key] !== defaultPermissions[key])
    .length;
  const shouldLinkCompany = COMPANY_LINKED_ROLES.includes(userForm.role);
  const filteredClients = clients.filter(user => {
    const term = linkSearch.trim().toLowerCase();
    if (!term) return true;
    return user.name.toLowerCase().includes(term) || user.email.toLowerCase().includes(term);
  });

  async function fetchCadastroData() {
    setLoading(true);
    const [companiesRes, usersRes] = await Promise.all([
      supabase.from('companies').select('*').order('name'),
      supabase.from('profiles').select('*').order('name'),
    ]);

    if (companiesRes.error) {
      toast.error('Erro ao carregar empresas.');
    } else {
      setCompanies((companiesRes.data ?? []) as Company[]);
    }

    if (usersRes.error) {
      toast.error('Erro ao carregar usuarios.');
    } else {
      setUsers((usersRes.data ?? []) as UserProfile[]);
    }
    setLoading(false);
  }

  function handleRoleChange(role: UserRole) {
    setUserForm(prev => ({
      ...prev,
      role,
      companyId: COMPANY_LINKED_ROLES.includes(role) ? prev.companyId : '',
    }));
    setPermissions(DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.client);
  }

  async function handleCreateUser() {
    if (!userForm.name.trim() || !userForm.email.trim() || !userForm.password) {
      toast.error('Preencha nome, e-mail e senha.');
      return;
    }
    if (userForm.password.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setSavingUser(true);
    try {
      const { data: invokeData, error: invokeError } = await supabase.functions.invoke('admin-create-user', {
        body: {
          email: userForm.email.trim(),
          password: userForm.password,
          name: userForm.name.trim(),
          phone: userForm.phone.trim(),
          role: userForm.role,
          company_id: shouldLinkCompany ? userForm.companyId || null : null,
          permissions,
        },
      });

      if (invokeError) {
        throw new Error((invokeError as any)?.context?.error || invokeError.message || 'Erro ao cadastrar usuario');
      }
      if (invokeData && (invokeData as any).error) {
        throw new Error((invokeData as any).error);
      }

      toast.success('Usuario cadastrado com sucesso.');
      logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Cadastro de Usuario',
        details: JSON.stringify({ name: userForm.name, email: userForm.email, role: userForm.role }),
        type: 'user_create',
      });
      setUserForm(emptyUserForm);
      setPermissions(DEFAULT_PERMISSIONS.client);
      await fetchCadastroData();
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao cadastrar usuario.');
    } finally {
      setSavingUser(false);
    }
  }

  async function handleCreateCompany(event: React.FormEvent) {
    event.preventDefault();
    if (!companyForm.name.trim()) {
      toast.error('Informe o nome da empresa.');
      return;
    }

    setSavingCompany(true);
    try {
      const aliases = companyForm.aliases
        .split(',')
        .map(alias => alias.trim().toLowerCase())
        .filter(Boolean);
      const payload = {
        name: companyForm.name.trim(),
        cnpj: companyForm.cnpj.trim() || null,
        email: companyForm.email.trim() || null,
        email_domain: companyForm.emailDomain.trim().toLowerCase() || null,
        phone: companyForm.phone.trim() || null,
        address: companyForm.address.trim() || null,
        slug: companyForm.slug.trim() || null,
        status: companyForm.status,
        parser_aliases: aliases,
        created_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('companies').insert([payload]);
      if (error) throw error;

      toast.success('Empresa cadastrada com sucesso.');
      logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Cadastrou empresa',
        details: `Empresa: ${companyForm.name}`,
        type: 'create',
      });
      setCompanyForm(emptyCompanyForm);
      await fetchCadastroData();
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao cadastrar empresa.');
    } finally {
      setSavingCompany(false);
    }
  }

  async function handleUpdateUserCompany(userId: string, companyId: string) {
    const { error } = await supabase
      .from('profiles')
      .update({ company_id: companyId || null })
      .eq('id', userId);

    if (error) {
      toast.error('Erro ao vincular cliente.');
      return;
    }

    toast.success('Vinculo atualizado.');
    setUsers(prev => prev.map(user => user.id === userId ? { ...user, company_id: companyId || undefined } : user));
  }

  const tabs: Array<{ id: CadastroTab; label: string; icon: ComponentType<{ className?: string }>; metric: string }> = [
    { id: 'user', label: 'Usuario PMS', icon: UserPlus, metric: `${users.length} usuarios` },
    { id: 'company', label: 'Empresa', icon: Building2, metric: `${companies.length} empresas` },
    { id: 'link', label: 'Vinculos', icon: Link2, metric: `${linkedClients}/${clients.length} clientes` },
    { id: 'telegram', label: 'Telegram', icon: ShieldCheck, metric: 'bot' },
  ];

  return (
    <div className="space-y-5 overflow-x-clip">
      <div className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-600">Cadastro</p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-neutral-950 sm:text-2xl">
              Central de cadastros do PMS
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-500">
              Crie usuarios, empresas, vinculos de cliente e acessos Telegram em um fluxo unico de configuracao.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchCadastroData}
            disabled={loading}
            className="flex w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-neutral-950 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white transition hover:bg-neutral-800 disabled:opacity-50 sm:w-auto"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <CadastroKpi label="Empresas" value={companies.length} />
          <CadastroKpi label="Usuarios" value={users.length} />
          <CadastroKpi label="Ativos" value={activeUsers} />
          <CadastroKpi label="Clientes vinculados" value={linkedClients} />
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-2 shadow-sm">
        <div className="flex max-w-full gap-1 overflow-x-auto">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left transition sm:px-4 ${
                  selected ? 'bg-neutral-950 text-white shadow-sm' : 'bg-neutral-50 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>
                  <span className="block text-xs font-black">{tab.label}</span>
                  <span className={`block text-[10px] font-bold ${selected ? 'text-neutral-300' : 'text-neutral-400'}`}>{tab.metric}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'user' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <div className="min-w-0 overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm">
            <div className="border-b border-neutral-100 bg-neutral-950 p-4 text-white sm:p-6">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-300">Novo acesso</p>
              <h3 className="mt-2 text-xl font-black sm:text-2xl">Montar acesso PMS</h3>
              <p className="mt-2 text-sm leading-6 text-neutral-300">
                Comece por um perfil tipico e ajuste excecoes sem criar um cargo novo.
              </p>
            </div>

            <div className="space-y-5 p-4 sm:p-6">
              <div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Perfil tipico</p>
                    <h4 className="text-base font-black text-neutral-950">Escolha a base do acesso</h4>
                  </div>
                  <p className="text-xs font-bold text-neutral-500">
                    {changedPermissionCount > 0 ? `${changedPermissionCount} ajuste(s) fora do padrao` : 'Sem excecoes no perfil'}
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {ROLE_OPTIONS.map(role => {
                    const selected = userForm.role === role.value;
                    return (
                      <button
                        key={role.value}
                        type="button"
                        onClick={() => handleRoleChange(role.value)}
                        className={`min-h-[88px] rounded-2xl border p-3 text-left transition ${
                          selected
                            ? 'border-neutral-950 bg-neutral-950 text-white shadow-sm'
                            : 'border-neutral-200 bg-neutral-50 text-neutral-700 hover:border-neutral-400 hover:bg-white'
                        }`}
                      >
                        <span className="block text-sm font-black">{role.label}</span>
                        <span className={`mt-1 block text-xs font-bold leading-5 ${selected ? 'text-neutral-300' : 'text-neutral-500'}`}>
                          {role.detail}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <CadastroField label="Nome completo" icon={Users}>
                  <input required value={userForm.name} onChange={event => setUserForm(prev => ({ ...prev, name: event.target.value }))} placeholder="Ex: Ana Souza" className={inputClass} />
                </CadastroField>
                <CadastroField label="E-mail de login" icon={Mail}>
                  <input required type="email" value={userForm.email} onChange={event => setUserForm(prev => ({ ...prev, email: event.target.value }))} placeholder="usuario@hotel.com" className={inputClass} />
                </CadastroField>
                <CadastroField label="WhatsApp" icon={Phone}>
                  <input value={userForm.phone} onChange={event => setUserForm(prev => ({ ...prev, phone: event.target.value }))} placeholder="(22) 99999-9999" className={inputClass} />
                </CadastroField>
                <CadastroField label="Senha temporaria" icon={KeyRound}>
                  <input required minLength={6} type="password" value={userForm.password} onChange={event => setUserForm(prev => ({ ...prev, password: event.target.value }))} placeholder="Minimo 6 caracteres" className={inputClass} />
                </CadastroField>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Perfil aplicado</p>
                  <p className="mt-1 text-lg font-black text-neutral-950">{selectedRole.label}</p>
                  <p className="mt-1 text-xs font-bold leading-5 text-neutral-500">{selectedRole.detail}</p>
                </div>
                <label className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Empresa vinculada</span>
                  <select
                    value={userForm.companyId}
                    onChange={event => setUserForm(prev => ({ ...prev, companyId: event.target.value }))}
                    disabled={!shouldLinkCompany}
                    className={selectClass}
                  >
                    <option value="">{shouldLinkCompany ? 'Sem empresa' : 'Nao exigido para este perfil'}</option>
                    {companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
                  </select>
                </label>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3 sm:p-4">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Permissoes</p>
                    <h4 className="text-sm font-black text-neutral-950">Adicionar ou retirar funcoes do perfil</h4>
                    <p className="mt-1 text-xs font-bold text-neutral-500">
                      Exemplo: selecione Recepcao e habilite Eventos apenas para este usuario.
                    </p>
                  </div>
                  <button type="button" onClick={() => setPermissions(DEFAULT_PERMISSIONS[userForm.role] || DEFAULT_PERMISSIONS.client)} className="w-full rounded-xl bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-600 ring-1 ring-neutral-200 hover:text-neutral-950 sm:w-auto">
                    Restaurar perfil
                  </button>
                </div>
                <div className="max-h-[430px] overflow-y-auto rounded-xl border border-neutral-200 bg-white p-3">
                  <PermissionsSelector permissions={permissions} onChange={setPermissions} role={userForm.role} />
                </div>
              </div>

              <button type="button" onClick={handleCreateUser} disabled={savingUser} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-neutral-950 px-4 py-3 text-sm font-black uppercase tracking-widest text-white transition hover:bg-neutral-800 disabled:opacity-60">
                {savingUser ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Criar acesso PMS
              </button>
            </div>
          </div>

          <aside className="min-w-0 space-y-5">
            <div className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6">
              <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Perfil selecionado</p>
              <h3 className="mt-2 text-xl font-black text-neutral-950">{selectedRole.label}</h3>
              <p className="mt-2 text-sm leading-6 text-neutral-500">{selectedRole.detail}</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-neutral-50 p-3 ring-1 ring-neutral-200">
                  <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Ativas</p>
                  <p className="mt-1 text-xl font-black text-neutral-950">{enabledPermissionCount}</p>
                </div>
                <div className="rounded-2xl bg-neutral-50 p-3 ring-1 ring-neutral-200">
                  <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Excecoes</p>
                  <p className="mt-1 text-xl font-black text-neutral-950">{changedPermissionCount}</p>
                </div>
              </div>
              <div className="mt-3 rounded-2xl bg-neutral-50 p-4 ring-1 ring-neutral-200">
                <p className="text-xs font-bold text-neutral-600">
                  {shouldLinkCompany ? 'Este perfil pode ser vinculado a uma empresa.' : 'Este perfil opera sem vinculo obrigatorio com empresa.'}
                </p>
              </div>
            </div>
            <ProfileAccessMatrix />
          </aside>
        </div>
      )}

      {activeTab === 'company' && (
        <form onSubmit={handleCreateCompany} className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Empresa</p>
              <h3 className="mt-1 text-xl font-black text-neutral-950 sm:text-2xl">Cadastro corporativo</h3>
            </div>
            <span className="rounded-full bg-neutral-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-neutral-500 ring-1 ring-neutral-200">Parser e faturamento</span>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <CadastroText label="Nome da empresa" value={companyForm.name} onChange={value => setCompanyForm(prev => ({ ...prev, name: value }))} required />
            <CadastroText label="CNPJ" value={companyForm.cnpj} onChange={value => setCompanyForm(prev => ({ ...prev, cnpj: value }))} />
            <CadastroText label="E-mail financeiro" value={companyForm.email} onChange={value => setCompanyForm(prev => ({ ...prev, email: value }))} />
            <CadastroText label="Dominio de e-mail" value={companyForm.emailDomain} onChange={value => setCompanyForm(prev => ({ ...prev, emailDomain: value }))} />
            <CadastroText label="Telefone" value={companyForm.phone} onChange={value => setCompanyForm(prev => ({ ...prev, phone: value }))} />
            <CadastroText label="Slug" value={companyForm.slug} onChange={value => setCompanyForm(prev => ({ ...prev, slug: value }))} />
            <label className="space-y-1 sm:col-span-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Endereco</span>
              <input value={companyForm.address} onChange={event => setCompanyForm(prev => ({ ...prev, address: event.target.value }))} className={plainInputClass} />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Status</span>
              <select value={companyForm.status} onChange={event => setCompanyForm(prev => ({ ...prev, status: event.target.value as 'active' | 'inactive' }))} className={selectClass}>
                <option value="active">Ativa</option>
                <option value="inactive">Inativa</option>
              </select>
            </label>
            <label className="space-y-1 lg:col-span-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Aliases do parser</span>
              <input value={companyForm.aliases} onChange={event => setCompanyForm(prev => ({ ...prev, aliases: event.target.value }))} placeholder="nomes alternativos separados por virgula" className={plainInputClass} />
            </label>
          </div>

          <button type="submit" disabled={savingCompany} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-neutral-950 px-4 py-3 text-sm font-black uppercase tracking-widest text-white transition hover:bg-neutral-800 disabled:opacity-60 sm:w-auto">
            {savingCompany ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
            Cadastrar empresa
          </button>
        </form>
      )}

      {activeTab === 'link' && (
        <div className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Vinculos</p>
              <h3 className="mt-1 text-xl font-black text-neutral-950 sm:text-2xl">Clientes e empresas</h3>
            </div>
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input value={linkSearch} onChange={event => setLinkSearch(event.target.value)} placeholder="Buscar cliente..." className="w-full rounded-xl border border-neutral-200 bg-neutral-50 py-3 pl-10 pr-4 text-sm outline-none focus:border-neutral-900 focus:bg-white" />
            </div>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-neutral-50 text-[10px] font-black uppercase tracking-widest text-neutral-400">
                <tr>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Perfil</th>
                  <th className="px-4 py-3">Empresa</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredClients.map(user => (
                  <tr key={user.id}>
                    <td className="px-4 py-3">
                      <p className="font-bold text-neutral-900">{user.name}</p>
                      <p className="text-xs text-neutral-500">{user.email}</p>
                    </td>
                    <td className="px-4 py-3 text-xs font-black uppercase text-neutral-500">{user.role}</td>
                    <td className="px-4 py-3">
                      <select value={user.company_id || ''} onChange={event => handleUpdateUserCompany(user.id, event.target.value)} className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-bold outline-none focus:border-neutral-900">
                        <option value="">Sem empresa</option>
                        {companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" />
                        Atualizavel
                      </span>
                    </td>
                  </tr>
                ))}
                {!filteredClients.length && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-sm font-bold text-neutral-400">Nenhum cliente encontrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'telegram' && <TelegramPermissionsManager profile={profile} />}
    </div>
  );
}

const inputClass = 'w-full rounded-xl border border-neutral-200 bg-neutral-50 py-3 pl-10 pr-4 text-sm text-neutral-900 outline-none transition focus:border-neutral-900 focus:bg-white focus:ring-4 focus:ring-neutral-900/5';
const plainInputClass = 'w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-900 focus:bg-white focus:ring-4 focus:ring-neutral-900/5';
const selectClass = 'w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-bold text-neutral-900 outline-none transition focus:border-neutral-900 focus:bg-white focus:ring-4 focus:ring-neutral-900/5 disabled:cursor-not-allowed disabled:text-neutral-400';

function CadastroField({ label, icon: Icon, children }: { label: string; icon: ComponentType<{ className?: string }>; children: React.ReactNode }) {
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

function CadastroText({ label, value, onChange, required }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <label className="space-y-1">
      <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">{label}</span>
      <input required={required} value={value} onChange={event => onChange(event.target.value)} className={plainInputClass} />
    </label>
  );
}

function CadastroKpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
      <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">{label}</p>
      <p className="mt-2 text-xl font-black tabular-nums text-neutral-950 sm:text-2xl">{value}</p>
    </div>
  );
}
