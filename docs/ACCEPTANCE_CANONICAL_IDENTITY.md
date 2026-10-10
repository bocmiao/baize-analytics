# Canonical identity ledger and immutable body projection

Identity episodes remain PostgreSQL metadata ordered by event time. A delayed A identify before an already received B identify splits the A interval at B's actual event time. Same-time conflicting ownership rejects, while same ownership retries are idempotent. `registerIdentity` now checks site privacy mode and refuses daily-salt registration independently of the collector. For ClickHouse authority it updates only identity ledger/latest-state metadata, never rewrites PG/CH event bodies. Default PG authority retains existing delayed-event payload correction.

`identityFirstSeen` uses accepted event-key timestamps and current-epoch canonical manifest member timestamps, excluding tombstone intervals, with no PG event-body dependency. It does not infer ownership before the explicit identify timestamp or create cross-day daily-salt identity.

`projectEventIdentity` is called by the ops-owned canonical reader after immutable body/member hash validation, on the same snapshot client, before temporary-table filtering. It copies payloads, removes the original user_id, then applies the authoritative event-time binding for standard mode only. Deleted visitor/user/identity intervals are hidden even during a pending physical cleanup retry. Daily-salt always removes user_id. Scope is one site and at most1000 events per verified CH batch. Body bytes/checksum and accepted wire hash remain unchanged; backup retains original immutable body plus the complete PG metadata ledger.

Collector's canonical identify/user_id prohibition can now be removed because temporal ownership is metadata-derived. Replay prohibition remains pending its separate governance integration. The global authority activation gate stays false. There is **no production canonical202 cutover or pruning claim** in these tests.

Actual validation:

```sh
TEST_DATABASE_URL=postgresql://baize_dev@127.0.0.1:5432/baize_dev CLICKHOUSE_TEST_URL=http://127.0.0.1:38123 npx vitest run tests/integration/canonical-identity.test.ts tests/integration/identity-switch.test.ts tests/integration/revenue-identity.test.ts
```

Three files9/9 PASS at09:52:16 UTC,3.48s. New cases use actual PG/CH with poolmax1 and the genuine identity, governance-contribution, canonical-publication and precise-purge helpers: immutable bodies received before identify; B then late A registration; event-time projected A/B ownership; no PG event bodies; A interval tombstone/purge; anonymous old A retry rejects; before physical CH cleanup the projection already hides A; actual exact CH mutation acknowledges deletion; normal EventStore read retains B and its hashed identity; A experiment contribution removed, B conversion contribution/converted flag retained. Daily-salt stripping and scope limits are negative cases. The test's deletion journal barrier callback is an explicit empty fixture; it does not assert real filesystem fsync or full delete HTTP/restore acceptance, which are tracker/ops-owned integration gates. No mock event-query results are used.

After adding the independent daily-salt registration refusal assertion, TypeScript/targeted ESLint PASS and the same command with `tests/integration/canonical-ingest.test.ts` added passed **4 files12/12 at09:52:54 UTC,5.09s**. This is the final small owned regression snapshot. Activation remains disabled; no new migration was needed.
