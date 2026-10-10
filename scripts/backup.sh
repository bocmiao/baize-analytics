#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
backup_dir="${1:-backups/$(date -u +%Y%m%dT%H%M%SZ)}"
[ ! -e "$backup_dir" ] || { echo 'Backup destination must be new.' >&2; exit 1; }
mkdir -p "$backup_dir"
docker compose exec -T postgres pg_dump -U baize -d baize -Fc > "$backup_dir/database.dump"
# Deletion journal is independent of the database snapshot, copied again at restore.
docker compose cp app:/app/data/tombstones.watermark.json "$backup_dir/tombstones.watermark.json"
docker compose cp app:/app/data/tombstones.jsonl "$backup_dir/tombstones.jsonl" || { rm -rf "$backup_dir"; echo 'Deletion journal unavailable; backup failed closed.' >&2; exit 1; }
node scripts/ops-validate-journal.mjs "$backup_dir/tombstones.jsonl" "$backup_dir/tombstones.watermark.json" >&2
docker compose cp app:/app/data "$backup_dir/app-data"
tar -C "$backup_dir" --exclude=app-data/master.key --exclude='app-data/keyring*' --exclude=app-data/keys --exclude='*.key' -czf "$backup_dir/app-data.tar.gz" app-data
rm -rf "$backup_dir/app-data"
key_dir="${BAIZE_KEY_BACKUP_DIR:-$PWD/.baize/key-backups}/$(basename "$backup_dir")"
[ ! -e "$key_dir" ] || { echo "Key backup destination already exists." >&2; exit 1; }
mkdir -p "$key_dir"
chmod 700 "$key_dir"
cp .baize/master.key "$key_dir/master.key"
docker compose cp app:/app/keys "$key_dir/keyring"
chmod -R go-rwx "$key_dir"
(cd "$key_dir" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS)
sha256sum .baize/master.key | cut -d' ' -f1 > "$backup_dir/master-key.sha256"
printf '%s\n' "$key_dir" > "$backup_dir/key-package.ref"
docker compose images -q app > "$backup_dir/app-image.id"
(cd "$backup_dir" && sha256sum database.dump tombstones.jsonl tombstones.watermark.json master-key.sha256 app-data.tar.gz > SHA256SUMS)
printf '%s\n' "$backup_dir"
