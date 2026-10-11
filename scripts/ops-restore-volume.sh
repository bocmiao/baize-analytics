#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
backup_dir="${1:?Backup directory required}"
image="${2:?Prior image required}"
(cd "$backup_dir" && sha256sum -c SHA256SUMS >&2)
app_container="$(docker compose ps --all -q app)"
[ -n "$app_container" ] || { echo 'Installed app container required to determine volume ownership.' >&2; exit 1; }
app_uid_gid="$(docker inspect "$app_container" --format '{{.Config.User}}')"
[[ "$app_uid_gid" =~ ^[0-9]+:[0-9]+$ ]] || { echo 'Cannot determine application volume ownership.' >&2; exit 1; }
restore_dir="$(mktemp -d "$PWD/.baize/volume-restore.XXXXXX")"
trap 'rm -rf "$restore_dir"' EXIT
tar -xzf "$backup_dir/app-data.tar.gz" -C "$restore_dir"
# Application is stopped. Reconcile only its own named volume; independent
# current deletion journal survives, so a deleted visitor cannot resurrect.
BAIZE_IMAGE="$image" docker compose run --rm --no-deps --user 0 --entrypoint node \
  --volume "$restore_dir/app-data:/restore-data:ro" \
  --volume "$PWD/scripts/ops-restore-volume.mjs:/restore-helper.mjs:ro" \
  --env "RESTORE_UID=${app_uid_gid%:*}" --env "RESTORE_GID=${app_uid_gid#*:}" app --input-type=module -e '
import {restoreVolumeFiles} from "/restore-helper.mjs";
restoreVolumeFiles("/restore-data","/app/data",+process.env.RESTORE_UID,+process.env.RESTORE_GID);
'
