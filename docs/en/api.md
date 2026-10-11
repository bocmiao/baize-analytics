# User API manual

## Current validation entry (local ce42c9f / d67 application)

| Source/stage | Actual evidence |
|---|---|
| d67 backend |217 unit+428 real integration=645 PASS;actual backend run|
| ce42c9f browser |30 checks(28 real Chromium+2 date)PASS,EXIT0;src/db/packages/sdk/scripts unchanged from d67;no claimed backend rerun|
| d67 image |Actual EXIT0:55DDL/391 manifest/strict independent restore;transient62MiB disk-low risk recorded,not concealed|
| d67 fixed1000/5000 |Actual EXIT1:1000PASS4.537660079s;5000overallFAIL4700accepted/6unsent/38delayed/queryfail0;draintrue/sixfinalassertionsPASS,finalHTTP23.714184648s;Nodepeak714698752B excludesDB.Performance gap remains,not5000/SLO acceptance|
| Git/hosted |Remotee441 verified,push blocked,no more authentication attempts.Latest local checkpoint: /workspace/baize-checkpoints/CHECKPOINT_MANIFEST.json;Gitobjects/trackedsource only,no runtimekeys;87e sixcommits is historical verified evidence.No CI/completion claim|

Historical661 ENOSPC and d67 first29/30 full EXIT1 remain below with original source evidence.

1240 sourcefiles unchanged;all four cleanup flags true.New heavy work paused,no active load.Disk observations1.5GiB late-run→2.0GiB end are not a minimum or causal diagnosis.


Capacity87e:short1000 bothPG/strictPASS;long5000 overallEXIT1—PGPASS(finalHTTP2.324900314s,zero unsent/delay/queryfail),strictFAIL(all5000 accepted,0unsent/queryfail,15delayed,120sdrain deadline,executed[]/assertfalse).Strict finalassertwindow28.497584549s is NOT a measured final HTTP duration.No integrity/loss/SLO inference.Function645/browser30/imageEXIT0 remain separate.Performance gap remains;no more heavy retries or hosted triggers.

## Historical stage records and design

## Historical preceding validation entry

| Source/stage | Actual evidence and boundary |
|---|---|
| 66150be formal full run | Actual EXIT0/cleanup:215 unit/55 files+426 real integration/156 files=641 PASS,0 skips/unhandled;30 E2E(28 real Chromium+2 date)PASS,about1.5min;lint/type/SDK/journal/build/migrate/compiled entry PASS |
| 66150be fixed load |1000 PASS:final HTTP5.047623651s;5000 overall FAIL:4350 accepted/13 unsent/35 delayed,drainfalse120s;final PV4350/coverage1/CH and six integrity assertions PASS,21.102973929s.Not5000/SLO acceptance |
| Image/remote |New image not completed;localHEAD e441 exists,push unconfirmed due HTTPS authentication failure.No Git/hosted actions |
| 66150be independent checks | Type/lint/215 unit tests PASS; not the full-run result |
| 0a precommit targeted source digest | 19 real tests PASS; targeted digest-bound evidence, not a full count |
| c890 backend | 211 unit+421 integration=632 PASS; historical source |
| 1c1cb65 browser/image | 30 checks(28 Chromium+2 date)PASS; image EXIT0. Historical1c source, not661 |
| 1c1cb65 fixed load | 1000 PASS;5000 FAIL. Historical1c source; no SLO claim |

Hosted workflows remain untriggered. Every update below is an archived SHA-bound stage record: earlier occurrences of “current/latest” describe that historical stage, not another current entry. Failures and original evidence remain unchanged.

## Historical stage records and contracts

**当前66150be测试窄修**：完整type/lint/215单元实际EXIT0，src/db/packages与0a相同；19真实precommit专项仍只证明此前摘要绑定源码，不是完整全轮。0a正式入口实际EXIT2（TS2749），unit/int/browser/image未运行；随后测试WIP首次213/215单元通过、2FAIL，类型与event-capable mock窄修后215PASS。先type后追加测试导致旧报告外推的失误已记录，不掩盖。661新full/image/load待；bd未捕获错误、0a类型FAIL、测试WIP2FAIL及1c负载FAIL原证据保留。

当前更新a9b49e7：bd3f51f三批候选7单元/21真实专项PASS，但新完整入口实际EXIT1：213单元PASS，集成424检查中423PASS/1skip，并有uncaught PG25P04 error1；浏览器NOT RUN。旧1c30浏览器及镜像通过仅绑定旧source，不外推候选。skip来自runner漏env，已改用仓库validate-local-final.sh正式入口；C idlefatal修复已保存0a0c171：precommit WIP摘要绑定第四轮19真实专项PASS/0skip/0uncaught，10单元/type/lint通过；新0a全量/镜像/负载尚待。所有FAIL保留，托管不触发。

### Historical2818bd4 validation entry

c890 backend:211 unit+421 real integration=632 PASS. 1c1cb65 browser:30 checks(28 Chromium+2 date)PASS; src/db/packages match c890, without claiming a backend rerun. The actual1c image lifecycle exited0; main-1c1cb65-image-* evidence binds source1c. Fixed1000 passed: final HTTP5120ms, sampled app+harness Node peak650272768 bytes(excluding storage services);5000 finally FAILED(4900 accepted/2 unsent/39 delayed; drain deadline exceeded; final assertions not executed), not a pass or SLO claim. Budget defaults do not guarantee scanned rows, heap bounds or performance gains. All later old main0f/de/annotation-pending text is SHA-bound historical narrative; original failures remain. Hosted workflows stay untriggered.

## Historical contracts and stage records

This is the English contract for the implemented self-hosted API. The application is AGPLv3 and the independent tracker is MIT; no paid application tier is required. The current validation/version record is [VALIDATION_MAIN](../VALIDATION_MAIN.md). Development additions below must not be assumed to exist in an older installed image. [中文](../api.md) · [Operations and migration](migration.md).

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

Public invite POST `/api/v1/invites/:token/register` accepts name/password for a new email; an existing account signs in and POSTs `/accept`. Acceptance is single-use and email-bound; membership and audit persist atomically in current development fixes, not in arbitrary older releases.

Full site exports are bounded business facts and sanitized configuration, **at most100k rows per table**, excluding passwords/salts/provider secrets/token hashes. They are not full-instance recovery. Full CSV has table,record; event-only CSV has event columns. Over-limit jobs fail/export_limit_exceeded. Download metadata headers are X-Baize-Event-Source and X-Baize-Read-Coverage. Deletion revokes old exports and reliably queues physical file/temp cleanup; incomplete/revoked downloads return404.

Public POST `/api/v1/shares/:token` `{password}` returns fixed recent30-day calendar aggregates and coverage. GET `/embed/chart?token=...&type=top-pages&lang=zh-CN|en` renders safe static HTML with frame-ancestors restricted to configured origins. Password embeds use X-Share-Password; a normal iframe cannot add it. Never place passwords in URLs. Share URLs are revocable bearer capabilities, not administration sessions.

## External connectors

E settings/import/crawl/rank operations require site admin; read views require read. AI question/query/usage requires read, ai/test requires admin; evidence and suggestion create/update/recheck require write, with additional admin for fresh SEO recheck. Secrets are encrypted, not returned by GET. OAuth binds one-time state/PKCE to user/session. See [external evidence](../ACCEPTANCE_EXTERNAL.md) for actual-account boundaries.

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

Google settings are clientId/redirectUri/property?/gaProperty?/dailyGsc?/dailyGa4?; secret is a JSON string with clientSecret/refreshToken?. Redirect URI must exactly match the instance callback. GA4 stores sourceDays/days/weeks/period/sources reports with dimensions/pv/totalUsers/sessions, rowCount/metadata/property timezone/property ID/requestedCoverage. Each report is capped at100k rows and each HTTP response at5MB; over-limit imports fail. Use independently deduplicated day/ISO-week/period/source totalUsers, never sum daily UV for whole-period UV or merge native identities. GET window only serves an exactly imported start/end range; thresholds/sampling/unknown timezone keep explicit quality limitations. Real Google account access is not proven by fixture-based PG/browser tests.

AI settings are endpoint/model/enabled/monthlyTokenBudget/maxTokens?/localOrigin?/dailyReport?/automaticAnomaly?. It is opt-in. An explicitly registered localOrigin allows a narrow administrator-approved local Ollama endpoint, not unrestricted private-network fetch. The provider receives **the submitted user question/request text and authorized aggregate data**; users must avoid secrets in questions. Raw event rows/IP/identity are not sent. Model quality or business benefit is not guaranteed; correlations and before/after changes are not causal proof.

### Typed question charts — development addition

Currently wired in the production route and independently PG/browser tested, but awaiting the next immutable full acceptance batch at writing time. POST E/ai `{purpose:"question",question:≤2000,start,end}` supports at most31 inclusive calendar days. Result includes id/answer/tokens/evidence and questionEvidence. GET E/ai/questions/:callId returns id/status/answer/questionEvidence/tokens/createdAt/evidenceStatus (verified-tool-trace/legacy-unverified/not-completed); failed/reserved calls have no verified answer/evidence.

The authorized query_analytics trace is persisted with deterministic charts. Queries use metric pv/uv/sessions/conversions/conversion_rate, dimension day/page/source/device, start/end, limit1–100 and strict source/device/os/page filters; no SQL or other-site selector. Charts have unit count/ratio, points(label,value nullable, optional numerator/denominator), truncated/totalGroups/timezone/precision. Trace reports the actual selected published-fact source (postgres, clickhouse or hybrid), determined from owner/completion receipts rather than configuration, with generation/epoch/watermark/coverage and permission-check timestamps. No successful authorized tool call yields502 external_response_invalid; budget429, no opt-in409, dirty/stale409 aggregation_pending, denied permission403. Final authorization/version/budget/evidence checks reuse one client and commit atomically. A model's statement that it queried data is not proof.

## Storage and instance administration

GET S/storage(admin) shows mode/replica_format/watermark/errors. PUT `{mode:postgres|mirror|prefer_clickhouse,replicaFormat?:snapshot_v1|incremental_v1}`, POST /storage/replay. Unconfigured CH switching returns409. PG remains canonical; CH is an optional validated replica. Source/mode/fallbackReason are explicit; stale/corrupt/deleted replicas fall back instead of answering false zeros.

S/storage/history GET(admin) lists latest100 manifests; POST/capture; POST/:id/backup; POST/:id/restore `{namespace:UUID}`. Missing configuration409, published manifest404. Signed backup files stay in dataDir; restore creates an isolated CH namespace, does **not** activate canonical reads or replace PG. Deletion/expiry invalidates old history. CLI and backup/file/key procedures are in [migration](migration.md).

POST /api/admin/keys/rotate retains old version keys. GET/PUT /api/admin/geoip and POST /refresh configure authenticated official checksum-verified downloads. GET/PUT /api/admin/sso/wecom maps existing members explicitly; GET /api/sso and start/callback support guarded enterprise SSO, not open auto-provisioning. Missing licensed artifacts/enterprise accounts are explicitly untested.

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

## Local example verification

On2026-10-10 a temporary real PG schema and native Fastify listener executed setup200→site201→collect202(accepted2, pageview and boolean event)→production worker→the documented read-only curl→real SSE first frame. Curl returned PV1/UV1/coverage1, SSE200, CLI EXIT0, schema/temp keys removed, no external calls or secrets printed. The initial temporary .ts runner failed CJS transformation before application startup; switching the helper to.mts allowed the actual run. This verifies these local examples, not all endpoints or real provider accounts. See the installed version and per-feature acceptance records for wider evidence.

## AI derived-data invalidation: integrated, complete-batch acceptance pending

Deletion and journal replay now call invalidateSiteAi to conservatively purge site-derived AI answers, final tool evidence and suggestions, and revoke associated exports. Monthly quota/accounting is retained to prevent deletion from resetting expenditure. Real PG targeted checks verify invalidation and ledger retention; the path is included in main fa3e82873d9b9e3cb1b139fbea3db9c742995a48 seventh-stage compiled-app acceptance. Do not describe older images as already enforcing it; subsequent040 notification-snapshot/dispatch protection remains a separate worktree slice.

## 百度搜索资源公开可行性 / Baidu public feasibility

截至2026-10-10，官方[搜索分析说明](https://ziyuan.baidu.com/college/articleinfo?id=3415)介绍点击/展现/关键词/平均排名/热门页，但普通站长公开文档化读取API未证实，不能断言不存在。收录API仅提交URL。[2015关键词下载说明](https://ziyuan.baidu.com/wiki/571)没有当前实际CSV样本；[百度统计搜索词API](https://tongji.baidu.com/api/manual/Chapter1/source_searchword_a.html)提供PV/UV搜索词，不等同自然搜索展现/排名。手动自定义模板/列映射不能称原生CSV兼容，真实账号/样本未提供；本产品连接器状态仍unsupported-unverified。

As of2026-10-10, official search-analysis product documentation describes clicks/impressions/keywords/rank/popular pages, but a publicly documented read API for ordinary site owners has not been established. This does not prove no such API exists. URL-submission APIs and Baidu Tongji PV/UV search-word reports are different capabilities. A2015 download article is not a current native CSV sample; custom templates/column mapping must not be advertised as native compatibility without samples.

## Standard MCP and canonical-storage development boundaries

POST `/api/sites/:siteId/mcp` is registered in the current default application. It implements JSON-RPC2 initialize, ping, tools/list and tools/call over stateless Streamable HTTP. POST responses are JSON; valid notifications receive202. Authenticated GET/DELETE receive405 and Allow: POST. Every request requires this site's read permission, with authorization checked again before reading and before returning a tool result. A supplied Origin must exactly match PUBLIC_URL.

The only tool, query_analytics, exposes authorized typed read-only aggregates: up to31 inclusive calendar days and100 groups. It accepts no SQL, other-site selector, raw-event retrieval or mutation. Success returns content and structuredContent; execution/range failures are MCP isError results, while authorization failures useHTTP401/403. Protocol errors use -32700/-32600/-32601/-32602 rather than the ordinary API error envelope. Official SDK1.32.1 passed realHTTP/PG client checks negotiating2025-11-25. The declared2025-06-18 and2025-03-26 versions and other desktop clients were not independently verified. See [the MCP connection guide](mcp.md). Four dedicated checks passed, and default registration is included in the fa3 seventh-stage compiled-app acceptance. Older images must not be assumed to contain it.

Ordinary installation still uses PG authority. The032 canonical adapter,033 normalized facts and034 replay metadata index are targeted development slices; canonical activation remains guarded off. Do not edit authority rows or prune PG raw data to bypass that guard. Isolated canonical tests fail closed with503 canonical_unavailable when CH cannot provide authoritative data, rather than answering from empty PG raw tables. Existing optional-replica modes retain their explicit PG-fallback contract.

034 stores chunk keys, event/page identifiers, hashes and record-time bounds, never rrweb bodies. Canonical replay reads are bounded at1000 chunks/128MiB; full-site export retains its100k-per-table cap. Canonical usage bytes:null means CH physical disk usage is not measured; logical_bytes is serialized event JSON size. C4 has targeted real PG/CH coverage for immutable replacement of mixed-identity records, physical acknowledgement of old bodies, failure rollback/orphan recovery and independent-journal restoration (three tests). This is not yet new immutable full-suite or native rrweb canonical-browser acceptance. The30-day physical replay-retention lifecycle has the worktree-only targeted implementation below, pending next immutable full acceptance; activation/replay guards remain closed, and index hiding is not physical erasure. [Targeted governance evidence](../ACCEPTANCE_CANONICAL_GOVERNANCE.md) is not complete immutable-main or deployment acceptance.


The new035 durable AI reservation ledger stores quota reservation/settlement state, without model bodies or visitor foreign keys. AI-derived-data deletion must not erase it and reset expenditure. Site-facts export excludes this operational state (ai_reservations, reason quota-ledger-operational-state), while preserving the existing numeric ai_budget facts policy. Full PG backups include the ledger. Its targeted and complete-batch evidence must remain separate; older images must not be assumed to contain035.

### Subsequent worktree: replay TTL and restore authorization

037 stores a monotonic authorized cutoff, attempts and retry state. Scheduling commits before partition/site locks; processing follows partition→site→job and reuses one client. Canonical mixed chunks are replaced immutably and old-body removal is physically acknowledged. Optional historical archives with PG authority also preserve newer records and valid derived buckets. The cutoff uses the shorter of site retention and30 days; lengthening retention cannot revoke prior authorization. Failures preserve retry pointers and fixed error codes. This operational ledger is separate from the personal-deletion journal.

The proof is version2 with scope=canonical-and-history-replay; version1 is rejected. The stable v1 instance key signs sourceScope, issue time and the complete cutoff set (default validity10 minutes, at most5000 sites). Scope is active CH-authority sites ∪ published raw-history sites ∪ previously authorized037 sites, protecting old backups even after current raw archives disappear. Backup index.retentionSites must match. Restore validates signature/source/freshness/completeness and merges GREATEST before publishing bodies; it physically filters current and historical bodies in the same uncommitted transaction before commit. A changed source cutoff vector or journal blocks the success marker; source CH is untouched.

Canonical limits are10k visitors per site and10k chunks per visitor; exceeding them fails without first removing indexes. Targeted real PG/CH tests cover scope, source-history TTL, restore and retry. Native CLI dump and isolated PG/CH restore, latest-cutoff physical filtering and source-advance rejection also passed with nonempty standard036 carry (schema includes041; its rows are empty in this native fixture), with the latest journal erasing A while preserving B. Targeted nonempty daily-package tests passed; complete daily activation/restore, strict PG metadata, complete-image and native canonical-browser acceptance remain pending, and activation/replay guards remain closed. See [governance evidence](../ACCEPTANCE_CANONICAL_GOVERNANCE.md).

Subsequent notification protection binds reports and person-derived alerts to aggregationEpoch. Dispatch re-reads running status, attempts, live lease and current epoch under same-client partition/site shared gates, revoking stale bodies. The gate remains held across bounded15-second transport and result recording, preventing a stale claim from sending after deletion acknowledgement. Already sent or in-flight external messages cannot be recalled. Local native HTTP/PG deletion races are tested; real SMTP/enterprise delivery is untested. These subsequent slices are not part of fa3 or an assurance about older images.

048 strict export (verified in immutable7fbb561): V2 stats_hourly/stats_daily facts are projected from the current authenticated published fact vector, not stale compatibility-cache values or control-field default zeros. The uv/membership_counts fields are exact SQL distinct counts; visitor_values_exported=false means individual member values are omitted. export_manifest.source_vector separates published_fact_source from raw authority and records canonical/deletion/aggregation epochs, generation/processed_generation and watermark. Dirty state is rejected. Physical erasure and independent strict source/target restoration have actual joint native evidence and are included in immutable local acceptance; projection alone is not erasure. New image and capacity checks remain separate.

048 privacy-invalidation export preview: known current V2 values use authenticated044/047 facts without requiring an erased048 compatibility namespace. An irreconstructable legacy table is omitted from JSON and listed in export_manifest.unsupported_tables/table_read_metadata with coverage=0, a reason and known time bounds. Absence is not a true zero. Authenticated current rows may remain while the manifest identifies unavailable older history. Real vitals samples can produce TDigest centroids with their weighted sample_count. Only known privacy-baseline invalidation permits this explicit partial export; missing/corrupt bodies, invalid seals or CH transport failure still fail. Do not sum bucket UV across days or hours.

Raw-prune safety fix: admin canonical HTTP `{action:"prune"}` returns409 `canonical_backup_required`; paths or backup JSON are not authorization. The CLI verifies the actual signed raw package, current independent journal, source/epoch/generation and body hashes. See [migration steps](migration.md). This gate passed the immutable7fbb561 local matrix; historical3e052d8 counts are unchanged.


Report-filter extension (current development slice; PG/browser integration pending): saved DSL accepts optional path/channel and all five UTM fields. Every present filter matches together in manual run and scheduled current/previous comparisons. Old reports require no migration: absent or empty fields mean unrestricted. Unknown keys, reversed dates and oversized fields are rejected. Limits: path1024, channel100, each UTM500 characters. Scheduled cadence supplies its own period while preserving the saved filters; it does not reuse a stale fixed historical date range. Retention, daily-salt identity and exact coverage restrictions still apply.

### Intake observations, bot reasons, diagnostics and manual annotations (round-two development slice)

New routes are wired; current evidence is type/lint/unit verification. Actual PG/browser joint acceptance is pending and is not added to the historical494 count.

- `GET /api/v1/sites/:siteId/intake-status` (read): optional ISO from/to and seven report filters; defaults to seven days. Returns receiver time separately from event time, accepted-batch generation, watermark and requested-query coverage. Stages: not_observed/aggregation_pending/statistics_available/statistics_unavailable. Failed stats reads roll back a savepoint rather than claiming complete data. Missing050 observations on an older site do not prove tracker failure. No site crawling, generated pageviews or snippet certification; empty filtered results do not imply failed intake.
- `GET .../bot-observations?from=YYYY-MM-DD&to=YYYY-MM-DD` (read): at most31 site-calendar days,200 groups with truncation. Reasons are ua/request_burst with rule ID/version. Filtered requests and unvalidated declared batch events are separate counts, neither is PV. Legacy category-counter differences remain unknown with null event counts. No raw IP/UA/visitor/body storage.
- `GET .../self-host-diagnostics` and `/export` (admin): read-only whitelisted DB/Redis configuration state, schema versions, aggregation watermark/failure booleans, queues, authority and retention. Redis configured_not_checked is not a health claim; physical bytes are not measured. Backup not_verified requires an actual current signed package plus independent latest journal: it is neither failed nor proven restorable. No arbitrary paths, automatic repairs, connection strings, secrets, raw errors, visitors or bodies. Download uses no-store.
- `GET .../annotations?from&to` (read): ISO calendar dates, up to366 days/200 notes with truncation. Each note stores its write-time timezone; currentTimezone is separate. `POST`, `PATCH /:id`, `DELETE /:id` require write/analyst permission. Input is `{date,title,note?}`; title1–120, note≤2000 characters. Date validation and audit are transactional; edits bind the current site timezone. Viewer edits fail and cross-site access is denied; missing records return404. These are manual notes with measuredEvidence/causalEvidence:false, never AI facts or causal evidence.

Final1c fixed-load result:1000 PASS, final HTTP5120ms. 5000 FAIL:4900 accepted,2 unsent,39 delayed; query failures0; drainReached=false at120s, remaining backlog1350/max3250. Final query25.389s failed, assertionsExecuted=[]; no successful six-assertion integrity claim. Node peak730509312 bytes excludes DB services; source unchanged and all four cleanup flags true. No budget rejection occurred. Passing code/browser/image does not close this local performance gap or prove a speedup/SLO. Evidence: main-1c1cb65-independent-strict-5000.json and its record under docs/test-evidence, archived separately; earlier failures remain.

0a0c171包含三批候选及idlefatal修复。第四轮实际19/19 PASS（11budget+4server+3triple+1strictrestore）、0skip/0uncaught，另10单元/type/lint通过；这是提交前源码摘要绑定定向证明，不是新全局计数。原前三轮FAIL及bd完整EXIT1全部保留。0a新完整空库、镜像和固定负载正在准备，不预写通过；旧c890632、1c30/image、1c1000PASS/5000FAIL各按原源码阶段保留，不外推0a。

## 历史前次状态入口（原记录保留）

## Current validation entry (66150be)

Latest local main d67bb8a is saved, with push authorization unavailable(no token creation). It skips identity TEMP writes only when same-run effects/vitals are both complete CH; mixed sources keep the original path. Type/lint,20 affected real integration tests(2 new+18 existing),and217 units PASS/0skip;20 is a subset,not added to426. Initial217 run had215PASS/2 old-mock failures,retained before shape-only correction. New full/image/load pending;last completed full remains661641+30. Prior image ENOSPC remains FAIL;owned old cache cleanup and target healthy EXIT0 only prove diagnostic recovery,native not run.No speedup inference.
d67 full actual EXIT1/cleanup:645 backend(217 unit+428 integration)ALL PASS;browser29 PASS/1 FAIL(protected-share read-only text absent;actual503 snapshot changed,retry).D diagnosis pending;not a full pass.New full image/load pending.Remote e441 verified;local e441..d67 bundle/tracked-source checkpoint saved,bundleverify0,no runtime. No new credentials.

661 formal full:215 unit+426 real integration=641 PASS,30 E2E(28 real Chromium+2 date)PASS,EXIT0/cleanup. Fixed1000 PASS(finalHTTP5.047623651s). Fixed5000 overall FAIL:4350accepted/13unsent/35delayed,drainfalse120s;accepted4350 final PV4350/coverage1/CH and six integrity assertions PASS,21.102973929s.Not5000/SLO acceptance.

New image actualEXIT1:CH target233/ENOSPC creating preprocessed_configs;build/install/manifest/budget/55DDL/licensing/seed passed,native phase not started,targetcleanup complete.F archives evidence;no inferred root cause.Local01e2c5d saved,remote confirmation not claimed.Hosted workflows not triggered.Historical validation sections are marked by SHA; the API and installation operating guide below still describes current contracts.

## Current security contracts

Instance administration requires an administrator browser Cookie session. Site API tokens, including administrator-issued tokens or admin scopes, and mixed Cookie/Authorization credentials are rejected. Site creation, configuration and write-key rotation commit their audit in the same transaction; an audit failure rolls back the mutation and preserves the previous key.

Account passwords use one rule for setup, login and invitation registration: 12–1024 characters, at most4096 UTF-8 bytes. Existing long invitation passwords remain usable. New share passwords require8–1024 characters and at most4096 bytes. Asynchronous scrypt preserves the legacy32-byte salt/hash format. Legacy verification accepts up to1MiB UTF-8 bytes and remains subject to the original1MiB limit for the entire HTTP body; it never truncates input or raises the body limit. At most four share-password derivations run concurrently, without a waiting queue; overload returns503 `share_password_busy` and `Retry-After:1`.

Authenticated statistics/site-management/admin requests share a600-request/user/60-second fixed-window budget across sites and Cookie/API tokens. Public share and embed requests share120 requests/trusted-IP/60 seconds. Excess requests return429 with Retry-After; configured Redis failure/timeout returns503 without resetting quotas. Without Redis the bounded process-local budget does not coordinate replicas. Details: [request budget](../API_RATE_LIMIT_CURRENT.md).
