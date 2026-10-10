#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
backup_dir="${1:?Backup directory required}"
image="${2:?Prior image required}"
(cd "$backup_dir" && sha256sum -c SHA256SUMS >&2)
restore_dir="$(mktemp -d "$PWD/.baize/volume-restore.XXXXXX")"
trap 'rm -rf "$restore_dir"' EXIT
tar -xzf "$backup_dir/app-data.tar.gz" -C "$restore_dir"
# Application is stopped. Reconcile only its own named volume; independent
# current deletion journal survives, so a deleted visitor cannot resurrect.
BAIZE_IMAGE="$image" docker compose run --rm --no-deps --entrypoint node \
  --volume "$restore_dir/app-data:/restore-data:ro" app -e '
const fs=require("node:fs"),path=require("node:path");
for(const entry of fs.readdirSync("/app/data"))if(!["tombstones.jsonl","tombstones.watermark.json"].includes(entry))fs.rmSync(path.join("/app/data",entry),{recursive:true,force:true});
for(const entry of fs.readdirSync("/restore-data"))if(!["tombstones.jsonl","tombstones.watermark.json"].includes(entry))fs.cpSync(path.join("/restore-data",entry),path.join("/app/data",entry),{recursive:true});
fs.copyFileSync("/restore-data/tombstones.jsonl","/app/data/restore-backup-tombstones.jsonl");
'
