#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
backup_dir="${1:?Usage: scripts/restore.sh BACKUP_DIR NEW_DATABASE}"
new_db="${2:?A new database name is mandatory; existing databases are never replaced.}"
[[ "$new_db" =~ ^baize_restore_[a-zA-Z0-9_]+$ ]] || { echo 'Use a baize_restore_ prefixed database name.' >&2; exit 1; }
(cd "$backup_dir" && sha256sum -c SHA256SUMS)
[ "$(sha256sum .baize/master.key | cut -d' ' -f1)" = "$(cat "$backup_dir/master-key.sha256")" ] || { echo 'Backup uses another master key; restore into an isolated stack with the backup key.' >&2; exit 1; }
key_package="${BAIZE_KEY_RESTORE_DIR:-$(cat "$backup_dir/key-package.ref")}"
(cd "$key_package" && sha256sum -c SHA256SUMS)
restore_dir="$(mktemp -d "$PWD/.baize/restore-check.XXXXXX")"
trap 'rm -rf "$restore_dir"' EXIT
# Fail before creating ANY target if independent latest deletion state is absent,
# truncated, reset, corrupted, or older than the database snapshot journal.
docker compose cp app:/app/data/tombstones.jsonl "$restore_dir/tombstones.jsonl"
docker compose cp app:/app/data/tombstones.watermark.json "$restore_dir/tombstones.watermark.json"
node scripts/ops-validate-journal.mjs "$restore_dir/tombstones.jsonl" "$restore_dir/tombstones.watermark.json" "$backup_dir/tombstones.jsonl"
exists="$(docker compose exec -T postgres psql -U baize -d postgres -Atc "SELECT count(*) FROM pg_database WHERE datname='$new_db'")"
[ "$exists" = 0 ] || { echo 'Target already exists; refusing overwrite.' >&2; exit 1; }
project="${COMPOSE_PROJECT_NAME:-baize-analytics}"
[[ "$project" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo 'Unsafe project name' >&2; exit 1; }
volume="${project}_${new_db}_app_data"
keys_volume="${project}_${new_db}_app_keys"
for target in "$volume" "$keys_volume"; do
  if docker volume inspect "$target" >/dev/null 2>&1; then echo 'Target volume already exists; refusing overwrite.' >&2; exit 1; fi
done
tar -xzf "$backup_dir/app-data.tar.gz" -C "$restore_dir"
cp "$backup_dir/tombstones.jsonl" "$restore_dir/restore-backup-tombstones.jsonl"
docker volume create --label "baize.restore.database=$new_db" "$volume" >/dev/null
docker volume create --label "baize.restore.database=$new_db" "$keys_volume" >/dev/null
image="$(docker compose images -q app)"
app_uid_gid="$(docker inspect "$(docker compose ps --all -q app)" --format '{{.Config.User}}')"
[[ "$app_uid_gid" =~ ^[0-9]+:[0-9]+$ ]] || { echo "Cannot determine application volume ownership" >&2; exit 1; }
docker run --rm --user 0 --entrypoint node \
  --mount "type=volume,src=$volume,dst=/target" \
  --mount "type=volume,src=$keys_volume,dst=/target-keys" \
  --mount "type=bind,src=$restore_dir,dst=/snapshot,readonly" \
  --mount "type=bind,src=$(realpath "$key_package")/keyring,dst=/snapshot-keys,readonly" \
  --env "RESTORE_UID=${app_uid_gid%:*}" --env "RESTORE_GID=${app_uid_gid#*:}" "$image" -e '
const fs=require("node:fs"),path=require("node:path");
for(const name of fs.readdirSync("/snapshot/app-data"))fs.cpSync(path.join("/snapshot/app-data",name),path.join("/target",name),{recursive:true});
for(const name of ["tombstones.jsonl","tombstones.watermark.json","restore-backup-tombstones.jsonl"])fs.copyFileSync(path.join("/snapshot",name),path.join("/target",name));
for(const name of fs.readdirSync("/snapshot-keys"))fs.cpSync(path.join("/snapshot-keys",name),path.join("/target-keys",name),{recursive:true});
function own(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())own(file);fs.chownSync(file,+process.env.RESTORE_UID,+process.env.RESTORE_GID);}fs.chownSync(dir,+process.env.RESTORE_UID,+process.env.RESTORE_GID);}
own("/target");own("/target-keys");fs.chmodSync("/target",0o700);fs.chmodSync("/target-keys",0o700);
'
docker compose exec -T postgres createdb -U baize "$new_db"
docker compose exec -T postgres pg_restore -U baize -d "$new_db" --exit-on-error --no-owner < "$backup_dir/database.dump"
docker compose run --rm --no-deps --entrypoint node \
  --env "RESTORE_DATABASE=$new_db" --env DATA_DIR=/restore-data --env KEYS_DIR=/restore-keys \
  --env REQUIRE_DELETION_JOURNAL=1 \
  --volume "$volume:/restore-data" --volume "$keys_volume:/restore-keys" app --import tsx scripts/restore-runtime.ts
mkdir -p .baize/restores
printf '{"database":"%s","dataVolume":"%s","keysVolume":"%s","trafficSwitched":false}\n' "$new_db" "$volume" "$keys_volume" > ".baize/restores/$new_db.json"
printf 'Restored %s with independent target data/key volumes; deletion journal verified and replayed. No production traffic switched.\n' "$new_db"
