#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export BUILDX_CONFIG="${BUILDX_CONFIG:-$PWD/.baize/buildx}"
fail_dir="$(mktemp -d "$PWD/.baize/failed-upgrade.XXXXXX")"
fail_image="baize-analytics:ops-failed-${RANDOM}"
cleanup() { rm -rf "$fail_dir"; docker image rm "$fail_image" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cat > "$fail_dir/Dockerfile" <<'DOCKER'
FROM baize-analytics:local
USER root
RUN printf 'ALTER TABLE sites ADD COLUMN ops_upgrade_probe text;\n' > /app/db/migrations/9999_ops_failure_probe.sql
USER node
CMD ["node", "-e", "require('node:http').createServer((q,r)=>{r.statusCode=503;r.end('intentional upgrade failure')}).listen(3000,'0.0.0.0')"]
DOCKER
docker build -t "$fail_image" "$fail_dir"
if ./upgrade.sh "$fail_image"; then
  echo 'Deliberately unhealthy image unexpectedly accepted!' >&2; exit 1
fi
column_count="$(docker compose exec -T postgres psql -U baize -d baize -Atc "SELECT count(*) FROM information_schema.columns WHERE table_name='sites' AND column_name='ops_upgrade_probe'")"
[ "$column_count" = 0 ] || { echo 'Schema migration survived rollback!' >&2; exit 1; }
# The probe migration was committed before health failure, so this checks actual
# database snapshot restore, rather than a mere application tag rollback.
docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)})"
echo 'Committed schema mutation + failed health rolled back database and application.'
