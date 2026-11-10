# Development and tests

Use Node 24 and the checked-in lockfile. Configure an isolated PostgreSQL 17 DATABASE_URL, DATA_DIR, KEYS_DIR and MASTER_KEY_FILE; Redis 7 and REDIS_URL are optional. Keep data and private keys outside source and public directories.

```sh
npm ci
npm run db:migrate
npm run build
npm run dev
```

Build the frontend before starting a fresh checkout. The build generates dist/web, public/tracker assets, dist/server and the standalone updater. The compiled server entry is node dist/server/src/server/main.js; source npm start and maintenance scripts still require tsx. Follow [runtime staging](../runtime-artifact.md) when pruning dependencies.

Run lint, typecheck, unit tests and build, then PostgreSQL integration tests and Playwright browser tests. TEST_DATABASE_URL must reference isolated test storage. Install Chromium and start the appropriate test application. Never seed fixtures into a business instance. Deployment changes also require the lifecycle checks in scripts/ops-lifecycle-test.sh.

Strict-storage browser tests use playwright.strict.config.ts with E2E_STRICT_FACTS=1, TEST_DATABASE_URL and CLICKHOUSE_TEST_URL. They require actual guarded canonical activation, not database flag overrides. Only random test sites and isolated body namespaces may be deleted by these tests; a skipped strict test is not a passing result. See the [complete test instructions](../development.md).

The application is AGPL-3.0-only; packages/tracker is MIT. sdk/miniprogram.ts exports createMiniProgramTracker with injected transport and secure ID generation. Consent-disabled collection creates no visitor identity or event queue; retries preserve event IDs. The WordPress plugin protects administrative settings and excludes administrator visits.

Default PostgreSQL authority, optional ClickHouse replicas and controlled canonical ClickHouse storage have different recovery requirements. Use the [migration runbook](migration.md) and preserve transaction, deletion-journal, authentication and coverage semantics. See [API](api.md), [privacy](privacy.md), [compatibility](compatibility.md) and [licenses](../licenses/README.md).
