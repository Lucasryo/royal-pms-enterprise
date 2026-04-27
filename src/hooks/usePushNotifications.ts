import { useEffect, useRef } from 'react';
import { supabase } from '../supabase';

// Chave publica VAPID gerada via `npx web-push generate-vapid-keys`
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

async function subscribeToPush(reg: ServiceWorkerRegistration): Promise<PushSubscription | null> {
  try {
    const existing = await reg.pushManager.getSubscription();
    if (existing) return existing;
    return await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  } catch {
    return null;
  }
}

async function saveSubscription(userId: string, subscription: PushSubscription): Promise<void> {
  const subJson = subscription.toJSON();
  const endpoint = subscription.endpoint;
  // Upsert por (user_id, endpoint) — evita duplicatas do mesmo dispositivo
  await supabase
    .from('push_subscriptions')
    .upsert(
      { user_id: userId, endpoint, subscription: subJson, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,endpoint' }
    );
}

export function usePushNotifications(userId: string | undefined) {
  const done = useRef(false);

  useEffect(() => {
    if (!userId || done.current) return;
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

    // Nao pede permissao de novo se ja foi negada
    if (Notification.permission === 'denied') return;

    done.current = true;

    (async () => {
      // Se ainda nao tem permissao, pede ao usuario
      let permission = Notification.permission;
      if (permission === 'default') {
        permission = await Notification.requestPermission();
      }
      if (permission !== 'granted') return;

      const reg = await registerServiceWorker();
      if (!reg) return;

      // Aguarda o service worker estar ativo
      await navigator.serviceWorker.ready;

      const sub = await subscribeToPush(reg);
      if (!sub) return;

      await saveSubscription(userId, sub);
    })();
  }, [userId]);
}
