#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "→ Pulling latest main"
git fetch --all
git reset --hard origin/main

echo "→ Building images (api + web-build, serial to keep memory low)"
docker compose build api
docker compose build web-build

echo "→ Bringing up stack (web-build publishes frontend, then caddy starts)"
docker compose up -d

echo "→ Applying database migrations"
docker compose exec -T api npx prisma migrate deploy

echo "→ Pruning old images"
docker image prune -f

echo "✓ Deploy complete"
