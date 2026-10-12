#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
source scripts/ops-preflight.sh
baize_ops_preflight restore
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
source_helper=""
source_stopped=0
source_image=""
source_container=""
source_restart_failed=0
marker_written=0
canonical_restore=0
if [ -f "$backup_dir/canonical/index.json" ]; then canonical_restore=1; fi
source_exec(){ if [ -n "$source_helper" ]; then docker exec -i "$source_helper" "$@"; else docker compose exec -T app "$@"; fi; }
source_exec_root(){ if [ -n "$source_helper" ]; then docker exec -i --user 0 "$source_helper" "$@"; else docker compose exec -T --user 0 app "$@"; fi; }
source_copy_out(){ if [ -n "$source_helper" ]; then docker cp "$source_helper:$1" "$2"; else docker compose cp "app:$1" "$2"; fi; }
source_copy_in(){ if [ -n "$source_helper" ]; then docker cp "$1" "$source_helper:$2"; else docker compose cp "$1" "app:$2"; fi; }
release_source(){
  local release_status=0 source_ready state attempt
  if [ "$source_stopped" = 1 ] && [ "$source_restart_failed" = 0 ]; then
    if docker start "$source_container" >/dev/null; then
      source_ready=0
      for attempt in $(seq 1 120); do
        state="$(docker inspect "$source_container" --format '{{.State.Running}} {{if .State.Health}}{{.State.Health.Status}}{{end}}')"
        if [ "$state" = 'true healthy' ]; then source_ready=1; break; fi
        if [[ "$state" = false* ]] || [[ "$state" = *unhealthy ]]; then break; fi
        sleep 1
      done
      if [ "$source_ready" = 1 ]; then source_stopped=0; else source_restart_failed=1; release_status=1; docker stop "$source_container" >/dev/null 2>&1 || true; fi
    else source_restart_failed=1; release_status=1; fi
  elif [ "$source_restart_failed" = 1 ]; then release_status=1; fi
  if [ -n "$source_helper" ]; then docker rm -f "$source_helper" >/dev/null || release_status=1; source_helper=""; fi
  return "$release_status"
}
restore_exit(){
  status=$?
  if [ -n "$proof_stage" ]; then source_exec node -e 'require("node:fs").rmSync(process.argv[1],{recursive:true,force:true})' "$proof_stage" >/dev/null 2>&1 || true; fi
  if ! release_source; then echo 'Source restart failed; no restore success accepted. Retain source/target for diagnosis.' >&2; status=1; fi
  if [ "$status" -ne 0 ]; then
    if [ "$marker_written" = 1 ]; then rm -f ".baize/restores/$new_db.json"; fi
    if [ "$target_created" = 1 ]; then printf 'Restore failed; target database %s and isolated volumes retained for diagnosis. No traffic switched; no success marker written.\n' "$new_db" >&2; fi
  fi
  if [ "$status" -ne 0 ] && [ "$target_created" = 1 ]; then
    diagnostics="$(mktemp -d "$PWD/.baize/restore-failure-${new_db}.XXXXXX")"
    mv "$restore_dir" "$diagnostics/check"
    printf 'Private restore diagnostics retained at %s; intermediate output is not acceptance.\n' "$diagnostics" >&2
  else rm -rf "$restore_dir"; fi
  trap - EXIT
  exit "$status"
}
trap restore_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
if [ "$canonical_restore" = 1 ]; then
  [ "${BAIZE_RESTORE_SOURCE_MAINTENANCE:-0}" = 1 ] || { echo 'Canonical restore requires BAIZE_RESTORE_SOURCE_MAINTENANCE=1 and an exclusive source maintenance window; source left unchanged.' >&2; exit 1; }
  [ "${BAIZE_RESTORE_SOURCE_SINGLE_INSTANCE:-0}" = 1 ] || { echo 'Explicit single-instance/exclusive-writer acknowledgement required; source left unchanged.' >&2; exit 1; }
  source_apps=()
  while IFS= read -r candidate; do
    [ -n "$candidate" ] || continue
    if [ "$(docker inspect "$candidate" --format '{{index .Config.Labels "com.docker.compose.oneoff"}}')" != True ]; then source_apps+=("$candidate"); fi
  done < <(docker compose ps --all -q app)
  [ "${#source_apps[@]}" = 1 ] || { echo 'Exactly one original source app container required; replicas unsupported.' >&2; exit 1; }
  source_container="${source_apps[0]}"
  while IFS= read -r service; do case "$service" in app|postgres|redis|clickhouse|target-clickhouse|'') ;; *) echo 'Unrecognized running source service; stop independent writers before restore.' >&2; exit 1;; esac; done < <(docker compose ps --services --status running)
  source_image="$(docker inspect "$source_container" --format '{{.Image}}')"
  source_user="$(docker inspect "$source_container" --format '{{.Config.User}}')"
  source_project="$(docker inspect "$source_container" --format '{{index .Config.Labels "com.docker.compose.project"}}')"
  [[ "$source_image" =~ ^sha256:[a-f0-9]{64}$ && "$source_user" =~ ^[0-9]+:[0-9]+$ && "$source_project" =~ ^[a-z0-9_-]+$ ]] || { echo 'Untrusted source image/user/project metadata.' >&2; exit 1; }
  candidate="baize_restore_source_$source_project"
  [ -z "$(docker ps -aq --filter "name=^/$candidate$")" ] || { echo 'Concurrent source restore/maintenance rejected; source left unchanged.' >&2; exit 1; }
  # Atomic Docker name reservation protects this single Compose source across
  # checkouts. Label ownership lets cleanup distinguish failed starts from races.
  owner="$$-${RANDOM}-${RANDOM}"
  if BAIZE_IMAGE="$source_image" docker compose run --rm --no-deps -d --name "$candidate" --label "baize.restore.owner=$owner" --entrypoint node app -e 'setInterval(()=>{},60000)' >/dev/null; then source_helper="$candidate";
  else
    if [ "$(docker inspect "$candidate" --format '{{index .Config.Labels "baize.restore.owner"}}' 2>/dev/null || true)" = "$owner" ]; then source_helper="$candidate"; fi
    echo 'Source maintenance container failed; original app was not stopped.' >&2; exit 1
  fi
  [ "$(docker inspect "$source_helper" --format '{{.Image}} {{.Config.User}}')" = "$source_image $source_user" ] || { echo 'Source maintenance image/user mismatch.' >&2; exit 1; }
  # Compare mount metadata only, never inspect credential/environment values.
  source_mounts="$(docker inspect "$source_container" --format '{{json .Mounts}}')"
  helper_mounts="$(docker inspect "$source_helper" --format '{{json .Mounts}}')"
  SOURCE_MOUNTS="$source_mounts" HELPER_MOUNTS="$helper_mounts" node -e 'const assert=require("node:assert/strict"),normalize=v=>JSON.parse(v).map(m=>[m.Type,m.Source,m.Destination,m.RW]).sort((a,b)=>a[2].localeCompare(b[2]));assert.deepEqual(normalize(process.env.SOURCE_MOUNTS),normalize(process.env.HELPER_MOUNTS),"Source maintenance mount mismatch")'
  if [ "$(docker inspect "$source_container" --format '{{.State.Running}}')" = true ]; then source_stopped=1; docker stop "$source_container" >/dev/null; fi
  # The acknowledgement covers external/disconnected writers we cannot enumerate.
  # Reject other connected PG clients (including idle workers) after stopping app.
  source_exec node --input-type=module -e 'import pg from "pg";const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000,statement_timeout:5000});try{const r=await pool.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type=\x27client backend\x27");if(r.rows[0].n!==0)throw Error("SOURCE_OTHER_DATABASE_CLIENTS_CONNECTED");console.log("Single source database client verified after app stop.")}finally{await pool.end()}'

fi
# Fail before creating ANY target if independent latest deletion state is absent,
# truncated, reset, corrupted, or older than the database snapshot journal.
source_copy_out /app/data/tombstones.jsonl "$restore_dir/tombstones.jsonl"
source_copy_out /app/data/tombstones.watermark.json "$restore_dir/tombstones.watermark.json"
node scripts/ops-validate-journal.mjs "$restore_dir/tombstones.jsonl" "$restore_dir/tombstones.watermark.json" "$backup_dir/tombstones.jsonl"
source_replica="$(source_exec printenv CLICKHOUSE_URL)"
target_replica="${BAIZE_RESTORE_CLICKHOUSE_URL:-}"
SOURCE_REPLICA="$source_replica" TARGET_REPLICA="$target_replica" CANONICAL_RESTORE="$canonical_restore" node --input-type=module -e '
if(process.env.CANONICAL_RESTORE==="1"&&!process.env.TARGET_REPLICA)throw Error("Canonical restore requires explicit independent target CH database");
if(process.env.TARGET_REPLICA){const t=new URL(process.env.TARGET_REPLICA),s=process.env.SOURCE_REPLICA?new URL(process.env.SOURCE_REPLICA):null;if(process.env.CANONICAL_RESTORE!=="1"&&s&&t.origin===s.origin&&t.pathname.replace(/\/+$/,"")===s.pathname.replace(/\/+$/,""))throw Error("Restore target cannot share source ClickHouse endpoint");}'
if [ "$canonical_restore" = 1 ]; then
  proof_stage="/tmp/baize-retention-check-${RANDOM}-${RANDOM}"
  source_exec node -e 'require("node:fs").mkdirSync(process.argv[1]+"/history",{recursive:true,mode:0o700})' "$proof_stage"
  source_exec node --import tsx scripts/replay-retention-proof-runtime.ts capture > "$restore_dir/replay-retention-proof.json"
  node -e 'const fs=require("node:fs"),f=fs.openSync(process.argv[1],"r");try{fs.fsyncSync(f)}finally{fs.closeSync(f)}' "$restore_dir/replay-retention-proof.json"
  source_copy_in "$backup_dir/canonical/index.json" "$proof_stage/index.json"
  source_copy_in "$backup_dir/canonical/history/manifest.json" "$proof_stage/history/manifest.json"
  source_copy_in "$restore_dir/replay-retention-proof.json" "$proof_stage/replay-retention-proof.json"
  # docker compose cp preserves host ownership. Use the running app identity,
  # and descriptor-bound regular files rather than following copied symlinks.
  proof_identity="$(source_exec node -e 'console.log(process.getuid()+":"+process.getgid())')"
  [[ "$proof_identity" =~ ^[0-9]+:[0-9]+$ ]] || { echo 'Invalid proof application identity' >&2; exit 1; }
  source_exec_root node scripts/ops-restore-proof-files.mjs "$proof_stage" "${proof_identity%:*}" "${proof_identity#*:}"
  source_exec node --import tsx scripts/replay-retention-proof-runtime.ts validate "$proof_stage"
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
if [ -n "$source_helper" ]; then
  image="$source_image"
  app_uid_gid="$source_user"
else
  image="$(docker compose images -q app)"
  app_uid_gid="$(docker inspect "$(docker compose ps --all -q app)" --format '{{.Config.User}}')"
fi
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
    --volume "$volume:/restore-data" --volume "$keys_volume:/restore-keys" app --import tsx scripts/canonical-ops-runtime.ts restore /restore-data/restore-canonical > "$restore_dir/canonical-target.log"
fi
docker compose run --rm --no-deps --entrypoint node \
  --env "RESTORE_DATABASE=$new_db" --env DATA_DIR=/restore-data --env KEYS_DIR=/restore-keys \
  --env REQUIRE_DELETION_JOURNAL=1 --env "CANONICAL_RESTORE_VERIFIED=$canonical_restore" \
  --env "CLICKHOUSE_URL=$target_replica" --env "CLICKHOUSE_USER=${BAIZE_RESTORE_CLICKHOUSE_USER:-default}" \
  --env "CLICKHOUSE_PASSWORD=${BAIZE_RESTORE_CLICKHOUSE_PASSWORD:-}" --env RESTORE_CLICKHOUSE_EXPLICIT=1 \
  --env "RESTORE_SOURCE_CLICKHOUSE_URL=$source_replica" \
  --volume "$volume:/restore-data" --volume "$keys_volume:/restore-keys" app --import tsx scripts/restore-runtime.ts > "$restore_dir/target-rebuild.log"
# A concurrent source deletion after the copied journal invalidates this attempt.
# Preserve the isolated target for diagnosis; retry from a fresh verified journal.
mkdir "$restore_dir/latest-journal"
source_copy_out /app/data/tombstones.jsonl "$restore_dir/latest-journal/tombstones.jsonl"
source_copy_out /app/data/tombstones.watermark.json "$restore_dir/latest-journal/tombstones.watermark.json"
node scripts/ops-validate-journal.mjs "$restore_dir/latest-journal/tombstones.jsonl" "$restore_dir/latest-journal/tombstones.watermark.json" "$restore_dir/tombstones.jsonl"
cmp -s "$restore_dir/latest-journal/tombstones.jsonl" "$restore_dir/tombstones.jsonl" || { echo 'Source deletion journal changed during restore; target retained, no success marker.' >&2; exit 1; }
if [ "$canonical_restore" = 1 ]; then source_exec node --import tsx scripts/replay-retention-proof-runtime.ts still-current "$proof_stage"; fi
mkdir -p .baize/restores
printf '{"database":"%s","dataVolume":"%s","keysVolume":"%s","trafficSwitched":false}\n' "$new_db" "$volume" "$keys_volume" > ".baize/restores/$new_db.json"
marker_written=1
if [ -n "$proof_stage" ]; then source_exec node -e 'require("node:fs").rmSync(process.argv[1],{recursive:true,force:true})' "$proof_stage"; proof_stage=""; fi
release_source
if [ -f "$restore_dir/canonical-target.log" ]; then cat "$restore_dir/canonical-target.log"; fi
cat "$restore_dir/target-rebuild.log"
printf 'Restored %s with independent target data/key volumes; deletion journal verified and replayed. No production traffic switched.\n' "$new_db"
