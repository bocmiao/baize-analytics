# PRIVATE CNB mirror and shared CI template

GitHub PRIVATE `bocmiao/baize-analytics` main remains authoritative. CNB is a PRIVATE, one-direction mirror and optional CI runner. Repository creation, private visibility, login and existing credentials are handled by the integration owner. No new keys, paid services, network policies or billing settings are created by these files. The former GitHub Actions workflow is archived at `docs/ci-reference/github-actions-ci.yml`, outside active `.github/workflows`; it is not a synchronization trigger. Automatic GitHub Actions are intentionally removed because the owner requested no further failed quota/billing notifications. The page-level workflow disable is handled by the parent before the removal commit is pushed.

The single read-only official-doc request returned HTTP403. `.cnb.yml` was YAML-parsed locally, but CNB event keys, Docker service networking, runner resources, credentials and hosted execution are **templates, not runtime-verified**. Confirm them against official documentation in the authorized console before enabling. The Node24 template expects a Docker-capable runner with Docker CLI/Compose and loopback access to published service ports; a Docker sidecar alone may not supply these prerequisites. Do not silently skip real integrations if provisioning fails.

## One-direction synchronization

The owner has created the PRIVATE empty mirror `https://cnb.cool/bankermiao/baize-analytics`. After the source CI configuration is committed, explicitly set `SYNC_BOOTSTRAP_EMPTY=1` for the first synchronization. The script requires a successful complete refs listing with zero refs before a normal initial main push. Authentication/network failure or any nonempty repository lacking main is rejected. Do not create an unrelated README commit; subsequent updates require ordinary fast-forward ancestry. Only manual and scheduled synchronization jobs import `https://cnb.cool/bankermiao/baize-ci-secrets/-/blob/main/github.yml` for the owner-managed `GH_SOURCE_TOKEN`. The owner has verified the dedicated import design: `use_in_slugs: bankermiao/baize-analytics`, with proposed `allow_events: [web_trigger, vscode, crontab]`. The user has not yet confirmed saving that event authorization; it must not be described as configured or enabled. No other repository scope is added. The import contents must not be read or logged. Regular push has no imports. Use only built-in `CNB_TOKEN` input and fixed Git username `cnb`. The owner has verified that the trusted empty-repository vscode runtime token has `repo-code:rw`; this does not establish every pipeline event token permission. No separate long-lived mirror token or username variable is created. Set only the credential-free `CNB_MIRROR_URL=https://cnb.cool/bankermiao/baize-analytics` repository URL. Tokens are read by a temporary Git credential helper from environment; they are never placed in remote URLs, command arguments, tracked files or normal script output. Temporary helper/config are removed on exit. Disable command tracing around secrets.

`scripts/sync-main-cnb.sh` fetches source main and mirror main into an isolated temporary repository. Equal SHAs skip push and regular CI. It permits only an ordinary fast-forward after `git merge-base --is-ancestor`; diverged or unavailable main fails closed. It uses no force push and does not update GitHub or the current checkout.

The `web_trigger` entry remains a **manual-only** pull-main entry point. The owner has officially verified the exact quoted main-event key `"crontab: 0 */6 * * *"`, interpreted in `Asia/Shanghai`, for a light sync every six hours. YAML now contains that key with only the sync job and scoped import; no heavy task is scheduled. The proposed secret event authorization has not yet been confirmed saved, and actual scheduled execution is pending. The template uses `SYNC_RUN_REGULAR_CI=0` to avoid duplicating a push regular job after a changed SHA. Actual provider push-trigger behavior remains unverified.

An empty CNB repository cannot execute a YAML file that is not yet present. Bootstrap therefore requires the official repository import that preserves source history, or an already authorized temporary execution entry point. Do not create README or a separate CNB main commit in the web UI: that creates diverged history and the normal fast-forward policy will correctly refuse it.

## Shared checks and disposable services

`bash scripts/ci-common.sh regular` runs frozen npm install, lint, types, unit, SDK/journal checks, build, Chromium installation, database migration, real PG/CH/Redis integrations, compiled-Node startup and E2E. `TEST_DATABASE_URL`, `CLICKHOUSE_TEST_URL` and `REDIS_URL` are mandatory unless `CI_START_SERVICES=1` provisions `docker-compose.ci.yml`. Disposable CI services publish only loopback ports35432/38124/36379 by default, use test-only credentials, and are removed on exit. They do not attach to production/dev services or alter application limits. `CI_PORT` defaults3391. Local-only `CI_SKIP_INSTALL=1` and `CI_SKIP_BROWSER_INSTALL=1` allow equivalent checks against already installed dependencies/browser; they are not template defaults. Logs remain in the printed temporary path.

Heavy `heavy-ops` and `heavy-million` modes are manual and are absent from push stages. The million-event mode requires a dedicated `BENCH_DATABASE_URL` and uses the actual HTTP pipeline benchmark with `--events=1000000 --sites=40`. Do not schedule these daily. Keep cached images/dependencies where supported and run regular checks only for a changed source SHA. The user's free160core-hours/month target is a budget constraint, not a measured provider-cost guarantee; actual allocated cores, runtime and any extra services/GPU charges must be checked in the console. No paid capacity is requested.

Local evidence: Bash syntax and YAML parsing passed; `scripts/ops-sync-test.sh` used actual local Git repositories and file-only transport to verify unchanged skip, normal fast-forward and divergence refusal without contacting either provider. SDK and independent-journal checks passed. Full shared regular CI and hosted CNB/scheduler execution are recorded separately; no credentials or mirror push were attempted by these local tests.

## Minimum approved mirror variables and unverified provider binding

```sh
export CNB_MIRROR_URL=https://cnb.cool/bankermiao/baize-analytics
export SYNC_BOOTSTRAP_EMPTY=1 # Only the owner's explicitly approved empty bootstrap
# GH_SOURCE_TOKEN: existing read-only source credential, supplied by the owner/secret store
# GH_SOURCE_TOKEN is supplied by the owner-scoped import, never read in this task
# CNB_TOKEN is built-in; trusted vscode repo-code:rw verified by the owner; username cnb
bash scripts/sync-main-cnb.sh
```

No token value belongs in this example, YAML or shell history. The import URL is a reference only: no import contents were fetched. `services` is a sibling of `docker` and `stages`, following the user's official schema feedback; YAML parsing does not prove hosted behavior. The trusted vscode token's repo-code:rw permission has been officially verified by the owner; hosted push/web-trigger runtime and scheduled execution remain unverified. Local file-only tests cover explicit empty bootstrap, refusal without opt-in, tags-only missing-main refusal, unavailable-target refusal, unchanged skip, fast-forward and divergence refusal. No remote credential or CNB write was exercised.

## Copyable empty-repository vscode bootstrap

The authorized empty-repository vscode environment must have `CNB_BRANCH=main`, owner-scoped imported `GH_SOURCE_TOKEN`, and its trusted built-in `CNB_TOKEN`. Do not fetch or display `github.yml` contents. No separate token, new README commit, network change or paid service is needed. Paste the entire block below into that authorized terminal. It writes only a temporary executable, fetches GitHub main into another temporary repository with full history, then invokes the synchronization script **from the fetched main**. No unauthenticated curl is used to download a private script, and token values never appear in arguments or URLs. The final push remains normal, explicit-empty-only and divergence-protected.

```sh
bootstrap_entry="$(mktemp /tmp/baize-bootstrap-entry.XXXXXX)"
cat > "$bootstrap_entry" <<'BAIZE_BOOTSTRAP'
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
BAIZE_BOOTSTRAP
bash "$bootstrap_entry"
bootstrap_status=$?
rm -f "$bootstrap_entry"
( exit "$bootstrap_status" )
```

The heredoc is the checked-in `scripts/bootstrap-cnb.sh` entry point. `scripts/ops-sync-test.sh` now actually invokes it with file-only remapped repositories and verifies identical main history in the new mirror; non-main branch context rejects before pushing. These tests do not contact CNB/GitHub or exercise real tokens. The exact cron key/time has now been verified by the owner; saving secret permissions and hosted cron execution remain pending. The bootstrap itself does not configure or broaden secret permissions.

## Official cron and remaining activation checks

The owner-provided official syntax is main event `"crontab: 0 */6 * * *"`, using `Asia/Shanghai`; it runs only lightweight Git synchronization every six hours. The trusted event's built-in token is restricted to this repository's `repo-code:rw`, with username `cnb`; no cross-repository switch or long-lived mirror token is enabled. Sync jobs omit Docker services; regular push retains its Docker-capable validation setup and has no secret imports. Unchanged source SHA does not push and does not start regular tests. Heavy ops/million-event commands remain manual only, consistent with the free160core-hour budget constraint.

**Pending user confirmation:** the dedicated personal-environment secret authorization proposal `[web_trigger, vscode, crontab]` has not been confirmed saved. Neither import access nor hosted cron success is claimed. Parent will verify final execution. No secret file contents, runtime token or remote repository were accessed by the local configuration tests.

Configuration completeness correction: both manual `web_trigger` and six-hour `crontab` synchronization jobs explicitly set non-secret `env.CNB_MIRROR_URL=https://cnb.cool/bankermiao/baize-analytics`. The dedicated imported file supplies only the GitHub read credential; it is not expected to supply this URL. Local YAML parsing asserts the fixed URL and exact import in both jobs, sibling Docker/services shape and no regular-job imports; all nine file-only synchronization/bootstrap branches pass. The current workspace start is blocked by unsaved `vscode` secret-event authorization, not a completed bootstrap. No secret contents were read.
