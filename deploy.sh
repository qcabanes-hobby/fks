#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "→ Pulling latest main"
git fetch --all
git reset --hard origin/main

echo "→ Building images"
docker compose build

echo "→ Bringing up stack"
docker compose up -d

echo "→ Applying database migrations"
docker compose exec -T api npx prisma migrate deploy

echo "→ Pruning old images"
docker image prune -f

echo "✓ Deploy complete"
