#!/usr/bin/env bash
# Local-only final acceptance. Never calls GitHub/CNB or synchronizes repositories.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v docker >/dev/null
test -x node_modules/.bin/vitest
test -x /usr/bin/chromium
grep -q 'CANONICAL_ACTIVATION_READY=true' src/server/canonical-migration.ts || {
  echo 'Final strict acceptance requires the verified activation-ready source.' >&2
  exit 1
}
project="baize_final_${RANDOM}_${RANDOM}"
logs="$(mktemp -d "${TMPDIR:-/tmp}/baize-final-local.XXXXXX")"
cleanup() {
  docker compose -p "$project" -f docker-compose.ci.yml logs --no-color > "$logs/services.log" 2>&1 || true
  docker compose -p "$project" -f docker-compose.ci.yml down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker compose -p "$project" -f docker-compose.ci.yml up -d --wait --wait-timeout 120 > "$logs/services-start.log" 2>&1
export TEST_DATABASE_URL="postgres://baize:ci-local-only@127.0.0.1:${CI_PG_PORT:-35432}/baize_ci"
export DATABASE_URL="$TEST_DATABASE_URL"
export CLICKHOUSE_TEST_URL="http://127.0.0.1:${CI_CH_PORT:-38124}"
export REDIS_URL="redis://127.0.0.1:${CI_REDIS_PORT:-36379}/0"
# Native pg_dump/restore case executes against this test-owned PostgreSQL container.
export BAIZE_OPS_POSTGRES_CONTAINER
BAIZE_OPS_POSTGRES_CONTAINER="$(docker compose -p "$project" -f docker-compose.ci.yml ps -q postgres)"
test -n "$BAIZE_OPS_POSTGRES_CONTAINER"
export E2E_STRICT_FACTS=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium
export CI_START_SERVICES=0 CI_SKIP_INSTALL=1 CI_SKIP_BROWSER_INSTALL=1
export CI_TEST_REPORT_DIR="$logs/reports"
node scripts/ops-artifact-manifest.mjs > "$logs/source.sha256"
set +e
bash scripts/ci-common.sh regular 2>&1 | tee "$logs/regular.log"
status=${PIPESTATUS[0]}
set -e
printf 'Local final acceptance exit=%s; evidence=%s\n' "$status" "$logs"
exit "$status"
