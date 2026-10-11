# 058 raw retirement boundary

The sealed `analytics_raw_retirement_frontiers` row records only a real canonical `expireBefore` physical ACK. It is written on the same held PostgreSQL transaction and site gate, including an empty retired range. It never derives a physical retirement cutoff from a FULL producer or an old coverage witness. Its cutoff only increases within the same canonical namespace.

After full original fact authentication, the strict worker rejects a requested cutoff before this physical frontier, before any reducer staging or owner/hour/carry publication. The existing latest-producer boundary still applies. This also protects the committed TTL followed immediately by retention expansion, before a shrink-window producer runs, with or without a 057 witness.

The original isolated baseline reproduced both timing variants as failures: the expansion was allowed. The isolated fixed regressions passed both variants. The immutable 15e1cf0 coverage and independent signed restore suite passed all eight cases; detailed source bindings and original failures are retained in PERFORMANCE_INCREMENTAL_056_VALIDATION.md.

A missing legacy frontier is not evidence of absence of earlier retirement. The new row does not retroactively certify legacy physical history. Unknown namespace or a bad frontier HMAC rejects; signed independent restore must verify the original row and exact namespace package, then explicitly rebind only the namespace and metadata seal while preserving the cutoff.

This PostgreSQL row does not make ClickHouse and PostgreSQL atomic. A physical ACK followed by PostgreSQL rollback can leave the physical mutation without the new frontier. The committed-TTL timing fix does not claim to close that recovery gap; uncertain legacy or failed transitions cannot initialize broader historical coverage by guessing from a FULL or old run.

## 059 upgrade origin classification

058 alone does not cover a genuine pre-058 TTL commit whose shrink producer has not run. 059 classifies existing sites without a verifiable frontier as `legacy_unknown`; the absence of a row cannot mean new or never retired. Existing frontier rows classify as `known_frontier`, but the actual 058 HMAC and namespace still must validate.

A real post-059 site INSERT creates `new_site_pending`. Only the worker's authenticated first FULL, with no previously published baseline, can sign `authenticated_new_site` in its actual publication transaction. This includes the ordinary initial PostgreSQL FULL so a subsequent PG-to-CH activation retains its genuine new-site origin. A deleted marker is not recreated as new. A legacy unknown FULL cannot upgrade its classification or initialize new valid historical coverage.

Strict worker guards run after original complete source authentication and before reducer/publication mutations. Signed independent restore preserves the exact classification and origin UUID; restoring unknown remains unknown. The original site-private HMAC authenticates new-site birth metadata, while physical retirement remains separately namespace-bound in 058. New 059 behavior has lightweight unit/static checks only until separately recorded real regressions.
