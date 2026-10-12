# Lite local deployment

Lite uses one Node application container and a local SQLite database. PostgreSQL,
Redis and ClickHouse are not required for this profile. Keep the existing tracker
protocol, repository license and UI. Run on Linux with Docker Compose v2, a local
filesystem and enough storage for the database, WAL, exports and verified backups.
Network filesystems and multiple writers are rejected. Windows is not validated.

```sh
docker compose -f docker-compose.lite.yml build
docker compose -f docker-compose.lite.yml up -d --wait
curl --fail http://127.0.0.1:3000/healthz
```

Open the local URL and create the first administrator. The published port is
loopback only. The server creates a private master key in the separate key volume;
retain that volume separately from data backups. No external API key is required
for basic analytics. Changing the image does not move Lite data into standard
PostgreSQL. Use the explicit offline migration procedure and its compatibility
checks before any manual traffic switch.

For a prebuilt application image, use `docker load -i application-image.tar.gz`,
set `BAIZE_LITE_IMAGE` to the loaded tag and run the same Compose command without
`build`. The application image archive is not a complete Docker installation or
an archive of user data. Verify the published SHA256 before loading it.

Do not copy a live SQLite file to claim a consistent backup. The compiled
`dist/server/scripts/lite-ops.js` command uses the same writer ownership lock and
freeze barrier as the application, verified SQLite backup, signed inventory and
separate key package. Stop the application before running an offline CLI against
its volumes; a second writer is rejected. Check the CLI usage before operating:

```sh
docker compose -f docker-compose.lite.yml run --rm --no-deps app \
  node dist/server/scripts/lite-ops.js
```

Restore uses fresh target data and key directories, verifies the current deletion
journal and database tombstones, and does not switch traffic. Keep the original
volumes until the restored target has passed integrity, statistics and deletion
checks. Site retention uses an exact millisecond cutoff; incomplete retired
boundary data and unprovable session history are shown as unavailable.
