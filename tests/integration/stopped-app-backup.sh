#!/usr/bin/env bash
set -euo pipefail
umask 077
source_repo="$(cd "$(dirname "$0")/../.." && pwd)"
root="$(mktemp -d /tmp/baize-stopped-backup.XXXXXX)"
git -C "$source_repo" archive HEAD | tar -x -C "$root"
cp "$source_repo/scripts/backup.sh" "$root/scripts/backup.sh"
cd "$root"
export COMPOSE_PROJECT_NAME="baize_stopped_backup_${RANDOM}_${RANDOM}"
export BAIZE_IMAGE="${TEST_BACKUP_IMAGE:?Set the existing compatible standard image; this test never builds}"
export BAIZE_UID="$(id -u)" BAIZE_GID="$(id -g)"
mkdir -p .baize
node -e 'require("fs").writeFileSync(".baize/master.key","11".repeat(32),{mode:384})'
printf 'POSTGRES_PASSWORD=synthetic-stopped-backup-only\nBAIZE_PORT=32981\n' > .env
cleanup(){ docker compose down -v --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker compose up -d --wait postgres redis
bash scripts/init-empty-volumes.sh
docker compose create app
# Actual journal and representative files; no API process starts.
docker compose run --rm --no-deps -T --entrypoint node app --import tsx --input-type=module -e 'import {initializeJournal} from "./src/server/deletion.ts";import fs from "node:fs";await initializeJournal("/app/data");for(const dir of ["/app/data","/app/keys"]){fs.mkdirSync(dir+"/nested",{mode:448});fs.writeFileSync(dir+"/install-nonce.json","synthetic-excluded",{mode:384});fs.writeFileSync(dir+"/nested/install-nonce.json","synthetic-excluded-nested",{mode:384});fs.writeFileSync(dir+"/keep.txt","retained-fixture",{mode:384});}'
before="$(docker compose run --rm --no-deps -T --entrypoint node app -e 'const f=require("fs");console.log(JSON.stringify(["/app/data","/app/keys"].map(p=>{let s=f.statSync(p);return {uid:s.uid,mode:s.mode&511}})))')"
bash scripts/backup.sh "$root/backup" > "$root/backup.private.log"
keydir="$(cat "$root/backup/key-package.ref")"
! find "$keydir" -name install-nonce.json | rg .
! tar -tzf "$root/backup/app-data.tar.gz" | rg '(^|/)install-nonce.json$'
test "$(cat "$keydir/keyring/keep.txt")" = retained-fixture
tar -xOf "$root/backup/app-data.tar.gz" app-data/keep.txt | cmp - <(printf retained-fixture)
after="$(docker compose run --rm --no-deps -T --entrypoint node app -e 'const f=require("fs");console.log(JSON.stringify(["/app/data","/app/keys"].map(p=>{let s=f.statSync(p);return {uid:s.uid,mode:s.mode&511}})))')"
test "$before" = "$after"
app_id="$(docker compose ps -aq app)"
test "$(docker inspect -f '{{.State.Running}}' "$app_id")" = false
(cd "$root/backup" && sha256sum -c SHA256SUMS >/dev/null)
printf '{"passed":true,"appNeverStarted":true,"rootAndNestedNonceExcluded":true,"sourceDirectoryMetadataUnchanged":true,"fixture":"%s"}\n' "$root"
