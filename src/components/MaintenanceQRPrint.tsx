import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { supabase } from '../supabase';
import { generateQRToken } from '../lib/qrToken';
import { Loader2, Printer, RefreshCw } from 'lucide-react';

type Room = {
  id: string;
  room_number: string;
  floor: number;
  category: string;
  is_virtual: boolean;
};

type RoomQR = Room & { qrDataUrl: string };

export default function MaintenanceQRPrint() {
  const [rooms, setRooms] = useState<RoomQR[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error: dbError } = await supabase
      .from('rooms')
      .select('id, room_number, floor, category, is_virtual')
      .eq('is_virtual', false)
      .order('floor')
      .order('room_number');

    if (dbError) {
      setError(dbError.message);
      setLoading(false);
      return;
    }

    try {
      const baseUrl = window.location.origin;
      const withQRs: RoomQR[] = await Promise.all(
        ((data ?? []) as Room[]).map(async (room) => {
          const token = await generateQRToken(room.room_number);
          const url = `${baseUrl}/report/${encodeURIComponent(room.room_number)}?k=${token}`;
          return {
            ...room,
            qrDataUrl: await QRCode.toDataURL(url, {
              margin: 1,
              width: 360,
              color: { dark: '#0a0a0a', light: '#ffffff' },
            }),
          };
        }),
      );
      setRooms(withQRs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao gerar QR codes');
    } finally {
      setLoading(false);
    }
  }

  function printAll() {
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>QR Codes — Royal PMS</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); }
    .card { border: 2px dashed #d4d4d4; padding: 1.25rem; display: flex; flex-direction: column; align-items: center; text-align: center; break-inside: avoid; page-break-inside: avoid; }
    .badge { font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.28em; color: #d97706; }
    .room  { font-size: 1.5rem; font-weight: 900; color: #0a0a0a; margin: 0.2rem 0; }
    .meta  { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #a3a3a3; }
    .qr    { width: 180px; height: 180px; margin-top: 0.75rem; display: block; }
    .cta   { margin-top: 0.6rem; font-size: 11px; font-weight: 700; color: #525252; }
    .sub   { font-size: 9px; color: #737373; line-height: 1.4; max-width: 160px; }
    @media print { @page { margin: 0; } body { margin: 0; } }
  </style>
</head>
<body>
  <div class="grid">
    ${rooms.map(room => `
    <div class="card">
      <p class="badge">Royal PMS</p>
      <h3 class="room">UH ${room.room_number}</h3>
      <p class="meta">${room.category} · ${room.floor}º andar</p>
      <img src="${room.qrDataUrl}" alt="QR UH ${room.room_number}" class="qr" />
      <p class="cta">Achou um problema?</p>
      <p class="sub">Aponte a câmera. Sem login. Em segundos.</p>
    </div>`).join('')}
  </div>
</body>
</html>`;

    const FRAME_ID = 'qr-print-frame';
    const existing = document.getElementById(FRAME_ID);
    if (existing) existing.remove();

    const iframe = document.createElement('iframe');
    iframe.id = FRAME_ID;
    iframe.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;border:none;opacity:0;pointer-events:none;';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!doc) { iframe.remove(); return; }

    doc.open();
    doc.write(html);
    doc.close();

    const cleanup = () => {
      if (document.body.contains(iframe)) iframe.remove();
    };

    // Wait for images to load before printing
    const allImgs = Array.from(doc.querySelectorAll('img'));
    const loaded = allImgs.map(
      img => img.complete ? Promise.resolve() : new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r(); })
    );

    Promise.all(loaded).then(() => {
      setTimeout(() => {
        try {
          iframe.contentWindow?.print();
        } catch {
          window.print();
        }
        window.addEventListener('afterprint', cleanup, { once: true });
        setTimeout(cleanup, 8000);
      }, 200);
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-neutral-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 sm:p-6 text-red-700">
        Erro ao carregar UHs: {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-neutral-200 bg-white p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] sm:text-xs font-black uppercase tracking-[0.28em] text-amber-600">QR Codes — UHs</p>
            <h1 className="mt-1 text-xl sm:text-2xl font-black text-neutral-950">Imprimir adesivos para as portas</h1>
            <p className="mt-1 text-xs sm:text-sm text-neutral-500">
              Cada QR abre o formulario publico de chamado pra UH correspondente — sem login.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => void load()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-100 text-neutral-700 hover:bg-neutral-200 text-sm font-bold"
            >
              <RefreshCw className="w-4 h-4" />
              Recarregar
            </button>
            <button
              onClick={printAll}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-900 text-white hover:bg-neutral-800 text-sm font-bold"
            >
              <Printer className="w-4 h-4" />
              Imprimir todos ({rooms.length})
            </button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rooms.map((room) => (
          <article
            key={room.id}
            className="rounded-3xl border border-neutral-200 bg-white p-5 sm:p-6 shadow-sm flex flex-col items-center text-center"
          >
            <p className="text-[10px] font-black uppercase tracking-[0.32em] text-amber-600">Royal PMS</p>
            <h3 className="mt-1 text-2xl font-black text-neutral-950">UH {room.room_number}</h3>
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
              {room.category} · {room.floor}o andar
            </p>
            <img
              src={room.qrDataUrl}
              alt={`QR UH ${room.room_number}`}
              className="mt-4 w-48 h-48"
            />
            <p className="mt-3 text-xs font-bold text-neutral-600">Achou um problema?</p>
            <p className="text-[10px] text-neutral-500 leading-snug max-w-[180px]">
              Aponte a camera. Sem login. Em segundos.
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
