#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
backup_dir="${1:-backups/$(date -u +%Y%m%dT%H%M%SZ)}"
[ ! -e "$backup_dir" ] || { echo 'Backup destination must be new.' >&2; exit 1; }
mkdir -p "$backup_dir"
docker compose exec -T postgres pg_dump -U baize -d baize -Fc > "$backup_dir/database.dump"
# Deletion journal is independent of the database snapshot, copied again at restore.
docker compose cp app:/app/data/tombstones.jsonl "$backup_dir/tombstones.jsonl" || { rm -rf "$backup_dir"; echo 'Deletion journal unavailable; backup failed closed.' >&2; exit 1; }
docker compose cp app:/app/data "$backup_dir/app-data"
tar -C "$backup_dir" -czf "$backup_dir/app-data.tar.gz" app-data
rm -rf "$backup_dir/app-data"
cp .baize/master.key "$backup_dir/master.key"
docker compose images -q app > "$backup_dir/app-image.id"
(cd "$backup_dir" && sha256sum database.dump tombstones.jsonl master.key app-data.tar.gz > SHA256SUMS)
printf '%s\n' "$backup_dir"
