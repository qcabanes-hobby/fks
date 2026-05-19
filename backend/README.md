# FKS Backend

NestJS + Prisma + PostgreSQL backend for the Fake Kebab Signal PWA.

## Local development

```bash
npm install
# put DATABASE_URL and VAPID_* in a .env file
npm run prisma:migrate:dev
npm run start:dev
```

The API listens on `http://localhost:3000` with the `/api` prefix
(e.g. `GET http://localhost:3000/api/push/vapid-public-key`). SSE is served
unprefixed at `GET http://localhost:3000/sse/signals/:id?token=<authToken>`.

## VAPID keys

Generate once and keep them in the environment:

```bash
npx web-push generate-vapid-keys
```

## Required environment variables

| Var | Notes |
|---|---|
| `DATABASE_URL` | Postgres connection string, e.g. `postgres://fks:pw@db:5432/fks`. |
| `VAPID_PUBLIC_KEY` | Public key from `web-push generate-vapid-keys`. |
| `VAPID_PRIVATE_KEY` | Private key. Keep secret. |
| `VAPID_SUBJECT` | `mailto:` URL used in VAPID claims, e.g. `mailto:admin@example.com`. |
| `NODE_ENV` | `production` in prod (disables CORS for the dev origin). |
| `PORT` | Defaults to `3000`. |

## Production migrations

The container does **not** run migrations on boot. Apply them once after
`docker compose up -d`:

```bash
docker compose exec api npx prisma migrate deploy
```
