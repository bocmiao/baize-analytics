# Approved homepage revision — 2026-10-11

This is the homepage visual-review checkpoint after 7f67be1, not acceptance of the whole application or whole-site visual rollout. No hosted CI was invoked.

The six screenshot JSON manifests bind the actual web source SHA256 `c913f076ffcaf939d035c2b209ccf403d57cd5477e37ab8f58531216ac3197d1`; their SOURCE_SHA identifies the base commit while changes were uncommitted. All six image hashes were verified. These replace the first-round images; the original images and failures remain in Git history.

The isolated actual collector/PostgreSQL/API fixture spans 60 days, queries 30 days, returns PV 511 / UV 30 and previous PV 120, and uses four pages and desktop/Android intake. No API mocks or production demo constants. Geography remains honestly unknown without GeoIP. Empty site and unconfigured SEO/AI are also captured.

## Revision checks

- Real Chromium homepage scenario: PASS, 1 test, 17.6 seconds. Verifies all entries, actual comparison, insight preference, mobile focus/inert/drawer behavior, screenshot coordinates and real source/data.
- First revision mobile position check: FAIL, KPI y312 > 290; preserved. Inherited toolbar preference ordering created an extra row; corrected without relaxing the assertion.
- Actual final images visually opened: expanded and collapsed 1440×1000, mobile 390×844. Desktop KPI begins approximately y156, mobile y271. Plot is approximately 220px; the complete trend card remains approximately 378px rather than the reference's approximately 290px. Parent visual approval is still pending; no whole-site copying yet.
- Build, lint and typecheck: EXIT0; individual logs preserved.

## Prior immutable full run — keep the failure

On immutable `7f67be11dbedbaadb3240334a59223fe0f8c2ebb`: 247 unit and 443 integration assertions passed, zero skips. Browser-directory 31 tests: 29 passed, 2 failed, zero skips (includes two date-only tests). Overall EXIT1. Extended analysis attempted the group selector inside a closed preferences disclosure; responsive replay asserted the former green watermark color. Revision tests now open the actual disclosures and check the approved color plus computed contrast. This is not evidence of a passing revised full run. Safe logs/JSON are in `docs/test-evidence/approved-ui-7f67be1-*`.

New immutable full validation and new-image independent restore remain required. Existing strict high-load FAIL and external/native-platform boundaries are unchanged.
