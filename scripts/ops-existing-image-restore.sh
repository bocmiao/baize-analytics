#!/usr/bin/env bash
set -euo pipefail
umask 077
script_repository=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
: "${APP_ROOT:?Immutable source archive required}"
: "${FROZEN_SOURCE_SHA:?Exact source commit required}"
: "${BAIZE_IMAGE:?Existing exact image ID required}"
: "${OPS_EVIDENCE_DIR:?New evidence directory required}"
: "${INSTALL_EVIDENCE_DIR:?Earlier actual installer evidence required}"
: "${TEST_DATABASE_URL:?Existing authorized PG fixture URL required}"
: "${CLICKHOUSE_TEST_URL:?Existing authorized source CH fixture URL required}"
: "${BAIZE_OPS_POSTGRES_CONTAINER:?Existing authorized PG container required}"
[ "${BAIZE_SERIAL_RESOURCE_GATE:-0}" = 1 ] || { echo 'Root serial resource gate required' >&2; exit 1; }
[[ "$FROZEN_SOURCE_SHA" =~ ^[a-f0-9]{40}$ ]]
[ ! -e "$OPS_EVIDENCE_DIR" ] || { echo 'Refusing overwrite of existing evidence' >&2; exit 1; }
mkdir -m 700 "$OPS_EVIDENCE_DIR"
cd "$APP_ROOT"
docker_root=$(docker info --format '{{.DockerRootDir}}')
floor(){ local path free; for path in "$APP_ROOT" "$OPS_EVIDENCE_DIR" /workspace "$docker_root"; do free=$(df -Pk "$path" | awk 'NR==2{printf "%.0f",$4*1024}'); [ "$free" -ge 2147483648 ] || { echo '2GiB disk floor reached' >&2; return 1; }; done; df -Pk "$APP_ROOT" /workspace "$docker_root" >> "$OPS_EVIDENCE_DIR/disk.txt"; }
floor
SOURCE_REPOSITORY="${SOURCE_REPOSITORY:-$script_repository}" python3 scripts/benchmark/verify-archive-binding.py > "$OPS_EVIDENCE_DIR/git-blob-binding.json"
node scripts/ops-artifact-manifest.mjs > "$OPS_EVIDENCE_DIR/source.sha256"
actual_image=$(docker image inspect "$BAIZE_IMAGE" --format '{{.Id}}')
[[ "$BAIZE_IMAGE" = "$actual_image" ]] || { echo 'Use the exact immutable sha256 image ID' >&2; exit 1; }
docker run --rm --entrypoint node "$BAIZE_IMAGE" scripts/ops-artifact-manifest.mjs > "$OPS_EVIDENCE_DIR/image.sha256"
diff -u "$OPS_EVIDENCE_DIR/source.sha256" "$OPS_EVIDENCE_DIR/image.sha256" > "$OPS_EVIDENCE_DIR/source-image.diff"
# These are prior observations, not a new installer run.
INSTALL_EVIDENCE_DIR="$INSTALL_EVIDENCE_DIR" node --input-type=module -e 'import fs from "node:fs";import assert from "node:assert/strict";import crypto from "node:crypto";const d=process.env.INSTALL_EVIDENCE_DIR,b=JSON.parse(fs.readFileSync(d+"/git-blob-binding.json","utf8")),log=fs.readFileSync(d+"/install-build.txt","utf8");assert.equal(b.sourceCommit,process.env.FROZEN_SOURCE_SHA);assert(log.includes("-app-1  Healthy")&&log.includes("Baize is listening locally."));console.log(JSON.stringify({sourceCommit:b.sourceCommit,installerPreviouslyHealthy:true,newInstallerRun:false,installerLogSha256:crypto.createHash("sha256").update(log).digest("hex")}));' > "$OPS_EVIDENCE_DIR/prior-installer.safe.json"
docker run --rm -e BAIZE_COVERAGE_SELECTED_RUNS=1 -e BAIZE_FACT_PUBLICATION_CONCURRENCY=2 --entrypoint node "$BAIZE_IMAGE" --input-type=module -e 'import assert from "node:assert/strict";import {factCoverageMetadataDigest} from "./dist/server/src/server/fact-coverage-witness.js";import {settleFactPublicationUploads} from "./dist/server/src/server/fact-publication-pipeline.js";assert.equal(typeof factCoverageMetadataDigest,"function");assert.equal(process.env.BAIZE_COVERAGE_SELECTED_RUNS,"1");let n=0;await settleFactPublicationUploads([async()=>{n++},async()=>{n++}]);assert.equal(n,2);console.log(JSON.stringify({compiledImports:true,explicitSelectedRunFlag:1,explicitPublicationConcurrency:2,scope:"compiled import/helper only; native restore remains original source entry"}));' > "$OPS_EVIDENCE_DIR/compiled-imports.txt"
floor
name="baize_restore_target_${FROZEN_SOURCE_SHA:0:12}_$$"
volume="${name}_data"
created_volume=0
cleanup(){ status=$?; if docker inspect "$name" >/dev/null 2>&1; then docker logs "$name" > "$OPS_EVIDENCE_DIR/target-log.txt" 2>&1 || true; docker rm -f "$name" > "$OPS_EVIDENCE_DIR/target-cleanup.txt" 2>&1 || true; fi; if [ "$created_volume" = 1 ]; then docker volume rm "$volume" >> "$OPS_EVIDENCE_DIR/target-cleanup.txt" 2>&1 || true; fi; printf '%s\n' "$status" > "$OPS_EVIDENCE_DIR/exit.txt"; }
trap cleanup EXIT
ch_image='clickhouse/clickhouse-server@sha256:87e0a5b72f5465b18eacca7c76850e7ff551c9795c50e451f5646299e5e24146'
docker image inspect "$ch_image" >/dev/null
[ -z "$(docker ps -aq --filter name="^/${name}$")" ]
if docker volume inspect "$volume" >/dev/null 2>&1; then echo 'Target volume already exists' >&2; exit 1; fi
docker volume create --label baize.ops.existing-image-target=true "$volume" > "$OPS_EVIDENCE_DIR/target-volume.txt"; created_volume=1
docker run -d --name "$name" --network bridge --mount "type=volume,src=$volume,dst=/var/lib/clickhouse" -e CLICKHOUSE_USER=baize -e CLICKHOUSE_PASSWORD=local-test-only -e CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT=1 "$ch_image" > "$OPS_EVIDENCE_DIR/target-container.txt"
ports=$(docker inspect "$name" --format '{{json .HostConfig.PortBindings}}'); [ "$ports" = '{}' ] || [ "$ports" = null ]
ip=$(docker inspect "$name" --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
export BAIZE_OPS_TARGET_CLICKHOUSE_URL="http://$ip:8123"
node --input-type=module -e 'const u=process.env.BAIZE_OPS_TARGET_CLICKHOUSE_URL;let ready=false;for(let i=0;i<120;i++){try{const r=await fetch(u+"/ping",{signal:AbortSignal.timeout(1000)});if(r.ok){ready=true;break}}catch{}await new Promise(resolve=>setTimeout(resolve,1000))}if(!ready)throw Error("Independent target CH startup failed");'
floor
BAIZE_COVERAGE_SELECTED_RUNS=1 node --import tsx scripts/ops-canonical-entry-test.ts > "$OPS_EVIDENCE_DIR/native-entry.txt" 2>&1
floor
BAIZE_IMAGE="$actual_image" node --input-type=module -e 'console.log(JSON.stringify({exit:0,sourceCommit:process.env.FROZEN_SOURCE_SHA,imageId:process.env.BAIZE_IMAGE,existingImageManifestVerified:true,newBuild:false,scope:"prior actual installer plus compiled imports and original independent native signed restore; not a repeated full lifecycle matrix"}));' > "$OPS_EVIDENCE_DIR/result.json"
