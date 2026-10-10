#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
new_image="${1:?Usage: ./upgrade.sh LOCAL_IMAGE_TAG}"
[[ "$new_image" =~ ^[a-zA-Z0-9][a-zA-Z0-9._/:@-]*$ ]] || { echo "Invalid image reference" >&2; exit 1; }
# Reject low-space upgrades before stopping the working application. Keep a
# bounded emergency reserve so diagnostic/journal writes can survive later ENOSPC.
minimum_bytes="${BAIZE_UPGRADE_MIN_FREE_BYTES:-2147483648}"
[[ "$minimum_bytes" =~ ^[0-9]+$ ]] || { echo 'Invalid upgrade disk threshold' >&2; exit 1; }
free_bytes="$(node -e 'const fs=require("node:fs"),s=fs.statfsSync(process.cwd(),{bigint:true});process.stdout.write(String(s.bavail*s.bsize))')"
[ "$free_bytes" -ge "$minimum_bytes" ] || { echo 'Insufficient free space for upgrade and rollback; application left running.' >&2; exit 1; }
reserve="$(mktemp "$PWD/.baize/upgrade-reserve.XXXXXX")"
if ! fallocate -l 134217728 "$reserve"; then rm -f "$reserve"; echo 'Cannot reserve rollback workspace; upgrade aborted before stopping application.' >&2; exit 1; fi
trap 'rm -f "$reserve"' EXIT
# Keep app stopped from snapshot until migration/health verification to eliminate
# concurrent writes. This is a downtime upgrade, not a claimed zero-downtime one.
old_image="$(docker compose images -q app)"
[ -n "$old_image" ] || { echo 'No installed app image.' >&2; exit 1; }
docker compose stop app
if ! backup_dir="$(scripts/backup.sh)"; then
  BAIZE_IMAGE="$old_image" docker compose up -d app
  echo "Recovery point failed; upgrade aborted." >&2
  exit 1
fi
rollback() {
  trap - ERR
  umask 077
  rm -f "$reserve"
  echo 'Upgrade failed; restoring schema/data and prior application image. Recovery point retained at:' "$backup_dir" >&2
  docker compose stop app || true
  journal_check="$(mktemp -d "$PWD/.baize/rollback-journal.XXXXXX")"
  docker compose cp app:/app/data/tombstones.jsonl "$journal_check/tombstones.jsonl"
  docker compose cp app:/app/data/tombstones.watermark.json "$journal_check/tombstones.watermark.json"
  node scripts/ops-validate-journal.mjs "$journal_check/tombstones.jsonl" "$journal_check/tombstones.watermark.json" "$backup_dir/tombstones.jsonl"
  rm -rf "$journal_check"
  rollback_proof=''
  if [ -f "$backup_dir/canonical/index.json" ]; then
    rollback_proof="$backup_dir/rollback-retention-proof.json"
    BAIZE_IMAGE="$old_image" docker compose run --rm --no-deps --entrypoint node app --import tsx scripts/replay-retention-proof-runtime.ts capture > "$rollback_proof"
    node -e 'const fs=require("node:fs");const fd=fs.openSync(process.argv[1],"r");fs.fsyncSync(fd);fs.closeSync(fd)' "$rollback_proof"
  fi
  docker compose exec -T postgres psql -U baize -d baize -v ON_ERROR_STOP=1 -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public AUTHORIZATION baize;'
  docker compose exec -T postgres pg_restore -U baize -d baize --exit-on-error --no-owner < "$backup_dir/database.dump"
  scripts/ops-restore-volume.sh "$backup_dir" "$old_image"
  if [ -n "$rollback_proof" ]; then
    docker compose cp "$rollback_proof" app:/app/data/rollback-retention-proof.json
    BAIZE_IMAGE="$old_image" docker compose run --rm --no-deps --user 0 --entrypoint node app -e 'const fs=require("node:fs"),p="/app/data/rollback-retention-proof.json";fs.chownSync(p,1000,1000);fs.chmodSync(p,0o600);const f=fs.openSync(p,"r");fs.fsyncSync(f);fs.closeSync(f);const d=fs.openSync("/app/data","r");fs.fsyncSync(d);fs.closeSync(d)'
  fi
  # Reconcile while the web application remains stopped. Never expose restored
  # queries before journal, CH physical deletion, privacy and rebuild verification.
  BAIZE_IMAGE="$old_image" docker compose run --rm --no-deps --env CANONICAL_SAME_DB_ROLLBACK=1 app node --import tsx scripts/restore-runtime.ts
  BAIZE_IMAGE="$old_image" docker compose up -d --wait --wait-timeout 120 app
}
trap 'rollback' ERR
docker image inspect "$new_image" >/dev/null
BAIZE_IMAGE="$new_image" docker compose run --rm --no-deps app npm run db:migrate
BAIZE_IMAGE="$new_image" docker compose up -d --wait --wait-timeout 120 app
docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)throw Error('health')})"
trap - ERR
# Persist only after validation, leaving existing environment values unchanged.
if grep -q '^BAIZE_IMAGE=' .env; then sed -i "s|^BAIZE_IMAGE=.*|BAIZE_IMAGE=$new_image|" .env; else printf '\nBAIZE_IMAGE=%s\n' "$new_image" >> .env; fi
printf 'Upgrade passed; recovery point: %s\n' "$backup_dir"
