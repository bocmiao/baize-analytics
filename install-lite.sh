#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
command -v docker >/dev/null || { echo 'Install Docker Engine and Compose v2 first.' >&2; exit 1; }
docker compose version >/dev/null
umask 077
mkdir -p .baize
export BUILDX_CONFIG="${BUILDX_CONFIG:-$PWD/.baize/buildx}"
mkdir -p "$BUILDX_CONFIG"
if [ -n "${CODEX_PROXY_CERT:-}" ]; then
 docker compose -f docker-compose.lite.yml -f docker-compose.build-ca.yml build app
else
 docker compose -f docker-compose.lite.yml build app
fi
bash scripts/init-empty-volumes.sh -f docker-compose.lite.yml
docker compose -f docker-compose.lite.yml up -d --wait --wait-timeout 120
if docker compose -f docker-compose.lite.yml exec -T app node -e 'process.exit(require("node:fs").existsSync("/app/keys/install-nonce.json")?0:1)'; then
 docker compose -f docker-compose.lite.yml cp app:/app/keys/install-nonce.json .baize/install-nonce.json >/dev/null
 chmod 600 .baize/install-nonce.json
 printf 'Lite is starting locally. The one-time installation credential is in private .baize/install-nonce.json. Enter its nonce field on the setup page, then remove this local copy after setup.\n'
else
 printf 'Lite is starting locally. For an existing installation sign in normally; for a new installation wait for /healthz, then copy /app/keys/install-nonce.json from the keys volume into a private local file.\n'
fi
