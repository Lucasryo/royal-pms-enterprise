import { useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { clearEmailCodeDeviceTokens, currentDeviceSessionToken } from '../lib/emailCodeAuth';

const HEARTBEAT_MIN_INTERVAL_MS = 60_000;

export function useEmailCodeSessionHeartbeat(active: boolean) {
  const lastHeartbeatAt = useRef(0);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;

    const heartbeat = async (force = false) => {
      const token = currentDeviceSessionToken();
      if (!token) {
        await supabase.auth.signOut();
        return;
      }
      const now = Date.now();
      if (!force && now - lastHeartbeatAt.current < HEARTBEAT_MIN_INTERVAL_MS) return;
      lastHeartbeatAt.current = now;

      const { data, error } = await supabase.functions.invoke('auth-device-heartbeat', {
        body: { device_session_token: token },
      });
      if (cancelled) return;
      if (error || data?.active === false) {
        clearEmailCodeDeviceTokens();
        await supabase.auth.signOut();
      }
    };

    const onActivity = () => {
      void heartbeat(false);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void heartbeat(true);
    };

    void heartbeat(true);
    window.addEventListener('click', onActivity, { passive: true });
    window.addEventListener('keydown', onActivity);
    window.addEventListener('touchstart', onActivity, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      window.removeEventListener('click', onActivity);
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('touchstart', onActivity);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [active]);
}
