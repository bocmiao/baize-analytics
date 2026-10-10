# Baize Analytics

Free self-hosted, privacy-oriented website analytics with a Chinese-first UI. TypeScript, Fastify, React/Vite, PostgreSQL and Redis. All product features are free; operators pay for their own external AI/SERP services.

This is a private development repository. Feature acceptance is recorded separately from design documents. No public release, registry image publication or external deployment is performed by this workflow.

Install Docker and Compose v2, then run `./install.sh` in the existing checkout. The app listens on localhost:3000. Create the first administrator and website in the setup wizard. Secrets are generated locally and preserved on repeated installation.

See docs/deployment.md for backup, new-database restore and downtime upgrade rollback; docs/development.md for validation commands. Application: AGPL-3.0-only. Independent tracker: MIT. No paid feature gates.

English operations, development, API, migration, compatibility and privacy guides are available in [docs/en](docs/en/README.md).

Data flows from the MIT tracker through Fastify validation and in-memory anonymization to a PostgreSQL transaction containing events and an outbox. Workers reconstruct sessions by event time and publish aggregates. Scoped APIs serve the React dashboard with disposable Redis caches. Deletion is recorded in an independent durable journal before database completion; restoration requires the current journal and its integrity watermark, as well as separately protected versioned keys.

| Area | Acceptance boundary |
|---|---|
| Collection and analytics | Real PostgreSQL and browser tests; see [feature checklist](docs/IMPLEMENTATION_CHECKLIST.md) |
| Governance and deletion | Real API, database and filesystem tests; see [governance acceptance](docs/ACCEPTANCE_GOVERNANCE.md) |
| External accounts | Secure connectors and simulated integration; live GSC/GA4/SERP/AI/WeCom accounts have not been validated |
| Operations | Local Docker install, backup, fresh-volume restore and rollback; see [operations evidence](docs/validation-ops.md) |
| P2 | Partial; full ClickHouse migration and complete UI localization remain unfinished |

[Dashboard screenshot](docs/screenshots/dashboard-acceptance.png) uses acceptance events persisted to a real database, not production traffic. Daily-salt mode disables identify, cross-day distinct visitors and retention analysis. The design specifications and detailed development audit reports remain authoritative in Chinese; the English user and operations guides are linked above.
