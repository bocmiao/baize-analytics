#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/ops-preflight.sh
baize_ops_preflight backup
umask 077
backup_dir="${1:-backups/$(date -u +%Y%m%dT%H%M%SZ)}"
[ ! -e "$backup_dir" ] || { echo 'Backup destination must be new.' >&2; exit 1; }
mkdir -p "$backup_dir"
canonical_stage=""; canonical_pid=""; canonical_container=""
backup_exit(){ status=$?; if [ "$status" -ne 0 ] && [ -n "$canonical_stage" ]; then
  docker exec "$canonical_container" node -e 'try{const p=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).pid;if(Number.isInteger(p)&&p>1)process.kill(p,"SIGTERM")}catch{}' "$canonical_stage/runtime.json" >/dev/null 2>&1 || true
  docker rm -f "$canonical_container" >/dev/null 2>&1 || true
  printf 'Canonical backup failed; partial package retained for diagnosis and no completed manifest accepted.\n' >&2
fi; }
trap backup_exit EXIT
canonical_count=0
if [ "$(docker compose exec -T postgres psql -U baize -d baize -Atc "SELECT to_regclass('canonical_event_authority') IS NOT NULL")" = t ]; then
  canonical_count="$(docker compose exec -T postgres psql -U baize -d baize -Atc "SELECT count(*) FROM canonical_event_authority WHERE authority='clickhouse'")"
fi
history_count=0
if [ "$(docker compose exec -T postgres psql -U baize -d baize -Atc "SELECT to_regclass('history_manifests') IS NOT NULL")" = t ]; then
  history_count="$(docker compose exec -T postgres psql -U baize -d baize -Atc "SELECT count(*) FROM history_manifests WHERE status='published'")"
fi
header_count=0
if [ "$(docker compose exec -T postgres psql -U baize -d baize -Atc "SELECT to_regclass('analytics_header_runs') IS NOT NULL")" = t ]; then header_count="$(docker compose exec -T postgres psql -U baize -d baize -Atc "SELECT count(*) FROM analytics_header_runs")"; fi
fact_count=0
if [ "$(docker compose exec -T postgres psql -U baize -d baize -Atc "SELECT to_regclass('analytics_fact_store_runs') IS NOT NULL")" = t ]; then fact_count="$(docker compose exec -T postgres psql -U baize -d baize -Atc "SELECT count(*) FROM analytics_fact_store_runs")"; fi
remaining_count=0
cache_count=0
for sidecar_table in analytics_remaining_fact_runs analytics_cache_owners analytics_cache_unavailable; do
  if [ "$(docker compose exec -T postgres psql -U baize -d baize -Atc "SELECT to_regclass('$sidecar_table') IS NOT NULL")" = t ]; then
    sidecar_count="$(docker compose exec -T postgres psql -U baize -d baize -Atc "SELECT count(*) FROM $sidecar_table")"
    if [ "$sidecar_table" = analytics_remaining_fact_runs ]; then remaining_count="$sidecar_count"; elif [ "$sidecar_count" != 0 ]; then cache_count="$sidecar_count"; fi
  fi
done
if [ "$canonical_count" != 0 ] || [ "$history_count" != 0 ] || [ "$header_count" != 0 ] || [ "$fact_count" != 0 ] || [ "$remaining_count" != 0 ] || [ "$cache_count" != 0 ]; then
  canonical_stage="/tmp/baize-canonical-backup-${RANDOM}-${RANDOM}"
  canonical_container="baize_backup_${RANDOM}_${RANDOM}"
  docker compose run --rm --no-deps --name "$canonical_container" --entrypoint node --env CANONICAL_PACKAGE_ACK=1 app --import tsx scripts/canonical-ops-runtime.ts backup "$canonical_stage" > "$backup_dir/canonical-runtime.log" 2>&1 & canonical_pid=$!
  snapshot=""
  for attempt in $(seq 1 120); do
    snapshot="$(docker exec "$canonical_container" node -e 'try{console.log(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).snapshot)}catch{}' "$canonical_stage/snapshot.json" 2>/dev/null || true)"
    [ -n "$snapshot" ] && break
    kill -0 "$canonical_pid" 2>/dev/null || { wait "$canonical_pid"; echo 'Canonical snapshot runtime stopped' >&2; exit 1; }
    sleep 0.5
  done
  [[ "$snapshot" =~ ^[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+$ ]] || { echo 'Canonical snapshot not ready' >&2; exit 1; }
  docker compose exec -T postgres pg_dump -U baize -d baize -Fc --snapshot "$snapshot" > "$backup_dir/database.dump"
  docker exec "$canonical_container" node -e 'require("node:fs").writeFileSync(process.argv[1],"done",{mode:0o600})' "$canonical_stage/pg-dump.complete"
  copied=0
  for attempt in $(seq 1 1200); do
    if docker exec "$canonical_container" node -e 'process.exit(require("node:fs").existsSync(process.argv[1])?0:1)' "$canonical_stage/completed.json" >/dev/null 2>&1; then copied=1; break; fi
    kill -0 "$canonical_pid" 2>/dev/null || { wait "$canonical_pid"; echo 'Canonical package runtime failed' >&2; exit 1; }
    sleep 0.5
  done
  [ "$copied" = 1 ] || { echo 'Canonical package incomplete' >&2; exit 1; }
  docker cp "$canonical_container:$canonical_stage" "$backup_dir/canonical"
  docker exec "$canonical_container" node -e 'require("node:fs").writeFileSync(process.argv[1],"done",{mode:0o600})' "$canonical_stage/package.copied"
  wait "$canonical_pid"
else
  docker compose exec -T postgres pg_dump -U baize -d baize -Fc > "$backup_dir/database.dump"
fi
# Deletion journal is independent of the database snapshot, copied again at restore.
docker compose cp app:/app/data/tombstones.watermark.json "$backup_dir/tombstones.watermark.json"
docker compose cp app:/app/data/tombstones.jsonl "$backup_dir/tombstones.jsonl" || { rm -rf "$backup_dir"; echo 'Deletion journal unavailable; backup failed closed.' >&2; exit 1; }
node scripts/ops-validate-journal.mjs "$backup_dir/tombstones.jsonl" "$backup_dir/tombstones.watermark.json" >&2
mkdir -p "$backup_dir/app-data"
# Never read an installer nonce into even the temporary data staging tree.
docker compose run --rm --no-deps -T --entrypoint tar app -C /app/data --exclude=./install-nonce.json --exclude='*/install-nonce.json' -cf - . | tar -C "$backup_dir/app-data" -xf -
tar -C "$backup_dir" --exclude=app-data/master.key --exclude='app-data/keyring*' --exclude=app-data/keys --exclude='*.key' -czf "$backup_dir/app-data.tar.gz" app-data
rm -rf "$backup_dir/app-data"
key_dir="${BAIZE_KEY_BACKUP_DIR:-$PWD/.baize/key-backups}/$(basename "$backup_dir")"
[ ! -e "$key_dir" ] || { echo "Key backup destination already exists." >&2; exit 1; }
mkdir -p "$key_dir"
chmod 700 "$key_dir"
cp .baize/master.key "$key_dir/master.key"
mkdir -p "$key_dir/keyring"
# Exclude before archive reading; installer nonce is not a recovery key.
docker compose run --rm --no-deps -T --entrypoint tar app -C /app/keys --exclude=./install-nonce.json --exclude='*/install-nonce.json' -cf - . | tar -C "$key_dir/keyring" -xf -
chmod -R go-rwx "$key_dir"
(cd "$key_dir" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS)
sha256sum .baize/master.key | cut -d' ' -f1 > "$backup_dir/master-key.sha256"
printf '%s\n' "$key_dir" > "$backup_dir/key-package.ref"
docker compose images -q app > "$backup_dir/app-image.id"
(cd "$backup_dir" && sha256sum database.dump tombstones.jsonl tombstones.watermark.json master-key.sha256 app-data.tar.gz > SHA256SUMS)
if [ -d "$backup_dir/canonical" ]; then (cd "$backup_dir" && find canonical -type f -print0 | sort -z | xargs -0 sha256sum >> SHA256SUMS); fi
printf '%s\n' "$backup_dir"
