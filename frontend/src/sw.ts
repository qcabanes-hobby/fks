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

// Explicit no-op fetch handler so install-criteria audits that look for
// a fetch listener (older Chromium forks, some Lighthouse checks) pass
// even though Workbox's precacheAndRoute already registers one.
self.addEventListener('fetch', () => {});

interface PushPayload {
  signalId: string;
  type?: 'signal' | 'cancel' | 'crew-assembled';
  gameName?: string;
  gameImageUrl?: string | null;
  triggeredBy?: string;
  currentAccepted?: number;
  acceptedCount?: number;
}

self.addEventListener('push', (event: PushEvent) => {
  let payload: PushPayload | null = null;
  try {
    payload = event.data ? (event.data.json() as PushPayload) : null;
  } catch {
    payload = null;
  }
  if (!payload || !payload.signalId) return;

  if (payload.type === 'cancel') {
    event.waitUntil(
      (async () => {
        const notes = await self.registration.getNotifications({ tag: payload!.signalId });
        for (const n of notes) n.close();
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const c of clients) {
          c.postMessage({ type: 'signal-cancel', signalId: payload!.signalId });
        }
      })(),
    );
    return;
  }

  if (payload.type === 'crew-assembled') {
    const gameName = payload.gameName || 'your game';
    const accepted = payload.acceptedCount ?? 0;
    const crewTitle = `🥙 Crew assembled: ${gameName}`;
    const crewBody = `${accepted} are in. It's on!`;
    event.waitUntil(
      (async () => {
        const notes = await self.registration.getNotifications({ tag: payload!.signalId });
        for (const n of notes) n.close();
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const c of clients) {
          c.postMessage({ type: 'signal-crew', signalId: payload!.signalId, gameName, acceptedCount: accepted });
        }
        const crewOptions: NotificationOptions & { renotify?: boolean } = {
          body: crewBody,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          tag: `${payload!.signalId}:crew`,
          renotify: true,
          data: { signalId: payload!.signalId },
        };
        await self.registration.showNotification(crewTitle, crewOptions);
      })(),
    );
    return;
  }

  const title = `🥙 Kebab signal: ${payload.gameName}`;
  const triggeredBy = payload.triggeredBy || 'Someone';
  const count = payload.currentAccepted ?? 1;
  const body = `${triggeredBy} wants to play. ${count} in so far. Are you?`;

  const options: NotificationOptions & {
    actions?: Array<{ action: string; title: string }>;
    image?: string;
    renotify?: boolean;
  } = {
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

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const visible = clients.find((c) => (c as WindowClient).visibilityState === 'visible');
      if (visible) {
        visible.postMessage({
          type: 'signal-incoming',
          signalId: payload!.signalId,
          gameName: payload!.gameName,
        });
      }
      await reportDelivered(payload!.signalId);
    })(),
  );
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

async function reportDelivered(signalId: string): Promise<void> {
  const token = await idbGet<string>(AUTH_TOKEN_KEY).catch(() => null);
  if (!token) return;
  try {
    await fetch(`/api/signals/${signalId}/delivered`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
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
        try {
          if ('focus' in client) {
            await (client as WindowClient).focus();
          }
          client.postMessage({ type: 'signal-open', signalId });
          return;
        } catch {}
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
