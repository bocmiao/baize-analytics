# 用户 API 手册 / User API manual

## 当前验收入口（2818bd4）

c890实际后端211单元+421真实集成=632 PASS；1c1cb65浏览器30检查（28Chromium+2日期）PASS，src/db/packages与c890相同，不声称后端重跑。1c生产镜像实际EXIT0，main-1c1cb65-image-*证据绑定source1c。最终固定1000已PASS：最终HTTP5120ms、Node应用+harness采样峰650272768字节（不含存储服务）；5000最终FAIL（4900accepted/2unsent/39delayed、排空超时、最终断言未执行），不预称通过或SLO达标。预算默认值不保证scan行数、heap上限或性能改善。下文main0f/de当前或标记browser待等均为对应SHA历史原文，旧失败保留；托管不触发。

## 历史契约与阶段记录

当前交付：main0f14；19d97af同源595应用/30检查与55DDL/两个索引生产镜像均实际通过，核心activation guard已true，逐站proof/epoch/journal仍强制。下文早期切片的guard关闭/未交付描述是历史时点，不能用于当前操作；不得手动改authority绕过证明。ac投影仅定向14真实+2单元通过，ac1000通过5.316秒、5000失败，浏览器专项实际30检查PASS/0skip，96.441秒、EXIT0，不外推全轮或镜像。

本手册描述当前应用路由，面向自托管管理员和集成开发者。主体 AGPLv3，独立 tracker MIT；接口不要求付费订阅。开发中接口单独标注，不能据此假定某个旧镜像已包含新功能。运行版本及真实验收见 [主验收记录](VALIDATION_MAIN.md)。本文件同时提供中文契约与英文操作说明。

This manual documents implemented self-hosted endpoints. Check your installed version against the validation record. Development additions are explicitly marked; external connector fixtures do not prove real provider-account access.

## 通用约定 / Conventions

请求、响应默认 JSON；CSV、下载、HTML embed 和 SSE 例外。站点接口前缀 `S=/api/v1/sites/:siteId`；**外部连接器使用** `E=/api/sites/:siteId`，没有 `v1`。UUID 参数须传实际返回 ID。日期时间使用 ISO8601 UTC（例如 `2026-10-01T00:00:00Z`），外部日历报表用 `YYYY-MM-DD`。统计期间通常 `[from,to)`；Google 连接器 `start/end` 是包含两端的日期范围。时区是站点 IANA timezone，不是浏览器时区。缺失、不可用或不支持的指标可能为 `null`；不能显示成零。

Endpoints below use S and E as path abbreviations, not literal URL variables. Analytics timestamps are half-open intervals; provider calendar-date intervals are inclusive. Preserve null/coverage/status metadata instead of presenting missing data as zero.

会话为 HttpOnly `baize_session` Cookie，SameSite=Lax，HTTPS 实例启用 Secure，最长7天。Cookie 写请求应同源；错误 Origin/跨站写入返回403。自动化可使用 `Authorization: Bearer $BAIZE_API_TOKEN`，Token 仅限创建时的站点，且同时受所属用户当前成员权限约束。不要放进 tracker、网页 HTML、URL 或日志。全局站点列表/创建不能使用站点 Token；实例设置应使用管理员 Cookie。完整英文契约见 [English API manual](en/api.md)。

| 权限 / Permission | 成员 / Roles | 可执行范围 / Scope |
|---|---|---|
| read | viewer / analyst / admin / owner；实例管理员 | 站点看板与只读分析 |
| write | analyst / admin / owner；实例管理员 | 目标、漏斗、自定义报表等写入 |
| admin | admin / owner；实例管理员 | 成员、Token、删除、导出、分享、渠道等 |
| API scopes | read / write / admin | write包含read；admin覆盖站点三类权限，仍受用户权限约束 |

列表通常返回裸数组，站点列表为 `{sites}`，连接器为 `{connections}` 等。**当前没有通用 cursor/page/pageSize 分页契约**；不要猜测参数。下表列出的 LIMIT 是截断上限，除明确有 truncated/coverage 的接口外，未保证遍历所有历史记录。需要整库数据使用备份，不靠反复请求无限导出。

Most lists have fixed limits and no public pagination cursor. Do not invent page parameters. Read the endpoint-specific response shape and truncation metadata.

## 初始化、会话与站点 / Setup, sessions, sites

| 方法与路径 / Method/path | 请求 / Request | 响应与权限 / Result |
|---|---|---|
| GET /healthz | 无 | 数据库、Redis、GeoIP状态；存储不可用503 |
| GET /api/setup | 无 | `{required:boolean}` |
| POST /api/setup | `{email,password,name?}` | 首个实例管理员及Cookie；已初始化409 |
| POST /api/login | `{email,password}` | `{user}`及Cookie；失败401 |
| POST /api/logout | Cookie | 清会话，`{ok:true}` |
| GET /api/me | Cookie/Token | `{user}`，不等于拥有其他站点访问权限 |
| GET /api/v1/sites | Cookie | `{sites:[...]}`，含current_role，无salt_secret |
| POST /api/v1/sites | 管理员Cookie；见下 | 201 `{site}` |
| GET S | read | `{site}` |
| PATCH S | admin；部分站点字段 | `{site}`；有事件后变privacy_mode返回409 |
| POST S/write-key | admin | 一次返回key与HMAC签名说明；不是管理API Token |
| GET /api/tracker/config/:siteId | 公开；Origin与可选cookie_domain | 隐私/同意/回放/热图/vitals开关；不返回写密钥 |

登录/初始化每内存IP摘要10次/分钟。密码12–256字符，邮箱最长256。站点创建 `{name,domain,timezone?,privacy_mode?,retention_days?,tags?,config?}`；name≤128，retention_days 1–3650（默认365），tags≤20，每项≤64。privacy_mode为standard或daily_salt，默认standard。config支持allowed_hosts、consent_required、replay、heatmap、vitals、experiments、excluded_ips、session_timeout_minutes（1–1440）、seoAutoScan、channel_rules、ai_referrer_hosts。allowed_hosts为同可注册站点域的精确DNS主机，不是任意第三方域/通配符。channel_rules最多50条，按顺序匹配：`{name,channel,referrer_host?,include_subdomains?,utm_medium?,utm_source?}`；至少一个条件，组合条件同时成立。ai_referrer_hosts最多100个精确主机。不要把邮箱或用户标识放进规则名称或属性。

Create a site before installing the public tracker. Changing timezone/session timeout queues recomputation. A populated site's identity mode cannot be changed in place; create a separate site.

## 可靠采集 / Reliable collection

`POST /api/collect` 不要求管理会话；请求 Origin 必须属于站点。支持 application/json，tracker卸载发送的text/plain JSON，以及受解压上限控制的gzip。公开浏览器仅持site_id；服务端SDK可用站点write-key/Bearer写密钥；提供Bearer写密钥时必须同时签名，HMAC方式使用 `X-Baize-Signature`（canonical sorted-key envelope JSON的HMAC-SHA256 hex），详见 [SDK实现与安装](../sdk/)。不要把签名密钥发给浏览器。

```json
{
  "protocol_version": 1,
  "site_id": "<SITE_ID>",
  "sdk": "custom-sdk",
  "sent_at": 1790812800000,
  "events": [{
    "event_id": "<UUID>", "visitor_id": "<UUID_OR_NULL>",
    "page_id": "<PAGE_INSTANCE_UUID>", "ts": 1790812800000,
    "type": "pageview", "url": "https://your-site.example/pricing",
    "path": "/pricing"
  }]
}
```

占位UUID须替换为实际UUID，visitor_id的null须是JSON null。每batch 1–50事件，envelope包含protocol_version/site_id/sdk/sent_at；事件time为毫秒整数。基本字段event_id、type、ts、visitor_id、page_id、url、path必填；url须HTTP(S)，path以/开头。202表示成功事件已在PG事务落库；响应含accepted/duplicates/rejected，重复事件包含于accepted，不代表新增量。批内单条非法可rejected，不能只检查HTTP202。重试须保留整条原事件/event_id；同站点相同event_id内容不同拒绝event_id_conflict，不能覆盖旧事件。超过未来24h或站点保留期拒绝。限流100请求/分钟/IP摘要；20请求/秒等机器人规则仍生效，识别机器人不计普通PV，可能204。

202 acknowledges durable intake, not finished aggregation. Inspect rejected records and retry unchanged IDs. Duplicate receipts are not new pageviews. Background aggregation is asynchronous and uses event time, not arrival order.

| type | 额外字段 / Extra fields |
|---|---|
| pageview | title/referrer/screen/language/UTM可选；SPA每页面实例新page_id，多标签不同实例 |
| event | event_name 1–128；props最多20项，key≤64，值string≤2048/有限number/boolean；不支持嵌套对象 |
| heartbeat | visible_ms 0–86400000；可选interval_start/end，必须有效前台可见区间 |
| vitals | vitals对象：lcp/inp/cls/fcp/ttfb非负；LCP/INP/FCP/TTFB毫秒、CLS无单位 |
| revenue | revenue非负≤1e12、currency大写3字母、order_id 1–128；同订单同金额币种重试不重复入账，冲突拒绝 |
| identify | user_id 1–256；仅standard，建议应用内部无PII账号ID |
| consent | props中的同意状态；撤回后tracker立即停止、清ID/队列 |
| replay | replay数组≤500，replay_seq非负整数；明确站点启用与完全遮罩 |
| heatmap | `{x:0..1,y:0..1,kind:click或scroll,width?,height?}`；文档归一化坐标 |

入口仅在内存处理中使用原IP/UA做HMAC、规则、地域查找；持久化脱敏IP/维度。属性中的稳定身份别名、联系方式等被清理；identify持久化站点哈希与按事件时间绑定，A→B切换不回溯归属旧匿名段。daily_salt无cookie，不接受identify，不支持跨日UV、留存或身份跟踪；page实例也每日作用域，导出不应恢复原稳定身份。删除tombstone阻止后续重入，入口与worker协调站点锁、事件时间段、epoch和缓存。

Heartbeats are deduplicated/recomputable; sessions use configurable inactivity time, event-time ordering, and page instances across tabs/SPA. Daily-salt mode deliberately cannot support cross-day identity metrics. Masking replay strips attributes/styles/images; it is a structural reconstruction, not pixel-perfect replay.

## 查询与指标 / Analytics

大部分统计请求 `from?,to?,compare=previous?`，默认最近7天；filters为path/channel及UTM字段，具体下表。必须查看watermark、coverage、rangeStatus、unavailableHours、retentionBoundary、precision/storage。`coverage=0`可表示未完成聚合、原始明细过期或过滤所需历史不可用，并不等于无访问。未来to可能夹到now；保留边界半小时桶不能伪造准确旧明细。Revenue按币种输出，混币种总revenue为null，不能跨币种直接相加；vitals分位来自加权tdigest近似，有sampleCount与quantileStatus。

| 路径（GET，read） / Path | 输入 / Input | 输出与上限 / Output/bounds |
|---|---|---|
| S/stats | from/to/compare；path/channel/UTM过滤 | totals、trend、pages、sources、audience、dimensionRows、events、vitals、paths、goals、funnels、cohorts、retention；previous比较保留自己的coverage |
| S/analysis | from/to同时传则选定范围；否则retained_detail | 目标转化/归因、漏斗steps/dropoff/rate，不等于明细特征 |
| S/pages/detail | path必填，from/to | 页面趋势、来源、设备和totals |
| S/content 与 S/analysis/features | from/to必填，保留明细≤90天；同过滤 | 下载Top、404脱敏来源、事件趋势、目标渠道趋势、漏斗流失等；不可用显式status |
| S/content/404.csv | 同上 | UTF-8防公式CSV修链清单；无完整明细409；有审计 |
| S/funnels/:funnelId/analysis | from/to必填，过去90天内，property可选 | 严格/宽松访客漏斗每步entered/completed/lost/lossRate，Top sources/devices、typed properties与缺失样本；100k事件上限，超过coverage0/truncated；跨日daily_salt unsupported；**此端点未支持全局UTM过滤** |
| S/event-properties | event_name/property/from/to必填，≤90天 | groups/typedGroups，boolean与字符串独立；最多100桶/读取100k事件，保留storage.truncated |
| S/geography | from/to必填，≤90天；country/region及同统计过滤 | 地域聚合；unknown缺GeoIP不编造省市坐标 |
| S/revenue | from/to≤90天，同统计过滤 | 按币种趋势/订单/归因，不能跨币种折算 |
| S/identities | from/to≤90天；registrationEvent默认signup | standard已识别用户key，保留窗内注册后正收入转化；daily_salt unsupported |
| S/identities/:userKey/activity | opaque userKey；from/to | 跨设备时间绑定会话/事件，非原身份文本 |
| S/users/:userId/paths | 应用原userId，from/to≤90天 | standard内部时间绑定，最多5000事件；不支持daily_salt |
| S/realtime | 无 | 最近5分钟在线与30分钟事件；不是累计访客总量 |
| S/realtime/stream | SSE；Last-Event-ID为outbox整数 | 2秒轮询、200记录/轮、30分钟保留；id为持久outbox游标，能包含迟到事件；权限撤销自动断开 |

请求完整筛选统计可能从保留事件重建，exact visitor set不能通过相加维度UV替代。Funnel strict要求相邻步骤，loose允许中间事件；不拼接不同会话。接口保留bounded读取/截断信息，无法把过期原始行为重建为真实历史特征。

Examples below assume credentials already supplied privately as environment bindings. Do not print passwords/tokens or use shell tracing. `$BAIZE_BASE` must be your local instance, not an external service.

```bash
# Safe read-only examples; no production deployment or external provider call.
curl --fail-with-body -H "Authorization: Bearer $BAIZE_API_TOKEN" \
  "$BAIZE_BASE/api/v1/sites/$BAIZE_SITE_ID/stats?from=$BAIZE_FROM&to=$BAIZE_TO"
curl --fail-with-body --no-buffer -H "Authorization: Bearer $BAIZE_API_TOKEN" \
  "$BAIZE_BASE/api/v1/sites/$BAIZE_SITE_ID/realtime/stream"
```

## 目标、漏斗、实验、回放 / Goals, funnels, experiments, replay

S/goals与S/funnels：GET(read)、POST(write)、PUT `/:id`(write)、DELETE `/:id`(write)。目标 `{name,type:event|page|duration,config}`，对应event_name/path/seconds；漏斗 `{name,steps:[{type:page|event,value}],strict}`。变更使generation增量并排队重算；不是立刻完整统计。GET S/jobs(admin)返回聚合租约、attempts、dead_letter、watermark/outbox计数；POST S/jobs/replay(admin)更新epoch并清重试状态，旧worker失去fence，保留明细重算。

S/experiments：POST admin `{name,variants:["control","variant"],goal}`（name/goal 1–128，variants 2–10项、每项1–64且必须唯一），GET read返回逐variant访客、真实事件贡献转化、comparison p值/95%CI/样本状态；PATCH `/:id` admin `{enabled:boolean}`。公开 `POST /api/v1/experiments/:id/assign` `{site_id,visitor_id,consent:true}`仅standard且站点experiments启用，返回固定variant，已删除访客410。实验转换按事件ID/time贡献可在删除A身份段后保留B；旧历史不能完整还原时partial_history_unavailable，不给显著结论。统计比较不能替代固定周期、足够样本和禁止早停的实验设计；平台没有承诺强制预约周期。

GET S/replay(admin)接受path/page_id/from/to/limit（1–1000，默认1000），返回session_id/seq/payload及page_id/path/started_at/ended_at/event_count；无分页游标，千块不代表所有回放。GET S/heatmap(read)接受path/viewport/kind(click|scroll)，最多10k桶，coordinate_system=document_percent，viewport_bucket_px=100；不能把不同页面/视口桶无条件叠加。原始回放最多保存min(retention_days,30)天。

## 治理与分享 / Governance and sharing

| S后缀 / S suffix | 方法、权限 / Method, permission | 契约 / Contract |
|---|---|---|
| /reports | GET read；POST write；PATCH/DELETE /:id write | `{name,dsl:{from,to,path?,channel?,utm_source?,utm_medium?,utm_campaign?,utm_term?,utm_content?}}`；GET /:id/run read执行保存DSL，范围/coverage真实返回 |
| /channels | GET/POST admin；DELETE /:id admin | `{kind:smtp|webhook|wecom|serverchan,config:{...string}}`；GET仅id/kind不返密钥；SMTP host/port/from/to/user/password/locale，webhook URL须HTTPS且SSRF安全 |
| /schedules | GET read；POST write；DELETE /:id write | `{report_id,channel_id,cadence:daily|weekly|monthly}`；同站点校验；异步通知任务、重试与日志 |
| /alerts | GET read；POST admin；DELETE /:id admin | `{kind:traffic|goal|funnel|offline|storage|serp,config,channel_id}`；POST /:id/silence `{hours:1..720}` |
| /notifications | GET admin | 最新100通知日志；失败不泄露提供方响应/凭据 |
| /members | GET admin；PATCH/DELETE /:userId admin | role为admin/analyst/viewer；不能通过普通成员修改移除owner |
| /invites | POST admin | `{email,role,channel_id?}`；返回一次token/url、email_queued；邀请7天，不等于邮件实际投递成功 |
| /tokens | GET/POST admin；DELETE /:id admin | `{scopes:[read|write|admin],expires_at?}`；创建一次返回token，GET仅元数据，删除撤销 |
| /audit | GET admin | 最新500站点审计；自动清180天旧记录，无游标 |
| /usage | GET read | event_count/bytes是当前PG站点事件占用估计，不是计费或整实例空间 |
| /retention | PATCH admin `{days:1..3650}` | 更改保留策略；缩短后异步清理，不恢复已删明细 |
| /delete-visitor | POST admin `{visitor_id?,user_id?}` | 至少一个；持久独立删除journal后完成；daily_salt不支持跨日user_id删除 |
| /exports | POST/GET admin；GET /:id admin下载 | `{format:csv|json,full?:boolean}`→`{id,status:pending}`；列表追踪pending/running/complete/failed/revoked与read_metadata |
| /shares | GET/POST admin；DELETE /:id admin | `{password?:至少8字符,expires_at?,frame_origins?:精确HTTP来源[]}`；创建一次token/url；删除撤销 |

Traffic告警比较完整上一小时与28天同小时可覆盖样本，至少7样本、连续两小时异常；保存observed_hour/baseline_samples/generation/coverage，未处理旧事件时等待而非编零。goal/funnel/storage/SERP的config具体由UI填写，当前为record而非稳定强类型配置；避免假定未文档化字段。SERP通知使用真实保存的排名变化。通知失败最多3次，持久退避；SMTP/HTTP集成测试不等于真实邮件/企业账号交付。

站点full导出包含有界业务事实和脱敏配置，不包含账号密码、盐、连接器密钥、Token哈希等秘密；**每表最多100k行**，超过任务failed/export_limit_exceeded，不提供无限导出，不是整实例灾备。full CSV格式是table,record，普通CSV是event列，防公式注入。下载返回X-Baize-Event-Source/X-Baize-Read-Coverage。删除撤销旧导出，物理文件与临时文件由可靠cleanup重试；没有complete状态时下载404。

公开POST `/api/v1/shares/:token` body `{password:"..."}` 返回最近30天站点日历聚合/coverage，无管理权限。GET `/embed/chart?token=...&type=top-pages&lang=zh-CN|en` 返回静态安全HTML，CSP frame-ancestors仅配置允许源。密码embed需X-Share-Password header，普通iframe无法自动传该header；不要把密码放URL。公开只读分享仍是访问凭证，应按最小期限分发并可撤销。

Public share URLs are bearer capabilities, not login credentials. They only expose a fixed read-only aggregate view. Password-protected embeds require a header-aware client; a plain iframe cannot supply that password header.

## 外部服务 / External connectors

全部下列E路径均站点隔离；GET read，设置/导入/扫描/排名/复检一般admin，AI问数/query/usage read，ai/test admin；evidence/suggestions创建与状态变更write；SEO建议复检另需admin。不得在客户端或仓库保存提供方secret。OAuth发起及callback绑定当前用户/Cookie/session、一次state/PKCE。实际服务账号尚未验证的项目见 [外部验收](ACCEPTANCE_EXTERNAL.md)。

| E后缀 / E suffix | 方法 / Method | 请求与响应 / Request/result |
|---|---|---|
| /external | GET/PUT；DELETE /:kind | PUT `{kind:google|ai|serpapi|dataforseo,secret?,settings}`；GET不返回解密secret；Baidu返回unsupported-unverified |
| /external/jobs | GET；POST /retry | 最新100；retry `{kind,jobKey,day}`仅可重试failed且attempts<5 |
| /google/oauth | POST | 返回授权URL，管理员自行授权；callback `/api/google/callback?state&code` |
| /gsc/import | POST `{start,end}` | 真实API聚合query/page/day，通常延迟2–3天；自动每日导入须dailyGsc启用 |
| /gsc | GET start/end | 最多1000按clicks排序行，无cursor；不能关联查询词与具体访客订单 |
| /ga4/import | POST `{start,end}` | 日期有序，最多3660天，导入五个独立报告，详见下文 |
| /ga4 | GET start/end | 日期/来源历史聚合，不能恢复原事件/身份/漏斗 |
| /ga4/window | GET start/end | 仅精确已导入窗口saved-provider-window，否则unsupported，不外推UV |
| /seo/scan；/seo/scans | POST扫描；GET最近20扫描 | 受robots/rate/DNS/redirect/同站范围限制；安全issues/pages保存在PG |
| /seo/conversions | GET start/end | 聚合search→落地页→转化对照，非个人词到订单归因 |
| /serp/check；/serp | POST `{keyword,provider:serpapi|dataforseo}`；GET历史 | SerpAPI/DataForSEO BYOK、排名变化；实际付费账号未实测 |
| /ai/query | POST read `{metric,dimension?,start,end,limit?,filters?}` | 确定性只读类型聚合，不调用模型，max31日/limit100，无SQL/其他site |
| /ai/usage；/ai/test | GET read；POST admin | 预算/任务计量；test会真实调用已配置提供方，不是无费用dry-run |
| /evidence | POST `{start,end}` | 确定性本地证据、不调用AI，适合先预览 |
| /suggestions | POST / GET | POST write `{evidenceId,title,confidence?:low|medium|high,category?:analysis|seo|performance|content}`，只能同站点完成证据；不可将模型文本当事实 |
| /suggestions/:id | PATCH状态 | `{status,implementedAt?}`；pending-recheck须implementedAt，verified须已有recheck；new→accepted→in-progress→pending-recheck→verified；false-positive可重开为new |
| /suggestions/:id/recheck | POST | write `{start,end,confounders:1–20项}`；SEO另需admin，新SEO扫描/新周期复检，旧证据不变；区分改善、干扰与因果 |

Google配置settings `{clientId,redirectUri,property?,gaProperty?,dailyGsc?,dailyGa4?}`，secret为JSON字符串 `{clientSecret,refreshToken?}`。redirectUri须等于实例 `/api/google/callback`。GA4报告分别为sourceDays、days、weeks、period、sources，rows含dimensions/pv/totalUsers/sessions，保留metadata/rowCount/property_timezone/property_id/requestedCoverage。每报告10万行上限、每HTTP响应5MB上限；超限失败，不悄悄保存不完整报告。日/ISO周/整段/来源totalUsers必须采用提供方对应报告的独立去重，不能相加日UV代替整段UV，不能与本地UV合并。阈值/采样质量limited、未知property时区须保留说明。

AI配置settings `{endpoint,model,enabled,monthlyTokenBudget,maxTokens?,localOrigin?,dailyReport?,automaticAnomaly?}`；默认不启用。仅明确登记localOrigin的实例管理员允许本地Ollama窄例外，不是全局关闭SSRF。发送用户问题/请求文本及获授权聚合数据，不发送原始事件行、原IP或身份。问题文本本身可能包含用户输入的敏感信息，提交前应自行避免；不能承诺“只传聚合从不传问题”。保留外部提供方成本风险，应用无额外收费。聚合变化和模型建议是观察性证据，不证明因果或收益。

### AI typed chart：当前工作树新增 / Development addition

该段接口已生产注册并有独立真实PG验收，但本文编写时尚未进入新的不可变全量batch；旧镜像不得假定包含。真实模型质量/Google账号等不由模拟transport证明。

POST E/ai `{purpose:"question",question:≤2000字符,start,end}`（最多31个包含端点日历日）返回id/answer/tokens/evidence与questionEvidence。GET E/ai/questions/:callId返回id/status/answer/questionEvidence/tokens/createdAt/evidenceStatus（verified-tool-trace、legacy-unverified、not-completed）；失败/预留任务没有可验证answer/evidence。

questionEvidence保存已授权query_analytics工具trace与确定性charts；query包含metric(pv/uv/sessions/conversions/conversion_rate)、dimension(day/page/source/device)、start/end、limit1–100、strict filters(source/device/os/page)，不接受SQL/其他site。charts含unit(count/ratio)、points(label,value可null，比例可有numerator/denominator)、truncated/totalGroups/timezone/precision。trace记录真实所选已发布事实来源postgres、clickhouse或hybrid（由实际owner/完成receipt决定，不能从配置推断），以及generation/epoch/watermark/coverage与权限检查时间。没有成功授权工具调用502 external_response_invalid；预算429、未optin409、dirty/stale409 aggregation_pending、权限403。最终版本guard和预算/证据同client原子提交，不能把模型自称“已查数据”当真实查询。

## Storage、历史、实例设置 / Storage, history, instance administration

GET S/storage(admin)显示配置/mode/replica_format/水位/错误；PUT admin `{mode:postgres|mirror|prefer_clickhouse,replicaFormat?:snapshot_v1|incremental_v1}`；POST /storage/replay admin重试。未配置CH切换409。snapshot/incremental均PG权威，CH是可选可核验副本，读取说明source/mode/fallbackReason；差异/落后回退PG，不静默返回空。

S/storage/history（GET admin，最新100manifests）；POST /capture；POST /:id/backup；POST /:id/restore `{namespace:UUID}`。未配置409，找不到published manifest404。history备份由服务端dataDir保存签名文件，响应id/bytes/integrity；restore仅恢复隔离CH namespace，不激活为canonical查询源、不替换PG。删除和保留会使旧历史失效，不能用副本恢复被删个人数据。实际CLI/恢复流程见 [迁移手册](migration.md)。

POST /api/admin/keys/rotate、GET/PUT /api/admin/geoip、POST /api/admin/geoip/refresh以及GET/PUT /api/admin/sso/wecom为实例设置；密钥轮换保留版本旧key，GeoIP只允许官方认证校验下载，SSO明确映射已有账号，不自动开放注册。GET /api/sso返回启用状态；start/callback需要安全会话/state。这些账号或许可未配置时不要称真实服务已验收。

## 错误与重试 / Errors and retries

统一失败JSON `{error:稳定机器码,message:固定说明}`；schema错误400 `{error:"invalid_request",issues:[{path,message}]}`，unknown API404 `{error:"not_found"}`。Internal500固定说明，不泄露DB/provider payload。HTTP状态与code一起处理，不匹配翻译文字。

| HTTP | 常见代码 / Codes | 客户端动作 / Action |
|---|---|---|
| 400 | invalid_request、invalid_json、range_invalid、funnel_range_invalid、invalid_gzip、identity_daily_salt_unsupported | 修输入，不能同请求无限重试 |
| 401 | login_required、session_expired、invalid_api_token、invalid_write_key、invalid_signature | 重新登录或安全更新凭证 |
| 403 | site_permission_denied、token_scope_denied、csrf_denied、origin_site_mismatch | 修权限/来源，不自动提升权限 |
| 404 | site_missing、funnel_missing、report_missing、share_unavailable、export_not_ready、invitation_unavailable | 校验站点/状态；share故意合并不存在与密码错 |
| 409 | setup_completed、privacy_mode_locked、invite_login_required；外部ai_opt_in_required/aggregation_pending | 等后台/调整配置，不能把未完成当零 |
| 410 | visitor_deleted | 不重新分配/复活删除身份 |
| 413 | request_too_large、export_limit_exceeded | 缩短/分离请求；站点导出改用备份需求 |
| 429 | rate_limited、login_rate_limited、外部预算限制 | 退避，不改生产限流绕过 |
| 500/502 | internal_error、export_failed、external_provider_failed、external_response_invalid | 查询任务状态，有限重试；不要展示提供方原响应 |

采集rejected单项reason与HTTP顶层error不同，包括invalid_event、future_event、outside_retention、event_id_conflict、order_id_conflict、identify_unsupported_in_daily_salt、deleted_visitor、identity_time_conflict、feature_not_enabled、unmasked_replay。Tracker网络重试最多有限次数，外部/通知/导出任务各有独立持久状态，不能假定全接口支持同一种重试。

English operational rule: inspect both HTTP status and the stable error code; retain task IDs and coverage metadata. Retry immutable intake payloads with the same event IDs, never infer success from a zero/empty chart, and never expose provider credentials or raw errors. Full database recovery, latest deletion journal and key/files restoration are separate from a site export.

## 本文示例验证 / Example verification

2026-10-10，本地独立PG schema/临时Fastify端口实际执行setup→建站→采集PV及boolean事件→生产worker→同一文档curl统计命令→真实SSE首帧：setup200/site201/collect202 accepted2，curl得到PV1/UV1/coverage1，SSE200，EXIT0，schema/临时密钥已清理，无外部调用、无凭据输出。辅助runner首次.ts因/tmp CJS转换在应用启动前失败，改.mts后实际通过；不将首个未运行当成功。该检查只验证所列本地示例，完整接口/外部账号状态以各验收记录及已安装版本为准。

## 删除AI派生信息与通知保护

应用删除和journal重放保守清除整站AI历史答案、最终工具证据和建议，并撤销相关导出；保留月度预算/计量账本防止删除重置费用。main fa3e82873d9b9e3cb1b139fbea3db9c742995a48已包含第七分阶段验证的这条路径，旧镜像须按实际版本核验。

031与AI派生内容物理清理已纳入main fa3e82873d9b9e3cb1b139fbea3db9c742995a48的第七分阶段验收；删除使相关问数答案、工具证据、建议与旧导出失效，保留预算记账避免费用重置。后续040通知快照清理与dispatch epoch门禁仍属新工作树切片，不能扩大旧镜像/旧验收边界。

## 百度搜索资源公开可行性 / Baidu public feasibility

截至2026-10-10，官方[搜索分析说明](https://ziyuan.baidu.com/college/articleinfo?id=3415)介绍点击/展现/关键词/平均排名/热门页，但普通站长公开文档化读取API未证实，不能断言不存在。收录API仅提交URL。[2015关键词下载说明](https://ziyuan.baidu.com/wiki/571)没有当前实际CSV样本；[百度统计搜索词API](https://tongji.baidu.com/api/manual/Chapter1/source_searchword_a.html)提供PV/UV搜索词，不等同自然搜索展现/排名。手动自定义模板/列映射不能称原生CSV兼容，真实账号/样本未提供；本产品连接器状态仍unsupported-unverified。

As of2026-10-10, official search-analysis product documentation describes clicks/impressions/keywords/rank/popular pages, but a publicly documented read API for ordinary site owners has not been established. This does not prove no such API exists. URL-submission APIs and Baidu Tongji PV/UV search-word reports are different capabilities. A2015 download article is not a current native CSV sample; custom templates/column mapping must not be advertised as native compatibility without samples.

## 标准 MCP 与权威存储开发边界

POST `/api/sites/:siteId/mcp` 已在默认应用注册。它提供标准 JSON-RPC2 的 initialize、ping、tools/list、tools/call，不是 HTTP typed-query 的改名；无状态 Streamable HTTP、POST JSON 响应，notification成功202，已鉴权 GET/DELETE 为405并返回 Allow: POST。每请求检查该站点 read 权限，工具读取前与返回前再次检查；提供 Origin 时须精确匹配 PUBLIC_URL。

唯一工具 query_analytics 只接受已授权站点的31个包含端点日历日、最多100分组的 typed 只读聚合，不提供 SQL、其他站点选择器、raw 数据或副作用。成功返回 content 与 structuredContent；工具运行/范围失败返回 MCP isError，权限失败为HTTP401/403。JSON-RPC协议错误用 -32700/-32600/-32601/-32602，不能套用所有普通API的错误JSON。官方 SDK1.32.1 真实HTTP/PG客户端已验证协议2025-11-25；服务声明2025-11-25、2025-06-18、2025-03-26，后两版以及其他桌面客户端不算已测。完整连接样例见[中文MCP](mcp.md)/[English MCP](en/mcp.md)。独立4项通过，默认入口已纳入上述fa3第七分阶段compiled-app验收；不假定旧镜像包含新入口。

当前普通安装仍用 PG 权威。032 canonical adapter、033 normalized facts、034 replay metadata索引及治理权威读取为独立开发切片；该早期开发切片当时整个 canonical activation guard 仍关闭（当前已true）。不要修改数据库 authority 字段或删除PG raw 来绕过保护。已选择canonical的隔离测试中，CH故障返回503 canonical_unavailable，不能回退空PG数据；这不改变可选副本模式允许显式PG fallback的既有契约。

034仅存 replay chunk 索引、事件/页面标识、hash和记录时间范围，不存 rrweb payload；canonical回放读取上限1000 chunks/128MiB，完整导出沿用每表100k。用量中的 canonical bytes:null 表示没有实际CH磁盘测量，logical_bytes仅是事件JSON大小。混合身份记录的不可变替换、旧body物理ACK、故障回滚/孤儿恢复及独立journal恢复已由C4真实PG/CH三项专项验证；尚未纳入新的不可变全量与原生rrweb canonical浏览器验收。30天物理回放保留已有下述工作树定向实现，仍待下一不可变完整验收，activation/replay guard保持关闭，索引隐藏不等于物理擦除。定向结果见[治理切片](ACCEPTANCE_CANONICAL_GOVERNANCE.md)，不是不可变main全量或部署验收。


新增035 durable AI reservation账本仅保存费用保留/结算状态，无模型正文或visitor FK；删除AI派生内容不能删除该账本而重置费用。站点facts导出排除该内部操作状态（ai_reservations，原因quota-ledger-operational-state），不改变已有ai_budget数字事实策略；PG整库backup自然包含账本。该新增切片的定向与下一完整阶段结果单列，不假定旧镜像已有035。

### 后续工作树：运行期回放保留与恢复证明

037授权账本保存单调cutoff、attempts和退避状态；调度在任何partition/site锁前独立提交，以GREATEST保留已经授权的范围，之后按partition→site→job锁序处理。同连接执行记录级物理清理，canonical混合chunk不可变替换并确认旧body物理删除；PG权威的可选历史归档也保留新记录和合法派生桶。截止时间取站点保留与30天中较短者，延长保留不会撤销已有cutoff；失败保留可靠指针和固定错误码。该时间策略不是个人删除请求，不伪称有个人fsync journal。

恢复证明为version2、scope=canonical-and-history-replay；v1直接拒绝。稳定v1实例key签名sourceScope、签发时间与完整cutoff集合，默认10分钟有效、最多5000站点。范围是active CH权威站点∪published历史raw站点∪既有037授权站点；后者保证当前raw清空也不丢旧备份所需的授权。备份index.retentionSites须一致。恢复先校验签名/来源/时效/完整性，再同连接GREATEST合并；在同一未提交事务中恢复并清除过期正文，之后才允许提交。源最新向量或journal变化阻止成功标记；不修改源CH。

canonical每站最多10k访客、每访客最多10k chunks，超预算明确失败而不先删索引。当前定向证据含真实PG/CH v2范围/源历史TTL/恢复与失败重试；native CLI已完成真实dump及独立PG/CH恢复、最新cutoff物理裁剪和源推进拒绝，最新native CLI也已覆盖非空standard036 carry（schema含041，原生fixture的041行为空）、latest journal删除A保留B；daily非空包定向通过，但完整daily activation/restore、严格PG metadata、整镜像和native canonical浏览器仍待对应验收，activation/replay guard保持关闭。见[治理验收](ACCEPTANCE_CANONICAL_GOVERNANCE.md)。

后续通知保护把报表及个人数据派生告警绑定aggregationEpoch；派送在同连接partition/site共享锁下复读running状态、attempts、有效lease和当前epoch，失效则撤销且正文最小化。共享锁跨15秒有界传输直到记录结果，因此删除ACK之后不再从旧claim派送；已发出或在途的外网消息无法召回。真实本地HTTP/PG删除竞态已验收，真实SMTP/企业账号外发未实测。上述后续切片尚未纳入fa3主版本，不能据此称旧镜像已具备新保护。

048 strict导出（不可变7fbb561已验）：完整站点facts的stats_hourly/stats_daily若为V2，data中的pv等数值来自当前已认证发布事实，不直接使用旧兼容缓存或控制字段默认值；uv与membership_counts为SQL去重计数，visitor_values_exported=false说明不返回个人成员值。export_manifest.source_vector分别给出published_fact_source、raw authority及canonical/deletion/aggregation epoch、generation/processed_generation/watermark。dirty状态拒绝，不把未重建旧导出当最新。真实缓存旧个人正文的物理ACK、strict源/独立目标恢复已有联合原生证据并纳不可变本地验收；单纯投影隐藏仍不能证明擦除。新镜像与规模验收另列。

048隐私失效后的导出预览：已知V2当前数值只依赖认证44/47事实，不要求已擦除的048兼容缓存再次存在。不可精确重建的legacy表从JSON中省略，并在export_manifest.unsupported_tables与table_read_metadata标coverage=0、reason及已知时间范围；表不存在不表示真实零。部分仍可认证的当前行可保留，manifest明确旧历史范围不可用。真实vitals样本可输出TDigest centroids及原加权sample_count。仅已知隐私基线失效允许此显式部分导出；正文缺失/损坏、HMAC错误或CH网络失败仍失败，不能伪装普通partial。桶UV不可跨日/小时直接相加。

raw-prune安全窄修：管理员canonical HTTP `{action:"prune"}`返回409 `canonical_backup_required`，不接受备份路径/JSON授权。CLI必须验证真实签名raw包、当前独立journal、来源/epoch/generation与正文hash；参数及现有备份目录见[迁移手册](migration.md)。该门槛已纳7fbb561不可变本地联合验收；3e052d8历史计数不修改。


报表筛选扩展（当前开发切片，真实PG/浏览器集成尚待）：DSL支持可选path/channel及五个UTM，全部已设条件同时匹配，手动运行和定时当前/前期比较使用相同筛选。旧报表不迁移，缺失或空字段表示不限；未知键、逆序日期、超长字段拒绝。path上限1024、channel100、各UTM500字符。定时报表按推送周期计算范围并保留筛选，不重用陈旧固定日期。明细留存、daily-salt跨日及精确coverage限制保持。

### 接入观察、过滤原因、只读诊断与人工备注（第二轮开发切片）

以下新接口已接线，当前仅类型、lint、单元验证；真实PG/浏览器联合验收待负责人执行，不追加到旧494计数。

- `GET /api/v1/sites/:siteId/intake-status`（read）：可传from/to ISO时间与报表七项筛选；默认最近7天。返回receiver接收时间、事件时间、接受批次generation、聚合水位与当前查询coverage。stage为not_observed/aggregation_pending/statistics_available/statistics_unavailable。统计读取失败回滚savepoint，不假完整。旧站缺050观察仅表示未记录接收观察；不证明script失效。既不爬站点，也不发送测试PV或验证snippet，过滤空结果不等于采集失败。
- `GET .../bot-observations?from=YYYY-MM-DD&to=YYYY-MM-DD`（read）：最多31个站点日历日、200组并返回truncated；reason仅ua/request_burst，附rule_id/rule_version。filtered_requests是被过滤请求数，declared_events是未逐条校验的批次声明事件数，二者不是PV。旧category计数差额为legacy_unknown，事件数null；不制造历史原因。无原IP/UA/访客/body。
- `GET .../self-host-diagnostics`及`/export`（admin）：只读白名单数据库/Redis配置状态、schema版本、聚合水位/失败布尔、队列、权威模式、保留信息。Redis configured_not_checked不是实际健康验证；物理容量not_measured。backup not_verified明确需要当前签名包和独立最新journal，不能解释为失败或恢复保证。不接受任意路径、不自修、不输出连接串/密钥/原错误/访客/正文；下载Cache-Control:no-store。
- `GET .../annotations?from&to`（read）：ISO日历日窗口≤366日、最多200条/truncated；每条携带保存时timezone，另返回currentTimezone。`POST .../annotations`、`PATCH .../annotations/:id`、`DELETE .../annotations/:id`（write，分析师以上）支持`{date,title,note?}`，title1–120字、note≤2000字；真实日期校验与审计同事务。编辑重新绑定编辑时站点时区。viewer不可改，其他站点不可读写，记录不存在404。这些是manual_note，measuredEvidence/causalEvidence:false，绝不作为AI事实或因果输入。

冻结补记：ac86cd3浏览器30检查（28真实Chromium+2日期）实际PASS/0skip，96.441秒、EXIT0；其191/404完整后端全轮未复验，不叠加旧19计数。当前4384后续预算切片尚未全量通过；B真实3项仅证明服务器行为，200 exception风险仍待C适配，不能称adapter已验。aea2ece日期标记4单元PASS、浏览器未跑。预算口径为SELECT次数/decoded bytes/deadline，不承诺scan或heap限制。原FAIL全部保留。

1c最终固定负载：1000 PASS、最终HTTP5120ms；5000总体FAIL：4900accepted、2unsent、39delayed、queryfail0，drainReached=false且120秒deadline，剩余积压1350/最大3250。最终查询25.389秒FAIL、assertionsExecuted=[]，不得声称六完整性断言已过。Node峰730509312字节不含数据库，source unchanged且4项cleanup全true；没有预算拒绝。已通过代码功能/浏览器/镜像不等于关闭此本地性能欠项，不据此称提速/SLO。归档证据为 docs/test-evidence/main-1c1cb65-independent-strict-5000.json 及配套record；原FAIL保留。
