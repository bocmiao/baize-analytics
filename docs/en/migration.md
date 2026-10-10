# Installation, upgrades and migration runbook

## Current validation entry (66150be)

661 formal full:215 unit+426 real integration=641 PASS,30 E2E(28 real Chromium+2 date)PASS,EXIT0/cleanup. Fixed1000 PASS(finalHTTP5.047623651s). Fixed5000 overall FAIL:4350accepted/13unsent/35delayed,drainfalse120s;accepted4350 final PV4350/coverage1/CH and six integrity assertions PASS,21.102973929s.Not5000/SLO acceptance.

New image actualEXIT1:CH target233/ENOSPC creating preprocessed_configs;build/install/manifest/budget/55DDL/licensing/seed passed,native phase not started,targetcleanup complete.F archives evidence;no inferred root cause.Local01e2c5d saved,remote confirmation not claimed.Hosted workflows not triggered.All records below are historical SHA-bound stages.

## Historical stage records and design

## Historical preceding validation entry

| Source/stage | Actual evidence and boundary |
|---|---|
| 66150be formal full run | Actual EXIT0/cleanup:215 unit/55 files+426 real integration/156 files=641 PASS,0 skips/unhandled;30 E2E(28 real Chromium+2 date)PASS,about1.5min;lint/type/SDK/journal/build/migrate/compiled entry PASS |
| 66150be fixed load |1000 PASS:final HTTP5.047623651s;5000 overall FAIL:4350 accepted/13 unsent/35 delayed,drainfalse120s;final PV4350/coverage1/CH and six integrity assertions PASS,21.102973929s.Not5000/SLO acceptance |
| Image/remote |New image not completed;localHEAD e441 exists,push unconfirmed due HTTPS authentication failure.No Git/hosted actions |
| 66150be independent checks | Type/lint/215 unit tests PASS; not the full-run result |
| 0a precommit targeted source digest | 19 real tests PASS; targeted digest-bound evidence, not a full count |
| c890 backend | 211 unit+421 integration=632 PASS; historical source |
| 1c1cb65 browser/image | 30 checks(28 Chromium+2 date)PASS; image EXIT0. Historical1c source, not661 |
| 1c1cb65 fixed load | 1000 PASS;5000 FAIL. Historical1c source; no SLO claim |

Hosted workflows remain untriggered. Every update below is an archived SHA-bound stage record: earlier occurrences of “current/latest” describe that historical stage, not another current entry. Failures and original evidence remain unchanged.

## Historical stage records and contracts

**当前66150be测试窄修**：完整type/lint/215单元实际EXIT0，src/db/packages与0a相同；19真实precommit专项仍只证明此前摘要绑定源码，不是完整全轮。0a正式入口实际EXIT2（TS2749），unit/int/browser/image未运行；随后测试WIP首次213/215单元通过、2FAIL，类型与event-capable mock窄修后215PASS。先type后追加测试导致旧报告外推的失误已记录，不掩盖。661新full/image/load待；bd未捕获错误、0a类型FAIL、测试WIP2FAIL及1c负载FAIL原证据保留。

当前更新a9b49e7：bd3f51f三批候选7单元/21真实专项PASS，但新完整入口实际EXIT1：213单元PASS，集成424检查中423PASS/1skip，并有uncaught PG25P04 error1；浏览器NOT RUN。旧1c30浏览器及镜像通过仅绑定旧source，不外推候选。skip来自runner漏env，已改用仓库validate-local-final.sh正式入口；C idlefatal修复已保存0a0c171：precommit WIP摘要绑定第四轮19真实专项PASS/0skip/0uncaught，10单元/type/lint通过；新0a全量/镜像/负载尚待。所有FAIL保留，托管不触发。

### Historical2818bd4 validation entry

c890 backend:211 unit+421 real integration=632 PASS. 1c1cb65 browser:30 checks(28 Chromium+2 date)PASS; src/db/packages match c890, without claiming a backend rerun. The actual1c image lifecycle exited0; main-1c1cb65-image-* evidence binds source1c. Fixed1000 passed: final HTTP5120ms, sampled app+harness Node peak650272768 bytes(excluding storage services);5000 finally FAILED(4900 accepted/2 unsent/39 delayed; drain deadline exceeded; final assertions not executed), not a pass or SLO claim. Budget defaults do not guarantee scanned rows, heap bounds or performance gains. All later old main0f/de/annotation-pending text is SHA-bound historical narrative; original failures remain. Hosted workflows stay untriggered.

## Historical contracts and stage records

Current delivery: main0f14; the same-source19d97af matrix passed595 application tests and30 checks, and its55-DDL/two-index production image passed. The core activation guard is true; per-site proofs, epochs and journals remain mandatory. Earlier closed-guard/not-delivered statements below are historical snapshots, not current operating instructions. Never change authority manually. The ac projection has targeted14 real integration/2 unit passes only; its1000 run passed(5.316s),5000 failed and browser targeted validation passed30 checks(28 Chromium/2 date),0 skips,96.441s,EXIT0. This is not a full ac matrix/image pass.

For operators of a self-hosted instance. Examples act only on the explicitly selected local instance; they do not publish a site, change repository visibility or switch production traffic. [API manual](api.md) · [中文](../migration.md) · [Deployment](deployment.md). Provider accounts and paid APIs are not required to read or locally validate these procedures.

## Current user contracts and operating guide

## Choose the correct operation

| Goal | Tool | Important boundary |
|---|---|---|
| Fresh installation | install.sh or local npm startup | Not an old database migration |
| Application schema upgrade | Forward SQL migrations and upgrade.sh | An old image alone cannot undo a committed new schema |
| Site data download | Site CSV/JSON export, full mode |100k rows per table, not full-instance backup |
| Whole PostgreSQL recovery | backup.sh and restore.sh | Also requires independent latest deletion journal, files and versioned keys |
| GA4 historic reports | Administrator OAuth/import/exact-window API | Cannot recreate events, identities, funnels or cross-source unique visitors |
| CH history copy | History API/CLI | Isolated verified replica, not canonical storage migration |
| Umami/other whole database import | No validated automatic importer currently | Never load incompatible schemas or invent reconstructed identity data |

## Fresh installation and local development

Prerequisites are Node≥24 and PostgreSQL/Redis; Docker installation also needs Docker Engine and Compose v2. Use the existing lockfile with npm ci. Do not install over an unrelated instance. The installer creates ignored .env/.baize secret files and builds a local image; never commit those files, print secret material or run an environment dump.

```bash
# With local Docker/Compose and image-network prerequisites already configured:
./install.sh
# Alternative local development with privately bound database/cache configuration:
npm ci
npm run db:migrate
npm run build
npm start
```

npm start defaults to127.0.0.1:3000. Use the documented container HOST setting only when appropriate. Startup applies forward migrations, verifies deletion/restore state, retries file cleanup and starts the production timer. GET /healthz checks real storage, GET /api/setup shows whether first administrator initialization is required. Initialize through the UI, create a site and install the public tracker snippet. There is no default password. Do not place administrator tokens in tracker code.

DATABASE_URL, REDIS_URL, DATA_DIR, KEYS_DIR, MASTER_KEY_FILE and PUBLIC_URL must refer to the intended local instance and private configuration. Preserve existing signing/encryption keys. Do not reinitialize a populated instance, change its identity mode in place or reset tombstone watermarks. Production background timers and the standalone worker are different workflows; record which was used for acceptance.

## Forward schema migrations and partitions

SQL files in db/migrations run in sorted order, each in a transaction. schema_migrations records checksums. Editing an applied migration fails verification; corrections require a new numbered forward migration. A migration lock serializes startup. Do not delete checksums/constraints or disable integrity checks to make an upgrade appear successful.

Events are monthly range-partitioned; the primary key contains site_id/event_id/ts and EAV foreign keys use that tuple. event_keys enforces same-site event-ID idempotency/conflict rules. The default partition holds events until maintenance creates the appropriate month. DDL takes a schema-scoped exclusive partition gate before table/FK locks; intake, worker and retention use the shared gate. Repeatable-read snapshots wait for DDL before BEGIN, avoiding pre-relocation snapshots that could miss moved events/properties.

Retention is per site. Never drop an entire shared month because one site has a shorter policy. Historical partitions are dropped only when empty, with existence/emptiness rechecked after the gate. Archived complete aggregate buckets may survive raw retention, but partial boundary buckets/detail cannot be reconstructed honestly.

## Downtime upgrade

upgrade.sh checks free disk, reserves rollback space, stops the app, creates a recovery point, starts the new local image/migrations and verifies health. This is **a downtime upgrade**, not zero downtime. Prepare/review the local image first; the example does not deploy an external service.

```bash
./upgrade.sh "$BAIZE_LOCAL_IMAGE"
```

Verify schema version, health, login/site permission, real collection202/rejected fields, background watermark/coverage, and deletion/export revocation. A running process/open port is insufficient. If the new image or health/schema check fails, rollback restores database schema/data and the prior image; merely switching images while retaining a committed new schema is unsafe. The default preflight disk floor is2GiB; the128MiB emergency reserve is not a capacity guarantee. Size recovery space for your actual database/files.

Retain failure evidence and exit codes. Never reset/force away user work, rewrite applied migration checksums or directly drop the production database. A subsequent successful attempt does not erase the first failure.

## Whole-instance backup: PG, files, independent journal and keys

Use a new destination that does not already exist. The script sets umask077.

```bash
scripts/backup.sh "$BAIZE_NEW_BACKUP_DIR"
```

The backup contains a custom-format database.dump, tombstones.jsonl and tombstones.watermark.json with validation, app-data.tar.gz excluding keys, app-image.id, master-key.sha256 and SHA256SUMS. Keys are a **separate package** under BAIZE_KEY_BACKUP_DIR or .baize/key-backups, containing original master.key and all versioned keyring files with their own checksums. The main package only references it through key-package.ref. Database snapshots alone omit required export/GeoIP/journal/signed-history files and decryption/signing keys.

Protect keys separately, offline where appropriate, with private file/directory permissions. A hash/reference is not a usable key backup. Key rotation retains old version files; instance_keyring's active version must match master.vN.key. Legacy iv:cipher:tag is readable using v1; modern envelopes select the corresponding version. Missing/unknown key versions fail closed.

The deletion journal is independent, append-only and durably persisted. Deletions occurring **after** the database backup must reach the restored instance. The journal captured in the backup only proves deletion state at snapshot time and cannot substitute for the independent latest journal at restore. Missing, truncated, reset, corrupt or older-than-snapshot state must reject restoration. Do not create an empty journal to bypass validation.

## Restore into a new database and separate volumes

restore.sh requires a new name beginning baize_restore_ and refuses existing databases/target volumes. Use the matching master key. Privately configure BAIZE_KEY_RESTORE_DIR if the independent key package is relocated.

```bash
scripts/restore.sh "$BAIZE_BACKUP_DIR" "$BAIZE_NEW_RESTORE_DATABASE"
```

The script validates checksums/key package, copies the **latest independent** journal/watermark from the source app and compares it against the backup before creating any target database. It creates independent target app_data/app_keys volumes, copies neutral snapshot files and old key versions, restores a new PG database, applies migrations and replays deletion, revokes exports/physically cleans files, invalidates caches/old tasks and rebuilds aggregates. The result marker in .baize/restores records trafficSwitched=false.

Deleted identity must not reappear through events, identity segments, event keys/outbox, experiment contributions, old aggregates/cache/export files or CH/history. Old lease/generation/epoch work must not overwrite the rebuild. Export paths are safely remapped to target data volume; only recognized files for affected job IDs are removed. Neutral assets such as GeoIP remain. Cleanup errors stay durable/pending with backoff; do not report physical completion prematurely.

If using CH on restore, BAIZE_RESTORE_CLICKHOUSE_URL must explicitly identify an isolated target endpoint, not the source instance. Without it, restore runs PG and invalidates replica state rather than borrowing the source replica. Failure retains the new database/volumes for diagnosis, writes no success marker and switches no traffic. Independently verify the result before deciding how to route traffic; these commands do not deploy or merge changes.

## Retention, identity and recomputation

Changing site retention queues/permits maintenance, coordinated with dirty generations and active leases. Complete archived rollups are different from retained raw detail. Filtered/partial-hour/funnel-user/identity requests outside raw retention must preserve unavailable status rather than create fake zeros. Increasing retention only extends future preservation; it does not restore deleted events.

Standard identify uses event-time bindings, including A→B intervals; prior anonymous history is not automatically reassigned. Daily-salt mode refuses identify and cross-day UV/retention. Legacy privacy migrations clean stale stable aliases, EAV and exports, invalidate caches and mark generations dirty; backups must not reintroduce PII.

POST S/jobs/replay resets epoch/retry state and recomputes from complete retained events. Batches never replace a whole period. Publication verifies owner/lease/epoch and captured high-water marks. ROLLBACK does not release a pool connection: held-client queries must reuse that client, or release before borrowing another. Reports, fence misses, export failures and invite audit have real max1/max10 regressions. Increasing pool size is not a correctness fix. Membership and audit commit atomically in current fixes.

## GA4 historical aggregate import

Configure Google OAuth and let the site administrator authorize. POST E/ga4/import `{start,end}` uses inclusive ordered dates, at most3660 days. It saves sourceDays/days/weeks/period/sources reports, each at most100k rows and each HTTP response at most5MB. Excess fails rather than saving silent partial history.

GET E/ga4/window only answers a **precisely imported** start/end window as saved-provider-window. A different window is unsupported. Day, ISO-week, whole-period and source totalUsers are independently deduplicated provider metrics; never sum daily UV to estimate period UV or combine imported/native identities. Preserve property_id/property_timezone/thresholding/sampling quality. Unknown timezone remains unknown/limited. Dashed historical PV overlays are comparisons, not reconstructed native events/funnels/retention. Real Google account access remains untested when evidence uses explicit transport fixtures.

GSC is query/page/day aggregate data with typical2–3 day latency, not person-level keyword-to-order attribution. Baidu traffic API remains unsupported/unverified. Other products have no fully validated whole-database automatic importer: back up the original product, import only supported aggregate formats and compare counts/timezone/currency/UV definitions. Do not load incompatible schemas.

## Optional ClickHouse and signed history CLI

PG remains canonical for event/deletion authority. CH snapshot_v1/incremental_v1 are validated optional replicas. prefer_clickhouse reads expose source/mode/fallbackReason; mirror does not automatically become canonical. Integrity failure, lag or epoch changes fall back to PG. Rollups, worker RR, export RR and identity metadata still use PG. A complete migration to canonical CH storage has **not** been delivered.

History captures original raw/hourly/daily/vitals JSON with slice checksums and epoch/generation/outbox high-water mark. Raw data before retention is unavailable_not_reconstructed. Configure DATABASE_URL, CLICKHOUSE_URL, MASTER_KEY_FILE, DATA_DIR and KEYS_DIR privately; never put passwords in copied commands or print the environment.

```bash
# Each operation targets the explicitly selected local instance.
npx tsx scripts/history-cli.ts capture "$BAIZE_SITE_ID"
npx tsx scripts/history-cli.ts backup "$BAIZE_SITE_ID" "$BAIZE_HISTORY_MANIFEST_ID"
npx tsx scripts/history-cli.ts restore "$BAIZE_SITE_ID" "$BAIZE_HISTORY_BACKUP_ID" "$BAIZE_NEW_HISTORY_NAMESPACE"
```

Capture returns manifest ID; backup returns signed backup ID/bytes/integrity. Restore namespace is a fresh UUID and returns activated=false/authority=postgres. Signatures/version keys/manifest/slices/latest PG deletion and epoch are checked. Restore writes an isolated namespace, never activates canonical reads or resurrects deleted people. Corresponding APIs are S/storage/history/capture, /:id/backup and /:id/restore. Keep signed backup files together with the required signing-key version; raw CH rows alone are not a complete restore package.

## Verification and evidence boundaries

Record actual command exit, source/image SHA, schema version, target database/volumes, journal verification, user/site permissions, durable collection/idempotency, background watermark/coverage and revoked-export physical cleanup. Separate provider accounts, real model quality, Windows and real mini-program devices that were not tested. Environment smoke tests cannot substitute for application acceptance.

Real Docker installation, backup, independent-volume restore and failure after committed-schema upgrade/rollback evidence is linked from [operations validation](../validation-ops.md), [deployment](deployment.md) and [main validation](../VALIDATION_MAIN.md). Manual-worker million-event tests and background continuous tests have different boundaries: [scale](../validation-scale.md), [continuous](../validation-continuous-scale.md). They do not prove1CPU/2GiB production SLOs. Prefer the latest immutable validation record over historical counts. This runbook does not rerun paid providers or deploy production automatically.

## AI invalidation and Baidu manual-import boundaries


Current deletion/journal replay invalidates site-derived AI answers/evidence/suggestions/exports while retaining accounting. These hooks are not part of fifth272/19 or sixth pre-deletefix289/20; they are included in fa3 seventh-stage compiled-app acceptance. Subsequent040 notification cleanup remains a separate worktree slice. Historical derivatives must also be invalidated after latest-journal replay.


Baidu public search-analysis read access remains unverified; available product documentation is not an API contract. No current native CSV sample is available. Custom import templates/column mapping cannot be described as native compatibility. URL submission, Tongji PV/UV search words and natural-search impressions/rank must remain separate sources.

## Development slices032–034: do not switch authority manually

032 adds canonical manifests, event membership and deletion epochs.033 adds normalized event-time contributions and SQL exact membership queries.034 adds replay chunk keys: identifiers, sequence, hash and record-time bounds; PG stores no canonical rrweb body. These forward migrations do not authorize editing authority rows to clickhouse. CANONICAL_ACTIVATION_READY remains false; ordinary installations and older images continue using PG authority.

In isolated canonical tests, committed CH bodies, manifests, checksums and PG deletion state jointly define readable events. CH unavailability yields503 rather than empty PG results. The independent canonical backup/restore module has targeted tests but is not yet part of installer/full-application restoration. Existing history-cli restore remains an isolated replica and does not activate authority. Neither new module replaces full PG backups, application files/versioned keys or the independent latest deletion journal.

Mixed-identity replay batches need record-time deletion, not only wire-event timestamp deletion of an entire chunk. Removing an overlapping index is not CH physical erasure. C4 has targeted real PG/CH coverage for immutable replacement of mixed-identity records, physical acknowledgement of old bodies, failure rollback/orphan recovery and independent-journal restoration (three tests). This is not yet new immutable full-suite or native rrweb canonical-browser acceptance. The30-day physical replay-retention lifecycle has the worktree-only targeted implementation below, pending next immutable full acceptance; that historical targeted stage kept activation/replay guards closed; current3e052d8 core activation is enabled, and index hiding is not physical erasure. Development indexes written with noncanonical key-order hashes must be repaired only from verified authoritative bodies; do not blindly rewrite hashes to suppress integrity errors. The30-day physical replay-retention lifecycle has the worktree-only targeted implementation below; complete acceptance remains pending.

Governance readers acquire session partition/site shared gates before fixing an RR snapshot, then transfer protection to transaction locks and release session locks. Do not borrow the same pool while holding its client. The default application now registers the standard [read-only MCP endpoint](mcp.md), with four officialSDK targeted checks. Current AI trace/chart and derived-data deletion hooks are integrated: purge site answers/evidence/suggestions and revoke exports while retaining accounting, including invalidation after latest-journal restore. AI-derived deletion and the default MCP registration are included in fa3 seventh-stage compiled-app acceptance. Subsequent033/034/035/037 and notification protection remain separate worktree slices; use the main acceptance record for image boundaries.

The new035 durable AI reservation ledger stores quota reservation/settlement state, without model bodies or visitor foreign keys. AI-derived-data deletion must not erase it and reset expenditure. Site-facts export excludes this operational state (ai_reservations, reason quota-ledger-operational-state), while preserving the existing numeric ai_budget facts policy. Full PG backups include the ledger. Its targeted and complete-batch evidence must remain separate; older images must not be assumed to contain035.

## Subsequent037: latest replay-retention authorization (worktree preview)

Replay TTL applies the shorter of site retention and30 days to rrweb record timestamps. The037 monotonic cutoff commits before partition/site gates; lengthening retention cannot restore already authorized expired content. Canonical mixed chunks are replaced immutably with physical old-body acknowledgement. Optional PG-authority history also keeps newer records rather than deleting their entire namespace. Failure retries retain metadata pointers. This operational ledger is not the personal-deletion journal.

Proof version2 uses scope=canonical-and-history-replay and a stable v1 instance key to sign complete scope/sourceScope/time, with default validity10 minutes. Version1, incomplete scope, wrong source, stale proof and invalid signatures fail closed. Scope covers active CH sites, published raw-history sites and existing037-authorized sites (at most5000); backup index.retentionSites must match. Source capture commits scheduling before RR capture and fsyncs the private proof. Target merge uses GREATEST on the same client before body publication; physical filtering of current/historical rrweb finishes before transaction commit. Before a success marker, source still-current re-reads without scheduling and rejects changed scope/cutoffs or journal. It never modifies source CH.

A full PG backup contains the ledger, but an old dump cannot replace independently captured latest source proof. Site-facts export does not replay operational state. Existing tombstones/personal-deletion logs remain mandatory. Real PG/CH targeted tests cover7-to90-day policy change, mixed-record preservation, ACK rollback/retry and old metadata restoration. Native CLI dump, isolated PG/CH restore, latest-cutoff physical filtering and source-advance rejection also passed with nonempty standard036 carry (schema includes041; its rows are empty in this native fixture), with latest-journal deletion of A and preservation of B. Targeted nonempty daily-package tests passed; complete daily activation/restore, strict PG metadata, full Docker and canonical activation still require their own new-stage evidence. Do not bypass guards or treat this preview as an older-image guarantee. See [governance evidence](../ACCEPTANCE_CANONICAL_GOVERNANCE.md).

### Preview: published-fact body migration and strict gates

These are the current worktree CLI contracts, **subject to mandatory per-site activation proofs**. At immutable main 3e052d8 the core activation guard is true; per-site proof, deletion and watermark checks remain mandatory. Check the matching source version and joint evidence, keep target HTTP closed, retain a full PG/files/keys backup and an independently current deletion journal. Configure environment variables privately beforehand; these commands do not inline or print database credentials.

```sh
npx tsx scripts/canonical-cli.ts status "$BAIZE_SITE_ID"
npx tsx scripts/canonical-cli.ts migrate-facts "$BAIZE_SITE_ID"
npx tsx scripts/canonical-cli.ts strict "$BAIZE_SITE_ID" "$BAIZE_FACT_PACKAGE_DIR" "$BAIZE_LATEST_JOURNAL_DIR"
```

`status` is read-only. `migrate-facts` writes producer-sealed 043 headers, 044 effects/vitals, 047 session/numeric/member/carry and finite 048 compatibility-cache bodies with completion receipts; it returns pruned=false/strict=false and does not prune PG bodies or activate canonical reads. Both writes require a clean site generation and no live worker lease. `strict` additionally verifies the actual signed fact package, source scope, current metadata closure, latest independent journal and key version before the production guard permits body pruning. A caller-supplied verified boolean, old package, missing body, unknown version, stale epoch or incomplete kind/zero marker is not proof. Do not bypass a closed guard.

048 has an8MiB per-bucket body limit and≤100rows/12MiB per batch; oversized bodies fail closed rather than promising unlimited capacity. Standalone history restoration with048 preserves original owner UUIDs and producer seals, and rejects existing target source-run UUID collisions. Heatmap coverage requires exact committed source-to-target batch mapping; clearing coverage while keeping the base would double count. Restore every sidecar, replay the latest journal and actually rebuild before exposing target HTTP. An unreconstructable unique historical baseline must be explicitly unavailable, never a false zero. Module-level targeted native tests do not replace the complete same-source CLI/Docker or production-activation matrix; see [governance evidence](../ACCEPTANCE_CANONICAL_GOVERNANCE.md).

### Limits of historical privacy topology

Daily-salt details written by uncontrolled pre-014 inputs may lack verifiable daily identity topology. Migration must not manufacture 038 lineage or 041 producer proofs from old visitor fields, page IDs or client-reported timestamps. Unknown topology cannot enter canonical/carry history migration requiring those proofs. Safe existing reports and exports may remain usable; this does not disable every legacy PostgreSQL site. The actual privacy-upgrade test preserves safe legacy reports/exports without identity aliases and verifies that the current native collector still accepts valid events.

Missing provenance, expired retention or incomplete historical reconstruction must remain explicitly unavailable or coverage<1. Empty historical rows are not proof of zero traffic, and a working current collector does not certify old history. The immutable 3e052d8 local matrix passed 100 unit +391 integration tests and22 E2E (20 Chromium,2 date-function cases), with clean Compose cleanup EXIT0; the core activation guard is true. Targeted worktree evidence is separate from delivered main acceptance. Independent strict restoration including the final routing-control versus signed-cache-body readiness check passed the actual three-file native matrix at16:26:59.


Current immutable local evidence: [main-3e052d8-local-final.json](../test-evidence/main-3e052d8-local-final.json). This is not external deployment or hosted CI. The1000-event strict CH integrity run passed, but query p95 was9.41s and watermark-lag p95 was63.71s; it is not an SLO success. The5000-event run and new application-image matrix remain pending. Historical failures are retained.

### Signed-backup gate for raw pruning (jointly verified at7fbb561)

Admin HTTP `POST /api/v1/sites/:siteId/canonical` with `{action:"prune"}` returns409 `canonical_backup_required`. It accepts neither server paths, backup JSON nor a verified boolean as authorization. PG raw pruning uses the operator CLI and the existing stable instance master key to verify an actual signed `backupCanonical` package, the exactly current independent deletion journal, site/scope/epoch/current generation and every original body hash. A stale backup or advanced journal requires fresh matching proof; failed verification does not prune.

With existing private operator configuration, select the actual site, successful backup and latest journal directories. These variables reference local paths and contain no inline credentials:

```bash
npx tsx scripts/canonical-cli.ts status "$BAIZE_SITE_ID"
npx tsx scripts/canonical-cli.ts prune "$BAIZE_SITE_ID" "$BAIZE_RAW_BACKUP_DIR" "$BAIZE_LATEST_JOURNAL_DIR"
```

`BAIZE_RAW_BACKUP_DIR` must be the single-site raw package, not a database dump or facts package. Successful `scripts/backup.sh` output places it at `canonical/<SITE_ID>` under the backup directory. Check that the complete signed raw package actually exists for that site. The per-site directory contains `manifest.json`, `events.ndjson` and `published.ndjson`. Direct `canonical-ops-runtime.ts` output is `<directory>/<SITE_ID>`; the whole shell backup layout is `backups/<name>/canonical/<SITE_ID>`. The backup produces raw packages for actual CH-authority canonical sites; an empty directory is not evidence for an unsupported site. Use the current independent journal, not its old snapshot copy. A PG shadow is not yet prune-eligible. Equivalent invocation is `node --import tsx scripts/canonical-cli.ts prune` with the same arguments. Read the existing v1 key from `KEYS_DIR` or `MASTER_KEY_FILE` through private configuration; do not create or print credentials. This gate is included in the7fbb561/494 local matrix; the historical3e052d8/491 result is unchanged.

冻结补记：ac86cd3浏览器30检查（28真实Chromium+2日期）实际PASS/0skip，96.441秒、EXIT0；其191/404完整后端全轮未复验，不叠加旧19计数。当前4384后续预算切片尚未全量通过；B真实3项仅证明服务器行为，200 exception风险仍待C适配，不能称adapter已验。aea2ece日期标记4单元PASS、浏览器未跑。预算口径为SELECT次数/decoded bytes/deadline，不承诺scan或heap限制。原FAIL全部保留。

Final1c fixed-load result:1000 PASS, final HTTP5120ms. 5000 FAIL:4900 accepted,2 unsent,39 delayed; query failures0; drainReached=false at120s, remaining backlog1350/max3250. Final query25.389s failed, assertionsExecuted=[]; no successful six-assertion integrity claim. Node peak730509312 bytes excludes DB services; source unchanged and all four cleanup flags true. No budget rejection occurred. Passing code/browser/image does not close this local performance gap or prove a speedup/SLO. Evidence: main-1c1cb65-independent-strict-5000.json and its record under docs/test-evidence, archived separately; earlier failures remain.

0a0c171包含三批候选及idlefatal修复。第四轮实际19/19 PASS（11budget+4server+3triple+1strictrestore）、0skip/0uncaught，另10单元/type/lint通过；这是提交前源码摘要绑定定向证明，不是新全局计数。原前三轮FAIL及bd完整EXIT1全部保留。0a新完整空库、镜像和固定负载正在准备，不预写通过；旧c890632、1c30/image、1c1000PASS/5000FAIL各按原源码阶段保留，不外推0a。
