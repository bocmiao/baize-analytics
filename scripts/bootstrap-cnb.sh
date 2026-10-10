#!/usr/bin/env bash
# Paste this complete script into the authorized empty-repository vscode terminal.
set -euo pipefail
set +x
[ "${CNB_BRANCH:-}" = main ] || { echo 'Bootstrap requires CNB_BRANCH=main' >&2; exit 1; }
: "${GH_SOURCE_TOKEN:?Owner-scoped imported GitHub read credential required}"
: "${CNB_TOKEN:?Trusted vscode repo-code:rw built-in input required}"
work="$(mktemp -d "${TMPDIR:-/tmp}/baize-cnb-bootstrap.XXXXXX")"
trap 'rm -rf "$work"' EXIT
umask 077
cat > "$work/github-helper" <<'HELPER'
#!/usr/bin/env bash
set +x
host='';while IFS='=' read -r key value;do [ -n "$key" ] || break;[ "$key" != host ] || host="$value";done
[ "${1:-}" = get ] || exit 0
[ "$host" = github.com ] || exit 1
printf 'username=x-access-token\npassword=%s\n' "$GH_SOURCE_TOKEN"
HELPER
chmod 700 "$work/github-helper"
export GIT_TERMINAL_PROMPT=0
git init --quiet "$work/source"
git -C "$work/source" config credential.helper ''
git -C "$work/source" config --add credential.helper "!$work/github-helper"
git -C "$work/source" remote add source https://github.com/bocmiao/baize-analytics.git
git -C "$work/source" fetch --quiet source refs/heads/main:refs/heads/main
git -C "$work/source" checkout --quiet main
cd "$work/source"
CNB_MIRROR_URL=https://cnb.cool/bankermiao/baize-analytics SYNC_BOOTSTRAP_EMPTY=1 SYNC_RUN_REGULAR_CI=0 bash scripts/sync-main-cnb.sh
