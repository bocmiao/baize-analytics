# F48 GA4 exact historical windows

This slice imports GA4 Data API aggregate history. No real Google account, production credential, billing request or external deployment was used. Google HTTP responses in these tests are explicitly injected provider fixtures; PostgreSQL, authentication/authorization, import transaction, durable scheduler and full-site export are real.

## Implemented

Migration `029_ga4_import_windows.sql` adds one site-scoped FK table. The import requests five independent `runReport` reports with `screenPageViews`, `totalUsers`, `sessions`: date × sessionSource, date, isoYearIsoWeek, no dimensions for the entire period, and sessionSource for the entire period. Whole-period users are **the independent provider totalUsers report**, never the sum of daily, weekly or source users. `activeUsers` and native visitor UV are not substituted. Source keys remain array values / Set keys, including `__proto__`.

Each saved window preserves requested start/end, property ID, provider timezone (null when absent), selected metadata including thresholding / sampling / other-row loss, report row counts and import timestamp. Metadata indicating restricted data yields `quality: limited`; missing metadata remains unknown. Requested dates are calendar-valid, ordered and bounded to 3660 days. Returned dates must be inside the requested window; ISO-week labels must denote a real week intersecting it. Edge weeks represent the exact request-clipped interval, not an inferred full week. Safe integer metrics, header correspondence, duplicate dimension rows, consistent rowCount / pagination and timezone consistency are checked before writing. Pagination advances by actual returned rows; rowCount is bounded to 100000 rows per report. Each HTTPS response is capped at 5 MB.

All remote reads finish before acquiring a database connection/transaction. Commit takes the partition/site gate and a connector-specific advisory mutex, checks encrypted/settings version, replaces only requested legacy source-day dates and upserts one exact provider window atomically. Failure retains all prior facts. Concurrent duplicate imports serialize. Secrets are neither in the new table nor read API nor the full export. Google settings retain existing refresh-token-preservation semantics.

`GET /api/sites/:siteId/ga4/window?start&end` enforces the same site read permission and returns `saved-provider-window` only for a saved exact request. Different selected dates return `unsupported: exact-provider-window-not-imported`, even if they overlap saved dates; no UV estimate is fabricated. Old `/ga4` source-day endpoint remains compatible for dashed PV comparison. Full-site export has a 39th explicit safe table allowlist entry, with the existing per-table 100000 cap and transaction/client protections.

`dailyGa4` is an explicit opt-in Google setting, default false. The durable scheduler imports the previous site-calendar day. The requested site day and provider timezone are distinct and displayed; provider timezone is not silently assumed equal to site timezone. Existing retry/fenced-job semantics apply. The Google settings form adds this opt-in control.

`Ga4History` supplies Chinese/English provider-window totals, daily/weekly/source Top tables, timezone, import time, quality restrictions, and the missing event/identity/funnel-history warning. Root/web integrates the owned main-page hook; browser verification is recorded separately once actually run.

## Actual verification

- `npx tsc --noEmit`: PASS after test payload typing corrected. The first attempt failed on test `unknown` payload overload, not application code; no test assertion was removed.
- Targeted ESLint for new helper, routes, export, UI and tests: PASS.
- `TEST_DATABASE_URL=... npx vitest run tests/unit/ga4-import.test.ts tests/integration/ga4-windows.test.ts tests/integration/governance-full-export.test.ts`: **3 files / 12 tests PASS**, started 08:37:08 UTC, 4.37 seconds.
- First isolated-PG check before scheduler/unit additions: **2 files / 8 tests PASS**, started 08:35:32 UTC, 3.38 seconds.
- Legacy external regression plus new slice: `TEST_DATABASE_URL=... npx vitest run tests/integration/external.test.ts tests/unit/external.test.ts tests/unit/ga4-import.test.ts tests/integration/ga4-windows.test.ts tests/integration/governance-full-export.test.ts`: **5 files / 30 tests PASS**, started 08:37:34 UTC, 5.76 seconds.
- `DATABASE_URL=... npm run db:migrate`: PASS on local development PostgreSQL, including the forward migration.

Tests demonstrate daily users 6 and 5 versus independently reported whole-period 7; partial ISO week validation; hostile source keys; real unauthorized API rejection; actual 39-table JSON fact readback without secrets; malformed, out-of-range and duplicate rows / mid-report provider failure preserving old data; concurrent import and configuration changes; zero calls without opt-in and one durable scheduled import across concurrent ticks. Unit cases cover short-page pagination, prematurely empty pages, wrong headers, unsafe numbers, invalid week, timezone conflict, and input rejection before outbound calls.

## Not verified / limits

Real Google OAuth consent, real GA4 permission/scopes, historical property availability, Google quotas and account-specific thresholding remain untested. Simulated responses are not evidence of real account access or model quality. GA4 aggregate history cannot recover raw events, identities or historical funnels. Native PV and GA4 pageviews can differ because of timezone, tracking, consent, attribution and provider definitions. Whole-period/window data is a saved provider snapshot; a later overlapping import does not rewrite prior snapshots. No arbitrary partial-window distinct users are promised. Browser/full-suite/Docker validation of this new slice awaits the root's next integrated run.

Root fifth frozen full validation subsequently passed 272 application tests and19 fresh compiled-application Chromium checks, including this real GA4 UI/provider-fixture workflow. The new production-image matrix remains pending; Google account access remains untested.
