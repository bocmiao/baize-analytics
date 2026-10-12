#!/usr/bin/env bash
set -euo pipefail
release_root="$(cd "$(dirname "$0")/.." && pwd -P)"
cd "$release_root"
if [ "$#" -ne 2 ] || [ "$1" != --env-file ]; then echo 'Usage: release-start.sh --env-file ABSOLUTE_PRIVATE_ENV' >&2; exit 1; fi
case "$2" in /*) ;; *) echo 'Environment file must use an absolute path.' >&2; exit 1;; esac
if [ -x "$release_root/runtime/bin/node" ]; then runtime_node="$release_root/runtime/bin/node"; else runtime_node="$(command -v node)"; fi
"$runtime_node" -e 'if(Number(process.versions.node.split(".")[0])<24){console.error("Node.js 24 or later required.");process.exit(1)}'
"$runtime_node" dist/server/src/release/preflight.js --env-check "$2"
export BAIZE_ENV_FILE="$2"
export BAIZE_NATIVE_RUNTIME=1
"$runtime_node" --env-file="$2" dist/server/src/release/preflight.js start
profile="$("$runtime_node" -e 'console.log(JSON.parse(require("node:fs").readFileSync("release-manifest.json","utf8")).profile)')"
if [ "$profile" = standard ]; then exec "$runtime_node" --env-file="$2" dist/server/src/server/main.js; fi
if [ "$profile" = lite ]; then exec "$runtime_node" --env-file="$2" dist/server/src/lite/main.js; fi
exit 1
