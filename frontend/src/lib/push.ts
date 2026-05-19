import { apiRequest } from './api';

export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  try {
    return await withTimeout(navigator.serviceWorker.ready, 6000, 'serviceWorker.ready');
  } catch {
    return null;
  }
}

export async function ensurePushSubscription(
  { promptIfNeeded = true }: { promptIfNeeded?: boolean } = {},
): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }
  let permission = Notification.permission;
  if (permission === 'default') {
    if (!promptIfNeeded) return false;
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') return false;

  const reg = await getRegistration();
  if (!reg) return false;

  const { publicKey } = await apiRequest<{ publicKey: string }>('/api/push/vapid-public-key', { auth: false });
  if (!publicKey) return false;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await withTimeout(
        reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        }),
        8000,
        'pushManager.subscribe',
      );
    } catch {
      return false;
    }
  }

  const raw = sub.toJSON();
  await apiRequest('/api/push/subscribe', {
    method: 'POST',
    body: {
      endpoint: raw.endpoint,
      keys: raw.keys,
    },
  });

  return true;
}
