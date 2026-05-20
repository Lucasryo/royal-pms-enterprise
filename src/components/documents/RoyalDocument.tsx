import React from 'react';
import { X as CloseIcon, Printer } from 'lucide-react';

export type RoyalDocumentMeta = {
  label: string;
  value?: React.ReactNode;
};

type RoyalDocumentModalProps = {
  title: string;
  subtitle?: string;
  onClose: () => void;
  onPrint?: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
};

type RoyalDocumentPageProps = {
  title: string;
  code?: React.ReactNode;
  issuedAt?: React.ReactNode;
  guestName?: React.ReactNode;
  rightMeta?: RoyalDocumentMeta[];
  children: React.ReactNode;
  footerNote?: React.ReactNode;
};

export const ROYAL_HOTEL_INFO = {
  name: 'ROYAL MACAE PALACE HOTEL',
  address: 'AV. ATLANTICA, 1642   PR. DOS CAVALEIROS',
  city: 'MACAE',
  cep: '22920390',
  phone: '(22)2123-9650',
  cnpj: '07.116.901/0001-92',
  ie: '78735821',
  site: 'www.royalmacae.com.br - reservas@royalmacae.com.br',
};

export function RoyalDocumentModal({ title, subtitle, onClose, onPrint, actions, children }: RoyalDocumentModalProps) {
  const handlePrint = onPrint || (() => window.print());

  return (
    <div className="royal-document-modal fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-4">
      <RoyalPrintStyles />
      <div className="flex h-full max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="royal-document-toolbar flex flex-col gap-3 border-b border-neutral-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-black text-neutral-950">{title}</h3>
            {subtitle && <p className="mt-0.5 truncate text-xs font-bold text-neutral-400">{subtitle}</p>}
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2">
            {actions}
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-2 rounded-xl bg-neutral-950 px-4 py-2 text-xs font-black uppercase tracking-widest text-white hover:bg-neutral-800"
            >
              <Printer className="h-3.5 w-3.5" />
              Imprimir / PDF
            </button>
            <button type="button" onClick={onClose} className="rounded-xl p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900">
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-neutral-100 p-4 sm:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}

export function RoyalDocumentPage({ title, code, issuedAt, guestName, rightMeta = [], children, footerNote }: RoyalDocumentPageProps) {
  const metaRows = [
    code !== undefined ? { label: 'Codigo', value: code } : null,
    issuedAt !== undefined ? { label: 'Data', value: issuedAt } : null,
    ...rightMeta,
  ].filter(Boolean) as RoyalDocumentMeta[];

  return (
    <section
      className="royal-document-page nota-printable relative mx-auto bg-white text-neutral-950 shadow-sm"
      style={{
        width: '210mm',
        minHeight: '297mm',
        padding: '13mm 12mm 9mm',
        fontFamily: 'Arial, Helvetica, sans-serif',
      }}
    >
      <RoyalPrintStyles />
      <img
        src="/logo.png"
        alt=""
        className="pointer-events-none absolute left-1/2 top-[42%] w-[132mm] -translate-x-1/2 -translate-y-1/2 opacity-[0.09]"
      />
      <header className="relative grid grid-cols-[42mm_1fr_58mm] gap-4 text-[12px] leading-tight">
        <div className="flex items-start justify-center pt-1">
          <img src="/logo.png" alt="Royal Macae" className="max-h-16 max-w-[36mm] object-contain" />
        </div>
        <div>
          <h1 className="text-[17px] font-black uppercase leading-none">{ROYAL_HOTEL_INFO.name}</h1>
          <p className="mt-2">{ROYAL_HOTEL_INFO.address}</p>
          <div className="mt-1 grid grid-cols-2 gap-x-6">
            <span>{ROYAL_HOTEL_INFO.city}</span>
            <span>CEP: {ROYAL_HOTEL_INFO.cep}</span>
            <span>Tel.: {ROYAL_HOTEL_INFO.phone}</span>
            <span>FAX.:{ROYAL_HOTEL_INFO.phone}</span>
            <span>PABX.: {ROYAL_HOTEL_INFO.phone}</span>
            <span />
            <span>CNPJ: {ROYAL_HOTEL_INFO.cnpj}</span>
            <span>I.E.: {ROYAL_HOTEL_INFO.ie}</span>
          </div>
        </div>
        <div className="text-right text-[12px]">
          {metaRows.map((row) => (
            <div key={row.label} className="mb-1 grid grid-cols-[1fr_1.4fr] gap-2">
              <span>{row.label}:</span>
              <span className="font-medium">{row.value || ''}</span>
            </div>
          ))}
        </div>
      </header>

      <div className="relative mt-10 min-h-[18px] text-[13px] font-medium uppercase">
        {guestName}
      </div>

      <main className="relative mt-16">
        <div className="mb-1 text-right text-xs">Page 1 of 1</div>
        <h2 className="sr-only">{title}</h2>
        {children}
      </main>

      <footer className="absolute bottom-4 left-12 right-12 text-center text-[12px]">
        <div className="mb-6 text-[16px] tracking-wide">
          <p>Obrigado pela preferencia e volte sempre!</p>
          <p>Thanks for choosing our hotel. We hope to see you soon.</p>
        </div>
        {footerNote}
        <div className="mt-3 border-t border-neutral-900 pt-2 text-left text-[12px] font-bold">
          Assinatura :
        </div>
        <div className="mt-3 border-t border-neutral-900 pt-1 text-center text-[12px] font-normal">
          {ROYAL_HOTEL_INFO.site}
        </div>
      </footer>
    </section>
  );
}

export function RoyalInfoGrid({ rows }: { rows: RoyalDocumentMeta[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
      {rows.filter((row) => row.value !== undefined && row.value !== null && row.value !== '').map((row) => (
        <div key={row.label} className="flex min-w-0">
          <span className="w-28 shrink-0 text-[9px] font-bold uppercase tracking-widest text-neutral-500">{row.label}</span>
          <span className="min-w-0 truncate font-medium text-neutral-950">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

export function RoyalDocumentTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
      <thead>
        <tr className="bg-neutral-300">
          {headers.map((header, index) => (
            <th key={header} className={`px-3 py-2 font-black ${index === headers.length - 1 ? 'text-right' : 'text-left'}`}>
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => (
              <td key={cellIndex} className={`px-3 py-1.5 align-top ${cellIndex === row.length - 1 ? 'text-right tabular-nums' : ''}`}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function RoyalSummary({ children }: { children: React.ReactNode }) {
  return (
    <section className="mt-20 text-[12px]">
      <h3 className="mb-10 font-black">Resumo</h3>
      {children}
    </section>
  );
}

function RoyalPrintStyles() {
  return (
    <style>{`
      @page { size: A4 portrait; margin: 0; }
      @media print {
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          background: #fff !important;
          width: 210mm !important;
          overflow: visible !important;
        }
        body * { visibility: hidden !important; }
        .royal-document-modal, .royal-document-modal * {
          transform: none !important;
          animation: none !important;
          transition: none !important;
          filter: none !important;
          backdrop-filter: none !important;
          box-shadow: none !important;
          overflow: visible !important;
          max-height: none !important;
        }
        .royal-document-modal {
          position: static !important;
          inset: auto !important;
          display: block !important;
          padding: 0 !important;
          background: #fff !important;
        }
        .royal-document-toolbar { display: none !important; }
        .nota-printable, .nota-printable * { visibility: visible !important; }
        .nota-printable {
          position: fixed !important;
          left: 0 !important;
          top: 0 !important;
          width: 210mm !important;
          min-height: 297mm !important;
          margin: 0 !important;
          border: none !important;
          border-radius: 0 !important;
          background: #fff !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .nota-no-print { display: none !important; }
      }
    `}</style>
  );
}
