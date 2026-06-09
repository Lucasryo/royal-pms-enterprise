import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import {
  brlToNumber,
  classifyInvoiceStatus,
  convertExtractedReceivablesText,
  formatCnpj,
  parseMarkdownReport,
  validateImportRows,
  validateCompanyTotals,
} from '../src/components/finance/receivablesEngine';

const rawPdfTextSample = `
ROYAL MACAE PALACE HOTEL
Faturas a Receber
Page 1 of 1
Empresa Fatura Nº Parc Hotel Emissão Bc - Ag Comissão IRRF Vlr Bruto Desconto Juros Vlr Receber Dt Venc Vencidos A Vencer Posto CNPJ Telefone
AEROMASTER TAXI AEREO LTDA 102551 1 RMP 30/04/2026 001-1 0,00 0,00 578,93 0,00 0,00 578,93 01/06/2026 0,00 578,93 01 74385485000204 (22) 99999-0000
ASSOCIACAO RAIZES 88307 1 RMP 19/06/2024 001-1 0,00 0,00 2.779,00 0,00 0,00 2.779,00 04/07/2024 2.779,00 0,00 01 10409250000133
Data de Operação: 28/05/2026
`;

assert.equal(formatCnpj('74385485000204'), '74.385.485/0002-04');
assert.equal(brlToNumber('R$ 1.507.761,63'), 1507761.63);
assert.equal(classifyInvoiceStatus('27/05/2026', '28/05/2026'), 'VENCIDO');
assert.equal(classifyInvoiceStatus('28/05/2026', '28/05/2026'), 'A VENCER');
assert.equal(classifyInvoiceStatus('01/06/2026', '28/05/2026'), 'A VENCER');

const convertedSample = convertExtractedReceivablesText(rawPdfTextSample);
assert.match(convertedSample.markdown, /^# RELATÓRIO DE CONTAS A RECEBER - ROYAL MACAÉ PALACE HOTEL/m);
assert.match(convertedSample.markdown, /Data de Operação: 28\/05\/2026/);
assert.match(convertedSample.markdown, /## AEROMASTER TAXI AEREO LTDA \(CNPJ: 74\.385\.485\/0002-04\)/);
assert.match(convertedSample.markdown, /\* FT-102551 \| Emissão: 30\/04\/2026 \| Vencimento: 01\/06\/2026 \| Vlr Fatura: 578,93 \| Vlr Receber: 578,93 \| Status: A VENCER/);
assert.match(convertedSample.markdown, /\* FT-88307 \| Emissão: 19\/06\/2024 \| Vencimento: 04\/07\/2024 \| Vlr Fatura: 2\.779,00 \| Vlr Receber: 2\.779,00 \| Status: VENCIDO/);
assert.match(convertedSample.markdown, /\* Total Geral a Receber: R\$ 3\.357,93/);
assert.match(convertedSample.markdown, /\* Total Vencido: R\$ 2\.779,00/);
assert.match(convertedSample.markdown, /\* Total a Vencer: R\$ 578,93/);
assert.equal(convertedSample.summary.companyCount, 2);
assert.equal(convertedSample.summary.invoiceCount, 2);
assert.equal(convertedSample.companyTotalValidations.every((row) => row.ok), true);

const groupedPdfTextSample = `
ROYAL MACAE PALACE HOTEL
Faturas a Receber
Data de Operação:
28/05/2026
Empresa Fatura Nº Parc Hotel Emissão Bc - Ag Comissão IRRF Vlr Bruto Desconto Juros Vlr Receber Dt Venc Vencidos A Vencer Posto CNPJ Telefone
AEROMASTER TAXI AÉREO LTDA 22 3199-9796 CNPJ: 74385485000204
102551 1 RMP 30/04/2026 001-1 0,00 0,00 578,93 0,00 0,00 578,93 01/06/2026 0,00 578,93 01
102650 1 RMP 08/05/2026 001-1 0,00 0,00 1.157,85 0,00 0,00 1.157,85 08/06/2026 0,00 1.157,85 01
ASSOCIAÇÃO RAÍZES (21) 3876-0996 CNPJ: 10409250000133
88307 1 RMP 19/06/2024 001-1 0,00 0,00 2.779,00 0,00 0,00 2.779,00 04/07/2024 2.779,00 0,00 01
`;

const convertedGrouped = convertExtractedReceivablesText(groupedPdfTextSample);
assert.match(convertedGrouped.markdown, /Data de Operação: 28\/05\/2026/);
assert.match(convertedGrouped.markdown, /## AEROMASTER TAXI AÉREO LTDA \(CNPJ: 74\.385\.485\/0002-04\)/);
assert.doesNotMatch(convertedGrouped.markdown, /3199-9796 \(CNPJ/);
assert.doesNotMatch(convertedGrouped.markdown, /FT-178\d+/);
assert.match(convertedGrouped.markdown, /\* FT-102551 \| Emissão: 30\/04\/2026 \| Vencimento: 01\/06\/2026 \| Vlr Fatura: 578,93 \| Vlr Receber: 578,93 \| Status: A VENCER/);
assert.match(convertedGrouped.markdown, /\* FT-102650 \| Emissão: 08\/05\/2026 \| Vencimento: 08\/06\/2026 \| Vlr Fatura: 1\.157,85 \| Vlr Receber: 1\.157,85 \| Status: A VENCER/);
assert.match(convertedGrouped.markdown, /## ASSOCIAÇÃO RAÍZES \(CNPJ: 10\.409\.250\/0001-33\)/);
assert.match(convertedGrouped.markdown, /\* FT-88307 \| Emissão: 19\/06\/2024 \| Vencimento: 04\/07\/2024 \| Vlr Fatura: 2\.779,00 \| Vlr Receber: 2\.779,00 \| Status: VENCIDO/);
assert.equal(convertedGrouped.summary.companyCount, 2);
assert.equal(convertedGrouped.summary.invoiceCount, 3);
assert.equal(convertedGrouped.companyTotalValidations.every((row) => row.ok), true);

const duplicateMarkdown = `# RELATORIO DE CONTAS A RECEBER - ROYAL MACAE PALACE HOTEL
Data de Operacao: 28/05/2026

## AEROMASTER TAXI AEREO LTDA (CNPJ: 74.385.485/0002-04)
* FT-102551 | Emissao: 30/04/2026 | Vencimento: 01/06/2026 | Vlr Fatura: 578,93 | Vlr Receber: 578,93 | Status: A VENCER
* FT-102551 | Emissao: 30/04/2026 | Vencimento: 01/06/2026 | Vlr Fatura: 578,93 | Vlr Receber: 578,93 | Status: A VENCER
`;

const duplicateRows = validateImportRows(
  parseMarkdownReport(duplicateMarkdown),
  [{ id: 'company-1', name: 'AEROMASTER TAXI AEREO LTDA', cnpj: '74385485000204', parser_aliases: [] } as any],
  [{ id: 'file-1', company_id: 'company-1', original_name: 'FT-102650 - AEROMASTER TAXI AEREO LTDA', amount: 1157.85, is_deleted: false } as any]
);
assert.equal(duplicateRows[0].action, 'create');
assert.equal(duplicateRows[0].matchedCompanyId, 'company-1');
assert.equal(duplicateRows[1].action, 'duplicate');
assert.match(duplicateRows[1].reason, /arquivo importado/);

const realReportPath = 'C:/Users/ROYA/Downloads/relatorio_contas_receber_royal_macae (1).md';
if (existsSync(realReportPath)) {
  const realReport = readFileSync(realReportPath, 'utf8');
  const convertedReal = convertExtractedReceivablesText(realReport);
  const invoiceCount = convertedReal.companies.reduce((sum, company) => sum + company.invoices.length, 0);
  const calculatedTotal = Number(convertedReal.companies
    .reduce((sum, company) => sum + company.invoices.reduce((sub, invoice) => sub + invoice.openAmount, 0), 0)
    .toFixed(2));

  assert.equal(convertedReal.companies.length, 73);
  assert.equal(invoiceCount, 1060);
  assert.equal(convertedReal.summary.companyCount, 73);
  assert.equal(convertedReal.summary.invoiceCount, 1060);
  assert.equal(calculatedTotal, 1507761.63);
  assert.equal(validateCompanyTotals(convertedReal.markdown).every((row) => row.ok), true);
}

console.log('receivables-parser: ok');
