#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Isolated named stack: never attach to an existing installation.
export BAIZE_PORT="${BAIZE_PORT:-3199}"
export PUBLIC_URL="http://127.0.0.1:$BAIZE_PORT"
export COMPOSE_PROJECT_NAME="baize_lifecycle_${RANDOM}"
cleanup() { docker compose logs --no-color app > "/tmp/$COMPOSE_PROJECT_NAME-app.log" 2>&1 || true; docker compose down -v --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT
./install.sh
node --import tsx scripts/ops-lifecycle-api.ts seed ".baize/$COMPOSE_PROJECT_NAME-state.json"
scripts/backup.sh "backups/$COMPOSE_PROJECT_NAME"
node --import tsx scripts/ops-lifecycle-api.ts delete ".baize/$COMPOSE_PROJECT_NAME-state.json"
restore_db="baize_restore_${RANDOM}"
scripts/restore.sh "backups/$COMPOSE_PROJECT_NAME" "$restore_db"
restored_events="$(docker compose exec -T postgres psql -U baize -d "$restore_db" -Atc "SELECT count(*) FROM events")"
[ "$restored_events" = 0 ] || { echo "Deleted visitor resurrected!" >&2; exit 1; }
restored_tombstones="$(docker compose exec -T postgres psql -U baize -d "$restore_db" -Atc "SELECT count(*) FROM tombstones")"
[ "$restored_tombstones" = 1 ] || { echo "Deletion replay missing!" >&2; exit 1; }
./upgrade.sh baize-analytics:local
# Health failure exercises full database+image rollback.
if ./upgrade.sh baize-missing-image:must-not-exist; then
  echo 'Missing-image upgrade unexpectedly succeeded' >&2; exit 1
fi
docker compose exec -T postgres psql -U baize -d baize -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM schema_migrations;'
docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)})"
