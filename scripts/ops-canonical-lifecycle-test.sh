#!/usr/bin/env bash
set -euo pipefail
cd "${APP_ROOT:-$(dirname "$0")/..}"
[[ "${COMPOSE_PROJECT_NAME:-}" =~ ^baize_lifecycle_ ]] || { echo 'Only an existing isolated lifecycle stack is accepted.' >&2; exit 1; }
[ "${OPS_ISOLATED_STACK:-0}" = 1 ] || { echo 'Explicit isolated stack fixture authorization required.' >&2; exit 1; }
# Run after installing the optional CH Compose profile, never against a user stack.
source_url="$(docker compose exec -T app printenv CLICKHOUSE_URL)"
[ -n "$source_url" ] || { echo 'Isolated stack needs its own ClickHouse profile.' >&2; exit 1; }
SOURCE_CH_URL="$source_url" node --input-type=module -e 'if(new URL(process.env.SOURCE_CH_URL).hostname!=="clickhouse")throw Error("Only the owned optional Compose ClickHouse service is accepted")'
fixture="/app/data/ops-canonical-fixture.json"
target_db="baize_restore_canonical_${RANDOM}_${RANDOM}"
backup="backups/${COMPOSE_PROJECT_NAME}-canonical-${RANDOM}"
proof_failure_dir=""
cleanup(){ if [ -n "$proof_failure_dir" ]; then rm -rf "$proof_failure_dir"; fi; docker compose exec -T postgres dropdb -U baize --if-exists "$target_db" >/dev/null 2>&1 || true; docker volume rm "${COMPOSE_PROJECT_NAME}_${target_db}_app_data" "${COMPOSE_PROJECT_NAME}_${target_db}_app_keys" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker compose exec -T --env OPS_ISOLATED_STACK=1 app node --import tsx scripts/ops-canonical-stack.ts seed "$fixture"
scripts/backup.sh "$backup"
[ -f "$backup/canonical/history/manifest.json" ] && [ -f "$backup/canonical/index.json" ]
docker compose exec -T --env OPS_ISOLATED_STACK=1 app node --import tsx scripts/ops-canonical-stack.ts delete "$fixture"
docker compose exec -T --env OPS_ISOLATED_STACK=1 app node --import tsx scripts/ops-canonical-stack.ts verify "$fixture" > "$backup/source-after-deletion.json"
# A fresh database on the same isolated CH server is a namespace isolation test,
# not an independent-machine disaster recovery assertion.
target_url="$(SOURCE_CH_URL="$source_url" TARGET_CH_DB="${target_db}_ch" node --input-type=module -e 'const u=new URL(process.env.SOURCE_CH_URL);u.searchParams.set("database",process.env.TARGET_CH_DB);console.log(u.href)')"
source_container_before="$(docker compose ps -q app)"
no_maintenance_db="${target_db}_no_maintenance"
if BAIZE_RESTORE_SOURCE_MAINTENANCE=0 BAIZE_RESTORE_CLICKHOUSE_URL="$target_url" scripts/restore.sh "$backup" "$no_maintenance_db" > "$backup/no-maintenance.log" 2>&1; then echo 'Implicit canonical source maintenance accepted!' >&2; exit 1; fi
rg 'requires BAIZE_RESTORE_SOURCE_MAINTENANCE=1' "$backup/no-maintenance.log" >/dev/null
[ "$(docker compose exec -T postgres psql -U baize -d postgres -Atc "SELECT count(*) FROM pg_database WHERE datname='$no_maintenance_db'")" = 0 ]
[ "$(docker compose ps -q app)" = "$source_container_before" ] || { echo 'No-opt-in rejection changed source container!' >&2; exit 1; }
docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)})"
echo 'Missing explicit maintenance opt-in rejected before target creation; source application unchanged and healthy.'
BAIZE_RESTORE_SOURCE_MAINTENANCE=1 BAIZE_RESTORE_CLICKHOUSE_URL="$target_url" BAIZE_RESTORE_CLICKHOUSE_USER="${CLICKHOUSE_USER:-baize}" BAIZE_RESTORE_CLICKHOUSE_PASSWORD="${CLICKHOUSE_PASSWORD:?Local optional profile password required}" scripts/restore.sh "$backup" "$target_db"
docker compose exec -T app node -e 'const fs=require("node:fs"),assert=require("node:assert/strict");assert.equal(fs.readdirSync("/tmp").filter(name=>name.startsWith("baize-retention-check-")).length,0);console.log("Successful restore cleaned temporary proof directories.")'
# A copied symlink must fail before target creation and leave no success marker.
proof_failure_dir="$(mktemp -d "$PWD/.baize/restore-proof-failure.XXXXXX")"
cp -a "$backup" "$proof_failure_dir/backup"
mv "$proof_failure_dir/backup/canonical/index.json" "$proof_failure_dir/backup/canonical/index.safe.json"
ln -s index.safe.json "$proof_failure_dir/backup/canonical/index.json"
proof_failure_db="${target_db}_unsafe"
if BAIZE_RESTORE_SOURCE_MAINTENANCE=1 BAIZE_RESTORE_CLICKHOUSE_URL="$target_url" BAIZE_RESTORE_CLICKHOUSE_USER="${CLICKHOUSE_USER:-baize}" BAIZE_RESTORE_CLICKHOUSE_PASSWORD="$CLICKHOUSE_PASSWORD" scripts/restore.sh "$proof_failure_dir/backup" "$proof_failure_db" > "$proof_failure_dir/rejection.log" 2>&1; then cat "$proof_failure_dir/rejection.log"; echo 'Symlink proof falsely accepted!' >&2; exit 1; fi
cat "$proof_failure_dir/rejection.log"
rg 'ELOOP|symbolic link' "$proof_failure_dir/rejection.log" >/dev/null
if rg '"restored":true|"reaggregated":true|^Restored ' "$proof_failure_dir/rejection.log"; then echo 'Unsafe proof printed success!' >&2; exit 1; fi
[ ! -e ".baize/restores/$proof_failure_db.json" ] || { echo 'Unsafe proof wrote success marker!' >&2; exit 1; }
[ "$(docker compose exec -T postgres psql -U baize -d postgres -Atc "SELECT count(*) FROM pg_database WHERE datname='$proof_failure_db'")" = 0 ] || { echo 'Unsafe proof created target database!' >&2; exit 1; }
docker compose exec -T app node -e 'const fs=require("node:fs"),assert=require("node:assert/strict");assert.equal(fs.readdirSync("/tmp").filter(name=>name.startsWith("baize-retention-check-")).length,0);console.log("Unsafe proof rejected before database creation, without success marker/output; temporary proof directories cleaned.")'
[ -z "$(docker ps -aq --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME" --filter name=baize_restore_source_)" ] || { echo 'Temporary source maintenance container leaked!' >&2; exit 1; }
docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)})"
echo 'Source standard application restored healthy after successful and rejected restores; no maintenance helper leaked.'
rm -rf "$proof_failure_dir"
proof_failure_dir=''
docker compose exec -T --env OPS_ISOLATED_STACK=1 app node --import tsx scripts/ops-canonical-stack.ts verify "$fixture" > "$backup/source-after-restore.json"
cmp "$backup/source-after-deletion.json" "$backup/source-after-restore.json"
source_database="$(docker compose exec -T app printenv DATABASE_URL)"
target_database="$(SOURCE_DATABASE="$source_database" TARGET_DATABASE="$target_db" node --input-type=module -e 'const u=new URL(process.env.SOURCE_DATABASE);u.pathname="/"+process.env.TARGET_DATABASE;console.log(u.href)')"
docker compose run --rm --no-deps --entrypoint node --env OPS_ISOLATED_STACK=1 --env "DATABASE_URL=$target_database" --env "CLICKHOUSE_URL=$target_url" --volume "${COMPOSE_PROJECT_NAME}_${target_db}_app_data:/restore-data" app --import tsx scripts/ops-canonical-stack.ts verify /restore-data/ops-canonical-fixture.json
echo 'Compiled-image shell backup/restore retained CH authority and historical namespace, replayed latest journal, and kept source unchanged by restore.'
