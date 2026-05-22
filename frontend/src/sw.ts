/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { get as idbGet } from 'idb-keyval';
import { setPendingSignalIntent } from './lib/notification-intent';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

const AUTH_TOKEN_KEY = 'fks.authToken';

precacheAndRoute(self.__WB_MANIFEST || []);

// Don't skipWaiting unconditionally — the page shows a "App updated, reload"
// toast (App.tsx) which depends on the new SW sitting in the waiting state.
// The toast's Reload button calls updateServiceWorker(true) → posts
// SKIP_WAITING → the message listener below activates the new SW.
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

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

interface PushSubscriptionChangeEventLike extends ExtendableEvent {
  oldSubscription?: PushSubscription | null;
  newSubscription?: PushSubscription | null;
}

self.addEventListener('pushsubscriptionchange', (event: Event) => {
  const evt = event as PushSubscriptionChangeEventLike;
  evt.waitUntil(
    (async () => {
      const token = await idbGet<string>(AUTH_TOKEN_KEY).catch(() => null);
      if (!token) return;
      let sub = evt.newSubscription ?? null;
      if (!sub) {
        const keyRes = await fetch('/api/push/vapid-public-key').catch(() => null);
        if (!keyRes || !keyRes.ok) return;
        const { publicKey } = (await keyRes.json().catch(() => ({}))) as { publicKey?: string };
        if (!publicKey) return;
        try {
          sub = await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
          });
        } catch {
          return;
        }
      }
      const raw = sub.toJSON();
      if (!raw.endpoint || !raw.keys) return;
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ endpoint: raw.endpoint, keys: raw.keys }),
      }).catch(() => undefined);
    })(),
  );
});

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
  // Fall back to the notification tag (also the signalId) when `data` is
  // unavailable — some browsers drop the data blob across SW restarts.
  // The tag may carry a ":crew" suffix for the crew-assembled variant.
  const tag = event.notification.tag || '';
  const signalId = data.signalId || tag.split(':')[0] || undefined;
  event.notification.close();
  if (!signalId) return;

  if (event.action === 'accept' || event.action === 'reject') {
    event.waitUntil(respondInBackground(signalId, event.action));
    return;
  }

  event.waitUntil(
    (async () => {
      // Persist the intent regardless of how the browser handles openWindow.
      // Some browsers (notably Chrome Android PWAs) launch at start_url
      // instead of the URL passed to openWindow when the app is cold-booted
      // from a notification. App boot consumes this and navigates to the
      // respond page even if the URL was dropped.
      await setPendingSignalIntent(signalId);

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
