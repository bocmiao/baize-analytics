# User API manual

## Paths, authentication and time

`S` below means `/api/v1/sites/:siteId`. `E` means `/api/sites/:siteId`, the external connector prefix **without v1**. Replace path IDs with actual returned identifiers. JSON is the default except CSV/downloads, HTML embeds and SSE.

Use the HttpOnly `baize_session` cookie for browser administration. It is SameSite=Lax, Secure on HTTPS, and expires after seven days. Cookie-authenticated writes must have an allowed origin. API automation can use `Authorization: Bearer $BAIZE_API_TOKEN`; tokens are bound to one site, expiry/scopes and their owner's current membership. Do not place administration tokens or collection secrets in browser tracker code, URLs or logs. A site's token cannot list/create global sites. Instance settings require administrator sessions where enforced.

| Permission | Members | Operations |
|---|---|---|
| read | viewer, analyst, admin, owner; instance admin | Site dashboards and read-only analytics |
| write | analyst, admin, owner; instance admin | Goals, funnels, reports and schedules |
| admin | admin, owner; instance admin | Members, secrets, exports, sharing and deletion |
| Token scopes | read, write, admin | write includes read; admin covers site permissions, still bounded by user membership |

Analytics timestamps are ISO8601 UTC and ranges are normally `[from,to)`. Provider reports use inclusive `YYYY-MM-DD` start/end dates. Calendar grouping uses the site's IANA timezone. Null, unavailable and unsupported metrics are not zero. Preserve `coverage`, `watermark`, `rangeStatus`, `unavailableHours`, retention and storage metadata.

There is **no universal pagination cursor/page/pageSize contract**. Most lists are arrays with fixed server limits; some wrappers are documented below. Do not invent pagination parameters. A limited list is not an unlimited historical export.

## Setup, sessions and sites

| Method/path | Input | Result |
|---|---|---|
| GET /healthz | None | Database/cache/GeoIP status; 503 on database failure |
| GET /api/setup | None | `{required}` |
| POST /api/setup | `{email,password,name?}` | First administrator and session; 409 if already initialized |
| POST /api/login | `{email,password}` | `{user}` and cookie; 401 on invalid login |
| POST /api/logout | Cookie | Clears session; `{ok:true}` |
| GET /api/me | Session/token | `{user}`, not permission for every site |
| GET /api/v1/sites | Session | `{sites}`, including current_role; no salt_secret |
| POST /api/v1/sites | Instance-admin session | 201 `{site}` |
| GET S | read | `{site}` |
| PATCH S | admin | Partial site fields; 409 for identity-mode changes after events exist |
| POST S/write-key | admin | One-time collection key and HMAC instructions |
| GET /api/tracker/config/:siteId | Public; optional cookie_domain query and Origin | Privacy/consent/replay/heatmap/vitals configuration, no write secret |

Setup/login share a ten-attempt/minute in-memory IP-digest limit. Passwords are 12–1024 characters. Create a site with `{name,domain,timezone?,privacy_mode?,retention_days?,tags?,config?}`. Name is at most 128 characters; retention is 1–3650 days, default 365; at most 20 tags of at most 64 characters. Privacy modes are `standard` and `daily_salt`, default standard. Timezone defaults to Asia/Shanghai.

Config supports `allowed_hosts`, `consent_required`, `replay`, `heatmap`, `vitals`, `experiments`, `excluded_ips`, `session_timeout_minutes` (1–1440), `seoAutoScan`, `channel_rules` and `ai_referrer_hosts`. Allowed hosts must be exact DNS hosts within the same registrable site domain. Channel rules, maximum 50, use `{name,channel,referrer_host?,include_subdomains?,utm_medium?,utm_source?}`; at least one condition is required, combined conditions all match, and ordering matters. Channels are direct/referral/search/social/ai/paid/email. AI hosts are exact hosts, maximum 100. Timezone/session-timeout changes queue recomputation.

## Collection protocol

POST `/api/collect` uses the public site ID and verifies the request Origin against that site. JSON and tracker text/plain JSON are supported; gzip is bounded. The body limit is 1MiB. When using a server-side Bearer collection write key, **also provide** `X-Baize-Signature`, the hex HMAC-SHA256 of canonical sorted-key envelope JSON. The key is not an administration API token and must never be given to browsers.

```json
{
  "protocol_version": 1,
  "site_id": "<SITE_ID>",
  "sdk": "custom-sdk",
  "sent_at": 1790812800000,
  "events": [{
    "event_id": "<UUID>", "visitor_id": "<UUID_OR_JSON_NULL>",
    "page_id": "<PAGE_INSTANCE_UUID>", "ts": 1790812800000,
    "type": "pageview", "url": "https://your-site.example/pricing",
    "path": "/pricing"
  }]
}
```

Replace placeholders with real UUIDs; JSON null must not be the string "null". Envelopes contain 1–50 events. Required fields are event_id, type, ts, visitor_id, page_id, url and path. Timestamps are integer milliseconds; URLs must be HTTP(S), paths begin with `/`. 202 means accepted events are durable in PostgreSQL, **not** that aggregates are complete. Inspect `accepted`, `duplicates` and `rejected`; duplicate receipts count in accepted but do not create new events/PV. Invalid events can be rejected individually within a 202 response.

Retry the unchanged event with the same event_id. Same-site ID reuse with a different payload is event_id_conflict, not replacement. More than 24 hours in the future or outside site retention is rejected. Production limits remain 100 requests/minute/IP digest and bot classification thresholds, including 20 requests/second; recognized bots can return 204 and do not contribute normal pageviews.

| Type | Additional fields |
|---|---|
| pageview | Optional title/referrer/screen/language/UTM; use new page_id for each SPA/page instance and distinct tab |
| event | event_name 1–128; props maximum 20, keys ≤64; string ≤2048, finite number or boolean, no nested objects |
| heartbeat | visible_ms 0–86400000; optional valid interval_start/end |
| vitals | Nonnegative lcp/inp/cls/fcp/ttfb; milliseconds except unitless CLS |
| revenue | Nonnegative revenue ≤1e12, three-letter uppercase currency, order_id 1–128; order retries deduplicate, conflicting currency/amount rejects |
| identify | user_id 1–256, standard mode only; prefer an internal non-PII account ID |
| consent | Consent status; revocation immediately stops tracker and clears queued identity/data |
| replay | Fully masked replay array ≤500, nonnegative replay_seq; explicit site opt-in |
| heatmap | x/y 0..1, kind click/scroll, optional width/height; document-percent coordinates |

Raw IP/UA is used in intake memory for HMAC/rules/GeoIP, then privacy-safe dimensions are persisted. Stable identity aliases/contact attributes are stripped. Identify binds a site-scoped hash to an event-time segment; A→B transitions do not retroactively assign anonymous history to A. Daily-salt is cookieless, refuses identify, scopes page identifiers by day and cannot support cross-day UV/retention/identity analytics. Tombstones block re-entry, including identity-time segments; deletion coordinates events, outbox/keys, experiment contributions, aggregate generations and cache.

Sessions use event-time ordering and inactivity timeout, not arrival order. Heartbeat intervals are deduplicated/recomputable across page instances. Replay masks text/inputs and strips attributes/styles/images, so structural playback is not pixel-perfect reconstruction.

## Analytics endpoints

GET endpoints require read unless specified. Most stats requests default to the last seven days. Common filters are path/channel/utm_source/utm_medium/utm_campaign/utm_term/utm_content. Revenue is separated by currency; a mixed-currency single total is null. Vitals use weighted t-digest centroid approximation with sampleCount/quantileStatus.

| Path | Input | Output and bounds |
|---|---|---|
| S/stats | from/to, compare=previous, common filters | totals/trend/pages/sources/audience/dimensionRows/events/vitals/paths/goals/funnels/cohorts/retention; comparison has its own coverage |
| S/analysis | Both from/to for selected interval, otherwise retained_detail | Goal conversions/attribution and funnel steps/dropoff/rate |
| S/pages/detail | Required path; from/to | Page trend, audience, sources and totals |
| S/content; S/analysis/features | Required from/to, retained detail ≤90 days, common filters | Downloads, sanitized 404 referrers, event trend, goal-channel trend, drop-off features; explicit status on missing detail |
| S/content/404.csv | Same range/filters | Audited UTF-8 formula-safe repair CSV; 409 without complete detail |
| S/funnels/:funnelId/analysis | Required from/to within past 90 days, optional property | Unique-visitor entered/completed/lost/lossRate per step, Top sources/devices, typed properties/missing samples; 100k event bound, coverage0/truncated on excess; daily cross-day unsupported; **no global UTM filter support here** |
| S/event-properties | Required event_name/property/from/to, ≤90 days | groups/typedGroups, boolean separate from string; at most 100 buckets, 100k events, retain storage.truncated |
| S/geography | Required from/to ≤90 days, country/region/common filters | Geographic aggregates; unknown locations are not fabricated |
| S/revenue | from/to ≤90 days, common filters | Currency-specific revenue/orders/trends/attribution |
| S/identities | from/to ≤90 days, registrationEvent default signup | Opaque user keys and positive revenue strictly after registration in selected retained interval; standard mode only |
| S/identities/:userKey/activity | Opaque key, from/to | Temporal cross-device session/activity; no original identity text |
| S/users/:userId/paths | Original application ID, from/to ≤90 days | Standard-mode bound paths/events; 5000-event cap |
| S/realtime | None | Online in last five minutes and events in last thirty minutes |
| S/realtime/stream | SSE; Last-Event-ID durable outbox integer | Two-second tick, 200 records/tick, thirty-minute window; delayed events included; closes after permission revocation |

Coverage can be zero while aggregation is pending or retained detail needed for a filtered/partial-hour query is unavailable. Future stats ends may clamp to now. Exact UV cannot be summed across buckets or dimensions. Outside retention, partial-hour/filter/funnel detail is not reconstructed as fake historical zeros. Strict funnels require adjacent steps; loose funnels allow intervening events, but separate sessions are not stitched together.

```bash
# Read-only local examples. Credentials are privately bound; do not enable shell tracing.
curl --fail-with-body -H "Authorization: Bearer $BAIZE_API_TOKEN" \
  "$BAIZE_BASE/api/v1/sites/$BAIZE_SITE_ID/stats?from=$BAIZE_FROM&to=$BAIZE_TO"
curl --fail-with-body --no-buffer -H "Authorization: Bearer $BAIZE_API_TOKEN" \
  "$BAIZE_BASE/api/v1/sites/$BAIZE_SITE_ID/realtime/stream"
```

## Definitions, experiments and playback

S/goals and S/funnels support GET(read), POST(write), PUT /:id(write), DELETE /:id(write). Goals use `{name,type:event|page|duration,config}` with event_name/path/positive seconds respectively. Funnels use `{name,steps:[{type:page|event,value}],strict}` with 2–20 steps. Definition changes queue recomputation. GET S/jobs(admin) reports aggregation lease/attempts/dead_letter/watermark/outbox; POST S/jobs/replay(admin) changes epoch and resets retry state so old workers fail the publication fence.

S/experiments supports POST(admin) `{name,variants:["control","variant"],goal}`, GET(read) and PATCH /:id(admin) `{enabled}`. Name/goal are1–128, variants2–10 with unique1–64 character values. GET returns per-variant visitor/contribution conversion counts plus p-value/95% interval/sample status. Public POST `/api/v1/experiments/:id/assign` `{site_id,visitor_id,consent:true}` returns a stable variant only when standard privacy and experiments are enabled; deleted visitors return410. Deletion rebuilds conversions from event-time contributions, preserving other identity segments. Incomplete historical conversion provenance returns partial_history_unavailable without significance. Fixed duration, adequate samples and no early stopping remain experimental design obligations; there is no claimed automatic calendar enforcement.

GET S/replay(admin) accepts path/page_id/from/to/limit (1–1000, default1000) and returns session_id/seq/payload/page_id/path/started_at/ended_at/event_count. There is no continuation cursor. GET S/heatmap(read) accepts path/viewport/kind and returns at most10k buckets, coordinate_system=document_percent and viewport_bucket_px=100. Do not merge unrelated pages/viewports. Raw replay retention is min(site retention,30 days).

## Governance

| S suffix | Methods/permissions | Contract |
|---|---|---|
| /reports | GET read; POST/PATCH/:id/DELETE/:id write | `{name,dsl:{from,to,path?,channel?,utm_source?,utm_medium?,utm_campaign?,utm_term?,utm_content?}}`; GET /:id/run read executes real saved filters |
| /channels | GET/POST/DELETE/:id admin | `{kind:smtp|webhook|wecom|serverchan,config:string-map}`; list excludes secrets; HTTP targets require HTTPS and SSRF checks |
| /schedules | GET read; POST/DELETE/:id write | report_id/channel_id/cadence daily, weekly or monthly, same-site only |
| /alerts | GET read; POST/DELETE/:id admin | kind traffic/goal/funnel/offline/storage/serp, config, channel_id; POST /:id/silence hours1–720 |
| /notifications | GET admin | Latest100 notification logs; durable bounded retry, no provider secrets |
| /members | GET/PATCH/:userId/DELETE/:userId admin | admin/analyst/viewer, owner protected |
| /invites | POST admin | email/role/channel_id?; one-time token/url and email_queued, seven-day validity |
| /tokens | GET/POST/DELETE/:id admin | scopes read/write/admin, optional expires_at; one-time secret, metadata only thereafter |
| /audit | GET admin | Latest500 site records; 180-day cleanup, no cursor |
| /usage | GET read | Current PG event_count/estimated bytes, not billing/whole-instance size |
| /retention | PATCH admin | `{days:1..3650}`, asynchronous expiry, not recovery |
| /delete-visitor | POST admin | visitor_id and/or user_id; durable independent journal before completion; no daily-salt cross-day user deletion |
| /exports | POST/GET/GET/:id admin | format csv/json, full boolean; pending/running/complete/failed/revoked and read_metadata |
| /shares | GET/POST/DELETE/:id admin | Optional password ≥8, expires_at, exact frame_origins; secret returned once, revocable |

SMTP string config uses host/port/from/to/user/password/locale. HTTP uses url; credentials remain encrypted. Traffic alerts compare a complete prior hour with covered same-hour samples over28 days, require ≥7 samples and two abnormal consecutive hours; evidence includes snapshot generations/coverage. Goal/funnel/storage/SERP config is currently a record, not a universal typed alert schema. Delivery failures retry at most3 times. Local SMTP/transport fixtures do not prove real message delivery.

Public invite POST `/api/v1/invites/:token/register` accepts name/password for a new email; an existing account signs in and POSTs `/accept`. Acceptance is single-use and email-bound; membership and audit persist atomically.

Full site exports are bounded business facts and sanitized configuration, **at most100k rows per table**, excluding passwords/salts/provider secrets/token hashes. They are not full-instance recovery. Full CSV has table,record; event-only CSV has event columns. Over-limit jobs fail/export_limit_exceeded. Download metadata headers are X-Baize-Event-Source and X-Baize-Read-Coverage. Deletion revokes old exports and reliably queues physical file/temp cleanup; incomplete/revoked downloads return404.

Public POST `/api/v1/shares/:token` `{password}` returns fixed recent30-day calendar aggregates and coverage. GET `/embed/chart?token=...&type=top-pages&lang=zh-CN|en` renders safe static HTML with frame-ancestors restricted to configured origins. Password embeds use X-Share-Password; a normal iframe cannot add it. Never place passwords in URLs. Share URLs are revocable bearer capabilities, not administration sessions.

## External connectors

E settings/import/crawl/rank operations require site admin; read views require read. AI question/query/usage requires read, ai/test requires admin; evidence and suggestion create/update/recheck require write, with additional admin for fresh SEO recheck. Secrets are encrypted, not returned by GET. OAuth binds one-time state/PKCE to user/session. External connectors require the operator’s own configured account and verified provider permissions.

| E suffix | Methods/input | Output |
|---|---|---|
| /external | GET/PUT; DELETE/:kind | PUT kind google/ai/serpapi/dataforseo, secret?, settings; Baidu explicitly unsupported-unverified |
| /external/jobs | GET; POST/retry kind/jobKey/day | Latest100; retry failed with attempts<5 |
| /google/oauth | POST | Authorization URL; callback /api/google/callback state/code |
| /gsc/import; /gsc | POST start/end; GET start/end | Query/page/day aggregates, typically2–3 day latency; list limit1000/no cursor |
| /ga4/import | POST start/end | Inclusive ordered dates, max3660days, five independently deduplicated provider reports |
| /ga4; /ga4/window | GET start/end | Historic daily/source values; exact saved window or unsupported |
| /seo/scan; /seo/scans | POST; GET | Bounded safe crawler; latest20 scans and real issues |
| /seo/conversions | GET start/end | Search-entry/page/conversion aggregate comparison, no person-to-keyword link |
| /serp/check; /serp | POST keyword/provider (required); GET | BYOK SerpAPI/DataForSEO rank history/change |
| /ai/query | POST read metric/dimension?/start/end/limit?/filters? | Deterministic typed aggregate, no model call, max31 days/limit100, no SQL or other site |
| /ai/usage; /ai/test | GET; POST | Budget/accounting; test can actually call provider, not a free dry-run |
| /evidence | POST start/end | Deterministic local evidence, no model call |
| /suggestions | POST/GET | Evidence-backed suggestions with uncertainty |
| /suggestions/:id | PATCH | status/implementedAt?; pending-recheck requires implementation time, verified requires prior recheck; new→accepted→in-progress→pending-recheck→verified; false-positive can reopen |
| /suggestions/:id/recheck | POST | Required start/end and1–20 confounders; write, SEO additionally admin; fresh scan/new-period evidence, old evidence immutable |

Google settings are clientId/redirectUri/property?/gaProperty?/dailyGsc?/dailyGa4?; secret is a JSON string with clientSecret/refreshToken?. Redirect URI must exactly match the instance callback. GA4 stores sourceDays/days/weeks/period/sources reports with dimensions/pv/totalUsers/sessions, rowCount/metadata/property timezone/property ID/requestedCoverage. Each report is capped at100k rows and each HTTP response at5MB; over-limit imports fail. Use independently deduplicated day/ISO-week/period/source totalUsers, never sum daily UV for whole-period UV or merge native identities. GET window only serves an exactly imported start/end range; thresholds/sampling/unknown timezone keep explicit quality limitations. Google imports require authorization for the selected account and property.

AI settings are endpoint/model/enabled/monthlyTokenBudget/maxTokens?/localOrigin?/dailyReport?/automaticAnomaly?. It is opt-in. An explicitly registered localOrigin allows a narrow administrator-approved local Ollama endpoint, not unrestricted private-network fetch. The provider receives **the submitted user question/request text and authorized aggregate data**; users must avoid secrets in questions. Raw event rows/IP/identity are not sent. Model quality or business benefit is not guaranteed; correlations and before/after changes are not causal proof.

### Typed question charts

POST E/ai `{purpose:"question",question:≤2000,start,end}` supports at most31 inclusive calendar days. Result includes id/answer/tokens/evidence and questionEvidence. GET E/ai/questions/:callId returns id/status/answer/questionEvidence/tokens/createdAt/evidenceStatus (verified-tool-trace/legacy-unverified/not-completed); failed/reserved calls have no verified answer/evidence.

The authorized query_analytics trace is persisted with deterministic charts. Queries use metric pv/uv/sessions/conversions/conversion_rate, dimension day/page/source/device, start/end, limit1–100 and strict source/device/os/page filters; no SQL or other-site selector. Charts have unit count/ratio, points(label,value nullable, optional numerator/denominator), truncated/totalGroups/timezone/precision. Trace reports the actual selected published-fact source (postgres, clickhouse or hybrid), determined from owner/completion receipts rather than configuration, with generation/epoch/watermark/coverage and permission-check timestamps. No successful authorized tool call yields502 external_response_invalid; budget429, no opt-in409, dirty/stale409 aggregation_pending, denied permission403. Final authorization/version/budget/evidence checks reuse one client and commit atomically. A model's statement that it queried data is not proof.

## Storage and instance administration

GET S/storage(admin) shows mode/replica_format/watermark/errors. PUT `{mode:postgres|mirror|prefer_clickhouse,replicaFormat?:snapshot_v1|incremental_v1}`, POST /storage/replay. Unconfigured CH switching returns409. PG remains canonical; CH is an optional validated replica. Source/mode/fallbackReason are explicit; stale/corrupt/deleted replicas fall back instead of answering false zeros.

S/storage/history GET(admin) lists latest100 manifests; POST/capture; POST/:id/backup; POST/:id/restore `{namespace:UUID}`. Missing configuration409, published manifest404. Signed backup files stay in dataDir; restore creates an isolated CH namespace, does **not** activate canonical reads or replace PG. Deletion/expiry invalidates old history. CLI and backup/file/key procedures are in [migration](migration.md).

POST /api/admin/keys/rotate retains old version keys. GET/PUT /api/admin/geoip and POST /refresh configure authenticated official checksum-verified downloads. GET/PUT /api/admin/sso/wecom maps existing members explicitly; GET /api/sso and start/callback support guarded enterprise SSO, not open auto-provisioning. These services require the corresponding licensed artifacts or configured enterprise accounts.

## Errors and retries

Failures use stable `{error,message}`. Schema failures are400 `{error:"invalid_request",issues:[{path,message}]}`. Unknown API routes return404 not_found. Internal errors are fixed messages, not raw database/provider payloads.

| HTTP | Common codes | Action |
|---|---|---|
| 400 | invalid_request, invalid_json, range_invalid, funnel_range_invalid, invalid_gzip, identity_daily_salt_unsupported | Correct input |
| 401 | login_required, session_expired, invalid_api_token, invalid_write_key, invalid_signature | Reauthenticate safely |
| 403 | site_permission_denied, token_scope_denied, csrf_denied, origin_site_mismatch | Correct permissions/origin, never auto-escalate |
| 404 | site_missing, funnel_missing, report_missing, share_unavailable, export_not_ready, invitation_unavailable | Inspect status/identifier |
| 409 | setup_completed, privacy_mode_locked, invite_login_required, ai_opt_in_required, aggregation_pending | Wait or configure; do not display zero |
| 410 | visitor_deleted | Do not resurrect/reassign deleted identity |
| 413 | request_too_large, export_limit_exceeded, ai_context_too_large | Reduce request/export scope |
| 429 | rate_limited, login_rate_limited, ai_budget_exceeded | Back off, do not disable limits |
| 500/502/504 | internal_error, export_failed, external_provider_failed, external_response_invalid, external_timeout | Inspect durable task state; bounded retry |

Individual collection rejected reasons differ from top-level API errors: invalid_event, future_event, outside_retention, event_id_conflict, order_id_conflict, identify_unsupported_in_daily_salt, deleted_visitor, identity_time_conflict, feature_not_enabled and unmasked_replay. Each task family has its own retry policy. Preserve IDs, coverage and diagnostics; do not expose secrets or mistake a subsequent success for erasure of an earlier failure.

## Current security contracts

Instance administration requires an administrator browser Cookie session. Site API tokens, including administrator-issued tokens or admin scopes, and mixed Cookie/Authorization credentials are rejected. Site creation, configuration and write-key rotation commit their audit in the same transaction; an audit failure rolls back the mutation and preserves the previous key.

Account passwords use one rule for setup, login and invitation registration: 12–1024 characters, at most4096 UTF-8 bytes. Existing long invitation passwords remain usable. New share passwords require8–1024 characters and at most4096 bytes. Asynchronous scrypt preserves the legacy32-byte salt/hash format. Legacy verification accepts up to1MiB UTF-8 bytes and remains subject to the original1MiB limit for the entire HTTP body; it never truncates input or raises the body limit. At most four share-password derivations run concurrently, without a waiting queue; overload returns503 `share_password_busy` and `Retry-After:1`.

Authenticated statistics/site-management/admin requests share a600-request/user/60-second fixed-window budget across sites and Cookie/API tokens. Public share and embed requests share120 requests/trusted-IP/60 seconds. Excess requests return429 with Retry-After; configured Redis failure/timeout returns503 without resetting quotas. Without Redis the bounded process-local budget does not coordinate replicas.

## Privacy, ingestion diagnostics and storage

Deletion and journal replay invalidate derived AI answers, tool evidence, suggestions and exports while retaining quota accounting. Notifications check the current site epoch and lease before dispatch; messages already sent cannot be recalled. Replay retention uses the shorter of site retention and 30 days and does not restore expired content when the period is increased. Signed recovery requires the latest independent deletion journal and retention proof.

The read-only MCP endpoint is POST /api/sites/:siteId/mcp; see [MCP](mcp.md). Intake status, bot observations, self-host diagnostics and manual annotations are documented in the [complete API reference](../api.md). Diagnostics report unmeasured or unverified states explicitly. Manual annotations are not measured or causal evidence.

PostgreSQL is authoritative by default. Optional mirror reads may fall back to PostgreSQL. After a controlled canonical migration, missing ClickHouse authority data must fail rather than return an empty PostgreSQL result. Use the [migration runbook](migration.md) instead of changing authority flags or deleting raw tables manually.

New traffic reports are available in Node Standard; see the [traffic API and coverage rules](../api.md#新流量报表node-标准版). [Manual search import](../MANUAL_SEARCH_IMPORT.en.md) accepts a documented custom template and does not imply compatibility with unverified vendor CSV formats.
