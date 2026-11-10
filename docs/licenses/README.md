# Dependency metadata and SBOM

The application uses AGPL-3.0-only. The independent tracker under `packages/tracker` uses MIT; bundled datasets retain their own licenses and notices.

This directory contains generated metadata for the npm lockfile, including development and optional packages:

- `sbom.cyclonedx.json`: CycloneDX software bill of materials.
- `npm-license-inventory.json`: package, version, license, integrity, lockfile digest and unknown-license entries.
- `npm-license-inventory.csv`: the same package rows in CSV format.

Regenerate these files after changing the lockfile:

```sh
npm sbom --package-lock-only --sbom-format cyclonedx --sbom-type application > docs/licenses/sbom.cyclonedx.json
node scripts/ops-license-inventory.mjs
```

Review unknown entries and retain license notices when distributing dependencies. This npm inventory does not include Docker base images, operating-system packages, PostgreSQL, Redis or external datasets.

After building, run `node scripts/verify-distributions.mjs` to check distributed browser and SDK packages. The WordPress ZIP includes the root AGPL license. Tracker JavaScript includes the complete MIT notice, keeps bundled third-party notices, and has a matching license sidecar.
