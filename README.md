# Fake Kebab Signal (FKS)

## What is FKS?

Fake Kebab Signal is a tiny PWA that lets a small group of friends fire a
Bat-Signal-style push notification for a specific video game. One person taps
a game tile, every subscriber gets a big push notification with **I'm in** /
**Not now** actions, and the triggerer sees a live count of acceptances roll
in. Works on iOS (16.4+, installed as PWA), Android, and desktop.

## Stack overview

See [PLAN.md](./PLAN.md) for the full design rationale. In short:

- **Frontend**: React + Vite + `vite-plugin-pwa`, Tailwind CSS, TanStack Query.
- **Backend**: NestJS + Prisma + `web-push`, Server-Sent Events for the live count.
- **Database**: PostgreSQL 16 (internal to the Docker network).
- **Reverse proxy / TLS**: Caddy 2 with automatic Let's Encrypt.
- **Deployment**: `docker compose` on a single small VPS.

Only Caddy publishes ports (80 / 443). The API and Postgres are reachable only
on the internal Docker network `fks_internal`.

## First-time deploy on a fresh VPS

1. **Install Docker + the Docker Compose plugin** on the VPS. On Debian/Ubuntu:
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
2. **DNS + firewall**. Point an `A` record for your domain at the VPS public
   IP. Open inbound TCP **80** and **443**. Port 80 must stay open — Caddy
   uses it for the ACME HTTP-01 challenge to issue and renew the TLS cert.
3. **Clone the repo**:
   ```bash
   git clone <repo-url> /opt/fks
   cd /opt/fks
   ```
4. **Fill in `.env`**:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set `FKS_DOMAIN`, `ADMIN_EMAIL`, and a strong
   `POSTGRES_PASSWORD`. Generate the VAPID keypair once with either:
   ```bash
   docker run --rm node:20-alpine npx -y web-push generate-vapid-keys
   # or, if you have node locally:
   npx web-push generate-vapid-keys
   ```
   Paste the public and private keys into `VAPID_PUBLIC_KEY` and
   `VAPID_PRIVATE_KEY`.
5. **Build the frontend** (Caddy serves the built SPA out of `frontend/dist`
   via a read-only bind mount):
   ```bash
   cd frontend && npm ci && npm run build && cd ..
   ```
6. **Build the images**:
   ```bash
   docker compose build
   ```
7. **Start the stack**:
   ```bash
   docker compose up -d
   ```
8. **Apply database migrations**:
   ```bash
   docker compose exec api npx prisma migrate deploy
   ```
9. **Visit** `https://<your-domain>`. Caddy will obtain the Let's Encrypt cert
   on first request — the very first load can take a few seconds while ACME
   completes.

## Updating

After pushing new commits to `main`, SSH into the VPS and run:

```bash
cd /opt/fks
./deploy.sh
```

`deploy.sh` does `git fetch && git reset --hard origin/main`, rebuilds images,
re-applies migrations, and prunes dangling images.

Alternatively, configure the GitHub Actions workflow at
[`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) to SSH into
the VPS on every push to `main`. See the comment at the top of that file for
the secrets you need to add.

## Backups

A `backup.sh` helper is included. It runs `pg_dump` inside the `db` container,
gzips the result, writes it under `$BACKUP_DIR` (defaults to `/backups`), and
deletes dumps older than 7 days.

Run it manually:

```bash
sudo BACKUP_DIR=/backups /opt/fks/backup.sh
```

Schedule it nightly with `crontab -e`:

```
15 3 * * * BACKUP_DIR=/backups /opt/fks/backup.sh >> /var/log/fks-backup.log 2>&1
```

## Local development

There are two ways to run FKS locally. Pick the one that suits your machine.

### Option A — Docker dev stack (recommended, zero local installs)

Runs Postgres, the NestJS API in `start:dev` watch mode, and the Vite dev
server with HMR — all in containers, all hot-reloading. The only thing you
need installed locally is Docker.

```bash
# 1. (One time) Generate VAPID keys and put them in .env.
cp .env.example .env
docker run --rm node:20-alpine npx -y web-push generate-vapid-keys
# Paste the two values into VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in .env.
# POSTGRES_PASSWORD falls back to "fksdev" in dev if you leave it blank.

# 2. Start the stack.
docker compose -f docker-compose.dev.yml up
```

URLs once it's up:

- **http://localhost:5173** — Vite dev server (the app you actually use)
- **http://localhost:3000** — NestJS API (Vite proxies `/api` and `/sse` here)
- **localhost:5432** — Postgres (connect with TablePlus / `psql` / etc.)

First start takes 1–3 min (`npm install` + Prisma generate inside both
containers). Subsequent starts are fast — `node_modules` lives in named
volumes (`api_node_modules`, `web_node_modules`), not the bind mount.

Useful commands:

```bash
# Tail logs of one service
docker compose -f docker-compose.dev.yml logs -f api

# Shell into a container
docker compose -f docker-compose.dev.yml exec api sh

# Author a new migration after editing backend/prisma/schema.prisma
docker compose -f docker-compose.dev.yml exec api npx prisma migrate dev --name your_change

# Wipe everything (including the dev DB!) and start fresh
docker compose -f docker-compose.dev.yml down -v
```

Notes:

- The dev stack does NOT run Caddy or terminate TLS — it's plain HTTP on
  `localhost`. The PWA's service worker will still register because browsers
  treat `localhost` as a secure context. Push notifications work end-to-end
  locally too, *but* iOS requires the installed-PWA gate, so iOS-specific
  testing has to happen on a phone hitting the deployed HTTPS site.
- File watching uses polling (`CHOKIDAR_USEPOLLING=true`) because bind-mount
  inotify is unreliable on macOS and Windows. Slightly higher CPU; reliable.
- The dev DB volume is `db_data_dev` (separate from the prod `db_data`), so
  you can't accidentally wipe a prod-like dataset by toying with dev.

### Option B — Host-native (everything runs on your machine)

Faster file watching, slightly more setup. Requires Node 20 and a running
Postgres.

```bash
# Postgres only, in Docker — easiest:
docker compose -f docker-compose.dev.yml up db

# In one terminal:
cd backend
npm install
npx prisma migrate deploy
npm run start:dev

# In another terminal:
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. Vite's proxy sends `/api` and `/sse` to
`http://localhost:3000` by default (override with `API_PROXY_TARGET` if you
run the API elsewhere).

### Production-build vs dev-server

In production the built SPA at `frontend/dist` is bind-mounted into Caddy
read-only. Locally you do **not** need to rebuild the frontend to iterate —
just use `npm run dev` (or the dev stack above). You only rebuild when
deploying.

## Security

- The only ports published to the public internet are **80** and **443**, both
  on the `caddy` container.
- The API container exposes port 3000 inside the Docker network only; the
  Postgres container exposes 5432 inside the Docker network only. Neither is
  reachable from outside the VPS.
- Auth is passwordless: each device holds a 32-byte bearer token. Tokens are
  device-scoped — losing a token leaks one device, not an account.
- Caddy sets `Strict-Transport-Security`, `X-Content-Type-Options`, and
  `Referrer-Policy` on every response.

## Troubleshooting

- **Caddy can't get a cert** (logs show ACME errors): verify `FKS_DOMAIN`
  resolves to the VPS public IP (`dig +short $FKS_DOMAIN`) and that port 80 is
  reachable from the outside (`curl -I http://$FKS_DOMAIN`). Cloud-provider
  firewalls and `ufw` are the usual culprits.
- **Push notifications never arrive on iOS**: confirm the user is on iOS
  16.4 or later AND installed the PWA via Safari → Share → **Add to Home
  Screen**. iOS Safari refuses to even *show* the permission prompt in a
  regular browser tab; the install step is non-negotiable.
- **`docker compose exec api npx prisma migrate deploy` fails with "cannot
  reach database"**: the `db` container hasn't passed its healthcheck yet.
  Wait 10 s and retry, or check `docker compose logs db`.
- **SSE connections close after ~60 s**: confirm you're not running another
  proxy in front of Caddy that buffers responses. The `flush_interval -1` in
  the Caddyfile only handles Caddy itself.
