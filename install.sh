#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
command -v docker >/dev/null || { echo 'Install Docker Engine and Compose v2 first.' >&2; exit 1; }
docker compose version >/dev/null
umask 077
mkdir -p .baize
# Store builder metadata in the workspace; preserve injected Docker credentials.
export BUILDX_CONFIG="${BUILDX_CONFIG:-$PWD/.baize/buildx}"
mkdir -p "$BUILDX_CONFIG"
if [ ! -e .baize/master.key ]; then
  docker run --rm node:24-bookworm-slim node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" > .baize/master.key
fi
if [ ! -e .env ]; then
  password="$(docker run --rm node:24-bookworm-slim node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
  printf 'POSTGRES_PASSWORD=%s\nBAIZE_PORT=3000\nPUBLIC_URL=http://localhost:3000\nBAIZE_UID=%s\nBAIZE_GID=%s\n' "$password" "$(id -u)" "$(id -g)" > .env
fi
chmod 600 .env .baize/master.key
# Runtime uses the installing uid/gid; the secret stays mode 0600.
# Build locally: private source and images are never published by this installer.
if [ -n "${CODEX_PROXY_CERT:-}" ]; then
  docker build --secret "id=proxy_ca,src=$CODEX_PROXY_CERT" -t "${BAIZE_IMAGE:-baize-analytics:local}" .
else
  docker compose build app
fi
docker compose up -d --wait --wait-timeout 120
printf 'Baize is listening locally. Open your configured PUBLIC_URL and create the administrator.\n'
