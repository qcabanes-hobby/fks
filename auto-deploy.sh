#!/usr/bin/env bash
# Auto-redeploy when origin/main moves. Designed for hourly cron.
# Exits 0 if nothing to do. Logs everything with timestamps to stdout.
set -euo pipefail

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

cd "$(dirname "$0")"

LOCK="/tmp/fks-auto-deploy.lock"
exec 9>"$LOCK"
if ! flock -n 9; then
  echo "$(date -Iseconds) another auto-deploy is in flight, skipping"
  exit 0
fi

git fetch --quiet origin main

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "$(date -Iseconds) up to date at ${LOCAL:0:7}, nothing to do"
  exit 0
fi

echo "$(date -Iseconds) update detected: ${LOCAL:0:7} → ${REMOTE:0:7}"

echo "$(date -Iseconds) → docker compose down"
docker compose down

echo "$(date -Iseconds) → ./deploy.sh"
./deploy.sh

echo "$(date -Iseconds) deploy complete, now at $(git rev-parse --short HEAD)"
