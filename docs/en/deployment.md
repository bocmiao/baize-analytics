# Local self-hosting, backups and recovery

## Supported installation paths

Recommended: Linux Docker Engine, Compose v2 and Bash, `./install.sh`, then create the administrator at localhost:3000. Private delivery now includes verified application-image saves, Node-ready and bundled-node packages; there is no public registry/Release publication. See the [three deployment paths](../deployment-methods.md). For an image save, record the exact `Loaded image: ...` tag from `docker load`, match it to the delivery manifest and use that tag for `BAIZE_IMAGE` or `BAIZE_LITE_IMAGE`; do not reuse an older delivery tag or the Compose default. The interactive examples validate the profile/tag format, not the archive checksum. Manual Compose requires `.env` and a mode-0600 master key owned by the numeric app user, followed by `docker compose build app` and `docker compose up -d --wait`. An existing `.env` image tag is used for both normal and optional build-CA paths; `.env` is never executed.

Backup, restore and upgrade additionally require **host Node 24+, sha256sum, GNU-compatible sort -z, find/xargs/tar/cut**. Upgrade also requires fallocate, GNU sed and mktemp. Read-only preflight checks run before creating backup output or stopping the app; scripts do not install tools. Windows operations have not been validated.

Source production: supply independent PostgreSQL 17, DATABASE_URL, persistent DATA_DIR/KEYS_DIR and MASTER_KEY_FILE (0600). Redis 7 and REDIS_URL are optional; without Redis, bounded single-instance fallback does not guarantee shared limits or cache across instances. Run `npm ci`, `npm run db:migrate`, `npm run build`, then `node dist/server/src/server/main.js`. `npm start` and maintenance tools still use tsx, so pruning development dependencies can break operations. Native runtime packages supply compiled launch/maintenance interfaces, a Node-panel entrypoint and an operator-reviewed [systemd example](../../deploy/baize.service.example). Independent supervisor restart has been tested; actual systemd installation, panel instances and Kubernetes/Helm deployments remain separate. Unlike source npm start, the derived runtime-package npm start calls compiled panel-start without tsx.

Compose connects its internal postgres/redis services; setting DATABASE_URL/REDIS_URL in `.env` alone does not override them. PUBLIC_URL does not enable TLS or public access. Data uses app_data, app_keys, postgres_data and redis_data volumes, with optional clickhouse_data. Recovery still needs the current source Compose environment and latest journal/proof; it is not an independently validated cross-host disaster-recovery package. See [historical evidence](../deployment-history.md); performance failures remain recorded.

Requirements: Docker Engine and Compose v2. Build from the private checkout with `./install.sh`; the installer neither publishes an image nor downloads a Baize release image. It preserves existing `.env`, keys and volumes, generates a random database password and 32-byte master key with mode 0600, builds locally, and waits for health checks. Create the first administrator in the browser; there is no fixed initial password. The default listener is `127.0.0.1:3000`. PostgreSQL and Redis have no published ports.

The master key is `.baize/master.key`; versioned encryption keys use the separate `app_keys` volume and `KEYS_DIR=/app/keys`. Losing these keys makes existing connector secrets unreadable. Keep key backups separately protected from database backups. Proxy CA trust is mounted as a BuildKit secret and TLS verification remains enabled. For external connector testing in the managed cloud environment, use `docker compose -f docker-compose.yml -f docker-compose.cloud.yml` to mount the session `CODEX_PROXY_CERT` and set `NODE_EXTRA_CA_CERTS`; preserve the injected proxy and network policy.

`./scripts/backup.sh` creates a new directory containing a custom-format `pg_dump`, the independent deletion journal and watermark, an application-data archive excluding encryption keys, the local image identifier, and checksums. Keys go to a separate mode-0700 package under `BAIZE_KEY_BACKUP_DIR` (default `.baize/key-backups`). The database backup contains only a key fingerprint and package reference. Schedule backups with an operating-system timer and copy them to restricted off-machine storage. Retain the independent deletion journal beyond ordinary database-backup expiry.

`./scripts/restore.sh BACKUP_DIR baize_restore_NAME` refuses an existing target database or target volume. Before creating a database it verifies checksums, key identity, and that the current independent journal matches its durable watermark and extends the backup journal. Missing, truncated, reset or mismatched journals fail closed. The script restores the database, application data and versioned keys into a new database and separate named volumes, then records `.baize/restores/<database>.json`. It preserves the current stack and does not switch traffic.

Recovery replays deletions made after the backup, physically removes revoked export files from the restored data volume, cancels old export/delivery/external jobs, pauses scheduled reports, rotates aggregation epochs, completes recalculation and invalidates only affected site cache prefixes. Verify counts, files, keys and deletion boundaries before configuring a target application with the recorded database and volumes. Resume schedules explicitly after review.

`./upgrade.sh LOCAL_IMAGE_TAG` stops the application and takes a recovery point before migrating and starting an already-local image. If migration or health checks fail, it validates the latest journal before restoring the database snapshot, application-data snapshot and previous image while preserving the current journal and watermark. This is a downtime upgrade. Returning to an older image tag alone is not a database rollback. See [compatibility](compatibility.md).

A legacy nonempty deletion journal without a watermark requires an explicit migration. Stop the application, then run `node --import tsx scripts/ops-migrate-journal.ts` in a maintenance container that can access the original database and data volume. The tool verifies that each database deletion marker exists in the independent journal before writing and fsyncing a watermark. It does not recreate missing logs and is never run automatically during recovery.

Run `bash scripts/ops-lifecycle-test.sh` only on a disposable test copy. It creates an isolated named stack and removes that stack's volumes after validating installation, backups, fresh-volume recovery and upgrade failures. Actual results are recorded in [operations validation](../validation-ops.md).

GeoIP falls back to unknown without an offline database. MaxMind, GSC, SERP and AI credentials are supplied by the operator; the application does not buy services or generate production accounts. `run.bat` is available for Windows after setting `DATABASE_URL`, `REDIS_URL` and `MASTER_KEY_FILE`; Windows execution requires validation on a Windows host.

## Operator-managed HTTPS reverse proxy

Keep the application on loopback. Set `PUBLIC_URL` to the actual HTTPS URL and restrict `TRUSTED_PROXIES` to the proxy's real CIDRs. Never trust arbitrary Internet forwarding headers. The following uses certificates already supplied by the operator:

```nginx
server {
  listen 443 ssl;
  server_name stats.example.com;
  ssl_certificate /etc/ssl/local/stats.fullchain.pem;
  ssl_certificate_key /etc/ssl/local/stats.key;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off; # Live SSE stream
  }
}
```

Apply an appropriate request-body limit and retain the collector's site/CORS restrictions. Do not expose database or Redis ports. Verify your domain, certificate, proxy and firewall before enabling external access.

Before stopping the working application, upgrades require at least 2GiB free workspace space (`BAIZE_UPGRADE_MIN_FREE_BYTES` can raise the threshold) and allocate a 128MiB emergency rollback reserve, released before rollback. This is not a guarantee against concurrent Docker pulls exhausting storage. Pause unrelated builds/pulls during upgrades and monitor the Docker data filesystem. Keep the recovery point if rollback fails, free space and complete manual recovery; a previous image or partial rollback is not success.

The following applies only to PG-authority with an optional mirror, not to explicitly activated strict ClickHouse authority. Fresh-database recovery disables ClickHouse by default, clears restored replica pointers and old upload/maintenance jobs, and selects PostgreSQL. It does not read, delete or clean the live source replica. To supply a separate target, explicitly set `BAIZE_RESTORE_CLICKHOUSE_URL`, `BAIZE_RESTORE_CLICKHOUSE_USER` and `BAIZE_RESTORE_CLICKHOUSE_PASSWORD`; the endpoint must differ from the source. Changing only a query/database parameter on the same endpoint is rejected because the replica table namespace is fixed. After recovery an administrator must explicitly enable and rebuild the target mirror. Same-database upgrade rollback retains its configured replica deletion barrier and does not report success on a failed barrier.


Default PG, optional mirror and explicitly activated strict ClickHouse authority are distinct storage modes. Strict recovery requires an independent signed target, current deletion journal and retention proof; follow the [migration runbook](../migration.md).

Canonical/history restore requires `BAIZE_RESTORE_SOURCE_MAINTENANCE=1` and `BAIZE_RESTORE_SOURCE_SINGLE_INSTANCE=1`, with independent workers, cron and all external writers paused. The script reserves the project atomically, stops the original app and rejects other connected PG clients, then uses an idle container with the same immutable image, numeric user and mounts to obtain current proofs. It restarts the exact original container on success, failure and catchable signals; a previously stopped app stays stopped. Restart failure revokes success. This is downtime maintenance, not a distributed lock: disconnected external writers and SIGKILL/host failure require operator recovery. Proofs expire after ten minutes. No traffic is switched automatically.

When historical namespaces are present, the optional CH profile must forward `HISTORY_STORE_ENABLED=1`; default remains 0. Do not disable the history store required for deletion replay.
