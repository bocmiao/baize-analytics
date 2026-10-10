#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
backup_dir="${1:?Backup required}"
export BUILDX_CONFIG="${BUILDX_CONFIG:-$PWD/.baize/buildx}"
failure_dir="$(mktemp -d "$PWD/.baize/restore-failure.XXXXXX")"
failure_image="baize-analytics:ops-restore-failed-${RANDOM}"
failure_db="baize_restore_worker_failure_${RANDOM}"
project="${COMPOSE_PROJECT_NAME:-baize-analytics}"
source_container="$(docker compose ps -q app)"
source_url="$(docker compose exec -T app printenv DATABASE_URL)"
cleanup(){ docker volume rm "${project}_${failure_db}_app_data" "${project}_${failure_db}_app_keys" >/dev/null 2>&1 || true; docker compose exec -T postgres dropdb -U baize --if-exists "$failure_db" >/dev/null 2>&1 || true; docker image rm "$failure_image" >/dev/null 2>&1 || true; rm -rf "$failure_dir"; }
trap cleanup EXIT
cat > "$failure_dir/Dockerfile" <<'DOCKER'
FROM baize-analytics:local
USER root
RUN printf 'ALTER TABLE goals RENAME TO goals_restore_failure;\n' > /app/db/migrations/9998_ops_restore_failure.sql
USER node
DOCKER
docker build -t "$failure_image" "$failure_dir"
if BAIZE_IMAGE="$failure_image" scripts/restore.sh "$backup_dir" "$failure_db" > "$failure_dir/result.log" 2>&1; then cat "$failure_dir/result.log"; echo 'Failed rebuild falsely accepted!' >&2; exit 1; fi
cat "$failure_dir/result.log"
[ ! -e ".baize/restores/$failure_db.json" ] || { echo 'Failure wrote success marker!' >&2; exit 1; }
if rg '"restored":true|"reaggregated":true|^Restored ' "$failure_dir/result.log"; then echo 'Failure printed success!' >&2; exit 1; fi
[ "$(docker compose exec -T postgres psql -U baize -d postgres -Atc "SELECT count(*) FROM pg_database WHERE datname='$failure_db'")" = 1 ] || { echo 'Failed target was not retained for diagnosis' >&2; exit 1; }
[ "$(docker compose exec -T postgres psql -U baize -d "$failure_db" -Atc "SELECT count(*) FROM aggregation_state WHERE attempts=3 AND dead_letter_at IS NOT NULL AND generation>processed_generation")" = 1 ] || { echo 'Real failed worker state missing' >&2; exit 1; }
[ "$(docker compose ps -q app)" = "$source_container" ] || { echo 'Source traffic container changed' >&2; exit 1; }
[ "$(docker compose exec -T app printenv DATABASE_URL)" = "$source_url" ] || { echo 'Source database routing changed' >&2; exit 1; }
docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)})"
echo 'Actual restore worker SQL failure retained target DB without success marker/output or source traffic switch.'
