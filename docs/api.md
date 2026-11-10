# 用户 API 手册 / User API manual

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

登录/初始化每内存IP摘要10次/分钟。密码12–1024字符（最多4096 UTF-8字节，与邀请注册一致），邮箱最长256。站点创建 `{name,domain,timezone?,privacy_mode?,retention_days?,tags?,config?}`；name≤128，retention_days 1–3650（默认365），tags≤20，每项≤64。privacy_mode为standard或daily_salt，默认standard。config支持allowed_hosts、consent_required、replay、heatmap、vitals、experiments、excluded_ips、session_timeout_minutes（1–1440）、seoAutoScan、channel_rules、ai_referrer_hosts。allowed_hosts为同可注册站点域的精确DNS主机，不是任意第三方域/通配符。channel_rules最多50条，按顺序匹配：`{name,channel,referrer_host?,include_subdomains?,utm_medium?,utm_source?}`；至少一个条件，组合条件同时成立。ai_referrer_hosts最多100个精确主机。不要把邮箱或用户标识放进规则名称或属性。

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

### 新流量报表：Node 标准版

以下三个接口要求对应站点的 `read` 权限，前缀仍为 `S=/api/v1/sites/:siteId`。Node 标准版的 `GET /api/capabilities` 返回 `capabilities.trafficReports=true`；Node Lite、独立 PHP 版不因共用界面而自动获得这些接口。客户端应先检查实际实例的能力声明。

| GET 路径 | 参数 | 返回摘要 |
| --- | --- | --- |
| `S/traffic-report` | `from?`、`to?`；`path`、`channel`、`utm_source`、`utm_medium`、`utm_campaign`、`utm_term`、`utm_content` 可选精确过滤 | `totals`、`groups`、`days`、`hours`、`dimensionTrend`、`visitors`、`engagement`，以及覆盖率与隐私状态 |
| `S/visits` | 同上；`page=1`、`pageSize=25`；另可按 `visitorType=new/returning/unknown`、`referrer`、`city`、`entry`、`visitorKey`、`ipPrefix`、`ipKey`、`ipLabel`、`isp`、`keyword`、`browser` 过滤 | 分页会话 `rows`、`total`、`page`、`pageSize`、独立实时窗口 `live`，以及明细覆盖率 |
| `S/overview-summary` | 同样的七项内容过滤；`extended=0/1` 可选，默认不读取扩展历史 | `asOf`、`timezone`、`today`、`yesterday`、`yesterdaySameTime`、`active15`、`live`、`forecast`；`extended=1` 时附加 `extended` |

**日期与分页。** `traffic-report`、`visits` 的时间均为 ISO 8601 UTC，区间为 **`[from,to)`，不包含结束时刻**。默认最近 7 天，最长 366 天；未来的 `to` 截至查询时刻，响应 `to` 是实际结束时刻，`requestedTo` 保留请求值。会话分页 `page` 为 1–100000，`pageSize` 为 1–100，过滤先于分页。`overview-summary` 固定使用站点日历周期，传入 `from/to` 不改变这些周期。

**流量报表。** `groups` 包含 `channel`、`page`、`entry`、`visitorType`、`country`、`city`、`referrer`、`searchEngine`、`external`、`keyword`、`directory`、`domain`、`isp`、`ip`、`ipPrefix`、`region`、`brand`、`colorDepth`、`campaign`、`utm_source`、`utm_medium`、`device`、`browser`、`os`、`screen`、`language`、`week`、`month`。每行提供 `label`、`pv`、`uv`、`ips`、`sessions`、`bounceRate`、`averageDuration`、`newVisitors`、`returningVisitors`、`unknownVisitors`；比率为 0–1，时长单位为秒。入口页的 PV 是从该页进入的会话在窗口内产生的浏览量。

`days` 使用站点时区的 `day=YYYY-MM-DD`。`hours` 仅在所选范围属于单个站点日且明细完整时提供，`time` 是站点当地整点对应的 ISO 时间戳，补齐 `[from,min(to,now))` 中没有事件的小时；夏令时切换日按实际时间递增，可有 23 或 25 个小时。多日或覆盖缺失时返回 `hours=[]`，不能据此补成全天零流量。`dimensionTrend.channel/page` 提供当前范围 Top 5 的逐日数据；`dimensionTrend.visitorType` 按每一天的新访客、回访访客和未知访客分别计算。

新老分类依据真实的 `visitor_first_seen.first_date`。整周期维度按对应范围或周/月桶分类；每日、每小时与访问明细按各自站点日期分类。同一位访客可以在首次访问当天计为新访客、第二天计为回访访客。缺少首次记录时保留 `unknown`，不假定为新访客。UV 按集合去重，不能相加每日、小时或维度 UV 得到周期 UV。

**访问明细。** 每个 `rows` 项为一次会话，字段包括 `id`、`time`、`visitorKey`、`visitorType`、`city`、`ipPrefix`、`browser`、`referrer`、`entry`、`keyword`、`pageviews`、`duration`、`paths:[{time,path}]`。会话须在所选范围内开始，活动只计算到实际 `to`；这不是会话未来的完整时长。会话前置上下文不足时返回 `sessionStatus=partial_session_context`，不会把中途访问当作新的完整会话。明细不完整时 `rows=[]`、`total=null`。

**概况与实时。** 三个概况周期分别为站点今日零点至 `asOf`、昨日零点至今日零点、昨日零点至昨日相同当地时刻；不是简单减去固定 24 小时。每个周期都有独立的 `totals`、`coverage`、`rangeStatus` 和 `visitors` 状态。昨日明细过期或截断，不会使今日已完整读取的访客分类失效。

`live` 固定读取查询时刻前 30 分钟，不随历史筛选日期移动：`active` 提供最近 5/15/30 分钟页面访问或心跳的去重访客，`pageviews` 是由旧到新的 30 个逐分钟 PV 桶，`pages` 是该实时窗口内的页面 PV。`active15` 单独提供最近 15 分钟的访客与 PV。实时窗口有自己的 `from/to/coverage/status`。`forecast` 提供预计全天 `pv/uv/ips/sessions`，`details` 包括每项的 `method/reason/sampleDays/sampleDates/interval`。方法是 `historical_remaining_v1`，优先使用最近 14 个完整自然日的同期和剩余流量；历史缺失时可降级到昨日或今日运行速度，样本不足保持 `null`。预计 UV、IP、会话数及各自区间不超过 PV 的对应值，区间不低于已观察计数；触发校正时，详情返回 `constraint=at_most_pageviews` 和 `unconstrainedValue`。区间是启发式参考范围；聚合变化时 `status=aggregation_pending` 并清空预测。

**历史展开。** `extended=1` 才读取 `extended.thisMonth`、`extended.total`、`extended.peaks` 和 `extended.history`。本月、总流量分别返回 `from/to/totals/coverage/status`；峰值按指标返回 `{value,date}`，日期为站点时区的 `YYYY-MM-DD`，并列时取最近日期。历史来源为已发布事实与可用旧汇总，`history.scope=available_published_history`，起点不等于原始明细保留期。总 UV 使用跨历史集合去重；总跳出率和平均时长使用总跳出次数、总时长除以总会话量。

历史旧小时汇总与当前事实同小时重叠、缺少档案、旧汇总无法精确过滤或日期边界不可拆分时，不把两份数值相加。`overlapping_legacy_history` 会使受影响的总值和峰值为 `null`，`history.overlap` 给出边界；本月覆盖同一重叠时也标不可用。分别检查 `thisMonth`、`total`、`peaks` 的覆盖率，不能把折叠行能显示当作完整历史已还原。

**独立 IP 与不可用值。** 新采集的标准模式事件保存由规范化完整 IPv4/IPv6 地址生成的站点隔离 HMAC，原地址不落库。内部标识不经统计 API、导出或共享返回；`ipKey` 是二次散列的筛选标识，`ipLabel` 是脱敏网段与展示编号。周期 IP 直接去重，不累加每日数值。旧事件缺少标识时 `ips=null`，同时返回 `knownIps/ipCoverage/ipStatus`；不能用网段或 UV 补算。安装离线库后，运营商由服务器实时 IP 查询产生，`providerCoverage` 区分未知和已知记录。`daily_salt` 模式不保存稳定 IP，也不返回网段、新老访客或跨日 UV；同日 UV 可用。

`traffic-report` 可选 `trendDimension`（合法 `groups` 维度）及 `trendLabel`，请求指定维度的逐日 Top 5 或单项历史趋势；IP 单项传 `ipKey`。明细会话包含 `ipKey/ipLabel/isp`，路径项包含当次页面的 IP 展示信息，IP 筛选匹配会话内任一页面。

**事件定义。** `GET S/event-definitions` 要求 read，返回 `{definitions,limit:100}`。`POST` 要求 admin，接收 `{name,displayName,description?}`；`PATCH S/event-definitions/:name` 修改显示名和说明，`DELETE` 删除定义但保留历史事件。`name` 是 SDK 采集标识，不随显示名改变。

**蜘蛛访问。** `GET S/bot-visits` 要求 read，按站点时区的日期 `from/to` 查询，最多 31 天；`page/limit/engine/source` 可选。返回引擎汇总、脱敏 IP/URL 日志及来源说明。`POST S/bot-visits/ingest` 使用服务端 write-key 和 HMAC 签名，不接受浏览器 Origin/Cookie。完整协议、保留期和地域库安装见[流量数据配置](TRAFFIC_DATA_SETUP.md)。

单次明细读取上限为 100000 条事件，JSON 响应上限为 8 MiB。请同时检查 `coverage`、`status`、`sessionStatus`、`uvStatus`、`visitors.status`、`aggregationPending` 和实时窗口状态。`detail_limit_exceeded`、`raw_detail_retired`、`outside_raw_retention`、`detail_unavailable` 表示无法给出完整明细，空数组或 `null` 不等于零访问。聚合指标和原始明细的覆盖范围可以不同。

数据口径见本文“流量报表的数据边界”。

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
| /shares | GET/POST admin；DELETE /:id admin | `{password?:8–1024字符/4096 UTF-8字节,expires_at?,frame_origins?:精确HTTP来源[]}`；创建一次token/url；删除撤销 |

Traffic告警比较完整上一小时与28天同小时可覆盖样本，至少7样本、连续两小时异常；保存observed_hour/baseline_samples/generation/coverage，未处理旧事件时等待而非编零。goal/funnel/storage/SERP的config具体由UI填写，当前为record而非稳定强类型配置；避免假定未文档化字段。SERP通知使用真实保存的排名变化。通知失败最多3次，持久退避；SMTP/HTTP集成测试不等于真实邮件/企业账号交付。

站点full导出包含有界业务事实和脱敏配置，不包含账号密码、盐、连接器密钥、Token哈希等秘密；**每表最多100k行**，超过任务failed/export_limit_exceeded，不提供无限导出，不是整实例灾备。full CSV格式是table,record，普通CSV是event列，防公式注入。下载返回X-Baize-Event-Source/X-Baize-Read-Coverage。删除撤销旧导出，物理文件与临时文件由可靠cleanup重试；没有complete状态时下载404。

公开POST `/api/v1/shares/:token` body `{password:"..."}` 返回最近30天站点日历聚合/coverage，无管理权限。GET `/embed/chart?token=...&type=top-pages&lang=zh-CN|en` 返回静态安全HTML，CSP frame-ancestors仅配置允许源。密码embed需X-Share-Password header，普通iframe无法自动传该header；不要把密码放URL。公开只读分享仍是访问凭证，应按最小期限分发并可撤销。

Public share URLs are bearer capabilities, not login credentials. They only expose a fixed read-only aggregate view. Password-protected embeds require a header-aware client; a plain iframe cannot supply that password header.

## 外部服务 / External connectors

全部下列E路径均站点隔离；GET read，设置/导入/扫描/排名/复检一般admin，AI问数/query/usage read，ai/test admin；evidence/suggestions创建与状态变更write；SEO建议复检另需admin。不得在客户端或仓库保存提供方secret。OAuth发起及callback绑定当前用户/Cookie/session、一次state/PKCE。外部服务需要部署者配置自己的账号，并验证连接与权限。

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
| /serp/check；/serp | POST `{keyword,provider:serpapi|dataforseo}`；GET历史 | SerpAPI/DataForSEO BYOK、排名变化；需配置供应商账号与权限 |
| /ai/query | POST read `{metric,dimension?,start,end,limit?,filters?}` | 确定性只读类型聚合，不调用模型，max31日/limit100，无SQL/其他site |
| /ai/usage；/ai/test | GET read；POST admin | 预算/任务计量；test会真实调用已配置提供方，不是无费用dry-run |
| /evidence | POST `{start,end}` | 确定性本地证据、不调用AI，适合先预览 |
| /suggestions | POST / GET | POST write `{evidenceId,title,confidence?:low|medium|high,category?:analysis|seo|performance|content}`，只能同站点完成证据；不可将模型文本当事实 |
| /suggestions/:id | PATCH状态 | `{status,implementedAt?}`；pending-recheck须implementedAt，verified须已有recheck；new→accepted→in-progress→pending-recheck→verified；false-positive可重开为new |
| /suggestions/:id/recheck | POST | write `{start,end,confounders:1–20项}`；SEO另需admin，新SEO扫描/新周期复检，旧证据不变；区分改善、干扰与因果 |

Google配置settings `{clientId,redirectUri,property?,gaProperty?,dailyGsc?,dailyGa4?}`，secret为JSON字符串 `{clientSecret,refreshToken?}`。redirectUri须等于实例 `/api/google/callback`。GA4报告分别为sourceDays、days、weeks、period、sources，rows含dimensions/pv/totalUsers/sessions，保留metadata/rowCount/property_timezone/property_id/requestedCoverage。每报告10万行上限、每HTTP响应5MB上限；超限失败，不悄悄保存不完整报告。日/ISO周/整段/来源totalUsers必须采用提供方对应报告的独立去重，不能相加日UV代替整段UV，不能与本地UV合并。阈值/采样质量limited、未知property时区须保留说明。

AI配置settings `{endpoint,model,enabled,monthlyTokenBudget,maxTokens?,localOrigin?,dailyReport?,automaticAnomaly?}`；默认不启用。仅明确登记localOrigin的实例管理员允许本地Ollama窄例外，不是全局关闭SSRF。发送用户问题/请求文本及获授权聚合数据，不发送原始事件行、原IP或身份。问题文本本身可能包含用户输入的敏感信息，提交前应自行避免；不能承诺“只传聚合从不传问题”。保留外部提供方成本风险，应用无额外收费。聚合变化和模型建议是观察性证据，不证明因果或收益。

### AI 问数与图表 / Typed question charts

POST E/ai `{purpose:"question",question:≤2000字符,start,end}`（最多31个包含端点日历日）返回id/answer/tokens/evidence与questionEvidence。GET E/ai/questions/:callId返回id/status/answer/questionEvidence/tokens/createdAt/evidenceStatus（verified-tool-trace、legacy-unverified、not-completed）；失败/预留任务没有可验证answer/evidence。

questionEvidence保存已授权query_analytics工具trace与确定性charts；query包含metric(pv/uv/sessions/conversions/conversion_rate)、dimension(day/page/source/device)、start/end、limit1–100、strict filters(source/device/os/page)，不接受SQL/其他site。charts含unit(count/ratio)、points(label,value可null，比例可有numerator/denominator)、truncated/totalGroups/timezone/precision。trace记录真实所选已发布事实来源postgres、clickhouse或hybrid（由实际owner/完成receipt决定，不能从配置推断），以及generation/epoch/watermark/coverage与权限检查时间。没有成功授权工具调用502 external_response_invalid；预算429、未optin409、dirty/stale409 aggregation_pending、权限403。最终版本guard和预算/证据同client原子提交，不能把模型自称“已查数据”当真实查询。

## Storage、历史、实例设置 / Storage, history, instance administration

GET S/storage(admin)显示配置/mode/replica_format/水位/错误；PUT admin `{mode:postgres|mirror|prefer_clickhouse,replicaFormat?:snapshot_v1|incremental_v1}`；POST /storage/replay admin重试。未配置CH切换409。snapshot/incremental均PG权威，CH是可选可核验副本，读取说明source/mode/fallbackReason；差异/落后回退PG，不静默返回空。

S/storage/history（GET admin，最新100manifests）；POST /capture；POST /:id/backup；POST /:id/restore `{namespace:UUID}`。未配置409，找不到published manifest404。history备份由服务端dataDir保存签名文件，响应id/bytes/integrity；restore仅恢复隔离CH namespace，不激活为canonical查询源、不替换PG。删除和保留会使旧历史失效，不能用副本恢复被删个人数据。实际CLI/恢复流程见 [迁移手册](migration.md)。

POST /api/admin/keys/rotate、GET/PUT /api/admin/geoip、POST /api/admin/geoip/refresh以及GET/PUT /api/admin/sso/wecom为实例设置；密钥轮换保留版本旧key，GeoIP只允许官方认证校验下载，SSO明确映射已有账号，不自动开放注册。GET /api/sso返回启用状态；start/callback需要安全会话/state。外部服务需配置有效账号与权限后使用。

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

## 安全与请求预算 / Security and rate limits

实例 `/api/admin/*` 仅接受真实管理员 Cookie 会话；站点 API Token（包括管理员签发或 admin scope）以及 Cookie + Authorization 混用均拒绝。站点创建、配置和写入密钥轮换与审计同事务提交，审计失败回滚业务变更，不使旧密钥失效。

Instance administration requires an administrator browser Cookie session. Site API tokens and mixed Cookie/Authorization credentials are rejected. Site creation, configuration and write-key rotation commit their audit in the same transaction; an audit failure rolls back the mutation.

账户密码统一12–1024字符、最多4096 UTF-8字节，兼容旧邀请创建的长密码账户。分享密码创建仍至少8字符，上限1024字符/4096字节；异步scrypt保留旧32字节哈希，旧格式密码验证允许至1MiB UTF-8字节，仍受原HTTP整份正文1MiB上限；不截断、不扩大请求上限。全进程最多4个分享密码派生任务，无等待队列，满额503/share_password_busy并Retry-After:1。

认证统计、站点管理和实例管理共享每用户每 60 秒 600 次预算，跨站点及 Cookie/API Token 共用。公开分享和 embed 图表按服务端识别的来源地址共享每 60 秒 120 次预算。超限返回 429 request_rate_limit_exceeded；已配置 Redis 但故障或超时返回 503 request_rate_limit_unavailable，均附 Retry-After，不重置为本地额度。未配置 Redis 时使用最多 10000 个主体的有界进程内计数，不保证多实例共享；计数保存域隔离 HMAC，不存原 IP、URL 或 Token。采集、登录及签名蜘蛛日志上报使用各自限流。固定窗口边界可能允许突发，不是平滑速率保证。

## 数据删除、回放与导出

访客删除及独立删除日志重放会清除相关 AI 答案、工具证据和建议，并撤销旧导出。费用预留与结算账本保留，删除数据不会重置 AI 预算。通知发送前重新检查站点 epoch、任务状态和租约；已经发出或在途的外部消息无法召回。

回放按记录时间执行站点保留期与 30 天中的较短期限。授权截止时间单调前进，延长保留不会恢复已过期内容。混合时间块保留未过期记录，确认旧正文物理删除后再更新状态；索引隐藏不等于物理删除。恢复使用签名的最新回放保留证明和独立删除日志，具体见[迁移与恢复](migration.md)。

严格存储下，站点导出读取经过认证的已发布事实。UV 与成员数量按集合去重，不返回个人成员值。导出清单记录事实来源、原始数据权威源、epoch、generation、水位和覆盖情况。尚未重建的脏状态拒绝导出。历史表无法精确重建时，通过 unsupported_tables、coverage 和 reason 说明缺失；缺失不表示真实零。正文损坏、签名失败或存储连接故障不能伪装成普通的部分结果。

## 接入状态、诊断与备注

- GET /api/v1/sites/:siteId/intake-status：需要 read 权限，接受 from/to 与报表筛选，默认最近 7 天。返回接收时间、事件时间、generation、聚合水位与 coverage；stage 为 not_observed、aggregation_pending、statistics_available 或 statistics_unavailable。没有观察记录不等于脚本失效。
- GET /api/v1/sites/:siteId/bot-observations：需要 read 权限，from/to 为站点日历日期，最多 31 天、200 组并返回 truncated。filtered_requests 是请求数，declared_events 是批次声明事件数，均不能替代 PV；不返回原 IP、UA 或访客正文。
- GET /api/v1/sites/:siteId/self-host-diagnostics 及 /export：需要管理员权限，只读返回数据库与 Redis 配置状态、schema、聚合水位、队列和存储模式。configured_not_checked、not_measured、not_verified 分别表示未检查、未测量、未验证，不能当成健康或备份成功。不输出连接串、密钥或原错误。
- GET /api/v1/sites/:siteId/annotations：需要 read 权限，ISO 日期范围最多 366 天、200 条并返回 truncated。POST、PATCH /:id、DELETE /:id 需要 write 权限。写入接受 date、title（1–120 字）和 note（最多 2000 字），保存时区并写审计。人工备注不是测量证据或因果证据。

## MCP 与存储模式

标准 MCP 入口为 POST /api/sites/:siteId/mcp，使用站点只读 Token、JSON-RPC 2 与 Streamable HTTP。工具仅查询已授权站点的聚合数据，不执行 SQL，不读取任意站点或原始个人明细。连接方法与协议错误见[MCP 指南](mcp.md)。

默认 PostgreSQL 为权威源。mirror、prefer_clickhouse 是可验证副本模式；受控迁移后的 ClickHouse 权威模式具有独立备份、删除与恢复要求。权威正文不可用时返回错误，不能回退到空 PostgreSQL 数据。不要直接修改 authority 字段或手动删除原始表；操作见[迁移手册](migration.md)。

百度搜索数据使用[手动导入模板](MANUAL_SEARCH_IMPORT.md)。URL 提交、百度统计搜索词与自然搜索展现/排名属于不同来源，不能混合为相同指标；自定义映射不表示兼容未验证的原生 CSV。

## 流量报表的数据边界

所有站点报表沿用白泽的站点权限、删除记录与存储快照。明细接口通过现有事件存储读取，概况和历史统计复用已发布事实及经过校验的汇总来源。

- 时间区间为 `[from,to)`；站点日历按其 IANA 时区计算。完整单日的小时轴补真实零值桶，缺失覆盖不补零。
- UV 按访客集合去重。总跳出率和平均时长按总会话量计算，不取每日比率的简单平均。
- IP 按服务器解析的连接地址计算，只有明确配置的受信代理可以提供客户端地址。原地址只在内存中查询地域并生成站点隔离 HMAC；报表、导出和共享不返回该内部 HMAC。旧事件只有网段的，不能恢复完整 IP，返回 `ipCoverage` 和未知值。
- 预测采用白泽独立实现的 `historical_remaining_v1`，参考最近 14 个完整自然日。缺少历史时可按今日运行速度作低样本估计；凌晨或样本不足时留空。区间是历史波动的参考范围，不是经过校准的统计置信区间。
- 蜘蛛名称来自 User-Agent 声明，不等同于已验证搜索引擎身份。网页埋点无法看到不执行 JavaScript 的爬虫，需通过服务端日志上报补齐。日志保留不超过站点期限及 90 天，不保存原始 IP、UA、查询参数或请求正文。
- 原始事件过期、明细超限或会话上下文不足时，保留不可用状态。汇总尚存不能恢复已经缺失的逐次访问路径。
- 历史旧小时汇总与事实重叠时，不能证明完整、不重复的数据返回 `overlapping_legacy_history` 和 `null`。历史总量的起点为仍可读取的已发布历史，不声称覆盖没有保存过的数据。
- `daily_salt` 不支持跨日身份统计、新老访客或 IP 网段。未知值与不可用值不替换成零或演示数据。
