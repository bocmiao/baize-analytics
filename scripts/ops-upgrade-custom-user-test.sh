#!/usr/bin/env bash
set -euo pipefail
cd "${APP_ROOT:-$(dirname "$0")/..}"
# Run only in an explicitly authorized isolated installation already seeded with
# canonical CH authority. This reuses the existing real schema/503 rollback test.
[ "${BAIZE_OPS_ISOLATED_STACK:-0}" = 1 ] || { echo 'Explicit isolated-stack authorization required.' >&2; exit 1; }
container="$(docker compose ps --all -q app)"
identity="$(docker inspect "$container" --format '{{.Config.User}}')"
[[ "$identity" =~ ^[0-9]+:[0-9]+$ ]] || { echo 'Numeric application identity required.' >&2; exit 1; }
[ "${identity%:*}" != 1000 ] || { echo 'Fixture requires a non-1000 application UID.' >&2; exit 1; }
count="$(docker compose exec -T postgres psql -U baize -d baize -Atc "SELECT count(*) FROM canonical_event_authority WHERE authority='clickhouse'")"
[ "$count" -gt 0 ] || { echo 'Real canonical source fixture required.' >&2; exit 1; }
bash scripts/ops-upgrade-failure-test.sh
docker compose exec -T app node -e 'const fs=require("node:fs"),assert=require("node:assert/strict"),p="/app/data/rollback-retention-proof.json",s=fs.statSync(p);assert.equal(s.uid,process.getuid());assert.equal(s.gid,process.getgid());assert.equal(s.mode&0o777,0o600);assert(fs.readFileSync(p).length>0);console.log("Canonical rollback proof readable by actual custom application identity, mode0600.")'
printf 'Custom-user canonical schema/503 rollback passed.\n'
