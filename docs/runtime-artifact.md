# Application image contents

The Docker build keeps the complete dependency set for compiling the tracker,
web interface and server. A separate `/runtime` staging directory then contains
the compiled `dist`, tracker `public` assets, application and maintenance sources,
migrations, SDK, plugins, license and package metadata. Documentation, acceptance
evidence, tests and benchmark data remain in the source distribution.

The temporary staging manifest promotes the existing lockfile-pinned `tsx` to a runtime
dependency. Offline pruning removes development-only dependency trees and keeps
all declared production dependencies plus `tsx` and its transitive dependencies,
including its own esbuild runtime. The generated manifests are retained under
`runtime-dependencies`, with a relative link to the installed dependency tree.
The root `package.json` and `package-lock.json` are restored byte for byte from
the source checkout; `vite.config.ts` is retained as well. Existing source/image
identity guards therefore continue comparing all their original files without
exceptions. The image's installed dependency closure is described by the separate
runtime witness, not by claiming that every source development dependency is installed.
Backup and restore still use the established
`node --import tsx scripts/...` commands. This image is not a development/build
environment; compile or run acceptance suites from the complete source checkout.

The final stage copies this directory once, preserving compatibility with Docker
VFS environments. No registry access, dependency lifecycle script or new dependency
version is needed to produce the staging directory after `npm ci` and the build.

After building, `node scripts/runtime-stage-check.mjs /app` inside the image checks
the runtime production dependency graph, the runtime roots against the source
production roots plus `tsx`, every installed package version against both the
runtime and source lockfiles, compiled assets, app imports, maintenance
argument guards and signed retention-proof validation/tamper rejection with a
synthetic key and fixture. These checks establish dependency closure, not a completed
backup/restore acceptance run; database-backed recovery must also be verified.
Image logical bytes, compressed `docker save` bytes, persistent data and process
memory are separate measurements. Removing build files does not itself prove a
reduction in application RSS or a complete offline installation bundle.
