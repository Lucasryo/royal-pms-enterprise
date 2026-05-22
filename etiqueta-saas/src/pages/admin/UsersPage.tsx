import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Company, UserRole } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';

interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
  role: UserRole;
  active: boolean;
  company_id: string | null;
  companies: { name: string } | null;
}

const ROLE_LABELS: Record<UserRole, string> = {
  master: 'Master',
  property: 'Usuario da empresa',
};

export function UsersPage() {
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('property');
  const [companyId, setCompanyId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [usersRes, companiesRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, email, role, active, company_id, companies(name)')
        .order('full_name'),
      supabase.from('companies').select('*').eq('active', true).order('name'),
    ]);
    setLoading(false);
    if (usersRes.error) {
      toast.error('Erro ao carregar usuarios: ' + usersRes.error.message);
      return;
    }
    setUsers((usersRes.data as unknown as ProfileRow[] | null) ?? []);
    setCompanies((companiesRes.data as Company[] | null) ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setFullName('');
    setEmail('');
    setPassword('');
    setRole('property');
    setCompanyId(companies[0]?.id ?? '');
    setModalOpen(true);
  }

  async function handleCreate() {
    if (!fullName.trim() || !email.trim()) {
      toast.error('Informe nome e e-mail.');
      return;
    }
    if (password.length < 6) {
      toast.error('A senha deve ter ao menos 6 caracteres.');
      return;
    }
    if (role === 'property' && !companyId) {
      toast.error('Selecione a empresa do usuario.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.functions.invoke('admin-create-user', {
      body: {
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        role,
        company_id: role === 'property' ? companyId : null,
      },
    });
    setSaving(false);
    if (error) {
      toast.error('Erro ao criar usuario: ' + error.message);
      return;
    }
    toast.success('Usuario criado.');
    setModalOpen(false);
    void load();
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-800 sm:text-2xl">
            Usuarios
          </h1>
          <p className="text-sm text-neutral-500">
            Acessos das empresas e do administrador.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={18} />
          Novo usuario
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8" />
        </div>
      ) : users.length === 0 ? (
        <Card>
          <p className="text-sm text-neutral-600">
            Nenhum usuario cadastrado ainda.
          </p>
        </Card>
      ) : (
        <Card className="!p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs uppercase text-neutral-500">
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">E-mail</th>
                  <th className="px-4 py-3">Perfil</th>
                  <th className="px-4 py-3">Empresa</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-neutral-100 last:border-0"
                  >
                    <td className="px-4 py-3 font-medium text-neutral-800">
                      {u.full_name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-neutral-600">
                      {u.email ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-neutral-600">
                      {ROLE_LABELS[u.role]}
                    </td>
                    <td className="px-4 py-3 text-neutral-600">
                      {u.companies?.name ?? (u.role === 'master' ? 'Todas' : '—')}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          u.active
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-neutral-100 text-neutral-500'
                        }`}
                      >
                        {u.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Novo usuario"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setModalOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button onClick={handleCreate} loading={saving}>
              Criar usuario
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            id="u-name"
            label="Nome completo"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          <Input
            id="u-email"
            label="E-mail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
          />
          <Input
            id="u-pass"
            label="Senha inicial"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimo 6 caracteres"
            autoComplete="off"
          />
          <Select
            id="u-role"
            label="Perfil de acesso"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
          >
            <option value="property">Usuario da empresa</option>
            <option value="master">Master (ve todas as empresas)</option>
          </Select>
          {role === 'property' && (
            <Select
              id="u-company"
              label="Empresa"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            >
              <option value="">Selecione...</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </div>
      </Modal>
    </div>
  );
}
