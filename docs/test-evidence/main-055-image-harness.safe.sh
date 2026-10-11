#!/usr/bin/env bash
set -euo pipefail
: "${APP_ROOT:?Root must provide immutable artifact}"
: "${FROZEN_SOURCE_SHA:?Root must provide exact committed SHA}"
: "${BAIZE_OPS_POSTGRES_CONTAINER:?Explicit authorized local fixture PG}"
: "${TEST_DATABASE_URL:?Explicit isolated fixture source PG URL}"
: "${CLICKHOUSE_TEST_URL:?Explicit local fixture source CH URL}"
[[ "$FROZEN_SOURCE_SHA" =~ ^[a-f0-9]{40}$ ]]
cd "$APP_ROOT"
log_dir="${OPS_EVIDENCE_DIR:-/tmp/baize-round2-$FROZEN_SOURCE_SHA}"
mkdir -p "$log_dir"
project="baize_round2_${FROZEN_SOURCE_SHA:0:12}"
export COMPOSE_PROJECT_NAME="$project" BAIZE_PORT=3199 PUBLIC_URL=http://127.0.0.1:3199
free_gate(){ local free; free=$(df -Pk "$APP_ROOT" | awk 'NR==2{print $4*1024}'); [ "${free%.*}" -ge 2147483648 ] || { echo '2GiB disk floor reached' >&2; return 1; }; }
cleanup(){ docker compose logs --no-color > "$log_dir/services.txt" 2>&1 || true; docker compose down -v --remove-orphans > "$log_dir/cleanup.txt" 2>&1 || true; }
trap cleanup EXIT
free_gate
node scripts/ops-artifact-manifest.mjs > "$log_dir/source.sha256"
sha256sum Dockerfile package-lock.json > "$log_dir/build-input.sha256"
# Exactly known migration files, not a numerical maximum masquerading as a count.
for migration in 050_intake_bot_observations 051_seo_evidence_v2 052_gsc_import_metadata 053_site_annotations 054_fact_member_batch_indexes 055_fact_response_budget; do test -f "db/migrations/$migration.sql"; done
find db/migrations -maxdepth 1 -name '*.sql' -printf '%f\n' | sort > "$log_dir/migrations.txt"
[ "$(wc -l < "$log_dir/migrations.txt")" -eq 56 ]
./install.sh > "$log_dir/install-build.txt" 2>&1
docker compose exec -T app node scripts/ops-artifact-manifest.mjs > "$log_dir/image.sha256"
diff -u "$log_dir/source.sha256" "$log_dir/image.sha256" > "$log_dir/source-image.diff"
docker compose images -q app > "$log_dir/image.id"
docker compose exec -T app node --input-type=module -e 'import assert from "node:assert/strict";import {configuredStatsReadLimits} from "./dist/server/src/server/stats-read-budget.js";const limits=configuredStatsReadLimits();assert.deepEqual(limits,{deadlineMs:120000,maxSelects:20000,maxDecodedBytes:2147483648});console.log(JSON.stringify(limits));' > "$log_dir/stats-budget-configured.txt"

docker compose exec -T postgres psql -U baize -d baize -v ON_ERROR_STOP=1 -Atc "SELECT count(*) FROM schema_migrations WHERE version='054_fact_member_batch_indexes.sql'" > "$log_dir/migration-054-installed.txt"
[ "$(cat "$log_dir/migration-054-installed.txt")" = 1 ]
docker compose exec -T postgres psql -U baize -d baize -v ON_ERROR_STOP=1 -Atc "SELECT count(*) FROM pg_index i JOIN pg_class x ON x.oid=i.indexrelid JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND ((x.relname='analytics_fact_store_members_batch_key' AND t.relname='analytics_fact_store_members') OR (x.relname='analytics_remaining_fact_members_batch_key' AND t.relname='analytics_remaining_fact_members')) AND i.indisvalid AND i.indisready AND NOT i.indisunique AND i.indpred IS NULL AND i.indexprs IS NULL AND pg_get_indexdef(i.indexrelid) LIKE '%(batch_id, row_key)'" > "$log_dir/index-054-installed.txt"
[ "$(cat "$log_dir/index-054-installed.txt")" = 2 ]
docker compose exec -T postgres psql -U baize -d baize -v ON_ERROR_STOP=1 > "$log_dir/migration-055-constraints.txt" 2>&1 <<'SQL'
DO $check$
DECLARE definition text; rejected integer:=0;
BEGIN
 IF (SELECT count(*) FROM schema_migrations WHERE version='055_fact_response_budget.sql')<>1 THEN RAISE EXCEPTION '055 receipt missing'; END IF;
 IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='analytics_fact_store_batches' AND ((column_name='response_byte_upper_bound' AND data_type='bigint') OR (column_name='response_bound_seal' AND data_type='text')) AND is_nullable='YES')<>2 THEN RAISE EXCEPTION '055 columns wrong'; END IF;
 SELECT pg_get_constraintdef(oid) INTO definition FROM pg_constraint WHERE conname='analytics_fact_response_bound_pair' AND conrelid='public.analytics_fact_store_batches'::regclass AND contype='c' AND convalidated;
 IF definition IS NULL THEN RAISE EXCEPTION '055 validated constraint missing'; END IF;
 CREATE TEMP TABLE ops_response_bound_probe(response_byte_upper_bound bigint,response_bound_seal text) ON COMMIT DROP;
 EXECUTE 'ALTER TABLE ops_response_bound_probe ADD CONSTRAINT copied_055 '||definition;
 INSERT INTO ops_response_bound_probe VALUES(NULL,NULL),(44548,repeat('a',64)),(16777216,repeat('f',64));
 BEGIN INSERT INTO ops_response_bound_probe VALUES(NULL,repeat('a',64)); EXCEPTION WHEN check_violation THEN rejected:=rejected+1; END;
 BEGIN INSERT INTO ops_response_bound_probe VALUES(44548,NULL); EXCEPTION WHEN check_violation THEN rejected:=rejected+1; END;
 BEGIN INSERT INTO ops_response_bound_probe VALUES(44547,repeat('a',64)); EXCEPTION WHEN check_violation THEN rejected:=rejected+1; END;
 BEGIN INSERT INTO ops_response_bound_probe VALUES(16777217,repeat('a',64)); EXCEPTION WHEN check_violation THEN rejected:=rejected+1; END;
 BEGIN INSERT INTO ops_response_bound_probe VALUES(44548,repeat('A',64)); EXCEPTION WHEN check_violation THEN rejected:=rejected+1; END;
 IF rejected<>5 THEN RAISE EXCEPTION '055 invalid pair accepted'; END IF;
 RAISE NOTICE '055 receipt/nullable bigint+text columns/validated pair constraint: 3 valid, 5 invalid tested';
END $check$;
SQL


docker compose exec -T app node --input-type=module -e 'import fs from "node:fs";import assert from "node:assert/strict";const mit=fs.readFileSync("packages/tracker/LICENSE","utf8").trim();assert.equal(fs.readFileSync("public/tracker.LICENSE.txt","utf8").trim(),mit);const agpl=fs.readFileSync("LICENSE","utf8");assert(agpl.includes("GNU AFFERO GENERAL PUBLIC LICENSE"));assert.equal(fs.readFileSync("plugins/wordpress/LICENSE","utf8"),agpl);for(const n of ["tracker","tracker-min"]){assert(fs.readFileSync("public/"+n+".js","utf8").includes(mit));const bytes=fs.statSync("public/"+n+".js.gz").size;assert(bytes<=5120);console.log(JSON.stringify({tracker:n,gzipBytes:bytes,within5KiB:true,withinDecimal5KB:bytes<=5000}));}' > "$log_dir/notices.txt"
node --import tsx scripts/ops-lifecycle-api.ts seed "$log_dir/state.json" > "$log_dir/http-seed.txt" 2>&1
# Add only owned isolated target CH service, using already-tested pinned digest.
cat > "$log_dir/target.yml" <<'YAML'
services:
  clickhouse-target:
    image: clickhouse/clickhouse-server:25.8-alpine@sha256:87e0a5b72f5465b18eacca7c76850e7ff551c9795c50e451f5646299e5e24146
    environment:
      CLICKHOUSE_USER: baize
      CLICKHOUSE_PASSWORD: local-test-only
      CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT: '1'
    volumes: [round2_target_data:/var/lib/clickhouse]
    healthcheck:
      test: [CMD-SHELL, 'clickhouse-client --user baize --password "$$CLICKHOUSE_PASSWORD" --query "SELECT 1" >/dev/null']
      interval: 5s
      timeout: 5s
      retries: 30
volumes:
  round2_target_data:
YAML
export COMPOSE_FILE="$APP_ROOT/docker-compose.yml:$log_dir/target.yml"
free_gate
docker compose up -d --no-build --wait --wait-timeout 180 clickhouse-target > "$log_dir/target-start.txt" 2>&1
target_id=$(docker compose ps -q clickhouse-target)
docker inspect --format '{{.Name}} {{json .HostConfig.PortBindings}} {{range .Mounts}}{{.Name}} {{end}}' "$target_id" > "$log_dir/target-isolation.txt"
ports=$(docker inspect --format '{{json .HostConfig.PortBindings}}' "$target_id")
PORT_BINDINGS="$ports" node --input-type=module -e 'const p=JSON.parse(process.env.PORT_BINDINGS);if(p&&Object.keys(p).length)throw Error("target ports published")'
target_ip=$(docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$target_id")
export BAIZE_OPS_TARGET_CLICKHOUSE_URL="http://$target_ip:8123"
node --import tsx scripts/ops-canonical-entry-test.ts > "$log_dir/native-entry.txt" 2>&1
printf '{"exit":0,"sourceCommit":"%s","scope":"new image installation and impacted signed restore; older unchanged fault matrices retain separate evidence"}\n' "$FROZEN_SOURCE_SHA" > "$log_dir/result.json"
