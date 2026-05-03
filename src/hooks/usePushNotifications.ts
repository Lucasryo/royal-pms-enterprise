import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';

const VAPID_PUBLIC_KEY = 'BBVJfVq0vMwz1FRdqYYHV2a6vZ0mZAI5PuLn0LLWMxt32T2cYFSr95trL7xftZpmR1K6ArP64lBfdUJe1_q00LQ';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// iOS Safari only supports push when installed as PWA (Add to Home Screen)
function isIOS(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function isStandalone(): boolean {
  return (
    (navigator as unknown as { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    // Use the ready registration (active SW) for pushManager — critical on Android
    return await navigator.serviceWorker.ready;
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

export type PushStatus = 'idle' | 'unsupported' | 'ios-pwa-required' | 'denied' | 'subscribed' | 'pending';

export function usePushNotifications(userId: string | undefined) {
  const [status, setStatus] = useState<PushStatus>('idle');
  const subscribed = useRef(false);

  useEffect(() => {
    if (!userId) return;

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      // iOS in browser tab (not PWA) falls here — pushManager is undefined
      if (isIOS() && !isStandalone()) {
        setStatus('ios-pwa-required');
      } else {
        setStatus('unsupported');
      }
      return;
    }

    if (!('Notification' in window)) {
      setStatus('unsupported');
      return;
    }

    if (Notification.permission === 'denied') {
      setStatus('denied');
      return;
    }

    if (Notification.permission === 'granted') {
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

    setStatus('pending');
  }, [userId]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!userId) return false;
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return false;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setStatus('denied');
      return false;
    }

    const reg = await registerServiceWorker();
    if (!reg) return false;

    try {
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
        });
      }
      await saveSubscription(userId, sub);
      subscribed.current = true;
      setStatus('subscribed');
      return true;
    } catch (err) {
      console.error('[Push] subscription failed:', err);
      setStatus('pending');
      return false;
    }
  }, [userId]);

  return { status, subscribe };
}
