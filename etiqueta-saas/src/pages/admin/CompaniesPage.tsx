import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Company } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';

export function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [active, setActive] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('name');
    setLoading(false);
    if (error) {
      toast.error('Erro ao carregar empresas: ' + error.message);
      return;
    }
    setCompanies((data as Company[] | null) ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setName('');
    setCnpj('');
    setAddress('');
    setPhone('');
    setActive(true);
    setModalOpen(true);
  }

  function openEdit(c: Company) {
    setEditing(c);
    setName(c.name);
    setCnpj(c.cnpj ?? '');
    setAddress(c.address ?? '');
    setPhone(c.phone ?? '');
    setActive(c.active);
    setModalOpen(true);
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error('Informe o nome da empresa.');
      return;
    }
    setSaving(true);
    const payload = {
      name: name.trim(),
      cnpj: cnpj.trim() || null,
      address: address.trim() || null,
      phone: phone.trim() || null,
      active,
    };
    const { error } = editing
      ? await supabase.from('companies').update(payload).eq('id', editing.id)
      : await supabase.from('companies').insert(payload);
    setSaving(false);
    if (error) {
      toast.error('Erro ao salvar: ' + error.message);
      return;
    }
    toast.success(editing ? 'Empresa atualizada.' : 'Empresa criada.');
    setModalOpen(false);
    void load();
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-800 sm:text-2xl">
            Empresas
          </h1>
          <p className="text-sm text-neutral-500">
            Propriedades / clientes que usam o sistema.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={18} />
          Nova empresa
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8" />
        </div>
      ) : companies.length === 0 ? (
        <Card>
          <p className="text-sm text-neutral-600">
            Nenhuma empresa cadastrada ainda.
          </p>
        </Card>
      ) : (
        <Card className="!p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs uppercase text-neutral-500">
                  <th className="px-4 py-3">Empresa</th>
                  <th className="px-4 py-3">CNPJ</th>
                  <th className="px-4 py-3">Telefone</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-neutral-100 last:border-0"
                  >
                    <td className="px-4 py-3 font-medium text-neutral-800">
                      {c.name}
                    </td>
                    <td className="px-4 py-3 text-neutral-600">
                      {c.cnpj ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-neutral-600">
                      {c.phone ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          c.active
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-neutral-100 text-neutral-500'
                        }`}
                      >
                        {c.active ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <button
                          onClick={() => openEdit(c)}
                          aria-label="Editar"
                          className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100"
                        >
                          <Pencil size={16} />
                        </button>
                      </div>
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
        title={editing ? 'Editar empresa' : 'Nova empresa'}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setModalOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button onClick={handleSave} loading={saving}>
              Salvar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            id="co-name"
            label="Nome da empresa"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            id="co-cnpj"
            label="CNPJ (opcional)"
            value={cnpj}
            onChange={(e) => setCnpj(e.target.value)}
          />
          <Input
            id="co-address"
            label="Endereco (opcional)"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <Input
            id="co-phone"
            label="Telefone (opcional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4 accent-emerald-600"
            />
            Empresa ativa
          </label>
        </div>
      </Modal>
    </div>
  );
}
