import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../supabase';
import { BankAccount, Company, FiscalFile, UserProfile } from '../../types';
import { fileStatus, fmtDate, fmtDateTime, money, moneyShort } from './shared';
import { logAudit } from '../../lib/audit';
import {
  AlertTriangle,
  BarChart3,
  BellRing,
  Building2,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  History,
  Landmark,
  Loader2,
  Mail,
  PauseCircle,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Upload,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  CollectionEvent,
  CollectionRule,
  CollectionStatus,
  DEFAULT_COLLECTION_RULES,
  DEFAULT_EMAIL_TEMPLATES,
  EmailTemplate,
  ImportedReceivableFile,
  ImportValidationRow,
  bankInstructions,
  bodyToHtml,
  chooseStage,
  collectionPdfBase64,
  daysOverdue,
  downloadCollectionPdf,
  downloadCsv,
  extractPdfText,
  getCollectionStatus,
  getCompanyId,
  isCollectionPaused,
  normalizeKey,
  parseMarkdownReport,
  parseReceivablesSummary,
  rawTextToMarkdown,
  renderTemplate,
  validateImportRows,
  ReceivablesReportSummary,
} from './receivablesEngine';
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

type DeskTab = 'analytics' | 'portfolio' | 'importer' | 'billing' | 'templates' | 'events' | 'playbook';
type Risk = 'Baixo' | 'Medio' | 'Alto' | 'Critico';
type SchemaAvailability = {
  imports: boolean;
  events: boolean;
  rules: boolean;
  templates: boolean;
};

type CompanyExposure = {
  companyId: string;
  name: string;
  cnpj?: string;
  email?: string;
  total: number;
  overdue: number;
  upcoming: number;
  paid: number;
  count: number;
  overdueCount: number;
  pausedCount: number;
  missingEmailCount: number;
  oldestOverdueDays: number;
  risk: Risk;
  invoices: FiscalFile[];
};

const FINANCIAL_TYPES = ['FATURA', 'Hospedagem', 'Alimentacao', 'AlimentaÃ§Ã£o', 'Lavanderia', 'Eventos', 'Transporte', 'Fatura Evento'];
const BUCKET_COLORS = ['#111827', '#10b981', '#f59e0b', '#ef4444', '#7c3aed'];
const EMPTY_SCHEMA: SchemaAvailability = { imports: true, events: true, rules: true, templates: true };
const ACTION_LABEL: Record<ImportValidationRow['action'], string> = {
  create: 'Criar',
  update: 'Atualizar',
  duplicate: 'Duplicada',
  error: 'Erro',
  ignored: 'Ignorar',
};
const STATUS_LABEL: Record<CollectionStatus, string> = {
  open: 'Em aberto',
  awaiting_return: 'Aguardando retorno',
  awaiting_receipt: 'Aguardando comprovante',
  payment_promised: 'Promessa de pagamento',
  disputed: 'Contestada',
  negotiating: 'Em negociacao',
  legal: 'Juridico',
  paid: 'Paga',
  cancelled: 'Cancelada',
};

const PARSER_SAMPLE = `# RELATORIO DE CONTAS A RECEBER
Data de Operacao: ${new Date().toLocaleDateString('pt-BR')}

## PETROBRAS S.A. (CNPJ: 33.000.167/0001-01)
* FT-100234 | Emissao: 12/02/2026 | Vencimento: 12/03/2026 | Vlr Fatura: 100.000,00 | Vlr Receber: 100.000,00 | Status: VENCIDO | P.O.: 4500001
* FT-101112 | Emissao: 15/05/2026 | Vencimento: 15/07/2026 | Vlr Fatura: 100.419,33 | Vlr Receber: 100.419,33 | Status: A VENCER

## SUBSEA 7 LIMITADA (CNPJ: 02.441.989/0001-11)
* FT-100239 | Emissao: 10/03/2026 | Vencimento: 10/04/2026 | Vlr Fatura: 15.200,00 | Vlr Receber: 15.200,00 | Status: VENCIDO`;

export default function FinanceReceivablesDesk({
  profile,
  initialTab = 'analytics',
}: {
  profile: UserProfile;
  initialTab?: DeskTab;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [schema, setSchema] = useState<SchemaAvailability>(EMPTY_SCHEMA);
  const [files, setFiles] = useState<FiscalFile[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [rules, setRules] = useState<CollectionRule[]>(DEFAULT_COLLECTION_RULES);
  const [templates, setTemplates] = useState<EmailTemplate[]>(DEFAULT_EMAIL_TEMPLATES);
  const [events, setEvents] = useState<CollectionEvent[]>([]);
  const [imports, setImports] = useState<ImportedReceivableFile[]>([]);
  const [tab, setTab] = useState<DeskTab>(initialTab);
  const [query, setQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState<Risk | 'Todos'>('Todos');
  const [statusFilter, setStatusFilter] = useState<CollectionStatus | 'Todos'>('Todos');
  const [expandedCompanyId, setExpandedCompanyId] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Record<string, boolean>>({});
  const [billingChannel, setBillingChannel] = useState<'email' | 'whatsapp'>('email');
  const [templateId, setTemplateId] = useState(DEFAULT_EMAIL_TEMPLATES[1].id);
  const [recipientDraft, setRecipientDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [markdownInput, setMarkdownInput] = useState(PARSER_SAMPLE);
  const [validationRows, setValidationRows] = useState<ImportValidationRow[]>([]);
  const [reportSummary, setReportSummary] = useState<ReceivablesReportSummary>({});
  const [currentImportId, setCurrentImportId] = useState('');
  const [importing, setImporting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [templateDraft, setTemplateDraft] = useState<EmailTemplate>(DEFAULT_EMAIL_TEMPLATES[1]);
  const [ruleDrafts, setRuleDrafts] = useState<CollectionRule[]>(DEFAULT_COLLECTION_RULES);

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    const selected = templates.find((template) => template.id === templateId) || templates[0];
    if (selected) setTemplateDraft(selected);
  }, [templateId, templates]);

  async function fetchAll() {
    setLoading(true);
    const [filesRes, companiesRes, bankRes, rulesRes, templatesRes, eventsRes, importsRes] = await Promise.all([
      supabase.from('files').select('*').order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('companies').select('*').order('name'),
      supabase.from('bank_accounts').select('*').order('is_default', { ascending: false }).order('bank_name'),
      optionalSelect<CollectionRule>('collection_rules', 'active,stage'),
      optionalSelect<EmailTemplate>('email_templates', 'active,stage'),
      optionalSelect<CollectionEvent>('collection_events', 'created_at', false, 80),
      optionalSelect<ImportedReceivableFile>('imported_receivable_files', 'created_at', false, 20),
    ]);

    if (filesRes.data) setFiles((filesRes.data as FiscalFile[]).filter((file) => FINANCIAL_TYPES.includes(file.type)));
    if (companiesRes.data) setCompanies(companiesRes.data as Company[]);
    if (bankRes.data) setBankAccounts(bankRes.data as BankAccount[]);
    if (rulesRes.data?.length) {
      setRules(rulesRes.data);
      setRuleDrafts(rulesRes.data);
    }
    if (templatesRes.data?.length) setTemplates(templatesRes.data);
    if (eventsRes.data) setEvents(eventsRes.data);
    if (importsRes.data) setImports(importsRes.data);
    setLoading(false);
  }

  async function optionalSelect<T>(table: string, orderColumn: string, ascending = true, limit?: number) {
    let queryBuilder = supabase.from(table).select('*').order(orderColumn, { ascending });
    if (limit) queryBuilder = queryBuilder.limit(limit);
    const res = await queryBuilder;
    if (res.error) {
      setSchema((prev) => ({ ...prev, [schemaKey(table)]: false }));
      return { data: [] as T[], error: res.error };
    }
    setSchema((prev) => ({ ...prev, [schemaKey(table)]: true }));
    return { data: (res.data || []) as T[], error: null };
  }

  const companyMap = useMemo(() => new Map(companies.map((company) => [company.id, company])), [companies]);
  const defaultBankAccount = bankAccounts.find((account) => account.is_default) || bankAccounts[0];

  const exposures = useMemo<CompanyExposure[]>(() => {
    const map = new Map<string, CompanyExposure>();

    files.filter((file) => !file.is_deleted).forEach((file) => {
      const companyId = getCompanyId(file);
      const company = companyMap.get(companyId);
      const status = fileStatus(file);
      const collectionStatus = getCollectionStatus(file);
      const amount = Number(file.amount || 0);
      const current = map.get(companyId) || {
        companyId,
        name: company?.name || 'Sem empresa vinculada',
        cnpj: company?.cnpj,
        email: company?.email,
        total: 0,
        overdue: 0,
        upcoming: 0,
        paid: 0,
        count: 0,
        overdueCount: 0,
        pausedCount: 0,
        missingEmailCount: 0,
        oldestOverdueDays: 0,
        risk: 'Baixo' as Risk,
        invoices: [],
      };

      current.count += 1;
      current.invoices.push(file);
      if (!company?.email && !file.billing_email_snapshot) current.missingEmailCount += 1;
      if (isCollectionPaused(file)) current.pausedCount += 1;

      if (status === 'paid' || collectionStatus === 'paid') {
        current.paid += amount;
      } else if (status !== 'cancelled' && collectionStatus !== 'cancelled') {
        current.total += amount;
        const delay = daysOverdue(file.due_date || file.dueDate);
        if (delay > 0 || collectionStatus === 'disputed') {
          current.overdue += amount;
          current.overdueCount += 1;
          current.oldestOverdueDays = Math.max(current.oldestOverdueDays, delay);
        } else {
          current.upcoming += amount;
        }
      }

      map.set(companyId, current);
    });

    return Array.from(map.values())
      .map((company) => {
        const risk: Risk =
          company.overdue > 100_000 || company.oldestOverdueDays > 90
            ? 'Critico'
            : company.overdue > 50_000 || company.oldestOverdueDays > 45
              ? 'Alto'
              : company.overdue > 0 || company.pausedCount > 0
                ? 'Medio'
                : 'Baixo';
        return { ...company, risk };
      })
      .sort((a, b) => b.overdue - a.overdue || b.total - a.total);
  }, [files, companyMap]);

  const stats = useMemo(() => {
    const totalReceivable = exposures.reduce((sum, company) => sum + company.total, 0);
    const totalOverdue = exposures.reduce((sum, company) => sum + company.overdue, 0);
    const totalUpcoming = exposures.reduce((sum, company) => sum + company.upcoming, 0);
    const overdueInvoices = exposures.reduce((sum, company) => sum + company.overdueCount, 0);
    const pausedInvoices = exposures.reduce((sum, company) => sum + company.pausedCount, 0);
    const missingEmails = exposures.reduce((sum, company) => sum + company.missingEmailCount, 0);
    const averageDelay = overdueInvoices > 0
      ? Math.round(exposures.reduce((sum, company) => sum + company.oldestOverdueDays * company.overdueCount, 0) / overdueInvoices)
      : 0;
    return {
      totalReceivable,
      totalOverdue,
      totalUpcoming,
      overdueInvoices,
      pausedInvoices,
      missingEmails,
      averageDelay,
      delinquencyRate: totalReceivable > 0 ? (totalOverdue / totalReceivable) * 100 : 0,
    };
  }, [exposures]);

  const agingData = useMemo(() => {
    const buckets = [
      { key: 'a_vencer', label: 'A vencer', value: 0 },
      { key: '1_7', label: '1-7d', value: 0 },
      { key: '8_15', label: '8-15d', value: 0 },
      { key: '16_30', label: '16-30d', value: 0 },
      { key: '31_60', label: '31-60d', value: 0 },
      { key: '61_90', label: '61-90d', value: 0 },
      { key: '90_plus', label: '+90d', value: 0 },
    ];
    files.filter((file) => !file.is_deleted && fileStatus(file) !== 'paid' && fileStatus(file) !== 'cancelled').forEach((file) => {
      const delay = daysOverdue(file.due_date || file.dueDate);
      const amount = Number(file.amount || 0);
      if (delay === 0) buckets[0].value += amount;
      else if (delay <= 7) buckets[1].value += amount;
      else if (delay <= 15) buckets[2].value += amount;
      else if (delay <= 30) buckets[3].value += amount;
      else if (delay <= 60) buckets[4].value += amount;
      else if (delay <= 90) buckets[5].value += amount;
      else buckets[6].value += amount;
    });
    return buckets;
  }, [files]);

  const stageSummary = useMemo(() => rules.filter((rule) => rule.active).map((rule) => {
    const matching = files.filter((file) => !file.is_deleted && chooseStage(file) === rule.stage);
    return {
      ...rule,
      count: matching.length,
      total: matching.reduce((sum, file) => sum + Number(file.amount || 0), 0),
      companies: new Set(matching.map(getCompanyId)).size,
    };
  }), [files, rules]);

  const filteredExposures = exposures.filter((company) => {
    const q = query.trim().toLowerCase();
    const matchesQuery = !q || company.name.toLowerCase().includes(q) || (company.cnpj || '').includes(q);
    const matchesRisk = riskFilter === 'Todos' || company.risk === riskFilter;
    const matchesStatus = statusFilter === 'Todos' || company.invoices.some((file) => getCollectionStatus(file) === statusFilter);
    return matchesQuery && matchesRisk && matchesStatus;
  });

  const selectedCompany = exposures.find((company) => company.companyId === selectedCompanyId) || exposures.find((company) => company.overdue > 0) || exposures[0];
  const selectedCompanyRecord = selectedCompany ? companyMap.get(selectedCompany.companyId) || { id: selectedCompany.companyId, name: selectedCompany.name, cnpj: selectedCompany.cnpj || '', slug: normalizeKey(selectedCompany.name), email: selectedCompany.email } : undefined;
  const billableInvoices = (selectedCompany?.invoices || []).filter((file) => {
    const status = fileStatus(file);
    if (status === 'paid' || status === 'cancelled') return false;
    if (isCollectionPaused(file)) return false;
    return true;
  });
  const selectedInvoices = billableInvoices.filter((file) => selectedInvoiceIds[file.id] ?? daysOverdue(file.due_date || file.dueDate) > 0);
  const activeTemplate = templates.find((template) => template.id === templateId) || templates[0] || DEFAULT_EMAIL_TEMPLATES[1];
  const renderedBilling = selectedCompanyRecord
    ? renderTemplate(activeTemplate, { company: selectedCompanyRecord, invoices: selectedInvoices, account: defaultBankAccount })
    : { subject: '', body: 'Selecione uma empresa para preparar a cobranca.' };
  const recipient = recipientDraft.trim() || selectedCompany?.email || selectedInvoices.find((file) => file.billing_email_snapshot)?.billing_email_snapshot || '';
  const schemaMissing = Object.entries(schema).filter(([, ok]) => !ok).map(([key]) => key);

  async function handlePdfUpload(file: File) {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      toast.error('Envie um arquivo PDF.');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error('PDF acima de 15 MB. Divida o relatorio antes de importar.');
      return;
    }

    setExtracting(true);
    const toastId = toast.loading('Extraindo PDF do ERP...');
    try {
      const storagePath = `receivables-imports/${new Date().getFullYear()}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
      const upload = await supabase.storage.from('files').upload(storagePath, file, { upsert: false, contentType: file.type });
      if (upload.error) throw upload.error;

      const importId = await createImportRecord({
        filename: file.name,
        storage_path: storagePath,
        file_type: 'pdf',
        extraction_status: 'processing',
      });
      setCurrentImportId(importId);

      const rawText = await extractPdfText(file);
      const markdown = rawTextToMarkdown(rawText);
      const parsed = parseMarkdownReport(markdown);
      const rows = validateImportRows(parsed, companies, files);
      const summary = parseReceivablesSummary(markdown);
      setMarkdownInput(markdown);
      setValidationRows(rows);
      setReportSummary(summary);
      await updateImportRecord(importId, {
        extraction_status: 'awaiting_validation',
        raw_text: rawText,
        markdown_content: markdown,
        parsed_json: parsed,
        validation_json: rows,
      });
      toast.success(importToastMessage(rows, summary, parsed.length), { id: toastId });
      setTab('importer');
    } catch (error: any) {
      toast.error(error.message || 'Falha ao extrair PDF.', { id: toastId });
    } finally {
      setExtracting(false);
    }
  }

  function runMarkdownParser() {
    try {
      const markdown = rawTextToMarkdown(markdownInput);
      const parsed = parseMarkdownReport(markdown);
      if (parsed.length === 0) throw new Error('Nenhuma empresa/fatura encontrada.');
      const rows = validateImportRows(parsed, companies, files);
      const summary = parseReceivablesSummary(markdown);
      setMarkdownInput(markdown);
      setValidationRows(rows);
      setReportSummary(summary);
      toast.success(importToastMessage(rows, summary, parsed.length));
    } catch (error: any) {
      toast.error(error.message || 'Nao foi possivel interpretar o relatorio.');
    }
  }

  async function confirmImport() {
    const rows = validationRows.filter((row) => row.selected && row.action !== 'duplicate' && row.action !== 'error' && row.action !== 'ignored');
    if (rows.length === 0) {
      toast.error('Nenhuma linha valida selecionada.');
      return;
    }

    setImporting(true);
    const toastId = toast.loading('Gravando importacao revisada...');
    try {
      const refreshedCompanies = [...companies];
      const nextFiles: FiscalFile[] = [...files];
      let created = 0;
      let updated = 0;
      let companiesCreated = 0;

      for (const row of rows) {
        const company = await resolveCompany(row, refreshedCompanies);
        if (!row.matchedCompanyId && !companies.some((item) => item.id === company.id)) companiesCreated += 1;

        if (row.action === 'update' && row.existingFileId) {
          const payload = buildFilePayload(row, company.id);
          await updateFileWithFallback(row.existingFileId, payload);
          const index = nextFiles.findIndex((file) => file.id === row.existingFileId);
          if (index >= 0) nextFiles[index] = { ...nextFiles[index], ...payload } as FiscalFile;
          updated += 1;
        } else {
          const payload = buildFilePayload(row, company.id);
          const inserted = await insertFileWithFallback(payload);
          nextFiles.unshift(inserted);
          created += 1;
        }
      }

      setCompanies(refreshedCompanies);
      setFiles(nextFiles);
      await updateImportRecord(currentImportId, {
        extraction_status: 'imported',
        validation_json: validationRows,
        imported_by: profile.id,
        imported_at: new Date().toISOString(),
      });
      await logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Regua - importacao de recebiveis confirmada',
        details: { created, updated, companiesCreated, sourceImportId: currentImportId || null },
        type: 'upload',
      });
      setValidationRows([]);
      setCurrentImportId('');
      await fetchAll();
      toast.success(`Importacao concluida: ${created} criada(s), ${updated} atualizada(s).`, { id: toastId });
    } catch (error: any) {
      toast.error(error.message || 'Falha ao confirmar importacao.', { id: toastId });
    } finally {
      setImporting(false);
    }
  }

  async function resolveCompany(row: ImportValidationRow, refreshedCompanies: Company[]) {
    const existing = refreshedCompanies.find((company) =>
      company.id === row.matchedCompanyId ||
      (row.companyDocument && company.cnpj === row.companyDocument) ||
      normalizeKey(company.name) === normalizeKey(row.companyName)
    );
    if (existing) return existing;

    const payload = {
      name: row.companyName,
      cnpj: row.companyDocument || '',
      slug: normalizeKey(row.companyName) || crypto.randomUUID(),
      status: 'active',
    };
    const { data, error } = await supabase.from('companies').insert([payload]).select().single();
    if (error) throw error;
    refreshedCompanies.push(data as Company);
    return data as Company;
  }

  function buildFilePayload(row: ImportValidationRow, companyId: string) {
    const invoice = row.invoice;
    const collectionStage = invoice.overdueDays > 30 ? 'critical' : invoice.overdueDays > 15 ? 'formal' : invoice.overdueDays > 7 ? 'active' : invoice.overdueDays > 0 ? 'soft' : 'preventive';
    return {
      company_id: companyId,
      type: invoice.invoiceType || 'FATURA',
      period: invoice.issueDate.slice(0, 7),
      original_name: `${invoice.invoiceNum} - ${row.companyName}`,
      storage_path: currentImportId ? `receivables-import/${currentImportId}/${invoice.invoiceNum}.json` : `receivables-import/manual/${invoice.invoiceNum}.json`,
      upload_date: new Date().toISOString(),
      uploader_id: profile.id,
      due_date: invoice.dueDate,
      amount: invoice.openAmount,
      category: 'Importacao ERP Regua',
      status: 'PENDING',
      tracking_stage: 'finance',
      tracking_status: invoice.overdueDays > 0 ? 'pending' : 'ok',
      tracking_notes: `Importado pela Regua | Emissao: ${invoice.issueDate} | Atraso: ${invoice.overdueDays} dia(s) | ${row.reason}`,
      tracking_updated_at: new Date().toISOString(),
      tracking_updated_by: profile.name,
      collection_status: 'open',
      collection_stage: collectionStage,
      collection_owner: profile.name,
      purchase_order: invoice.purchaseOrder || null,
      source_import_id: currentImportId || null,
    };
  }

  async function insertFileWithFallback(payload: Record<string, unknown>) {
    const { data, error } = await supabase.from('files').insert([payload]).select().single();
    if (!error) return data as FiscalFile;
    const fallback = stripNewFileColumns(payload);
    const retry = await supabase.from('files').insert([fallback]).select().single();
    if (retry.error) throw retry.error;
    return retry.data as FiscalFile;
  }

  async function updateFileWithFallback(id: string, payload: Record<string, unknown>) {
    const updatePayload = {
      due_date: payload.due_date,
      amount: payload.amount,
      category: payload.category,
      tracking_status: payload.tracking_status,
      tracking_notes: payload.tracking_notes,
      tracking_updated_at: payload.tracking_updated_at,
      tracking_updated_by: payload.tracking_updated_by,
      collection_status: payload.collection_status,
      collection_stage: payload.collection_stage,
      collection_owner: payload.collection_owner,
      purchase_order: payload.purchase_order,
      source_import_id: payload.source_import_id,
    };
    const { error } = await supabase.from('files').update(updatePayload).eq('id', id);
    if (!error) return;
    const retry = await supabase.from('files').update(stripNewFileColumns(updatePayload)).eq('id', id);
    if (retry.error) throw retry.error;
  }

  async function updateCollectionStatus(file: FiscalFile, status: CollectionStatus, promiseDate?: string) {
    const payload = {
      collection_status: status,
      promise_payment_date: status === 'payment_promised' ? promiseDate || file.promise_payment_date || null : null,
      collection_stage: status === 'legal' ? 'legal' : chooseStage({ ...file, collection_status: status }),
      next_collection_action_at: status === 'payment_promised' ? promiseDate || null : null,
      tracking_notes: `${file.tracking_notes || ''}\nRegua: ${STATUS_LABEL[status]} em ${new Date().toLocaleString('pt-BR')}`.trim(),
      tracking_updated_at: new Date().toISOString(),
      tracking_updated_by: profile.name,
    };
    const { error } = await supabase.from('files').update(payload).eq('id', file.id);
    if (error) {
      const retry = await supabase.from('files').update(stripNewFileColumns(payload)).eq('id', file.id);
      if (retry.error) throw retry.error;
    }
    setFiles((prev) => prev.map((item) => item.id === file.id ? { ...item, ...payload } as FiscalFile : item));
    await createCollectionEvent({
      company_id: getCompanyId(file),
      invoice_id: file.id,
      event_type: 'status_change',
      channel: 'internal',
      status: 'prepared',
      subject: `Status alterado para ${STATUS_LABEL[status]}`,
      message: payload.tracking_notes,
      notes: promiseDate ? `Promessa em ${fmtDate(promiseDate)}` : undefined,
    });
    toast.success(`Status atualizado: ${STATUS_LABEL[status]}`);
  }

  function toggleInvoice(id: string) {
    setSelectedInvoiceIds((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }));
  }

  function selectInvoices(mode: 'overdue' | 'all' | 'critical' | 'none') {
    if (mode === 'none') {
      setSelectedInvoiceIds({});
      return;
    }
    const next: Record<string, boolean> = {};
    billableInvoices.forEach((file) => {
      const delay = daysOverdue(file.due_date || file.dueDate);
      next[file.id] = mode === 'all' || (mode === 'overdue' && delay > 0) || (mode === 'critical' && delay > 30);
    });
    setSelectedInvoiceIds(next);
  }

  async function copyBilling() {
    await navigator.clipboard.writeText(billingChannel === 'email' ? `Assunto: ${renderedBilling.subject}\n\n${renderedBilling.body}` : renderedBilling.body);
    toast.success('Cobranca copiada.');
    await createCollectionEvent({
      company_id: selectedCompany?.companyId,
      event_type: 'copy',
      channel: billingChannel,
      status: 'prepared',
      subject: renderedBilling.subject,
      message: renderedBilling.body,
      notes: `${selectedInvoices.length} titulo(s) preparados para copia manual.`,
    });
  }

  async function sendEmailBatch() {
    if (!selectedCompanyRecord || selectedInvoices.length === 0) {
      toast.error('Selecione empresa e faturas.');
      return;
    }
    if (!recipient || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) {
      toast.error('Informe um e-mail financeiro valido.');
      return;
    }

    setSending(true);
    const toastId = toast.loading('Enviando cobranca com PDF...');
    try {
      const pdfBase64 = collectionPdfBase64({
        company: selectedCompanyRecord,
        invoices: selectedInvoices,
        account: defaultBankAccount,
        subject: renderedBilling.subject,
      });
      const result = await supabase.functions.invoke('send-resend-email', {
        body: {
          to: recipient,
          subject: renderedBilling.subject,
          html: bodyToHtml(renderedBilling.body),
          attachments: [{
            filename: `cobranca_${normalizeKey(selectedCompanyRecord.name)}_${new Date().toISOString().slice(0, 10)}.pdf`,
            content: pdfBase64,
            contentType: 'application/pdf',
          }],
        },
      });
      if (result.error) throw result.error;
      if ((result.data as any)?.ok === false) throw new Error((result.data as any).error || 'Resend rejeitou o envio.');

      await Promise.all(selectedInvoices.map((file) => supabase.from('files').update({
        last_collection_event_at: new Date().toISOString(),
        collection_status: 'awaiting_return',
        collection_stage: chooseStage(file),
        billing_email_snapshot: recipient,
      }).eq('id', file.id).then(async ({ error }) => {
        if (error) {
          await supabase.from('files').update({
            tracking_notes: `${file.tracking_notes || ''}\nCobranca enviada para ${recipient}`,
            tracking_updated_at: new Date().toISOString(),
            tracking_updated_by: profile.name,
          }).eq('id', file.id);
        }
      })));

      await createCollectionEvent({
        company_id: selectedCompany.companyId,
        event_type: 'billing_email',
        channel: 'email',
        status: 'sent',
        subject: renderedBilling.subject,
        message: renderedBilling.body,
        recipients: [recipient],
        sent_at: new Date().toISOString(),
        notes: `${selectedInvoices.length} titulo(s), anexo PDF gerado client-side.`,
      });
      await logAudit({
        user_id: profile.id,
        user_name: profile.name,
        action: 'Regua - cobranca enviada com PDF',
        details: { company: selectedCompanyRecord.name, recipient, invoices: selectedInvoices.map((file) => file.id) },
        type: 'update',
      });
      await fetchAll();
      toast.success('Cobranca enviada e registrada.', { id: toastId });
    } catch (error: any) {
      await createCollectionEvent({
        company_id: selectedCompany?.companyId,
        event_type: 'billing_email',
        channel: 'email',
        status: 'failed',
        subject: renderedBilling.subject,
        message: renderedBilling.body,
        recipients: recipient ? [recipient] : [],
        notes: error.message || 'Falha no envio.',
      });
      toast.error(error.message || 'Falha ao enviar cobranca.', { id: toastId });
    } finally {
      setSending(false);
    }
  }

  async function saveTemplate() {
    const payload = {
      name: templateDraft.name,
      subject: templateDraft.subject,
      body: templateDraft.body,
      tone: templateDraft.tone || 'professional',
      stage: templateDraft.stage || 'active',
      active: templateDraft.active,
    };
    if (schema.templates && !templateDraft.id.endsWith('-default')) {
      const { error } = await supabase.from('email_templates').update(payload).eq('id', templateDraft.id);
      if (error) {
        toast.error(error.message);
        return;
      }
    }
    setTemplates((prev) => prev.map((template) => template.id === templateDraft.id ? { ...templateDraft } : template));
    toast.success(schema.templates ? 'Template salvo.' : 'Template atualizado localmente. Aplique a migration para persistir.');
  }

  async function saveRules() {
    setRules(ruleDrafts);
    if (!schema.rules) {
      toast.message('Regras aplicadas localmente. Aplique a migration para persistir no banco.');
      return;
    }
    for (const rule of ruleDrafts) {
      if (rule.id.length < 20) continue;
      await supabase.from('collection_rules').update({
        name: rule.name,
        description: rule.description,
        days_before_due: rule.days_before_due,
        days_after_due: rule.days_after_due,
        action_type: rule.action_type,
        stage: rule.stage,
        active: rule.active,
      }).eq('id', rule.id);
    }
    toast.success('Regras salvas.');
  }

  async function createImportRecord(payload: Partial<ImportedReceivableFile>) {
    if (!schema.imports) return '';
    const { data, error } = await supabase.from('imported_receivable_files').insert([payload]).select().single();
    if (error) {
      setSchema((prev) => ({ ...prev, imports: false }));
      return '';
    }
    setImports((prev) => [data as ImportedReceivableFile, ...prev]);
    return (data as ImportedReceivableFile).id;
  }

  async function updateImportRecord(id: string, payload: Record<string, unknown>) {
    if (!id || !schema.imports) return;
    const { error } = await supabase.from('imported_receivable_files').update(payload).eq('id', id);
    if (error) setSchema((prev) => ({ ...prev, imports: false }));
  }

  async function createCollectionEvent(payload: Partial<CollectionEvent>) {
    const eventPayload = {
      ...payload,
      user_id: profile.id,
      created_at: new Date().toISOString(),
    };
    if (schema.events) {
      const { data, error } = await supabase.from('collection_events').insert([eventPayload]).select().single();
      if (!error && data) {
        setEvents((prev) => [data as CollectionEvent, ...prev].slice(0, 80));
        return;
      }
      if (error) setSchema((prev) => ({ ...prev, events: false }));
    }
    setEvents((prev) => [{ id: crypto.randomUUID(), ...eventPayload } as CollectionEvent, ...prev].slice(0, 80));
  }

  function exportPortfolio() {
    const rows = filteredExposures.flatMap((company) => company.invoices.map((file) => ({
      Cliente: company.name,
      Documento: company.cnpj || '',
      Fatura: file.original_name,
      Vencimento: fmtDate(file.due_date || file.dueDate),
      Atraso: daysOverdue(file.due_date || file.dueDate),
      Valor: Number(file.amount || 0).toFixed(2).replace('.', ','),
      Status: STATUS_LABEL[getCollectionStatus(file)],
      Estagio: chooseStage(file),
      Responsavel: file.collection_owner || '',
      PO: file.purchase_order || '',
    })));
    downloadCsv(`carteira_regua_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  if (loading) {
    return (
      <div className="flex min-h-[42vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-300" />
      </div>
    );
  }

  return (
    <div className="space-y-6 bg-[#f6f8fb] p-1 text-slate-900">
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-900/15">
              <BellRing className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight text-slate-950">Regua de Cobranca / Inadimplencia</h2>
              <p className="text-[11px] font-medium tracking-wide text-slate-500">Carteira B2B, importacao ERP, cobranca manual com PDF e auditoria</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={fetchAll} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600">
              <RefreshCw className="h-3.5 w-3.5" />
              Atualizar
            </button>
            <button onClick={() => fileInputRef.current?.click()} disabled={extracting} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white shadow-lg shadow-indigo-500/20 disabled:opacity-60">
              {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Importar PDF ERP
            </button>
            <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) handlePdfUpload(file);
              event.currentTarget.value = '';
            }} />
          </div>
        </div>

        {schemaMissing.length > 0 && (
          <div className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-xs font-bold text-amber-800">
            Migration pendente no banco: {schemaMissing.join(', ')}. A tela continua operando com fallback, mas eventos/templates/importacoes so persistem apos aplicar `supabase/migrations/20260608000100_receivables_collection_professionalization.sql`.
          </div>
        )}

        <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi title="Carteira aberta" value={money(stats.totalReceivable)} detail={`${exposures.length} cliente(s)`} tone="neutral" icon={Landmark} />
          <Kpi title="Vencido" value={money(stats.totalOverdue)} detail={`${stats.delinquencyRate.toFixed(1)}% da carteira`} tone="red" icon={AlertTriangle} />
          <Kpi title="A vencer" value={money(stats.totalUpcoming)} detail="Fluxo futuro monitorado" tone="emerald" icon={Clock} />
          <Kpi title="Pausadas / sem e-mail" value={`${stats.pausedInvoices}/${stats.missingEmails}`} detail="Promessas, comprovantes e lacunas" tone="amber" icon={PauseCircle} />
        </div>
      </div>

      <div className="flex max-w-full gap-3 overflow-x-auto border-b border-slate-200 pb-3">
        {[
          ['analytics', 'Painel', BarChart3],
          ['portfolio', 'Carteira', Building2],
          ['billing', 'Cobrar lote', Send],
          ['importer', 'Importador', Upload],
          ['templates', 'Templates', Settings2],
          ['events', 'Historico', History],
          ['playbook', 'Playbook', ShieldCheck],
        ].map(([id, label, Icon]) => (
          <button key={id as string} type="button" onClick={() => setTab(id as DeskTab)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-black transition ${tab === id ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:bg-white hover:text-slate-950'}`}>
            <Icon className="h-3.5 w-3.5" />
            {label as string}
          </button>
        ))}
      </div>

      {tab === 'analytics' && (
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <Panel title="Aging financeiro" eyebrow="Distribuicao por atraso">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={agingData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(value) => moneyShort(Number(value))} />
                  <Tooltip formatter={(value) => money(Number(value))} cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                    {agingData.map((entry, index) => <Cell key={entry.key} fill={BUCKET_COLORS[index % BUCKET_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Pipeline da regua" eyebrow="Etapas ativas">
            <div className="space-y-3">
              {stageSummary.map((stage) => (
                <div key={stage.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-950">{stage.name}</p>
                      <p className="mt-1 text-xs font-medium text-slate-500">{stage.description || stage.stage}</p>
                    </div>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-slate-600 ring-1 ring-slate-200">{stage.count}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs font-bold text-slate-500">
                    <span>{stage.companies} empresa(s)</span>
                    <span className="font-mono text-slate-950">{money(stage.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {tab === 'portfolio' && (
        <Panel title="Carteira de inadimplencia" eyebrow="Tabela profissional e filtros">
          <Toolbar
            query={query}
            setQuery={setQuery}
            riskFilter={riskFilter}
            setRiskFilter={setRiskFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            onExport={exportPortfolio}
          />
          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Aberto</th>
                  <th className="px-4 py-3">Vencido</th>
                  <th className="px-4 py-3">Faturas</th>
                  <th className="px-4 py-3">Maior atraso</th>
                  <th className="px-4 py-3">Risco</th>
                  <th className="px-4 py-3">Proxima acao</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredExposures.map((company) => {
                  const expanded = expandedCompanyId === company.companyId;
                  return (
                    <tr key={company.companyId} className="align-top">
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => setExpandedCompanyId(expanded ? '' : company.companyId)} className="text-left">
                          <span className="block font-black text-slate-950">{company.name}</span>
                          <span className="text-xs font-medium text-slate-400">{company.cnpj || 'Sem CNPJ'} {company.email ? `- ${company.email}` : '- sem e-mail financeiro'}</span>
                        </button>
                        {expanded && (
                          <div className="mt-3 space-y-2">
                            {company.invoices.map((file) => (
                              <div key={file.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-mono text-xs font-black text-slate-700">{file.original_name}</span>
                                  <span className="text-xs font-black text-slate-950">{money(Number(file.amount || 0))}</span>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold text-slate-500">
                                  <span>Vcto {fmtDate(file.due_date || file.dueDate)}</span>
                                  <span>{daysOverdue(file.due_date || file.dueDate)}d atraso</span>
                                  <span>{STATUS_LABEL[getCollectionStatus(file)]}</span>
                                  {file.purchase_order && <span>P.O. {file.purchase_order}</span>}
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <MiniButton onClick={() => updateCollectionStatus(file, 'awaiting_receipt')}>Comprovante</MiniButton>
                                  <MiniButton onClick={() => updateCollectionStatus(file, 'disputed')}>Contestar</MiniButton>
                                  <MiniButton onClick={() => updateCollectionStatus(file, 'negotiating')}>Negociar</MiniButton>
                                  <MiniButton onClick={() => {
                                    const date = window.prompt('Data prometida (AAAA-MM-DD):', file.promise_payment_date || new Date().toISOString().slice(0, 10));
                                    if (date) updateCollectionStatus(file, 'payment_promised', date);
                                  }}>Promessa</MiniButton>
                                  <MiniButton onClick={() => updateCollectionStatus(file, 'open')}>Reativar</MiniButton>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono font-black">{money(company.total)}</td>
                      <td className="px-4 py-3 font-mono font-black text-rose-600">{money(company.overdue)}</td>
                      <td className="px-4 py-3">{company.count}</td>
                      <td className="px-4 py-3">{company.oldestOverdueDays}d</td>
                      <td className="px-4 py-3"><RiskPill risk={company.risk} /></td>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => { setSelectedCompanyId(company.companyId); setTab('billing'); }}
                          className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-black text-white">
                          Cobrar lote
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {tab === 'billing' && (
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <Panel title="Lote de cobranca" eyebrow="Selecao e governanca">
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Empresa</span>
              <select value={selectedCompany?.companyId || ''} onChange={(event) => { setSelectedCompanyId(event.target.value); setSelectedInvoiceIds({}); }}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold">
                {exposures.map((company) => <option key={company.companyId} value={company.companyId}>{company.name} - {money(company.overdue || company.total)}</option>)}
              </select>
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <MiniButton onClick={() => selectInvoices('overdue')}>Vencidas</MiniButton>
              <MiniButton onClick={() => selectInvoices('critical')}>Criticas +30d</MiniButton>
              <MiniButton onClick={() => selectInvoices('all')}>Tudo aberto</MiniButton>
              <MiniButton onClick={() => selectInvoices('none')}>Limpar</MiniButton>
            </div>
            <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto">
              {billableInvoices.map((file) => {
                const selected = selectedInvoiceIds[file.id] ?? daysOverdue(file.due_date || file.dueDate) > 0;
                return (
                  <label key={file.id} className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <input type="checkbox" checked={selected} onChange={() => toggleInvoice(file.id)} className="mt-1 h-4 w-4 accent-indigo-600" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-black text-slate-950">{file.original_name}</span>
                      <span className="mt-1 block text-[11px] font-medium text-slate-500">
                        Vcto {fmtDate(file.due_date || file.dueDate)} - {daysOverdue(file.due_date || file.dueDate)}d atraso - {money(Number(file.amount || 0))}
                      </span>
                    </span>
                  </label>
                );
              })}
              {billableInvoices.length === 0 && <EmptyState text="Nenhuma fatura apta. Pagas, canceladas e pausadas nao entram no lote." />}
            </div>
          </Panel>

          <Panel title="Mensagem, PDF e envio" eyebrow="Sem gateway de pagamento">
            <div className="grid gap-3 lg:grid-cols-2">
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Template</span>
                <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold">
                  {templates.filter((template) => template.active).map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Destinatario financeiro</span>
                <input value={recipientDraft} onChange={(event) => setRecipientDraft(event.target.value)} placeholder={selectedCompany?.email || 'financeiro@cliente.com'}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold" />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => setBillingChannel('email')} className={`rounded-xl px-3 py-2 text-xs font-black ${billingChannel === 'email' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>E-mail</button>
              <button onClick={() => setBillingChannel('whatsapp')} className={`rounded-xl px-3 py-2 text-xs font-black ${billingChannel === 'whatsapp' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>WhatsApp</button>
              <span className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">Total {money(selectedInvoices.reduce((sum, file) => sum + Number(file.amount || 0), 0))}</span>
            </div>
            {billingChannel === 'email' && <div className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-700">Assunto: {renderedBilling.subject}</div>}
            <pre className="mt-3 min-h-[300px] max-h-[440px] overflow-y-auto whitespace-pre-wrap rounded-2xl bg-slate-950 p-4 font-mono text-xs leading-6 text-white">{renderedBilling.body}</pre>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <ActionButton onClick={copyBilling} icon={Copy}>Copiar</ActionButton>
              <ActionButton onClick={() => selectedCompanyRecord && downloadCollectionPdf({ company: selectedCompanyRecord, invoices: selectedInvoices, account: defaultBankAccount, subject: renderedBilling.subject })} icon={Download}>PDF</ActionButton>
              <ActionButton onClick={() => downloadCsv(`lote_cobranca_${new Date().toISOString().slice(0, 10)}.csv`, selectedInvoices.map((file) => ({ Fatura: file.original_name, Vencimento: fmtDate(file.due_date || file.dueDate), Valor: Number(file.amount || 0), Atraso: daysOverdue(file.due_date || file.dueDate) })))} icon={FileSpreadsheet}>CSV</ActionButton>
              <ActionButton onClick={sendEmailBatch} disabled={sending || selectedInvoices.length === 0} icon={sending ? Loader2 : Mail}>Enviar</ActionButton>
            </div>
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs leading-5 text-emerald-800">
              {bankInstructions(defaultBankAccount)}
            </div>
          </Panel>
        </div>
      )}

      {tab === 'importer' && (
        <Panel title="Importador ERP" eyebrow="PDF, Markdown, JSON e pre-validacao humana">
          <div className="grid min-w-0 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="min-w-0">
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
                <Upload className="mx-auto h-8 w-8 text-slate-400" />
                <p className="mt-2 text-sm font-black text-slate-950">Upload de PDF do ERP</p>
                <p className="mt-1 text-xs font-medium text-slate-500">O PDF e salvo no storage privado, extraido e convertido para Markdown antes da validacao.</p>
                <button onClick={() => fileInputRef.current?.click()} className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white">Escolher PDF</button>
              </div>
              <textarea value={markdownInput} onChange={(event) => setMarkdownInput(event.target.value)}
                className="mt-4 h-[360px] w-full rounded-2xl border border-slate-200 bg-white p-4 font-mono text-xs leading-6 outline-none focus:border-indigo-400"
              />
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <ActionButton onClick={runMarkdownParser} icon={Eye}>Gerar pre-validacao</ActionButton>
                <ActionButton onClick={() => setMarkdownInput(PARSER_SAMPLE)} icon={FileText}>Exemplo</ActionButton>
              </div>
            </div>
            <div className="min-w-0">
              <div className="mb-3 grid gap-2 sm:flex sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-950">Pre-validacao editavel</p>
                  <p className="text-xs font-medium text-slate-500">{validationRows.length} linha(s), {validationRows.filter((row) => row.selected).length} selecionada(s)</p>
                </div>
                <button onClick={confirmImport} disabled={importing || validationRows.length === 0} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50 sm:w-auto">
                  {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Confirmar importacao
                </button>
              </div>
              {(reportSummary.invoiceCount || reportSummary.companyCount) && (
                <div className={`mb-3 rounded-2xl border p-3 text-xs font-bold ${
                  reportSummary.invoiceCount === validationRows.length
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-amber-200 bg-amber-50 text-amber-800'
                }`}>
                  Resumo do arquivo: {reportSummary.companyCount ?? '-'} empresa(s), {reportSummary.invoiceCount ?? '-'} fatura(s), total {money(reportSummary.totalReceivable || 0)}.
                  Extraido: {new Set(validationRows.map((row) => `${row.companyName}|${row.companyDocument || ''}`)).size} empresa(s), {validationRows.length} fatura(s).
                </div>
              )}
              <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1 lg:hidden">
                {validationRows.map((row) => (
                  <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <label className="flex items-center gap-2 text-xs font-black text-slate-700">
                        <input type="checkbox" checked={row.selected} onChange={() => patchValidationRow(row.id, { selected: !row.selected })} className="h-4 w-4 accent-indigo-600" />
                        {row.invoice.invoiceNum}
                      </label>
                      <select value={row.action} onChange={(event) => patchValidationRow(row.id, { action: event.target.value as ImportValidationRow['action'] })}
                        className="max-w-[120px] rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold">
                        {Object.entries(ACTION_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                      </select>
                    </div>
                    <div className="mt-3 grid gap-2">
                      <label className="block">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Cliente</span>
                        <input value={row.companyName} onChange={(event) => patchValidationRow(row.id, { companyName: event.target.value })}
                          className="mt-1 w-full min-w-0 rounded-lg border border-slate-200 px-2 py-1 text-xs" />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Vencimento</span>
                          <input type="date" value={row.invoice.dueDate} onChange={(event) => patchInvoice(row.id, { dueDate: event.target.value, overdueDays: daysOverdue(event.target.value) })}
                            className="mt-1 w-full min-w-0 rounded-lg border border-slate-200 px-2 py-1 text-xs" />
                        </label>
                        <label className="block">
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Valor</span>
                          <input type="number" value={row.invoice.openAmount} onChange={(event) => patchInvoice(row.id, { openAmount: Number(event.target.value), originalAmount: Number(event.target.value) })}
                            className="mt-1 w-full min-w-0 rounded-lg border border-slate-200 px-2 py-1 text-right text-xs" />
                        </label>
                      </div>
                      <label className="block">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">P.O.</span>
                        <input value={row.invoice.purchaseOrder || ''} onChange={(event) => patchInvoice(row.id, { purchaseOrder: event.target.value })}
                          className="mt-1 w-full min-w-0 rounded-lg border border-slate-200 px-2 py-1 text-xs" />
                      </label>
                      <p className="text-xs leading-5 text-slate-500">{row.reason}</p>
                    </div>
                  </div>
                ))}
                {validationRows.length === 0 && <EmptyState text="Envie um PDF ou cole um Markdown para gerar a pre-validacao." />}
              </div>
              <div className="hidden max-h-[560px] overflow-auto rounded-2xl border border-slate-200 lg:block">
                <table className="w-full min-w-[960px] text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-3 py-2">OK</th>
                      <th className="px-3 py-2">Acao</th>
                      <th className="px-3 py-2">Cliente</th>
                      <th className="px-3 py-2">Fatura</th>
                      <th className="px-3 py-2">Vencimento</th>
                      <th className="px-3 py-2">Valor aberto</th>
                      <th className="px-3 py-2">P.O.</th>
                      <th className="px-3 py-2">Motivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {validationRows.map((row) => (
                      <tr key={row.id}>
                        <td className="px-3 py-2"><input type="checkbox" checked={row.selected} onChange={() => patchValidationRow(row.id, { selected: !row.selected })} className="h-4 w-4 accent-indigo-600" /></td>
                        <td className="px-3 py-2">
                          <select value={row.action} onChange={(event) => patchValidationRow(row.id, { action: event.target.value as ImportValidationRow['action'] })}
                            className="rounded-lg border border-slate-200 px-2 py-1 font-bold">
                            {Object.entries(ACTION_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2"><input value={row.companyName} onChange={(event) => patchValidationRow(row.id, { companyName: event.target.value })} className="w-44 rounded-lg border border-slate-200 px-2 py-1" /></td>
                        <td className="px-3 py-2"><input value={row.invoice.invoiceNum} onChange={(event) => patchInvoice(row.id, { invoiceNum: event.target.value })} className="w-32 rounded-lg border border-slate-200 px-2 py-1 font-mono" /></td>
                        <td className="px-3 py-2"><input type="date" value={row.invoice.dueDate} onChange={(event) => patchInvoice(row.id, { dueDate: event.target.value, overdueDays: daysOverdue(event.target.value) })} className="rounded-lg border border-slate-200 px-2 py-1" /></td>
                        <td className="px-3 py-2"><input type="number" value={row.invoice.openAmount} onChange={(event) => patchInvoice(row.id, { openAmount: Number(event.target.value), originalAmount: Number(event.target.value) })} className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-right" /></td>
                        <td className="px-3 py-2"><input value={row.invoice.purchaseOrder || ''} onChange={(event) => patchInvoice(row.id, { purchaseOrder: event.target.value })} className="w-28 rounded-lg border border-slate-200 px-2 py-1" /></td>
                        <td className="px-3 py-2 text-slate-500">{row.reason}</td>
                      </tr>
                    ))}
                    {validationRows.length === 0 && (
                      <tr><td colSpan={8}><EmptyState text="Envie um PDF ou cole um Markdown para gerar a pre-validacao." /></td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Panel>
      )}

      {tab === 'templates' && (
        <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <Panel title="Templates de e-mail" eyebrow="Variaveis dinamicas">
            <div className="space-y-2">
              {templates.map((template) => (
                <button key={template.id} onClick={() => setTemplateId(template.id)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left ${templateId === template.id ? 'border-indigo-200 bg-indigo-50' : 'border-slate-200 bg-white'}`}>
                  <span className="block text-sm font-black text-slate-950">{template.name}</span>
                  <span className="text-xs font-medium text-slate-500">{template.stage} - {template.tone}</span>
                </button>
              ))}
            </div>
          </Panel>
          <Panel title="Editor" eyebrow="Persistencia por migration">
            <div className="grid gap-3">
              <input value={templateDraft.name} onChange={(event) => setTemplateDraft((prev) => ({ ...prev, name: event.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" />
              <input value={templateDraft.subject} onChange={(event) => setTemplateDraft((prev) => ({ ...prev, subject: event.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" />
              <textarea value={templateDraft.body} onChange={(event) => setTemplateDraft((prev) => ({ ...prev, body: event.target.value }))} className="h-80 rounded-xl border border-slate-200 p-3 font-mono text-xs leading-6" />
              <div className="rounded-2xl bg-slate-50 p-4 text-xs font-medium leading-5 text-slate-600">
                Variaveis: {'{{cliente_nome}}, {{cliente_documento}}, {{lista_faturas}}, {{valor_total_aberto}}, {{dados_bancarios}}, {{pix_chave}}, {{banco_nome}}, {{agencia}}, {{conta}}'}
              </div>
              <ActionButton onClick={saveTemplate} icon={Save}>Salvar template</ActionButton>
            </div>
          </Panel>
          <Panel title="Regras da regua" eyebrow="Configurar cadencia">
            <div className="space-y-3">
              {ruleDrafts.map((rule, index) => (
                <div key={rule.id} className="grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1fr_120px_120px_80px]">
                  <input value={rule.name} onChange={(event) => patchRule(index, { name: event.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" />
                  <input type="number" value={rule.days_before_due ?? ''} onChange={(event) => patchRule(index, { days_before_due: event.target.value ? Number(event.target.value) : null })} placeholder="D antes" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  <input type="number" value={rule.days_after_due ?? ''} onChange={(event) => patchRule(index, { days_after_due: event.target.value ? Number(event.target.value) : null })} placeholder="D depois" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  <label className="flex items-center gap-2 text-xs font-black text-slate-600"><input type="checkbox" checked={rule.active} onChange={(event) => patchRule(index, { active: event.target.checked })} /> Ativa</label>
                </div>
              ))}
              <ActionButton onClick={saveRules} icon={Save}>Salvar regras</ActionButton>
            </div>
          </Panel>
        </div>
      )}

      {tab === 'events' && (
        <Panel title="Historico e auditoria da regua" eyebrow="Envios, status e importacoes">
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-3">
              <p className="text-sm font-black text-slate-950">Eventos de cobranca</p>
              {events.map((event) => (
                <div key={event.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-950">{event.subject || event.event_type}</p>
                      <p className="mt-1 text-xs font-medium text-slate-500">{event.channel} - {event.status} - {fmtDateTime(event.created_at)}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">{event.event_type}</span>
                  </div>
                  {event.notes && <p className="mt-2 text-xs leading-5 text-slate-500">{event.notes}</p>}
                </div>
              ))}
              {events.length === 0 && <EmptyState text="Sem eventos ainda. Envios, copias, importacoes e alteracoes de status aparecerao aqui." />}
            </div>
            <div className="space-y-3">
              <p className="text-sm font-black text-slate-950">Arquivos importados</p>
              {imports.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-black text-slate-950">{item.filename}</p>
                  <p className="mt-1 text-xs font-medium text-slate-500">{item.extraction_status} - {fmtDateTime(item.created_at)}</p>
                  <p className="mt-2 truncate font-mono text-[10px] text-slate-400">{item.storage_path}</p>
                </div>
              ))}
              {imports.length === 0 && <EmptyState text="Nenhum PDF do ERP registrado ainda." />}
            </div>
          </div>
        </Panel>
      )}

      {tab === 'playbook' && (
        <Panel title="Playbook financeiro" eyebrow="Regras resolvidas">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[
              ['Sem gateway', 'A regua gera cobranca manual com dados bancarios/Pix, sem checkout, boleto integrado ou adquirente.'],
              ['Revisao humana', 'Toda importacao passa por pre-validacao editavel antes de gravar no financeiro.'],
              ['Pausas de regua', 'Promessa vigente, comprovante, contestacao, negociacao e juridico saem dos lotes automaticos.'],
              ['Duplicidade', 'A pre-validacao usa empresa, numero e valor para marcar duplicadas ou atualizacoes.'],
              ['Auditoria', 'Envios, copias, alteracoes de status e importacoes geram eventos ou fallback em memoria local.'],
              ['Seguranca', 'A migration nova ativa RLS e grants para as tabelas expostas via Data API.'],
            ].map(([title, text]) => (
              <div key={title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-black text-slate-950">{title}</p>
                <p className="mt-2 text-xs font-medium leading-5 text-slate-500">{text}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );

  function patchValidationRow(id: string, patch: Partial<ImportValidationRow>) {
    setValidationRows((prev) => prev.map((row) => row.id === id ? { ...row, ...patch } : row));
  }

  function patchInvoice(id: string, patch: Partial<ImportValidationRow['invoice']>) {
    setValidationRows((prev) => prev.map((row) => row.id === id ? { ...row, invoice: { ...row.invoice, ...patch } } : row));
  }

  function patchRule(index: number, patch: Partial<CollectionRule>) {
    setRuleDrafts((prev) => prev.map((rule, i) => i === index ? { ...rule, ...patch } : rule));
  }
}

function schemaKey(table: string): keyof SchemaAvailability {
  if (table.includes('imported')) return 'imports';
  if (table.includes('events')) return 'events';
  if (table.includes('rules')) return 'rules';
  return 'templates';
}

function stripNewFileColumns(payload: Record<string, unknown>) {
  const {
    collection_status,
    promise_payment_date,
    collection_owner,
    last_collection_event_at,
    next_collection_action_at,
    collection_stage,
    collection_notes,
    purchase_order,
    billing_email_snapshot,
    source_import_id,
    ...base
  } = payload;
  void collection_status;
  void promise_payment_date;
  void collection_owner;
  void last_collection_event_at;
  void next_collection_action_at;
  void collection_stage;
  void collection_notes;
  void purchase_order;
  void billing_email_snapshot;
  void source_import_id;
  return base;
}

function safeFileName(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_.-]/gi, '_').toLowerCase();
}

function importToastMessage(rows: ImportValidationRow[], summary: ReceivablesReportSummary, companyCount: number) {
  if (summary.invoiceCount || summary.companyCount) {
    const invoiceOk = !summary.invoiceCount || summary.invoiceCount === rows.length;
    const companyOk = !summary.companyCount || summary.companyCount === companyCount;
    const suffix = invoiceOk && companyOk ? 'Conferencia bateu com o resumo.' : `Resumo esperava ${summary.companyCount ?? '-'} empresa(s) e ${summary.invoiceCount ?? '-'} fatura(s).`;
    return `Importador leu ${companyCount} empresa(s) e ${rows.length} fatura(s). ${suffix}`;
  }
  return `Importador leu ${companyCount} empresa(s) e ${rows.length} fatura(s).`;
}

function Kpi({ title, value, detail, icon: Icon, tone }: { title: string; value: string; detail: string; icon: typeof Landmark; tone: 'neutral' | 'red' | 'emerald' | 'amber' }) {
  const toneMap = {
    neutral: 'bg-slate-950 text-white',
    red: 'bg-rose-50 text-rose-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
  };
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{title}</p>
          <p className="mt-3 text-2xl font-black tracking-tight text-slate-950">{value}</p>
          <p className="mt-1 text-xs font-bold text-slate-400">{detail}</p>
        </div>
        <div className={`rounded-2xl p-3 ${toneMap[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function Panel({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{eyebrow}</p>
        <h3 className="mt-1 text-lg font-black text-slate-950">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Toolbar({
  query,
  setQuery,
  riskFilter,
  setRiskFilter,
  statusFilter,
  setStatusFilter,
  onExport,
}: {
  query: string;
  setQuery: (value: string) => void;
  riskFilter: Risk | 'Todos';
  setRiskFilter: (value: Risk | 'Todos') => void;
  statusFilter: CollectionStatus | 'Todos';
  setStatusFilter: (value: CollectionStatus | 'Todos') => void;
  onExport: () => void;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_160px_220px_auto]">
      <label className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente, CNPJ ou fatura..."
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm font-bold outline-none focus:border-indigo-400 focus:bg-white" />
      </label>
      <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value as Risk | 'Todos')} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold">
        {['Todos', 'Baixo', 'Medio', 'Alto', 'Critico'].map((risk) => <option key={risk} value={risk}>{risk}</option>)}
      </select>
      <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as CollectionStatus | 'Todos')} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold">
        <option value="Todos">Todos os status</option>
        {Object.entries(STATUS_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
      <button onClick={onExport} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-xs font-black text-white">
        <FileSpreadsheet className="h-3.5 w-3.5" />
        Exportar CSV
      </button>
    </div>
  );
}

function RiskPill({ risk }: { risk: Risk }) {
  const tone = risk === 'Critico' ? 'bg-rose-50 text-rose-700 ring-rose-200'
    : risk === 'Alto' ? 'bg-orange-50 text-orange-700 ring-orange-200'
      : risk === 'Medio' ? 'bg-amber-50 text-amber-700 ring-amber-200'
        : 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ring-1 ${tone}`}>{risk}</span>;
}

function MiniButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-600 hover:border-indigo-200 hover:text-indigo-700">{children}</button>;
}

function ActionButton({ children, onClick, icon: Icon, disabled }: { children: React.ReactNode; onClick: () => void; icon: typeof Send; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50">
      <Icon className={`h-3.5 w-3.5 ${Icon === Loader2 ? 'animate-spin' : ''}`} />
      {children}
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="p-8 text-center">
      <XCircle className="mx-auto h-6 w-6 text-slate-300" />
      <p className="mt-2 text-sm font-bold text-slate-400">{text}</p>
    </div>
  );
}
