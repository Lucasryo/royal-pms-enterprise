import { supabase } from '../supabase';

const DEVICE_SESSION_KEY = 'royal_pms_device_session_token';
const REMEMBERED_DEVICE_KEY = 'royal_pms_remembered_device_token';

export async function startEmailCodeLogin(email: string, password: string) {
  const { data, error } = await supabase.functions.invoke('auth-email-code-start', {
    body: { email, password },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as { ok: boolean; sent: boolean; expires_in_seconds: number };
}

export async function verifyEmailCodeLogin(email: string, code: string, rememberDevice: boolean, deviceLabel?: string) {
  const { data, error } = await supabase.functions.invoke('auth-email-code-verify', {
    body: {
      email,
      code,
      remember_device: rememberDevice,
      device_label: deviceLabel || browserDeviceLabel(),
    },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  if (!data?.session?.access_token || !data?.session?.refresh_token) {
    throw new Error('Sessao nao retornada apos validacao do codigo.');
  }

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  if (sessionError) throw sessionError;

  const scaffold = data.auth_session_scaffold || {};
  if (scaffold.device_session_token) {
    localStorage.setItem(DEVICE_SESSION_KEY, scaffold.device_session_token);
  }
  if (scaffold.remembered_device_token) {
    localStorage.setItem(REMEMBERED_DEVICE_KEY, scaffold.remembered_device_token);
  }

  return data;
}

export function currentDeviceSessionToken() {
  return localStorage.getItem(DEVICE_SESSION_KEY);
}

export function clearEmailCodeDeviceTokens() {
  localStorage.removeItem(DEVICE_SESSION_KEY);
  localStorage.removeItem(REMEMBERED_DEVICE_KEY);
}

function browserDeviceLabel() {
  const platform = navigator.platform || 'Web';
  const width = window.innerWidth;
  return `${platform} ${width}px`;
}
