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

The executed inventory contains 444 lockfile package entries and 0 missing license fields. A declared SPDX expression is package metadata, not independent proof of license terms or compatibility. Review actual distributed files, notices, transitive licenses and optional binaries before a formal release. Review any future `UNKNOWN` entries manually; do not replace unknowns with an assumed permissive license. Docker base images, PostgreSQL, Redis, operating-system libraries, external datasets and services are outside this npm inventory. This is a generated dependency inventory and SBOM, **not a completed legal, supply-chain or formal release compliance audit**.

SDK protocol integration tests add the development-only `@modelcontextprotocol/sdk` tree; the prior inventory had 366 entries, and the SDK milestone inventory had 442; adding the build-only portable Zopfli compressor yields 444. Platform-optional packages need not all be present in an installed-tree SBOM. Runtime tldts and tldts-core 7.4.18 are explicitly asserted.

Run `node scripts/verify-distributions.mjs` after the build for actual browser ZIP/license checks and isolated exported SDK type checks. The WordPress ZIP carries the full root AGPL text. This does not replace Docker artifact verification or a legal review.

The build-only @gfx/zopfli WebAssembly compressor emits ordinary gzip; it is not bundled into the tracker. Full MIT text is inline in each JS artifact, with a matching sidecar. The core 5120-byte gate checks the actual precompressed HTTP artifact, not default zlib output.
