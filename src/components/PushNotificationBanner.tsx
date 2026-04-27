import { useState } from 'react';
import { Bell, Share, X } from 'lucide-react';
import { PushStatus } from '../hooks/usePushNotifications';

export default function PushNotificationBanner({
  status,
  onSubscribe,
}: {
  status: PushStatus;
  onSubscribe: () => Promise<boolean>;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);

  if (dismissed || (status !== 'pending' && status !== 'ios-pwa-required')) return null;

  async function handleClick() {
    setLoading(true);
    await onSubscribe();
    setLoading(false);
  }

  if (status === 'ios-pwa-required') {
    return (
      <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 shadow-lg sm:left-auto sm:right-4 sm:translate-x-0">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100">
            <Share className="h-4 w-4 text-blue-700" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-blue-900">Ative notificacoes no iPhone</p>
            <p className="mt-0.5 text-xs text-blue-700 leading-relaxed">
              No Safari, toque em <span className="font-bold">Compartilhar</span> (
              <span className="font-mono">⬆</span>) e depois em{' '}
              <span className="font-bold">"Adicionar a Tela de Inicio"</span>. Abra o app instalado
              e ative as notificacoes de la.
            </p>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="shrink-0 rounded-lg p-1 text-blue-600 hover:bg-blue-100"
            aria-label="Dispensar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-lg sm:left-auto sm:right-4 sm:translate-x-0">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
          <Bell className="h-4 w-4 text-amber-700" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-amber-900">Ativar notificacoes</p>
          <p className="mt-0.5 text-xs text-amber-700 leading-relaxed">
            Receba alertas de reservas, chamados e tarefas direto no seu dispositivo.
          </p>
          <button
            onClick={handleClick}
            disabled={loading}
            className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-amber-700 px-3 py-1.5 text-xs font-black text-white disabled:opacity-60"
          >
            <Bell className="h-3 w-3" />
            {loading ? 'Ativando...' : 'Ativar agora'}
          </button>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded-lg p-1 text-amber-600 hover:bg-amber-100"
          aria-label="Dispensar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
