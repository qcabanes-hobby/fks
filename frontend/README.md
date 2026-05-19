# Fake Kebab Signal — Frontend

React + Vite + TypeScript PWA. The service worker handles Web Push for the
Bat-Signal-style notifications.

## Develop

```bash
npm install
npm run dev
```

Vite serves on `:5173` and proxies `/api/*` and `/sse/*` to the backend at
`http://localhost:3000`.

## Build

```bash
npm run build
```

Produces `dist/`, which Caddy serves at the site root in production
(`/srv/fks` per the repo's `docker-compose.yml`).

## Push notifications

- **Android / desktop Chromium**: works in a browser tab, but installing
  the PWA gives a better lock-screen UX. The "Install" button uses
  `beforeinstallprompt`.
- **iOS Safari (16.4+)**: Web Push only works when the app is **installed
  as a PWA** via Safari's Share → "Add to Home Screen". The browser will
  not even show the permission prompt in a regular tab. The Install page
  walks users through the steps.

The service worker (`src/sw.ts`) is compiled by `vite-plugin-pwa` in
`injectManifest` mode so we own the `push` and `notificationclick`
handlers. The auth bearer token is mirrored into IndexedDB
(`fks.authToken`) so the SW can POST `/api/signals/:id/respond` from the
notification action buttons.

## Icons

The manifest references `/icons/icon-192.png` and `/icons/icon-512.png`.
Drop real icons into `public/icons/` (see `public/icons/README.md`).
