#!/bin/sh
# Restores a backup over the current database. Usage: ./scripts/restore.sh <file.sql.gz>
# The sync server is stopped during the restore so it cannot write older in-memory maps back.
set -eu
cd "$(dirname "$0")/.."
file="${1:?Usage: ./scripts/restore.sh <backup.sql.gz>}"
[ -f "$file" ] || { echo "No such file: $file" >&2; exit 1; }
if [ "${MMT_RESTORE_YES:-}" != "1" ]; then
  printf 'This replaces every map with the contents of %s. Continue? [y/N] ' "$file"
  read -r answer
  [ "$answer" = "y" ] || [ "$answer" = "Y" ] || { echo "Cancelled."; exit 1; }
fi
docker compose stop sync
gunzip -c "$file" | docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
docker compose start sync
echo "Restored $file"
