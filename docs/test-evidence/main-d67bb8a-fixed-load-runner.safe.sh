#!/usr/bin/env bash
set -euo pipefail
umask 077
export APP_ROOT=/tmp/baize-d67bb8a-performance.df5adccj
export SOURCE_REPOSITORY=/workspace/baize-analytics
export SOURCE_SHA=d67bb8aeda34652010125e889019392aaa0788f8
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
  export BENCHMARK_OUTPUT="/tmp/baize-d67bb8a-performance.df5adccj/strict-${events}.json"
  node --import tsx scripts/independent-pipeline-benchmark.ts > "/tmp/baize-d67bb8a-performance.df5adccj/strict-${events}.log" 2>&1
 done
