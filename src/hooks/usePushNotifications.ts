import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';

const VAPID_PUBLIC_KEY = 'BBVJfVq0vMwz1FRdqYYHV2a6vZ0mZAI5PuLn0LLWMxt32T2cYFSr95trL7xftZpmR1K6ArP64lBfdUJe1_q00LQ';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    return null;
  }
}

async function saveSubscription(userId: string, subscription: PushSubscription): Promise<void> {
  const subJson = subscription.toJSON();
  const endpoint = subscription.endpoint;
  await supabase
    .from('push_subscriptions')
    .upsert(
      { user_id: userId, endpoint, subscription: subJson, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,endpoint' }
    );
}

export type PushStatus = 'idle' | 'unsupported' | 'denied' | 'subscribed' | 'pending';

export function usePushNotifications(userId: string | undefined) {
  const [status, setStatus] = useState<PushStatus>('idle');
  const subscribed = useRef(false);

  // Verifica estado atual ao carregar o usuario
  useEffect(() => {
    if (!userId) return;
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setStatus('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setStatus('denied');
      return;
    }
    if (Notification.permission === 'granted') {
      // Ja tem permissao — garante que a subscription esta salva
      if (!subscribed.current) {
        subscribed.current = true;
        navigator.serviceWorker.ready.then(async (reg) => {
          const existing = await reg.pushManager.getSubscription();
          if (existing) await saveSubscription(userId, existing);
        });
      }
      setStatus('subscribed');
      return;
    }
    // permission === 'default' — aguarda o usuario clicar em "Ativar"
    setStatus('pending');
  }, [userId]);

  // Chamado quando o usuario clica em "Ativar notificacoes"
  // DEVE ser chamado dentro de um handler de evento (click) para o browser aceitar
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!userId) return false;
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return false;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setStatus('denied');
      return false;
    }

    const reg = await registerServiceWorker();
    if (!reg) return false;

    await navigator.serviceWorker.ready;

    try {
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }
      await saveSubscription(userId, sub);
      subscribed.current = true;
      setStatus('subscribed');
      return true;
    } catch {
      setStatus('pending');
      return false;
    }
  }, [userId]);

  return { status, subscribe };
}
