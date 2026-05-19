/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { get as idbGet } from 'idb-keyval';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

const AUTH_TOKEN_KEY = 'fks.authToken';

precacheAndRoute(self.__WB_MANIFEST || []);

self.skipWaiting();
clientsClaim();

interface PushPayload {
  signalId: string;
  gameName: string;
  gameImageUrl?: string | null;
  triggeredBy?: string;
  currentAccepted?: number;
}

self.addEventListener('push', (event: PushEvent) => {
  let payload: PushPayload | null = null;
  try {
    payload = event.data ? (event.data.json() as PushPayload) : null;
  } catch {
    payload = null;
  }
  if (!payload || !payload.signalId) return;

  const title = `🥙 Kebab signal: ${payload.gameName}`;
  const triggeredBy = payload.triggeredBy || 'Someone';
  const count = payload.currentAccepted ?? 1;
  const body = `${triggeredBy} wants to play. ${count} in so far. Are you?`;

  const options: NotificationOptions & { actions?: Array<{ action: string; title: string }>; image?: string } = {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.signalId,
    renotify: true,
    data: { signalId: payload.signalId },
    actions: [
      { action: 'accept', title: "I'm in" },
      { action: 'reject', title: 'Not now' },
    ],
  };
  if (payload.gameImageUrl) options.image = payload.gameImageUrl;

  event.waitUntil(self.registration.showNotification(title, options));
});

async function respondInBackground(signalId: string, response: 'accept' | 'reject'): Promise<void> {
  const token = await idbGet<string>(AUTH_TOKEN_KEY).catch(() => null);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    await fetch(`/api/signals/${signalId}/respond`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ response }),
    });
  } catch {}
}

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  const data = (event.notification.data || {}) as { signalId?: string };
  const signalId = data.signalId;
  event.notification.close();
  if (!signalId) return;

  if (event.action === 'accept' || event.action === 'reject') {
    event.waitUntil(respondInBackground(signalId, event.action));
    return;
  }

  event.waitUntil(
    (async () => {
      const url = `/signal/${signalId}/respond`;
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if ('focus' in client) {
          try {
            await (client as WindowClient).focus();
            if ('navigate' in client) {
              try {
                await (client as WindowClient).navigate(url);
              } catch {}
            }
            return;
          } catch {}
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(url);
      }
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
