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

export default function PrioBillingGenerator({ profile: _profile }: Props) {
  const [oe, setOe] = useState('');
  const [solicitante, setSolicitante] = useState('');
  const [rows, setRows] = useState<BillingRow[]>([]);
  const [pdfName, setPdfName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const [rawText, setRawText] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [defaultNoites, setDefaultNoites] = useState(1);
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

        // Group by approximate y-position to reconstruct lines
        const byY = new Map<number, { x: number; str: string }[]>();
        for (const item of items) {
          const y = Math.round(item.transform[5]);
          if (!byY.has(y)) byY.set(y, []);
          byY.get(y)!.push({ x: item.transform[4], str: item.str });
        }
        // Sort y descending (top of page first), x ascending within line
        const sortedYs = [...byY.keys()].sort((a, b) => b - a);
        for (const y of sortedYs) {
          const lineItems = byY.get(y)!.sort((a, b) => a.x - b.x);
          const lineText = lineItems.map(i => i.str).join(' ').trim();
          if (lineText) pageTexts.push(lineText);
        }
      }

      const full = pageTexts.join('\n');
      setRawText(full);

      const parsed = extractRows(full, defaultNoites);

      if (parsed.length === 0) {
        setParseError(
          'Nenhuma nota encontrada. Use "Ver texto bruto" para inspecionar o conteúdo extraído.'
        );
      } else {
        setRows(parsed);
        toast.success(`${parsed.length} nota(s) encontrada(s) — ajuste as noites por linha se necessário`);
      }
    } catch (err: any) {
      setParseError(`Erro ao processar PDF: ${err.message}`);
      toast.error('Erro ao processar PDF');
    } finally {
      setParsing(false);
    }
  }, [defaultNoites]);

  function extractRows(text: string, noitesPadrao: number): BillingRow[] {
    const results: BillingRow[] = [];
    const lines = text.split('\n');

    for (const line of lines) {
      // Must contain a monetary value (e.g. 384,71 or 1.059,43)
      const valueMatches = line.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g);
      if (!valueMatches) continue;

      // Must contain a note number like 56-589078
      const notaMatch = line.match(/\b(\d{2}-\d{5,})\b/);
      if (!notaMatch) continue;

      const nota = notaMatch[1];
      const totalValue = parseBRL(valueMatches[valueMatches.length - 1]);
      if (totalValue <= 0) continue;

      // PDF columns: Data de Entrada | Data de Saída | Data de Emissão
      // → use dates[0] (entrada/check-in) and dates[1] (saída/check-out)
      const allDates = line.match(/\d{2}\/\d{2}\/\d{4}/g) || [];
      const checkin  = allDates[0] || '';
      const checkout = allDates[1] || '';
      const noites   = checkin && checkout ? nightsBetween(checkin, checkout) : noitesPadrao;

      // Hóspede: strip nota, dates, value, status keywords → remaining text
      let hospedeLine = line
        .replace(notaMatch[0], '')
        .replace(/\d{2}\/\d{2}\/\d{4}/g, '')
        .replace(/\d{1,3}(?:\.\d{3})*,\d{2}/g, '')
        .replace(/\b(ATIVA|ATIVO|ENCERRADA|ENCERRADO|CANCELADA|CANCELADO|PENDENTE|PAGO|ABERTA?)\b/gi, '')
        .replace(/R\$\s*/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

      hospedeLine = hospedeLine
        .replace(/^[^A-Za-zÀ-ÿ]+/, '')
        .replace(/[^A-Za-zÀ-ÿ,.\s]+$/, '')
        .trim();

      const hospede = hospedeLine || 'N/A';

      results.push(calcRow({ nota, checkin, checkout, hospede, totalValue, noites }));
    }

    return results;
  }

  // Update a single row's noites and recalculate
  const updateNoites = (idx: number, val: string) => {
    const n = Math.max(0, parseInt(val) || 0);
    setRows(prev => prev.map((r, i) => i === idx ? calcRow({ ...r, noites: n }) : r));
  };

  const applyDefaultNoites = () => {
    setRows(prev => prev.map(r => calcRow({ ...r, noites: defaultNoites })));
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
    (acc, r) => ({
      noites: acc.noites + r.noites,
      tarifa: acc.tarifa + r.tarifa,
      iss: acc.iss + r.iss,
      extras: acc.extras + r.extras,
      saldo: acc.saldo + r.saldo,
    }),
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

      const metaRow1 = ws.addRow(['O.E.:', oe || '-', '', 'Solicitante:', solicitante || '-']);
      metaRow1.font = { bold: true, size: 11 };
      ws.addRow([]);

      const COLS = ['N° Nota', 'Check-in', 'Check-out', 'Hóspede', 'Cliente', 'Noites', 'Tarifa', 'ISS (3,75%)', 'Extras', 'Saldo'];
      const hdrRow = ws.addRow(COLS);
      hdrRow.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB45309' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FF92400E' } } };
      });

      const currFmt = '"R$"#,##0.00';

      rows.forEach((r, idx) => {
        const dataRow = ws.addRow([
          r.nota,
          r.checkin,
          r.checkout,
          r.hospede,
          '',
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
        // Cols 7–10 = Tarifa, ISS, Extras, Saldo (1-based, now shifted +1 for checkout)
        [7, 8, 9, 10].forEach(col => {
          const cell = dataRow.getCell(col);
          cell.numFmt = currFmt;
          cell.alignment = { horizontal: 'right' };
        });
        dataRow.getCell(6).alignment = { horizontal: 'center' }; // Noites
      });

      ws.addRow([]);
      const totalRow = ws.addRow(['', '', '', '', 'TOTAL', totals.noites, totals.tarifa, totals.iss, totals.extras, totals.saldo]);
      totalRow.eachCell({ includeEmpty: true }, cell => {
        cell.font = { bold: true, size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      });
      [7, 8, 9, 10].forEach(col => {
        const cell = totalRow.getCell(col);
        cell.numFmt = currFmt;
        cell.alignment = { horizontal: 'right' };
      });
      totalRow.getCell(6).alignment = { horizontal: 'center' };

      ws.columns = [
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
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `faturamento-prio${oe ? `-oe${oe}` : ''}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Planilha gerada com sucesso!');
    } catch (err: any) {
      toast.error(`Erro ao gerar planilha: ${err.message}`);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Faturamento Prio</h1>
        <p className="text-sm text-gray-500 mt-1">
          Carregue o relatório "Notas a Faturar por Empresa" em PDF. Ajuste as noites por linha para calcular Tarifa, ISS e Extras.
        </p>
      </div>

      {/* O.E. + Solicitante */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Informações do Pedido</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">O.E. (Ordem de Estadia)</label>
            <input
              type="text"
              value={oe}
              onChange={e => setOe(e.target.value)}
              placeholder="Ex.: 2025-001"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Solicitante</label>
            <input
              type="text"
              value={solicitante}
              onChange={e => setSolicitante(e.target.value)}
              placeholder="Nome do solicitante"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            />
          </div>
        </div>
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
            <button
              onClick={() => setShowRaw(v => !v)}
              className="text-xs text-amber-700 hover:underline"
            >
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
            <div>
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                Prévia — {rows.length} nota(s)
              </h2>
              {(oe || solicitante) && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {oe ? `O.E.: ${oe}` : ''}{oe && solicitante ? '  ·  ' : ''}{solicitante ? `Solicitante: ${solicitante}` : ''}
                </p>
              )}
            </div>

            {/* Default noites control */}
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <span className="text-xs font-medium text-amber-800">Noites padrão:</span>
              <input
                type="number"
                min={0}
                value={defaultNoites}
                onChange={e => setDefaultNoites(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-14 px-2 py-1 border border-amber-300 rounded text-xs text-center focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <button
                onClick={applyDefaultNoites}
                className="text-xs font-semibold text-amber-800 hover:text-amber-900 underline whitespace-nowrap"
              >
                Aplicar a todos
              </button>
            </div>

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
                  {['N° Nota', 'Check-in', 'Check-out', 'Hóspede', 'Cliente', 'Noites', 'Tarifa', 'ISS (3,75%)', 'Extras', 'Saldo'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-xs whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-amber-50/40'}>
                    <td className="px-3 py-2 font-mono text-xs">{r.nota}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{r.checkin || '—'}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{r.checkout || '—'}</td>
                    <td className="px-3 py-2 text-xs max-w-48 truncate" title={r.hospede}>{r.hospede}</td>
                    <td className="px-3 py-2 text-xs text-gray-400 italic">—</td>
                    <td className="px-3 py-2 text-xs text-center">
                      <input
                        type="number"
                        min={0}
                        value={r.noites}
                        onChange={e => updateNoites(i, e.target.value)}
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
                  <td colSpan={5} className="px-3 py-2.5 text-xs text-right text-gray-700 uppercase tracking-wide">Total</td>
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
              Tarifa = Noites × R$ {TARIFA_DIARIA},00  ·  ISS = Tarifa × {(ISS_RATE * 100).toFixed(2).replace('.', ',')}%  ·  Extras = Saldo − Tarifa − ISS  ·  Saldo = Valor Total do PDF
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
