#!/usr/bin/env bash
set -euo pipefail
# Called by an installer using its own Compose files. Non-empty volumes are never
# changed; an unsafe existing installation needs an explicit operator repair.
runtime_owner="$(docker compose "$@" run --rm --no-deps --entrypoint node app -e 'process.stdout.write(process.getuid()+":"+process.getgid())')"
[[ "$runtime_owner" =~ ^[0-9]+:[0-9]+$ ]] || { echo 'Runtime owner check failed.' >&2; exit 1; }
docker compose "$@" run --rm --no-deps --user 0 --env "BAIZE_VOLUME_OWNER=$runtime_owner" --entrypoint node app -e 'const fs=require("node:fs"),[uid,gid]=process.env.BAIZE_VOLUME_OWNER.split(":").map(Number);for(const dir of ["/app/data","/app/keys"]){const stat=fs.lstatSync(dir);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error("VOLUME_DIRECTORY_UNTRUSTED");if(fs.readdirSync(dir).length===0){fs.chownSync(dir,uid,gid);fs.chmodSync(dir,0o700);}else if(stat.uid!==uid||stat.mode&0o077){throw Error("EXISTING_VOLUME_REQUIRES_OPERATOR_REPAIR");}}'
