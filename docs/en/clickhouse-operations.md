# Optional ClickHouse operations

The default Compose stack does not run ClickHouse. Set an independent `CLICKHOUSE_PASSWORD` in a restricted `.env`, then explicitly enable the local replica:

```sh
docker compose -f docker-compose.yml -f docker-compose.clickhouse.yml --profile clickhouse up -d --wait
```

The profile uses ClickHouse25.8-alpine, a separate `clickhouse_data` volume, and no published HTTP/native ports. The app connects only through the project network. Infrastructure configuration does not switch site reads: explicitly enable the site's mirror, inspect epoch/watermark/coverage/source indicators, and enable preferred replica reads after verification. PostgreSQL remains authoritative; fallback is explicit. Do not describe this as a completed PostgreSQL-metadata-only migration or commit/log the replica password.

The existing backup script saves canonical PostgreSQL, current deletion journal/watermark, app files and a separately protected key package. It does not back up the ClickHouse volume and is not a canonical ClickHouse or multi-node cluster backup. Replica details can be rebuilt from retained PG events; expired raw events cannot be reconstructed from rollups. Report incomplete historical coverage honestly.

Recovery first restores a new PG database plus isolated data/key volumes, replays current deletions and verifies persistent aggregation completion. It clears copied replica pointers/upload/maintenance tasks and selects PostgreSQL. Rebuild an independently configured target replica, verify it, then enable target reads. Fresh recovery does not inherit or delete the live source endpoint; changing only query parameters on the same endpoint is not an independent namespace.

Any separately managed native ClickHouse backup or volume snapshot is a replica snapshot. Record the server/schema version, site/epoch/generation/watermark and corresponding PG recovery point. Never publish an old pointer directly after restoring it: reconcile against current authoritative PG and deletion/retention state, then publish a new epoch. Missing current deletion state must fail closed. Multi-node replicated-table backup consistency and canonical recovery without PG event data remain unverified.

Pause unrelated image pulls/builds during upgrades and monitor filesystem space. The profile does not establish an automatic cross-version rolling-upgrade guarantee. A final application image covering migration026 and later batch changes will be built and tested only after the integration owner freezes its source.

Pinned image: `clickhouse/clickhouse-server:25.8-alpine@sha256:87e0a5b72f5465b18eacca7c76850e7ff551c9795c50e451f5646299e5e24146`, matching the actual locally tested image and CI. This digest-only configuration update was validated without another pull or restart.
