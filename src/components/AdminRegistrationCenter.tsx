import React, { ComponentType, useEffect, useMemo, useState } from 'react';
import { Building2, CheckCircle2, KeyRound, Link2, Loader2, Mail, Pencil, Phone, RefreshCw, Save, Search, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../supabase';
import { Company, CompanyBillingProfile, UserPermissions, UserProfile, UserRole, VoucherHotelProfile } from '../types';
import { DEFAULT_PERMISSIONS } from '../lib/defaultPermissions';
import { logAudit } from '../lib/audit';
import PermissionsSelector from './PermissionsSelector';
import ProfileAccessMatrix from './ProfileAccessMatrix';
import TelegramPermissionsManager from './TelegramPermissionsManager';
import { DEFAULT_VOUCHER_HOTEL_PROFILE } from '../lib/voucher';

type CadastroTab = 'user' | 'company' | 'voucher' | 'link' | 'telegram';
type RegistrationMode = 'admin' | 'channel';

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
  id: '',
  name: '',
  cnpj: '',
  email: '',
  emailDomain: '',
  phone: '',
  address: '',
  slug: '',
  aliases: '',
  status: 'active' as 'active' | 'inactive',
  parserBlocked: false,
  parserBlockReason: '',
  parserBlockReply: '',
};

const emptyBillingProfileForm = {
  id: '',
  company_id: '',
  name: '',
  legal_name: '',
  cnpj: '',
  fiscal_address: '',
  fiscal_email: '',
  cost_center: '',
  billing_instructions: '',
  notes: '',
  active: true,
};

export default function AdminRegistrationCenter({ profile, mode = 'admin' }: { profile: UserProfile; mode?: RegistrationMode }) {
  const [activeTab, setActiveTab] = useState<CadastroTab>(mode === 'channel' ? 'link' : 'user');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingUser, setSavingUser] = useState(false);
  const [savingCompany, setSavingCompany] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [companySearch, setCompanySearch] = useState('');
  const [companyListLimit, setCompanyListLimit] = useState(80);
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [hotelProfile, setHotelProfile] = useState<VoucherHotelProfile>(DEFAULT_VOUCHER_HOTEL_PROFILE);
  const [billingProfiles, setBillingProfiles] = useState<CompanyBillingProfile[]>([]);
  const [billingProfileForm, setBillingProfileForm] = useState(emptyBillingProfileForm);
  const [savingVoucher, setSavingVoucher] = useState(false);
  const [savingBillingProfile, setSavingBillingProfile] = useState(false);
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [companyForm, setCompanyForm] = useState(emptyCompanyForm);
  const [permissions, setPermissions] = useState<UserPermissions>(DEFAULT_PERMISSIONS.client);

  useEffect(() => {
    void fetchCadastroData();
  }, []);

  useEffect(() => {
    setActiveTab(mode === 'channel' ? 'link' : 'user');
  }, [mode]);

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
  const filteredCompanies = useMemo(() => {
    const term = companySearch.trim().toLowerCase();
    if (!term) return companies;

    return companies.filter(company => {
      const searchable = [
        company.name,
        company.cnpj,
        company.email,
        company.phone,
        company.address,
        company.slug,
        company.email_domain,
        company.reservation_parser_block_reason,
        company.reservation_parser_block_reply,
        ...((company.parser_aliases ?? [])),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchable.includes(term);
    });
  }, [companies, companySearch]);
  const visibleCompanies = filteredCompanies.slice(0, companyListLimit);
  const hiddenCompanyCount = Math.max(0, filteredCompanies.length - visibleCompanies.length);

  useEffect(() => {
    setCompanyListLimit(80);
  }, [companySearch]);

  async function fetchCadastroData() {
    setLoading(true);
    const [companiesRes, usersRes, hotelProfileRes, billingProfilesRes] = await Promise.all([
      supabase.from('companies').select('*').order('name'),
      supabase.from('profiles').select('*').order('name'),
      supabase.from('app_settings').select('value').eq('id', 'voucher_hotel_profile').maybeSingle(),
      supabase.from('company_billing_profiles').select('*').order('name'),
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

    if (!hotelProfileRes.error && hotelProfileRes.data?.value) {
      const value = typeof hotelProfileRes.data.value === 'string' ? JSON.parse(hotelProfileRes.data.value) : hotelProfileRes.data.value;
      setHotelProfile({ ...DEFAULT_VOUCHER_HOTEL_PROFILE, ...value });
    }

    if (!billingProfilesRes.error) {
      setBillingProfiles((billingProfilesRes.data ?? []) as CompanyBillingProfile[]);
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

  function handleEditCompany(company: Company) {
    setEditingCompanyId(company.id);
    setCompanyForm({
      id: company.id,
      name: company.name || '',
      cnpj: company.cnpj || '',
      email: company.email || '',
      emailDomain: company.email_domain || '',
      phone: company.phone || '',
      address: company.address || '',
      slug: company.slug || '',
      aliases: (company.parser_aliases ?? []).join(', '),
      status: (company.status || 'active').toLowerCase() === 'inactive' ? 'inactive' : 'active',
      parserBlocked: Boolean(company.reservation_parser_blocked),
      parserBlockReason: company.reservation_parser_block_reason || '',
      parserBlockReply: company.reservation_parser_block_reply || '',
    });
  }

  function resetCompanyForm() {
    setEditingCompanyId(null);
    setCompanyForm(emptyCompanyForm);
  }

  async function handleSaveCompany(event: React.FormEvent) {
    event.preventDefault();
    if (!companyForm.name.trim()) {
      toast.error('Informe o nome da empresa.');
      return;
    }
    if (companyForm.parserBlocked && !companyForm.parserBlockReason.trim()) {
      toast.error('Informe o motivo do bloqueio para o parser.');
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
        reservation_parser_blocked: companyForm.parserBlocked,
        reservation_parser_block_reason: companyForm.parserBlocked ? companyForm.parserBlockReason.trim() : null,
        reservation_parser_block_reply: companyForm.parserBlocked ? companyForm.parserBlockReply.trim() || null : null,
        created_at: new Date().toISOString(),
      };

      const updatePayload = { ...payload } as Omit<typeof payload, 'created_at'> & { created_at?: string };
      delete updatePayload.created_at;
      const { error } = editingCompanyId
        ? await supabase
          .from('companies')
          .update(updatePayload)
          .eq('id', editingCompanyId)
        : await supabase.from('companies').insert([payload]);
      if (error) throw error;

      toast.success(editingCompanyId ? 'Empresa atualizada com sucesso.' : 'Empresa cadastrada com sucesso.');
      logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: editingCompanyId ? 'Atualizou empresa' : 'Cadastrou empresa',
        details: `Empresa: ${companyForm.name}`,
        type: 'create',
      });
      resetCompanyForm();
      await fetchCadastroData();
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao salvar empresa.');
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

  async function handleSaveVoucherHotelProfile(event: React.FormEvent) {
    event.preventDefault();
    setSavingVoucher(true);
    try {
      const { error } = await supabase.from('app_settings').upsert({
        id: 'voucher_hotel_profile',
        value: JSON.stringify(hotelProfile),
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success('Dados do hotel no voucher atualizados.');
      logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Atualizou dados do voucher B2B',
        details: JSON.stringify({ hotel: hotelProfile.trade_name }),
        type: 'update',
      });
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao salvar dados do voucher.');
    } finally {
      setSavingVoucher(false);
    }
  }

  function editBillingProfile(item: CompanyBillingProfile) {
    setBillingProfileForm({
      id: item.id,
      company_id: item.company_id,
      name: item.name || '',
      legal_name: item.legal_name || '',
      cnpj: item.cnpj || '',
      fiscal_address: item.fiscal_address || '',
      fiscal_email: item.fiscal_email || '',
      cost_center: item.cost_center || '',
      billing_instructions: item.billing_instructions || '',
      notes: item.notes || '',
      active: item.active !== false,
    });
  }

  async function handleSaveBillingProfile(event: React.FormEvent) {
    event.preventDefault();
    if (!billingProfileForm.company_id || !billingProfileForm.name.trim()) {
      toast.error('Selecione empresa e nome do perfil.');
      return;
    }
    setSavingBillingProfile(true);
    try {
      const payload = {
        company_id: billingProfileForm.company_id,
        name: billingProfileForm.name.trim(),
        legal_name: billingProfileForm.legal_name.trim() || null,
        cnpj: billingProfileForm.cnpj.trim() || null,
        fiscal_address: billingProfileForm.fiscal_address.trim() || null,
        fiscal_email: billingProfileForm.fiscal_email.trim() || null,
        cost_center: billingProfileForm.cost_center.trim() || null,
        billing_instructions: billingProfileForm.billing_instructions.trim() || null,
        notes: billingProfileForm.notes.trim() || null,
        active: billingProfileForm.active,
        updated_at: new Date().toISOString(),
      };
      const { error } = billingProfileForm.id
        ? await supabase.from('company_billing_profiles').update(payload).eq('id', billingProfileForm.id)
        : await supabase.from('company_billing_profiles').insert([payload]);
      if (error) throw error;
      toast.success(billingProfileForm.id ? 'Perfil atualizado.' : 'Perfil criado.');
      setBillingProfileForm(emptyBillingProfileForm);
      await fetchCadastroData();
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao salvar perfil fiscal.');
    } finally {
      setSavingBillingProfile(false);
    }
  }

  const adminTabs: Array<{ id: CadastroTab; label: string; icon: ComponentType<{ className?: string }>; metric: string }> = [
    { id: 'user', label: 'Usuario PMS', icon: UserPlus, metric: `${users.length} usuarios` },
    { id: 'company', label: 'Empresa', icon: Building2, metric: `${companies.length} empresas` },
    { id: 'telegram', label: 'Telegram', icon: ShieldCheck, metric: 'bot' },
  ];
  const channelTabs: Array<{ id: CadastroTab; label: string; icon: ComponentType<{ className?: string }>; metric: string }> = [
    { id: 'link', label: 'Vinculos', icon: Link2, metric: `${linkedClients}/${clients.length} clientes` },
    { id: 'voucher', label: 'Voucher B2B', icon: Save, metric: `${billingProfiles.length} perfis` },
  ];
  const tabs = mode === 'channel' ? channelTabs : adminTabs;

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
              {mode === 'channel'
                ? 'Gerencie vinculos corporativos e os dados usados nos vouchers B2B do Reservas Channel.'
                : 'Crie usuarios, empresas e acessos Telegram em um fluxo unico de configuracao.'}
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

              <div className="min-w-0 rounded-2xl border border-neutral-200 bg-neutral-50 p-3 sm:p-4">
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
                <div className="min-w-0 rounded-xl bg-white">
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
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(360px,0.85fr)_minmax(0,1.15fr)]">
          <form onSubmit={handleSaveCompany} className="min-w-0 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Empresa</p>
                <h3 className="mt-1 text-xl font-black text-neutral-950 sm:text-2xl">
                  {editingCompanyId ? 'Editar cadastro corporativo' : 'Cadastro corporativo'}
                </h3>
              </div>
              <span className="w-fit rounded-full bg-neutral-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-neutral-500 ring-1 ring-neutral-200">Parser e faturamento</span>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <CadastroText label="Nome da empresa" value={companyForm.name} onChange={value => setCompanyForm(prev => ({ ...prev, name: value }))} required />
              <CadastroText label="CNPJ" value={companyForm.cnpj} onChange={value => setCompanyForm(prev => ({ ...prev, cnpj: value }))} />
              <CadastroText label="E-mail financeiro" value={companyForm.email} onChange={value => setCompanyForm(prev => ({ ...prev, email: value }))} />
              <CadastroText label="Dominio de e-mail" value={companyForm.emailDomain} onChange={value => setCompanyForm(prev => ({ ...prev, emailDomain: value }))} />
              <CadastroText label="Telefone" value={companyForm.phone} onChange={value => setCompanyForm(prev => ({ ...prev, phone: value }))} />
              <CadastroText label="Slug" value={companyForm.slug} onChange={value => setCompanyForm(prev => ({ ...prev, slug: value }))} />
              <label className="space-y-1 sm:col-span-2 xl:col-span-1">
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
              <label className="space-y-1 sm:col-span-2 xl:col-span-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Aliases do parser</span>
                <input value={companyForm.aliases} onChange={event => setCompanyForm(prev => ({ ...prev, aliases: event.target.value }))} placeholder="nomes alternativos separados por virgula" className={plainInputClass} />
              </label>
              <label className="flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 sm:col-span-2 xl:col-span-1">
                <input
                  type="checkbox"
                  checked={companyForm.parserBlocked}
                  onChange={event => setCompanyForm(prev => ({ ...prev, parserBlocked: event.target.checked }))}
                  className="mt-1 h-4 w-4 rounded border-red-200 text-red-600"
                />
                <span className="min-w-0">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-red-700">Bloquear parser de reservas</span>
                  <span className="mt-1 block text-xs font-bold leading-5 text-red-700/80">
                    Quando ativo, o bot identifica a empresa, recusa o fluxo automatico e responde com a mensagem configurada.
                  </span>
                </span>
              </label>
              {companyForm.parserBlocked && (
                <>
                  <label className="space-y-1 sm:col-span-2 xl:col-span-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Motivo interno do bloqueio</span>
                    <textarea
                      value={companyForm.parserBlockReason}
                      onChange={event => setCompanyForm(prev => ({ ...prev, parserBlockReason: event.target.value }))}
                      placeholder="Ex: Empresa com faturamento suspenso por pendencias financeiras."
                      className={`${plainInputClass} min-h-24 resize-y`}
                    />
                  </label>
                  <label className="space-y-1 sm:col-span-2 xl:col-span-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Resposta automatica do bot</span>
                    <textarea
                      value={companyForm.parserBlockReply}
                      onChange={event => setCompanyForm(prev => ({ ...prev, parserBlockReply: event.target.value }))}
                      placeholder="Mensagem enviada ao solicitante. Se ficar vazia, o sistema usa uma resposta padrao."
                      className={`${plainInputClass} min-h-28 resize-y`}
                    />
                  </label>
                </>
              )}
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button type="submit" disabled={savingCompany} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-neutral-950 px-4 py-3 text-sm font-black uppercase tracking-widest text-white transition hover:bg-neutral-800 disabled:opacity-60">
                {savingCompany ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
                {editingCompanyId ? 'Salvar alteracoes' : 'Cadastrar empresa'}
              </button>
              {editingCompanyId && (
                <button type="button" onClick={resetCompanyForm} className="flex w-full items-center justify-center rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm font-black uppercase tracking-widest text-neutral-600 transition hover:border-neutral-400 hover:text-neutral-950 sm:w-auto">
                  Cancelar
                </button>
              )}
            </div>
          </form>

          <section className="min-w-0 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Empresas cadastradas</p>
                <h3 className="mt-1 text-xl font-black text-neutral-950 sm:text-2xl">
                  Consulte a base corporativa
                </h3>
                <p className="mt-1 text-sm font-bold text-neutral-500">
                  {filteredCompanies.length} de {companies.length} empresas
                </p>
              </div>
              <div className="relative w-full lg:w-80">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <input
                  value={companySearch}
                  onChange={event => setCompanySearch(event.target.value)}
                  placeholder="Buscar nome, CNPJ, e-mail..."
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-neutral-900 focus:bg-white"
                />
              </div>
            </div>

            <div className="mt-5 grid max-h-[620px] grid-cols-1 gap-3 overflow-y-auto pr-1 xl:grid-cols-2">
              {visibleCompanies.map(company => (
                <CompanyCard key={company.id} company={company} onEdit={handleEditCompany} />
              ))}
              {!visibleCompanies.length && (
                <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-6 text-center text-sm font-bold text-neutral-400 xl:col-span-2">
                  Nenhuma empresa encontrada.
                </div>
              )}
            </div>

            {hiddenCompanyCount > 0 && (
              <button
                type="button"
                onClick={() => setCompanyListLimit(prev => prev + 80)}
                className="mt-4 flex w-full items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs font-black uppercase tracking-widest text-neutral-600 transition hover:border-neutral-400 hover:bg-white hover:text-neutral-950"
              >
                Mostrar mais {Math.min(80, hiddenCompanyCount)} empresas
              </button>
            )}
          </section>
        </div>
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

      {activeTab === 'voucher' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.1fr)]">
          <form onSubmit={handleSaveVoucherHotelProfile} className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Dados oficiais</p>
            <h3 className="mt-1 text-xl font-black text-neutral-950 sm:text-2xl">Hotel no voucher</h3>
            <p className="mt-2 text-sm font-bold leading-6 text-neutral-500">Essas informacoes aparecem no preview e PDF da autorizacao corporativa.</p>
            <div className="mt-5 grid gap-3">
              <CadastroText label="Nome fantasia" value={hotelProfile.trade_name || ''} onChange={value => setHotelProfile(prev => ({ ...prev, trade_name: value }))} required />
              <CadastroText label="Razao social" value={hotelProfile.legal_name || ''} onChange={value => setHotelProfile(prev => ({ ...prev, legal_name: value }))} />
              <CadastroText label="CNPJ" value={hotelProfile.cnpj || ''} onChange={value => setHotelProfile(prev => ({ ...prev, cnpj: value }))} />
              <CadastroText label="Telefone" value={hotelProfile.phone || ''} onChange={value => setHotelProfile(prev => ({ ...prev, phone: value }))} />
              <CadastroText label="E-mail" value={hotelProfile.email || ''} onChange={value => setHotelProfile(prev => ({ ...prev, email: value }))} />
              <CadastroText label="Site" value={hotelProfile.website || ''} onChange={value => setHotelProfile(prev => ({ ...prev, website: value }))} />
              <CadastroText label="Logo URL" value={hotelProfile.logo_url || ''} onChange={value => setHotelProfile(prev => ({ ...prev, logo_url: value }))} />
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Endereco</span>
                <textarea value={hotelProfile.address || ''} onChange={event => setHotelProfile(prev => ({ ...prev, address: event.target.value }))} className={`${plainInputClass} min-h-20 resize-y`} />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Observacoes institucionais</span>
                <textarea value={hotelProfile.notes || ''} onChange={event => setHotelProfile(prev => ({ ...prev, notes: event.target.value }))} className={`${plainInputClass} min-h-24 resize-y`} />
              </label>
              <button type="submit" disabled={savingVoucher} className="flex items-center justify-center gap-2 rounded-2xl bg-neutral-950 px-4 py-3 text-sm font-black uppercase tracking-widest text-white disabled:opacity-60">
                {savingVoucher ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar dados do hotel
              </button>
            </div>
          </form>

          <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Empresas</p>
            <h3 className="mt-1 text-xl font-black text-neutral-950 sm:text-2xl">Perfis fiscais e centros de custo</h3>
            <form onSubmit={handleSaveBillingProfile} className="mt-5 grid gap-3 lg:grid-cols-2">
              <label className="space-y-1 lg:col-span-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Empresa</span>
                <select value={billingProfileForm.company_id} onChange={event => setBillingProfileForm(prev => ({ ...prev, company_id: event.target.value }))} className={selectClass} required>
                  <option value="">Selecione</option>
                  {companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
                </select>
              </label>
              <CadastroText label="Nome do perfil" value={billingProfileForm.name} onChange={value => setBillingProfileForm(prev => ({ ...prev, name: value }))} required />
              <CadastroText label="Centro de custo" value={billingProfileForm.cost_center} onChange={value => setBillingProfileForm(prev => ({ ...prev, cost_center: value }))} />
              <CadastroText label="Razao social / tomador" value={billingProfileForm.legal_name} onChange={value => setBillingProfileForm(prev => ({ ...prev, legal_name: value }))} />
              <CadastroText label="CNPJ tomador" value={billingProfileForm.cnpj} onChange={value => setBillingProfileForm(prev => ({ ...prev, cnpj: value }))} />
              <CadastroText label="E-mail fiscal" value={billingProfileForm.fiscal_email} onChange={value => setBillingProfileForm(prev => ({ ...prev, fiscal_email: value }))} />
              <label className="flex items-center gap-3 rounded-2xl bg-neutral-50 p-4 ring-1 ring-neutral-200">
                <input type="checkbox" checked={billingProfileForm.active} onChange={event => setBillingProfileForm(prev => ({ ...prev, active: event.target.checked }))} />
                <span className="text-xs font-black uppercase tracking-widest text-neutral-600">Perfil ativo para cliente</span>
              </label>
              <label className="space-y-1 lg:col-span-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Endereco fiscal</span>
                <textarea value={billingProfileForm.fiscal_address} onChange={event => setBillingProfileForm(prev => ({ ...prev, fiscal_address: event.target.value }))} className={`${plainInputClass} min-h-20 resize-y`} />
              </label>
              <label className="space-y-1 lg:col-span-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Instrucoes de faturamento</span>
                <textarea value={billingProfileForm.billing_instructions} onChange={event => setBillingProfileForm(prev => ({ ...prev, billing_instructions: event.target.value }))} className={`${plainInputClass} min-h-24 resize-y`} />
              </label>
              <label className="space-y-1 lg:col-span-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Observacoes internas</span>
                <textarea value={billingProfileForm.notes} onChange={event => setBillingProfileForm(prev => ({ ...prev, notes: event.target.value }))} className={`${plainInputClass} min-h-20 resize-y`} />
              </label>
              <div className="flex gap-2 lg:col-span-2">
                <button type="submit" disabled={savingBillingProfile} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-neutral-950 px-4 py-3 text-sm font-black uppercase tracking-widest text-white disabled:opacity-60">
                  {savingBillingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {billingProfileForm.id ? 'Salvar perfil' : 'Criar perfil'}
                </button>
                {billingProfileForm.id && (
                  <button type="button" onClick={() => setBillingProfileForm(emptyBillingProfileForm)} className="rounded-2xl border border-neutral-200 px-4 py-3 text-sm font-black uppercase tracking-widest text-neutral-600">
                    Cancelar
                  </button>
                )}
              </div>
            </form>

            <div className="mt-6 grid gap-3">
              {billingProfiles.map(item => (
                <button key={item.id} type="button" onClick={() => editBillingProfile(item)} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-left transition hover:border-neutral-400 hover:bg-white">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-neutral-950">{item.name}</p>
                      <p className="mt-1 text-xs font-bold text-neutral-500">{companies.find(company => company.id === item.company_id)?.name || 'Empresa'} - {item.cost_center || 'Sem CC'}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest ${item.active ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-200 text-neutral-600'}`}>
                      {item.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  <p className="mt-2 text-xs font-bold leading-5 text-neutral-500">{item.legal_name || item.cnpj || item.fiscal_email || 'Sem dados fiscais adicionais'}</p>
                </button>
              ))}
              {!billingProfiles.length && (
                <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-6 text-center text-sm font-bold text-neutral-400">
                  Nenhum perfil fiscal cadastrado.
                </div>
              )}
            </div>
          </section>
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

function CompanyCard({ company, onEdit }: { company: Company; onEdit: (company: Company) => void }) {
  const normalizedStatus = (company.status || 'active').toLowerCase();
  const active = normalizedStatus !== 'inactive';
  const emailDomain = company.email_domain;
  const parserAliases = company.parser_aliases ?? [];
  const parserBlocked = Boolean(company.reservation_parser_blocked);

  return (
    <article className="min-w-0 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 transition hover:border-neutral-300 hover:bg-white">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-neutral-950">{company.name}</p>
          <p className="mt-1 truncate text-xs font-bold text-neutral-500">{company.cnpj || 'CNPJ nao informado'}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest ${
            active ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-neutral-200 text-neutral-600 ring-1 ring-neutral-300'
          }`}>
            {active ? 'Ativa' : 'Inativa'}
          </span>
          {parserBlocked && (
            <span className="rounded-full bg-red-50 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-red-700 ring-1 ring-red-100">
              Parser bloqueado
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-2 text-xs font-bold text-neutral-500">
        <div className="flex min-w-0 items-center gap-2">
          <Mail className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
          <span className="truncate">{company.email || emailDomain || 'E-mail nao informado'}</span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <Phone className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
          <span className="truncate">{company.phone || 'Telefone nao informado'}</span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <Building2 className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
          <span className="truncate">{company.address || company.slug || 'Endereco nao informado'}</span>
        </div>
      </div>

      {parserAliases.length > 0 && (
        <div className="mt-3 flex min-w-0 flex-wrap gap-1.5">
          {parserAliases.slice(0, 3).map(alias => (
            <span key={alias} className="max-w-full truncate rounded-full bg-white px-2 py-1 text-[10px] font-bold text-neutral-500 ring-1 ring-neutral-200">
              {alias}
            </span>
          ))}
          {parserAliases.length > 3 && (
            <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-neutral-400 ring-1 ring-neutral-200">
              +{parserAliases.length - 3}
            </span>
          )}
        </div>
      )}

      {parserBlocked && (
        <div className="mt-3 rounded-xl bg-red-50 p-3 text-xs font-bold leading-5 text-red-700 ring-1 ring-red-100">
          {company.reservation_parser_block_reason || 'Sem motivo interno informado.'}
        </div>
      )}

      <button
        type="button"
        onClick={() => onEdit(company)}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-600 ring-1 ring-neutral-200 transition hover:text-neutral-950 hover:ring-neutral-400"
      >
        <Pencil className="h-3.5 w-3.5" />
        Editar cadastro
      </button>
    </article>
  );
}
