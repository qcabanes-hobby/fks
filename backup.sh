#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
mkdir -p "$BACKUP_DIR"

cd "$(dirname "$0")"

STAMP=$(date +%F-%H%M%S)
docker compose exec -T db pg_dump -U fks fks | gzip > "$BACKUP_DIR/fks-$STAMP.sql.gz"

# Keep last 7 days of backups
find "$BACKUP_DIR" -name "fks-*.sql.gz" -mtime +7 -delete

echo "✓ Backup written to $BACKUP_DIR/fks-$STAMP.sql.gz"
