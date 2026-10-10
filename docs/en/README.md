# English documentation

- [Installation, backups, recovery and HTTPS](deployment.md)
- [Development and tests](development.md)
- [API and collection protocol](api.md)
- [Privacy behavior](privacy.md)
- [Application/database compatibility](compatibility.md)
- [Forward migrations, GA4 boundaries, journal/files/keys recovery and downtime upgrades](migration.md)
- [Optional ClickHouse operations and canonical-storage boundaries](clickhouse-operations.md)
- [Executed operations validation](validation-ops.md)
- [Dependency inventory and SBOM](../licenses/README.md)

The Chinese project specification and implementation corrections remain the design references. Actual feature acceptance is recorded in the implementation checklist and acceptance reports; translated operational instructions do not turn unimplemented or untested features into completed work.

Site exports are bounded at100,000 rows per table and are not full-instance backups. GA4 exact-window reports preserve provider deduplication and never merge native identities. Real Google/MaxMind/SERP/enterprise provider accounts are separate from local fixture acceptance. Real Ollama inference needs no account, but its official binary download was blocked by the existing proxy403; resource feasibility does not prove inference success. Current AI chart/evidence and031 deletion additions are marked as pending in the manuals until the next immutable validation batch.

Current feature status and preserved failures are in the [implementation checklist](../IMPLEMENTATION_CHECKLIST.md), with version/count provenance in [main validation](../VALIDATION_MAIN.md). Fifth local272 application tests plus19 checks (17 browser,2 date functions), sixth pre-deletefix289 plus20 checks (18 browser,2 date functions), and old CNB223 hosted18 E2E are distinct runs, never additive or interchangeable.
