import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase';
import { AuditLog, Company, FiscalFile, UserProfile } from '../../types';
import { fileStatus, fmtDate, isFinancialFile, money, moneyShort, startOfToday } from './shared';
import {
  AlertTriangle,
  BarChart3,
  BellRing,
  Building2,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Settings2,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type Risk = 'Baixo' | 'Medio' | 'Critico';
type DeskTab = 'analytics' | 'companies' | 'rules';

type CreditRules = {
  criticalLimit: number;
  criticalOverdueDays: number;
};

type CompanyExposure = {
  companyId: string;
  name: string;
  cnpj?: string;
  total: number;
  overdue: number;
  upcoming: number;
  paid: number;
  count: number;
  overdueCount: number;
  upcomingCount: number;
  disputedCount: number;
  oldestOverdueDays: number;
  risk: Risk;
  invoices: FiscalFile[];
};

const DEFAULT_RULES: CreditRules = {
  criticalLimit: 70000,
  criticalOverdueDays: 90,
};

const RISK_TONE: Record<Risk, string> = {
  Baixo: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Medio: 'bg-amber-50 text-amber-700 ring-amber-200',
  Critico: 'bg-red-50 text-red-700 ring-red-200',
};

const BUCKET_COLORS = ['#111827', '#10b981', '#f59e0b', '#ef4444', '#7c3aed'];

const parseDate = (value?: string) => {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const daysOverdue = (dueDate?: string) => {
  const date = parseDate(dueDate);
  if (!date) return 0;
  return Math.max(0, Math.round((startOfToday().getTime() - date.getTime()) / 86400000));
};

const getCompanyId = (file: FiscalFile) => file.company_id || file.companyId || 'sem-empresa';

export default function FinanceReceivablesDesk({ profile }: { profile: UserProfile }) {
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<FiscalFile[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [tab, setTab] = useState<DeskTab>('analytics');
  const [rules, setRules] = useState<CreditRules>(() => {
    try {
      return JSON.parse(localStorage.getItem('royal_credit_rules') || '') || DEFAULT_RULES;
    } catch {
      return DEFAULT_RULES;
    }
  });
  const [draftRules, setDraftRules] = useState<CreditRules>(rules);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    const [filesRes, companiesRes, auditRes] = await Promise.all([
      supabase.from('files').select('*').order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('companies').select('*').order('name'),
      supabase.from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(12),
    ]);
    if (filesRes.data) setFiles((filesRes.data as FiscalFile[]).filter(isFinancialFile));
    if (companiesRes.data) setCompanies(companiesRes.data as Company[]);
    if (auditRes.data) setAuditLogs(auditRes.data as AuditLog[]);
    setLoading(false);
  }

  const companyMap = useMemo(() => new Map(companies.map((company) => [company.id, company])), [companies]);

  const exposures = useMemo<CompanyExposure[]>(() => {
    const map = new Map<string, CompanyExposure>();
    files
      .filter((file) => !file.is_deleted)
      .forEach((file) => {
        const companyId = getCompanyId(file);
        const company = companyMap.get(companyId);
        const status = fileStatus(file);
        const amount = Number(file.amount || 0);
        const current = map.get(companyId) || {
          companyId,
          name: company?.name || 'Sem empresa vinculada',
          cnpj: company?.cnpj,
          total: 0,
          overdue: 0,
          upcoming: 0,
          paid: 0,
          count: 0,
          overdueCount: 0,
          upcomingCount: 0,
          disputedCount: 0,
          oldestOverdueDays: 0,
          risk: 'Baixo' as Risk,
          invoices: [],
        };

        current.count += 1;
        current.invoices.push(file);
        if (status === 'paid') {
          current.paid += amount;
        } else if (status !== 'cancelled') {
          current.total += amount;
          if (status === 'overdue' || status === 'disputed') {
            const delay = daysOverdue(file.due_date || file.dueDate);
            current.overdue += amount;
            current.overdueCount += 1;
            current.oldestOverdueDays = Math.max(current.oldestOverdueDays, delay);
          } else {
            current.upcoming += amount;
            current.upcomingCount += 1;
          }
          if (status === 'disputed') current.disputedCount += 1;
        }

        map.set(companyId, current);
      });

    return Array.from(map.values())
      .map((company) => {
        const risk: Risk =
          company.overdue > rules.criticalLimit || company.oldestOverdueDays > rules.criticalOverdueDays
            ? 'Critico'
            : company.overdue > 0 || company.disputedCount > 0
              ? 'Medio'
              : 'Baixo';
        return { ...company, risk };
      })
      .sort((a, b) => b.overdue - a.overdue || b.total - a.total);
  }, [files, companyMap, rules]);

  const stats = useMemo(() => {
    const totalReceivable = exposures.reduce((sum, company) => sum + company.total, 0);
    const totalOverdue = exposures.reduce((sum, company) => sum + company.overdue, 0);
    const totalUpcoming = exposures.reduce((sum, company) => sum + company.upcoming, 0);
    const criticalCount = exposures.filter((company) => company.risk === 'Critico').length;
    const overdueInvoices = exposures.reduce((sum, company) => sum + company.overdueCount, 0);
    const averageDelay =
      overdueInvoices > 0
        ? Math.round(exposures.reduce((sum, company) => sum + company.oldestOverdueDays * company.overdueCount, 0) / overdueInvoices)
        : 0;
    return {
      totalReceivable,
      totalOverdue,
      totalUpcoming,
      criticalCount,
      overdueInvoices,
      delinquencyRate: totalReceivable > 0 ? (totalOverdue / totalReceivable) * 100 : 0,
      averageDelay,
    };
  }, [exposures]);

  const agingData = useMemo(() => {
    const buckets = [
      { key: 'a_vencer', label: 'A vencer', value: 0 },
      { key: '1_30', label: '1-30d', value: 0 },
      { key: '31_60', label: '31-60d', value: 0 },
      { key: '61_90', label: '61-90d', value: 0 },
      { key: '90_plus', label: '+90d', value: 0 },
    ];
    files
      .filter((file) => !file.is_deleted && file.status !== 'PAID' && file.status !== 'CANCELLED')
      .forEach((file) => {
        const delay = daysOverdue(file.due_date || file.dueDate);
        const amount = Number(file.amount || 0);
        if (delay === 0) buckets[0].value += amount;
        else if (delay <= 30) buckets[1].value += amount;
        else if (delay <= 60) buckets[2].value += amount;
        else if (delay <= 90) buckets[3].value += amount;
        else buckets[4].value += amount;
      });
    return buckets;
  }, [files]);

  const topCompanies = exposures.slice(0, 8);
  const criticalCompanies = exposures.filter((company) => company.risk === 'Critico');
  const pcldCount = files.filter((file) => !file.is_deleted && fileStatus(file) === 'overdue' && daysOverdue(file.due_date || file.dueDate) > 360).length;
  const dueSoonCount = files.filter((file) => {
    if (file.is_deleted || file.status === 'PAID' || file.status === 'CANCELLED') return false;
    const due = parseDate(file.due_date || file.dueDate);
    if (!due) return false;
    const limit = new Date(startOfToday());
    limit.setDate(limit.getDate() + 7);
    return due >= startOfToday() && due <= limit;
  }).length;

  function saveRules() {
    setRules(draftRules);
    localStorage.setItem('royal_credit_rules', JSON.stringify(draftRules));
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-300" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-600">Recebiveis B2B</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-neutral-950">Painel financeiro corporativo</h2>
            <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-neutral-500">
              Aging, risco por empresa, alertas de cobranca e regras de credito usando as faturas reais do PMS.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'analytics', label: 'Analise', icon: BarChart3 },
              { id: 'companies', label: 'Empresas', icon: Building2 },
              { id: 'rules', label: 'Regras', icon: Settings2 },
            ].map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id as DeskTab)}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black transition ${
                    active ? 'bg-neutral-950 text-white' : 'bg-neutral-100 text-neutral-500 hover:text-neutral-950'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {tab === 'analytics' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard title="A receber" value={moneyShort(stats.totalReceivable)} detail={money(stats.totalReceivable)} icon={TrendingUp} tone="neutral" />
            <KpiCard title="Vencido" value={moneyShort(stats.totalOverdue)} detail={`${stats.overdueInvoices} fatura(s)`} icon={AlertTriangle} tone="red" />
            <KpiCard title="A vencer" value={moneyShort(stats.totalUpcoming)} detail="fluxo futuro" icon={CheckCircle2} tone="emerald" />
            <KpiCard title="Risco critico" value={String(stats.criticalCount)} detail={`${stats.delinquencyRate.toFixed(1)}% inadimplencia`} icon={ShieldAlert} tone="amber" />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">Aging financeiro</p>
                  <h3 className="mt-1 text-lg font-black text-neutral-950">Distribuicao por vencimento</h3>
                </div>
                <span className="rounded-full bg-neutral-100 px-3 py-1 text-[10px] font-black uppercase text-neutral-500">
                  Media {stats.averageDelay}d
                </span>
              </div>
              <div className="mt-6 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agingData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#737373' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#737373' }} axisLine={false} tickLine={false} tickFormatter={(value) => moneyShort(Number(value))} />
                    <Tooltip formatter={(value) => money(Number(value))} cursor={{ fill: '#f5f5f5' }} />
                    <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                      {agingData.map((entry, index) => (
                        <Cell key={entry.key} fill={BUCKET_COLORS[index]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="space-y-3">
              <InsightCard
                icon={ShieldAlert}
                title={`${criticalCompanies.length} empresa(s) em risco critico`}
                body={criticalCompanies.length ? `Maior exposicao: ${criticalCompanies[0].name}` : 'Nenhuma empresa passou dos limites configurados.'}
                tone="red"
              />
              <InsightCard
                icon={AlertTriangle}
                title={`${pcldCount} fatura(s) acima de 360 dias`}
                body="Priorize negociacao formal, provisao de perda ou tratativa juridica."
                tone="amber"
              />
              <InsightCard
                icon={BellRing}
                title={`${dueSoonCount} vencimento(s) nos proximos 7 dias`}
                body="Bom momento para cobranca preventiva antes de virar inadimplencia."
                tone="emerald"
              />
              <div className="rounded-3xl border border-neutral-200 bg-neutral-950 p-5 text-white shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/40">Trilha recente</p>
                <div className="mt-4 space-y-3">
                  {auditLogs.slice(0, 4).map((log) => (
                    <div key={log.id} className="border-l border-white/15 pl-3">
                      <p className="text-xs font-black text-white">{log.action}</p>
                      <p className="mt-0.5 text-[11px] text-white/45">{fmtDate(log.timestamp)} - {log.user_name}</p>
                    </div>
                  ))}
                  {auditLogs.length === 0 && <p className="text-sm text-white/50">Sem logs recentes.</p>}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {tab === 'companies' && (
        <div className="rounded-3xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-100 p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">Carteira corporativa</p>
            <h3 className="mt-1 text-lg font-black text-neutral-950">Empresas por exposicao financeira</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="bg-neutral-50 text-[10px] font-black uppercase tracking-widest text-neutral-400">
                <tr>
                  <th className="px-5 py-4">Empresa</th>
                  <th className="px-5 py-4 text-right">A receber</th>
                  <th className="px-5 py-4 text-right">Vencido</th>
                  <th className="px-5 py-4 text-center">Atraso</th>
                  <th className="px-5 py-4 text-center">Faturas</th>
                  <th className="px-5 py-4">Risco</th>
                  <th className="px-5 py-4">Proxima acao</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {topCompanies.map((company) => (
                  <tr key={company.companyId} className="hover:bg-neutral-50/70">
                    <td className="px-5 py-4">
                      <p className="font-black text-neutral-950">{company.name}</p>
                      <p className="mt-0.5 text-xs text-neutral-400">{company.cnpj || 'CNPJ nao informado'}</p>
                    </td>
                    <td className="px-5 py-4 text-right font-black text-neutral-950">{money(company.total)}</td>
                    <td className="px-5 py-4 text-right font-black text-red-600">{money(company.overdue)}</td>
                    <td className="px-5 py-4 text-center font-bold text-neutral-600">{company.oldestOverdueDays || '-'}d</td>
                    <td className="px-5 py-4 text-center font-bold text-neutral-600">{company.count}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase ring-1 ${RISK_TONE[company.risk]}`}>
                        {company.risk}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs font-bold text-neutral-500">
                      {company.risk === 'Critico'
                        ? 'Escalar cobranca e revisar limite'
                        : company.risk === 'Medio'
                          ? 'Enviar lembrete preventivo'
                          : 'Manter acompanhamento'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'rules' && (
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">Monitor de parametros</p>
            <h3 className="mt-1 text-lg font-black text-neutral-950">Regras de risco de credito</h3>
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-xs font-black uppercase tracking-widest text-neutral-400">Limite critico por empresa</span>
                <input
                  type="number"
                  value={draftRules.criticalLimit}
                  onChange={(event) => setDraftRules((prev) => ({ ...prev, criticalLimit: Number(event.target.value) }))}
                  className="mt-2 w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-bold outline-none focus:border-neutral-950 focus:bg-white"
                />
              </label>
              <label className="block">
                <span className="text-xs font-black uppercase tracking-widest text-neutral-400">Dias maximos de atraso</span>
                <input
                  type="number"
                  value={draftRules.criticalOverdueDays}
                  onChange={(event) => setDraftRules((prev) => ({ ...prev, criticalOverdueDays: Number(event.target.value) }))}
                  className="mt-2 w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-bold outline-none focus:border-neutral-950 focus:bg-white"
                />
              </label>
              <button
                type="button"
                onClick={saveRules}
                className="w-full rounded-2xl bg-neutral-950 px-4 py-3 text-sm font-black text-white transition hover:bg-neutral-800"
              >
                Aplicar regras
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-neutral-200 bg-neutral-50 p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-white p-3 text-neutral-950 shadow-sm">
                <ClipboardList className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">Regua recomendada</p>
                <h3 className="text-lg font-black text-neutral-950">Fluxo de cobranca B2B</h3>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                ['D-7', 'Lembrete preventivo para vencimentos futuros.'],
                ['D+1', 'Primeiro contato financeiro com boleto/fatura.'],
                ['D+15', 'Aviso ao comercial e bloqueio de novas condicoes.'],
                ['D+30', 'Escalar para gerencia e registrar negociacao.'],
                ['D+90', 'Classificar como critico e revisar limite.'],
                ['D+360', 'PCLD ou tratativa juridica conforme diretoria.'],
              ].map(([step, description]) => (
                <div key={step} className="rounded-2xl border border-neutral-200 bg-white p-4">
                  <p className="text-sm font-black text-neutral-950">{step}</p>
                  <p className="mt-1 text-xs font-medium leading-5 text-neutral-500">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  title,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  title: string;
  value: string;
  detail: string;
  icon: typeof TrendingUp;
  tone: 'neutral' | 'red' | 'emerald' | 'amber';
}) {
  const toneMap = {
    neutral: 'bg-neutral-950 text-white',
    red: 'bg-red-50 text-red-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
  };
  return (
    <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">{title}</p>
          <p className="mt-3 text-2xl font-black tracking-tight text-neutral-950">{value}</p>
          <p className="mt-1 text-xs font-bold text-neutral-400">{detail}</p>
        </div>
        <div className={`rounded-2xl p-3 ${toneMap[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function InsightCard({
  icon: Icon,
  title,
  body,
  tone,
}: {
  icon: typeof AlertTriangle;
  title: string;
  body: string;
  tone: 'red' | 'amber' | 'emerald';
}) {
  const toneMap = {
    red: 'border-red-200 bg-red-50 text-red-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  };
  return (
    <div className={`rounded-3xl border p-5 ${toneMap[tone]}`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="text-sm font-black">{title}</p>
          <p className="mt-1 text-xs font-medium leading-5 opacity-80">{body}</p>
        </div>
      </div>
    </div>
  );
}
