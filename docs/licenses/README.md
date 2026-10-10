# Dependency metadata and SBOM

The application is `AGPL-3.0-only`; the standalone tracker under `packages/tracker` has its own MIT license. The generated artifacts describe the npm lockfile, including development and optional packages:

- `sbom.cyclonedx.json`: npm-generated CycloneDX 1.5 SBOM.
- `npm-license-inventory.json`: package/version/license/path/integrity metadata, lockfile SHA-256 and an explicit unknown-license list.
- `npm-license-inventory.csv`: the same package license rows for review.

Regenerate from the repository root after changing the lockfile:

```sh
npm sbom --package-lock-only --sbom-format cyclonedx --sbom-type application > docs/licenses/sbom.cyclonedx.json
node scripts/ops-license-inventory.mjs
```

The executed inventory contains 362 lockfile package entries and 0 missing license fields. A declared SPDX expression is package metadata, not independent proof of license terms or compatibility. Review actual distributed files, notices, transitive licenses and optional binaries before a formal release. Review any future `UNKNOWN` entries manually; do not replace unknowns with an assumed permissive license. Docker base images, PostgreSQL, Redis, operating-system libraries, external datasets and services are outside this npm inventory. This is a generated dependency inventory and SBOM, **not a completed legal, supply-chain or formal release compliance audit**.
