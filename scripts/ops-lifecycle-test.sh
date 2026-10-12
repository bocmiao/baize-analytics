#!/usr/bin/env bash
set -euo pipefail
cd "${APP_ROOT:-$(dirname "$0")/..}"
[ -f package-lock.json ] && [ -f docker-compose.yml ] || { echo "APP_ROOT must select the frozen application checkout" >&2; exit 1; }
# Isolated named stack: never attach to an existing installation.
export BAIZE_PORT="${BAIZE_PORT:-3199}"
export PUBLIC_URL="http://127.0.0.1:$BAIZE_PORT"
export COMPOSE_PROJECT_NAME="baize_lifecycle_${RANDOM}"
cleanup() { if [ -n "${restore_db:-}" ]; then docker volume rm "${COMPOSE_PROJECT_NAME}_${restore_db}_app_data" "${COMPOSE_PROJECT_NAME}_${restore_db}_app_keys" >/dev/null 2>&1 || true; fi; docker compose logs --no-color > "/tmp/$COMPOSE_PROJECT_NAME-app.log" 2>&1 || true; docker compose down -v --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT
[ -f .env ] && [ -f .baize/master.key ] || { echo 'Prepare private synthetic fixture configuration before this disposable lifecycle test.' >&2; exit 1; }
if [ "${BAIZE_OPS_SKIP_BUILD:-0}" != 1 ]; then docker compose build app; fi
bash scripts/init-empty-volumes.sh
# This stack is disposable and has no owner yet. Provision a known synthetic
# credential before first application startup; production validation stays on.
docker compose run --rm --no-deps --entrypoint node app -e 'const fs=require("node:fs");fs.mkdirSync("/app/keys",{recursive:true,mode:0o700});fs.writeFileSync("/app/keys/install-nonce.json",JSON.stringify({version:1,nonce:"42".repeat(32)}),{flag:"wx",mode:0o600})'
docker compose up -d --wait --wait-timeout 120
# A cached old image cannot count as acceptance of current application/migrations.
node scripts/ops-artifact-manifest.mjs > ".baize/$COMPOSE_PROJECT_NAME-source.sha256"
docker compose exec -T app node scripts/ops-artifact-manifest.mjs > ".baize/$COMPOSE_PROJECT_NAME-image.sha256"
diff -u ".baize/$COMPOSE_PROJECT_NAME-source.sha256" ".baize/$COMPOSE_PROJECT_NAME-image.sha256"
docker compose images -q app > ".baize/$COMPOSE_PROJECT_NAME-image.id"
docker compose exec -T app node --input-type=module -e 'import fs from "node:fs";import assert from "node:assert/strict";import {gunzipSync} from "node:zlib";const license=fs.readFileSync("packages/tracker/LICENSE","utf8").trim();assert.equal(fs.readFileSync("public/tracker.LICENSE.txt","utf8").trim(),license);assert(fs.readFileSync("LICENSE","utf8").includes("GNU AFFERO GENERAL PUBLIC LICENSE"));assert.equal(fs.readFileSync("plugins/wordpress/LICENSE","utf8"),fs.readFileSync("LICENSE","utf8"));for(const name of fs.readdirSync("public").filter(x=>/^tracker.*\.js$/.test(x)))assert(fs.readFileSync("public/"+name,"utf8").includes(license));for(const name of ["tracker","tracker-min"]){const source=fs.readFileSync("public/"+name+".js"),compressed=fs.readFileSync("public/"+name+".js.gz");assert(compressed.length<=5120);assert(gunzipSync(compressed).equals(source));console.log(JSON.stringify({tracker:name,gzipBytes:compressed.length,within5KiB:compressed.length<=5120,withinDecimal5KB:compressed.length<=5000}));}console.log("Actual image AGPL/MIT full notices and 5KiB tracker limits verified; decimal 5KB status reported separately.");'
node --import tsx scripts/ops-lifecycle-api.ts seed ".baize/$COMPOSE_PROJECT_NAME-state.json"
node --import tsx scripts/ops-lifecycle-api.ts queue-export ".baize/$COMPOSE_PROJECT_NAME-state.json"
docker compose exec -T app node --import tsx scripts/ops-maintenance.ts
node --import tsx scripts/ops-lifecycle-api.ts verify-export ".baize/$COMPOSE_PROJECT_NAME-state.json"
docker compose exec -T app node -e 'const fs=require("node:fs");fs.mkdirSync("/app/data/geoip",{recursive:true});fs.writeFileSync("/app/data/geoip/restore-fixture.txt","snapshot-file-proof",{mode:0o600});'
scripts/backup.sh "backups/$COMPOSE_PROJECT_NAME"
[ ! -e "backups/$COMPOSE_PROJECT_NAME/master.key" ] || { echo "Plaintext key in DB backup!" >&2; exit 1; }
if tar -tzf "backups/$COMPOSE_PROJECT_NAME/app-data.tar.gz" | rg '(^|/)(master\.key|keyring|keys)(/|$)'; then echo "Keyring in data archive!" >&2; exit 1; fi
node --import tsx scripts/ops-lifecycle-api.ts delete ".baize/$COMPOSE_PROJECT_NAME-state.json"
# Missing and reset latest journals must reject BEFORE database creation.
invalid_db="baize_restore_invalid_${RANDOM}"
docker compose exec -T app node -e 'require("node:fs").renameSync("/app/data/tombstones.jsonl","/app/data/tombstones.test-hold")'
if scripts/restore.sh "backups/$COMPOSE_PROJECT_NAME" "$invalid_db"; then echo "Missing journal accepted!" >&2; exit 1; fi
docker compose exec -T app node -e 'require("node:fs").writeFileSync("/app/data/tombstones.jsonl","")'
if scripts/restore.sh "backups/$COMPOSE_PROJECT_NAME" "$invalid_db"; then echo "Reset journal accepted!" >&2; exit 1; fi
invalid_exists="$(docker compose exec -T postgres psql -U baize -d postgres -Atc "SELECT count(*) FROM pg_database WHERE datname='$invalid_db'")"
[ "$invalid_exists" = 0 ] || { echo "Invalid restore created database!" >&2; exit 1; }
docker compose exec -T app node -e 'const fs=require("node:fs");fs.unlinkSync("/app/data/tombstones.jsonl");fs.renameSync("/app/data/tombstones.test-hold","/app/data/tombstones.jsonl")'
restore_db="baize_restore_${RANDOM}"
scripts/restore.sh "backups/$COMPOSE_PROJECT_NAME" "$restore_db"
restored_events="$(docker compose exec -T postgres psql -U baize -d "$restore_db" -Atc "SELECT count(*) FROM events")"
[ "$restored_events" = 0 ] || { echo "Deleted visitor resurrected!" >&2; exit 1; }
restored_tombstones="$(docker compose exec -T postgres psql -U baize -d "$restore_db" -Atc "SELECT count(*) FROM tombstones")"
[ "$restored_tombstones" = 1 ] || { echo "Deletion replay missing!" >&2; exit 1; }
docker run --rm --mount "type=volume,src=${COMPOSE_PROJECT_NAME}_${restore_db}_app_data,dst=/target,readonly" --entrypoint node baize-analytics:local -e 'const fs=require("node:fs"),assert=require("node:assert/strict");assert.equal(fs.readFileSync("/target/geoip/restore-fixture.txt","utf8"),"snapshot-file-proof");if(fs.existsSync("/target/exports"))assert.equal(fs.readdirSync("/target/exports").length,0);console.log("Fresh target data volume restored asset fixture and purged revoked export files.")'

bash scripts/ops-restore-failure-test.sh "backups/$COMPOSE_PROJECT_NAME"

./upgrade.sh baize-analytics:local
# Health failure exercises full database+image rollback.
if ./upgrade.sh baize-missing-image:must-not-exist; then
  echo 'Missing-image upgrade unexpectedly succeeded' >&2; exit 1
fi
bash scripts/ops-upgrade-failure-test.sh
docker compose exec -T postgres psql -U baize -d baize -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM schema_migrations;'
docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)})"
