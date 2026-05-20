import { useMemo, useState } from 'react';
import { BarChart3, BedDouble, BriefcaseBusiness, Building2, Check, Circle, CreditCard, Gauge, Hotel, RotateCcw, Search, ShieldCheck, SlidersHorizontal, Sparkles, Users, Utensils, Wrench, X } from 'lucide-react';
import { UserPermissions } from '../types';
import { DEFAULT_PERMISSIONS } from '../lib/defaultPermissions';

interface PermissionsSelectorProps {
  permissions: UserPermissions;
  onChange: (permissions: UserPermissions) => void;
  role: string;
}

type PermissionKey = keyof UserPermissions;

type PermissionItem = {
  key: PermissionKey;
  label: string;
  detail: string;
  level?: 'view' | 'create' | 'manage' | 'risk';
};

type PermissionGroup = {
  id: string;
  title: string;
  description: string;
  icon: typeof Gauge;
  permissions: PermissionItem[];
};

const permissionGroups: PermissionGroup[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    description: 'Tela inicial e indicadores gerais.',
    icon: Gauge,
    permissions: [
      { key: 'canViewDashboard', label: 'Ver dashboard', detail: 'Libera a visao inicial do PMS.', level: 'view' },
    ],
  },
  {
    id: 'reservations',
    title: 'Reservas',
    description: 'Central de reservas, voucher e alteracoes de estadia.',
    icon: BedDouble,
    permissions: [
      { key: 'canViewReservations', label: 'Ver reservas', detail: 'Consulta reservas e disponibilidade.', level: 'view' },
      { key: 'canCreateReservations', label: 'Criar reservas', detail: 'Permite inserir novas reservas.', level: 'create' },
      { key: 'canEditReservations', label: 'Editar reservas', detail: 'Altera dados de reservas existentes.', level: 'manage' },
      { key: 'canCancelReservations', label: 'Cancelar reservas', detail: 'Cancela reservas e impacta ocupacao.', level: 'risk' },
      { key: 'canPrintVouchers', label: 'Imprimir vouchers', detail: 'Gera voucher para hospede ou empresa.', level: 'view' },
    ],
  },
  {
    id: 'frontdesk',
    title: 'Recepcao',
    description: 'Check-in, checkout, folio e movimentacoes do hospede.',
    icon: Hotel,
    permissions: [
      { key: 'canPerformCheckIn', label: 'Fazer check-in', detail: 'Entrada do hospede na UH.', level: 'manage' },
      { key: 'canPerformCheckOut', label: 'Fazer checkout', detail: 'Saida e encerramento da conta.', level: 'manage' },
      { key: 'canCreateWalkIn', label: 'Criar walk-in', detail: 'Cria passante direto na recepcao.', level: 'create' },
      { key: 'canManageFolio', label: 'Gerenciar folio', detail: 'Inclui lancamentos e ajustes na conta.', level: 'manage' },
      { key: 'canRemoveFolioCharges', label: 'Estornar lancamentos', detail: 'Remove cobrancas do folio.', level: 'risk' },
      { key: 'canReopenAccounts', label: 'Reabrir contas', detail: 'Reabre contas ja fechadas.', level: 'risk' },
      { key: 'canTransferRoom', label: 'Transferir UH', detail: 'Troca hospede de quarto.', level: 'manage' },
      { key: 'canTransferCharges', label: 'Transferir cobrancas', detail: 'Move lancamentos entre contas.', level: 'risk' },
      { key: 'canIssueHospitalityStatement', label: 'Emitir nota de hospedagem', detail: 'Gera extrato/nota operacional.', level: 'manage' },
    ],
  },
  {
    id: 'operations',
    title: 'Operacao',
    description: 'Governanca, manutencao, operacoes, POS e ferramentas profissionais.',
    icon: Wrench,
    permissions: [
      { key: 'canViewHousekeeping', label: 'Ver governanca', detail: 'Consulta status de UHs e limpeza.', level: 'view' },
      { key: 'canManageHousekeeping', label: 'Gerenciar governanca', detail: 'Altera UHs, limpeza e rotinas.', level: 'manage' },
      { key: 'canViewOperations', label: 'Ver operacoes', detail: 'Consulta operacao e chamados.', level: 'view' },
      { key: 'canManageOperations', label: 'Gerenciar operacoes', detail: 'Executa acoes operacionais.', level: 'manage' },
      { key: 'canViewPOS', label: 'Ver POS', detail: 'Consulta lancamentos do restaurante.', level: 'view' },
      { key: 'canManagePOS', label: 'Operar POS', detail: 'Cria e altera lancamentos do POS.', level: 'manage' },
      { key: 'canViewProfessionalTools', label: 'Ver gestao pro', detail: 'Acessa ferramentas avancadas.', level: 'view' },
      { key: 'canManageProfessionalTools', label: 'Gerenciar gestao pro', detail: 'Altera ferramentas avancadas.', level: 'risk' },
    ],
  },
  {
    id: 'events',
    title: 'Eventos',
    description: 'O.S., agendas, cotacoes e execucao de eventos.',
    icon: BriefcaseBusiness,
    permissions: [
      { key: 'canViewEvents', label: 'Ver eventos', detail: 'Consulta agenda e eventos.', level: 'view' },
      { key: 'canCreateEvents', label: 'Criar eventos', detail: 'Abre novas O.S. e agendas.', level: 'create' },
      { key: 'canEditEvents', label: 'Editar eventos', detail: 'Altera eventos existentes.', level: 'manage' },
      { key: 'canCancelEvents', label: 'Cancelar eventos', detail: 'Cancela eventos e agendas.', level: 'risk' },
    ],
  },
  {
    id: 'entities',
    title: 'Hospedes e empresas',
    description: 'Cadastros de hospedes, empresas e clientes corporativos.',
    icon: Building2,
    permissions: [
      { key: 'canViewGuests', label: 'Ver hospedes', detail: 'Consulta base de hospedes.', level: 'view' },
      { key: 'canViewCompanies', label: 'Ver empresas', detail: 'Consulta empresas cadastradas.', level: 'view' },
      { key: 'canCreateCompanies', label: 'Criar empresas', detail: 'Cria clientes corporativos.', level: 'create' },
    ],
  },
  {
    id: 'finance',
    title: 'Financeiro',
    description: 'Faturamento, arquivos, contas bancarias e cobrancas.',
    icon: CreditCard,
    permissions: [
      { key: 'canViewFinance', label: 'Ver financeiro', detail: 'Acessa paineis financeiros.', level: 'view' },
      { key: 'canUploadFiles', label: 'Enviar arquivos', detail: 'Publica documentos para clientes.', level: 'create' },
      { key: 'canDownloadFiles', label: 'Baixar arquivos', detail: 'Baixa documentos financeiros.', level: 'view' },
      { key: 'canViewBankAccounts', label: 'Ver contas bancarias', detail: 'Consulta dados bancarios do PMS.', level: 'risk' },
    ],
  },
  {
    id: 'pricing',
    title: 'Tarifas e rastreio',
    description: 'Tarifas corporativas, tracking e cobrancas especiais.',
    icon: BarChart3,
    permissions: [
      { key: 'canViewTariffs', label: 'Ver tarifas', detail: 'Consulta tarifas e acordos.', level: 'view' },
      { key: 'canEditTariffs', label: 'Editar tarifas', detail: 'Altera valores e regras comerciais.', level: 'risk' },
      { key: 'canViewTracking', label: 'Ver rastreio', detail: 'Consulta rastreio e cobranca.', level: 'view' },
    ],
  },
  {
    id: 'admin',
    title: 'Administracao',
    description: 'Equipe, usuarios e controles administrativos.',
    icon: ShieldCheck,
    permissions: [
      { key: 'canViewStaff', label: 'Ver equipe', detail: 'Consulta equipe e acessos.', level: 'view' },
      { key: 'canCreateUsers', label: 'Criar usuarios', detail: 'Cria novos acessos PMS.', level: 'risk' },
    ],
  },
];

const levelStyle = {
  view: 'bg-sky-50 text-sky-700 ring-sky-100',
  create: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  manage: 'bg-amber-50 text-amber-700 ring-amber-100',
  risk: 'bg-red-50 text-red-700 ring-red-100',
};

const levelLabel = {
  view: 'ver',
  create: 'criar',
  manage: 'operar',
  risk: 'critico',
};

export default function PermissionsSelector({ permissions, onChange, role }: PermissionsSelectorProps) {
  const [activeGroupId, setActiveGroupId] = useState(permissionGroups[0].id);
  const [query, setQuery] = useState('');
  const [showOnlyChanges, setShowOnlyChanges] = useState(false);

  const defaultPermissions = DEFAULT_PERMISSIONS[role as keyof typeof DEFAULT_PERMISSIONS] || DEFAULT_PERMISSIONS.client;
  const allKeys = permissionGroups.flatMap(group => group.permissions.map(permission => permission.key));
  const enabledCount = allKeys.filter(key => permissions?.[key]).length;
  const changedCount = allKeys.filter(key => permissions?.[key] !== defaultPermissions[key]).length;
  const totalCount = allKeys.length;
  const activeGroup = permissionGroups.find(group => group.id === activeGroupId) || permissionGroups[0];
  const coverage = Math.round((enabledCount / totalCount) * 100);
  const queryTerm = query.trim().toLowerCase();

  const visiblePermissions = useMemo(() => {
    return activeGroup.permissions.filter(permission => {
      const matchesQuery = !queryTerm ||
        permission.label.toLowerCase().includes(queryTerm) ||
        permission.detail.toLowerCase().includes(queryTerm);
      const matchesChanges = !showOnlyChanges || permissions[permission.key] !== defaultPermissions[permission.key];
      return matchesQuery && matchesChanges;
    });
  }, [activeGroup, defaultPermissions, permissions, queryTerm, showOnlyChanges]);

  if (!permissions) return <div className="py-2 text-xs text-neutral-400">Carregando permissoes...</div>;

  function setPermission(key: PermissionKey, value: boolean) {
    onChange({ ...permissions, [key]: value });
  }

  function applyGroup(value: boolean) {
    const next = { ...permissions };
    activeGroup.permissions.forEach(permission => {
      next[permission.key] = value;
    });
    onChange(next);
  }

  function restoreGroup() {
    const next = { ...permissions };
    activeGroup.permissions.forEach(permission => {
      next[permission.key] = defaultPermissions[permission.key];
    });
    onChange(next);
  }

  function restoreAll() {
    onChange(defaultPermissions);
  }

  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      <div className="border-b border-neutral-100 bg-neutral-950 p-4 text-white sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-300">Permissoes granulares</p>
            <h3 className="mt-1 text-xl font-black sm:text-2xl">Mapa de acesso do perfil</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-300">
              Ajuste excecoes por modulo sem procurar em uma lista gigante de checkboxes.
            </p>
          </div>
          <div className="grid w-full grid-cols-3 gap-2 lg:w-auto lg:min-w-[300px] xl:min-w-[360px]">
            <PermissionMetric label="Ativas" value={enabledCount} />
            <PermissionMetric label="Excecoes" value={changedCount} />
            <PermissionMetric label="Cobertura" value={`${coverage}%`} />
          </div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-amber-300 transition-all" style={{ width: `${coverage}%` }} />
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 2xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="min-w-0 border-b border-neutral-100 bg-neutral-50 p-3 2xl:border-b-0 2xl:border-r">
          <div className="flex max-w-full gap-2 overflow-x-auto 2xl:block 2xl:space-y-2 2xl:overflow-visible">
            {permissionGroups.map(group => {
              const Icon = group.icon;
              const groupEnabled = group.permissions.filter(permission => permissions[permission.key]).length;
              const groupChanged = group.permissions.filter(permission => permissions[permission.key] !== defaultPermissions[permission.key]).length;
              const selected = group.id === activeGroup.id;

              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setActiveGroupId(group.id)}
                  className={`flex min-w-[210px] shrink-0 items-center gap-3 rounded-2xl border p-3 text-left transition 2xl:w-full 2xl:min-w-0 ${
                    selected
                      ? 'border-neutral-950 bg-white shadow-sm'
                      : 'border-transparent bg-transparent hover:border-neutral-200 hover:bg-white'
                  }`}
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${selected ? 'bg-neutral-950 text-white' : 'bg-white text-neutral-500 ring-1 ring-neutral-200'}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-black text-neutral-950">{group.title}</p>
                      {groupChanged > 0 && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-black text-amber-700">{groupChanged}</span>}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-200">
                        <div className="h-full rounded-full bg-neutral-900" style={{ width: `${Math.round((groupEnabled / group.permissions.length) * 100)}%` }} />
                      </div>
                      <span className="text-[10px] font-black text-neutral-400">{groupEnabled}/{group.permissions.length}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="min-w-0 max-w-full overflow-hidden p-4 sm:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <activeGroup.icon className="h-5 w-5 text-amber-600" />
                <h4 className="text-lg font-black text-neutral-950">{activeGroup.title}</h4>
              </div>
              <p className="mt-1 text-sm leading-6 text-neutral-500">{activeGroup.description}</p>
            </div>
            <div className="flex max-w-full flex-wrap gap-2">
              <QuickAction icon={Check} label="Tudo" onClick={() => applyGroup(true)} />
              <QuickAction icon={X} label="Nada" onClick={() => applyGroup(false)} />
              <QuickAction icon={RotateCcw} label="Padrao" onClick={restoreGroup} />
            </div>
          </div>

          <div className="mt-4 grid min-w-0 grid-cols-1 gap-2 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
            <div className="relative min-w-0">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Buscar permissao neste modulo"
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 py-2.5 pl-10 pr-3 text-sm font-bold outline-none transition focus:border-neutral-900 focus:bg-white"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowOnlyChanges(value => !value)}
              className={`flex shrink-0 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-black uppercase tracking-widest transition ${
                showOnlyChanges ? 'bg-amber-100 text-amber-800' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Excecoes
            </button>
            <button
              type="button"
              onClick={restoreAll}
              className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-neutral-950 px-3 py-2.5 text-xs font-black uppercase tracking-widest text-white transition hover:bg-neutral-800"
            >
              <Sparkles className="h-4 w-4" />
              Perfil {role}
            </button>
          </div>

          <div className="mt-4 grid min-w-0 grid-cols-1 gap-3">
            {visiblePermissions.map(permission => {
              const enabled = permissions[permission.key];
              const changed = enabled !== defaultPermissions[permission.key];
              const level = permission.level || 'view';

              return (
                <button
                  key={permission.key}
                  type="button"
                  onClick={() => setPermission(permission.key, !enabled)}
                  className={`group flex min-h-[112px] w-full min-w-0 items-start gap-3 rounded-2xl border p-3 text-left transition sm:p-4 ${
                    enabled
                      ? 'border-neutral-900 bg-neutral-950 text-white shadow-sm'
                      : 'border-neutral-200 bg-white text-neutral-800 hover:border-neutral-400 hover:bg-neutral-50'
                  }`}
                >
                  <div className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition ${
                    enabled ? 'bg-white text-neutral-950' : 'bg-neutral-100 text-neutral-400 group-hover:text-neutral-700'
                  }`}>
                    {enabled ? <Check className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 break-words text-sm font-black">{permission.label}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ring-1 ${enabled ? 'bg-white/10 text-neutral-200 ring-white/10' : levelStyle[level]}`}>
                        {levelLabel[level]}
                      </span>
                      {changed && (
                        <span className="rounded-full bg-amber-300 px-2 py-0.5 text-[9px] font-black uppercase text-neutral-950">
                          excecao
                        </span>
                      )}
                    </div>
                    <p className={`mt-2 text-xs font-bold leading-5 ${enabled ? 'text-neutral-300' : 'text-neutral-500'}`}>{permission.detail}</p>
                    <div className={`mt-3 inline-flex items-center rounded-full p-1 transition ${enabled ? 'bg-emerald-400/20' : 'bg-neutral-100'}`}>
                      <span className={`h-5 w-9 rounded-full p-0.5 transition ${enabled ? 'bg-emerald-400' : 'bg-neutral-300'}`}>
                        <span className={`block h-4 w-4 rounded-full bg-white shadow-sm transition ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                      </span>
                      <span className={`px-2 text-[10px] font-black uppercase ${enabled ? 'text-emerald-100' : 'text-neutral-500'}`}>
                        {enabled ? 'liberado' : 'bloqueado'}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}

            {!visiblePermissions.length && (
              <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-8 text-center text-sm font-bold text-neutral-400 2xl:col-span-2">
                Nenhuma permissao encontrada neste filtro.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function PermissionMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-white/10 p-2 ring-1 ring-white/10 sm:p-3">
      <p className="truncate text-[9px] font-black uppercase tracking-widest text-neutral-300">{label}</p>
      <p className="mt-1 text-lg font-black tabular-nums text-white sm:text-xl">{value}</p>
    </div>
  );
}

function QuickAction({ icon: Icon, label, onClick }: { icon: typeof Gauge; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex shrink-0 items-center gap-2 rounded-xl bg-neutral-100 px-3 py-2 text-xs font-black uppercase tracking-widest text-neutral-600 transition hover:bg-neutral-200 hover:text-neutral-950"
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

export { DEFAULT_PERMISSIONS };
