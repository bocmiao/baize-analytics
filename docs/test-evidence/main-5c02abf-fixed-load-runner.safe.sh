#!/usr/bin/env bash
set -euo pipefail
umask 077
export APP_ROOT=/tmp/baize-5c02abf-performance.74yuiaeu
export SOURCE_REPOSITORY=/workspace/baize-analytics
export SOURCE_SHA=5c02abf45d1cdc235ac203e7d42f8f1a3420a008
export TEST_DATABASE_URL=postgresql://baize_dev@127.0.0.1:5432/baize_ci_eighth_stable_20261010
export CLICKHOUSE_TEST_URL=http://127.0.0.1:38123
export CLICKHOUSE_TEST_USER=baize
export CLICKHOUSE_TEST_PASSWORD=local-test-only
export REDIS_URL=redis://127.0.0.1:6379
export BENCHMARK_STORAGE=strict-clickhouse
export BENCHMARK_SITES=1
cd "$APP_ROOT"
for BENCHMARK_BATCHES in 20 100; do
  export BENCHMARK_BATCHES
  events=$((BENCHMARK_BATCHES * 50))
  export BENCHMARK_OUTPUT="/tmp/baize-5c02abf-performance.74yuiaeu/strict-${events}.json"
  node --import tsx scripts/independent-pipeline-benchmark.ts > "/tmp/baize-5c02abf-performance.74yuiaeu/strict-${events}.log" 2>&1
 done
