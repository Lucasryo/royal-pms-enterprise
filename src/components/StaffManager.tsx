import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { Company, UserPermissions, UserProfile, UserRole } from '../types';
import { Edit2, Loader2, Plus, Search, Shield, UserCircle, UserPlus, X as CloseIcon } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { logAudit } from '../lib/audit';
import PermissionsSelector from './PermissionsSelector';
import { DEFAULT_PERMISSIONS } from '../lib/defaultPermissions';

type StaffFormMode = 'create' | 'edit';

type StaffFormData = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  phone: string;
  company_id: string;
  status: 'active' | 'inactive';
};

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  reservations: 'Reservas',
  reception: 'Recepção',
  faturamento: 'Faturamento',
  finance: 'Financeiro',
  eventos: 'Eventos',
  restaurant: 'Restaurante',
  housekeeping: 'Governança',
  maintenance: 'Manutenção',
  manager: 'Gerente',
  client: 'Cliente',
  external_client: 'Cliente externo',
  marketing: 'Marketing',
};

const COMPANY_LINKED_ROLES: UserRole[] = ['client', 'external_client', 'reservations'];

const emptyForm: StaffFormData = {
  name: '',
  email: '',
  password: '',
  role: 'reservations',
  phone: '',
  company_id: '',
  status: 'active',
};

export default function StaffManager({ currentUser }: { currentUser: UserProfile }) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formMode, setFormMode] = useState<StaffFormMode>('create');
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState<StaffFormData>(emptyForm);
  const [formPermissions, setFormPermissions] = useState<UserPermissions>(DEFAULT_PERMISSIONS.reservations);

  const canCreateUsers = currentUser.role === 'admin' || currentUser.permissions?.canCreateUsers;

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const [usersRes, companiesRes] = await Promise.all([
      supabase.from('profiles').select('*').order('name'),
      supabase.from('companies').select('*').order('name'),
    ]);

    if (usersRes.error) {
      toast.error('Erro ao carregar equipe');
    } else {
      setUsers(usersRes.data || []);
    }

    if (!companiesRes.error) {
      setCompanies(companiesRes.data || []);
    }

    setLoading(false);
  }

  function openCreateModal() {
    setFormMode('create');
    setEditingUser(null);
    setFormData(emptyForm);
    setFormPermissions(DEFAULT_PERMISSIONS.reservations);
    setIsModalOpen(true);
  }

  function handleEdit(user: UserProfile) {
    setFormMode('edit');
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
      phone: user.phone || '',
      company_id: user.company_id || '',
      status: user.active === false ? 'inactive' : 'active',
    });
    setFormPermissions(user.permissions || DEFAULT_PERMISSIONS[user.role] || DEFAULT_PERMISSIONS.client);
    setIsModalOpen(true);
  }

  function handleRoleChange(role: UserRole) {
    setFormData(prev => ({
      ...prev,
      role,
      company_id: COMPANY_LINKED_ROLES.includes(role) ? prev.company_id : '',
    }));
    setFormPermissions(DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.client);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (formMode === 'create' && !canCreateUsers) {
      toast.error('Seu perfil não pode criar usuários.');
      return;
    }

    if (formMode === 'create' && formData.password.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setSaving(true);

    try {
      if (formMode === 'create') {
        const { data: invokeData, error: invokeError } = await supabase.functions.invoke('admin-create-user', {
          body: {
            email: formData.email.trim(),
            password: formData.password,
            name: formData.name.trim(),
            phone: formData.phone.trim(),
            role: formData.role,
            company_id: COMPANY_LINKED_ROLES.includes(formData.role) ? formData.company_id || null : null,
            permissions: formPermissions,
            active: formData.status === 'active',
          },
        });

        if (invokeError) {
          throw new Error((invokeError as any)?.context?.error || invokeError.message || 'Erro ao cadastrar usuário');
        }
        if (invokeData && (invokeData as any).error) {
          throw new Error((invokeData as any).error);
        }

        toast.success('Usuário cadastrado com sucesso');
        logAudit({
          user_id: currentUser.id,
          user_name: currentUser.name,
          action: 'Cadastro de Usuário',
          details: JSON.stringify({ name: formData.name, email: formData.email, role: formData.role }),
          type: 'user_create',
        });
      } else if (editingUser) {
        const { error } = await supabase
          .from('profiles')
          .update({
            name: formData.name.trim(),
            email: formData.email.trim(),
            role: formData.role,
            phone: formData.phone.trim(),
            company_id: COMPANY_LINKED_ROLES.includes(formData.role) ? formData.company_id || null : null,
            permissions: formPermissions,
            active: formData.status === 'active',
          })
          .eq('id', editingUser.id);

        if (error) throw error;

        toast.success('Usuário atualizado com sucesso');
        logAudit({
          user_id: currentUser.id,
          user_name: currentUser.name,
          action: 'Atualizou usuário',
          details: JSON.stringify({ user: formData.email, role: formData.role }),
          type: 'update',
        });
      }

      setIsModalOpen(false);
      setEditingUser(null);
      await fetchData();
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Erro ao salvar usuário.');
    } finally {
      setSaving(false);
    }
  }

  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const staffCount = users.filter(u => !['client', 'external_client'].includes(u.role)).length;
  const clientCount = users.filter(u => u.role === 'client' || u.role === 'external_client').length;
  const adminCount = users.filter(u => u.role === 'admin' || u.role === 'manager').length;
  const linkedCompanyName = (companyId?: string) => companies.find(c => c.id === companyId)?.name;

  return (
    <div className="space-y-5 overflow-x-clip">
      <div className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-600">Equipe</p>
            <h2 className="mt-1 text-xl font-black text-neutral-950 sm:text-2xl">Acessos e permissões</h2>
            <p className="mt-1 text-sm text-neutral-500">Crie usuários, defina o perfil base e ajuste permissões individuais de forma granular.</p>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            disabled={!canCreateUsers}
            className="flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-neutral-950 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white shadow-sm transition-all hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300 sm:w-auto"
          >
            <UserPlus className="h-4 w-4" />
            Novo usuário
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StaffKpi label="Usuários" value={users.length} />
          <StaffKpi label="Equipe" value={staffCount} />
          <StaffKpi label="Clientes" value={clientCount} />
          <StaffKpi label="Gestão" value={adminCount} />
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Busca</p>
          <h3 className="mt-1 text-base font-black text-neutral-950">Localizar usuário</h3>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Buscar por nome ou e-mail..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 py-3 pl-10 pr-4 text-sm outline-none transition-all focus:border-neutral-900 focus:bg-white"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-neutral-50 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-6 py-4">Usuário</th>
                <th className="px-6 py-4">Perfil</th>
                <th className="px-6 py-4">Empresa</th>
                <th className="px-6 py-4">Contato</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm font-bold text-neutral-400">
                    <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
                    Carregando equipe
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm font-bold text-neutral-400">
                    Nenhum usuário encontrado
                  </td>
                </tr>
              ) : filteredUsers.map(user => (
                <tr key={user.id} data-focus-id={user.id} className="transition-colors hover:bg-neutral-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-white">
                        <UserCircle className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-neutral-900">{user.name}</p>
                        <p className="text-xs text-neutral-500">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="border-l border-neutral-100 px-6 py-4">
                    <RoleBadge role={user.role} />
                  </td>
                  <td className="px-6 py-4 text-sm text-neutral-500">
                    {linkedCompanyName(user.company_id) || 'Não vinculada'}
                  </td>
                  <td className="px-6 py-4 text-sm text-neutral-500">
                    {user.phone || 'Não informado'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`flex items-center gap-1.5 text-xs font-bold ${user.active === false ? 'text-red-600' : 'text-green-600'}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${user.active === false ? 'bg-red-600' : 'bg-green-600'}`} />
                      {user.active === false ? 'Inativo' : 'Ativo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => handleEdit(user)} className="rounded-lg p-2 text-neutral-400 transition-all hover:bg-neutral-50 hover:text-neutral-900">
                      <Edit2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-neutral-100 p-4 sm:p-6">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">
                  {formMode === 'create' ? 'Novo acesso' : 'Ajuste de acesso'}
                </p>
                <h3 className="mt-1 text-lg font-black text-neutral-900">
                  {formMode === 'create' ? 'Cadastrar usuário' : 'Editar permissões'}
                </h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="rounded-full p-2 transition-colors hover:bg-neutral-100">
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="max-h-[78vh] space-y-5 overflow-y-auto p-4 sm:p-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Nome completo">
                  <input
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900/10"
                  />
                </Field>

                <Field label="E-mail">
                  <input
                    required
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900/10"
                  />
                </Field>

                <Field label="Telefone / WhatsApp">
                  <input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900/10"
                  />
                </Field>

                {formMode === 'create' && (
                  <Field label="Senha inicial">
                    <input
                      required
                      type="password"
                      minLength={6}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900/10"
                      placeholder="Mínimo 6 caracteres"
                    />
                  </Field>
                )}

                <Field label="Perfil base">
                  <select
                    value={formData.role}
                    onChange={(e) => handleRoleChange(e.target.value as UserRole)}
                    className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900/10"
                  >
                    {Object.entries(ROLE_LABELS).map(([role, label]) => (
                      <option key={role} value={role}>{label}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Status">
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as StaffFormData['status'] })}
                    className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900/10"
                  >
                    <option value="active">Ativo</option>
                    <option value="inactive">Inativo</option>
                  </select>
                </Field>

                {COMPANY_LINKED_ROLES.includes(formData.role) && (
                  <Field label="Empresa vinculada">
                    <select
                      value={formData.company_id}
                      onChange={(e) => setFormData({ ...formData, company_id: e.target.value })}
                      className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-900/10"
                    >
                      <option value="">Sem empresa</option>
                      {companies.map(company => (
                        <option key={company.id} value={company.id}>{company.name}</option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Permissões granulares</p>
                    <h4 className="text-sm font-black text-neutral-950">Ajuste fino por módulo</h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormPermissions(DEFAULT_PERMISSIONS[formData.role] || DEFAULT_PERMISSIONS.client)}
                    className="text-left text-xs font-black uppercase tracking-widest text-neutral-500 hover:text-neutral-950 sm:text-right"
                  >
                    Restaurar padrão do perfil
                  </button>
                </div>
                <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-3">
                  <PermissionsSelector
                    permissions={formPermissions}
                    onChange={setFormPermissions}
                    role={formData.role}
                  />
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-neutral-100 pt-4 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 rounded-xl px-4 py-2 text-sm font-bold text-neutral-600 transition-all hover:bg-neutral-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-sm font-bold text-white transition-all hover:bg-neutral-800 disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : formMode === 'create' ? <Plus className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                  {formMode === 'create' ? 'Cadastrar usuário' : 'Salvar alterações'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function RoleBadge({ role }: { role: UserRole }) {
  const badgeClass =
    role === 'admin' ? 'bg-purple-100 text-purple-700' :
    role === 'reservations' ? 'bg-blue-100 text-blue-700' :
    role === 'faturamento' || role === 'finance' ? 'bg-emerald-100 text-emerald-700' :
    role === 'restaurant' ? 'bg-orange-100 text-orange-700' :
    role === 'housekeeping' ? 'bg-sky-100 text-sky-700' :
    role === 'maintenance' ? 'bg-red-100 text-red-700' :
    role === 'manager' ? 'bg-indigo-100 text-indigo-700' :
    role === 'external_client' ? 'bg-amber-100 text-amber-700' :
    'bg-neutral-100 text-neutral-600';

  return (
    <span className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase ${badgeClass}`}>
      {ROLE_LABELS[role] || role}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold uppercase text-neutral-500">{label}</label>
      {children}
    </div>
  );
}

function StaffKpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
      <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400">{label}</p>
      <p className="mt-2 text-xl font-black tabular-nums text-neutral-950 sm:text-2xl">{value}</p>
    </div>
  );
}
