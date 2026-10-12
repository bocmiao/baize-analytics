#!/usr/bin/env bash
set -euo pipefail
release_root="$(cd "$(dirname "$0")/.." && pwd -P)"
cd "$release_root"
if [ "$#" -lt 3 ] || [ "$1" != --env-file ]; then echo 'Usage: release-ops.sh --env-file ABSOLUTE_PRIVATE_ENV COMMAND ARGS...' >&2; exit 1; fi
case "$2" in /*) ;; *) echo 'Environment file must use an absolute path.' >&2; exit 1;; esac
private_env="$2"
shift 2
if [ -x "$release_root/runtime/bin/node" ]; then runtime_node="$release_root/runtime/bin/node"; else runtime_node="$(command -v node)"; fi
"$runtime_node" -e 'if(Number(process.versions.node.split(".")[0])<24){console.error("Node.js 24 or later required.");process.exit(1)}'
"$runtime_node" dist/server/src/release/preflight.js --env-check "$private_env"
export BAIZE_ENV_FILE="$private_env"
"$runtime_node" --env-file="$private_env" dist/server/src/release/preflight.js ops
profile="$("$runtime_node" -e 'console.log(JSON.parse(require("node:fs").readFileSync("release-manifest.json","utf8")).profile)')"
if [ "$profile" = lite ]; then exec "$runtime_node" --env-file="$private_env" dist/server/scripts/lite-ops.js "$@"; fi
if [ "$profile" = standard ]; then exec "$runtime_node" --env-file="$private_env" dist/server/src/release/standard-ops.js "$@"; fi
exit 1
