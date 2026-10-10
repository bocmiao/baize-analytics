# PRIVATE CNB mirror and shared CI template

GitHub PRIVATE `bocmiao/baize-analytics` main remains authoritative. CNB is a PRIVATE, one-direction mirror and optional CI runner. Repository creation, private visibility, login and existing credentials are handled by the integration owner. No new keys, paid services, network policies or billing settings are created by these files. The existing GitHub Actions workflow remains a reference; it is not a synchronization trigger and was not removed or advertised as a completed CNB run.

The single read-only official-doc request returned HTTP403. `.cnb.yml` was YAML-parsed locally, but CNB event keys, Docker service networking, runner resources, credentials and hosted execution are **templates, not runtime-verified**. Confirm them against official documentation in the authorized console before enabling. The Node24 template expects a Docker-capable runner with Docker CLI/Compose and loopback access to published service ports; a Docker sidecar alone may not supply these prerequisites. Do not silently skip real integrations if provisioning fails.

## One-direction synchronization

The owner has created the PRIVATE empty mirror `https://cnb.cool/bankermiao/baize-analytics`. After the source CI configuration is committed, explicitly set `SYNC_BOOTSTRAP_EMPTY=1` for the first synchronization. The script requires a successful complete refs listing with zero refs before a normal initial main push. Authentication/network failure or any nonempty repository lacking main is rejected. Do not create an unrelated README commit; subsequent updates require ordinary fast-forward ancestry. The manual synchronization job alone imports `https://cnb.cool/bankermiao/baize-ci-secrets/-/blob/main/github.yml` for the owner-managed `GH_SOURCE_TOKEN`. Its current allow_slugs authorization is limited to this target repository and main/web_trigger; no secret event access is expanded. The import contents must not be read or logged. Regular push has no imports. Use only the built-in `CNB_TOKEN` input and fixed Git username `cnb`; its write permission still requires owner verification. No separate long-lived mirror token or username variable is created. Set only the credential-free `CNB_MIRROR_URL=https://cnb.cool/bankermiao/baize-analytics` repository URL. Tokens are read by a temporary Git credential helper from environment; they are never placed in remote URLs, command arguments, tracked files or normal script output. Temporary helper/config are removed on exit. Disable command tracing around secrets.

`scripts/sync-main-cnb.sh` fetches source main and mirror main into an isolated temporary repository. Equal SHAs skip push and regular CI. It permits only an ordinary fast-forward after `git merge-base --is-ancestor`; diverged or unavailable main fails closed. It uses no force push and does not update GitHub or the current checkout.

The `web_trigger` entry is a **manual-only** pull-main entry point. There is no console schedule assumption. Official `crontab`/`api_trigger` syntax and corresponding secret-event authorization must be provided by the owner before any periodic trigger is added; no scheduler or unauthorized secret event is invented. The template uses `SYNC_RUN_REGULAR_CI=0` to avoid duplicating a push regular job after a changed SHA. Actual provider push-trigger behavior remains unverified.

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
# CNB_TOKEN is provider built-in input; fixed username cnb; write access not yet verified
bash scripts/sync-main-cnb.sh
```

No token value belongs in this example, YAML or shell history. The import URL is a reference only: no import contents were fetched. `services` is a sibling of `docker` and `stages`, following the user's official schema feedback; YAML parsing does not prove hosted behavior. The built-in token's write permission and hosted execution remain unverified. Local file-only tests cover explicit empty bootstrap, refusal without opt-in, tags-only missing-main refusal, unavailable-target refusal, unchanged skip, fast-forward and divergence refusal. No remote credential or CNB write was exercised.
