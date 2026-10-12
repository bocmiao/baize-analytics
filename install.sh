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
  docker compose -f docker-compose.yml -f docker-compose.build-ca.yml build app
else
  docker compose build app
fi
bash scripts/init-empty-volumes.sh
docker compose up -d --wait --wait-timeout 120
if docker compose exec -T app node -e 'process.exit(require("node:fs").existsSync("/app/keys/install-nonce.json")?0:1)'; then
  docker compose cp app:/app/keys/install-nonce.json .baize/install-nonce.json >/dev/null
  chmod 600 .baize/install-nonce.json
  printf 'Baize is listening locally. The one-time installation credential is in the private file .baize/install-nonce.json. Enter its nonce field on the setup page, then remove this local copy after setup.\n'
else
  printf 'Baize is listening locally. Initialization is already closed; sign in with the existing account.\n'
fi
