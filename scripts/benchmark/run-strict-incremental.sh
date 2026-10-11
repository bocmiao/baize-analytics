#!/usr/bin/env bash
set -euo pipefail
umask 077
case "${BAIZE_PERF_COVERAGE_REUSE:-0}" in
  0|1) export BAIZE_COVERAGE_SELECTED_RUNS="${BAIZE_PERF_COVERAGE_REUSE:-0}" ;;
  *) echo 'BAIZE_PERF_COVERAGE_REUSE must be 0 or 1.' >&2; exit 1 ;;
esac
runner_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
export SOURCE_REPOSITORY="${SOURCE_REPOSITORY:-$(cd "$runner_dir/../.." && pwd)}"
: "${APP_ROOT:?Pristine immutable performance snapshot required}"
: "${SOURCE_SHA:?Exact immutable full SHA required}"
: "${TEST_DATABASE_URL:?Existing local test PG URL required}"
: "${CLICKHOUSE_TEST_URL:?Existing local test CH URL required}"
: "${REDIS_URL:?Existing local test Redis URL required}"
: "${BENCHMARK_OUTPUT:?New evidence JSON filename required}"
[ "${BAIZE_SERIAL_RESOURCE_GATE:-0}" = 1 ] || { echo 'Root serial heavy gate required.' >&2; exit 1; }
[[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]]
for suffix in '' .log .exit .wall.txt .source-binding.txt .plan.json .disk-after.txt .run-lock; do
 [ ! -e "$BENCHMARK_OUTPUT$suffix" ] || { echo 'Refusing overwrite of prior evidence.' >&2; exit 1; }
done
# Atomic reservation prevents two runs using the same evidence destination.
(set -o noclobber; : > "$BENCHMARK_OUTPUT.run-lock") || exit 1
export BENCHMARK_STORAGE=strict-clickhouse BENCHMARK_SITES=1
case "${BAIZE_PERF_EVENTS:-300}" in
  300) export BENCHMARK_BATCHES=6 ;;
  5000) export BENCHMARK_BATCHES=100 ;;
  *) echo 'Only original bounded300 or5000 schedules allowed.' >&2; exit 1 ;;
esac
cd "$APP_ROOT"
free="$(df -Pk "$APP_ROOT" | awk 'NR==2{printf "%.0f",$4*1024}')"
[ "$free" -ge 2147483648 ] || { echo '2GiB preflight floor reached; no run started.' >&2; exit 1; }
# URLs are inherited privately, never echoed. Bootstrap creates its own random
# PGschema/CHdatabase and owns their verified cleanup; no containers are created.
export FROZEN_SOURCE_SHA="$SOURCE_SHA"
python3 "$runner_dir/verify-archive-binding.py" > "$BENCHMARK_OUTPUT.source-binding.txt"
printf '{"sourceSha":"%s","events":%s,"batchEvents":50,"intervalMs":1000,"queryIntervalMs":10000,"maxQueued":8,"maxConcurrent":2,"drainLimitMs":120000,"freeBytesBefore":%s,"coverageReuse":%s}\n' "$SOURCE_SHA" "${BAIZE_PERF_EVENTS:-300}" "$free" "$BAIZE_COVERAGE_SELECTED_RUNS" > "$BENCHMARK_OUTPUT.plan.json"
status=0
python3 - "$BENCHMARK_OUTPUT" <<'PYWALL' || status=$?
import resource,subprocess,sys,time
output=sys.argv[1]
began=time.monotonic()
with open(output+'.log','xb') as log:
    child=subprocess.run(['node','--import','tsx','scripts/independent-pipeline-benchmark.ts'],stdout=log,stderr=subprocess.STDOUT)
wall=time.monotonic()-began
peak=resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss
status=child.returncode if child.returncode>=0 else 128-child.returncode
with open(output+'.wall.txt','x') as report:
    report.write(f'overallWallSeconds={wall:.9f}\nprocessPeakKiB={peak}\nexit={status}\n')
sys.exit(status)
PYWALL
printf '%s\n' "$status" > "$BENCHMARK_OUTPUT.exit"
df -Pk "$APP_ROOT" > "$BENCHMARK_OUTPUT.disk-after.txt"
exit "$status"
