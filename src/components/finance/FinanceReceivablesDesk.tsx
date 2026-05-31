import { Fragment, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase';
import { AuditLog, Company, FiscalFile, UserProfile } from '../../types';
import { fileStatus, fmtDate, isFinancialFile, money, moneyShort, startOfToday } from './shared';
import {
  AlertTriangle,
  BarChart3,
  BellRing,
  Building2,
  Calendar,
  ChevronRight,
  CheckCircle2,
  Clock as ClockIcon,
  ClipboardList,
  Copy,
  DollarSign,
  Eye,
  FileText,
  Loader2,
  Mail,
  MessageSquare,
  Printer,
  RefreshCw,
  Search,
  Sliders,
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
type DeskTab = 'analytics' | 'companies' | 'billing' | 'parser' | 'docs';
type BillingFilter = 'all' | 'overdue' | 'upcoming';
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
  const [billingFilter, setBillingFilter] = useState<BillingFilter>('all');
  const [companySearch, setCompanySearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<Risk | 'Todos'>('Todos');
  const [expandedCompanyId, setExpandedCompanyId] = useState('');
  const [showAgreement, setShowAgreement] = useState(false);
  const [agreementDiscount, setAgreementDiscount] = useState(10);
  const [agreementDownPayment, setAgreementDownPayment] = useState(20);
  const [agreementInstallments, setAgreementInstallments] = useState(3);
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
  const billingInvoices = (billingCompany?.invoices || []).filter((file) => {
    if (file.status === 'PAID' || file.status === 'CANCELLED') return false;
    if (billingFilter === 'overdue') return fileStatus(file) === 'overdue' || fileStatus(file) === 'disputed';
    if (billingFilter === 'upcoming') return fileStatus(file) === 'pending';
    return true;
  });
  const selectedBillingInvoices = billingInvoices.filter((file) => selectedInvoiceIds[file.id] ?? fileStatus(file) === 'overdue');
  const selectedBillingTotal = selectedBillingInvoices.reduce((sum, file) => sum + Number(file.amount || 0), 0);
  const selectedAgreementBase = selectedBillingTotal * (1 - agreementDiscount / 100);
  const selectedAgreementDown = selectedAgreementBase * (agreementDownPayment / 100);
  const selectedAgreementInstallment = agreementInstallments > 0 ? (selectedAgreementBase - selectedAgreementDown) / agreementInstallments : 0;
  const filteredCompanies = exposures.filter((company) => {
    const q = companySearch.trim().toLowerCase();
    const matchesSearch = !q || company.name.toLowerCase().includes(q) || (company.cnpj || '').includes(q);
    const matchesRisk = riskFilter === 'Todos' || company.risk === riskFilter;
    return matchesSearch && matchesRisk;
  });
  const concentration = topCompanies.reduce((sum, company) => sum + company.total, 0);
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
    const agreementBlock = showAgreement
      ? `\n\nPROPOSTA DE ACORDO:\nValor com desconto (${agreementDiscount}%): ${money(selectedAgreementBase)}\nEntrada (${agreementDownPayment}%): ${money(selectedAgreementDown)}\nSaldo em ${agreementInstallments} parcela(s): ${money(selectedAgreementInstallment)} cada\n`
      : '';
    const body = billingChannel === 'email'
      ? `Prezados,\n\nIdentificamos titulos em aberto vinculados a ${companyLine}.\n\n${invoiceList}\n\nTotal selecionado: ${money(selectedBillingTotal)}\n\n${billingLevel === '1' ? 'Solicitamos conferencia e previsao de pagamento. Caso ja tenha sido liquidado, envie o comprovante para conciliacao.' : billingLevel === '2' ? 'Solicitamos regularizacao em ate 48 horas ou retorno com previsao formal de pagamento.' : 'Esta notificacao representa escalada critica da regua de cobranca. A ausencia de retorno podera bloquear novas condicoes comerciais e seguir para tratativa gerencial.'}\n\nAtenciosamente,\nFinanceiro Royal Macae Palace`
      : `*Royal Macae Palace - ${levelLabels[billingLevel]}*\n\nEmpresa: *${companyLine}*\n\n${invoiceList}\n\n*Total:* ${money(selectedBillingTotal)}\n\n${billingLevel === '1' ? 'Pode nos confirmar a previsao de pagamento?' : billingLevel === '2' ? 'Solicitamos regularizacao ou previsao formal em ate 48h.' : 'Pendencia em escalada critica. Precisamos de retorno do financeiro para evitar bloqueios comerciais.'}`;
    return { subject, body: body + agreementBlock };
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
    <div className="space-y-6 bg-[#f6f8fb] p-1 text-slate-900">
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#4f46e5] text-white shadow-lg shadow-indigo-500/20">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight text-slate-950">Royal Macae Palace Hotel</h2>
              <p className="text-[11px] font-medium tracking-wide text-slate-500">SaaS Receivables & Delinquency Engine</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600">
              <Calendar className="h-3.5 w-3.5" />
              Ref. operacao: {new Date().toLocaleDateString('pt-BR')}
            </span>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-xl bg-[#4f46e5] px-4 py-2 text-xs font-black text-white shadow-lg shadow-indigo-500/20"
            >
              <Printer className="h-3.5 w-3.5" />
              Exportar Relatorio (PDF)
            </button>
          </div>
        </div>

        <div className="px-5 py-5">
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-white p-2 text-indigo-600 shadow-sm">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-black text-indigo-950">Dashboard de Demonstracao e Exportacao SaaS</p>
                  <p className="mt-0.5 text-xs font-medium text-indigo-700">
                    Cole relatórios em Markdown, gere faturas automaticamente e dispare a régua consolidada.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={fetchAll}
                className="w-fit rounded-xl bg-indigo-100 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-indigo-700"
              >
                Resetar banco integrado
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Total geral em carteira" value={money(stats.totalReceivable)} detail={`${exposures.length} empresas ativas`} icon={DollarSign} tone="neutral" />
        <KpiCard title="Vencidos (inadimplencia)" value={money(stats.totalOverdue)} detail={`Taxa: ${stats.delinquencyRate.toFixed(1)}% da carteira`} icon={AlertTriangle} tone="red" />
        <KpiCard title="A vencer (fluxo futuro)" value={money(stats.totalUpcoming)} detail="Faturamento em dia" icon={Calendar} tone="emerald" />
        <KpiCard title="Atraso medio de divida" value={`${stats.averageDelay} dias`} detail={stats.averageDelay > rules.criticalOverdueDays ? 'Risco de provisao alto' : 'Carteira sob controle'} icon={ClockIcon} tone="amber" />
      </div>

      <div className="flex max-w-full gap-3 overflow-x-auto border-b border-slate-200 pb-3">
        {[
          { id: 'analytics', label: 'Monitor de Saude & Graficos', icon: BarChart3 },
          { id: 'companies', label: 'Faturas por Empresa', icon: FileText },
          { id: 'billing', label: 'Regua de Cobranca (Geral)', icon: BellRing },
          { id: 'parser', label: 'Simulador / Importador ERP', icon: Sliders },
          { id: 'docs', label: 'Documentacao / Como Fazer?', icon: Settings2 },
        ].map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as DeskTab)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-black transition ${
                active ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:bg-white hover:text-slate-950'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
              {item.id === 'analytics' && criticalCompanies.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />}
            </button>
          );
        })}
      </div>

      {tab === 'analytics' && (
        <>
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
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-100 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-wide text-slate-950">Detalhamento operacional por empresa</p>
              <p className="mt-1 text-xs font-medium text-slate-500">Exibindo {filteredCompanies.length} de {exposures.length} empresas com faturas em aberto.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={companySearch}
                  onChange={(event) => setCompanySearch(event.target.value)}
                  placeholder="Pesquisar por empresa ou CNPJ..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 sm:w-72"
                />
              </div>
              <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                {(['Todos', 'Critico', 'Medio', 'Baixo'] as const).map((risk) => (
                  <button
                    key={risk}
                    type="button"
                    onClick={() => setRiskFilter(risk)}
                    className={`rounded-lg px-3 py-1.5 text-[10px] font-black ${riskFilter === risk ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}
                  >
                    {risk === 'Todos' ? 'Todos' : risk}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-5 py-4">Cooperado / Empresa</th>
                  <th className="px-5 py-4 text-right">Total carteira</th>
                  <th className="px-5 py-4 text-right text-rose-600">Inadimplente (vencido)</th>
                  <th className="px-5 py-4 text-center">Aval de risco</th>
                  <th className="px-5 py-4 text-right">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCompanies.map((company) => {
                  const expanded = expandedCompanyId === company.companyId;
                  const overduePercent = company.total > 0 ? Math.round((company.overdue / company.total) * 100) : 0;
                  return (
                    <Fragment key={company.companyId}>
                      <tr className="hover:bg-slate-50/70">
                        <td className="px-5 py-4">
                          <button
                            type="button"
                            onClick={() => setExpandedCompanyId(expanded ? '' : company.companyId)}
                            className="mr-3 inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                          >
                            <ChevronRight className={`h-4 w-4 transition ${expanded ? 'rotate-90' : ''}`} />
                          </button>
                          <span className="inline-block align-middle">
                            <span className="block font-black text-slate-950">{company.name}</span>
                            <span className="mt-0.5 block font-mono text-[11px] text-slate-400">CNPJ: {company.cnpj || 'nao informado'}</span>
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right font-mono font-bold text-slate-950">{money(company.total)}</td>
                        <td className="px-5 py-4 text-right font-mono font-black text-rose-600">
                          {company.overdue > 0 ? (
                            <>
                              {money(company.overdue)}
                              <span className="block text-[10px]">({overduePercent}% atrasado)</span>
                            </>
                          ) : '-'}
                        </td>
                        <td className="px-5 py-4 text-center">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ring-1 ${RISK_TONE[company.risk]}`}>
                            {company.risk}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCompanyId(company.companyId);
                              setSelectedInvoiceIds({});
                              setTab('billing');
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-black text-slate-600 hover:border-indigo-200 hover:text-indigo-700"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Faturas
                          </button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="bg-slate-50/70">
                          <td colSpan={5} className="px-12 py-4">
                            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                              {company.invoices.slice(0, 9).map((file) => (
                                <div key={file.id} className="rounded-xl border border-slate-200 bg-white p-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="truncate text-xs font-black text-slate-800">{(file.original_name || 'Fatura').split(' - ')[0]}</p>
                                    <p className="text-xs font-black text-slate-950">{money(Number(file.amount || 0))}</p>
                                  </div>
                                  <p className="mt-1 text-[11px] font-medium text-slate-400">Vcto {fmtDate(file.due_date || file.dueDate)} | {daysOverdue(file.due_date || file.dueDate)}d atraso</p>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
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
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid gap-4 lg:grid-cols-[1fr_390px] lg:items-center">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-indigo-50 p-3 text-indigo-600">
                  <BellRing className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-950">Regua de Cobranca Consolidada</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    Selecione faturas agregadas por devedor, configure o template e gere mensagens com o valor original dos titulos.
                  </p>
                </div>
              </div>
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Empresa devedora</span>
                <select
                  value={billingCompany?.companyId || ''}
                  onChange={(event) => {
                    setSelectedCompanyId(event.target.value);
                    setSelectedInvoiceIds({});
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold outline-none focus:border-indigo-500 focus:bg-white"
                >
                  {exposures.map((company) => (
                    <option key={company.companyId} value={company.companyId}>{company.name} [{money(company.overdue || company.total)}]</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
                <p className="text-[10px] font-black uppercase tracking-widest">Multas por atraso isento</p>
                <p className="mt-2 text-xs leading-5">Nao ha incidencia de taxas de multas de atraso. Os titulos sao unificados pelo valor historico de emissao.</p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
                <p className="text-[10px] font-black uppercase tracking-widest">Juros de mora isento</p>
                <p className="mt-2 text-xs leading-5">A cobranca de juros esta permanentemente desativada no monitoramento do hotel corporativo.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Status geral</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="font-black text-slate-950">{billingCompany?.name || 'Sem empresa'}</p>
                  {billingCompany && <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ring-1 ${RISK_TONE[billingCompany.risk]}`}>Risco: {billingCompany.risk}</span>}
                </div>
              </div>
            </div>

            <div className="mb-4 flex flex-col gap-3 border-y border-slate-100 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex rounded-xl bg-slate-100 p-1">
                {[
                  ['all', `Todas (${billingCompany?.count || 0})`],
                  ['overdue', `Vencidas (${billingCompany?.overdueCount || 0})`],
                  ['upcoming', `A vencer (${billingCompany?.upcomingCount || 0})`],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setBillingFilter(id as BillingFilter)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-black ${billingFilter === id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex gap-3 text-xs font-black text-indigo-700">
                <button
                  type="button"
                  onClick={() => setSelectedInvoiceIds(Object.fromEntries(billingInvoices.map((file) => [file.id, true])))}
                >
                  Marcar visiveis ({billingInvoices.length})
                </button>
                <button type="button" onClick={() => setSelectedInvoiceIds({})} className="text-slate-500">Limpar visiveis</button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[880px] text-left text-sm">
                <thead className="bg-slate-50 text-[11px] font-black text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Incluir</th>
                    <th className="px-4 py-3">Titulo</th>
                    <th className="px-4 py-3">Emissao</th>
                    <th className="px-4 py-3">Data Vcto</th>
                    <th className="px-4 py-3 text-right">Valor Original</th>
                    <th className="px-4 py-3 text-center">Atraso</th>
                    <th className="px-4 py-3 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {billingInvoices.map((file) => {
                    const delay = daysOverdue(file.due_date || file.dueDate);
                    const selected = selectedInvoiceIds[file.id] ?? fileStatus(file) === 'overdue';
                    return (
                      <tr key={file.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <input type="checkbox" checked={selected} onChange={() => toggleBillingInvoice(file.id)} className="h-4 w-4 accent-indigo-600" />
                        </td>
                        <td className="px-4 py-3 font-mono font-black text-slate-700">{(file.original_name || 'Fatura').split(' - ')[0]}</td>
                        <td className="px-4 py-3 text-slate-400">{fmtDate(file.upload_date || file.uploadDate)}</td>
                        <td className="px-4 py-3">{fmtDate(file.due_date || file.dueDate)}</td>
                        <td className="px-4 py-3 text-right font-mono">{money(Number(file.amount || 0))}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`rounded-full px-2 py-1 text-[10px] font-black ${delay > 0 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                            {delay > 0 ? `${delay}d vencido` : `${Math.abs(delay)}d regular`}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-black text-indigo-700">{selected ? money(Number(file.amount || 0)) : '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[390px_1fr]">
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-black uppercase tracking-wide text-slate-950">Sumario do lote selecionado</p>
                <div className="mt-4 space-y-3 border-t border-slate-100 pt-4 text-sm">
                  <div className="flex justify-between"><span className="text-slate-500">Faturas em lote</span><b>{selectedBillingInvoices.length} titulos</b></div>
                  <div className="flex justify-between"><span className="text-slate-500">Subtotal original</span><b>{money(selectedBillingTotal)}</b></div>
                  <div className="flex justify-between border-t border-dashed border-slate-200 pt-4 text-lg font-black text-indigo-700">
                    <span>Total consolidado</span><span>{money(selectedBillingTotal)}</span>
                  </div>
                </div>
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs leading-5 text-emerald-800">
                  Isencao de encargos ativa: nao aplicamos multas ou juros de mora.
                </div>
              </div>

              <div className="rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-700">Simulador</p>
                <h4 className="mt-1 text-sm font-black text-slate-950">Negociar acordo de boleto / promissoria</h4>
                <label className="mt-4 flex items-center gap-2 text-xs font-black text-indigo-700">
                  <input type="checkbox" checked={showAgreement} onChange={(event) => setShowAgreement(event.target.checked)} className="h-4 w-4 accent-indigo-600" />
                  Habilitar acordo parcelado
                </label>
                {showAgreement && (
                  <div className="mt-4 grid gap-3">
                    <NumberMini label="Desconto %" value={agreementDiscount} onChange={setAgreementDiscount} />
                    <NumberMini label="Entrada %" value={agreementDownPayment} onChange={setAgreementDownPayment} />
                    <NumberMini label="Parcelas" value={agreementInstallments} onChange={setAgreementInstallments} />
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-[#191756] p-5 text-white shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-white/55">Regua corporativa ativa</p>
                {['Reconciliacao e Notificacao', 'Atestado Oficial', 'Notificacao em Lote'].map((step, index) => (
                  <div key={step} className="mt-4 flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-xs font-black">{index + 1}</span>
                    <div>
                      <p className="text-xs font-black">{step}</p>
                      <p className="mt-1 text-[11px] leading-4 text-white/65">
                        {index === 0 ? 'Disparo amigavel de e-mails detalhados.' : index === 1 ? 'Aviso formalizado para diretoria de compras.' : 'Procedimento final antes de bloqueios comerciais.'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex rounded-xl bg-slate-100 p-1">
                  {(['email', 'whatsapp'] as const).map((channel) => (
                    <button key={channel} type="button" onClick={() => setBillingChannel(channel)}
                      className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-black ${billingChannel === channel ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>
                      {channel === 'email' ? <Mail className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
                      {channel === 'email' ? 'E-mail HTML' : 'WhatsApp'}
                    </button>
                  ))}
                </div>
                <div className="flex rounded-xl bg-slate-100 p-1">
                  {(['1', '2', '3'] as const).map((level) => (
                    <button key={level} type="button" onClick={() => setBillingLevel(level)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-black ${billingLevel === level ? 'bg-amber-100 text-amber-700 shadow-sm' : 'text-slate-500'}`}>
                      Nivel {level}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                {billingChannel === 'email' && <p className="mb-3 rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-700">Assunto: {generateBillingText().subject}</p>}
                <pre className="min-h-[360px] max-h-[560px] overflow-y-auto whitespace-pre-wrap rounded-xl bg-white p-4 font-mono text-xs leading-6 text-slate-800 shadow-inner">{generateBillingText().body}</pre>
              </div>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button onClick={copyBillingText} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm">
                  <Copy className="h-4 w-4" />
                  Copiar canal consolidado
                </button>
                <button onClick={copyBillingText} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-indigo-500/20">
                  <MessageSquare className="h-4 w-4" />
                  Disparar lote integrado
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'docs' && (
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-400">Documentacao operacional</p>
            <h3 className="mt-1 text-lg font-black text-neutral-950">Como usar o motor financeiro</h3>
            <div className="mt-5 space-y-3">
              {[
                ['1. Importar ERP', 'Cole o .md no importador, processe e confira a previa antes de gravar no financeiro.'],
                ['2. Conferir empresas', 'Abra Faturas por Empresa para validar carteira, inadimplencia e risco.'],
                ['3. Cobrar lote', 'Entre na Regua de Cobranca, selecione titulos e copie o canal consolidado.'],
              ].map(([title, text]) => (
                <div key={title} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                  <p className="text-sm font-black text-neutral-950">{title}</p>
                  <p className="mt-1 text-xs font-medium leading-5 text-neutral-500">{text}</p>
                </div>
              ))}
            </div>
          </div>

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
          <div className="rounded-3xl border border-neutral-200 bg-neutral-50 p-5 xl:col-span-2">
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

function NumberMini({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold outline-none focus:border-indigo-500 focus:bg-white"
      />
    </label>
  );
}
