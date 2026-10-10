#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mode="${1:-regular}"
case "$mode" in regular|heavy-ops|heavy-million) ;; *) echo 'Unknown CI mode' >&2; exit 2;; esac
if [ "$mode" = regular ] && [ "${CI_RUNNER_IN_COMPOSE:-0}" = 1 ]; then
 # Delegate before npm/browser work. Inner job uses service-name endpoints.
 exec bash scripts/ci-compose-runner.sh
fi
if [ "${CI_SKIP_INSTALL:-0}" != 1 ]; then npm ci; fi
if [ "$mode" = heavy-ops ]; then exec bash scripts/ops-lifecycle-test.sh; fi
if [ "$mode" = heavy-million ]; then
  : "${BENCH_DATABASE_URL:?Provide an isolated benchmark database}"
  export TEST_DATABASE_URL="$BENCH_DATABASE_URL"
  exec node --import tsx scripts/full-pipeline-benchmark.ts --events=1000000 --sites=40
fi
service_project=''
service_cleanup(){ if [ -n "$service_project" ]; then docker compose -p "$service_project" -f docker-compose.ci.yml down -v >/dev/null 2>&1 || true; fi; }
if [ "${CI_START_SERVICES:-0}" = 1 ]; then
 command -v docker >/dev/null || { echo 'CI requires a Docker-capable runner for isolated services' >&2; exit 1; }
 service_project="baize_ci_${RANDOM}_${RANDOM}"
 trap service_cleanup EXIT
 docker compose -p "$service_project" -f docker-compose.ci.yml up -d --wait --wait-timeout 120
 export TEST_DATABASE_URL="postgres://baize:ci-local-only@127.0.0.1:${CI_PG_PORT:-35432}/baize_ci"
 export DATABASE_URL="$TEST_DATABASE_URL" CLICKHOUSE_TEST_URL="http://127.0.0.1:${CI_CH_PORT:-38124}"
 export REDIS_URL="redis://127.0.0.1:${CI_REDIS_PORT:-36379}/0"
fi
: "${TEST_DATABASE_URL:?Real PostgreSQL URL is mandatory; skipped integration is not acceptance}"
: "${CLICKHOUSE_TEST_URL:?Real ClickHouse URL is mandatory}"
: "${REDIS_URL:?Real isolated Redis namespace is mandatory}"
export DATABASE_URL="${DATABASE_URL:-$TEST_DATABASE_URL}"
export HOST=127.0.0.1 PORT="${CI_PORT:-3391}" PUBLIC_URL="http://127.0.0.1:${CI_PORT:-3391}"
export E2E_BASE_URL="$PUBLIC_URL"
ci_dir="$(mktemp -d "${TMPDIR:-/tmp}/baize-shared-ci.XXXXXX")"
export DATA_DIR="$ci_dir/data" KEYS_DIR="$ci_dir/keys" MASTER_KEY_FILE="$ci_dir/master.key"
mkdir -m 700 "$DATA_DIR" "$KEYS_DIR"
node -e 'require("node:fs").writeFileSync(process.env.MASTER_KEY_FILE,require("node:crypto").randomBytes(32).toString("hex"),{mode:0o600})'
app_pid=''
cleanup(){ if [ -n "$app_pid" ]; then kill "$app_pid" 2>/dev/null || true; wait "$app_pid" 2>/dev/null || true; fi; service_cleanup; }
trap cleanup EXIT
npm run lint
npm run typecheck
npm run test:unit
node --import tsx scripts/ops-sdk-test.ts
node scripts/ops-journal-test.mjs
npm run build
if [ "${CI_SKIP_BROWSER_INSTALL:-0}" != 1 ]; then npm exec playwright -- install --with-deps chromium; fi
if [ "${CI_CONTAINER_RUNNER:-0}" = 1 ] && [ ! -e /usr/bin/chromium ]; then
 # Dedicated disposable test container only: use the actual installed browser
 # where integration tests intentionally select the system-Chromium location.
 bundled_chromium="$(node --input-type=module -e 'import {chromium} from "@playwright/test";import {accessSync,constants} from "node:fs";const path=chromium.executablePath();accessSync(path,constants.X_OK);process.stdout.write(path)')"
 ln -s "$bundled_chromium" /usr/bin/chromium
fi
npm run db:migrate
npm run test:integration
# Exercise the compiled production entrypoint, including JSON module imports.
node dist/server/src/server/main.js > "$ci_dir/app.log" 2>&1 & app_pid=$!
healthy=0
for attempt in $(seq 1 40); do if node -e 'fetch(process.env.PUBLIC_URL+"/healthz").then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))'; then healthy=1; break; fi; if ! kill -0 "$app_pid" 2>/dev/null; then break; fi; sleep 1; done
[ "$healthy" = 1 ] || { echo "Compiled application startup failed; diagnostic log: $ci_dir/app.log" >&2; exit 1; }
npm run test:e2e
printf 'Shared regular CI passed; logs retained at %s\n' "$ci_dir"
