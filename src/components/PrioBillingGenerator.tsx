import { useState, useCallback, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Upload, FileSpreadsheet, AlertTriangle, X, Download, RefreshCw, Info } from 'lucide-react';
import { toast } from 'sonner';
import { UserProfile } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href;

interface BillingRow {
  solicitante: string;
  oe: string;
  nota: string;
  checkin: string;
  checkout: string;
  hospede: string;
  totalValue: number;
  noites: number;
  tarifa: number;
  iss: number;
  extras: number;
  saldo: number;
}

interface Props {
  profile: UserProfile;
}

const TARIFA_DIARIA = 259;
const ISS_RATE = 0.0375;

function parseDate(s: string): Date | null {
  const [d, m, y] = s.split('/').map(Number);
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d);
}

function nightsBetween(checkin: string, checkout: string): number {
  const d1 = parseDate(checkin);
  const d2 = parseDate(checkout);
  if (!d1 || !d2) return 0;
  return Math.max(0, Math.round((d2.getTime() - d1.getTime()) / 86_400_000));
}

function calcRow(row: Omit<BillingRow, 'tarifa' | 'iss' | 'extras' | 'saldo'>): BillingRow {
  const tarifa = row.noites * TARIFA_DIARIA;
  const iss = parseFloat((tarifa * ISS_RATE).toFixed(2));
  const extras = parseFloat((row.totalValue - tarifa - iss).toFixed(2));
  return { ...row, tarifa, iss, extras, saldo: row.totalValue };
}

function parseBRL(s: string): number {
  const clean = s.replace(/[R$\s]/g, '');
  if (clean.includes(',')) return parseFloat(clean.replace(/\./g, '').replace(',', '.'));
  return parseFloat(clean.replace(/[^\d.]/g, '')) || 0;
}

function fmtBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Column order: Solicitante | O.E. | N° Nota | Check-in | Check-out | Hóspede | Cliente | Noites | Tarifa | ISS | Extras | Saldo
const TABLE_HEADERS = ['Solicitante', 'O.E.', 'N° Nota', 'Check-in', 'Check-out', 'Hóspede', 'Cliente', 'Noites', 'Tarifa', 'ISS (3,75%)', 'Extras', 'Saldo'];

export default function PrioBillingGenerator({ profile: _profile }: Props) {
  const [rows, setRows] = useState<BillingRow[]>([]);
  const [pdfName, setPdfName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const [rawText, setRawText] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsePDF = useCallback(async (file: File) => {
    setParsing(true);
    setParseError('');
    setRows([]);
    setRawText('');
    setPdfName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

      const pageTexts: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const items = content.items as any[];

        const byY = new Map<number, { x: number; str: string }[]>();
        for (const item of items) {
          const y = Math.round(item.transform[5]);
          if (!byY.has(y)) byY.set(y, []);
          byY.get(y)!.push({ x: item.transform[4], str: item.str });
        }
        const sortedYs = [...byY.keys()].sort((a, b) => b - a);
        for (const y of sortedYs) {
          const lineItems = byY.get(y)!.sort((a, b) => a.x - b.x);
          const lineText = lineItems.map(it => it.str).join(' ').trim();
          if (lineText) pageTexts.push(lineText);
        }
      }

      const full = pageTexts.join('\n');
      setRawText(full);

      const parsed = extractRows(full);

      if (parsed.length === 0) {
        setParseError('Nenhuma nota encontrada. Use "Ver texto bruto" para inspecionar o conteúdo extraído.');
      } else {
        setRows(parsed);
        toast.success(`${parsed.length} nota(s) encontrada(s)`);
      }
    } catch (err: any) {
      setParseError(`Erro ao processar PDF: ${err.message}`);
      toast.error('Erro ao processar PDF');
    } finally {
      setParsing(false);
    }
  }, []);

  function extractRows(text: string): BillingRow[] {
    const results: BillingRow[] = [];
    for (const line of text.split('\n')) {
      const valueMatches = line.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g);
      if (!valueMatches) continue;

      const notaMatch = line.match(/\b(\d{2}-\d{5,})\b/);
      if (!notaMatch) continue;

      const nota = notaMatch[1];
      const totalValue = parseBRL(valueMatches[valueMatches.length - 1]);
      if (totalValue <= 0) continue;

      // Data de Entrada = dates[0], Data de Saída = dates[1], Data de Emissão = dates[2] (ignored)
      const allDates = line.match(/\d{2}\/\d{2}\/\d{4}/g) || [];
      const checkin  = allDates[0] || '';
      const checkout = allDates[1] || '';
      const noites   = nightsBetween(checkin, checkout);

      let hospedeLine = line
        .replace(notaMatch[0], '')
        .replace(/\d{2}\/\d{2}\/\d{4}/g, '')
        .replace(/\d{1,3}(?:\.\d{3})*,\d{2}/g, '')
        .replace(/\b(ATIVA|ATIVO|ENCERRADA|ENCERRADO|CANCELADA|CANCELADO|PENDENTE|PAGO|ABERTA?)\b/gi, '')
        .replace(/R\$\s*/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .replace(/^[^A-Za-zÀ-ÿ]+/, '')
        .replace(/[^A-Za-zÀ-ÿ,.\s]+$/, '')
        .trim();

      results.push(calcRow({ solicitante: '', oe: '', nota, checkin, checkout, hospede: hospedeLine || 'N/A', totalValue, noites }));
    }
    return results;
  }

  const updateField = (idx: number, field: keyof BillingRow, val: string) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      if (field === 'noites') return calcRow({ ...r, noites: Math.max(0, parseInt(val) || 0) });
      return { ...r, [field]: val };
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parsePDF(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file?.type === 'application/pdf') parsePDF(file);
    else toast.error('Selecione um arquivo PDF');
  };

  const totals = rows.reduce(
    (acc, r) => ({ noites: acc.noites + r.noites, tarifa: acc.tarifa + r.tarifa, iss: acc.iss + r.iss, extras: acc.extras + r.extras, saldo: acc.saldo + r.saldo }),
    { noites: 0, tarifa: 0, iss: 0, extras: 0, saldo: 0 }
  );

  const generateExcel = async () => {
    if (rows.length === 0) return;
    try {
      const ExcelJS = await import('exceljs');
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Royal PMS';
      wb.created = new Date();
      const ws = wb.addWorksheet('Faturamento Prio');

      const hdrRow = ws.addRow(TABLE_HEADERS);
      hdrRow.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB45309' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FF92400E' } } };
      });

      const currFmt = '"R$"#,##0.00';
      // Currency cols (1-based): Tarifa=9, ISS=10, Extras=11, Saldo=12
      const currCols = [9, 10, 11, 12];

      rows.forEach((r, idx) => {
        const dataRow = ws.addRow([
          r.solicitante,
          r.oe,
          r.nota,
          r.checkin,
          r.checkout,
          r.hospede,
          '', // Cliente
          r.noites,
          r.tarifa,
          r.iss,
          r.extras,
          r.saldo,
        ]);
        const bg = idx % 2 === 0 ? 'FFFFFFFF' : 'FFFFF8E8';
        dataRow.eachCell({ includeEmpty: true }, cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
          cell.font = { size: 10 };
        });
        currCols.forEach(col => {
          dataRow.getCell(col).numFmt = currFmt;
          dataRow.getCell(col).alignment = { horizontal: 'right' };
        });
        dataRow.getCell(8).alignment = { horizontal: 'center' }; // Noites
      });

      ws.addRow([]);
      const totalRow = ws.addRow(['', '', '', '', '', '', 'TOTAL', totals.noites, totals.tarifa, totals.iss, totals.extras, totals.saldo]);
      totalRow.eachCell({ includeEmpty: true }, cell => {
        cell.font = { bold: true, size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      });
      currCols.forEach(col => {
        totalRow.getCell(col).numFmt = currFmt;
        totalRow.getCell(col).alignment = { horizontal: 'right' };
      });
      totalRow.getCell(8).alignment = { horizontal: 'center' };

      ws.columns = [
        { width: 22 }, // Solicitante
        { width: 14 }, // O.E.
        { width: 14 }, // N° Nota
        { width: 12 }, // Check-in
        { width: 12 }, // Check-out
        { width: 32 }, // Hóspede
        { width: 22 }, // Cliente
        { width: 8 },  // Noites
        { width: 14 }, // Tarifa
        { width: 14 }, // ISS
        { width: 14 }, // Extras
        { width: 14 }, // Saldo
      ];

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'faturamento-prio.xlsx';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Planilha gerada com sucesso!');
    } catch (err: any) {
      toast.error(`Erro ao gerar planilha: ${err.message}`);
    }
  };

  const inputCls = 'w-full px-1.5 py-0.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white';

  return (
    <div className="p-6 max-w-full mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Faturamento Prio</h1>
        <p className="text-sm text-gray-500 mt-1">
          Carregue o relatório "Notas a Faturar por Empresa" em PDF. Preencha Solicitante e O.E. por linha antes de baixar a planilha.
        </p>
      </div>

      {/* PDF Upload */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Carregar Relatório PDF</h2>

        <div
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
            dragOver ? 'border-amber-500 bg-amber-50' : 'border-gray-300 hover:border-amber-400 hover:bg-amber-50/40'
          }`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          {parsing ? (
            <div className="flex flex-col items-center gap-3 text-amber-700">
              <RefreshCw className="w-10 h-10 animate-spin" />
              <p className="text-sm font-medium">Processando PDF…</p>
            </div>
          ) : pdfName ? (
            <div className="flex flex-col items-center gap-2 text-amber-700">
              <FileSpreadsheet className="w-10 h-10" />
              <p className="text-sm font-semibold">{pdfName}</p>
              <p className="text-xs text-gray-500">Clique para trocar o arquivo</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-gray-400">
              <Upload className="w-10 h-10" />
              <div>
                <p className="text-sm font-medium text-gray-600">Arraste o PDF ou clique para selecionar</p>
                <p className="text-xs text-gray-400 mt-1">Notas a Faturar por Empresa (.pdf)</p>
              </div>
            </div>
          )}
        </div>

        <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />

        {parseError && (
          <div className="mt-4 flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{parseError}</span>
          </div>
        )}

        {rawText && (
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <Info className="w-3.5 h-3.5" />
              {rows.length > 0 ? `${rows.length} nota(s) extraída(s)` : 'Texto extraído — nenhuma nota reconhecida'}
            </p>
            <button onClick={() => setShowRaw(v => !v)} className="text-xs text-amber-700 hover:underline">
              {showRaw ? 'Ocultar texto bruto' : 'Ver texto bruto'}
            </button>
          </div>
        )}

        {showRaw && rawText && (
          <pre className="mt-2 p-4 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700 overflow-auto max-h-64 whitespace-pre-wrap">
            {rawText}
          </pre>
        )}
      </div>

      {/* Preview table */}
      {rows.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-wrap gap-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
              Prévia — {rows.length} nota(s)
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setRows([]); setPdfName(''); setRawText(''); setParseError(''); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Limpar
              </button>
              <button
                onClick={generateExcel}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-lg transition-colors shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                Baixar Planilha
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-amber-700 text-white">
                  {TABLE_HEADERS.map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-xs whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-amber-50/40'}>
                    {/* Solicitante — editable */}
                    <td className="px-2 py-1.5 text-xs min-w-32">
                      <input
                        type="text"
                        value={r.solicitante}
                        onChange={e => updateField(i, 'solicitante', e.target.value)}
                        placeholder="Solicitante"
                        className={inputCls}
                      />
                    </td>
                    {/* O.E. — editable */}
                    <td className="px-2 py-1.5 text-xs min-w-24">
                      <input
                        type="text"
                        value={r.oe}
                        onChange={e => updateField(i, 'oe', e.target.value)}
                        placeholder="O.E."
                        className={inputCls}
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{r.nota}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{r.checkin || '—'}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{r.checkout || '—'}</td>
                    <td className="px-3 py-2 text-xs max-w-48 truncate" title={r.hospede}>{r.hospede}</td>
                    <td className="px-3 py-2 text-xs text-gray-400 italic">—</td>
                    {/* Noites — editable */}
                    <td className="px-2 py-1.5 text-xs text-center">
                      <input
                        type="number"
                        min={0}
                        value={r.noites}
                        onChange={e => updateField(i, 'noites', e.target.value)}
                        className="w-14 px-1.5 py-0.5 border border-gray-300 rounded text-center text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </td>
                    <td className="px-3 py-2 text-xs text-right tabular-nums">{fmtBRL(r.tarifa)}</td>
                    <td className="px-3 py-2 text-xs text-right tabular-nums text-amber-700">{fmtBRL(r.iss)}</td>
                    <td className="px-3 py-2 text-xs text-right tabular-nums">{fmtBRL(r.extras)}</td>
                    <td className="px-3 py-2 text-xs text-right tabular-nums font-semibold">{fmtBRL(r.saldo)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-amber-100 border-t-2 border-amber-300 font-bold">
                  <td colSpan={7} className="px-3 py-2.5 text-xs text-right text-gray-700 uppercase tracking-wide">Total</td>
                  <td className="px-3 py-2.5 text-xs text-center">{totals.noites}</td>
                  <td className="px-3 py-2.5 text-xs text-right tabular-nums">{fmtBRL(totals.tarifa)}</td>
                  <td className="px-3 py-2.5 text-xs text-right tabular-nums text-amber-700">{fmtBRL(totals.iss)}</td>
                  <td className="px-3 py-2.5 text-xs text-right tabular-nums">{fmtBRL(totals.extras)}</td>
                  <td className="px-3 py-2.5 text-xs text-right tabular-nums">{fmtBRL(totals.saldo)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="px-6 py-3 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-500">
              <strong className="text-gray-600">Fórmulas:</strong>{' '}
              Tarifa = Noites × R${TARIFA_DIARIA},00  ·  ISS = Tarifa × {(ISS_RATE * 100).toFixed(2).replace('.', ',')}%  ·  Extras = Saldo − Tarifa − ISS
            </p>
          </div>
        </div>
      )}

      {rows.length === 0 && !parsing && !parseError && (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center">
          <FileSpreadsheet className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-400">Carregue o PDF para visualizar e baixar a planilha</p>
        </div>
      )}
    </div>
  );
}
