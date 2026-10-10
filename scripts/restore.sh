#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
backup_dir="${1:?Usage: scripts/restore.sh BACKUP_DIR NEW_DATABASE}"
new_db="${2:?A new database name is mandatory; existing databases are never replaced.}"
[[ "$new_db" =~ ^baize_restore_[a-zA-Z0-9_]+$ ]] || { echo 'Use a baize_restore_ prefixed database name.' >&2; exit 1; }
(cd "$backup_dir" && sha256sum -c SHA256SUMS)
cmp -s "$backup_dir/master.key" .baize/master.key || { echo "Backup uses another master key; restore into an isolated stack with the backup key." >&2; exit 1; }
# Read-only presence check, followed by CREATE DATABASE (also refuses any race).
exists="$(docker compose exec -T postgres psql -U baize -d postgres -Atc "SELECT count(*) FROM pg_database WHERE datname='$new_db'")"
[ "$exists" = 0 ] || { echo 'Target already exists; refusing overwrite.' >&2; exit 1; }
docker compose exec -T postgres createdb -U baize "$new_db"
docker compose exec -T postgres pg_restore -U baize -d "$new_db" --exit-on-error --no-owner < "$backup_dir/database.dump"
# Current independent journal must remain present, including deletions AFTER backup.
# Runtime merges backup and current journals and rebuilds before queries can open.
docker compose cp "$backup_dir/tombstones.jsonl" app:/app/data/restore-backup-tombstones.jsonl
docker compose exec -T -e "RESTORE_DATABASE=$new_db" app node --import tsx scripts/restore-runtime.ts
printf 'Restored and reconciled %s. No production traffic was switched.\n' "$new_db"
