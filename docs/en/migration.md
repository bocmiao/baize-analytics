# Installation, upgrades and migration runbook

For operators of a self-hosted instance. Examples act only on the explicitly selected local instance; they do not publish a site, change repository visibility or switch production traffic. [API manual](api.md) · [中文](../migration.md) · [Deployment](deployment.md). Provider accounts and paid APIs are not required to read or locally validate these procedures.

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

## 下一批AI删除与百度手动迁移边界 / Pending AI deletion and Baidu import boundary

工作树031整site失效拟清AI派生答案/证据/建议与相关导出，保留预算账本；新的物理清理hooks未纳第五272/19和第六pre-deletefix289/20。恢复须重放最新journal后失效这些旧衍生内容，待新完整验收，不把旧镜像假称已支持。

Pending031 invalidates site-derived AI answers/evidence/suggestions/exports while retaining budget accounting. Physical cleanup hooks are not part of fifth272/19 or sixth pre-deletefix289/20. Restored historical derivatives must be invalidated after latest-journal replay; acceptance is pending.

百度普通站长搜索分析公开读取API截至2026-10-10未证实，官方产品说明可读不等于API可用。2015关键词下载说明没有当前CSV样本；通用自定义模板+列映射不可宣称原生百度兼容。搜索资源URL提交、百度统计PV/UV搜索词和自然搜索展现/排名是不同数据，不能互相冒充。详见[官方搜索分析](https://ziyuan.baidu.com/college/articleinfo?id=3415)、[2015下载说明](https://ziyuan.baidu.com/wiki/571)、[统计搜索词API](https://tongji.baidu.com/api/manual/Chapter1/source_searchword_a.html)。

Baidu public search-analysis read access remains unverified; available product documentation is not an API contract. No current native CSV sample is available. Custom import templates/column mapping cannot be described as native compatibility. URL submission, Tongji PV/UV search words and natural-search impressions/rank must remain separate sources.
