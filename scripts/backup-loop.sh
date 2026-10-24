#!/bin/sh
# Runs inside the backup container. Dumps the database when the newest dump is >23.5 hours old.
set -eu
DIR=/backups
KEEP_DAYS=${KEEP_DAYS:-14}
MAX_AGE=$((23 * 3600 + 1800))

while true; do
  # Dumps made before the rename are called eqapmap-*; they count too, and expire the same way.
  latest=$(ls -1t "$DIR"/mapmythoughts-*.sql.gz "$DIR"/eqapmap-*.sql.gz 2>/dev/null | head -n 1 || true)
  age=$MAX_AGE
  if [ -n "$latest" ]; then
    age=$(( $(date +%s) - $(stat -c %Y "$latest") ))
  fi
  if [ "$age" -ge "$MAX_AGE" ]; then
    file="$DIR/mapmythoughts-$(date -u +%Y%m%d-%H%M%SZ).sql.gz"
    if pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists | gzip > "$file.tmp"; then
      mv "$file.tmp" "$file"
      echo "backup: wrote $file"
    else
      rm -f "$file.tmp"
      echo "backup: pg_dump failed" >&2
    fi
    find "$DIR" \( -name 'mapmythoughts-*.sql.gz' -o -name 'eqapmap-*.sql.gz' \) -mtime +"$KEEP_DAYS" -delete
  fi
  sleep 3600
done
