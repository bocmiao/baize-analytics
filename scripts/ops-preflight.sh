#!/usr/bin/env bash
# Read-only checks before backup output or application downtime.
baize_ops_preflight() {
  local mode="$1" tool
  local tools=(docker node sha256sum sort find xargs tar cut date cp mv cat chmod mkdir rm basename sleep mktemp realpath cmp seq)
  if [ "$mode" = upgrade ]; then tools+=(fallocate sed mktemp grep); fi
  for tool in "${tools[@]}"; do
    command -v "$tool" >/dev/null || { echo "Missing $tool; install the Linux operations prerequisites described in docs/deployment.md before retrying. No application stopped." >&2; return 1; }
  done
  docker compose version >/dev/null || { echo 'Docker Compose v2 required.' >&2; return 1; }
  node -e 'if(Number(process.versions.node.split(".")[0])<24)process.exit(1)' || { echo 'Host Node.js 24 or later required for operations.' >&2; return 1; }
  printf '' | sort -z >/dev/null 2>&1 || { echo 'GNU-compatible sort -z required.' >&2; return 1; }
  if [ "$mode" = upgrade ]; then
    sed --version >/dev/null 2>&1 || { echo 'GNU sed required for upgrade .env updates.' >&2; return 1; }
  fi
}
