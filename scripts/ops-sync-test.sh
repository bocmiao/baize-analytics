#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d /tmp/baize-sync-test.XXXXXX)"
trap 'rm -rf "$work"' EXIT
git init -q -b main "$work/source"
git -C "$work/source" config user.name 'Local sync test'
git -C "$work/source" config user.email 'sync@example.invalid'
printf 'first\n' > "$work/source/test"
git -C "$work/source" add test
git -C "$work/source" -c commit.gpgsign=false commit -qm first
git clone -q --bare "$work/source" "$work/mirror"
# Process-local test URL mapping; file-only transport makes accidental network impossible.
export GIT_CONFIG_COUNT=2
export GIT_CONFIG_KEY_0="url.$work/source.insteadOf" GIT_CONFIG_VALUE_0=https://github.com/bocmiao/baize-analytics.git
export GIT_CONFIG_KEY_1="url.$work/mirror.insteadOf" GIT_CONFIG_VALUE_1=https://cnb.cool/local/test
export GIT_ALLOW_PROTOCOL=file CNB_MIRROR_URL=https://cnb.cool/local/test
export GH_SOURCE_TOKEN=local-test-not-a-credential CNB_MIRROR_TOKEN=local-test-not-a-credential
# True empty repository bootstrap is opt-in; tags-only repositories are not empty.
mkdir "$work/empty"
git init -q --bare "$work/empty"
export GIT_CONFIG_KEY_1="url.$work/empty.insteadOf"
if bash "$root/scripts/sync-main-cnb.sh" > "$work/no-opt-in.log" 2>&1; then echo 'Implicit empty bootstrap accepted' >&2; exit 1; fi
SYNC_BOOTSTRAP_EMPTY=1 bash "$root/scripts/sync-main-cnb.sh" > "$work/bootstrap.log"
[ "$(git -C "$work/empty" rev-parse main)" = "$(git -C "$work/source" rev-parse main)" ]
git -C "$work/empty" update-ref refs/tags/non-main "$(git -C "$work/empty" rev-parse main)"
git -C "$work/empty" update-ref -d refs/heads/main
if SYNC_BOOTSTRAP_EMPTY=1 bash "$root/scripts/sync-main-cnb.sh" > "$work/non-main.log" 2>&1; then echo 'Nonempty missing-main bootstrap accepted' >&2; exit 1; fi
export GIT_CONFIG_KEY_1="url.$work/not-existing.insteadOf"
if SYNC_BOOTSTRAP_EMPTY=1 bash "$root/scripts/sync-main-cnb.sh" > "$work/unavailable.log" 2>&1; then echo 'Unavailable mirror accepted' >&2; exit 1; fi
export GIT_CONFIG_KEY_1="url.$work/mirror.insteadOf"
bash "$root/scripts/sync-main-cnb.sh" > "$work/unchanged.log"
rg 'regular CI skipped' "$work/unchanged.log" >/dev/null
printf 'second\n' >> "$work/source/test"
git -C "$work/source" -c commit.gpgsign=false commit -qam second
bash "$root/scripts/sync-main-cnb.sh" > "$work/updated.log"
[ "$(git -C "$work/mirror" rev-parse main)" = "$(git -C "$work/source" rev-parse main)" ]
git clone -q "$work/mirror" "$work/diverge"
printf 'mirror-only\n' > "$work/diverge/other"
git -C "$work/diverge" add other
git -C "$work/diverge" -c user.name=Test -c user.email=test@example.invalid -c commit.gpgsign=false commit -qm diverged
git -C "$work/diverge" push -q origin main
old="$(git -C "$work/mirror" rev-parse main)"
printf 'third\n' >> "$work/source/test"
git -C "$work/source" -c commit.gpgsign=false commit -qam third
if bash "$root/scripts/sync-main-cnb.sh" > "$work/diverged.log" 2>&1; then echo 'Diverged mirror accepted!' >&2; exit 1; fi
[ "$(git -C "$work/mirror" rev-parse main)" = "$old" ]
echo 'Actual local Git empty-bootstrap/opt-in/missing-main/unavailable/unchanged/fast-forward/divergence-refusal checks passed; no network or remote mirror changed.'
