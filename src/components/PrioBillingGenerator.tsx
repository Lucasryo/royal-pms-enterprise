import { useState, useCallback, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  Upload, FileSpreadsheet, AlertTriangle, X, Download,
  RefreshCw, Info, Plus, Building2, Trash2, ChevronDown, ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { UserProfile } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href;

// ─── Types ───────────────────────────────────────────────────────────────────

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

interface ClientEntry {
  id: string;
  name: string;
  cnpj: string;
  rows: BillingRow[];
  pdfName: string;
  parsing: boolean;
  parseError: string;
  rawText: string;
  showRaw: boolean;
  dragOver: boolean;
  collapsed: boolean;
}

interface Props { profile: UserProfile; }

// ─── Constants ───────────────────────────────────────────────────────────────

const TARIFA_DIARIA = 259;
const ISS_RATE = 0.0375;
const TABLE_HEADERS = ['Solicitante', 'O.E.', 'N° Nota', 'Check-in', 'Check-out', 'Hóspede', 'Cliente', 'Noites', 'Tarifa', 'ISS (3,75%)', 'Extras', 'Saldo'];

// ─── Pure helpers ────────────────────────────────────────────────────────────

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
  const iss    = parseFloat((tarifa * ISS_RATE).toFixed(2));
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

function formatCnpj(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

function extractRows(text: string): BillingRow[] {
  const results: BillingRow[] = [];
  for (const line of text.split('\n')) {
    const valueMatches = line.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g);
    if (!valueMatches) continue;
    const notaMatch = line.match(/\b(\d{2}-\d{5,})\b/);
    if (!notaMatch) continue;

    const nota       = notaMatch[1];
    const totalValue = parseBRL(valueMatches[valueMatches.length - 1]);
    if (totalValue <= 0) continue;

    // dates[0]=Entrada, dates[1]=Saída, dates[2]=Emissão (ignored)
    const allDates = line.match(/\d{2}\/\d{2}\/\d{4}/g) || [];
    const checkin  = allDates[0] || '';
    const checkout = allDates[1] || '';
    const noites   = nightsBetween(checkin, checkout);

    const hospede = line
      .replace(notaMatch[0], '')
      .replace(/\d{2}\/\d{2}\/\d{4}/g, '')
      .replace(/\d{1,3}(?:\.\d{3})*,\d{2}/g, '')
      .replace(/\b(ATIVA|ATIVO|ENCERRADA|ENCERRADO|CANCELADA|CANCELADO|PENDENTE|PAGO|ABERTA?)\b/gi, '')
      .replace(/R\$\s*/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .replace(/^[^A-Za-zÀ-ÿ]+/, '')
      .replace(/[^A-Za-zÀ-ÿ,.\s]+$/, '')
      .trim() || 'N/A';

    results.push(calcRow({ solicitante: '', oe: '', nota, checkin, checkout, hospede, totalValue, noites }));
  }
  return results;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PrioBillingGenerator({ profile: _profile }: Props) {
  const [clients, setClients]   = useState<ClientEntry[]>([]);
  const [newName, setNewName]   = useState('');
  const [newCnpj, setNewCnpj]  = useState('');
  const fileInputRef            = useRef<HTMLInputElement>(null);
  const activeClientId          = useRef<string>('');

  // ── Client management ──────────────────────────────────────────────────────

  const addClient = () => {
    const name = newName.trim();
    if (!name) { toast.error('Informe o nome da empresa'); return; }
    const entry: ClientEntry = {
      id: crypto.randomUUID(),
      name,
      cnpj: newCnpj.trim(),
      rows: [],
      pdfName: '',
      parsing: false,
      parseError: '',
      rawText: '',
      showRaw: false,
      dragOver: false,
      collapsed: false,
    };
    setClients(prev => [...prev, entry]);
    setNewName('');
    setNewCnpj('');
  };

  const removeClient = (id: string) =>
    setClients(prev => prev.filter(c => c.id !== id));

  const updateClient = (id: string, patch: Partial<ClientEntry>) =>
    setClients(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));

  // ── PDF parsing ────────────────────────────────────────────────────────────

  const parsePDF = useCallback(async (clientId: string, file: File) => {
    updateClient(clientId, { parsing: true, parseError: '', rows: [], rawText: '', pdfName: file.name });

    try {
      const buffer = await file.arrayBuffer();
      const pdf    = await pdfjsLib.getDocument({ data: buffer }).promise;
      const pageTexts: string[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page    = await pdf.getPage(i);
        const content = await page.getTextContent();
        const items   = content.items as any[];
        const byY     = new Map<number, { x: number; str: string }[]>();

        for (const item of items) {
          const y = Math.round(item.transform[5]);
          if (!byY.has(y)) byY.set(y, []);
          byY.get(y)!.push({ x: item.transform[4], str: item.str });
        }
        for (const y of [...byY.keys()].sort((a, b) => b - a)) {
          const text = byY.get(y)!.sort((a, b) => a.x - b.x).map(it => it.str).join(' ').trim();
          if (text) pageTexts.push(text);
        }
      }

      const full   = pageTexts.join('\n');
      const parsed = extractRows(full);

      if (parsed.length === 0) {
        updateClient(clientId, { parsing: false, rawText: full, parseError: 'Nenhuma nota encontrada. Use "Ver texto bruto" para inspecionar.' });
      } else {
        updateClient(clientId, { parsing: false, rawText: full, rows: parsed });
        toast.success(`${parsed.length} nota(s) encontrada(s) para ${clients.find(c => c.id === clientId)?.name || 'empresa'}`);
      }
    } catch (err: any) {
      updateClient(clientId, { parsing: false, parseError: `Erro: ${err.message}` });
      toast.error('Erro ao processar PDF');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients]);

  const triggerFileInput = (clientId: string) => {
    activeClientId.current = clientId;
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && activeClientId.current) parsePDF(activeClientId.current, file);
    e.target.value = '';
  };

  const handleDrop = (clientId: string, e: React.DragEvent) => {
    e.preventDefault();
    updateClient(clientId, { dragOver: false });
    const file = e.dataTransfer.files[0];
    if (file?.type === 'application/pdf') parsePDF(clientId, file);
    else toast.error('Selecione um arquivo PDF');
  };

  // ── Row editing ────────────────────────────────────────────────────────────

  const updateRow = (clientId: string, rowIdx: number, field: keyof BillingRow, val: string) => {
    setClients(prev => prev.map(c => {
      if (c.id !== clientId) return c;
      const rows = c.rows.map((r, i) => {
        if (i !== rowIdx) return r;
        if (field === 'noites') return calcRow({ ...r, noites: Math.max(0, parseInt(val) || 0) });
        return { ...r, [field]: val };
      });
      return { ...c, rows };
    }));
  };

  // ── Excel export ───────────────────────────────────────────────────────────

  const generateExcel = async () => {
    const active = clients.filter(c => c.rows.length > 0);
    if (active.length === 0) { toast.error('Nenhuma nota carregada'); return; }

    try {
      const ExcelJS = await import('exceljs');
      const wb      = new ExcelJS.Workbook();
      wb.creator    = 'Royal PMS';
      wb.created    = new Date();

      const currFmt  = '"R$"#,##0.00';
      const currCols = [9, 10, 11, 12]; // Tarifa, ISS, Extras, Saldo (1-based)

      for (const client of active) {
        const sheetName = `${client.name}`.slice(0, 31);
        const ws        = wb.addWorksheet(sheetName);

        // Company header row
        const companyLabel = client.cnpj
          ? `${client.name} — CNPJ: ${client.cnpj}`
          : client.name;
        const compRow = ws.addRow([companyLabel]);
        compRow.getCell(1).font = { bold: true, size: 11, color: { argb: 'FF92400E' } };
        ws.mergeCells(compRow.number, 1, compRow.number, TABLE_HEADERS.length);
        ws.addRow([]);

        // Column headers
        const hdrRow = ws.addRow(TABLE_HEADERS);
        hdrRow.eachCell(cell => {
          cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
          cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB45309' } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border    = { bottom: { style: 'thin', color: { argb: 'FF92400E' } } };
        });

        // Data rows
        const clientLabel = client.cnpj ? `${client.name}\n${client.cnpj}` : client.name;
        client.rows.forEach((r, idx) => {
          const dataRow = ws.addRow([
            r.solicitante,
            r.oe,
            r.nota,
            r.checkin,
            r.checkout,
            r.hospede,
            clientLabel, // Cliente = nome + CNPJ em célula única
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
          // Cliente cell: wrapText so name + CNPJ appear on separate lines
          const clientCell = dataRow.getCell(7);
          clientCell.alignment = { wrapText: true, vertical: 'middle' };

          currCols.forEach(col => {
            dataRow.getCell(col).numFmt    = currFmt;
            dataRow.getCell(col).alignment = { horizontal: 'right' };
          });
          dataRow.getCell(8).alignment = { horizontal: 'center' };
        });

        // Totals row
        const totals = client.rows.reduce(
          (acc, r) => ({ noites: acc.noites + r.noites, tarifa: acc.tarifa + r.tarifa, iss: acc.iss + r.iss, extras: acc.extras + r.extras, saldo: acc.saldo + r.saldo }),
          { noites: 0, tarifa: 0, iss: 0, extras: 0, saldo: 0 }
        );
        ws.addRow([]);
        const totalRow = ws.addRow(['', '', '', '', '', '', 'TOTAL', totals.noites, totals.tarifa, totals.iss, totals.extras, totals.saldo]);
        totalRow.eachCell({ includeEmpty: true }, cell => {
          cell.font = { bold: true, size: 10 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
        });
        currCols.forEach(col => {
          totalRow.getCell(col).numFmt    = currFmt;
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
          { width: 26 }, // Cliente
          { width: 8  }, // Noites
          { width: 14 }, // Tarifa
          { width: 14 }, // ISS
          { width: 14 }, // Extras
          { width: 14 }, // Saldo
        ];
      }

      const buffer = await wb.xlsx.writeBuffer();
      const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url    = URL.createObjectURL(blob);
      const a      = document.createElement('a');
      a.href       = url;
      a.download   = 'faturamento-prio.xlsx';
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Planilha gerada com ${active.length} aba(s)!`);
    } catch (err: any) {
      toast.error(`Erro ao gerar planilha: ${err.message}`);
    }
  };

  // ── Render helpers ─────────────────────────────────────────────────────────

  const inputCls = 'w-full px-1.5 py-0.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white';
  const totalClients = clients.filter(c => c.rows.length > 0).length;

  return (
    <div className="p-6 max-w-full mx-auto space-y-6">

      {/* Page title */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Faturamento Prio</h1>
          <p className="text-sm text-gray-500 mt-1">
            Adicione as empresas Prio, carregue o PDF de cada uma e gere a planilha com uma aba por empresa.
          </p>
        </div>
        {totalClients > 0 && (
          <button
            onClick={generateExcel}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-xl transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            Baixar Planilha ({totalClients} aba{totalClients > 1 ? 's' : ''})
          </button>
        )}
      </div>

      {/* Add company form */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Adicionar Empresa</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-medium text-gray-600 mb-1">Nome da Empresa</label>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addClient()}
              placeholder="Ex.: PETRO RIO BRAVO LTDA"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            />
          </div>
          <div className="w-52">
            <label className="block text-xs font-medium text-gray-600 mb-1">CNPJ</label>
            <input
              type="text"
              value={newCnpj}
              onChange={e => setNewCnpj(formatCnpj(e.target.value))}
              onKeyDown={e => e.key === 'Enter' && addClient()}
              placeholder="00.000.000/0000-00"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={addClient}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-lg transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Adicionar
          </button>
        </div>
      </div>

      {/* Client cards */}
      {clients.length === 0 && (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center">
          <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-400">Adicione ao menos uma empresa para começar</p>
        </div>
      )}

      {clients.map(client => {
        const rowTotals = client.rows.reduce(
          (acc, r) => ({ noites: acc.noites + r.noites, tarifa: acc.tarifa + r.tarifa, iss: acc.iss + r.iss, extras: acc.extras + r.extras, saldo: acc.saldo + r.saldo }),
          { noites: 0, tarifa: 0, iss: 0, extras: 0, saldo: 0 }
        );

        return (
          <div key={client.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

            {/* Client header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-amber-50/50">
              <div className="flex items-center gap-3">
                <Building2 className="w-5 h-5 text-amber-700 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-gray-900">{client.name}</p>
                  {client.cnpj && <p className="text-xs text-gray-500">CNPJ: {client.cnpj}</p>}
                </div>
                {client.rows.length > 0 && (
                  <span className="ml-2 px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 rounded-full">
                    {client.rows.length} nota(s)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {client.rows.length > 0 && (
                  <button
                    onClick={() => updateClient(client.id, { collapsed: !client.collapsed })}
                    className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    {client.collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                  </button>
                )}
                <button
                  onClick={() => removeClient(client.id)}
                  className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* PDF upload */}
            {!client.collapsed && (
              <div className="p-6 space-y-4">
                <div
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                    client.dragOver ? 'border-amber-500 bg-amber-50' : 'border-gray-300 hover:border-amber-400 hover:bg-amber-50/40'
                  }`}
                  onDragOver={e => { e.preventDefault(); updateClient(client.id, { dragOver: true }); }}
                  onDragLeave={() => updateClient(client.id, { dragOver: false })}
                  onDrop={e => handleDrop(client.id, e)}
                  onClick={() => triggerFileInput(client.id)}
                >
                  {client.parsing ? (
                    <div className="flex flex-col items-center gap-3 text-amber-700">
                      <RefreshCw className="w-8 h-8 animate-spin" />
                      <p className="text-sm font-medium">Processando PDF…</p>
                    </div>
                  ) : client.pdfName ? (
                    <div className="flex flex-col items-center gap-2 text-amber-700">
                      <FileSpreadsheet className="w-8 h-8" />
                      <p className="text-sm font-semibold">{client.pdfName}</p>
                      <p className="text-xs text-gray-400">Clique para trocar</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                      <Upload className="w-8 h-8" />
                      <p className="text-sm font-medium text-gray-600">Arraste o PDF ou clique para selecionar</p>
                      <p className="text-xs">Notas a Faturar por Empresa</p>
                    </div>
                  )}
                </div>

                {client.parseError && (
                  <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{client.parseError}</span>
                  </div>
                )}

                {client.rawText && (
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Info className="w-3.5 h-3.5" />
                      {client.rows.length > 0 ? `${client.rows.length} nota(s) extraída(s)` : 'Nenhuma nota reconhecida'}
                    </p>
                    <button
                      onClick={() => updateClient(client.id, { showRaw: !client.showRaw })}
                      className="text-xs text-amber-700 hover:underline"
                    >
                      {client.showRaw ? 'Ocultar texto bruto' : 'Ver texto bruto'}
                    </button>
                  </div>
                )}

                {client.showRaw && client.rawText && (
                  <pre className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700 overflow-auto max-h-48 whitespace-pre-wrap">
                    {client.rawText}
                  </pre>
                )}
              </div>
            )}

            {/* Preview table */}
            {client.rows.length > 0 && !client.collapsed && (
              <>
                <div className="overflow-x-auto border-t border-gray-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-amber-700 text-white">
                        {TABLE_HEADERS.map(h => (
                          <th key={h} className="px-3 py-2 text-left font-semibold text-xs whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {client.rows.map((r, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-amber-50/40'}>
                          <td className="px-2 py-1.5 text-xs min-w-32">
                            <input type="text" value={r.solicitante} onChange={e => updateRow(client.id, i, 'solicitante', e.target.value)} placeholder="Solicitante" className={inputCls} />
                          </td>
                          <td className="px-2 py-1.5 text-xs min-w-24">
                            <input type="text" value={r.oe} onChange={e => updateRow(client.id, i, 'oe', e.target.value)} placeholder="O.E." className={inputCls} />
                          </td>
                          <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{r.nota}</td>
                          <td className="px-3 py-2 text-xs whitespace-nowrap">{r.checkin || '—'}</td>
                          <td className="px-3 py-2 text-xs whitespace-nowrap">{r.checkout || '—'}</td>
                          <td className="px-3 py-2 text-xs max-w-48 truncate" title={r.hospede}>{r.hospede}</td>
                          {/* Cliente: nome + CNPJ juntos */}
                          <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                            <span className="block font-medium text-gray-700">{client.name}</span>
                            {client.cnpj && <span className="block text-gray-400">{client.cnpj}</span>}
                          </td>
                          <td className="px-2 py-1.5 text-xs text-center">
                            <input type="number" min={0} value={r.noites} onChange={e => updateRow(client.id, i, 'noites', e.target.value)} className="w-14 px-1.5 py-0.5 border border-gray-300 rounded text-center text-xs focus:outline-none focus:ring-1 focus:ring-amber-500" />
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
                        <td className="px-3 py-2.5 text-xs text-center">{rowTotals.noites}</td>
                        <td className="px-3 py-2.5 text-xs text-right tabular-nums">{fmtBRL(rowTotals.tarifa)}</td>
                        <td className="px-3 py-2.5 text-xs text-right tabular-nums text-amber-700">{fmtBRL(rowTotals.iss)}</td>
                        <td className="px-3 py-2.5 text-xs text-right tabular-nums">{fmtBRL(rowTotals.extras)}</td>
                        <td className="px-3 py-2.5 text-xs text-right tabular-nums">{fmtBRL(rowTotals.saldo)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="px-6 py-2.5 border-t border-gray-100 bg-gray-50">
                  <p className="text-xs text-gray-400">
                    Tarifa = Noites × R${TARIFA_DIARIA},00  ·  ISS = Tarifa × {(ISS_RATE * 100).toFixed(2).replace('.', ',')}%  ·  Extras = Saldo − Tarifa − ISS
                  </p>
                </div>
              </>
            )}
          </div>
        );
      })}

      <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />
    </div>
  );
}
