# Linux x64 precompiled release packages

> 本包主要运行维护指南离线可用；源码和历史材料的固定 SHA 仓库链接需要网络及私有仓库权限。

The small documentation whitelist includes the supervisor example, deployment and
maintenance guides, Lite guides, API/migration reference, both `README.md` and `README.en.md`, and the two
explicit screenshot paths `docs/images/baize-desktop.png` and
`docs/images/baize-mobile.png`. The PNG Git blobs remain byte for byte identical;
README image links to them stay local and work offline. Files are
exported with `git show FULL_SHA:path` from the same frozen revision as the image.
The supervisor example and primary operating guides stay byte for byte identical.
README/API/migration references keep local links to included guides; missing source
or historical link targets point to the private repository at that exact SHA.
Only link targets change in the original body; each README also receives its own Chinese or English explicit
offline/network-access notice shown above. Their manifest provenance records the source Git blob,
source SHA-256, derived document SHA-256 and each rewrite. Historical evidence,
screenshots, private configuration and secrets are not recursively packaged.

`scripts/package-release.mjs` is a publisher tool. It takes an existing, frozen
local application image and a clean checkout at the same full Git revision. It
does not clone, install dependencies, build on the receiving host, download Node,
or deploy a server. The publisher requires Docker, Node, GNU tar/gzip and readelf.

Two variants are generated separately for the standard and Lite profiles:

- `node-ready`: compiled application, tracker assets, migrations, installed
  dependency tree and release launch/maintenance interfaces. The receiving host
  supplies a supported Node 24 runtime.
- `bundled-node`: the same application with the actual official Node binary and
  Node/base copyright notices copied from that identical image. It still needs
  the host shared libraries declared by the binary; it is not a static executable.

Example, after freezing and building the matching application image:

```sh
node scripts/package-release.mjs --image baize-local:lite-SHA \
  --revision FULL_GIT_SHA --profile lite --variant bundled-node \
  --source-root /path/to/clean/checkout --output /path/to/new-release
node scripts/package-release.mjs --verify /path/to/new-release
```

The publisher checks the image's actual Linux/amd64 platform, exact revision,
immutable image ID and compiled profile entrypoint. Older images missing compiled
release preflight/maintenance modules or the shell interfaces are rejected.
The runtime payload includes `dist`, `public`, `db`, `node_modules`, package
metadata, licenses and the two release shell interfaces. The documentation
whitelist additionally includes both READMEs, deployment/maintenance guides,
the supervisor example and desktop/mobile screenshots; bundled-node also
includes the verified runtime binary and its license notices. Live data, keys, credentials, Git and
caches are excluded. Relative internal dependency links are preserved; links
escaping the release directory and nonregular files are refused.

`release-manifest.json` identifies the profile, variant, source revision, image ID,
platform and tested image Node/SQLite fingerprint. Every file has byte length,
SHA-256 and numeric POSIX mode; internal symlinks also record their targets.
Directories and files become read-only. Extraction verification checks the complete
file set, content and modes, including unexpected files. The manifest does not hash
itself; the archive SHA-256 is the independent delivery identity.

The original image package metadata is first checked byte for byte against the
frozen source and retained as `source-package.json`. The release `package.json`
changes only `scripts.start` to `node dist/server/src/release/panel-start.js`, for
both profiles. `npm start` and that startup file therefore enter the same compiled
preflight/profile dispatcher. No `npm ci` or build is run on the receiving host.
The lockfile is unchanged, and every installed dependency version is checked
against it. The release manifest records the original package SHA-256 and this
intentional derivation; the Docker image's original package files remain unchanged.

Run the supplied `scripts/release-start.sh` and `scripts/release-ops.sh` with an
absolute external environment file. `DATA_DIR` and `KEYS_DIR` must be external to
the release. Standard native mode uses `BAIZE_NATIVE_RUNTIME=1` and separately
provided PostgreSQL. Redis is optional: without it, bounded single-instance
fallback does not guarantee shared limits or cache across instances. Optional
ClickHouse remains separately configured for
application operation. The current standard native maintenance tools support
PG-only data and refuse ClickHouse configuration or authority before backup or
restore; they do not produce a complete ClickHouse backup. Restore, upgrade and
rollback create a new database, so the maintenance database role needs database
creation and target-object restoration privileges, not only source read access.
The shell entrypoints require Bash. Lite uses one local SQLite writer and requires
host `flock`, `sh` and `cat`. Standard maintenance also needs matching PostgreSQL
client programs (`pg_dump`, `pg_restore`, `createdb`, `psql`).
Neither variant includes database service binaries, a reverse proxy, TLS setup,
an init-system service, or a complete operating system. Bundled Node's minimum
glibc version and required shared libraries are measured with readelf, not inferred
from the Node version.

Current scope is Linux x64 with glibc. Other CPU architectures, musl/Alpine,
Windows and macOS packages are not produced or claimed tested. Runtime and data
capacity figures require their own actual deployment measurements.

Extract a runtime archive as the account that will own and run the release:

```sh
tar --same-permissions -xzf baize-PROFILE-VARIANT-linux-x64-REVISION.tar.gz
```

`--same-permissions` preserves the manifest's sealed file and directory modes
under a restrictive umask such as `077`. Keep the extracted release owned by
that account; keep writable data, keys and private environment files outside
it. Do not recursively change release modes: strict inventory verification
checks modes as well as content. The archive's numeric owner is packaging
metadata; a normal non-root extraction is owned by the extracting account.
