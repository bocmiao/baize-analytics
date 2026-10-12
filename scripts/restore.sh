#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
backup_dir="${1:?Usage: scripts/restore.sh BACKUP_DIR NEW_DATABASE}"
new_db="${2:?A new database name is mandatory; existing databases are never replaced.}"
[[ "$new_db" =~ ^baize_restore_[a-zA-Z0-9_]+$ ]] || { echo 'Use a baize_restore_ prefixed database name.' >&2; exit 1; }
(cd "$backup_dir" && sha256sum -c SHA256SUMS)
[ "$(sha256sum .baize/master.key | cut -d' ' -f1)" = "$(cat "$backup_dir/master-key.sha256")" ] || { echo 'Backup uses another master key; restore into an isolated stack with the backup key.' >&2; exit 1; }
key_package="${BAIZE_KEY_RESTORE_DIR:-$(cat "$backup_dir/key-package.ref")}"
(cd "$key_package" && sha256sum -c SHA256SUMS)
restore_dir="$(mktemp -d "$PWD/.baize/restore-check.XXXXXX")"
target_created=0
proof_stage=""
restore_exit(){ status=$?; if [ -n "$proof_stage" ]; then docker compose exec -T app node -e 'require("node:fs").rmSync(process.argv[1],{recursive:true,force:true})' "$proof_stage" >/dev/null 2>&1 || true; fi; rm -rf "$restore_dir"; if [ "$status" -ne 0 ] && [ "$target_created" = 1 ]; then printf 'Restore failed; target database %s and isolated volumes retained for diagnosis. No traffic switched; no success marker written.\n' "$new_db" >&2; fi; }
trap restore_exit EXIT
# Fail before creating ANY target if independent latest deletion state is absent,
# truncated, reset, corrupted, or older than the database snapshot journal.
docker compose cp app:/app/data/tombstones.jsonl "$restore_dir/tombstones.jsonl"
docker compose cp app:/app/data/tombstones.watermark.json "$restore_dir/tombstones.watermark.json"
node scripts/ops-validate-journal.mjs "$restore_dir/tombstones.jsonl" "$restore_dir/tombstones.watermark.json" "$backup_dir/tombstones.jsonl"
source_replica="$(docker compose exec -T app printenv CLICKHOUSE_URL)"
canonical_restore=0
if [ -f "$backup_dir/canonical/index.json" ]; then canonical_restore=1; fi
target_replica="${BAIZE_RESTORE_CLICKHOUSE_URL:-}"
SOURCE_REPLICA="$source_replica" TARGET_REPLICA="$target_replica" CANONICAL_RESTORE="$canonical_restore" node --input-type=module -e '
if(process.env.CANONICAL_RESTORE==="1"&&!process.env.TARGET_REPLICA)throw Error("Canonical restore requires explicit independent target CH database");
if(process.env.TARGET_REPLICA){const t=new URL(process.env.TARGET_REPLICA),s=process.env.SOURCE_REPLICA?new URL(process.env.SOURCE_REPLICA):null;if(process.env.CANONICAL_RESTORE!=="1"&&s&&t.origin===s.origin&&t.pathname.replace(/\/+$/,"")===s.pathname.replace(/\/+$/,""))throw Error("Restore target cannot share source ClickHouse endpoint");}'
if [ "$canonical_restore" = 1 ]; then
  proof_stage="/tmp/baize-retention-check-${RANDOM}-${RANDOM}"
  docker compose exec -T app node -e 'require("node:fs").mkdirSync(process.argv[1]+"/history",{recursive:true,mode:0o700})' "$proof_stage"
  docker compose exec -T app node --import tsx scripts/replay-retention-proof-runtime.ts capture > "$restore_dir/replay-retention-proof.json"
  node -e 'const fs=require("node:fs"),f=fs.openSync(process.argv[1],"r");try{fs.fsyncSync(f)}finally{fs.closeSync(f)}' "$restore_dir/replay-retention-proof.json"
  docker compose cp "$backup_dir/canonical/index.json" "app:$proof_stage/index.json"
  docker compose cp "$backup_dir/canonical/history/manifest.json" "app:$proof_stage/history/manifest.json"
  docker compose cp "$restore_dir/replay-retention-proof.json" "app:$proof_stage/replay-retention-proof.json"
  # docker compose cp preserves host ownership. Use the running app identity,
  # and descriptor-bound regular files rather than following copied symlinks.
  proof_identity="$(docker compose exec -T app node -e 'console.log(process.getuid()+":"+process.getgid())')"
  [[ "$proof_identity" =~ ^[0-9]+:[0-9]+$ ]] || { echo 'Invalid proof application identity' >&2; exit 1; }
  docker compose exec -T --user 0 app node scripts/ops-restore-proof-files.mjs "$proof_stage" "${proof_identity%:*}" "${proof_identity#*:}"
  docker compose exec -T app node --import tsx scripts/replay-retention-proof-runtime.ts validate "$proof_stage"
fi
exists="$(docker compose exec -T postgres psql -U baize -d postgres -Atc "SELECT count(*) FROM pg_database WHERE datname='$new_db'")"
[ "$exists" = 0 ] || { echo 'Target already exists; refusing overwrite.' >&2; exit 1; }
project="${COMPOSE_PROJECT_NAME:-baize-analytics}"
[[ "$project" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo 'Unsafe project name' >&2; exit 1; }
volume="${project}_${new_db}_app_data"
keys_volume="${project}_${new_db}_app_keys"
for target in "$volume" "$keys_volume"; do
  if docker volume inspect "$target" >/dev/null 2>&1; then echo 'Target volume already exists; refusing overwrite.' >&2; exit 1; fi
done
tar -xzf "$backup_dir/app-data.tar.gz" -C "$restore_dir"
if [ "$canonical_restore" = 1 ]; then cp -a "$backup_dir/canonical" "$restore_dir/app-data/restore-canonical"; fi
cp "$backup_dir/tombstones.jsonl" "$restore_dir/restore-backup-tombstones.jsonl"
docker volume create --label "baize.restore.database=$new_db" "$volume" >/dev/null
docker volume create --label "baize.restore.database=$new_db" "$keys_volume" >/dev/null
image="$(docker compose images -q app)"
app_uid_gid="$(docker inspect "$(docker compose ps --all -q app)" --format '{{.Config.User}}')"
[[ "$app_uid_gid" =~ ^[0-9]+:[0-9]+$ ]] || { echo "Cannot determine application volume ownership" >&2; exit 1; }
docker run --rm --user 0 --entrypoint node \
  --mount "type=volume,src=$volume,dst=/target" \
  --mount "type=volume,src=$keys_volume,dst=/target-keys" \
  --mount "type=bind,src=$restore_dir,dst=/snapshot,readonly" \
  --mount "type=bind,src=$(realpath "$key_package")/keyring,dst=/snapshot-keys,readonly" \
  --env "RESTORE_UID=${app_uid_gid%:*}" --env "RESTORE_GID=${app_uid_gid#*:}" "$image" -e '
const fs=require("node:fs"),path=require("node:path");
for(const name of fs.readdirSync("/snapshot/app-data"))fs.cpSync(path.join("/snapshot/app-data",name),path.join("/target",name),{recursive:true});
for(const name of ["tombstones.jsonl","tombstones.watermark.json","restore-backup-tombstones.jsonl"])fs.copyFileSync(path.join("/snapshot",name),path.join("/target",name));
if(fs.existsSync("/snapshot/replay-retention-proof.json"))fs.copyFileSync("/snapshot/replay-retention-proof.json","/target/replay-retention-proof.json");
for(const name of fs.readdirSync("/snapshot-keys"))fs.cpSync(path.join("/snapshot-keys",name),path.join("/target-keys",name),{recursive:true});
function own(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())own(file);fs.chownSync(file,+process.env.RESTORE_UID,+process.env.RESTORE_GID);}fs.chownSync(dir,+process.env.RESTORE_UID,+process.env.RESTORE_GID);}
own("/target");own("/target-keys");fs.chmodSync("/target",0o700);fs.chmodSync("/target-keys",0o700);
'
docker compose exec -T postgres createdb -U baize "$new_db"
target_created=1
docker compose exec -T postgres pg_restore -U baize -d "$new_db" --exit-on-error --no-owner < "$backup_dir/database.dump"
if [ "$canonical_restore" = 1 ]; then
  docker compose run --rm --no-deps --entrypoint node \
    --env "RESTORE_DATABASE=$new_db" --env DATA_DIR=/restore-data --env KEYS_DIR=/restore-keys \
    --env "CLICKHOUSE_URL=$target_replica" --env "CLICKHOUSE_USER=${BAIZE_RESTORE_CLICKHOUSE_USER:-default}" \
    --env "CLICKHOUSE_PASSWORD=${BAIZE_RESTORE_CLICKHOUSE_PASSWORD:-}" \
    --volume "$volume:/restore-data" --volume "$keys_volume:/restore-keys" app --import tsx scripts/canonical-ops-runtime.ts restore /restore-data/restore-canonical
fi
docker compose run --rm --no-deps --entrypoint node \
  --env "RESTORE_DATABASE=$new_db" --env DATA_DIR=/restore-data --env KEYS_DIR=/restore-keys \
  --env REQUIRE_DELETION_JOURNAL=1 --env "CANONICAL_RESTORE_VERIFIED=$canonical_restore" \
  --env "CLICKHOUSE_URL=$target_replica" --env "CLICKHOUSE_USER=${BAIZE_RESTORE_CLICKHOUSE_USER:-default}" \
  --env "CLICKHOUSE_PASSWORD=${BAIZE_RESTORE_CLICKHOUSE_PASSWORD:-}" --env RESTORE_CLICKHOUSE_EXPLICIT=1 \
  --env "RESTORE_SOURCE_CLICKHOUSE_URL=$source_replica" \
  --volume "$volume:/restore-data" --volume "$keys_volume:/restore-keys" app --import tsx scripts/restore-runtime.ts
# A concurrent source deletion after the copied journal invalidates this attempt.
# Preserve the isolated target for diagnosis; retry from a fresh verified journal.
mkdir "$restore_dir/latest-journal"
docker compose cp app:/app/data/tombstones.jsonl "$restore_dir/latest-journal/tombstones.jsonl"
docker compose cp app:/app/data/tombstones.watermark.json "$restore_dir/latest-journal/tombstones.watermark.json"
node scripts/ops-validate-journal.mjs "$restore_dir/latest-journal/tombstones.jsonl" "$restore_dir/latest-journal/tombstones.watermark.json" "$restore_dir/tombstones.jsonl"
cmp -s "$restore_dir/latest-journal/tombstones.jsonl" "$restore_dir/tombstones.jsonl" || { echo 'Source deletion journal changed during restore; target retained, no success marker.' >&2; exit 1; }
if [ "$canonical_restore" = 1 ]; then docker compose exec -T app node --import tsx scripts/replay-retention-proof-runtime.ts still-current "$proof_stage"; fi
mkdir -p .baize/restores
printf '{"database":"%s","dataVolume":"%s","keysVolume":"%s","trafficSwitched":false}\n' "$new_db" "$volume" "$keys_volume" > ".baize/restores/$new_db.json"
printf 'Restored %s with independent target data/key volumes; deletion journal verified and replayed. No production traffic switched.\n' "$new_db"
