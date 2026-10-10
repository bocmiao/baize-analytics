# Tracker single-file MIT distribution

This forward correction supersedes the earlier copyright-plus-link description. All six built JS files now embed the complete MIT copyright, permission and warranty text from `packages/tracker/LICENSE`. Bundled third-party legal comments remain inline. Browser/source ZIPs also carry full license files. No npm publication is claimed.

The portable, pinned build-only `@gfx/zopfli@1.0.15` emits standard gzip, with an exact decompression-to-JS assertion for each artifact. It is not tracker runtime code. The core size gate uses the **generated and actually HTTP-served** `.js.gz`, not default zlib compression:

| Artifact | Zopfli gzip bytes | Default zlib gzip bytes |
| --- | ---: | ---: |
| tracker | 5087 | 5282 |
| tracker-min | 4506 | 4690 |
| tracker-vitals | 5316 | 5503 |
| tracker-replay | 57320 | 59511 |
| tracker-heatmap | 1122 | 1170 |
| tracker-consent | 1196 | 1230 |

The 5120-byte limit applies only to core/min. Optional extensions are separately loaded. Uncompressed responses retain the complete inline license; clients accepting gzip receive the exact precompressed artifact and `Vary: Accept-Encoding`. `gzip;q=0` receives uncompressed JS. `/tracker.LICENSE.txt` returns the matching full notice with `text/plain`; no source-license filesystem paths are exposed.

实际分发：六个 JS 自带 MIT 全文，浏览器与源码 ZIP 另外保留许可文件。5KB 验收针对实际提供的 Zopfli gzip 核心产物；默认 zlib 核心超过上限，未声称该方式也达标。可选扩展不计入核心预算。

Validation commands: `npm run typecheck`, owned-file ESLint, `node scripts/verify-distributions.mjs`, and `TEST_DATABASE_URL=... npx vitest run tests/integration/distribution-license.test.ts`. The integration test starts the actual Fastify application with a fresh real PostgreSQL schema and performs native HTTP requests, checking complete inline MIT, gzip encoding/length/decoded equality, q=0, exact license text/type and non-exposure of repository paths. Counts and frozen-source outcomes are in the accompanying evidence JSON. Prior milestone evidence is retained. This batch makes no new Docker or hosted CNB execution claim and does not run GitHub Actions.
