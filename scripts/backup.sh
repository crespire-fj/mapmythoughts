#!/bin/sh
# Takes an on-demand backup now. Usage: ./scripts/backup.sh
set -eu
cd "$(dirname "$0")/.."
# Same settings as docker-compose.yml (see .env.example).
if [ -f .env ]; then set -a; . ./.env; set +a; fi
DIR="${MMT_BACKUP_DIR:-$HOME/MapMyThoughts-backups}"
mkdir -p "$DIR"
file="$DIR/mapmythoughts-$(date -u +%Y%m%d-%H%M%SZ).sql.gz"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' | gzip > "$file.tmp"
mv "$file.tmp" "$file"
echo "Backup written to $file"
