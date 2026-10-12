# Linux x64 precompiled release packages

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
Only `dist`, `public`, `db`, `node_modules`, package metadata, license, and the two
release shell interfaces enter the package. Live data, keys, credentials, Git and
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
provided PostgreSQL/Redis; optional ClickHouse remains separately configured.
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
