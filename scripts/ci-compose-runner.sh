#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v docker >/dev/null || { echo 'Docker-capable CI runner required' >&2; exit 1; }
project="baize_cnb_${RANDOM}_${RANDOM}"
export CI_RUNNER_IMAGE="baize-cnb-ci:$project"
logs="$(mktemp -d "${TMPDIR:-/tmp}/baize-cnb-ci-logs.XXXXXX")"
cleanup(){ docker compose -p "$project" -f docker-compose.cnb.yml logs --no-color > "$logs/stack.log" 2>&1 || true; docker compose -p "$project" -f docker-compose.cnb.yml down -v --remove-orphans >/dev/null 2>&1 || true; docker image rm "$CI_RUNNER_IMAGE" >/dev/null 2>&1 || true; }
trap cleanup EXIT
export BUILDX_CONFIG="${BUILDX_CONFIG:-$logs/buildx}"
mkdir -p "$BUILDX_CONFIG"
# Docker uploads COPY context to its daemon: no pipeline filesystem bind assumption.
docker compose -p "$project" -f docker-compose.cnb.yml build runner
docker image inspect "$CI_RUNNER_IMAGE" --format 'CI runner image: {{.Id}}'
# Public session CA is transferred through the Docker API, not a remote-daemon
# bind or image layer. No provider credential is copied. Container cleanup removes it.
public_ca="${CI_PUBLIC_PROXY_CA:-${CODEX_PROXY_CERT:-}}"
if [ -n "$public_ca" ]; then
 [ -f "$public_ca" ] || { echo 'Configured public CI proxy CA is missing' >&2; exit 1; }
 docker compose -p "$project" -f docker-compose.cnb.yml create runner
 ca_container="$(docker compose -p "$project" -f docker-compose.cnb.yml ps --all -q runner)"
 docker cp "$public_ca" "$ca_container:/tmp/baize-public-proxy-ca.pem"
fi
# Explicit environment in Compose never forwards source/CNB tokens to the test job.
set +e
docker compose -p "$project" -f docker-compose.cnb.yml up --abort-on-container-exit --exit-code-from runner 2>&1 | tee "$logs/regular.log"
status=${PIPESTATUS[0]}
set -e
container="$(docker compose -p "$project" -f docker-compose.cnb.yml ps --all -q runner)"
if [ -n "$container" ] && [ "${CI_COPY_BROWSER_ARTIFACTS:-0}" = 1 ]; then
 # Copy only test artifacts; never app data, master keys, cookies or environment.
 docker cp "$container:/workspace/test-results" "$logs/test-results" 2>/dev/null || true
fi
printf 'Containerized shared regular CI exit=%s; logs: %s\n' "$status" "$logs"
exit "$status"
