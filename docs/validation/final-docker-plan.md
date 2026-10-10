# Next frozen-source Docker validation

This is an execution plan, not a passing Docker report. The previous c610 lifecycle evidence remains limited to its original source. Do not trigger CNB synchronization or builds for this run.

The integrator supplies an immutable checkout and its verified main commit as `APP_ROOT` and `FROZEN_SOURCE_SHA`. The native canonical entry refuses an `APP_ROOT` different from its script checkout and records the SHA-256/count of the complete application artifact manifest. A commit label alone does not prove image contents; the lifecycle additionally compares host and image manifests.

After the integrator releases the heavy resource gate, preserve the existing c610 image under a fallback tag, then run from the frozen checkout:

```bash
cd "$APP_ROOT"
node scripts/ops-artifact-manifest.mjs > /tmp/baize-final-source.sha256
APP_ROOT="$APP_ROOT" bash scripts/ops-lifecycle-test.sh
```

Capture each command's actual exit status and retain build, container and failure logs. Installation must produce a new image from this source. The lifecycle checks compiled startup, real HTTP administrator/site/collector data, export files, independent key packaging, isolated data-volume restore, missing/reset latest-journal rejection before database creation, deleted visitor replay, actual worker SQL failure with a retained diagnostic target and no success marker, successful upgrade, and database/application rollback after a committed schema mutation plus unhealthy application.

Run the optional ClickHouse shell case on a separate owned `baize_lifecycle_*` stack with the local Compose overlay. It accepts only the overlay's `clickhouse` service, never the development ClickHouse endpoint:

```bash
OPS_ISOLATED_STACK=1 APP_ROOT="$APP_ROOT" bash scripts/ops-canonical-lifecycle-test.sh
```

This case exercises the real `backup.sh` and `restore.sh` wrappers, including exported PostgreSQL snapshot metadata, canonical bodies, 028 namespaces, independent target PostgreSQL database and data/key volumes, latest durable deletion replay, retained ClickHouse authority and zero PostgreSQL raw bodies. A source manifest/body digest is compared before and after restore. A fresh database on the same owned ClickHouse server proves namespace isolation; it does not prove recovery after losing that server or disk. Direct fixture authority is test-only and does not enable operator activation.

The separate native entry may use existing development PostgreSQL/ClickHouse services, but only its random own databases:

```bash
APP_ROOT="$APP_ROOT" FROZEN_SOURCE_SHA="$FROZEN_SOURCE_SHA" \
  BAIZE_OPS_POSTGRES_CONTAINER=baize-dev-postgres \
  npx tsx scripts/ops-canonical-entry-test.ts
```

Its existing 041-native fixture has empty topology rows. Nonempty producer-sealed topology mapping and A-delete/B-preserve have separate real integration evidence; do not describe an empty native table as a nonempty operational test.

Resource preflight observed 17 GiB free on a 32 GiB filesystem, with the c610 application image approximately 508 MB. Recheck before execution and each derived fault image; budget at least 8 GiB available for the matrix and preserve the existing 2 GiB upgrade disk gate. Clean only named test-owned resources after saving evidence. No global prune, deployment, changes to original PG/Redis/ClickHouse services, or reuse of an older image as new-source acceptance.
