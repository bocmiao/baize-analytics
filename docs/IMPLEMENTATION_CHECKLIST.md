# 逐项实现与验收清单

此清单逐项保留规格要求与真实验收证据，不把未完成要求改写为更低目标。状态分为：已实现且本地验收 / 在制或部分实现（具体欠项仍须完成） / 未实现 / 连接器本地验收但真实外部未测。

已提交精确快照为 main `b56b7e9`：36文件148应用测试通过（59单元、89集成），13项Playwright通过（11浏览器流程、2日期检查）；见 `docs/test-evidence/second-main-tests.json` 和 `second-main-e2e.txt`。当前工作区新增ClickHouse及多语言改动单独记在制，不能由这个快照证明通过。旧Docker镜像6c66的矩阵已PASS，但不含024及后续改动；新镜像最终矩阵待ops执行。WordPress本地实际运行另有独立真实报告。

## F-01 页面浏览（PV）追踪【P0】

- 状态：已实现已测（本地）
- 实现文件：packages/tracker/src/index.ts；src/server/collect.ts
- 验收测试：tests/integration/tracker-collector.test.ts；core-api.test.ts；tracker-browser.test.ts
- 边界/未实测：真实浏览器→持久采集→worker→看板、SPA/预渲染已测；100k真实HTTP/Redis/PG/outbox/worker/查询对账通过。1M真实完整管线已通过（40站点，PV1M/UV2万/会话2万，outbox全done，dirty/uncovered/attempts均0），见full-pipeline-1000000.json；PG-only、启动cb72a7e+当时在制修改，非精确最新SHA，不证明持续混合写删、大单站分布或1C2G/5分钟延迟保证。

- 做什么：记录每一次页面访问，是全部统计的地基。
- 采集端：脚本加载后立即发一次 pageview；SPA 监听 history.pushState/replaceState + popstate + hashchange，路由变化去抖 100ms 后再发（防重复）。
- 服务端：POST /api/collect 收批量 payload `[{type:'pageview',...}]`；校验 website_id；按站点 Redis 滑动窗口限流（如每站点每分钟 10 万次）。
- 存储：events 明细表（type='pageview'）。
- 注意：prerender 预渲染不上报；iframe 嵌套默认不上报（data-allow-iframe 开启才报）。

## F-02 访客标识【P0】

- 状态：已实现已测（本地）
- 实现文件：packages/tracker/src/index.ts；src/server/security.ts；collect.ts
- 验收测试：governance-privacy.test.ts；tracker-browser.test.ts；analytics.test.ts
- 边界/未实测：标准模式Cookie与每日盐口径分开；每日盐identify禁用、跨日UV/留存不支持，真实PG/全站导出隐私回归通过；任意伪装业务字段不能由字段名过滤证明匿名。

- 做什么：跨访问识别同一访客，算 UV 的基础。
- 采集端：tracker.js 运行在被统计网站的第一方上下文中，由 JS 自己通过 `document.cookie` 读写第一方 Cookie `_baize_uid`（2 年，SameSite=Lax）。**注意**：采集接口在跨域时通过响应 `Set-Cookie` 无法为被统计网站设置第一方 Cookie（只会成为第三方 Cookie，默认被浏览器拦截），因此 uid 必须由采集端 JS 生成与维护，服务端只做校验与兜底。
- 服务端：收到无 uid 的事件时生成 UUIDv7 并在**同域**场景下可 Set-Cookie；隐私模式（站点级开关）：服务端算 HMAC_SHA256(IP + UA + 当日 salt)，salt 每日轮换、旧 salt 保留 1 天，原始 IP 不入库。
- 注意：用户主动删除 Cookie 后，**不得**从 localStorage 自动恢复旧标识（evercookie 式行为属暗模式）。
- **两种标识模式，口径严格对应**（本站点级二选一，不可混用）：
  - **标准模式**：稳定的 `_baize_uid`（2 年 Cookie）→ 支持跨日 UV 去重（HLL）、留存/同期群（F-30）、回访识别。
  - **隐私模式**（每日轮换 salt 的 HMAC）：访客标识每天更换，昨天和今天的两个哈希**无法确认为同一人** → 仅提供"每日去重访客"口径；**跨日 UV 去重、留存/同期群、回访分析在此模式下不支持**，看板对应模块明确标注"该模式不支持"，不强行估算。文档诚实说明（抄 Mallard PRIVACY.md 写法）。

## F-03 会话划分【P0】

- 状态：已实现已测（事件时间核心）
- 实现文件：src/server/analytics.ts；src/server/worker.ts；src/server/sites.ts
- 验收测试：tests/unit/analytics.test.ts；tests/integration/analytics.test.ts
- 边界/未实测：30分钟默认与session_timeout_minutes配置/API/UI已补；迟到乱序、多标签/跨日、可重算心跳、并发lease/fencing测试通过。精确边界/细分可重建保留期明细，保留期外不虚构完整结果。

- 做什么：把 pageview 串成会话，算会话数/跳出率/平均停留。
- 实现：Worker 消费队列时按 (site_id, visitor_id) 在 Redis 维护"最后活动时间"；距上次事件 > 30 分钟（可配置）则开新 session（UUIDv7）；sessions 表存 entry_page/exit_page/page_count/duration/bounced（单页且 <10s 记跳出）。
- 查询：会话指标全部走预聚合表，不扫明细。

## F-04 停留时长【P0】

- 状态：已实现已测（本地）
- 实现文件：packages/tracker/src/index.ts；src/server/analytics.ts
- 验收测试：tests/unit/analytics.test.ts；core-api.test.ts
- 边界/未实测：按页面实例保留visible_ms/interval并去重重算；丢失心跳不外推，不声称真实阅读时长。

- 做什么：页面前台可见时长累计（秒）。不称为"真实阅读时长"——我们只能证明页面可见，不能证明人在阅读。
- 采集端：每 15s 发心跳，**每个心跳只覆盖其前 15s 内页面可见的子区间**（用 visibilitychange 时间戳切片）；页面卸载用 sendBeacon 补发最后一段。
- 服务端：heartbeat 只更新会话 last_active；页面停留 = 各可见子区间求和，写入 page_stats。首段（首个心跳前）按"页面可见且不足 15s"计入，不做外推。
- 注意：切后台/最小化/锁屏的时间不计入；心跳丢失的区间不估算、记为未知。

## F-05 滚动深度【P0】

- 状态：已实现已测（真实浏览器/PG）
- 实现文件：packages/tracker/src/index.ts；src/server/analytics.ts
- 验收测试：tests/integration/tracker-hooks.test.ts；analytics.test.ts
- 边界/未实测：25/50/75/100四档真实正常UA浏览器→采集→PG通过；初始文档高度与页面实例完成率，横幅移除时序对100%判定回归已修。

- 做什么：25%/50%/75%/100% 四档，衡量内容消费。
- 采集端：scroll 监听（节流 200ms），计算 (scrollY+innerHeight)/docHeight，首次达到各档位发一次（props.depth=50）。
- 服务端：存为事件；聚合"读完率" = 100% 档 PV / 总 PV。
- 注意：无限滚动页以初始视口为准，文档注明口径。

## F-06 出站链接点击【P0】

- 状态：部分实现（采集已实现）
- 实现文件：packages/tracker/src/index.ts
- 验收测试：tracker-collector.test.ts；packages/tracker/README.md
- 边界/未实测：自动外链与data-baize-ignore；只保留origin/path，保守不采集链接文字；真实popup外链跳转不阻塞与PG采集专项tracker-hooks.test.ts通过。

- 做什么：自动记录跳往外部域名的点击。
- 采集端：click 捕获阶段找最近 <a>；hostname 不同则 sendBeacon 发 click 事件（props 含 url、链接文字前 50 字）；不阻止跳转、不延迟。
- 注意：data-baize-ignore 可排除特定链接。

## F-07 文件下载【P0】

- 状态：已实现已测（真实浏览器/接口/采集）
- 实现文件：packages/tracker/src/index.ts；src/server/content-analytics.ts；src/web/ExtendedAnalysis.tsx
- 验收测试：tests/integration/tracker-hooks.test.ts；content-analytics.test.ts；docs/ACCEPTANCE_CONTENT.md
- 边界/未实测：真实PDF下载不阻塞及PG采集；下载URL/type/path次数与精确UV Top接口/看板已实现。细分限定90天且完整明细保留内，过期coverage0；每日盐跨日UV=null。

- 做什么：pdf/zip/doc/xlsx/mp4 等后缀点击自动记为下载。
- 采集端：同 F-06 逻辑，正则匹配后缀（data-download-exts 可自定义）；事件名 'download'。
- 看板："内容分析"单列下载 Top。

## F-08 404 追踪【P0】

- 状态：已实现已测（真实浏览器/接口/采集）
- 实现文件：packages/tracker/src/index.ts；src/server/content-analytics.ts；src/web/ExtendedAnalysis.tsx
- 验收测试：tracker-hooks.test.ts；content-analytics.test.ts；docs/ACCEPTANCE_CONTENT.md
- 边界/未实测：真实标题404采集、URL×脱敏来源路径×渠道×次数、修链CSV防公式注入与审计已测。超明细保留期不可用、导出409；最新13项E2E含真实下载/404CSV/事件趋势已通过。

- 做什么：发现死链与错误引流。
- 采集端：document.title 匹配 /404|not found|页面不存在/i，或 <body data-baize-404> 标记，pageview 带 props.status=404。
- 看板：单独"404 页面"报表（URL × 来源 × 次数），可导出修链清单。

## F-09 UTM/Referrer/渠道【P0】

- 状态：已实现已测（基础/配置/完整UTM接口）
- 实现文件：packages/contracts/index.ts；src/server/dimensions.ts；sites.ts；analytics.ts；src/web/DashboardFilters.tsx；SourceSettings.tsx
- 验收测试：dimensions.test.ts；core-api.test.ts；content-analytics.test.ts
- 边界/未实测：UTM五字段、广告点击标记、可编辑安全渠道规则及AI域名、渠道×入口页；筛选真实应用完整stats/analysis/同口径compare/cache，而非仅前端表格。历史未持久化的term/content不追补猜测。

- 采集端：上报 document.referrer + location.search 的 utm_*（campaign/source/medium/term/content）+ gclid/fbclid（标记广告点击）。
- 服务端：渠道分组规则（可配置，默认）：搜索引擎（google/bing/baidu/so/360/sm 等域名匹配）、社交（微信/微博/知乎/抖音/小红书/twitter/facebook…）、直接（空 referrer）、外链、邮件（utm_medium=email）。
- 存储：events 表 utm_* 列 + channel 列（建索引）。

## F-10 终端信息采集【P0】

- 状态：已实现已测（解析/维度）
- 实现文件：src/server/dimensions.ts；packages/tracker/src/index.ts
- 验收测试：tests/unit/dimensions.test.ts；core-api.test.ts
- 边界/未实测：ua-parser-js标准解析、CSS屏幕宽高与DPR真实维度、UA+屏幕综合mobile/tablet/desktop、unknown降级已补测试。完整真实设备型号矩阵未实测。

- 采集端：navigator.userAgent 发给服务端；另采 screen 宽高、devicePixelRatio、navigator.language。
- 服务端：ua-parser 解析 browser/os/device；device_type 按 UA+屏幕宽度综合判 mobile/tablet/desktop；解析失败记 unknown 不丢事件。

## F-11 地理位置【P0】

- 状态：连接器已实现；外部数据未实测
- 实现文件：src/server/geoip.ts；collect.ts
- 验收测试：core-api.test.ts；docs/deployment.md
- 边界/未实测：内存mmdb查询后脱敏持久化，未配置库明确unknown；真实MaxMind授权库/地域准确率未实测。

- 实现：服务端收到事件后，**仅在内存中用原始 IP 查离线 mmdb**（MaxMind GeoLite2-City）得国家/城市，随后按策略丢弃或截断 IP 入库；**原始 IP 不进日志、不进错误追踪**。注意：截断后的 IP 不再用于二次定位（截断可能改变定位结果）；查不到记 unknown。
- 部署：需 MAXMIND_LICENSE_KEY（免费注册），启动时下载 + sha256 校验；无 key 降级 unknown，看板横幅提示配置方法。

## F-12 Web Vitals【P1】

- 状态：已实现已测（算法/官方模块）
- 实现文件：packages/tracker/src/vitals.ts；src/server/analytics.ts；src/web/AnalysisDetails.tsx
- 验收测试：tracker-collector.test.ts；tests/unit/analytics.test.ts；tests/integration/analytics.test.ts
- 边界/未实测：官方web-vitals按需独立模块、data-sample-rate采样默认1、真实PG t-digest不等样本合并/p75/p90/三色UI已实现已测；低采样率及全部真实浏览器性能环境矩阵未专项实测。

- 采集端：**优先采用 Google 官方 `web-vitals` 库**（attribution 构建），指标就绪或页面卸载时上报 vitals 事件；不要为凑 tracker 体积手写简化算法。Web Vitals 采集做成**按需加载的独立模块**，默认脚本不包含（保 F-19 体积目标）。
- 服务端：page_vitals 表按（站点、页面、日）存 **t-digest 分位摘要**（不是只存一个 p75 数字）；看板 p75/p90 从摘要实时计算，按 Google 阈值三色展示（好/需改进/差）。
- 注意：采样率可配（默认 100%，大流量站可降到 10%）；跨周期分位数**不能按日 p75 直接平均**——月 p75 通过**合并多日的 t-digest 摘要**重算。只存每日 p75 数字的方案无法恢复月分布，已废弃。

## F-13 自定义事件【P0】

- 状态：已实现已测（本地）
- 实现文件：packages/tracker/src/index.ts；packages/contracts/index.ts；src/server/collect.ts；analytics.ts
- 验收测试：core-api.test.ts；analytics.test.ts；tracker-collector.test.ts
- 边界/未实测：手动/声明式事件、最多20属性、string/number/boolean EAV、事件属性查询90天上限；时间类型并非当前协议支持的属性类型。

- API：`baize.track('signup', { plan:'pro'})`；支持 `data-baize-event="signup"` 声明式点击自动发。
- 存储：抄 Umami EAV：event_data 表（event_id, data_key, string_value/number_value/date_value, data_type），单事件属性 ≤20 个防爆。
- 查询：事件列表 + 按属性分组 Top；时间范围限 ≤90 天。

## F-14 收入事件【P0】

- 状态：部分实现（归因核心已测）
- 实现文件：packages/tracker/src/index.ts；src/server/analytics.ts；src/web/main.tsx
- 验收测试：analytics.test.ts（币种隔离/订单去重/多标签末次点击）
- 边界/未实测：按币种独立金额、订单幂等、末次非direct渠道/实际页面实例归因已测；完整收入趋势/归因图展示仍须最终UI验收；金额仅业务自述。

- `baize.trackRevenue(99.0, { currency:'CNY', order_id})`；服务端汇总 revenue。
- 看板：收入趋势、按渠道/页面的末次点击收入归因。
- 注意：前端上报的金额是**业务方自述数据**，不能直接当作已支付事实；对账口径以业务系统为准，文档明确。

## F-15 用户标识 identify【P0】

- 状态：部分实现（身份映射/删除已测）
- 实现文件：packages/tracker/src/index.ts；src/server/identity.ts；collect.ts；deletion.ts；analytics.ts
- 验收测试：core-api.test.ts；analytics.test.ts；governance-privacy.test.ts
- 边界/未实测：标准模式identify、HMAC身份映射、授权路径查询及user删除展开已有；身份前后事件时间后的身份A→B关联/删除/日志恢复实际PG已测；历史匿名会话不自动缝合（隐私选择）；完整注册→付费专属视图仍需核对；每日盐明确禁止。

- `baize.identify('user_123')`（登录后调用）；服务端 identity_map（visitor_id↔user_id），历史会话缝合到 user_id（抄 Umami session_link）。
- 看板：登录用户行为路径、注册→付费转化。

## F-16 表单提交【P0】

- 状态：已实现已测（真实浏览器/PG）
- 实现文件：packages/tracker/src/index.ts
- 验收测试：tests/integration/tracker-hooks.test.ts
- 边界/未实测：双重optin原生GET submit不阻塞；仅form id/action无输入字段值。跨源卸载改text/plain JSON防预检丢POST，复用协议验证。

- 采集端：form submit 监听（data-baize-form 开启才生效）；只记 form id/action，不记字段值。默认关闭，文档强调隐私。

## F-17 机器人过滤【P0】

- 状态：已实现已测（真实PG/Redis）
- 实现文件：src/server/bot-filter.ts；src/server/bot-rules.json；collect.ts
- 验收测试：bot-filter.test.ts；bot-filter-redis.test.ts；bot-collector.test.ts；bot-minute-failover.test.ts；docs/bot-filter.md
- 边界/未实测：字面token可维护规则库、AI优先、每站点/IP一秒>20 HTTP请求行为过滤（批量20事件只计1请求）；域分隔HMAC不存明文IP，原子Redis TIME/Lua与有界同步本地故障窗口，分钟99→100→101故障限流已测试。NAT误报及低频伪装漏报边界明确。

- 服务端：UA 匹配自维护爬虫库；行为规则（1s 内 >20 请求等）记 bot；bot 流量单独计数、不计入正式指标。
- 采集端：navigator.webdriver 为 true 直接不上报。
- AI 爬虫（GPTBot 等）单独标记，供 P1 的 GEO 渠道用。

## F-18 IP 匿名化 / DNT / Consent【P0】

- 状态：已实现已测（本地）
- 实现文件：packages/tracker/src/index.ts；src/server/security.ts；collect.ts
- 验收测试：tracker-browser.test.ts；tracker-collector.test.ts；core-api.test.ts；governance-privacy.test.ts
- 边界/未实测：DNT逻辑及同意前无ID无请求无缓存、撤销清队列/模块、最小consent事件、原始IP不落库；卸载/撤销日志仅尽力发送，不虚构必达。

- IP：入库前 IPv4 置零末段、IPv6 取 /64，原始 IP 永不落盘。
- DNT：navigator.doNotTrack==='1' 则整站不上报。
- Consent：data-consent-required 模式下，**未调用 baize.grantConsent() 前：不生成/不发送追踪标识，不采集、不缓存任何行为记录**（"未同意不采集"字面执行）。用户撤回同意时：停止采集、清空内存队列中未发送的事件。同意状态变更记审计日志。

## F-19 脚本自托管与体积【P0】

- 状态：已实现已测（本地）
- 实现文件：scripts/build-tracker.ts；packages/tracker/src/browser.ts；README.md
- 验收测试：.github/workflows/ci.yml；tracker-browser.test.ts
- 边界/未实测：主/极简IIFE、自托管、data属性及清洗钩子、gzip预算检查；远程CI计费/运行状态独立于本地验收，不宣称hosted CI全部通过。

- 构建：单文件 IIFE 零依赖；多变体（完整版/极简版）；PR 自动检查 gzip 体积（预算 5KB）。
- 自托管：文档给 nginx 配置片段，站长可放自己域名/CDN 下绕过广告拦截。
- 配置全走 data-* 属性（data-website-id 必填）；data-before-send 钩子允许清洗 payload（如砍 query 参数）。

## F-20 批量上报与可靠性【P0】

- 状态：已实现已测（本地）
- 实现文件：packages/tracker/src/index.ts；src/server/collect.ts；db.ts；worker.ts
- 验收测试：tracker-browser.test.ts；tracker-collector.test.ts；core-api.test.ts；analytics.test.ts
- 边界/未实测：固定event_id/原批重试、有界内存、events+outbox事务后202、冲突拒绝、worker租约/死信/重放；beacon排队非持久确认；100k全HTTP→Redis/PG→outbox→worker→查询链路已通过，1M PG-only完整管线实际通过，HTTP687.65秒/worker416.703秒；RSS2.181GB，不能据此宣称1C2G配置、持续生产混合负载或5分钟延迟保证。

- 采集端：事件入内存队列，2s 或满 10 条批量发；每条事件带客户端生成的固定 `event_id`（UUIDv7）；sendBeacon 优先（页面卸载场景），失败回退 fetch keepalive；后端不可达指数退避重试 3 次后丢弃（console.debug，绝不抛错影响宿主站）。
- 服务端：**持久化接收（默认可靠路径）**——/api/collect 校验后**同事务写 PG outbox 表**再返回 202；以 `event_id` 做幂等去重（重复投递直接返回已接受，去重窗口 ≥ 最大重试窗）；Worker 用短事务 SKIP LOCKED 认领，失败进死信队列，人工可查可重放。确认语义：202 = 已持久化，可恢复；内存只做有界削峰缓冲，不做可靠性承诺。P2 规模化时 outbox 可迁 Redis Stream，语义不变。
- 注意：sendBeacon 返回 true 只代表浏览器接受排队，**不代表服务端已保存**；文档明确写清该语义，不承诺"必达"。

## F-21 总览 Dashboard【P0】

- 状态：已实现已测（本地）
- 实现文件：src/server/analytics.ts；src/web/main.tsx；Charts.tsx
- 验收测试：analytics.test.ts；tests/e2e/workflow.spec.ts；ACCEPTANCE_WEB.md
- 边界/未实测：真实中文汇总/趋势/等长前期比较/规则洞察；精确访客集合非日UV相加，水位/coverage/保留边界可用性可见；1M PG-only管线对账通过，但持续生产负载与更大单站分布仍需专项验收。

- 指标卡：PV/UV/会话/跳出率/平均停留/转化数（选定周期）；趋势图（ECharts，按小时/天自动粒度）；对比模式（本周 vs 上周，同环比 %）。
- 查询：全部走 stats_daily/hourly 预聚合；对比 = 两次聚合查询。
- 注意：**日 UV 不能直接相加为月 UV**（标准模式下跨天去重用 HLL 草图估算；隐私每日轮换模式下跨日去重不支持，见 F-02）；一句话洞察：规则模板生成（P1 换 AI 版）。

## F-22 实时看板【P0】

- 状态：已实现已测（真实HTTP/PG；UI最终回归另记）
- 实现文件：src/server/analytics.ts；src/web/main.tsx
- 验收测试：analytics.test.ts（真实SSE/迟到/撤销权限）；tests/e2e/workflow.spec.ts
- 边界/未实测：真实listener+cookie+viewer测试初始流、迟到事件经outbox序号交付与撤销成员后断流通过；真实浏览器实时视觉用例已纳入第二main隔离全套13/13快照（11浏览器流程、2日期检查），不将全套计数当成13项实时专项。

- 当前在线（近 5 分钟有心跳的去重访客）；30 分钟事件流（SSE 推送：时间/页面/来源/地域/设备）；实时 Top 页面/来源。
- 实现：SSE 端点 /api/realtime/stream；明细查询限定近 30 分钟 + Redis 在线集合。

## F-23 来源分析【P0】

- 状态：已实现已测（真实浏览器/查询核心）
- 实现文件：src/server/analytics.ts；content-analytics.ts；src/web/DashboardFilters.tsx
- 验收测试：analytics.test.ts；content-analytics.test.ts；dimensions.test.ts
- 边界/未实测：来源/UTM五字段/渠道×入口页与全局组合筛选实际PG验证，缓存/同期比较含筛选；distinct集合不累加行UV；过滤明细过期范围显式不可用。

- 引荐域名 Top、UTM campaign/source/medium 效果表、渠道分组；支持"渠道 × 落地页"交叉。
- 实现：预聚合表按 channel/referrer/utm 建维度。

## F-24 页面分析【P0】

- 状态：已实现已测（本地）
- 实现文件：src/server/analytics.ts；src/web/AnalysisDetails.tsx
- 验收测试：analytics.test.ts；ACCEPTANCE_WEB.md
- 边界/未实测：页面PV/UV/可见时长/统一跳出/入口出口/读完率；单页面详情真实趋势/来源/设备API及UI，分钟边界准确性已有PG回归。

- Top 页面（PV/UV/平均停留/跳出率）、入口页、出口页；单页面详情（趋势+来源+设备分布）。
- 入口 = 会话首个 pageview，出口 = 末个（sessions 表直接有）。

## F-25 路径分析（桑基图）【P1】

- 状态：已实现已测（本地）
- 实现文件：src/server/analytics.ts；src/web/Charts.tsx
- 验收测试：analytics.test.ts；ACCEPTANCE_WEB.md
- 边界/未实测：真实会话Top20转移/Sankey，采用全量保留期会话非10%抽样；为处理环路分列起点终点，非完整用户全旅程图。

- 用户 A→B 页面流向 Top 20，ECharts sankey。
- 实现：基于会话 pageview 序列，抽样 10% 会话离线算转移矩阵（定时任务），存 path_stats。

## F-26 受众分析【P0】

- 状态：已实现已测（真实浏览器/接口/资产）
- 实现文件：src/server/geography-analytics.ts；packages/geography；src/web/ExtendedAnalysis.tsx
- 验收测试：geography-analytics.test.ts；content-analytics.test.ts；docs/ACCEPTANCE_CONTENT.md
- 边界/未实测：真实国家→四川→成都PV2/UV1和unknown coverage0.5；官方ECharts包34省资产带LICENSE/SHA，ECharts6真实SSR兼容通过。真实官方SVG四川点击→真实region API→省地图与unknown城市提示已13项E2E通过；真实MaxMind四川/城市实测与坐标准确性未测。

- 设备/浏览器/OS/屏幕/语言分布；地域：中国地图下钻到省（ECharts + 内置 china.json）。
- 实现：预聚合维度查询。

## F-27 自定义事件报表【P0】

- 状态：已实现已测（真实浏览器/EAV/趋势）
- 实现文件：src/server/analytics.ts；content-analytics.ts；src/web/ExtendedAnalysis.tsx
- 验收测试：analytics.test.ts；content-analytics.test.ts
- 边界/未实测：事件次数/人数/EAV属性Top/boolean、真实hour趋势与UI已补；最多90天，新趋势明细过期coverage0，非无限存档查询。

- 事件列表（触发次数/人数/趋势）；按属性分组 Top（如 signup 按 plan）。
- 查询：events 明细按 event_name + 时间过滤，属性走 event_data join；限 90 天。

## F-28 转化目标【P0】

- 状态：已实现已测（真实浏览器/目标/趋势）
- 实现文件：src/server/analytics.ts；content-analytics.ts；src/web/ExtendedAnalysis.tsx
- 验收测试：analytics.test.ts；content-analytics.test.ts；workflow.spec.ts
- 边界/未实测：事件/页面/时长目标CRUD、一次会话一次转化、首次完成hour、实际末次非direct页面/渠道趋势与UI已补。真实E2E email目标渠道与趋势通过；细分超明细保留不可用，不将归因当因果。

- 三种：事件型（event_name=xxx）、页面型（到达 /thank-you）、时长型（会话 > N 分钟）；转化数/转化率趋势；按渠道分组。
- 实现：goals 表存定义；每小时定时任务算 goal_stats（避免实时扫明细）。

## F-29 漏斗分析【P1】

- 状态：已实现已测（真实浏览器/漏斗/流失）
- 实现文件：src/server/analytics.ts；content-analytics.ts；src/web/ExtendedAnalysis.tsx
- 验收测试：analytics.test.ts；content-analytics.test.ts；workflow.spec.ts
- 边界/未实测：严格/宽松有序唯一访客漏斗及真实流失集合Top来源/设备已补PG测试，按最早入组会话首步归属，全量sampleRate1；真实E2E两人进入/一人流失及来源设备通过；保留期外coverage0、每日盐跨日unsupported。

- 多步骤（如 首页→商品页→下单→支付），每步转化率/流失数/流失用户特征（Top 来源/设备）。
- 实现：按会话 pageview/event 序列有序匹配；支持严格/宽松顺序；抽样 + 预计算 funnel_stats 日表。

## F-30 留存/同期群【P1】

- 状态：已实现已测（本地）
- 实现文件：src/server/analytics.ts；src/web/AnalysisDetails.tsx
- 验收测试：analytics.test.ts；ACCEPTANCE_WEB.md
- 边界/未实测：标准模式真实cohort/回访集合与留存热图；每日盐UI和API不支持，不跨日推测身份。

- 按首访日 Cohort 的 N 日回访率热力表。
- 实现：visitor_first_seen 表 × 回访标记，日任务算 retention 表。
- 注意：仅标准标识模式可用；隐私每日轮换模式下不支持（见 F-02），UI 明确标注。

## F-31 搜索关键词【P0/P1】

- 状态：已实现已测（关键词/模拟GSC）；Google未实测
- 实现文件：src/server/dimensions.ts；external.ts；src/web/Connectors.tsx
- 验收测试：dimensions.test.ts；external.test.ts
- 边界/未实测：真实搜索referrer关键词有限解析已补，过滤明显IP/email/长数字；GSC查询词/点击/排名/落地页模拟PG验证；无referrer仍unknown/direct，真实Google授权未测。

- P0：referrer 解析到的少量关键词 + 搜索引擎维度。
- P1：GSC API 接入后升级为"查询词 × 点击 × 排名 × 落地页"报表。

## F-32 AI 引荐（GEO）渠道【P1】

- 状态：已实现已测（规则/基础识别）
- 实现文件：src/server/dimensions.ts；sites.ts；src/web/SourceSettings.tsx
- 验收测试：dimensions.test.ts；core-api.test.ts
- 边界/未实测：AI基础host/UA渠道及可编辑ai_referrer_hosts、渠道规则已补；不是自动维护外部AI词库。无referrer保留direct，识别率上限明确。

- 来源分析单列"AI 搜索/助手"：识别 ChatGPT/Claude/豆包/文心等 referrer 与 UA 特征；AI 爬虫单独标记。
- 实现：ai_sources 规则表（F-17 机器人库子集）；文档诚实说明识别率上限（Fathom 70% 无 referrer 流量只能记 Direct 的教训）。

## F-33 自定义报表保存【P0】

- 状态：已实现已测（本地）
- 实现文件：src/server/governance.ts；analytics.ts
- 验收测试：governance.test.ts；ACCEPTANCE_WEB.md
- 边界/未实测：保存DSL与真实执行统一queryStats；path/channel过滤不累加行UV，保留期外筛选明确partial_unavailable。

- 当前筛选（站点/时间/渠道/页面）存为模板一键重看；reports 表存查询 DSL（JSON）。

## F-34 定时推送【P1】

- 状态：已实现已测（模板/持久任务）；外部账号未实测
- 实现文件：src/server/governance-worker.ts
- 验收测试：governance.test.ts；governance-privacy.test.ts；tests/unit/governance.test.ts
- 边界/未实测：日周月统一汇总、等长前期Top变化、中英安全HTML、每日盐UV unsupported、三次持久失败重试/无secret日志已测；SMTP TLS/15秒超时/连接回收已加。真实SMTP/企业微信/Server酱未实测。

- 日/周/月报 → 邮件（SMTP 自配）/企业微信 webhook/Server酱/Webhook；服务端模板渲染 HTML（指标卡 + Top 变化）。
- 实现：定时任务（BullMQ/Redis 队列，替代 APScheduler 方案）；失败重试 3 次；notification_logs 存发送记录。

## F-35 CSV 导出【P0】

- 状态：已实现已测（本地）
- 实现文件：src/server/governance-worker.ts；governance.ts
- 验收测试：governance.test.ts；governance-privacy.test.ts；governance-file-cleanup.test.ts
- 边界/未实测：异步明细/汇总CSV、10万行上限、公式注入保护、权限/下载/删除并发和物理文件清理测试通过；导出超量明确受限而非宣称完整。

- 明细与汇总都可导；大导出走后台任务生成文件 + 下载链接（防超时）；单次上限 10 万行。

## F-36 公开分享链接【P0】

- 状态：已实现已测（本地）
- 实现文件：src/server/governance.ts；src/web/main.tsx
- 验收测试：governance.test.ts；tests/e2e/workflow.spec.ts
- 边界/未实测：密码/期限/吊销、只读聚合无配置原始明细；公共分享限流与隐私模式口径受约束。

- 只读看板链接：token（随机 32 位）+ 可选密码 + 有效期；share_links 表；可随时吊销；分享页不暴露站点配置与原始明细。

## F-37 iframe 嵌入【P1】

- 状态：已实现已测（本地）
- 实现文件：src/server/governance.ts
- 验收测试：governance.test.ts（真实HTML与CSP）
- 边界/未实测：真实单图表HTML、nonce脚本及精确origin frame-ancestors；密码分享需独立token-only嵌入，不支持iframe自定义密码请求头。

- 单图表嵌入自家后台：/embed/chart?type=top-pages&token=只读token；嵌入域名白名单用 **CSP `frame-ancestors`** 实现（X-Frame-Options 只有 DENY/SAMEORIGIN，做不了任意域名白名单）。

## F-38 流量异常告警【P1】

- 状态：已实现已测（预聚合PV/UV/持续采集）
- 实现文件：src/server/governance-worker.ts
- 验收测试：governance.test.ts；external-alert.test.ts
- 边界/未实测：UTC完整小时×过去28天候选，已有存档桶或site创建后明确零值才计有效样本，至少7样本；processed>0且无旧小时pending outbox可覆盖，dirty当前hour不饥饿，pending一分钟重试不消费小时。真实PG归档UV3vs1/0raw、epoch未处理阻塞、迟到恢复、连续两小时与AI绑定通过。

- 规则：当前小时 PV/UV vs 过去 28 天同小时均值，偏离 ±50%（可配）触发；连续 2 小时异常才发（防抖）；通知渠道同 F-34；支持一键静默。
- 实现：每小时任务算 z-score。

## F-39 目标达成/漏斗骤降告警【P1】

- 状态：已实现已测（真实PG规则/队列）
- 实现文件：src/server/governance-worker.ts
- 验收测试：tests/integration/governance.test.ts
- 边界/未实测：事件阈值、真实page goal重复PV仅计一次会话、跨日会话按首次目标完成日、配置会话阈值及完整保留期上下文、严格漏斗步骤0.8→0.2骤降、24小时静默与安全通知队列已测试；真实外部账号投递未测。

- 目标转化数达阈值通知；漏斗某步转化率单日跌超 30% 通知。

## F-40 脚本掉线检测【P1】

- 状态：已实现已测（真实PG边界/队列）
- 实现文件：src/server/governance-worker.ts
- 验收测试：tests/integration/governance.test.ts
- 边界/未实测：23小时不告警/25小时触发、24小时静默与入队已测；真实通知账号投递未实测。

- 站点 24h 无新事件 → 提醒"检查追踪代码是否被删"；实现：定时扫描 sites.last_event_at。

## F-41 多站点管理 + 分组【P0】

- 状态：已实现已测（本地）
- 实现文件：src/server/sites.ts；src/web/main.tsx
- 验收测试：core-api.test.ts；tests/e2e/workflow.spec.ts
- 边界/未实测：站点/时区/隐私/追踪代码、行级权限已测；新真实E2E13项含标签修改和按组筛选通过；website_id为随机24hex而非规格UUID，功能偏差明确保留。

- sites 表（name/domain/timezone/privacy_config）；分组 tags；每站点独立 website_id（UUID）与追踪代码片段生成页。

## F-42 成员与角色【P0/P1】

- 状态：已实现已测（本地）；邮件外部未实测
- 实现文件：src/server/governance.ts；src/web/main.tsx
- 验收测试：governance.test.ts；tests/e2e/workflow.spec.ts
- 边界/未实测：owner/admin/analyst/viewer、邀请已有账户及邀请限定新注册、保留owner、审计已测；真实SMTP发送未测。

- P1：邮箱邀请链接 + 角色（管理员/分析师/只读），site_members 行级权限。

## F-43 审计日志【P1】

- 状态：已实现已测（本地）
- 实现文件：src/server/context.ts；governance.ts；sites.ts
- 验收测试：core-api.test.ts；governance.test.ts
- 边界/未实测：导出/删除/配置/成员/令牌等敏感操作审计和180天清理；独立删除日志另行持久保护，不依赖审计表。

- 谁何时导出数据/删站点/改配置：audit_logs 表，保留 180 天。

## F-44 API【P0/P1】

- 状态：已实现已测（本地）
- 实现文件：src/server/context.ts；governance.ts；external.ts
- 验收测试：core-api.test.ts；governance.test.ts；external.test.ts
- 边界/未实测：站点scoped token/hash/到期/吊销、限流、统计管理API及只读语义工具；外部MCP客户端兼容矩阵未实测。

- 统计查询 API（/api/v1/stats/*，Token 鉴权 + 限流）；管理 API（站点/目标 CRUD）；Token 可吊销、设过期。
- P1 加 MCP 只读 server（给 AI 助手的语义工具，抄 Rybbit/OpenGSC）。

## F-45 用量统计 + 保留策略【P0】

- 状态：已实现已测（本地）
- 实现文件：src/server/governance.ts；worker.ts
- 验收测试：governance.test.ts；analytics.test.ts；partitions.test.ts
- 边界/未实测：按站点保留、分区复合PK、明细清理后存档聚合、用量与存储告警；合成CPU基准不是全栈容量证明。

- 每站点事件数/存储占用看板；明细默认保留 365 天（可配）后自动删、只留聚合；定时清理任务。

## F-46 一键删除访客数据【P0】

- 状态：已实现已测（本地）；增强新卷恢复已测
- 实现文件：src/server/deletion.ts；file-cleanup.ts；cli.ts
- 验收测试：core-api.test.ts；governance-file-cleanup.test.ts；docs/validation-ops.md
- 边界/未实测：入口/worker tombstone、同站锁、fsync独立日志、generation/缓存失效、身份展开删除与JSON/CSV/tmp物理清理已测；新卷恢复已通过删除/中立资产场景，完整增强升级演练EXIT0，日志 /tmp/baize-ops-fresh-restore.log。

- GDPR 被遗忘权：输入 visitor_id/user_id → 删除其 events/sessions 明细，**以及** event_data（其事件的属性）、identity_map（其缝合关系）、visitor_first_seen（其首访记录）；聚合表处理：**UV、漏斗、留存、分位数不能按比例扣减**——可重算的聚合（计数类）触发重算任务，不可精确重算的（如 HLL 基数、t-digest 分位数）在文档中明确标注受影响范围与近似处理方式。
- **防重建**：删除期间，被删标识进入 tombstone 表；Worker 处理到该标识的新事件/重算任务时直接丢弃，不再写回派生结果。
- **删除记录的独立保留与恢复重放**：tombstone 表**每日导出到数据库备份之外的 append-only 存储**（本地受限文件，随备份策略异地一份）；从旧备份恢复数据库后，按固定流程：① 重放 tombstone 删除记录（重新删除"复活"的数据）② 清相关缓存（Redis/物化视图）③ 旧任务按 generation 失效（过期 worker 不能覆盖）④ 再重新开放查询与聚合任务。恢复演练必须覆盖该流程。
- **重算说明**："HLL/t-digest 不能直接扣除成员"不等于"不能重算"——在原始明细保留期内的，重建聚合（从 events 重放建 HLL/t-digest）；超过保留期的，在文档/UI 明确标注近似处理边界。原始明细超过保留期已删除的，仅能删除剩余可识别数据，边界在 UI 明确告知。操作记审计。

## F-47 排除内部 IP【P0】

- 状态：已实现已测（本地）
- 实现文件：src/server/security.ts；collect.ts；sites.ts
- 验收测试：core-api.test.ts
- 边界/未实测：IPv4/IPv6 CIDR与入口过滤；同意/排除前不持久化原始IP。

- 站点级 IP 段黑名单（支持 CIDR）；服务端过滤丢弃。

## F-48 GA4 历史聚合报表导入【P1】

- 状态：部分实现；Google外部未实测
- 实现文件：src/server/external.ts；external-worker.ts；src/web/Connectors.tsx
- 验收测试：external.test.ts；ACCEPTANCE_EXTERNAL.md
- 边界/未实测：OAuth及分页聚合导入/覆盖声明已模拟PG验证；真实GA账号未测，历史PV按站点时区逐日虚线叠加UI已接入，不累加源UV；对应UI已纳入第二main13/13快照；Google响应仍为显式注入的模拟数据，不能记真实Google账号导入已验收。

- 用户授权 Google 账号 → GA4 Data API 拉历史**聚合报表**（按日/周的 PV/UV/会话/来源 Top）→ ga_import 表；看板"历史对比"叠加虚线。
- 边界（诚实说明）：Data API 只能读到聚合报表，**不能还原完整事件流、访客身份与漏斗历史**；因此这是"历史聚合报表导入"，不是"迁移零成本"。导入器必须说明来源、覆盖时间、丢失字段与可用分析范围。
- 价值：仍是获客钩子（Plausible/Matomo/Pirsch 有，Umami/Rybbit/PostHog 无）。

## F-49 整站数据导出【P1】

- 状态：已实现已测（本地）
- 实现文件：src/server/governance-worker.ts；governance.ts
- 验收测试：governance.test.ts；governance-privacy.test.ts；governance-file-cleanup.test.ts
- 边界/未实测：JSON/CSV明细+聚合+去密钥配置导出，10万行边界和隐私删除一致；密钥/邀请/API凭据不导出，非生产凭据迁移包。

- JSON/CSV 全量导出（明细+聚合+配置）；防锁定卖点。

## F-50 Cookie 同意横幅【P2】

- 状态：已实现已测（真实浏览器）
- 实现文件：packages/tracker/src/consent-banner.ts；consent.ts；scripts/build-tracker.ts
- 验收测试：tests/integration/tracker-hooks.test.ts；packages/tracker/README.md
- 边界/未实测：同意组件与grant/revoke集成并以独立tracker-consent.js入口发布；tracker-consent.js正式582byte独立构建和真实点击前无ID/无PG数据、点击后启用专项通过。

- 可选轻量横幅组件（配合 F-18 Consent Mode）；P0 文档先写清楚，P2 再做。

## F-51 GSC 集成【P1】

- 状态：连接器已实现；Google外部未实测
- 实现文件：src/server/external.ts；external-worker.ts；src/web/Connectors.tsx
- 验收测试：external.test.ts；ACCEPTANCE_EXTERNAL.md
- 边界/未实测：PKCE/单次state/用户session绑定/分页/站点日历自动拉取与2–3天延迟声明；只聚合落地页关联，不伪造访客关键词因果。

- OAuth 接 Google → 拉 Search Analytics（查询词/点击/展示/排名/落地页）→ gsc_stats 日表；看板"搜索"页。
- 注意：GSC 数据延迟 2–3 天，UI 明确标注；**GSC 查询词是聚合数据，不能关联到具体访客或订单**，与站内转化的打通只做聚合口径（如"某落地页的搜索点击 vs 其转化数"），不伪造因果。

## F-52 百度搜索资源平台【P1】

- 状态：未实现（官方接口未核验）
- 实现文件：docs/ACCEPTANCE_EXTERNAL.md
- 验收测试：未运行真实官方接口测试
- 边界/未实测：无可核验官方流量关键词API文档；明确unsupported，不杜撰端点，不申请账户或购买服务。

- 官方 API（需站点验证）拉流量与关键词数据；国内独一份（13 家海外全无）。
- 注意：本轮未找到可直接引用的官方 API 接口文档，"流量/关键词 API"的具体端点与配额**待核验**，P1 立项前先做接口可行性验证。

## F-53 站内 SEO 健康检查【P1】

- 状态：已实现已测（本地安全夹具）；真实网站未实测
- 实现文件：src/server/external-worker.ts；outbound.ts
- 验收测试：external.test.ts；ACCEPTANCE_EXTERNAL.md
- 边界/未实测：授权域名、robots规则/通配符、2秒限速、DNS固定/私网重定向拦截、问题优先级和复扫；外部公开网站完整抓取未实测。

- 自研轻量爬虫（定时，尊重 robots.txt）：缺 title/description、重复 title、缺 h1、图片缺 alt、缺 canonical、缺 OG/视口；输出问题清单 + 修复优先级。
- 实现：独立 worker，undici 抓 HTML + cheerio 解析；大站限速（1 req/2s）防被封；爬虫只抓用户授权的域名，**SSRF 防护**（内网地址、云元数据端点拦截，重定向跟踪限制）。

## F-54 关键词排名监控【P1】

- 状态：部分实现；付费SERP外部未实测
- 实现文件：src/server/external.ts；external-worker.ts
- 验收测试：external.test.ts；ACCEPTANCE_EXTERNAL.md
- 边界/未实测：可插拔SerpAPI/DataForSEO、每日排名/大变动标记已模拟验证；排名变动持久通知队列/站点时区/排除过期历史/阈值/小时幂等已真实PG测试通过，真实付费API未测。

- 用户自填 SERP API Key（SerpAPI/DataForSEO，抄 SerpBear 的多源抽象层 + 自备代理）；核心词每日查排名 → rank_history；大波动告警。
- 注意：Google 封爬虫是常态，数据源必须可插拔；费用用户自理，文档写清。

## F-55 SEO→转化打通【P1】

- 状态：已实现已测（聚合口径）
- 实现文件：src/server/external.ts；analytics.ts
- 验收测试：external.test.ts；ACCEPTANCE_EXTERNAL.md
- 边界/未实测：自然搜索会话→落地页→目标/币种收入聚合，GSC点击不关联具体订单；真实搜索账户未实测。

- 自然搜索流量 → 落地页 → 目标转化一条链路；报表直接回答"SEO 带来了多少注册/订单"。

## F-56 BYOK 设置【P1】

- 状态：已实现已测（本地安全）；真实模型未实测
- 实现文件：src/server/keyring.ts；external.ts；outbound.ts
- 验收测试：external.test.ts；SSO/keyring tests；ACCEPTANCE_EXTERNAL.md
- 边界/未实测：AESGCM版本/0600独立文件轮换、旧版本解密、受限Ollama例外和真实HTTP出口限制；真实商业模型与灾难人工恢复未实测。

- 后台设置页填 OpenAI 兼容 Key（OpenAI/DeepSeek/通义/自建网关）；Key 经 HTTPS 提交后只在服务端用 **AES-256-GCM（node:crypto）** 加密存 DB，随机 nonce + key_version；主密钥由安装器生成、存**独立受限文件**（0600，仅 app 用户可读）。安全隔离要求：主密钥**不写入数据库、不进镜像/日志/错误追踪**、与数据库备份**分开保护**（独立密封备份）；支持轮换（key_version 递增）与灾难恢复（需人工介入解密恢复包）。单机一键部署**不强制物理分盘**，分盘可作加强选项。
- 安全：自定义模型 URL 只允许管理员配置，请求前做 **SSRF 防护**（默认禁止内网 IP/元数据地址、DNS 重绑定校验、超时与大小限制）。**受控例外**：本地模型（如 Ollama）需管理员在后台**明确登记**目标地址与窄网段例外，该例外仅用于模型调用，不复用于站内爬虫等其他出口。

## F-57 智能日报解读【P1】

- 状态：已实现已测（模拟模型）；真实模型未实测
- 实现文件：src/server/external.ts；src/server/app.ts
- 验收测试：tests/integration/external.test.ts；ACCEPTANCE_EXTERNAL.md
- 边界/未实测：站点时区日报、持久任务重试、仅聚合输入，真实timer/模拟返回测试；真实AI输出质量不声称验收。

- 定时任务把聚合指标喂给模型 → 生成中文解读（"UV 环比+23%，增量 8 成来自微信；支付页转化掉 12%，建议优先检查"）；只发聚合数据，不含原始 IP/明细。

## F-58 异常归因【P1】

- 状态：已实现已测（实际告警/模拟模型）；真实模型未测
- 实现文件：src/server/external.ts；governance-worker.ts
- 验收测试：tests/integration/external-alert.test.ts；docs/ACCEPTANCE_EXTERNAL.md
- 边界/未实测：实际collect→worker→F38 PV/UV告警→F58 optin绑定，同小时联合渠道/页面/设备变化、原告警快照、通知UUID幂等、并发/失败退避retry已PG测试；无optin零调用。真实模型原因质量未实测，不宣称因果。

- F-38 触发后自动下钻（渠道×页面×设备）找最大变化维度 → AI 生成可能原因说明。

## F-59 优化建议引擎【P1】

- 状态：已实现已测（规则/模拟模型）
- 实现文件：src/server/external-worker.ts；external.ts；src/web/Connectors.tsx
- 验收测试：external.test.ts；ACCEPTANCE_EXTERNAL.md
- 边界/未实测：不可变事实/evidence_id/置信度/样本不足、状态机、SEO复扫、真实25→5漏斗和25LCP样本输入/priority代理排序、前后同口径/干扰因素；真实AI建议有效性未实测，不宣称修复有因果收益。

- 输入：漏斗流失点、慢页面（Web Vitals 差）、高跳出入口页、SEO 问题清单 → 输出可执行整改清单（按预期收益排序）。每条建议带：evidence_id（关联事实快照）、可能原因与**置信度**（证据不足时明确说"证据不足"，不硬给结论）。
- **建议实施后验证（复检闭环）**：建议状态机 = 新发现 → 已接受 → 处理中 → 已修复待复检 → 已验证 / 误报；记录实施日期；SEO 类建议触发复扫（F-53）；效果对比 = 实施前后同口径指标对照，并**注明干扰因素**（流量波动、季节性、同期其他改动）；不能仅凭前后变化宣布"优化有效"。
- 价值：回答"改了以后有没有用"，这是与 OpenGSC/51.la 拉开差距的具体功能点（待对照验证）。

## F-60 自然语言问数【P1】

- 状态：已实现已测（只读工具/模拟模型）
- 实现文件：src/server/external.ts；src/web/Connectors.tsx
- 验收测试：external.test.ts；ACCEPTANCE_EXTERNAL.md
- 边界/未实测：只读typed语义工具无任意SQL、权限与daily_salt guard；可返回数据图，真实模型问数质量与第三方MCP客户端未实测。

- "上周微信来的 iOS 用户转化率多少？"→ 走 MCP 只读工具（F-44）→ 模型组装查询 → 返回数字+图表；guardrail：只能查有权限站点、只读聚合。

## F-61 一键安装【P0】

- 状态：已实现已测（真实Docker）
- 实现文件：install.sh；docker-compose.yml；Dockerfile
- 验收测试：docs/validation-ops.md；scripts/ops-lifecycle-test.sh
- 边界/未实测：安装/随机密钥/迁移锁/幂等本地真实容器通过；Windows run.bat在Linux未运行，非外网生产部署。

- install.sh：检查 Docker → 生成随机密钥 → docker compose pull → 初始化 DB（`pnpm db:migrate`，编号 SQL 迁移）→ 打印地址；幂等可重跑。

## F-62 首次运行向导【P0】

- 状态：已实现已测（真实浏览器/PG）
- 实现文件：src/server/auth.ts；src/web/main.tsx
- 验收测试：core-api.test.ts；tests/e2e/workflow.spec.ts
- 边界/未实测：首次管理员→站点→代码、setup锁定及并发边界；未加入演示数据，不以mock看板验收。

- /setup：建管理员 → 加第一个站点 → 复制追踪代码 → 可选一键导入演示数据；完成后锁定 setup（防重复）。

## F-63 GeoIP 自动下载【P0】

- 状态：连接器已实现；MaxMind外部未实测
- 实现文件：src/server/geoip.ts；geoip-settings.ts；src/web/GeoIpSettings.tsx
- 验收测试：tests/unit/external-geoip.test.ts；external-sso-keyring.test.ts；ACCEPTANCE_EXTERNAL.md
- 边界/未实测：管理员cookie-only加密配置/部分更新/指纹状态/reload；授权下载+官方SHA及mmdb验证、无key明确unknown及配置提示；真实授权账号/地理准确率未测。

- 启动任务用 MAXMIND_LICENSE_KEY 下载 GeoLite2-City.mmdb + sha256 校验；失败降级 unknown，看板横幅提示配置方法。

## F-64 产品落地页【P0】

- 状态：已实现已测（浏览器）
- 实现文件：src/web/main.tsx；style.css
- 验收测试：tests/e2e/workflow.spec.ts；ACCEPTANCE_WEB.md
- 边界/未实测：默认产品Hero/功能/三步CTA、登录导航，实际页面验收；未外网发布。

- `/` 默认产品落地页（Hero+功能+三步上手+CTA）；登录/注册只做导航入口（既定规则：不许打开就是登录页）。

## F-65 中英 README/docs【P0】

- 状态：已实现已测（主要中英用户文档）
- 实现文件：README.md；README.en.md；docs/
- 验收测试：docs/ACCEPTANCE_WEB.md；validation-ops.md；ACCEPTANCE_EXTERNAL.md
- 边界/未实测：实际PG截图、安装、Mermaid数据流、验收矩阵、API/开发/隐私删除文档已补；docs/en已提供部署/开发/API/迁移/兼容/隐私/验证英文入口；项目规格和开发审计报告仍中文。

- README：截图/GIF 占位、一键安装、5 分钟上手、架构图、功能矩阵；docs/：部署、反代、升级、迁移、API、二次开发。

## F-66 upgrade.sh【P0】

- 状态：已实现已测（真实Docker）；增强场景EXIT0
- 实现文件：upgrade.sh；backup.sh；restore.sh
- 验收测试：docs/validation-ops.md；scripts/ops-lifecycle-test.sh
- 边界/未实测：恢复点含DB/卷/密钥分离，迁移锁、503/缺镜像/已提交schema回滚旧DB已实际演练；增强独立新卷/严格journal场景通过，完整增强脚本EXIT0，日志 /tmp/baize-ops-fresh-restore.log。

- 流程：升级前自动创建恢复点（DB 快照 + 卷备份）→ 拉新镜像 → 执行编号 SQL 迁移（`pnpm db:migrate`，**迁移锁**防多实例并发）→ 健康检查 → 失败按**恢复步骤**回滚（恢复 DB 快照 + 切回旧镜像）。
- 注意：数据库结构变化后旧程序可能无法读取新数据，**"换回旧镜像"不等于回滚**；必须有兼容矩阵（哪个 APP 版本兼容哪个 schema 版本）、升级前演练文档。"升级不翻车"是目标不是保证，README 如实写（Umami v3 翻车是反面教材）。

## P2 独立验收目标

- P2-01 ClickHouse 明细可选迁移：部分实现（新增应用镜像/选择性读切换本地实际验收）：真实PG/CH/Redis完整脱敏schema可靠镜像，analytics保留边界/过滤、content/geo选择性读取；高水位/epoch/count不符明示PGfallback。删除/恢复屏障与上传删除竞态/日志失败重放/旧快照清理已有专项通过（14集成+3单元，后续views/lease/deadline/cache合测22项），见docs/ACCEPTANCE_CLICKHOUSE.md。当前在制不属于b56b7e9索引。worker/rollups/governance/identity/realtime/事件属性仍PG；PG仅元数据、增量partition、更全面读切换、历史迁移/CH集群备份及大容量仍未完成，不能仅以镜像模块验收代替P2全部目标。
- P2-02 隐私优先会话回放：部分实现（核心已测）：optin、严格服务端遮罩校验、page实例/序号、真实rrweb播放器；跨页完整播放/真实复杂站点兼容待扩展。证据 governance.test.ts、tracker-browser.test.ts、ACCEPTANCE_WEB.md。
- P2-03 热力图：部分实现（核心已测）：optin与0.01精度归一化点击、SVG热图真实数据；复杂响应式/滚动坐标浏览器专项验收未完整记录。
- P2-04 A/B 实验归因：部分实现：确定性visitor分组/目标计数/API与UI集成；固定周期双比例检验/Bonferroni多重修正/Wilson区间/样本不足保护已真实PG与单元测试；实际共享cookie A→B identify/goal、删除A保留B、旧贡献回灌journal重放真实浏览器/PG已通过；贡献event_id+ts幂等，API不信converted缓存，旧无明细历史标partial_unavailable禁显著性。
- P2-05 微信小程序 SDK：部分实现：wx.request注入SDK、无WebCrypto UUID、同意/幂等重试/每日盐限制已有本地测试；真实微信设备/账号未实测。
- P2-06 WordPress 插件：已实现，本地实际运行通过：官方 WordPress 6.9.4/PHP 8.3.31/MariaDB，真实 ZIP 上传安装、启用/设置/停用/再启用、Chromium→HTTP202→PG→worker，以及同意/撤回；见 docs/test-evidence/wordpress-actual-runtime.json。更多主题/CMP/插件冲突未实测。
- P2-07 企业微信扫码 SSO：连接器已实现、真实企业未实测：显式成员映射、一次state/session、禁止自动提权，真实PG模拟OAuth测试通过；不创建企业凭据。
- P2-08 多语言 UI：部分实现：中文主体及英文核心UI；高级治理表单/回放Play及speed实际英文交互已测；全量后台错误文本/开发审计报告仍非完整多语言。
- P2-09 Ollama 本地模型：连接器已实现、真实Ollama推理未实测：明确登记窄范围内网例外与真实本地HTTP模拟传输测试；未运行真实模型。
- P2-10 Cookie 同意横幅：已实现且本地真实浏览器验收，与F-50同一功能/同一证据：独立tracker-consent.js构建、真实点击前无ID无PG数据、点击后采集通过tracker-hooks.test.ts。不能在F-50标通过而此处保留“部分实现”。更多真实CMP/主题组合未实测，不是核心横幅尚未实现。

## 集中剩余清单（不代表全部验收）

- 可自主补齐的功能：尚需完成全量后台错误英文和高级一致性（web/external正在实施及测试）、跨设备身份专用注册→付费视图（专项验收在制）、ClickHouse完整可选迁移（可靠镜像及选择性读取已有新增本地专项通过；PG仅元数据/更多模块读切换/增量与历史迁移/CH备份仍在制，不能使用b56b7e9快照当全部P2通过）。新下载/404/事件/目标/漏斗/地域/规则/UTM接口及UI已实现；新增UI交互13项真实E2E通过。
- 必须补专项证据：Windows安装入口、持续混合写删及更大单站规模分布。100k和1M PG-only真实 HTTP→outbox→worker→queryStats/SQL 对账均已通过，见docs/validation-scale.md与full-pipeline-1000000.json；1M启动cb72a7e+当时WIP，不冒充精确最新SHA、CH容量或1C2G/5分钟延迟保证。WordPress 本地真实运行已通过，更多主题/CMP冲突未实测。实际A→B身份删除/恢复与实验贡献已浏览器验证，匿名历史不自动缝合为隐私选择。
- 等最终集成结果：已提交b56b7e9快照的148应用测试/13E2E及lint/type/build通过；现工作区后续改动必须另跑最终集成，不能沿用148证明新增功能。ops旧6c66镜像增强恢复/回滚EXIT0不覆盖024及当前工作区，新镜像全矩阵尚待运行。
- 真实外部未实测：Google GA4/GSC、MaxMind授权下载、SerpAPI/DataForSEO、SMTP/企业微信/Server酱、企业SSO、商业AI及真实Ollama模型；安全连接器与模拟集成通过不能替代外部验收。F52官方接口可行性未核验。
- 规模/实现偏差：exact访客集合代替HLL、持久PG任务代替BullMQ、部分精确范围查询重建保留期明细；这些选择已测试正确性，但内存/吞吐规模和超保留期精度边界必须持续披露。

当前新发现的验收缺陷：真实PG不等样本分位合并（25×100 + 1×10000 的p75错误5430）正在analytics修复与复验；此前测试快照不覆盖该缺陷，不能据其标全部统计正确。
