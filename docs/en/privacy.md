# Privacy behavior and operator responsibilities

Baize is self-hosted. The operator controls the database, Redis, encryption keys, retention policy and connected providers. This document describes technical behavior; it does not replace an operator's privacy notice, consent assessment or legal review.

## Consent and collection

Site configuration is authoritative. When consent is required, the tracker stays inactive until consent is granted; a failed configuration fetch keeps collection disabled. Before consent it does not create a visitor identity or queue analytics events. Revocation stops modules, drops queued events, aborts pending requests and clears the tracker visitor cookie. The optional consent audit request records revocation. Enable collection only for the intended site origins and honor the configured consent policy.

The collector receives a source IP in memory for keyed visitor derivation, rate controls and offline geolocation. It removes raw IPs from persisted event payloads. Standard mode stores a site-scoped keyed identifier derived from the normalized full address for distinct-IP counts, plus an anonymized network prefix. The internal identifier is removed from statistics responses and exports; a secondary non-reversible display key supports report filtering. Daily-salt mode stores no stable IP identity or prefix. Missing GeoIP data produces unknown geography. Crawler logs follow the same IP policy, discard raw user agents, and retain sanitized paths for at most 90 days or the site's shorter retention period. Do not send secrets, email addresses, payment details or personal identifiers in URLs, event names or custom properties: automated sanitization cannot infer every sensitive business field. API/body access logs and reverse-proxy logs need an independent retention and redaction policy.

## Identity and daily-salt limitations

Standard mode supports explicit `identify` with a site-keyed hashed user identifier and event-time identity intervals. A shared browser can represent different users at different times; user deletion must remove the relevant intervals without conflating the next user. Deletion by visitor and deletion by identified user have different scopes.

Daily-salt mode derives an identity using a site secret and the event's day, scopes page and order identifiers by day, rejects `identify`, and strips stable identity properties. It cannot provide cross-day identity linkage or genuine cross-day retention. Do not interpret a disabled retention view as missing data or claim cross-day tracking from this mode.

## Replay and heatmaps

Replay and heatmap collection are optional site settings. Replay masks all inputs and text, blocks private-marked elements, iframes, video and canvas, and disables canvas recording. Operators should mark sensitive regions with `baize-private` or `data-baize-private`, inspect recordings on their actual application before enabling them, and consider whether their content warrants disabling replay entirely. Replay payloads remain potentially sensitive structural data even with masking. Consent revocation stops replay and heatmap collection.

## Retention, deletion and recovery

Each site has its own event-retention boundary. A physical partition shared by sites cannot be dropped just because one site's retention expires. Raw-event expiry limits later recalculation: retained historical summaries cannot reconstruct individual event membership after raw data has expired.

Deletion is coordinated by site locks and tombstones at collection and worker boundaries. The independent deletion journal is fsynced with a durable watermark before completion is acknowledged. Deletion invalidates derived aggregates and downloadable exports; file-cleanup failures remain durable retry tasks rather than being reported as successful removal. Keep this journal separate from expiring database snapshots. A backup can contain previously retained personal data; limit backup access and lifetime. Restoring an older backup requires the current journal and watermark so later deletions are replayed before queries are opened. Missing or reset journals block recovery.

## Sharing, connectors and AI

Share links are bearer credentials for the shared result: restrict their scope, set expiry and revoke them when no longer needed. Administrative sessions and scoped API tokens do not belong in tracker scripts.

Connector credentials are encrypted under separately protected versioned keys. AI uses operator-supplied credentials and can send query context to the selected provider; review the provider and the exact feature before enabling it. External account tests that have not been run are recorded as unverified. The application does not create paid accounts or production credentials automatically. Protect exported files, backup packages and operational logs with the same care as the live database.
