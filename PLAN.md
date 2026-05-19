# Fake Kebab Signal (FKS) — Architecture & Implementation Plan

## 1. Goals & Constraints

- **What it is**: A PWA that lets a small group of friends ("Fake Kebab") send a *Bat-Signal*-style push notification for a specific video game. Subscribers get a big push notification; they accept or reject; the triggerer sees a live count of acceptances.
- **Reach**: Must work on iOS, Android, and desktop browsers.
- **Friction**: As low as possible — no passwords, no email, no OAuth. Just a username and (optionally) a group code.
- **Hosting**: Single small VPS, SSH access, deployed via `docker compose`. Only the web app port is exposed. PostgreSQL stays internal. HTTPS via Let's Encrypt, automated.
- **Updates**: One-command (or git-hook-driven) re-deploy.

## 2. Platform & Push-Notification Reality Check

This drives the whole design — get it wrong and iOS users have no notifications.

- **Android Chrome / Firefox / Edge**: Web Push works in a normal browser tab. No install required, but installing the PWA still gives a better notification UX (lock-screen, no browser branding).
- **iOS Safari (16.4+)**: Web Push works **only when the site is installed as a PWA** (Add to Home Screen). The browser will not even *show* the permission prompt in a regular tab. Permission must be requested from a user gesture inside the installed PWA.
- **Desktop (Chrome/Edge/Firefox/Safari)**: Web Push works fine, though less important for this use case.

**Consequence**: The "install the PWA using a specific button" step is non-negotiable for iOS. We will:
- Detect platform (`navigator.userAgent` + `display-mode: standalone` check).
- On Android, use the `beforeinstallprompt` event to drive an install button.
- On iOS, show an instruction sheet ("tap Share → Add to Home Screen") since there is no install API.
- On desktop Chromium, use `beforeinstallprompt` too.

## 3. Tech Stack

### Frontend
- **React + Vite** — the most popular fast SPA toolchain; massive ecosystem.
- **`vite-plugin-pwa`** (Workbox under the hood) — de facto standard for PWA in Vite projects. Handles the manifest, service worker, precaching, and update flow.
- **Tailwind CSS + shadcn/ui** — pragmatic styling + accessible component primitives (Radix). Lets us focus on flows, not buttons.
- **TanStack Query** — server state, retries, cache, optimistic updates. Removes a huge class of boilerplate.
- **React Router** — routing (tiny app, no need for TanStack Router).
- **Service Worker** (separate file, registered by vite-plugin-pwa) — handles `push` events and `notificationclick` events (Accept / Reject action buttons).

### Backend
- **NestJS (Node + TypeScript)** — most "batteries-included" Node framework: DI, validation (`class-validator`), config, modular structure. Best ratio of "code we don't have to write" for a small but real app.
- **Prisma ORM** — best-in-class TS ORM, generates migrations, type-safe queries. Pairs perfectly with NestJS.
- **`web-push` (npm)** — the canonical library for VAPID + Web Push. Used by everyone.
- **Server-Sent Events (SSE)** — simpler than WebSocket and perfect for the one-way live count: the triggerer subscribes to `/signals/:id/stream`, backend pushes updates as acceptances roll in. NestJS supports SSE natively via `@Sse`.

### Database
- **PostgreSQL 16** — the user's preference and the right call. Migrations via Prisma. Only reachable on the internal Docker network.

### Reverse Proxy / TLS
- **Caddy 2** — single binary, **automatic Let's Encrypt issuance and renewal out of the box**. The simplest possible auto-HTTPS story; just point the `Caddyfile` at the domain. Also serves the built static SPA and reverse-proxies `/api/*` and `/sse/*` to the backend. Replaces nginx + certbot.

### Auth
- **Passwordless, username-only**. On signup we mint a long-lived **device token** (random 32-byte string, stored server-side, returned once) and the frontend stores it in `localStorage`. Every request sends `Authorization: Bearer <token>`. Re-entering a username on a new device creates a new device record bound to the same user *if the username + group already exists* (we'll handle this with a "claim username" gesture that just rebinds the device).
- This is the right level of security for a friends-only app: no PII, no money, just kebab.

## 4. Architecture Overview

```
                  ┌──────────────────────────────────────┐
   Browser PWA ──▶│  Caddy 2 (host:443) — TLS auto       │
   (iOS/Android   │                                       │
    /desktop)     │  / and /assets → static SPA build     │
                  │  /api/*           → reverse-proxy     │──▶ NestJS backend (internal :3000)
                  │  /sse/*           → reverse-proxy     │           │
                  └──────────────────────────────────────┘           │
                                                                     ▼
                                                             PostgreSQL (internal :5432)
                                                                     │
   Web Push      ◀── web-push (VAPID) ── NestJS ──────────────────────┘
   service
   (FCM/APNs/Mozilla)
```

All container-to-container traffic stays on the Docker network `fks_internal`. Only Caddy publishes ports (`80`, `443`). Postgres is never published.

## 5. Data Model (Prisma schema, abbreviated)

```prisma
model User {
  id           String   @id @default(cuid())
  username     String   // unique within a group, not globally
  createdAt    DateTime @default(now())
  memberships  GroupMember[]
  devices      Device[]
  subscriptions GameSubscription[]
}

model Device {
  id              String   @id @default(cuid())
  userId          String
  authToken       String   @unique           // the bearer token
  pushEndpoint    String?                    // from PushSubscription.endpoint
  pushP256dh      String?                    // PushSubscription.keys.p256dh
  pushAuth        String?                    // PushSubscription.keys.auth
  userAgent       String?
  lastSeenAt      DateTime @default(now())
  user            User     @relation(fields: [userId], references: [id])
}

model Group {
  id        String   @id @default(cuid())
  code      String   @unique                 // 5 chars [A-Z0-9], excluding I/O/0/1
  name      String
  createdAt DateTime @default(now())
  members   GroupMember[]
  games     Game[]
}

model GroupMember {
  userId   String
  groupId  String
  joinedAt DateTime @default(now())
  user     User  @relation(fields: [userId], references: [id])
  group    Group @relation(fields: [groupId], references: [id])
  @@id([userId, groupId])
  @@unique([groupId, /* username via raw check */])  // username unique per group, enforced in service
}

model Game {
  id        String   @id @default(cuid())
  groupId   String
  name      String
  imageUrl  String?
  createdAt DateTime @default(now())
  group     Group    @relation(fields: [groupId], references: [id])
  subscriptions GameSubscription[]
  signals   Signal[]
}

model GameSubscription {
  userId String
  gameId String
  @@id([userId, gameId])
}

model Signal {
  id             String   @id @default(cuid())
  gameId         String
  triggeredById  String
  triggeredAt    DateTime @default(now())
  responses      SignalResponse[]
}

model SignalResponse {
  signalId    String
  userId      String
  response    String     // "accept" | "reject"
  respondedAt DateTime @default(now())
  @@id([signalId, userId])
}
```

**Group code generation**: 5 chars from `A-Z` + `2-9` (no `I/O/0/1` to avoid confusion). Retry on collision.

## 6. API Surface (REST + SSE)

All `/api/*`, JSON, bearer auth except where noted.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/users` | none | Create user (no group). Body: `{ username }`. Returns `{ user, authToken }` |
| POST | `/api/users/join` | none | Create user + join group. Body: `{ username, groupCode }`. Returns `{ user, group, authToken }` |
| POST | `/api/users/me/login-by-username` | none | Re-bind device to existing username (flow 3 "just enter your username"). Body: `{ username, groupCode? }`. Returns `{ user, authToken }` |
| POST | `/api/groups` | yes | Create group. Body: `{ name }`. Returns `{ group }` (joins creator). |
| POST | `/api/groups/join` | yes | Join existing group by code. Body: `{ code }`. |
| GET | `/api/groups/me` | yes | Current group + members + games. |
| POST | `/api/games` | yes | Create game. Body: `{ name, imageUrl? }`. |
| PATCH | `/api/games/:id` | yes | Edit. |
| DELETE | `/api/games/:id` | yes | Delete. |
| POST | `/api/games/:id/subscribe` | yes | Subscribe me. |
| DELETE | `/api/games/:id/subscribe` | yes | Unsubscribe me. |
| POST | `/api/push/subscribe` | yes | Save `PushSubscription` to current device. |
| GET | `/api/push/vapid-public-key` | none | Returns the VAPID public key for the SW. |
| POST | `/api/signals` | yes | Trigger. Body: `{ gameId }`. Fan-out push to subscribers (excluding self). Returns `{ signalId }`. |
| POST | `/api/signals/:id/respond` | yes | Body: `{ response: "accept" \| "reject" }`. |
| GET | `/sse/signals/:id` | yes (via token query for SSE) | Live stream of `{ acceptedCount }` updates. |

## 7. User Flows → Implementation Notes

### Flow 1 — New user, no group
1. Open URL → SPA serves landing page with **"Install Fake Kebab Signal"** button (CTA). On iOS, show "Add to Home Screen" instructions.
2. After install, opened from home-screen icon (`display-mode: standalone`). Onboarding screen asks for **username** → `POST /api/users` → token stored.
3. Prompt for notification permission (must be from a user gesture; show a "Turn on notifications" button) → register service worker → `pushManager.subscribe({ applicationServerKey: vapidPublicKey })` → `POST /api/push/subscribe`.
4. Next screen: "Create a group" → `POST /api/groups` → display 5-char code prominently with a copy button.
5. Inside group: games list (empty) + "Add game" button → CRUD.

### Flow 2 — New user, has group code
- Same as Flow 1 but onboarding asks for **username + group code** in one screen → `POST /api/users/join`.

### Flow 3 — Trigger the signal
1. Open the PWA. If token exists, go straight to the game grid.
2. If no token (cleared storage, new device): single field "Enter your username". Backend looks up the user *in their group context* — if found, mint a new device token. If not, error → fall back to flow 1.
3. Game grid → tap a game → **confirmation modal** ("Send the kebab signal for *Counter-Strike*?").
4. Confirm → `POST /api/signals` → SPA navigates to a **signal-sent screen** with an animation (Lottie or CSS) and a live count.
5. The signal-sent screen opens an SSE connection to `/sse/signals/:id`. Count starts at 1 (the triggerer counts as auto-accept) and ticks up as responses arrive.

### Flow 4 — Receive & respond
1. Backend fans out via `web-push` to every subscriber's `pushEndpoint`, payload:
   ```json
   { "signalId": "...", "gameName": "Counter-Strike", "image": "...", "currentAccepted": 1 }
   ```
2. Service worker `push` handler calls `self.registration.showNotification(...)` with:
   - Large title: `"🥙 Kebab signal: Counter-Strike"`
   - Body: `"1 person is in. Are you?"`
   - `image: imageUrl` (the big game image on Android lock screen)
   - `actions: [{ action: "accept", title: "I'm in" }, { action: "reject", title: "Not now" }]`
   - `data: { signalId }`
3. User taps an action → service worker `notificationclick` handler → `fetch('/api/signals/:id/respond', { method: 'POST', body: { response } })`. Token comes from IndexedDB (we mirror the auth token there so the SW can read it).
4. Backend records the response, then **broadcasts a fresh `currentAccepted` value via SSE to the triggerer** *and* via another web-push to all subscribers if we want the "X is in" updates (optional, can spam; start without).

### Update of the accepted count in real time (triggerer side)
- SSE channel is the simplest stable option. NestJS `@Sse` returns an Observable; we maintain an in-memory `Subject` per active `signalId`, push new counts when responses arrive. On reconnect, the client refetches the count via REST.

## 8. PWA / Service Worker Details

- **Manifest** (`manifest.webmanifest`):
  - `name: "Fake Kebab Signal"`
  - `short_name: "FKS"`
  - `display: "standalone"`
  - `theme_color`, `background_color`
  - icons at 192, 512 (maskable + any)
- **Service worker** generated by `vite-plugin-pwa` with `strategies: 'injectManifest'` so we can add custom `push` and `notificationclick` handlers.
- **Update flow**: vite-plugin-pwa's `autoUpdate` mode + a small "New version available — reload" toast.

## 9. Docker Compose Topology

```
services:
  caddy:
    image: caddy:2
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
      - ./frontend/dist:/srv/fks:ro
    networks: [fks_internal]

  api:
    build: ./backend
    environment:
      DATABASE_URL: postgres://fks:${POSTGRES_PASSWORD}@db:5432/fks
      VAPID_PUBLIC_KEY: ${VAPID_PUBLIC_KEY}
      VAPID_PRIVATE_KEY: ${VAPID_PRIVATE_KEY}
      VAPID_SUBJECT: mailto:${ADMIN_EMAIL}
    depends_on: [db]
    networks: [fks_internal]
    # NOTE: no `ports:` block — internal only

  db:
    image: postgres:16
    environment:
      POSTGRES_USER: fks
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: fks
    volumes:
      - db_data:/var/lib/postgresql/data
    networks: [fks_internal]
    # NOTE: no `ports:` block — internal only

volumes:
  db_data:
  caddy_data:
  caddy_config:

networks:
  fks_internal:
```

**Caddyfile**:

```
fks.example.com {
    encode zstd gzip
    root * /srv/fks
    handle /api/* {
        reverse_proxy api:3000
    }
    handle /sse/* {
        reverse_proxy api:3000 {
            flush_interval -1
        }
    }
    handle {
        try_files {path} /index.html
        file_server
    }
}
```

`flush_interval -1` is critical for SSE (no buffering).

**Why this is safe by default**: only Caddy publishes ports. The DB and API are only reachable on the internal Docker network. Even if someone scans the VPS, ports 80/443 are the only attack surface.

## 10. Deployment & Updates

### Initial deploy (on VPS, SSH)

```bash
git clone <repo> /opt/fks
cd /opt/fks
cp .env.example .env             # fill in POSTGRES_PASSWORD, VAPID_*, ADMIN_EMAIL
docker compose build
docker compose up -d
docker compose exec api npx prisma migrate deploy
```

VAPID keys generated once with `npx web-push generate-vapid-keys`.

### Update flow — option A: a single `deploy.sh` (recommended, simplest)

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /opt/fks
git fetch --all
git reset --hard origin/main
docker compose build
docker compose up -d
docker compose exec -T api npx prisma migrate deploy
docker image prune -f
```

Run it manually after `ssh vps`, or set up a small **GitHub Actions workflow** that SSHes in and runs the script on push to `main` (using a deploy key). Keeps the secret on the VPS, not in CI.

### Update flow — option B: a git post-receive hook on a bare repo on the VPS

If you prefer no GitHub Actions: push to a bare repo on the VPS (`git push vps main`), a `post-receive` hook checks out into `/opt/fks` and runs the same script. Fewer moving parts; uglier git remotes.

**Recommendation: Option A with manual SSH for now, add GitHub Actions later if the cadence justifies it.**

### Backups
- Nightly cron on the VPS: `docker compose exec -T db pg_dump -U fks fks | gzip > /backups/fks-$(date +%F).sql.gz`. Keep 7 days.

## 11. Project Layout

```
kebab-signal/
├── docker-compose.yml
├── Caddyfile
├── .env.example
├── deploy.sh
├── README.md
├── frontend/
│   ├── package.json
│   ├── vite.config.ts          # vite-plugin-pwa config
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/                # TanStack Query hooks, fetch wrapper w/ bearer
│   │   ├── pages/
│   │   │   ├── Install.tsx
│   │   │   ├── Onboarding.tsx
│   │   │   ├── Group.tsx
│   │   │   ├── Games.tsx
│   │   │   ├── Trigger.tsx     # confirm + live count
│   │   ├── components/
│   │   ├── lib/
│   │   │   ├── pwa.ts          # install prompt logic
│   │   │   ├── push.ts         # subscribe to push, sync to backend
│   │   │   └── auth.ts         # token storage (localStorage + IndexedDB mirror)
│   │   └── sw.ts               # custom service worker (push, notificationclick)
└── backend/
    ├── package.json
    ├── prisma/
    │   ├── schema.prisma
    │   └── migrations/
    ├── src/
    │   ├── main.ts
    │   ├── app.module.ts
    │   ├── auth/               # bearer guard, device-token logic
    │   ├── users/
    │   ├── groups/
    │   ├── games/
    │   ├── push/               # web-push wrapper, VAPID
    │   ├── signals/            # POST trigger, POST respond, SSE stream
    │   └── common/
    └── Dockerfile
```

## 12. Risks & Open Decisions

- **iOS notification image size**: Apple is finicky about images in notifications; we should keep them small (~300KB) and pre-resize on the server.
- **Token in service worker**: needs to live in IndexedDB (SW can't read localStorage). Small mirror function on app init.
- **Notification action support**: iOS Safari does **not** support notification action buttons. On iOS the user will tap the notification and land in the PWA on a "Respond to signal" screen that lets them accept/reject. Detect platform server-side or just always include the in-app fallback screen.
- **Username collisions across groups**: enforce uniqueness per group, not global.
- **Rate limiting**: trivial in-memory limit on `POST /api/signals` (e.g., 1 per game per 60 s per user) to prevent kebab-signal spam.
- **Domain**: needs DNS A record on the VPS public IP. Caddy needs port 80 open for the ACME HTTP-01 challenge.

## 13. Step-by-Step Build Order

1. **Scaffolding**: `frontend/` (Vite + React + TS + Tailwind + shadcn) and `backend/` (Nest + Prisma) skeletons. Compose file with the three services. Caddy serves a placeholder. Verify HTTPS works against a real domain.
2. **DB & auth**: Prisma schema + initial migration. Bearer-token guard. `POST /api/users`, `POST /api/users/join`, `POST /api/users/me/login-by-username`. Username-per-group uniqueness check.
3. **Groups & games**: CRUD endpoints + screens. Group code generator.
4. **PWA shell**: manifest, icons, install button, iOS instructions sheet. Verify "Add to Home Screen" works on a real iPhone.
5. **Push subscription**: VAPID generation, `/api/push/vapid-public-key`, `/api/push/subscribe`. Service worker with `push` handler that just shows a static test notification. Verify on Android + installed-iOS.
6. **Signals & fan-out**: `POST /api/signals`, `web-push` fan-out, `notificationclick` handler in SW, `POST /api/signals/:id/respond`. In-app fallback respond screen for iOS.
7. **Live count (SSE)**: backend Subject per signalId, SSE controller, frontend EventSource on the "signal sent" screen. Animation (Lottie or CSS pulse).
8. **Polish**: error toasts, offline shell, update toast for new SW versions, image upload (or just URL) for games, basic rate limiting.
9. **Deployment hardening**: `deploy.sh`, nightly `pg_dump` cron, log rotation. Optional GH Actions SSH deploy.
10. **Friend-test**: ship it to two real devices (one iPhone, one Android), iterate on the UX cliffs that always show up in PWA-install land.
