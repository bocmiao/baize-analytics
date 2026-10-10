# Executed operations checks

These results describe commands actually executed in the private development environment. They do not imply a public deployment, remote CI completion or real provider-account acceptance.

| Check | Result | Evidence |
|---|---|---|
| Docker daemon | Passed | Local Unix socket, Docker 28.4.0 |
| Node 24 image | Passed | `docker pull node:24-bookworm-slim`; image digest recorded in the Chinese operations log |
| Compose and shell validation | Passed | `docker compose config --quiet`, `bash -n install.sh upgrade.sh scripts/*.sh` |
| Local SDK behavior | Passed | Consent without pre-consent identifiers, immutable retry IDs, boolean properties, parameterized ClickHouse queries and disabled-adapter rejection |
| Full local build and install | Passed | `install.sh`: actual npm installation, tracker/web/server build and healthy app/PostgreSQL/Redis containers; initial Buildx-directory and copied-file permissions were fixed before the passing rerun |
| Strict fresh-volume restore | Passed | `scripts/ops-lifecycle-test.sh` exited 0; `/tmp/baize-ops-fresh-restore.log`: missing and reset journals rejected before target database creation; actual exported event data backed up, then visitor deleted; restored new database has 0 events/1 tombstone; fresh data/key volumes retain an ordinary asset fixture and contain 0 revoked export files; durable cleanup pending=0 |
| Key-package separation | Passed | No plaintext master key in database backup or data archive; master/versioned keys in a separate restricted recovery package |
| Upgrade and failure rollback | Passed | Same-image upgrade, unavailable-image failure and a locally derived image with a committed schema column followed by HTTP503; after rollback the probe column is absent and the old application responds healthy |
| Native journal corrections after image build | Passed natively | Typecheck, selected ESLint, native strict initializer and journal missing/reset/truncated/older-prefix tests; latest image `cf9ba00b6794` predates the subsequent database-marker startup guard, legacy migration tool and temporal-null validation correction |
| WordPress PHP | Syntax passed | PHP8.3 CLI container `php -l`; actual WordPress deployment not tested |
| ClickHouse adapter | Passed | Isolated ClickHouse25.8 schema/write/duplicate/FINAL parameter-query/synchronous-delete checks; reliable application dual-write and migration are still incomplete |
| npm SBOM/license metadata | Passed | `npm sbom` produced CycloneDX with 353 components; inventory lists 362 lockfile entries and no missing declared license metadata; not a formal release audit |
| Windows launcher | Not run | This environment is Linux |
| Hosted CI | Not run | A checked-in workflow is not evidence of a passing hosted run |

The asset fixture verifies ordinary restored-file preservation; it is not an actual licensed GeoIP database. Mocked connector tests do not validate real external credentials or paid services. No image was pushed, no external service was deployed and no other repository was modified.

Restore rebuild P1 correction: `runRestoreRebuild` checks durable state for every target site: generation equals processed generation, no owner/lease, zero attempts, no error or dead letter. A false worker return is never completion evidence. The real PostgreSQL `tests/integration/restore-rebuild.test.ts` run passed 5/5 checks: actual dirty-state rebuild, false-return dirty rejection, transient persisted failure retry, actual SQL42P01 failures reaching dead-letter rejection, and an active lease hiding unfinished work. Typecheck and selected lint passed. The complete Docker matrix for this correction has not yet been rerun; earlier green lifecycle results do not validate this newer version.

The new `scripts/ops-restore-failure-test.sh` lifecycle scenario uses a locally derived migration that makes the goals table unavailable, causing an actual worker SQL42P01 failure. It asserts a retained dirty/dead-letter target database, no success manifest/output, unchanged source container and DATABASE_URL, and healthy source traffic. Test cleanup happens only after assertions. Shell syntax and diff checks passed; the actual new Docker scenario is pending the final stable build and is not yet recorded as passed.
