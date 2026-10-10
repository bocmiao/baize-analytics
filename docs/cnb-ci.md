> 当前规则（2026-10-10，覆盖下文历史接入步骤）：全部可自主开发、集成和本地检查收工之前，不运行任何托管流水线，包括同步。父线程已在 CNB 设置关闭事件自动、定时自动、NPC 自动触发并确认无运行中任务。`.cnb.yml` 仅保留负责人最终手动 `web_trigger` 同步和不导入密钥的 `web_trigger_validate` 验证；无 push/crontab 事件。正常 GitHub main 提交允许，GitHub Actions 永久保持本任务禁用。最终由父线程同步并手动验收，失败修复后再手动验收；本地开发不得自行同步/触发/rebuild。历史定时注册与授权记录不代表当前启用，无需立即修改 cron 密钥授权。

# PRIVATE CNB mirror and shared CI template

GitHub PRIVATE `bocmiao/baize-analytics` main remains authoritative. CNB is a PRIVATE, one-direction mirror and optional CI runner. Repository creation, private visibility, login and existing credentials are handled by the integration owner. No new keys, paid services, network policies or billing settings are created by these files. The former GitHub Actions workflow is archived at `docs/ci-reference/github-actions-ci.yml`, outside active `.github/workflows`; it is not a synchronization trigger. Automatic GitHub Actions are intentionally removed because the owner requested no further failed quota/billing notifications. The page-level workflow disable is handled by the parent before the removal commit is pushed.

The single read-only official-doc request returned HTTP403. `.cnb.yml` was YAML-parsed locally, but CNB event keys, Docker service networking, runner resources, credentials and hosted execution are **templates, not runtime-verified**. Confirm them against official documentation in the authorized console before enabling. The Node24 pipeline requires Docker CLI/Compose to build and orchestrate a daemon-side runner; test-service reachability is now through service-name endpoints within that runner network. Docker CLI/Compose availability still requires actual provider verification. Do not silently skip real integrations if provisioning fails.

## One-direction synchronization

The owner has created the PRIVATE empty mirror `https://cnb.cool/bankermiao/baize-analytics`. After the source CI configuration is committed, explicitly set `SYNC_BOOTSTRAP_EMPTY=1` for the first synchronization. The script requires a successful complete refs listing with zero refs before a normal initial main push. Authentication/network failure or any nonempty repository lacking main is rejected. Do not create an unrelated README commit; subsequent updates require ordinary fast-forward ancestry. Only manual and scheduled synchronization jobs import `https://cnb.cool/bankermiao/baize-ci-secrets/-/blob/main/github.yml` for the owner-managed `GH_SOURCE_TOKEN`. The owner has verified the dedicated import design: `use_in_slugs: bankermiao/baize-analytics`, with proposed `allow_events: [web_trigger, vscode, "crontab: 0 */6 * * *"]`. The user has not yet confirmed saving that event authorization; it must not be described as configured or enabled. No other repository scope is added. The import contents must not be read or logged. Regular push has no imports. Use only built-in `CNB_TOKEN` input and fixed Git username `cnb`. The owner has verified that the trusted empty-repository vscode runtime token has `repo-code:rw`; this does not establish every pipeline event token permission. No separate long-lived mirror token or username variable is created. Set only the credential-free `CNB_MIRROR_URL=https://cnb.cool/bankermiao/baize-analytics` repository URL. Tokens are read by a temporary Git credential helper from environment; they are never placed in remote URLs, command arguments, tracked files or normal script output. Temporary helper/config are removed on exit. Disable command tracing around secrets.

`scripts/sync-main-cnb.sh` fetches source main and mirror main into an isolated temporary repository. Equal SHAs skip push and regular CI. It permits only an ordinary fast-forward after `git merge-base --is-ancestor`; diverged or unavailable main fails closed. It uses no force push and does not update GitHub or the current checkout.

The `web_trigger` entry remains a **manual-only** pull-main entry point. The owner has officially verified the exact quoted main-event key `"crontab: 0 */6 * * *"`, interpreted in `Asia/Shanghai`, for a light sync every six hours. YAML now contains that key with only the sync job and scoped import; no heavy task is scheduled. The proposed secret event authorization has not yet been confirmed saved, and actual scheduled execution is pending. The template uses `SYNC_RUN_REGULAR_CI=0` to avoid duplicating a push regular job after a changed SHA. The owner subsequently confirmed the initial push started a regular build; its failure is recorded below.

An empty CNB repository cannot execute a YAML file that is not yet present. Bootstrap therefore requires the official repository import that preserves source history, or an already authorized temporary execution entry point. Do not create README or a separate CNB main commit in the web UI: that creates diverged history and the normal fast-forward policy will correctly refuse it.

## Shared checks and disposable services

`bash scripts/ci-common.sh regular` runs frozen npm install, lint, types, unit, SDK/journal checks, build, Chromium installation, real PG/CH/Redis integrations, application database migration, compiled-Node startup and E2E. `TEST_DATABASE_URL`, `CLICKHOUSE_TEST_URL` and `REDIS_URL` are mandatory unless `CI_START_SERVICES=1` provisions `docker-compose.ci.yml`. Disposable CI services publish only loopback ports35432/38124/36379 by default, use test-only credentials, and are removed on exit. They do not attach to production/dev services or alter application limits. `CI_PORT` defaults3391. Local-only `CI_SKIP_INSTALL=1` and `CI_SKIP_BROWSER_INSTALL=1` allow equivalent checks against already installed dependencies/browser; they are not template defaults. Logs remain in the printed temporary path.

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

**Pending user confirmation:** the dedicated personal-environment secret authorization proposal `[web_trigger, vscode, "crontab: 0 */6 * * *"]` has not been confirmed saved. Neither import access nor hosted cron success is claimed. Parent will verify final execution. No secret file contents, runtime token or remote repository were accessed by the local configuration tests.

Configuration completeness correction: both manual `web_trigger` and six-hour `crontab` synchronization jobs explicitly set non-secret `env.CNB_MIRROR_URL=https://cnb.cool/bankermiao/baize-analytics`. The dedicated imported file supplies only the GitHub read credential; it is not expected to supply this URL. Local YAML parsing asserts the fixed URL and exact import in both jobs, sibling Docker/services shape and no regular-job imports; all nine file-only synchronization/bootstrap branches pass. At that earlier checkpoint workspace start was blocked; the owner-confirmed bootstrap below supersedes that state. No secret contents were read.

## Owner-confirmed first live bootstrap

The parent confirmed the empty-repository `vscode` event/main/repository checks and ordinary bootstrap push succeeded without reading back secrets. GitHub and PRIVATE CNB main were identical at `c1fa2e4`, preserving 23 commits. The first actual CNB push build `cnb-et9-1k4ifc7lh` started automatically: https://cnb.cool/bankermiao/baize-analytics/-/build/logs/cnb-et9-1k4ifc7lh . This supersedes earlier bootstrap-blocked/not-run notes; the parent monitors the live run. The subsequent owner-confirmed failure and cron registration are recorded below; CI success remains unverified. These provider facts are owner-reported, separate from this workspace's file-only tests. GitHub's workflow was disabled in its UI and the active YAML archived; do not enable, rerun or dispatch Actions.

## First hosted failures and exact authorization event

The owner confirmed the six-hour cron event is registered. Its manual test `cnb-ffp-1k4ifk97u` failed secret authorization: the event name is the full `crontab: 0 */6 * * *`, so a short `crontab` entry does not match. The correct proposed list is `[web_trigger, vscode, "crontab: 0 */6 * * *"]`; saving and successful synchronization remain pending. Secret file contents are never read by this task.

First push build `cnb-et9-1k4ifc7lh`, source `c1fa2e4`, ran npm/lint/types/unit/SDK/build/Chromium setup then failed database migration with `ECONNREFUSED 127.0.0.1:35432`; node24.21.0, 2m18s, EXIT1. The Docker service daemon and pipeline container have different loopback networks. The CI adaptation must run application tests on the same Compose network using service names, without public service ports, while retaining the local loopback mode. This is a hosted failure record, not a successful CI acceptance.

## Actual first hosted failure and daemon-network correction

The owner's first CNB run (`https://cnb.cool/bankermiao/baize-analytics/-/build/logs/cnb-et9-1k4ifc7lh`) ended **exit1 after2m18s**. Node24.21 lint/types/unit/SDK/build/Chromium ran, then migration failed with `ECONNREFUSED 127.0.0.1:35432`. The pipeline container and Docker daemon did not share loopback. This hosted failure is retained; local loopback CI acceptance does not prove CNB service reachability. Parent has archived/disabled Actions as an active runner; its checked-in workflow is historical reference only.

Regular CNB now sets `CI_RUNNER_IN_COMPOSE=1`. The shared script delegates **before npm ci** to `ci-compose-runner.sh`, which builds `Dockerfile.ci` by uploading source context to the daemon and runs `docker-compose.cnb.yml`. Test runner/PostgreSQL/ClickHouse/Redis share the same Compose network and use `postgres:5432`, `clickhouse:8123` and `redis:6379`; no services publish ports and no host filesystem bind paths are assumed. The runner uses explicit test-only environment, does not inherit GH/CNB credentials, and calls the same complete regular script with both delegation/provisioning flags0, preventing recursion. Real integrations and Chromium checks are not skipped. The existing host-loopback `CI_START_SERVICES=1` mode remains available for local jobs.

The outer job preserves the runner exit code, saves safe stdout/service logs to its printed temporary directory, and cleans only its own named stack. Optional `CI_COPY_BROWSER_ARTIFACTS=1` copies test-results via `docker cp`; application data, master keys and provider environment are never copied. `.dockerignore` excludes nested node_modules/git/env/key files and private/live data from source context. Syntax/Compose/no-ports/no-binds/no-provider-env checks passed; full containerized regular execution and the next production-image matrix remain pending owner scheduling. The Docker test image is not a production image and is not published.

### Actual local container-runner retries and resource correction

Local full-run attempts remain failures: `/tmp/baize-cnb-network-full.log` failed because Buildx attempted to write read-only `/home/agent/.docker/buildx`; `/tmp/baize-cnb-network-full-retry.log` built test image98390 but failed creating Redis with ENOSPC. These logs were preserved. This is not a passing hosted-CNB or full local-run result.

The CI test base is now existing `node:24-bookworm-slim`; application health uses Node's real fetch instead of requiring curl. Chromium is still installed with its actual operating-system dependencies, and every regular application/integration/browser check remains enabled. Buildx metadata goes to the job's writable log directory. Optional `CI_PUBLIC_PROXY_CA` (or the existing session public `CODEX_PROXY_CERT`) is uploaded to the created runner through `docker cp`, then used with `NODE_EXTRA_CA_CERTS`: no shared-daemon bind path, baked-in certificate, source/GH/CNB secret, new trust policy or disabled TLS verification. The certificate disappears when the owned test container is removed.

Only confirmed task-created old fault images and individually identified fault/full-CI cache records were reclaimed; no global prune or currentbf77 production evidence image/service deletion was performed. Space recovered from0 to3.9GiB, which is not a guarantee of enough capacity for a complete Chromium run. Static Bash/Compose/isolation checks passed. The slim runner's actual full execution is still pending the integration owner's next test or CNB execution; do not report the resource patch as a successful CI run.

Local same-network attempts are recorded in `test-evidence/cnb-network-config-validation.json`: initial Docker client readonly failure (EXIT1), successful full-base runner image then ENOSPC service creation (EXIT1), and slim runner with healthy PG/CH/Redis but npm registry DNS `EAI_AGAIN` (explicitly stopped, EXIT143; zero application tests). No network/security setting changed. The final config adds a dedicated-container-only verified real bundled Chromium executable link for integration tests that use `/usr/bin/chromium`; this latest adapter is statically checked but not yet container-executed. Parent must verify the adapted hosted run; these failures are not PASS. Public optional session CA uses Docker API transfer and strict TLS, never provider tokens or image layers.

## Main custom synchronization button

`.cnb/web_trigger.yml` uses the officially supplied `branch` array, `reg: '^main$'`, and `buttons` with name/description/`event: web_trigger`. It invokes the existing scoped sync-only pipeline and imports; no extra secret event or token is introduced. The button appears only after this file reaches CNB main. Hosted button rendering/triggering remains pending the parent's synchronization and inspection. No unverified role names are guessed; any optional owner/admin role restriction must use the provider's verified names. Cron authorization remains pending, and no cron retry is claimed.

Local fresh-application isolation: integration fixtures use `DATABASE_URL`/`TEST_DATABASE_URL` with their own Pool schema options; do not put a URL-level search_path into those shared test URLs. Optional `CI_APPLICATION_DATABASE_URL` is applied only after integrations, immediately before application migration/compiled startup/E2E. Dedicated CNB disposable databases need no override. Earlier local URL-isolation mistakes are retained as failed/interrupted validation, not product journal defects.

The parent fast-forwarded the private mirror to223e887 and observed actual push run `cnb-bnd-1k4igl82q` progressing through browser downloads; its final outcome is pending, with no new GitHub Actions run reported. CI PostgreSQL healthchecks now explicitly use `pg_isready -U baize -d baize_ci`, matching the configured database and removing default-name FATAL log noise. This noise does not establish migration failure and is not grounds to stop the live run.

## Owner-confirmed hosted acceptance

The parent inspected CNB run [cnb-bnd-1k4igl82q](https://cnb.cool/bankermiao/baize-analytics/-/build/logs/cnb-bnd-1k4igl82q), source223e887: regular stage7m31s, EXIT0, real integrations/compiled entrypoint/18E2E passed; BeforeEnd/End green and Compose fully cleaned. This supersedes pending adapted-hosted status for that exact source, not later8b61fc0/4ed81c4 or uncommitted AI/bounded-worker code. These are owner-page observations; downloaded full logs/test counts have not yet been supplied here, so no hosted application-test total is inferred. The healthcheck noise did not fail this run; fix4ed81c4 already saves explicit baize_ci checks. First failed hosted/local attempts remain recorded. Cron is registered but exact secret authorization is still awaiting user confirmation; scheduled synchronization is not accepted. No GitHub Actions enable/rerun/dispatch occurred.
