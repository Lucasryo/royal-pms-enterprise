import jsPDF from 'jspdf';
import { BankAccount, Company, FiscalFile } from '../../types';
import { fileStatus, fmtDate, money, startOfToday } from './shared';

export type CollectionStatus =
  | 'open'
  | 'awaiting_return'
  | 'awaiting_receipt'
  | 'payment_promised'
  | 'disputed'
  | 'negotiating'
  | 'legal'
  | 'paid'
  | 'cancelled';

export type ParsedInvoice = {
  invoiceNum: string;
  fiscalNoteNumber?: string;
  reservationNumber?: string;
  locator?: string;
  purchaseOrder?: string;
  issueDate: string;
  dueDate: string;
  originalAmount: number;
  openAmount: number;
  paidAmount: number;
  overdueDays: number;
  status: 'Vencida' | 'A vencer';
  invoiceType: string;
  notes?: string;
};

export type ReceivablesReportSummary = {
  operationDate?: string;
  totalReceivable?: number;
  totalOverdue?: number;
  totalUpcoming?: number;
  companyCount?: number;
  invoiceCount?: number;
  overdueInvoiceCount?: number;
  upcomingInvoiceCount?: number;
};

export type CompanyTotalValidation = {
  companyName: string;
  cnpj?: string;
  expectedTotal?: number;
  calculatedTotal: number;
  difference?: number;
  ok: boolean;
};

export type ReceivablesConversionResult = {
  markdown: string;
  companies: ParsedCompany[];
  summary: ReceivablesReportSummary;
  companyTotalValidations: CompanyTotalValidation[];
};

export type ParsedCompany = {
  name: string;
  cnpj?: string;
  billingEmail?: string;
  phone?: string;
  contactName?: string;
  notes?: string;
  invoices: ParsedInvoice[];
};

export type ImportValidationRow = {
  id: string;
  companyName: string;
  companyDocument?: string;
  invoice: ParsedInvoice;
  action: 'create' | 'update' | 'duplicate' | 'error' | 'ignored';
  reason: string;
  matchedCompanyId?: string;
  existingFileId?: string;
  selected: boolean;
};

export type CollectionRule = {
  id: string;
  name: string;
  description?: string;
  trigger_type: string;
  days_before_due?: number | null;
  days_after_due?: number | null;
  action_type: string;
  stage: string;
  active: boolean;
};

export type EmailTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
  tone: string;
  stage: string;
  active: boolean;
};

export type ImportedReceivableFile = {
  id: string;
  filename: string;
  storage_path: string;
  file_type: string;
  extraction_status: 'pending' | 'processing' | 'extracted' | 'awaiting_validation' | 'imported' | 'failed' | 'canceled';
  raw_text?: string;
  markdown_content?: string;
  parsed_json?: ParsedCompany[];
  validation_json?: ImportValidationRow[];
  imported_by?: string;
  imported_at?: string;
  created_at: string;
};

export type CollectionEvent = {
  id: string;
  company_id?: string;
  invoice_id?: string;
  rule_id?: string;
  event_type: string;
  channel: 'email' | 'whatsapp' | 'phone' | 'internal' | 'manual';
  status: 'draft' | 'prepared' | 'sent' | 'failed' | 'responded' | 'paused' | 'canceled';
  subject?: string;
  message?: string;
  recipients?: string[];
  attachment_path?: string;
  sent_at?: string;
  promise_payment_date?: string;
  notes?: string;
  user_id?: string;
  created_at: string;
};

export const DEFAULT_COLLECTION_RULES: CollectionRule[] = [
  {
    id: 'preventive',
    name: 'Lembrete preventivo',
    description: 'Conferencia antes do vencimento.',
    trigger_type: 'days_before_due',
    days_before_due: 3,
    days_after_due: null,
    action_type: 'email',
    stage: 'preventive',
    active: true,
  },
  {
    id: 'soft',
    name: 'Cobranca amigavel',
    description: 'Primeiro contato apos vencimento.',
    trigger_type: 'days_after_due',
    days_before_due: null,
    days_after_due: 3,
    action_type: 'email',
    stage: 'soft',
    active: true,
  },
  {
    id: 'active',
    name: 'Cobranca moderada',
    description: 'Follow-up formal e prazo de retorno.',
    trigger_type: 'days_after_due',
    days_before_due: null,
    days_after_due: 7,
    action_type: 'email',
    stage: 'active',
    active: true,
  },
  {
    id: 'formal',
    name: 'Cobranca formal',
    description: 'Escalada para gestor financeiro.',
    trigger_type: 'days_after_due',
    days_before_due: null,
    days_after_due: 15,
    action_type: 'email',
    stage: 'formal',
    active: true,
  },
  {
    id: 'critical',
    name: 'Cobranca critica',
    description: 'Risco critico antes de bloqueio ou juridico.',
    trigger_type: 'days_after_due',
    days_before_due: null,
    days_after_due: 30,
    action_type: 'email',
    stage: 'critical',
    active: true,
  },
];

export const DEFAULT_EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'preventive-default',
    name: 'Lembrete preventivo',
    subject: '[Royal Macae] Lembrete de vencimento - {{cliente_nome}}',
    body:
      'Prezados,\n\nIdentificamos titulos com vencimento proximo vinculados a {{cliente_nome}}.\n\n{{lista_faturas}}\n\nTotal em aberto: {{valor_total_aberto}}\n\nSolicitamos conferencia e previsao de pagamento. Caso ja esteja programado, envie o comprovante quando disponivel.\n\nDados para pagamento:\n{{dados_bancarios}}\n\nAtenciosamente,\nFinanceiro Royal Macae Palace',
    tone: 'preventive',
    stage: 'preventive',
    active: true,
  },
  {
    id: 'active-default',
    name: 'Cobranca oficial',
    subject: '[Royal Macae] Titulos em aberto - {{cliente_nome}}',
    body:
      'Prezados,\n\nConstam titulos em aberto vinculados a {{cliente_nome}}:\n\n{{lista_faturas}}\n\nTotal em aberto: {{valor_total_aberto}}\n\nSolicitamos regularizacao em ate 48 horas ou retorno com previsao formal de pagamento.\n\nDados para pagamento:\n{{dados_bancarios}}\n\nAtenciosamente,\nFinanceiro Royal Macae Palace',
    tone: 'professional',
    stage: 'active',
    active: true,
  },
  {
    id: 'critical-default',
    name: 'Escalada critica',
    subject: '[Royal Macae] Escalada critica de cobranca - {{cliente_nome}}',
    body:
      'Prezados,\n\nEsta notificacao representa escalada critica da regua de cobranca para {{cliente_nome}}.\n\n{{lista_faturas}}\n\nTotal em aberto: {{valor_total_aberto}}\n\nA ausencia de retorno podera bloquear novas condicoes comerciais e seguir para tratativa gerencial.\n\nDados para pagamento:\n{{dados_bancarios}}\n\nAtenciosamente,\nFinanceiro Royal Macae Palace',
    tone: 'formal',
    stage: 'critical',
    active: true,
  },
];

export function normalizeKey(value: string) {
  return repairMojibake(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\W+/g, '').toLowerCase();
}

export function repairMojibake(value: string) {
  return value
    .replace(/Ã¡/g, 'á').replace(/Ã /g, 'à').replace(/Ã¢/g, 'â').replace(/Ã£/g, 'ã')
    .replace(/Ã©/g, 'é').replace(/Ãª/g, 'ê')
    .replace(/Ã­/g, 'í')
    .replace(/Ã³/g, 'ó').replace(/Ã´/g, 'ô').replace(/Ãµ/g, 'õ')
    .replace(/Ãº/g, 'ú')
    .replace(/Ã§/g, 'ç')
    .replace(/Ã/g, 'Á').replace(/Ã€/g, 'À').replace(/Ã‚/g, 'Â').replace(/Ãƒ/g, 'Ã')
    .replace(/Ã‰/g, 'É').replace(/ÃŠ/g, 'Ê')
    .replace(/Ã/g, 'Í')
    .replace(/Ã“/g, 'Ó').replace(/Ã”/g, 'Ô').replace(/Ã•/g, 'Õ')
    .replace(/Ãš/g, 'Ú')
    .replace(/Ã‡/g, 'Ç')
    .replace(/â€“|â€”/g, '-')
    .replace(/Â /g, ' ');
}

export function parseMoney(value: string) {
  const clean = value.replace(/\s/g, '').replace(/[R$]/gi, '');
  if (clean.includes(',')) return Number(clean.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')) || 0;
  return Number(clean.replace(/[^0-9.-]/g, '')) || 0;
}

export const brlToNumber = parseMoney;

export function formatCnpj(value?: string) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 14) return String(value || '').trim();
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export function formatBrazilianAmount(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function toIsoDate(value: string) {
  const trimmed = value.trim();
  const iso = trimmed.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = trimmed.match(/(\d{2})[/-](\d{2})[/-](\d{2,4})/);
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${br[2]}-${br[1]}`;
  }
  return '';
}

function toBrDate(value: string) {
  const iso = toIsoDate(value);
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function dateTimeFromAny(value?: string) {
  const iso = toIsoDate(value || '');
  if (!iso) return null;
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function classifyInvoiceStatus(dueDate: string, operationDate: string) {
  const due = dateTimeFromAny(dueDate);
  const operation = dateTimeFromAny(operationDate);
  if (!due || !operation) return 'A VENCER' as const;
  return due.getTime() < operation.getTime() ? 'VENCIDO' as const : 'A VENCER' as const;
}

export function daysOverdue(dueDate?: string) {
  if (!dueDate) return 0;
  const date = new Date(`${dueDate.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.round((startOfToday().getTime() - date.getTime()) / 86_400_000));
}

export function rawTextToMarkdown(text: string) {
  return convertExtractedReceivablesTextToMarkdown(text);
}

export function convertExtractedReceivablesTextToMarkdown(text: string) {
  const cleaned = normalizeReceivablesLayout(repairMojibake(text.trim()));
  if (/^##\s+/m.test(cleaned) && /^\*\s+/m.test(cleaned)) {
    return normalizeMarkdownReceivables(cleaned);
  }

  const rawCompanies = parseRawReceivablesRows(cleaned);
  if (rawCompanies.companies.length > 0) {
    return buildReceivablesMarkdown(rawCompanies.companies, rawCompanies.operationDate);
  }

  return legacyLooseTextToMarkdown(cleaned);
}

function legacyLooseTextToMarkdown(trimmed: string) {

  const lines = trimmed.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out: string[] = ['# RELATORIO DE CONTAS A RECEBER'];
  let currentCompany = '';

  for (const line of lines) {
    const cnpj = line.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/)?.[0];
    const hasMoney = /(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}/.test(line);
    const hasDate = /\d{2}[/-]\d{2}[/-]\d{2,4}/.test(line);
    const invoice = line.match(/\b(?:FT|FAT|NF|NFS|NH|INV|DUP)[-\s.:]?\d{2,}\b/i)?.[0];

    if (cnpj && !hasMoney) {
      const name = line.replace(cnpj, '').replace(/CNPJ:?/i, '').trim() || `Cliente ${cnpj}`;
      currentCompany = name;
      out.push('', `## ${name} (CNPJ: ${cnpj})`);
      continue;
    }

    if (!currentCompany && cnpj) {
      currentCompany = line.split(cnpj)[0].trim() || `Cliente ${cnpj}`;
      out.push('', `## ${currentCompany} (CNPJ: ${cnpj})`);
    }

    if ((invoice || hasDate) && hasMoney) {
      const dates = line.match(/\d{2}[/-]\d{2}[/-]\d{2,4}/g) || [];
      const values = line.match(/(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}/g) || [];
      out.push(`* ${invoice || `FT-${Date.now()}`} | Emissao: ${dates[0] || dates[dates.length - 1] || ''} | Vencimento: ${dates[1] || dates[0] || ''} | Vlr Fatura: ${values[0] || '0,00'} | Vlr Receber: ${values[values.length - 1] || values[0] || '0,00'} | Status: ${line.toUpperCase().includes('VENC') ? 'VENCIDO' : 'A VENCER'} | Obs: ${line}`);
    }
  }

  return out.join('\n');
}

export function convertExtractedReceivablesText(text: string): ReceivablesConversionResult {
  const markdown = convertExtractedReceivablesTextToMarkdown(text);
  const companies = parseMarkdownReport(markdown);
  const summary = parseReceivablesSummary(markdown);
  return {
    markdown,
    companies,
    summary,
    companyTotalValidations: validateCompanyTotals(markdown),
  };
}

export function normalizeReceivablesLayout(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*(?:-{20,})\s*/g, '\n----------------------------------------------------------------------\n')
    .replace(/\s+(#\s*RELAT[ÓO]RIO\s+DE\s+CONTAS\s+A\s+RECEBER[^\n]*)/gi, '\n$1')
    .replace(/\s+(Data\s+de\s+Opera[çc][aã]o\s*:\s*\d{2}\/\d{2}\/\d{4})/gi, '\n$1')
    .replace(/\s+(##\s+(?!Total\s+Empresa)[^\n#*]+?\(CNPJ:\s*\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\))/gi, '\n$1')
    .replace(/\s+(\*\s*(?:FT|FAT|NF|NFS|NH|INV|DUP)[-\s.:]?\d+\s*\|)/gi, '\n$1')
    .replace(/\s+(##\s*Total\s+Empresa\s*:\s*R?\$?\s*[\d.,]+)/gi, '\n$1')
    .replace(/\s+(#\s*RESUMO\s+GERAL)/gi, '\n$1')
    .replace(/\s+(\*\s*Total\s+Geral\s+a\s+Receber\s*:)/gi, '\n$1')
    .replace(/\s+(\*\s*Total\s+Vencido\s*:)/gi, '\n$1')
    .replace(/\s+(\*\s*Total\s+a\s+Vencer\s*:)/gi, '\n$1')
    .replace(/\s+(\*\s*Quantidade\s+de\s+Empresas\s*:)/gi, '\n$1')
    .replace(/\s+(\*\s*Quantidade\s+de\s+Faturas(?:\s+Vencidas|\s+a\s+Vencer)?\s*:)/gi, '\n$1')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

function normalizeMarkdownReceivables(markdown: string) {
  const companies = parseMarkdownReport(markdown);
  const summary = parseReceivablesSummary(markdown);
  return buildReceivablesMarkdown(companies, summary.operationDate);
}

function ignoredPdfHeader(line: string) {
  const key = normalizeKey(line);
  if (!key) return true;
  return [
    'royalmacaepalacehotel',
    'faturasareceber',
    'page',
    'empresa',
    'faturanparchotel',
    'centrodefaturamento',
    'hotel',
    'conta',
    'sponsor',
  ].some((prefix) => key.startsWith(prefix));
}

function parseRawReceivablesRows(text: string) {
  const operationDate = extractOperationDate(text);
  const companies = new Map<string, ParsedCompany>();
  const lines = normalizeReceivablesLayout(text).split('\n').filter((line) => !ignoredPdfHeader(line));

  for (const line of lines) {
    const parsed = parseRawReceivableLine(line, operationDate);
    if (!parsed) continue;
    const companyKey = `${normalizeKey(parsed.companyName)}|${parsed.cnpj || ''}`;
    const company = companies.get(companyKey) || {
      name: parsed.companyName,
      cnpj: parsed.cnpj,
      phone: parsed.phone,
      invoices: [],
    };
    company.invoices.push(parsed.invoice);
    companies.set(companyKey, company);
  }

  return { operationDate, companies: Array.from(companies.values()) };
}

function extractOperationDate(text: string) {
  return text.match(/Data\s+de\s+Opera[çc][aã]o\s*:\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1]
    || text.match(/Opera[çc][aã]o\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1]
    || text.match(/\bData\s*:\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1]
    || '';
}

function parseRawReceivableLine(line: string, operationDate: string) {
  const normalized = repairMojibake(line).replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  const cnpjMatch = normalized.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/);
  if (!cnpjMatch) return null;
  const cnpj = formatCnpj(cnpjMatch[0]);
  const beforeCnpj = normalized.slice(0, cnpjMatch.index).trim();
  const tokens = beforeCnpj.split(/\s+/);
  const invoiceIndex = tokens.findIndex((token) => /^(?:FT[-\s]?)?\d{3,}$/.test(token));
  if (invoiceIndex <= 0) return null;

  const companyName = tokens.slice(0, invoiceIndex).join(' ').trim();
  const invoiceNum = `FT-${tokens[invoiceIndex].replace(/\D/g, '')}`;
  const rest = tokens.slice(invoiceIndex + 1).join(' ');
  const dates = rest.match(/\d{2}\/\d{2}\/\d{4}/g) || [];
  if (dates.length < 2) return null;
  const issueDate = dates[0];
  const dueDate = dates[dates.length - 1];
  const firstDateIndex = normalized.indexOf(dates[0]);
  const dueDateIndex = normalized.lastIndexOf(dates[dates.length - 1]);
  const valuesBeforeDue = normalized
    .slice(firstDateIndex >= 0 ? firstDateIndex + dates[0].length : 0, dueDateIndex >= 0 ? dueDateIndex : normalized.length)
    .match(/-?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}/g) || [];
  if (valuesBeforeDue.length === 0) return null;
  const grossRaw = valuesBeforeDue.length >= 6 ? valuesBeforeDue[valuesBeforeDue.length - 4] : valuesBeforeDue[0];
  const receiveRaw = valuesBeforeDue[valuesBeforeDue.length - 1];
  const status = classifyInvoiceStatus(dueDate, operationDate || issueDate);
  const due = dateTimeFromAny(dueDate);
  const operation = dateTimeFromAny(operationDate || issueDate);
  const overdueDays = due && operation ? Math.max(0, Math.floor((operation.getTime() - due.getTime()) / 86_400_000)) : 0;
  const phone = normalized.slice(cnpjMatch.index! + cnpjMatch[0].length).match(/\(?\d{2}\)?\s?\d{4,5}-?\d{4}/)?.[0];

  return {
    companyName,
    cnpj,
    phone,
    invoice: {
      invoiceNum,
      issueDate: toIsoDate(issueDate),
      dueDate: toIsoDate(dueDate),
      originalAmount: brlToNumber(grossRaw),
      openAmount: brlToNumber(receiveRaw),
      paidAmount: 0,
      overdueDays,
      status: status === 'VENCIDO' ? 'Vencida' as const : 'A vencer' as const,
      invoiceType: 'FATURA',
    },
  };
}

function buildReceivablesMarkdown(companies: ParsedCompany[], operationDate?: string) {
  const opDate = operationDate || '';
  const normalizedCompanies = companies.map((company) => ({
    ...company,
    cnpj: formatCnpj(company.cnpj),
    invoices: company.invoices.map((invoice) => ({
      ...invoice,
      invoiceNum: invoice.invoiceNum.startsWith('FT-') ? invoice.invoiceNum : `FT-${invoice.invoiceNum.replace(/\D/g, '')}`,
      status: classifyInvoiceStatus(invoice.dueDate, opDate) === 'VENCIDO' ? 'Vencida' as const : 'A vencer' as const,
    })),
  }));
  const totalReceivable = normalizedCompanies.reduce((sum, company) => sum + company.invoices.reduce((sub, invoice) => sub + invoice.openAmount, 0), 0);
  const totalOverdue = normalizedCompanies.reduce((sum, company) => sum + company.invoices.filter((invoice) => classifyInvoiceStatus(invoice.dueDate, opDate) === 'VENCIDO').reduce((sub, invoice) => sub + invoice.openAmount, 0), 0);
  const totalUpcoming = totalReceivable - totalOverdue;
  const invoiceCount = normalizedCompanies.reduce((sum, company) => sum + company.invoices.length, 0);
  const lines: string[] = [
    '# RELATÓRIO DE CONTAS A RECEBER - ROYAL MACAÉ PALACE HOTEL',
    `Data de Operação: ${opDate}`,
    '----------------------------------------------------------------------',
    '',
  ];

  normalizedCompanies.forEach((company, index) => {
    lines.push(`## ${company.name} (CNPJ: ${company.cnpj || ''})`);
    company.invoices.forEach((invoice) => {
      const status = classifyInvoiceStatus(invoice.dueDate, opDate);
      lines.push(`* ${invoice.invoiceNum} | Emissão: ${toBrDate(invoice.issueDate)} | Vencimento: ${toBrDate(invoice.dueDate)} | Vlr Fatura: ${formatBrazilianAmount(invoice.originalAmount)} | Vlr Receber: ${formatBrazilianAmount(invoice.openAmount)} | Status: ${status}`);
    });
    const companyTotal = company.invoices.reduce((sum, invoice) => sum + invoice.openAmount, 0);
    lines.push(`## Total Empresa: R$ ${formatBrazilianAmount(companyTotal)}`);
    lines.push('');
    if (index < normalizedCompanies.length - 1) lines.push('----------------------------------------------------------------------', '');
  });

  lines.push('----------------------------------------------------------------------', '', '# RESUMO GERAL', '');
  lines.push(`* Total Geral a Receber: R$ ${formatBrazilianAmount(totalReceivable)}`);
  lines.push(`* Total Vencido: R$ ${formatBrazilianAmount(totalOverdue)}`);
  lines.push(`* Total a Vencer: R$ ${formatBrazilianAmount(totalUpcoming)}`);
  lines.push(`* Quantidade de Empresas: ${normalizedCompanies.length}`);
  lines.push(`* Quantidade de Faturas: ${invoiceCount}`);
  return lines.join('\n');
}

export function validateCompanyTotals(markdown: string): CompanyTotalValidation[] {
  const text = normalizeReceivablesLayout(repairMojibake(markdown));
  const parsed = parseMarkdownReport(text);
  const totalLines = text.split('\n').filter((line) => /^##\s*Total\s+Empresa/i.test(line));
  return parsed.map((company, index) => {
    const expectedRaw = totalLines[index]?.split(':').slice(1).join(':').trim();
    const expectedTotal = expectedRaw ? brlToNumber(expectedRaw) : undefined;
    const calculatedTotal = Number(company.invoices.reduce((sum, invoice) => sum + invoice.openAmount, 0).toFixed(2));
    const difference = expectedTotal === undefined ? undefined : Number((calculatedTotal - expectedTotal).toFixed(2));
    return {
      companyName: company.name,
      cnpj: company.cnpj,
      expectedTotal,
      calculatedTotal,
      difference,
      ok: expectedTotal === undefined || Math.abs(difference || 0) < 0.01,
    };
  });
}

export async function extractPdfText(file: File) {
  const pdfjsLib = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjsLib.GlobalWorkerOptions.workerSrc = worker.default;
  const data = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const rows = new Map<number, Array<{ x: number; text: string }>>();
    for (const item of content.items as Array<any>) {
      const text = String(item.str || '').trim();
      if (!text) continue;
      const transform = item.transform || [0, 0, 0, 0, 0, 0];
      const y = Math.round(Number(transform[5] || 0) / 2);
      const x = Number(transform[4] || 0);
      const row = rows.get(y) || [];
      row.push({ x, text });
      rows.set(y, row);
    }
    const pageText = Array.from(rows.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([, row]) => row.sort((a, b) => a.x - b.x).map((item) => item.text).join(' '))
      .join('\n');
    pages.push(pageText);
  }

  return pages.join('\n\n');
}

export function parseMarkdownReport(markdown: string, referenceDate = startOfToday()): ParsedCompany[] {
  const companies: ParsedCompany[] = [];
  const operationDate = parseReceivablesSummary(markdown).operationDate;
  const operationRefDate = dateTimeFromAny(operationDate) || referenceDate;
  let current: ParsedCompany | null = null;

  for (const rawLine of normalizeReceivablesLayout(repairMojibake(markdown)).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^#\s*RESUMO\s+GERAL/i.test(line)) {
      if (current) companies.push(current);
      current = null;
      continue;
    }

    const companyMatch = line.match(/^##\s+(.*?)\s+\(CNPJ:\s*(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\)\s*$/i);
    if (companyMatch) {
      if (current) companies.push(current);
      current = {
        name: companyMatch[1].trim(),
        cnpj: companyMatch[2]?.trim(),
        invoices: [],
      };
      continue;
    }

    if (/^##\s*Total\s+Empresa/i.test(line)) continue;
    if (!current || !line.startsWith('*')) continue;
    const parts = line.slice(1).split('|').map((part) => part.trim());
    const invoiceNum = (parts.find((part) => /(?:FT|NF|NFS|NH|FAT|INV|DUP)[-\s.:]?\d+/i.test(part))?.match(/(?:FT|NF|NFS|NH|FAT|INV|DUP)[-\s.:]?\d+/i)?.[0] || '').replace(/[\s.:]+/g, '-').toUpperCase();
    const findValue = (keys: string[]) => {
      const found = parts.find((part) => keys.some((key) => normalizeKey(part).includes(normalizeKey(key))));
      return found?.split(':').slice(1).join(':').trim() || '';
    };
    const issueDate = toIsoDate(findValue(['emissao', 'emiss', 'data emissao'])) || toIsoDate(parts.find((part) => /\d{2}[/-]\d{2}[/-]\d{2,4}/.test(part)) || '');
    const dueDate = toIsoDate(findValue(['vencimento', 'venc', 'data vencimento']));
    const originalAmountRaw = findValue(['vlr fatura', 'valor fatura', 'valor original', 'valor']);
    const openAmountRaw = findValue(['vlr receber', 'valor receber', 'valor em aberto', 'receber']);
    const originalAmount = parseMoney(originalAmountRaw);
    const openAmount = openAmountRaw ? parseMoney(openAmountRaw) : originalAmount;
    const paidAmount = parseMoney(findValue(['valor recebido', 'recebido', 'pago']));
    if (!invoiceNum || !dueDate || (!originalAmountRaw && !openAmountRaw)) continue;

    const due = new Date(`${dueDate}T12:00:00`);
    const overdueDays = Math.max(0, Math.floor((operationRefDate.getTime() - due.getTime()) / 86_400_000));
    const statusRaw = normalizeKey(findValue(['status']));
    const status = statusRaw.includes('vencido') || classifyInvoiceStatus(dueDate, operationDate || dueDate) === 'VENCIDO'
      ? 'Vencida'
      : 'A vencer';
    current.invoices.push({
      invoiceNum,
      fiscalNoteNumber: findValue(['nota fiscal', 'nf', 'nfs']),
      reservationNumber: findValue(['reserva']),
      locator: findValue(['localizador']),
      purchaseOrder: findValue(['ordem de compra', 'p.o', 'po', 'oe', 'o.e']),
      issueDate: issueDate || dueDate,
      dueDate,
      originalAmount: originalAmount || openAmount,
      openAmount,
      paidAmount,
      overdueDays,
      status,
      invoiceType: classifyInvoiceType(line),
      notes: findValue(['obs', 'historico', 'observacao']),
    });
  }

  if (current) companies.push(current);
  return companies.filter((company) => company.invoices.length > 0);
}

export function parseReceivablesSummary(markdown: string): ReceivablesReportSummary {
  const text = normalizeReceivablesLayout(repairMojibake(markdown));
  const findNumber = (label: string) => {
    const line = text.split('\n').find((item) => normalizeKey(item).startsWith(normalizeKey(`* ${label}`)));
    const value = line?.split(':').slice(1).join(':').trim() || '';
    return value ? parseMoney(value) : undefined;
  };
  const findInteger = (label: string) => {
    const value = findNumber(label);
    return typeof value === 'number' ? Math.round(value) : undefined;
  };
  return {
    operationDate: text.match(/Data\s+de\s+Opera[çc][aã]o\s*:\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1],
    totalReceivable: findNumber('Total Geral a Receber'),
    totalOverdue: findNumber('Total Vencido'),
    totalUpcoming: findNumber('Total a Vencer'),
    companyCount: findInteger('Quantidade de Empresas'),
    invoiceCount: findInteger('Quantidade de Faturas'),
    overdueInvoiceCount: findInteger('Quantidade de Faturas Vencidas'),
    upcomingInvoiceCount: findInteger('Quantidade de Faturas a Vencer'),
  };
}

function classifyInvoiceType(line: string) {
  const key = normalizeKey(line);
  if (key.includes('noshow')) return 'No-show';
  if (key.includes('alimentacao') || key.includes('restaurante')) return 'Alimentacao';
  if (key.includes('extra')) return 'Extras';
  if (key.includes('diaria') || key.includes('hosped')) return 'Hospedagem';
  if (key.includes('evento')) return 'Eventos';
  return 'FATURA';
}

export function validateImportRows(parsed: ParsedCompany[], companies: Company[], files: FiscalFile[]): ImportValidationRow[] {
  return parsed.flatMap((company) => {
    const matched = companies.find((existing) =>
      (company.cnpj && existing.cnpj === company.cnpj) ||
      normalizeKey(existing.name) === normalizeKey(company.name) ||
      (existing.parser_aliases || []).some((alias) => normalizeKey(alias) === normalizeKey(company.name))
    );

    return company.invoices.map((invoice, index) => {
      const existingByNumber = files.find((file) =>
        getCompanyId(file) === matched?.id &&
        normalizeKey(file.original_name || '').includes(normalizeKey(invoice.invoiceNum))
      );
      const existingStrict = existingByNumber && Math.abs(Number(existingByNumber.amount || 0) - invoice.openAmount) < 0.01;
      const missing = [
        !company.name ? 'cliente' : '',
        !invoice.invoiceNum ? 'numero da fatura' : '',
        !invoice.dueDate ? 'vencimento' : '',
        invoice.openAmount < 0 ? 'valor' : '',
      ].filter(Boolean);

      if (missing.length > 0) {
        return {
          id: `${normalizeKey(company.name)}-${invoice.invoiceNum}-${index}`,
          companyName: company.name,
          companyDocument: company.cnpj,
          invoice,
          action: 'error' as const,
          reason: `Campos obrigatorios ausentes: ${missing.join(', ')}`,
          matchedCompanyId: matched?.id,
          existingFileId: existingByNumber?.id,
          selected: false,
        };
      }

      if (existingStrict) {
        return {
          id: `${normalizeKey(company.name)}-${invoice.invoiceNum}-${index}`,
          companyName: company.name,
          companyDocument: company.cnpj,
          invoice,
          action: 'duplicate' as const,
          reason: 'Fatura ja existe com mesmo cliente, numero e valor.',
          matchedCompanyId: matched?.id,
          existingFileId: existingByNumber.id,
          selected: false,
        };
      }

      if (existingByNumber) {
        return {
          id: `${normalizeKey(company.name)}-${invoice.invoiceNum}-${index}`,
          companyName: company.name,
          companyDocument: company.cnpj,
          invoice,
          action: 'update' as const,
          reason: 'Fatura existente sera atualizada com valor/status revisados.',
          matchedCompanyId: matched?.id,
          existingFileId: existingByNumber.id,
          selected: true,
        };
      }

      return {
        id: `${normalizeKey(company.name)}-${invoice.invoiceNum}-${index}`,
        companyName: company.name,
        companyDocument: company.cnpj,
        invoice,
        action: 'create' as const,
        reason: matched ? 'Nova fatura para cliente existente.' : 'Novo cliente e nova fatura.',
        matchedCompanyId: matched?.id,
        selected: true,
      };
    });
  });
}

export function getCompanyId(file: FiscalFile) {
  return file.company_id || file.companyId || 'sem-empresa';
}

export function getCollectionStatus(file: FiscalFile): CollectionStatus {
  if (file.status === 'PAID') return 'paid';
  if (file.status === 'CANCELLED') return 'cancelled';
  if (file.collection_status) return file.collection_status as CollectionStatus;
  if (file.dispute_reason && !file.dispute_resolved_at) return 'disputed';
  return 'open';
}

export function isCollectionPaused(file: FiscalFile) {
  const status = getCollectionStatus(file);
  if (status === 'disputed' || status === 'awaiting_receipt' || status === 'negotiating' || status === 'legal') return true;
  if (status === 'payment_promised' && file.promise_payment_date) {
    return new Date(`${file.promise_payment_date}T12:00:00`) >= startOfToday();
  }
  return false;
}

export function chooseStage(file: FiscalFile) {
  if (isCollectionPaused(file)) return 'paused';
  const status = fileStatus(file);
  if (status === 'paid' || status === 'cancelled') return 'closed';
  const delay = daysOverdue(file.due_date || file.dueDate);
  if (delay === 0) return 'preventive';
  if (delay <= 7) return 'soft';
  if (delay <= 15) return 'active';
  if (delay <= 30) return 'formal';
  return 'critical';
}

export function bankInstructions(account?: BankAccount) {
  if (!account) return 'Dados bancarios ainda nao configurados.';
  return [
    `${account.institution || account.bank_name}`,
    `Banco: ${account.bank_name}`,
    `Agencia: ${account.agency}`,
    `Conta: ${account.account}`,
    `Pix: ${account.pix_key}`,
  ].filter(Boolean).join('\n');
}

export function renderTemplate(template: EmailTemplate, params: {
  company: Company | { name: string; cnpj?: string; email?: string };
  invoices: FiscalFile[];
  account?: BankAccount;
}) {
  const total = params.invoices.reduce((sum, file) => sum + Number(file.amount || 0), 0);
  const invoiceList = params.invoices.map((file) => {
    const delay = daysOverdue(file.due_date || file.dueDate);
    return `- ${(file.original_name || 'Fatura').split(' - ')[0]} | Vencimento: ${fmtDate(file.due_date || file.dueDate)} | Valor: ${money(Number(file.amount || 0))}${delay > 0 ? ` | Atraso: ${delay} dia(s)` : ' | A vencer'}`;
  }).join('\n');
  const vars: Record<string, string> = {
    cliente_nome: params.company.name,
    cliente_documento: params.company.cnpj || '',
    hotel_nome: 'Royal Macae Palace Hotel',
    lista_faturas: invoiceList,
    valor_total_aberto: money(total),
    dados_bancarios: bankInstructions(params.account),
    pix_chave: params.account?.pix_key || '',
    banco_nome: params.account?.bank_name || '',
    agencia: params.account?.agency || '',
    conta: params.account?.account || '',
    responsavel_nome: 'Financeiro Royal Macae Palace',
    responsavel_email: 'financeiro@royalmacae.com.br',
  };
  const replace = (text: string) => text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
  return { subject: replace(template.subject), body: replace(template.body) };
}

export function bodyToHtml(body: string) {
  return `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#111827;white-space:pre-wrap">${escapeHtml(body)}</div>`;
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function buildCollectionPdf(params: {
  company: Company | { name: string; cnpj?: string; email?: string };
  invoices: FiscalFile[];
  account?: BankAccount;
  subject: string;
}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = 14;
  const total = params.invoices.reduce((sum, file) => sum + Number(file.amount || 0), 0);

  doc.setFillColor(17, 24, 39);
  doc.rect(0, 0, pageW, 34, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('ROYAL MACAE PALACE HOTEL', margin, y);
  y += 7;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Documento profissional de cobranca manual - sem gateway de pagamento', margin, y);

  y = 44;
  doc.setTextColor(17, 24, 39);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(params.subject || 'Cobranca de titulos em aberto', margin, y);
  y += 10;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Cliente: ${params.company.name}`, margin, y);
  y += 6;
  doc.text(`Documento: ${params.company.cnpj || '-'}`, margin, y);
  y += 6;
  doc.text(`Emissao: ${new Date().toLocaleDateString('pt-BR')}`, margin, y);
  y += 10;

  doc.setFillColor(239, 246, 255);
  doc.roundedRect(margin, y, pageW - margin * 2, 18, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`Total em aberto: ${money(total)}`, margin + 4, y + 7);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Quantidade de titulos: ${params.invoices.length}`, margin + 4, y + 13);
  y += 28;

  doc.setFont('helvetica', 'bold');
  doc.text('Faturas selecionadas', margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  params.invoices.forEach((file) => {
    if (y > 260) {
      doc.addPage();
      y = 16;
    }
    const name = (file.original_name || 'Fatura').slice(0, 56);
    const delay = daysOverdue(file.due_date || file.dueDate);
    doc.text(name, margin, y);
    doc.text(fmtDate(file.due_date || file.dueDate), 112, y);
    doc.text(delay > 0 ? `${delay}d atraso` : 'A vencer', 140, y);
    doc.text(money(Number(file.amount || 0)), 170, y, { align: 'right' });
    y += 6;
  });

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Dados bancarios para pagamento manual', margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  bankInstructions(params.account).split('\n').forEach((line) => {
    doc.text(line, margin, y);
    y += 5;
  });

  y += 6;
  doc.setFontSize(8);
  doc.text('Este documento nao e boleto, checkout ou link de pagamento. O pagamento deve ser realizado manualmente pelos dados bancarios acima.', margin, y, { maxWidth: pageW - margin * 2 });

  return doc;
}

export async function downloadCollectionPdf(params: {
  company: Company | { name: string; cnpj?: string; email?: string };
  invoices: FiscalFile[];
  account?: BankAccount;
  subject: string;
}) {
  const doc = buildCollectionPdf(params);
  const safeName = normalizeKey(params.company.name || 'cliente') || 'cliente';
  doc.save(`cobranca_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function collectionPdfBase64(params: {
  company: Company | { name: string; cnpj?: string; email?: string };
  invoices: FiscalFile[];
  account?: BankAccount;
  subject: string;
}) {
  const doc = buildCollectionPdf(params);
  return String(doc.output('datauristring')).split(',')[1] || '';
}

export function downloadCsv(filename: string, rows: Array<Record<string, string | number>>) {
  const headers = Object.keys(rows[0] || { vazio: '' });
  const csv = [
    headers.join(';'),
    ...rows.map((row) => headers.map((header) => `"${String(row[header] ?? '').replace(/"/g, '""')}"`).join(';')),
  ].join('\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
