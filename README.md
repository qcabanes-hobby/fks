# Fake Kebab Signal (FKS)

## What is FKS?

Fake Kebab Signal is a tiny PWA that lets a small group of friends fire a
Bat-Signal-style push notification for a specific video game. One person taps
a game tile, every subscriber gets a big push notification with **I'm in** /
**Not now** actions, and the triggerer sees a live count of acceptances roll
in. Works on iOS (16.4+, installed as PWA), Android, and desktop.

## Stack overview

See [PLAN.md](./PLAN.md) for the full design rationale. In short:

- **Frontend**: React + Vite + `vite-plugin-pwa`, Tailwind + shadcn/ui, TanStack Query.
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

See each subproject's README for the dev loop:

- `frontend/` — `npm run dev` runs Vite on `localhost:5173`.
- `backend/` — `npm run start:dev` runs Nest in watch mode.

In production the built SPA at `frontend/dist` is bind-mounted into Caddy
read-only. Locally you do **not** need to rebuild the frontend to iterate —
just use `npm run dev`. You only rebuild when deploying.

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
