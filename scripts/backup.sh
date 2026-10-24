#!/bin/sh
# Takes an on-demand backup now. Usage: ./scripts/backup.sh
set -eu
cd "$(dirname "$0")/.."
DIR="${EQAPMAP_BACKUP_DIR:-$HOME/EqapMap-backups}"
mkdir -p "$DIR"
file="$DIR/eqapmap-$(date -u +%Y%m%d-%H%M%SZ).sql.gz"
docker compose exec -T db pg_dump -U eqapmap -d eqapmap --clean --if-exists | gzip > "$file.tmp"
mv "$file.tmp" "$file"
echo "Backup written to $file"
