#!/usr/bin/env bash
set -euo pipefail
cd "${APP_ROOT:-$(dirname "$0")/..}"
[[ "${COMPOSE_PROJECT_NAME:-}" =~ ^baize_lifecycle_ ]] && [ "${OPS_ISOLATED_STACK:-0}" = 1 ] || { echo 'Explicit isolated lifecycle stack required' >&2; exit 1; }
backup=${1:?Canonical fixture backup required}
target_url=${2:?Independent fixture CH namespace URL required}
source_id=$(docker compose ps -q app)
[ -n "$source_id" ]
work=$(mktemp -d "$PWD/.baize/maintenance-test.XXXXXX")
held=''
targets=()
cleanup(){ if [ -n "$held" ]; then command docker rm -f "$held" >/dev/null 2>&1 || true; fi; for db in "${targets[@]}"; do command docker compose exec -T postgres dropdb -U baize --if-exists "$db" >/dev/null 2>&1 || true; command docker volume rm "${COMPOSE_PROJECT_NAME}_${db}_app_data" "${COMPOSE_PROJECT_NAME}_${db}_app_keys" >/dev/null 2>&1 || true; done; rm -rf "$work"; }
trap cleanup EXIT
export BAIZE_RESTORE_SOURCE_MAINTENANCE=1 BAIZE_RESTORE_SOURCE_SINGLE_INSTANCE=1
export BAIZE_RESTORE_CLICKHOUSE_URL=$target_url BAIZE_RESTORE_CLICKHOUSE_USER=baize BAIZE_RESTORE_CLICKHOUSE_PASSWORD=local-test-only
export OPS_SOURCE_ID=$source_id OPS_FAULT=''
docker(){
  local command_result
  if [ "${OPS_FAULT:-}" = create ] && [ "${1:-}" = compose ] && [ "${2:-}" = run ]; then echo 'Injected maintenance creation failure' >&2; return 42; fi
  if [ "${OPS_FAULT:-}" = restart ] && [ "${1:-}" = start ] && [ "${2:-}" = "$OPS_SOURCE_ID" ]; then echo 'Injected original source restart failure' >&2; return 43; fi
  command docker "$@"
  command_result=$?
  if [ "${OPS_FAULT:-}" = term ] && [ "${1:-}" = stop ] && [ "${2:-}" = "$OPS_SOURCE_ID" ]; then kill -TERM $$; fi
  return "$command_result"
}
export -f docker
no_success(){ ! rg '"restored":true|"reaggregated":true|^Restored ' "$1"; [ ! -e ".baize/restores/$2.json" ]; }
no_helper(){ [ -z "$(command docker ps -aq --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME" --filter name=baize_restore_source_)" ]; }
ready(){ for attempt in $(seq 1 120); do if command docker exec "$source_id" node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" >/dev/null 2>&1; then return 0; fi; sleep 1; done; return 1; }
negative(){ mode=$1; db="baize_restore_maintenance_${mode}_${RANDOM}"; targets+=("$db"); export OPS_FAULT=$mode; set +e; bash scripts/restore.sh "$backup" "$db" > "$work/$mode.log" 2>&1; status=$?; set -e; cat "$work/$mode.log"; [ "$status" != 0 ]; no_success "$work/$mode.log" "$db"; no_helper; if [ "$mode" = restart ]; then [ "$(command docker inspect "$source_id" --format '{{.State.Running}}')" = false ]; [ "$(command docker compose exec -T postgres psql -U baize -d postgres -Atc "SELECT count(*) FROM pg_database WHERE datname='$db'")" = 1 ]; command docker start "$source_id" >/dev/null; else [ "$(command docker compose exec -T postgres psql -U baize -d postgres -Atc "SELECT count(*) FROM pg_database WHERE datname='$db'")" = 0 ]; fi; export OPS_FAULT=''; ready; echo "Actual isolated maintenance $mode failure: exit$status, no success output/marker, owned helper cleaned, original standard source healthy."; }
negative create
negative term
# A second invocation must not remove another operation's atomic reservation.
held="baize_restore_source_$COMPOSE_PROJECT_NAME"
command docker compose run --rm --no-deps -d --name "$held" --label baize.restore.owner=held-regression --entrypoint node app -e 'setInterval(()=>{},60000)' >/dev/null
held_id=$(command docker inspect "$held" --format '{{.Id}}')
db="baize_restore_concurrent_${RANDOM}"
if bash scripts/restore.sh "$backup" "$db" > "$work/concurrent.log" 2>&1; then echo 'Concurrent restore accepted' >&2; exit 1; fi
rg 'Concurrent source restore' "$work/concurrent.log" >/dev/null
no_success "$work/concurrent.log" "$db"
[ "$(command docker inspect "$held" --format '{{.Id}}')" = "$held_id" ]
command docker rm -f "$held" >/dev/null; held=''; no_helper; ready
echo 'Concurrent restore refused without stopping source or removing reservation owned by another invocation.'
# A live external/independent PG backend must prevent the maintenance snapshot.
held="baize_maintenance_external_${RANDOM}"
command docker compose run --rm --no-deps -d --name "$held" --entrypoint node app -e 'const {Pool}=require("pg"),pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});pool.connect().then(()=>console.log("Held PG client"));setInterval(()=>{},1000)' >/dev/null
for attempt in $(seq 1 60); do if command docker logs "$held" 2>&1 | rg 'Held PG client' >/dev/null; then break; fi; sleep 1; done
command docker logs "$held" 2>&1 | rg 'Held PG client' >/dev/null
db="baize_restore_external_${RANDOM}"
if bash scripts/restore.sh "$backup" "$db" > "$work/external.log" 2>&1; then echo 'Connected external writer accepted' >&2; exit 1; fi
rg 'SOURCE_OTHER_DATABASE_CLIENTS_CONNECTED' "$work/external.log" >/dev/null
no_success "$work/external.log" "$db"; no_helper; ready
command docker rm -f "$held" >/dev/null; held=''
echo 'Connected independent PG client rejected before target creation; original standard source restored healthy.'
negative restart
# Successful offline-source restore preserves its original stopped state.
command docker stop "$source_id" >/dev/null
export OPS_FAULT=''
db="baize_restore_initially_stopped_${RANDOM}"; targets+=("$db")
bash scripts/restore.sh "$backup" "$db" > "$work/stopped.log" 2>&1
[ "$(command docker inspect "$source_id" --format '{{.State.Running}}')" = false ]; no_helper
[ -f ".baize/restores/$db.json" ]
command docker start "$source_id" >/dev/null; ready
cat "$work/stopped.log"
echo 'Successful restore preserved originally stopped source; only test operator restarted it afterward.'
unset -f docker
