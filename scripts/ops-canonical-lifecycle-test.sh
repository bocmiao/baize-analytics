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
cleanup(){ docker compose exec -T postgres dropdb -U baize --if-exists "$target_db" >/dev/null 2>&1 || true; docker volume rm "${COMPOSE_PROJECT_NAME}_${target_db}_app_data" "${COMPOSE_PROJECT_NAME}_${target_db}_app_keys" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker compose exec -T --env OPS_ISOLATED_STACK=1 app node --import tsx scripts/ops-canonical-stack.ts seed "$fixture"
scripts/backup.sh "$backup"
[ -f "$backup/canonical/history/manifest.json" ] && [ -f "$backup/canonical/index.json" ]
docker compose exec -T --env OPS_ISOLATED_STACK=1 app node --import tsx scripts/ops-canonical-stack.ts delete "$fixture"
docker compose exec -T --env OPS_ISOLATED_STACK=1 app node --import tsx scripts/ops-canonical-stack.ts verify "$fixture" > "$backup/source-after-deletion.json"
# A fresh database on the same isolated CH server is a namespace isolation test,
# not an independent-machine disaster recovery assertion.
target_url="$(SOURCE_CH_URL="$source_url" TARGET_CH_DB="${target_db}_ch" node --input-type=module -e 'const u=new URL(process.env.SOURCE_CH_URL);u.searchParams.set("database",process.env.TARGET_CH_DB);console.log(u.href)')"
BAIZE_RESTORE_CLICKHOUSE_URL="$target_url" BAIZE_RESTORE_CLICKHOUSE_USER="${CLICKHOUSE_USER:-baize}" BAIZE_RESTORE_CLICKHOUSE_PASSWORD="${CLICKHOUSE_PASSWORD:?Local optional profile password required}" scripts/restore.sh "$backup" "$target_db"
docker compose exec -T --env OPS_ISOLATED_STACK=1 app node --import tsx scripts/ops-canonical-stack.ts verify "$fixture" > "$backup/source-after-restore.json"
cmp "$backup/source-after-deletion.json" "$backup/source-after-restore.json"
source_database="$(docker compose exec -T app printenv DATABASE_URL)"
target_database="$(SOURCE_DATABASE="$source_database" TARGET_DATABASE="$target_db" node --input-type=module -e 'const u=new URL(process.env.SOURCE_DATABASE);u.pathname="/"+process.env.TARGET_DATABASE;console.log(u.href)')"
docker compose run --rm --no-deps --entrypoint node --env OPS_ISOLATED_STACK=1 --env "DATABASE_URL=$target_database" --env "CLICKHOUSE_URL=$target_url" --volume "${COMPOSE_PROJECT_NAME}_${target_db}_app_data:/restore-data" app --import tsx scripts/ops-canonical-stack.ts verify /restore-data/ops-canonical-fixture.json
echo 'Compiled-image shell backup/restore retained CH authority and historical namespace, replayed latest journal, and kept source unchanged by restore.'
