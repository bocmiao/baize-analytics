#!/usr/bin/env bash
# GitHub PRIVATE main is authoritative. CNB is a one-way PRIVATE mirror.
set -euo pipefail
set +x
: "${CNB_MIRROR_URL:?Configure the approved private CNB HTTPS repository URL}"
: "${GH_SOURCE_TOKEN:?Supply an existing read-only GitHub credential}"
CNB_MIRROR_TOKEN="${CNB_MIRROR_TOKEN:-${CNB_TOKEN:-}}"
export CNB_MIRROR_TOKEN
: "${CNB_MIRROR_TOKEN:?Supply an existing CNB mirror write credential; CNB_TOKEN fallback permission is not assumed}"
[[ "$CNB_MIRROR_URL" =~ ^https://cnb\.cool/[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)+/?$ ]] || { echo 'CNB mirror must be a credential-free cnb.cool HTTPS URL' >&2; exit 2; }
work="$(mktemp -d "${TMPDIR:-/tmp}/baize-cnb-sync.XXXXXX")"
trap 'rm -rf "$work"' EXIT
umask 077
cat > "$work/credential-helper" <<'HELPER'
#!/usr/bin/env bash
set +x
host=''; while IFS='=' read -r key value; do [ -n "$key" ] || break; [ "$key" != host ] || host="$value"; done
[ "${1:-}" = get ] || exit 0
case "$host" in github.com) printf 'username=x-access-token\npassword=%s\n' "$GH_SOURCE_TOKEN";; cnb.cool) printf 'username=%s\npassword=%s\n' "${CNB_MIRROR_USERNAME:-cnb}" "$CNB_MIRROR_TOKEN";; *) exit 1;; esac
HELPER
chmod 700 "$work/credential-helper"
export GIT_TERMINAL_PROMPT=0
git init --quiet "$work/repo"
cd "$work/repo"
git config credential.helper ''
git config --add credential.helper "!$work/credential-helper"
git remote add source https://github.com/bocmiao/baize-analytics.git
git remote add mirror "$CNB_MIRROR_URL"
git fetch --quiet source refs/heads/main:refs/heads/main
new_sha="$(git rev-parse main)"
# A successful all-refs read distinguishes a genuinely empty repository from
# authentication/network failure or a nonempty repository lacking main.
git ls-remote --refs mirror > "$work/target-refs" || { echo 'Mirror refs unavailable; refusing bootstrap or update.' >&2; exit 1; }
if [ ! -s "$work/target-refs" ]; then
 [ "${SYNC_BOOTSTRAP_EMPTY:-0}" = 1 ] || { echo 'Empty mirror requires explicit SYNC_BOOTSTRAP_EMPTY=1.' >&2; exit 1; }
else
 awk '$2=="refs/heads/main" {found=1} END {exit !found}' "$work/target-refs" || { echo 'Nonempty mirror lacks main; refusing bootstrap.' >&2; exit 1; }
 git fetch --quiet mirror refs/heads/main:refs/remotes/mirror/main
 old_sha="$(git rev-parse refs/remotes/mirror/main)"
 if [ "$old_sha" = "$new_sha" ]; then echo "Mirror unchanged at $new_sha; regular CI skipped."; exit 0; fi
 git merge-base --is-ancestor "$old_sha" "$new_sha" || { echo 'Mirror history diverged; refusing non-fast-forward update.' >&2; exit 1; }
fi
git push --quiet mirror refs/heads/main:refs/heads/main
printf 'Private mirror fast-forwarded to %s\n' "$new_sha"
if [ "${SYNC_RUN_REGULAR_CI:-0}" = 1 ]; then
 git checkout --quiet main
 bash scripts/ci-common.sh regular
fi
