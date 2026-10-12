# Application image contents

The Docker build keeps the complete dependency set for compiling the tracker,
web interface and server. A separate `/runtime` staging directory then contains
the compiled `dist`, tracker `public` assets, application and maintenance sources,
migrations, SDK, plugins, license and package metadata. Documentation, acceptance
evidence, tests and benchmark data remain in the source distribution.

The staging manifest promotes the existing lockfile-pinned `tsx` to a runtime
dependency. Offline pruning removes development-only dependency trees and keeps
all declared production dependencies plus `tsx` and its transitive dependencies,
including its own esbuild runtime. Backup and restore still use the established
`node --import tsx scripts/...` commands. This image is not a development/build
environment; compile or run acceptance suites from the complete source checkout.

The final stage copies this directory once, preserving compatibility with Docker
VFS environments. No registry access, dependency lifecycle script or new dependency
version is needed to produce the staging directory after `npm ci` and the build.

After building, `node scripts/runtime-stage-check.mjs /app` inside the image checks
the production dependency graph, compiled assets, app imports, maintenance
argument guards and signed retention-proof validation/tamper rejection with a
synthetic key and fixture. These checks establish dependency closure, not a completed
backup/restore acceptance run; database-backed recovery must also be verified.
Image logical bytes, compressed `docker save` bytes, persistent data and process
memory are separate measurements. Removing build files does not itself prove a
reduction in application RSS or a complete offline installation bundle.
