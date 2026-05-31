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
  Copy,
  Loader2,
  Mail,
  MessageSquare,
  RefreshCw,
  Settings2,
  ShieldAlert,
  TrendingUp,
  Upload,
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
import { toast } from 'sonner';
import { logAudit } from '../../lib/audit';

type Risk = 'Baixo' | 'Medio' | 'Critico';
type DeskTab = 'analytics' | 'companies' | 'parser' | 'billing' | 'rules';
type ParsedInvoice = {
  invoiceNum: string;
  issueDate: string;
  dueDate: string;
  value: number;
  overdueDays: number;
  status: 'Vencido' | 'A Vencer';
};
type ParsedCompany = {
  name: string;
  cnpj?: string;
  invoices: ParsedInvoice[];
};

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
const normalizeKey = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\W+/g, '').toLowerCase();
const toIsoDate = (date: string) => {
  const parts = date.trim().split('/');
  if (parts.length !== 3) return '';
  return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
};
const parseMoney = (value: string) => Number(value.replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, '')) || 0;

const PARSER_SAMPLE = `# RELATORIO DE CONTAS A RECEBER
Data de Operacao: ${new Date().toLocaleDateString('pt-BR')}

## PETROBRAS S.A. (CNPJ: 33.000.167/0001-01)
* FT-100234 | Emissao: 12/02/2024 | Vencimento: 12/03/2024 | Vlr Fatura: 100.000,00 | Vlr Receber: 100.000,00 | Status: VENCIDO
* FT-101112 | Emissao: 15/05/2026 | Vencimento: 15/07/2026 | Vlr Fatura: 100.419,33 | Vlr Receber: 100.419,33 | Status: A VENCER

## SUBSEA 7 LIMITADA (CNPJ: 02.441.989/0001-11)
* FT-100239 | Emissao: 10/03/2026 | Vencimento: 10/04/2026 | Vlr Fatura: 15.200,00 | Vlr Receber: 15.200,00 | Status: VENCIDO`;

function parseMarkdownReport(markdown: string, referenceDate = startOfToday()): ParsedCompany[] {
  const companies: ParsedCompany[] = [];
  let current: ParsedCompany | null = null;

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const companyMatch = line.match(/^##\s+(.*?)(?:\s+\(CNPJ:\s*(.*?)\))?$/i);
    if (companyMatch && !line.toLowerCase().includes('total empresa')) {
      if (current) companies.push(current);
      current = { name: companyMatch[1].trim(), cnpj: companyMatch[2]?.trim(), invoices: [] };
      continue;
    }

    if (!current || !line.startsWith('*')) continue;
    const parts = line.slice(1).split('|').map((part) => part.trim());
    const invoiceNum = (parts.find((part) => /(?:FT|NF|NH|FAT)[-\s]?\d+/i.test(part))?.match(/(?:FT|NF|NH|FAT)[-\s]?\d+/i)?.[0] || `FT-${Date.now()}`).replace(/\s+/g, '-').toUpperCase();
    const findValue = (keys: string[]) => {
      const found = parts.find((part) => keys.some((key) => part.toLowerCase().includes(key)));
      return found?.split(':').slice(1).join(':').trim() || '';
    };
    const issueDate = toIsoDate(findValue(['emissao', 'emissão', 'emiss']));
    const dueDate = toIsoDate(findValue(['vencimento', 'venc']));
    const value = parseMoney(findValue(['vlr receber', 'valor receber', 'vlr fatura', 'valor', 'receber']));
    if (!dueDate || value <= 0) continue;

    const due = new Date(`${dueDate}T12:00:00`);
    const overdueDays = Math.floor((referenceDate.getTime() - due.getTime()) / 86400000);
    current.invoices.push({
      invoiceNum,
      issueDate: issueDate || dueDate,
      dueDate,
      value,
      overdueDays,
      status: overdueDays > 0 ? 'Vencido' : 'A Vencer',
    });
  }

  if (current) companies.push(current);
  return companies.filter((company) => company.invoices.length > 0);
}

export default function FinanceReceivablesDesk({ profile }: { profile: UserProfile }) {
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<FiscalFile[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [tab, setTab] = useState<DeskTab>('analytics');
  const [markdownInput, setMarkdownInput] = useState(PARSER_SAMPLE);
  const [parsedPreview, setParsedPreview] = useState<ParsedCompany[]>([]);
  const [importing, setImporting] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Record<string, boolean>>({});
  const [billingLevel, setBillingLevel] = useState<'1' | '2' | '3'>('2');
  const [billingChannel, setBillingChannel] = useState<'email' | 'whatsapp'>('email');
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
  const billingCompany = exposures.find((company) => company.companyId === selectedCompanyId) || exposures.find((company) => company.overdue > 0) || exposures[0];
  const billingInvoices = (billingCompany?.invoices || []).filter((file) => file.status !== 'PAID' && file.status !== 'CANCELLED');
  const selectedBillingInvoices = billingInvoices.filter((file) => selectedInvoiceIds[file.id] ?? fileStatus(file) === 'overdue');
  const selectedBillingTotal = selectedBillingInvoices.reduce((sum, file) => sum + Number(file.amount || 0), 0);
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

  function runParser() {
    try {
      const parsed = parseMarkdownReport(markdownInput);
      if (parsed.length === 0) throw new Error('Nenhuma empresa/fatura encontrada. Verifique os cabecalhos ## EMPRESA e linhas * FT.');
      setParsedPreview(parsed);
      const invoiceCount = parsed.reduce((sum, company) => sum + company.invoices.length, 0);
      toast.success(`Parser leu ${parsed.length} empresa(s) e ${invoiceCount} fatura(s).`);
    } catch (error: any) {
      toast.error(error.message || 'Nao foi possivel interpretar o markdown.');
    }
  }

  async function importParsed() {
    if (parsedPreview.length === 0) {
      runParser();
      return;
    }
    setImporting(true);
    try {
      const refreshedCompanies = [...companies];
      const createdFiles: FiscalFile[] = [];
      let companiesCreated = 0;
      let filesCreated = 0;
      let duplicates = 0;

      for (const parsedCompany of parsedPreview) {
        const existing = refreshedCompanies.find((company) =>
          (parsedCompany.cnpj && company.cnpj === parsedCompany.cnpj) ||
          normalizeKey(company.name) === normalizeKey(parsedCompany.name)
        );
        let company = existing;
        if (!company) {
          const slug = normalizeKey(parsedCompany.name) || crypto.randomUUID();
          const { data, error } = await supabase
            .from('companies')
            .insert([{ name: parsedCompany.name, cnpj: parsedCompany.cnpj || '', slug, status: 'active' }])
            .select()
            .single();
          if (error) throw error;
          company = data as Company;
          refreshedCompanies.push(company);
          companiesCreated += 1;
        }

        for (const invoice of parsedCompany.invoices) {
          const alreadyExists = files.some((file) =>
            getCompanyId(file) === company!.id &&
            (file.original_name || '').toUpperCase().includes(invoice.invoiceNum.toUpperCase())
          );
          if (alreadyExists) {
            duplicates += 1;
            continue;
          }

          const payload = {
            company_id: company.id,
            type: 'FATURA',
            period: invoice.issueDate.slice(0, 7),
            original_name: `${invoice.invoiceNum} - ${parsedCompany.name}`,
            storage_path: `financeiro-parser/${company.id}/${invoice.invoiceNum}.md`,
            upload_date: new Date().toISOString(),
            uploader_id: profile.id,
            due_date: invoice.dueDate,
            amount: invoice.value,
            category: 'Importacao ERP Markdown',
            status: 'PENDING',
            tracking_stage: 'finance',
            tracking_status: invoice.status === 'Vencido' ? 'pending' : 'ok',
            tracking_notes: `Importado via parser MD | Emissao: ${invoice.issueDate} | Atraso: ${Math.max(0, invoice.overdueDays)} dia(s)`,
            tracking_updated_at: new Date().toISOString(),
            tracking_updated_by: profile.name,
          };
          const { data, error } = await supabase.from('files').insert([payload]).select().single();
          if (error) throw error;
          createdFiles.push(data as FiscalFile);
          filesCreated += 1;
        }
      }

      setCompanies(refreshedCompanies);
      setFiles((prev) => [...createdFiles, ...prev]);
      await logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Importacao financeira via Parser MD',
        details: JSON.stringify({ companiesCreated, filesCreated, duplicates }),
        type: 'upload',
      });
      toast.success(`Importacao concluida: ${filesCreated} fatura(s), ${companiesCreated} empresa(s), ${duplicates} duplicada(s).`);
      setParsedPreview([]);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao importar dados do parser.');
    } finally {
      setImporting(false);
    }
  }

  function toggleBillingInvoice(id: string) {
    setSelectedInvoiceIds((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }));
  }

  function generateBillingText() {
    if (!billingCompany || selectedBillingInvoices.length === 0) return { subject: '', body: 'Selecione ao menos uma fatura para gerar a regua.' };
    const invoiceList = selectedBillingInvoices.map((file) => {
      const delay = daysOverdue(file.due_date || file.dueDate);
      return `- ${(file.original_name || 'Fatura').split(' - ')[0]} | Vencimento: ${fmtDate(file.due_date || file.dueDate)} | Valor: ${money(Number(file.amount || 0))}${delay > 0 ? ` | Atraso: ${delay} dia(s)` : ' | A vencer'}`;
    }).join('\n');
    const companyLine = `${billingCompany.name}${billingCompany.cnpj ? ` (CNPJ: ${billingCompany.cnpj})` : ''}`;
    const levelLabels = {
      '1': 'Conferencia preventiva',
      '2': 'Cobranca oficial',
      '3': 'Escalada critica',
    };
    const subject = `[${levelLabels[billingLevel]}] Titulos em aberto - Royal Macae Palace - ${billingCompany.name}`;
    const body = billingChannel === 'email'
      ? `Prezados,\n\nIdentificamos titulos em aberto vinculados a ${companyLine}.\n\n${invoiceList}\n\nTotal selecionado: ${money(selectedBillingTotal)}\n\n${billingLevel === '1' ? 'Solicitamos conferencia e previsao de pagamento. Caso ja tenha sido liquidado, envie o comprovante para conciliacao.' : billingLevel === '2' ? 'Solicitamos regularizacao em ate 48 horas ou retorno com previsao formal de pagamento.' : 'Esta notificacao representa escalada critica da regua de cobranca. A ausencia de retorno podera bloquear novas condicoes comerciais e seguir para tratativa gerencial.'}\n\nAtenciosamente,\nFinanceiro Royal Macae Palace`
      : `*Royal Macae Palace - ${levelLabels[billingLevel]}*\n\nEmpresa: *${companyLine}*\n\n${invoiceList}\n\n*Total:* ${money(selectedBillingTotal)}\n\n${billingLevel === '1' ? 'Pode nos confirmar a previsao de pagamento?' : billingLevel === '2' ? 'Solicitamos regularizacao ou previsao formal em ate 48h.' : 'Pendencia em escalada critica. Precisamos de retorno do financeiro para evitar bloqueios comerciais.'}`;
    return { subject, body };
  }

  async function copyBillingText() {
    const content = generateBillingText();
    await navigator.clipboard.writeText(billingChannel === 'email' ? `Assunto: ${content.subject}\n\n${content.body}` : content.body);
    toast.success('Texto da regua copiado.');
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
              { id: 'parser', label: 'Parser MD', icon: Upload },
              { id: 'billing', label: 'Regua de Cobranca', icon: BellRing },
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

      {tab === 'parser' && (
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-600">Parser ERP Markdown</p>
                <h3 className="mt-1 text-lg font-black text-neutral-950">Cole o .md e gere empresas/faturas automaticamente</h3>
                <p className="mt-1 text-sm leading-6 text-neutral-500">
                  O parser cria empresas que ainda nao existem e grava as faturas como recebiveis do financeiro.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMarkdownInput(PARSER_SAMPLE)}
                className="flex w-fit items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2 text-xs font-black text-neutral-500 transition hover:bg-neutral-100"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Exemplo
              </button>
            </div>
            <textarea
              value={markdownInput}
              onChange={(event) => setMarkdownInput(event.target.value)}
              rows={16}
              className="mt-5 w-full rounded-2xl border border-neutral-200 bg-neutral-50 p-4 font-mono text-xs leading-6 text-neutral-700 outline-none focus:border-neutral-950 focus:bg-white"
              placeholder="## NOME DA EMPRESA (CNPJ: 00.000.000/0001-00)&#10;* FT-0001 | Emissao: 01/05/2026 | Vencimento: 15/05/2026 | Vlr Receber: 1.500,00"
            />
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={runParser}
                className="flex items-center justify-center gap-2 rounded-2xl bg-neutral-950 px-4 py-3 text-sm font-black text-white transition hover:bg-neutral-800"
              >
                <RefreshCw className="h-4 w-4" />
                Processar relatorio
              </button>
              <button
                type="button"
                onClick={importParsed}
                disabled={importing || parsedPreview.length === 0}
                className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Importar para o financeiro
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">Previa da importacao</p>
            <h3 className="mt-1 text-lg font-black text-neutral-950">
              {parsedPreview.length ? `${parsedPreview.length} empresa(s)` : 'Nada processado ainda'}
            </h3>
            <div className="mt-5 max-h-[540px] space-y-3 overflow-y-auto pr-1">
              {parsedPreview.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-8 text-center text-sm text-neutral-400">
                  Clique em processar para revisar antes de importar.
                </div>
              ) : parsedPreview.map((company) => (
                <div key={`${company.name}-${company.cnpj}`} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                  <p className="font-black text-neutral-950">{company.name}</p>
                  <p className="mt-0.5 text-xs text-neutral-400">{company.cnpj || 'CNPJ nao informado'}</p>
                  <div className="mt-3 space-y-2">
                    {company.invoices.map((invoice) => (
                      <div key={invoice.invoiceNum} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-xs">
                        <span className="font-black text-neutral-700">{invoice.invoiceNum}</span>
                        <span className="text-neutral-500">{fmtDate(invoice.dueDate)}</span>
                        <span className="font-black text-neutral-950">{money(invoice.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'billing' && (
        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-600">Regua de Cobranca</p>
            <h3 className="mt-1 text-lg font-black text-neutral-950">Selecione a empresa e os titulos</h3>
            <select
              value={billingCompany?.companyId || ''}
              onChange={(event) => {
                setSelectedCompanyId(event.target.value);
                setSelectedInvoiceIds({});
              }}
              className="mt-5 w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-bold outline-none focus:border-neutral-950 focus:bg-white"
            >
              {exposures.map((company) => (
                <option key={company.companyId} value={company.companyId}>{company.name} - {money(company.overdue || company.total)}</option>
              ))}
            </select>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {(['1', '2', '3'] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setBillingLevel(level)}
                  className={`rounded-xl px-3 py-2 text-xs font-black transition ${billingLevel === level ? 'bg-neutral-950 text-white' : 'bg-neutral-100 text-neutral-500'}`}
                >
                  Nivel {level}
                </button>
              ))}
              {(['email', 'whatsapp'] as const).map((channel) => (
                <button
                  key={channel}
                  type="button"
                  onClick={() => setBillingChannel(channel)}
                  className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-black transition ${billingChannel === channel ? 'bg-emerald-600 text-white' : 'bg-neutral-100 text-neutral-500'}`}
                >
                  {channel === 'email' ? <Mail className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
                  {channel}
                </button>
              ))}
            </div>

            <div className="mt-5 max-h-[440px] space-y-2 overflow-y-auto pr-1">
              {billingInvoices.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-neutral-200 p-8 text-center text-sm text-neutral-400">Sem titulos abertos.</div>
              ) : billingInvoices.map((file) => {
                const selected = selectedInvoiceIds[file.id] ?? fileStatus(file) === 'overdue';
                return (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => toggleBillingInvoice(file.id)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${selected ? 'border-neutral-950 bg-neutral-950 text-white' : 'border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-white'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-black">{(file.original_name || 'Fatura').split(' - ')[0]}</span>
                      <span className="text-sm font-black">{money(Number(file.amount || 0))}</span>
                    </div>
                    <p className={`mt-1 text-xs ${selected ? 'text-white/55' : 'text-neutral-400'}`}>Vencimento {fmtDate(file.due_date || file.dueDate)} | atraso {daysOverdue(file.due_date || file.dueDate)}d</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">Texto gerado</p>
                <h3 className="mt-1 text-lg font-black text-neutral-950">{billingChannel === 'email' ? 'E-mail de cobranca' : 'WhatsApp financeiro'}</h3>
              </div>
              <button onClick={copyBillingText} className="flex items-center gap-2 rounded-xl bg-neutral-950 px-3 py-2 text-xs font-black text-white">
                <Copy className="h-3.5 w-3.5" />
                Copiar
              </button>
            </div>
            <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              {billingChannel === 'email' && (
                <p className="mb-3 rounded-xl bg-white px-3 py-2 text-xs font-black text-neutral-700">
                  Assunto: {generateBillingText().subject}
                </p>
              )}
              <pre className="max-h-[560px] whitespace-pre-wrap font-sans text-sm leading-6 text-neutral-700">{generateBillingText().body}</pre>
            </div>
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
