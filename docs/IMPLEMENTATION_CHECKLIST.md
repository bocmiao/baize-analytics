# 逐项实现与验收清单

## 当前验收入口（本地ce42c9f / d67应用源）

| 源/阶段 | 实际证据 |
|---|---|
| d67后端 |217单元+428真实集成=645PASS，实际后端执行|
| ce42c9f浏览器 |30检查（28真实Chromium+2日期）PASS、EXIT0；与d67 src/db/packages/sdk/scripts EMPTYdiff，不称后端重跑|
| d67镜像 |实际EXIT0：55DDL/391manifest/严格独立恢复；瞬时可用盘低62MiB风险已归档，不隐去|
| d67固定1000/5000 |实际EXIT1结束：1000PASS4.537660079秒；5000整体FAIL4700accepted/6unsent/38delayed/queryfail0，但draintrue、六final断言PASS，finalHTTP23.714184648秒；Node峰714698752B不含DB。性能仍欠，不称5000/SLO通过|
| Git/托管 |remotee441已核、push blocked，不再认证尝试；checkpoint manifest /workspace/baize-checkpoints/CHECKPOINT_MANIFEST.json、e441..f91五commit bundleverify0，仅Git对象/已跟踪source不含runtime keys。不称收工，不触发CI|

原661ENOSPC及d67首轮29/30整体EXIT1按原SHA证据保留在历史节。

1240 source文件前后不变、4项cleanup全true。当前无负载运行；末段可用盘观察1.5GiB→结束2.0GiB，不是minimum也不据此作因果解释。其后仅获批10个旧构建缓存精确ID清理，观测可用空间2485452800→9281884160B；完整清理证据另存，不触及最新镜像、共享依赖或卷。

## 历史SHA阶段记录与原契约

**当前66150be测试窄修**：完整type/lint/215单元实际EXIT0，src/db/packages与0a相同；19真实precommit专项仍只证明此前摘要绑定源码，不是完整全轮。0a正式入口实际EXIT2（TS2749），unit/int/browser/image未运行；随后测试WIP首次213/215单元通过、2FAIL，类型与event-capable mock窄修后215PASS。先type后追加测试导致旧报告外推的失误已记录，不掩盖。661新full/image/load待；bd未捕获错误、0a类型FAIL、测试WIP2FAIL及1c负载FAIL原证据保留。

当前更新a9b49e7：bd3f51f三批候选7单元/21真实专项PASS，但新完整入口实际EXIT1：213单元PASS，集成424检查中423PASS/1skip，并有uncaught PG25P04 error1；浏览器NOT RUN。旧1c30浏览器及镜像通过仅绑定旧source，不外推候选。skip来自runner漏env，已改用仓库validate-local-final.sh正式入口；C idlefatal修复已保存0a0c171：precommit WIP摘要绑定第四轮19真实专项PASS/0skip/0uncaught，10单元/type/lint通过；新0a全量/镜像/负载尚待。所有FAIL保留，托管不触发。

### 历史bb6阶段状态表

证据归档已随bb6a20c保存；下表按实际源码与执行阶段区分，不累加历史计数。

| 源与阶段 | 当前实际结果 |
|---|---|
| c890后端 | 211单元+421真实集成=632 PASS/0skip，已实际执行 |
| 1c1cb65浏览器 | 30检查=28真实Chromium+2日期全部PASS/0skip，92.6437秒，EXIT0/cleanup |
| 两阶段源码关联 | src/db/packages与c890一致已核；不声称1c重跑后端 |
| 1c1cb65新镜像 | 实际EXIT0；a5d495d6…，55DDL/054两个索引、391源码与镜像一致、运行budget probe、独立目标latest journal删A保B/源不变、故障拒绝及cleanup通过；证据main-1c1cb65-image-* |
| 最终固定1000/5000负载 | 1000 PASS（最终HTTP5120ms）；5000 FAIL（4900accepted/2unsent/39delayed、120秒排空deadline、最终断言未执行），仍有本地性能欠项 |
| 托管/外部边界 | 不触发托管；真实外部账号、设备及模型未测边界保留 |

日期标记和累计SELECT次数/decoded bytes/deadline预算两项有限缺口已有本地证明；预算不保证scan/heap或性能改善。以下各SHA原文为历史时点，不作为另一个“当前/最新”入口；所有FAIL、执行时间与原证据保持。

此清单逐项保留规格要求与真实验收证据，不把未完成要求改写为更低目标。状态分为：已实现且本地验收 / 在制或部分实现（具体欠项仍须完成） / 未实现 / 连接器本地验收但真实外部未测。

历史冻结 `19d97af` 完整本地全轮实际EXIT0：51文件191单元+152文件404真实集成=595 PASS，30检查（28真实Chromium+2日期）全PASS/0fail/0skip，浏览器1.6分钟；lint/type/SDK/build/migrate/compiledapp/Compose cleanup均0。历史 `10eb88a` 为此前已完成整轮。严格权威采集、事实、删除、缓存与独立签名恢复主体已实现，核心 guard 已启用；逐站 proof/水位/删除屏障仍强制。10eb88a 完整本地全轮实际EXIT0：180单元+402真实集成、30检查（28真实Chromium+2日期）全PASS/0skip；新全部源码镜像及托管仍待。规格正文保持原目标，阶段计数不相加。

| 不可变阶段 | 实际本地结果与边界 |
|---|---|
| 7fbb561 | 100 单元+394 集成全部 PASS；22检查=20真实Chromium+2日期全部 PASS，fresh Compose EXIT0/cleanup；见 [VALIDATION_TENTH.md](VALIDATION_TENTH.md) |
| b7a0a5f | 114 单元+395 集成 PASS；浏览器25/27 PASS、2 FAIL（23真实Chromium+2日期通过），旧失败保留 |
| be95373 | 163 单元 PASS；398集成中396 PASS、2 FAIL，整轮 EXIT1；受影响定向修复不改写该整轮结果 |
| 1e39942 | 浏览器28/29 PASS（26真实Chromium+2日期）、1回放focus FAIL，保留 |
| ce6ebcc | 回放focus/workspace导航2真实浏览器定向 PASS，不代表全29通过 |
| f4生命周期/b7独立恢复 | Docker生命周期和独立native restore实际 PASS；不覆盖050–053新镜像，后者尚未运行 |
| ef55e12 | 168单元+400真实集成、29检查（27真实Chromium+2日期）全PASS，历史冻结结果保留 |
| 08eab82 | 173单元+401真实集成、30检查（28真实Chromium+2日期）全PASS/0skip、fresh local EXIT0/cleanup；最新源码生产镜像及托管仍未执行 |
| 10eb88a | 180单元+402真实PGCHRedis集成、30检查（28真实Chromium+2日期）全PASS/0skip、fresh local EXIT0/cleanup；下一候选及新镜像未预验 |

ce6ebcc 与 b0be327 严格1000完整窗口基准已入仓且完整性 PASS，最终HTTP PV1000/coverage1、认证正文及PG正文清零/outbox/水位对账通过。ce 排空4查询 P95 7726.857ms、最终HTTP8825.490ms；b0最终HTTP7009.640ms，仍慢，不能据此承诺实时SLO/1C2G或5000规模。详见 [完整窗口说明](research/round2/PREFETCH_VALIDATION.md)及 [ce证据](test-evidence/main-ce6ebcc-independent-strict-1000.json)、[b0证据](test-evidence/main-b0be327-independent-strict-1000.json)。原strict5000失败保留。完整七筛选保存/编辑已实现并定向复验，不再列为待实现。

042独立 `5b402dd` 自定义搜索手动导入4单元+7真实PG+1真实浏览器（11+1）及build/type/lint PASS；见 [manual-search-clean-main.json](test-evidence/manual-search-clean-main.json)。历史第八377=88+289/20、历史第七318=84+234/20、第五272/19、第六289/20均按各自冻结范围保留，不称“最近”或累加。第七分阶段通过不是单次shared EXIT0。历史依据见 [VALIDATION_EIGHTH.md](VALIDATION_EIGHTH.md)、[VALIDATION_SEVENTH.md](VALIDATION_SEVENTH.md)。

CNB223的7分31秒EXIT0/18E2E已父核验。最近已验实际日志的fa3e托管84unit通过、集成222通过/3失败/9跳过（4失败套件），E2E未运行、EXIT1；夹具隔离与历史oracle已在本次空Compose复验通过，但未预称新CNB托管绿。两次本地全量失败（271/6/9及288/1/0）与下载403均保留，见第八记录。GitHub Actions已停用且无活动YAML，不启用/重跑；只CNB/local，仓库私有不外网部署。当前托管规则：全部实现与本地集成收工后再由负责人手动执行最新源验收；不因分阶段同步、专项通过或文档更新触发托管，不把未运行的最新main/CNB记绿。

D3/D4固定中英文、真实多目标百分比与隐私提示已本地验收；设备/读屏及真实模型边界保留。F65中英用户API/迁移手册已交付，不把文档检查增加到应用计数。原规格“做什么/采集端/实现”是目标，不等于当前完成。Windows LAPTOP-FVUE4BC2仍connected/authorized，但唯一Get-Date/Get-Location在执行前被exec-server -32603 helper_unknown_error setup refresh had errors阻断；无安装/改动/重试，run.bat未验收。[确切状态](test-evidence/windows-executor-status.json)。

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

- 状态：已实现已测（本地，main 9c7f717）
- 实现文件：packages/tracker/src/index.ts；packages/tracker/src/link-text.ts
- 验收测试：link-text.test.ts；tracker-outbound-text.test.ts；tracker-hooks.test.ts；docs/test-evidence/outbound-final-tests.json
- 边界/未实测：标准模式采公开可见文字前50个Unicode字符并脱敏已知邮箱/电话/IP；忽略private/mask/hidden/input子树；每日盐不采文字。真实Chromium→HTTP→PG/EAV→聚合→JSON/CSV导出已测，不保证任意业务文字匿名。

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
- 边界/未实测：真实标题404采集、URL×脱敏来源路径×渠道×次数、修链CSV防公式注入与审计已测。超明细保留期不可用、导出409；9cd7 的完整 15 项 fresh-E2E 含真实下载/404 CSV/事件趋势，通过；新 F29 改动需另验。

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

- 状态：已实现且本地验收（专用 API/UI/真实 SDK）
- 实现文件：packages/tracker/src/index.ts；src/server/analytics.ts；revenue-identity.ts；src/web/RevenueIdentityViews.tsx
- 验收测试：analytics.test.ts；revenue-identity.test.ts；tests/e2e/revenue-identity.spec.ts；third-main-tests.json；third-main-e2e.txt
- 边界/未实测：币种独立金额/订单趋势、重复订单、末次非 direct 渠道/页面归因及历史币种缺失警示已测；真实 SDK 专项验证 119 CNY 与 5 USD 分开、重复订单不增收入、专页与英文控件，纳入 9cd7 的 180/15。金额仅业务自述，不是实际支付对账；不推算未知币种、不把归因当因果。

- `baize.trackRevenue(99.0, { currency:'CNY', order_id})`；服务端汇总 revenue。
- 看板：收入趋势、按渠道/页面的末次点击收入归因。
- 注意：前端上报的金额是**业务方自述数据**，不能直接当作已支付事实；对账口径以业务系统为准，文档明确。

## F-15 用户标识 identify【P0】

- 状态：已实现且本地验收（时间绑定身份及注册→正收入视图）
- 实现文件：packages/tracker/src/index.ts；src/server/identity.ts；revenue-identity.ts；collect.ts；deletion.ts；src/web/RevenueIdentityViews.tsx
- 验收测试：core-api.test.ts；revenue-identity.test.ts；governance-privacy.test.ts；tests/e2e/revenue-identity.spec.ts
- 边界/未实测：脱敏账号键/活动、明确相同业务标识的跨设备时间绑定、账号 A→B 隔离/删除/日志恢复已实际 PG 测试；真实 SDK 专项验证不同账号收入不混合、API/DOM 不出现原业务标识、选定保留窗口内注册后严格晚于注册的正收入转化与英文控件，纳入 9cd7 的 180/15。历史匿名不自动缝合为隐私选择；窗口外注册/付费不补算；每日盐禁止身份缝合，身份分析当前不支持入口路径/渠道/UTM 过滤并明确提示。

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
- 边界/未实测：真实listener+cookie+viewer测试初始流、迟到事件经outbox序号交付与撤销成员后断流通过；真实浏览器实时视觉用例在第二 main 13/13 与第三 main 15/15 fresh 快照均通过；这些全套计数不等于实时专项数量。

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
- 边界/未实测：真实国家→四川→成都PV2/UV1和unknown coverage0.5；官方ECharts包34省资产带LICENSE/SHA，ECharts6真实SSR兼容通过。真实官方 SVG 四川点击→真实 region API→省地图与 unknown 城市提示已纳入 9cd7 全 15 项 fresh-E2E 通过；真实MaxMind四川/城市实测与坐标准确性未测。

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

- 状态：已实现且本地验收：有序漏斗、完整会话上下文与typed流失属性，第四/第五批完整测试通过
- 实现文件：src/server/analytics.ts；content-analytics.ts；funnel-analysis.ts（新增）；src/web/ExtendedAnalysis.tsx；FunnelDropoff.tsx（新增）
- 验收测试：analytics.test.ts；content-analytics.test.ts；workflow.spec.ts；funnel-analysis.test.ts（真实 PG 4/4）；funnel-dropoff.spec.ts（第四18/第五19 fresh-E2E通过）
- 边界/未实测：9cd7 的 180/15 已验证严格/宽松漏斗及基础来源/设备流失。新增独立端点以完整保留会话上下文和去重访客集合分析，不拼接不同会话；boolean true 与字符串 true 分桶、有/缺失属性样本、Top10/事件上限/隐私/保留边界已独立 PG 验证。已注册专用UI与真实SDK流程，纳入第四237/18和第五272/19完整验收。UI 请求结束截到 now 并保留 requested/effective metadata；该专用端点目前不支持入口路径/渠道/UTM 条件，明确提示清除，不静默忽略；超保留/上下文不完整/截断/每日盐跨日不展示伪零。

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
- 边界/未实测：真实单图表HTML、nonce样式及精确origin frame-ancestors；密码分享需独立token-only嵌入，不支持iframe自定义密码请求头。

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
- 边界/未实测：站点/时区/隐私/追踪代码、行级权限已测；9cd7 全 15 项 fresh-E2E 中的实际标签修改与按组筛选通过；website_id为随机24hex而非规格UUID，功能偏差明确保留。

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

- 状态：P0站点API本地验收；P1标准MCP已实现、默认应用注册、定向官方SDK验收通过，下一全量阶段汇总中
- 实现文件：src/server/context.ts；governance.ts；external.ts
- 验收测试：core-api.test.ts；governance.test.ts；external.test.ts
- 边界/未实测：站点scoped token/hash/到期/吊销、限流、统计管理API已实现。新标准JSON-RPC2/stateless StreamableHTTP MCP server已在app注册；官方SDK1.32.1真实HTTP+PG4项通过（实际协商2025-11-25、权限撤销/notification/typed安全边界），见docs/mcp.md、tests/integration/mcp.test.ts。其他桌面客户端及后两声明协议版未独立验证；下一不可变完整compiled-app/镜像阶段由根汇总，不把专项替代全集。

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
- 实现文件：src/server/deletion.ts；src/server/file-cleanup.ts；scripts/restore-runtime.ts
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

- 状态：已实现且本地验收；真实Google账号未实测。
- 实现文件：src/server/external.ts；ga4-import.ts；db/migrations/029_ga4_import_windows.sql；src/web/Ga4History.tsx；Connectors.tsx
- 验收测试：ga4-import.test.ts；ga4-windows.test.ts；governance-full-export.test.ts；ga4-history.spec.ts；ACCEPTANCE_GA4_WINDOWS.md；第五272/19与c610 Docker。
- 边界/未实测：五独立报告（日×来源、日、ISO周、整窗口、整窗口×来源），整窗口totalUsers独立读取，绝不逐日/来源相加UV；保存精确日期窗口、provider timezone与quality，不匹配窗口明确unsupported。每日opt-in、分页/原子导入/并发配置版本、39表导出、中英真实浏览器已有本地验收。Google传输明确模拟，真实OAuth/配额/账号权限未测，不能记真实账号导入通过。
- 上限：请求最多3660天，每报告最多100000行，每HTTPS响应5MB；GA4不能还原事件、身份或历史漏斗。精确窗口不能估算任意子窗口UV。原导出每表100000行，非无限导出或整实例备份。
- 原承诺：按日/周PV/UV/会话/来源Top与历史对比虚线；必须说明来源、覆盖、缺失字段、可用分析范围，不能宣称迁移零成本。

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

- 状态：官方公开读取API未证实，官方连接器未实现；安全自定义模板/列映射导入042已main且本地验收，非百度原生格式兼容。
- 实现文件：docs/BAIDU_API_FEASIBILITY.md；src/server/external.ts（unsupported-unverified状态）；src/server/manual-search-import.ts；manual-search-parser.ts；src/web/ManualSearchImport.tsx；042_manual_search_import.sql
- 验收测试：独立干净main042快照4unit+7真实PG+1真实浏览器，build/type/lint通过；证据manual-search-clean-main.json。未运行真实官方账号/API读取；此前网络CONNECT403失败记录保留。
- 边界/未实测：截至2026-10-10，父线程官方文档核验：搜索资源[搜索分析](https://ziyuan.baidu.com/college/articleinfo?id=3415)有点击/展现/关键词/平均排名/热门页说明，但未找到普通站长公开文档化读取API，不能断言不存在。[2015关键词下载说明](https://ziyuan.baidu.com/wiki/571)没有当前CSV实际样本；收录接口是URL提交而非搜索分析读取。[百度统计搜索词接口](https://tongji.baidu.com/api/manual/Chapter1/source_searchword_a.html)为PV/UV搜索词，不是自然搜索展现/排名。不杜撰端点，不新建统计连接器，不购买/申请凭据。手动自定义模板/列映射已实现安全预览、原子幂等独立批次、权限隔离、安全CSV与整站导出，并有中英实际浏览器验收；来源仅用户声明，不混合GSC/PV/UV或订单，不等于官方读取API。百度原生CSV兼容必须有实际样本后另验。

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

- 状态：只读工具与可验证trace/chart/历史问题已生产注册并纳第八377+20本地完整应用验收；044CH事实来源及严格读写已纳7fbb561空卷494应用与22检查验收；新镜像仍待。
- 实现文件：src/server/external.ts；src/server/ai-evidence.ts；src/web/Connectors.tsx；docs/api.md
- 验收测试：external.test.ts；ACCEPTANCE_AI_QUESTION_EVIDENCE.md；ACCEPTANCE_EXTERNAL.md（新增专项不可加到272）
- 边界/未实测：typed查询/权限/daily_salt guard已测。当前生产路径已接questionEvidence、确定性chart、query/result版本与授权证据、历史问题读取及同client原子预算；早期独立24PG/相关浏览器专项通过不纳第五计数；后续033精确多目标会话口径、035持久预算与040失效已纳第八冻结源，f66f加强多轮发送前检查。当前CH正文/facts已同源本地联合验收，最终新镜像仍待。模型收到用户问题和获授权聚合，不是“从不发问题”；真实模型质量和其他桌面MCP客户端仍未实测；官方MCP SDK实际HTTP/PG已测，不能继续统称协议客户端未测。

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
- 边界/未实测：实际PG截图、安装、Mermaid数据流、验收矩阵已补。本轮完整中文/英文用户API与迁移运行手册约81kB，逐真实路由/权限/限制/错误/无通用分页，区分站点100k/table导出与PG全库backup、GA4精确窗口、独立最新journal/files/key恢复与CH非canonical。真实本地HTTP/PG文档curl/SSE样例EXIT0，链接及shell语法检查通过；新033至040及第八工作树状态按最新验收边界说明，不把手册交付误写为应用全量完成。项目规格与审计报告仍中文，不等于用户手册缺失。

- README：截图/GIF 占位、一键安装、5 分钟上手、架构图、功能矩阵；docs/：部署、反代、升级、迁移、API、二次开发。

## F-66 upgrade.sh【P0】

- 状态：已实现已测（真实Docker）；增强场景EXIT0
- 实现文件：upgrade.sh；scripts/backup.sh；scripts/restore.sh
- 验收测试：docs/validation-ops.md；scripts/ops-lifecycle-test.sh
- 边界/未实测：恢复点含DB/卷/密钥分离，迁移锁、503/缺镜像/已提交schema回滚旧DB已实际演练；增强独立新卷/严格journal场景通过，完整增强脚本EXIT0，日志 /tmp/baize-ops-fresh-restore.log。

- 流程：升级前自动创建恢复点（DB 快照 + 卷备份）→ 拉新镜像 → 执行编号 SQL 迁移（`pnpm db:migrate`，**迁移锁**防多实例并发）→ 健康检查 → 失败按**恢复步骤**回滚（恢复 DB 快照 + 切回旧镜像）。
- 注意：数据库结构变化后旧程序可能无法读取新数据，**"换回旧镜像"不等于回滚**；必须有兼容矩阵（哪个 APP 版本兼容哪个 schema 版本）、升级前演练文档。"升级不翻车"是目标不是保证，README 如实写（Umami v3 翻车是反面教材）。

## P2 独立验收目标

- P2-01 ClickHouse 明细可选迁移：**严格权威主体已实现并本地验收，规模与新镜像未完成**。025副本/增量混合读取及028历史签名恢复保留；036–049严格权威正文、会话/事实/carry/缓存迁出、精准删除与签名独立恢复已进入main7fbb561，核心guardtrue且每站proof/epoch仍强制。同源空卷494应用与22检查通过，见 [VALIDATION_TENTH.md](VALIDATION_TENTH.md)。严格模式PG保留元数据与受控签名操作状态，不把镜像模式等同权威；5000持续负载正在运行，新生产镜像及独立CH服务器运维验收待，集群灾备与生产SLO不据单节点通过而承诺。旧副本证据见 [ACCEPTANCE_CLICKHOUSE.md](ACCEPTANCE_CLICKHOUSE.md)、[ACCEPTANCE_HISTORY_STORE.md](ACCEPTANCE_HISTORY_STORE.md)。
- P2-02 隐私优先会话回放：**已实现且本地专项验收**。opt-in、服务端严格遮罩、真实 rrweb sandbox player 已测；9cd7 专项进一步验证多 SPA/多标签三页面实例各自完整 snapshot、独立播放/Play/Pause、私密文本不进入播放器与 API、真实 metadata/过滤。证据 tracker-collector.test.ts、tracker-replay-heatmap.test.ts、third-main-tests.json、ACCEPTANCE_WEB.md。复杂真实站点/CSS 还原兼容与更多浏览器未全矩阵实测；当前是保守结构回放，不恢复远端资源或遮罩文本。
- P2-03 热力图：**已实现且本地专项验收**。真实 opt-in 点击/四档滚动、不同页面与 1000/400 CSS 视口独立分桶、敏感 input/select/private 排除、不可变重试计数不增、真实 API 过滤及 SVG 呈现已验。包含 9cd7 全 180 项与 15 项 fresh-E2E；一次异步滚动失败及修正后的重测保留证据。坐标为文档百分比，不使用演示底图或宿主截图；任意复杂响应式/无限滚动、真实站点兼容仍未全矩阵验证。
- P2-04 A/B 实验归因：**已实现且本地专项验收**。真实同意门控、确定性 visitor 分组、实际 SDK 目标→唯一转化访客、停止/继续分配且保留历史与稳定 variant、权限/审计已测。双比例检验/Bonferroni 修正/Wilson 转化率区间和不足样本保护、账号 A→B 删除保留 B/独立日志重放、event_id+ts 幂等、旧无明细历史禁显著性均有真实 PG/浏览器证明，纳入 9cd7 的 180/15。固定周期是统计方法约定，当前不由平台强制锁定结束时间；观察归因不证明真实支付或因果。
- P2-05 微信小程序 SDK：**部分实现；真实微信设备/账号未实测**。wx.request 注入 SDK、无 WebCrypto UUID、同意/幂等重试/每日盐限制已有本地测试；不能把注入传输测试当微信发布/真机验收。
- P2-06 WordPress 插件：**已实现且本地实际运行通过**。官方 WordPress 6.9.4/PHP 8.3.31/MariaDB，真实 ZIP 上传安装、启用/设置/停用/再启用、Chromium→HTTP202→PG→worker 和同意/撤回通过，见 [wordpress-actual-runtime.json](test-evidence/wordpress-actual-runtime.json)。更多主题/CMP/插件冲突未实测。
- P2-07 企业微信扫码 SSO：**连接器本地验收；真实企业未实测**。显式成员映射、一次 state/session、禁止自动提权，真实 PG 模拟 OAuth 测试通过；未创建企业凭据。
- P2-08 多语言 UI：**固定产品文案与高级交互已实现且本地专项验收；跨设备/读屏未全测**。中文与英文核心、高级治理/收入/身份/实验/回放控件已有真实浏览器证据；共享固定错误码安全本地化、导出任务error/last_error、嵌入语言、全部删除确认、AI固定隐私/因果/数据可用性、精确百分比口径及可访问导航/表头/caption均已D3/D4定向实测，不再列为在制。全TSX固定t字面量词典审查无漏项，不代表任意动态JSON/真实设备/读屏完整覆盖。用户内容、模型原文不自动翻译；开发规格与审计报告仍主要中文。新专项不提前纳入第七或下一全量计数，见 [ACCEPTANCE_WEB.md](ACCEPTANCE_WEB.md)。
- P2-09 Ollama 本地模型：**连接器本地验收；真实 Ollama 推理受现有网络阻断未实测**。管理员窄范围内网例外和真实本地HTTP模拟传输通过。实际检查5可用CPU/约29GiB可用内存/4.1GiB磁盘，未装Ollama；官方二进制下载CONNECT被现有代理403拒绝，curl报告56。不是缺账号，不修改网络、不申请凭据；见ollama-runtime-probe.json。
- P2-10 Cookie 同意横幅：**已实现且本地真实浏览器验收**，与 F-50 同功能同证据。独立 tracker-consent.js 构建，真实点击前无 ID/PG 数据、点击后采集及撤回通过 tracker-hooks.test.ts。与 F-50 状态一致；更多真实 CMP/主题组合未实测，不能把核心横幅继续列为未实现。

## 当前未完成与未实测（不与历史验收混合）

| 目标 | 当前状态 | 尚需完成/证明 |
|---|---|---|
| F60可验证问数trace/chart/历史问题 | 已生产接线，033精确多目标/035持久预算/040失效纳入第八377+20；f66f增强多轮发送前失效检查 | 044CH事实读取已纳7fbb561同源494/22；对应旧源当时050–053镜像待；当前19d镜像已PASS，ac新源码镜像未验，真实模型质量未测，不重列既有PG问数为骨架 |
| F46删除AI派生证据与历史答案 | 已纳第八compiled应用377+20；通知旧body清除、预算保留已有实际回归 | 043–049CH正文删除/restore/latest-journal完整runtime已同源494/22本地验收，对应旧源当时050–053镜像待；当前19d镜像已PASS，ac新源码镜像未验；保留旧失败及修复专项，不把第六pre-deletefix计数当新hooks验收 |
| 规模/bounded-session planner | ce/b0严格1000完整窗口完整性通过，性能仍慢 | ef55e12冻结全轮已历史通过；19d97af当前全轮595/30已PASS；b0单次同口径负载已通过、排空P95 6.44秒/最终HTTP7.01秒仍慢；集中大站/持续采集查询删写、资源隔离RSS/lag/SLO仍待，旧1M与旧5000失败保留 |
| P2-01 CH canonical迁移 | 本地已验036/038/039/041/043–048，main7fbb561 guard已true | 同源494应用测试+22 E2E已通过；19d新应用镜像已PASS；ac新源码镜像与新同口径持续负载性能、集群灾备及资源隔离SLO待验证，不将本地通过等同外网部署 |
| F44 P1标准MCP server | 已实现默认注册，官方SDK定向及第七compiled应用验收 | 最新镜像、其他桌面客户端与后两声明协议版未单独测 |
| F52百度官方接口与手动导入 | 官方普通站长公开读取未证实，官方连接器未实现；042自定义模板/列映射已main5b402dd独立11+1验收 | 官方API/授权/数据字典及当前百度原生CSV样本仍待明确；手动导入不替代官方目标、不称原生兼容，旧CONNECT403记录保留 |
| F11/F48/F51/F54/F63、通知/企业SSO/商业AI | 安全连接器本地验收，真实外部未测 | Google/MaxMind/SERP/SMTP/企业WeCom/Server酱等实际账号/许可/交付；不购买或创建生产凭据 |
| P2-09真实Ollama | 资源可行，现有下载网络阻断 | 官方二进制CONNECT403、curl56，未安装/下载模型/真实推理；不是缺账号 |
| P2-05微信小程序、F61 Windows | 本地SDK/脚本存在 | 真机/实际账号与Windows运行，不把Linux/注入传输替代 |
| P2-08跨设备语言与可访问矩阵 | 固定产品/错误/高级控件D3/D4本地实测 | 真实设备、读屏与更多浏览器未全测；用户/模型事实不翻译，动态技术JSON不称全部本地化 |
| CNB定时/最新应用托管 | 223 regular成功；fa3历史托管EXIT1；当前19d97af未运行本轮最终托管 | 全部功能与本地集成收工后由负责人手动执行一次最新源验收，不阶段同步触发；cron/最终托管实际结果另验，旧18E2E不替代最新源本地/托管结果 |
| 真实站点兼容矩阵 | 部分 | 回放CSS/复杂响应式/无限滚动、各设备/浏览器、WP主题/CMP组合；已有真实WP/consent验收保留 |

本集中段以顶栏冻结结果为当前状态：f4 Docker生命周期及b7独立native恢复已通过，不继续统称所有新镜像/恢复未运行；050–053最新镜像仍待。原规格要求不删减；外部账号/模型/设备未测与自主性能/最新源验收分别列明。

- **已实现且本地证明**：9cd7 精确索引 lint/type/build、180 应用测试和 15 fresh-E2E 通过；收入趋势/归因专页、事件时间身份/明确跨设备注册→正收入专页、回放/响应式热图/A/B 专项、WordPress 实际运行与 Cookie 横幅均有对应本地证据，不再列为待实现。新 f8dc Docker 170 条源码 hash、25 条迁移与完整生命周期 EXIT0；该矩阵不代表新增 Docker-Chromium 或真实外部账户验收。
- **历史第四批（保留版本证据，不作为当前剩余项）**：F29完整会话流失特征/API/UI、F30成熟期留存与缺口诚实标记、F22完整实时Top与SSE更新、38张表安全全站导出、稳定中英错误、明确白名单跨子域身份与撤回、真实本地SEO整改复检均纳入66文件237测试与fresh18E2E通过。025增量CH副本/PG尾部混合读取已测；不能称PG-only或全面P2迁移。第四新镜像bf77完整生命周期实际EXIT0，28迁移含025/026/027，189镜像hash一致；最新单连接错误分支与邀请原子审计040b27e另有7文件37回归、fresh邀请E2E1项通过，不在bf77镜像，已由后续第五c610镜像覆盖；028历史复制/恢复与应用删除/权限/journal闭环现纳入第五272/19本地验收；仍非PG-only。
- **持续后台性能已有限实测，仍非资源/SLO承诺**：100k/1M PG-only顺序链路证据保留，百万40站先采集后聚合，不能称实时负载。旧9cd7真实分区维护40P01已防御修复并真实PG回归；912单站10k EXIT0、四站20k暴露调度饥饿及最终查询采样缺陷（失败保留），027公平调度后不可变77d5f615四站20k持续后台采集+查询 EXIT0，每站水位在写入期间前进、最终PG/HTTP/outbox一致。发布水位滞后p95 8.836秒、Node峰值约791MiB；共享主机、非1C2G隔离，无实时SLO承诺。详见 [validation-continuous-scale.md](validation-continuous-scale.md)。Windows安装在Linux未运行，更多真实设备/CMP/复杂站点组合未全验。
- **真实外部未实测**：Google GA4/GSC、MaxMind 授权下载及地域准确率、SerpAPI/DataForSEO、SMTP/企业微信/Server酱、企业 SSO、商业 AI；真实Ollama属于本地自托管、无账号要求，官方工具下载被现有代理403阻断（资源探针单列）；安全连接器、模拟集成及本地 HTTP 返回不替代外部账号验收。F52父线程已核验公开产品说明，但普通站长公开搜索分析读取API仍未证实；此前官方首页CONNECT403未到origin记录保留，并非百度拒绝或无API证明；当前CSV原生兼容无样本；证据见 [BAIDU_API_FEASIBILITY.md](BAIDU_API_FEASIBILITY.md)。不杜撰端点、不以 SERP/referrer 替代、不购买或创建生产凭据。
- **远端/发布边界**：GitHub托管CI因账号计费/额度在执行前阻断，尚未运行；CNB私有镜像bootstrap普通push已由父验证，cron已注册但精确事件密钥鉴权失败未重试；885e4e8同网络修复及223e887按钮已推送，9本地Git分支通过，父已验证223e887托管cnb-bnd-1k4igl82q EXIT0、18E2E；最新fa3托管已经实际运行但EXIT1，夹具隔离/重复镜像修复后仍须真实重跑；按钮渲染/cron成功仍待实际证明。GitHubActions已停用归档，无启用/重跑。本地命令通过不代表托管run。仓库保持私有，未外网部署、不改其他仓库。
- **实现与规模偏差持续披露**：exact 访客集合代替 HLL、持久 PG 任务代替 BullMQ、部分精确时间/过滤查询重建保留明细。正确性已本地测试，但事件内存/吞吐、持续混合写删、超保留边界、CH 128 MiB 源预算和大站增量设计仍需继续验收。

25×100 + 1×10000 的真实不等样本 p75 缺陷已按 weighted-centroid Type7 修复，collector→worker→stats 与尾部/6 点专项已纳入 9cd7 的 180 测试通过；t-digest 质心均值仍为近似分位方法，不宣称任意分布精确分位或用每日 p75 平均替代合并。

以下为历史实现快照，所述activation false/待全量仅对应当时源码；现在核心guard true及严格闭环已由后续7f/10eb证明，不据当前状态改写旧计数。

本轮新增定向边界（非第五/第六总数）：G2 canonical治理与默认PG回归5文件37PASS，D2 canonical-export2PASS；共享dailyUV规范facts→实际nativeHTTP独立1PASS。032/033/034、metadata-only replay与同client authority读取是目标切片，activation仍false，不能据专项声称全面canonical切换。混合rrweb record物理替换/ACK/故障恢复/journal重放已由tracker/ops真实PG/CH专项3PASS；原生canonical浏览器与新不可变全量仍待验收，不能把PG索引隐藏说成擦除。标准MCP4项官方SDK定向与AI trace24PG也不能加到旧272/289，第七完整compiled应用318/20已有独立证据；这些后续切片不能预称第八通过。

第七分阶段结果更新（root确认，SHA已保存fa3e828）：frozen /tmp/baize-seventh-final.1kMovb 的84unit+234integration=318PASS，compiled入口/build/type/lint通过；复用已通过318后correctenv freshschema20E2E=18浏览器+2date PASS50.8s。sharedregular原命令EXIT1缺浏览器路径，resumed首次18PASS2FAIL因未export TEST_DATABASE_URL，均保留，不描述为单次sharedregularEXIT0。033/034/035及A4/C4是下一批工作树定向切片，不属于该318/20或本次main交付。

第七已保存main里程碑：`fa3e82873d9b9e3cb1b139fbea3db9c742995a48`（root已推送，当前只读git log核验）。对应root上述分阶段318PASS+correctenv20PASS，不表示单次sharedregular EXIT0；037回放保留/proof及033/034/035/036/040等后续工作树切片不提前算入该提交或上述计数。

#### 历史048缓存隐私与站点导出定向闭环（当时工作树快照）

| 范围 | 当前实际结果 | 仍不可外推的边界 |
| --- | --- | --- |
| 048个人删除及changedfalse journal重放 | C真实strict native 1PASS/0skip；全部CH缓存attempt物理0、PG owner/pointer0，B worker仍PV3/UV1/coverage1 | 新独立目标operator restore与root统一冻结应用/浏览器/镜像另行验收；生产guard未放松 |
| strict小时/日fullsite facts导出 | 从认证published effects派生hour/站点日历日键，44/47精确投影；C native导出PV3、无A，空PG兼容槽不当零 | 不能相加桶UV；未知legacy范围仍coverage0，单表100k上限不变 |
| page_vitals导出 | 真实collector21样本→发布→sameclient cursor/TEMP读取，2×100+19×500原加权centroids/sample_count通过 | 此不等样本专项为PG链路；不把它说成C native fixture已含同一组vitals或外部账号验收 |
| legacy热图隐私负覆盖 | 实际C native保留negative flag；export JSON省略表（没有[]假零），manifest coverage0/reason | 不能借当前V2显示隐藏已删除旧正文；不可恢复旧baseline不宣称完整、无需购买账号但仍有范围限制 |
| 048 standalone适配 | 原owner/producer seal、zero markers、pointer/coverage/negative metadata；独立PG/CH adapter定向通过 | signed outer包/最新journal完整目标恢复须F/B结果，adapter测试不能替代operator入口 |

上述等待统一源描述属于当时历史快照；后续7f与10eb完整冻结结果见顶栏。源码边界与所有初次失败/修复证据见[ACCEPTANCE_CANONICAL_GOVERNANCE.md](ACCEPTANCE_CANONICAL_GOVERNANCE.md)。本节不增加第八377+20全量计数；/tmp/baize-cache-privacy-closed.json及快照SHA manifest为新定向证据，等待root新同源全套。

本轮最终冻结前补记：pre-014 未受控 daily 明细的未知拓扑不制造038/041证明；旧安全report/export保留及当前native collector正常已有专项，不能概括为所有旧PG停用。此条为前一冻结历史边界；现在3e052d8最新同源491+22已验收、guardtrue。048已认证V2 hour/day精确重建小专项通过，独立strict restore最后控制行readiness已于16:26:59实际3文件3PASS闭合，未知legacy/非零heatmap负coverage不清除。CNB自动同步、触发、定时均暂停；上述历史托管成功/失败记录保留，未执行本轮新托管，不以暂停状态假称当前通过。


历史第九不可变本地验收：`3e052d816c48a701fb82ce137436c30a770cf080`，全新测试专属 PG17/CH25.8/Redis7 Compose 空卷，`validate-local-final.sh` EXIT0 并清理。100 单元 +391 集成=491 PASS，0失败/0跳过；22 E2E 中20 Chromium真实浏览器+2日期函数全部通过。证据：[main-3e052d8-local-final.json](test-evidence/main-3e052d8-local-final.json)。主线核心激活 guard 已true，但每站证明/删除/水位屏障仍强制。D1000严格CH完整性通过，查询p95 9.41秒、水位滞后p95 63.71秒，不满足性能SLO；5000及新应用镜像尚待，不标完成。保留全部旧失败；本轮未运行CNB托管，自动触发仍暂停。


最新更新为[第十不可变验收](VALIDATION_TENTH.md)：7fbb5612cee6121df23425ff14274316e43a4bca，100unit/27files+394integration/145files=494PASS0fail0skip；22E2E=20Chromium+2date全部通过。freshCompose sharedEXIT0、cleanupcomplete；build/lint/type/SDK/freshmigration/compiledentry/journal全部0。收入回执/rawproof/049+保留期窄修闭合。旧3e491/22与701真实失败不修改；新镜像待、5000运行中、托管父最终待，不阶段触发。

19d97af 完整原始日志：`/tmp/baize-19d97af-local-final.log`；完整报告目录：`/tmp/baize-final-local.5Mr38r`，持久 evidence/photos 由负责人保存。不把191+404应用计数与30检查混成浏览器数量，不将历史专项加到595。19d97af镜像已实际EXIT0；该源1000 PASS、5000因9批未发送FAIL；后续ac86cd3新1000已PASS、5000实际FAIL，browser仍在运行，ac最新镜像未运行，托管保持不触发；旧性能FAIL保留，完整性通过不等于SLO。

## 19d97af 镜像与负载后续证据

19d97af 新镜像真实生命周期 EXIT0，证据已随 `0eb5e0c` 入仓：[镜像结果](test-evidence/main-19d97af-image-result.json)。55条 DDL、054两个索引安装、独立 signed restore、source unchanged 与 owned cleanup 均实际验证。该镜像只证明19d97af，不包括后续 TEMP 投影源码。

19d97af 独立严格1000总体PASS，最终完整查询 **6.058秒**；严格5000总体 **FAIL**：计划100批中9批未发送，仅4550 accepted（91批HTTP202），不能称5000完成。已接受事件六项strict完整性断言与全部排空通过，最终查询 **25.626秒**；这是4550可靠处理证据，不是5000/SLO达标。原 [5000 JSON](test-evidence/main-19d97af-independent-strict-5000.json) 与 [总结](test-evidence/main-19d97af-independent-summary.md) 随 `4a05fa2` 保留，旧负载FAIL不删除。

后续 `ac86cd3` TEMP投影有源码摘要绑定的14真实集成+2单元专项PASS；19d97af的191/404/30完整计数与镜像不外推为ac全轮或ac镜像通过。该句为当时历史状态；ac随后1000实际PASS5.316秒、5000实际FAIL（4800accepted/4unsent/42delayed/drain超时/final断言失败），当前ac browser专项30检查已PASS。真实外部未测及托管不触发规则保持，本段不新增功能范围。

## 历史0f14源码与ac投影边界

当前验收按各不可变源码分别记录，不将后续提交自动视为同源通过。最新已完成完整冻结仍为19d97af：191单元+404真实集成=595 PASS，30检查（28真实Chromium+2日期）全PASS；其生产镜像55条DDL、054两个索引、独立signed restore/source unchanged/cleanup实际EXIT0。此证据不外推后续源码。ac86cd3 TEMP投影只有源码摘要绑定14真实集成+2单元专项PASS；其独立1000 PASS、最终HTTP5.316秒，5000总体FAIL：4800accepted、4unsent、42delayed、drain超时且final断言失败。ac源码浏览器实际30检查（28Chromium+2日期）PASS/0skip，96.441秒、EXIT0，不称ac完整整轮或镜像通过。旧FAIL和外部未测保留，托管不触发。

现有保护为单请求timeout、完整EOF、正文caps、每批100行精确归属oracle及站点/删除fences。B/C整操作SELECT次数、decoded bytes、deadline预算及服务器/适配器失败关闭已实作，并由de专项13真实+17单元验证；最新完整整轮和镜像尚未运行。预算限制不等于性能改善，该自主欠项不需要新增凭据，不归类为外部账号阻塞。

人工日期标注趋势切片已保存aea2ece、4单元通过，真实浏览器待新冻结，属于自主验收待完成，不是外部凭据阻塞。GSC不扩第二stage；Ollama未测原因是官方工具下载网络阻断，Windows是执行器启动错误，Google/SERP/商业模型等另为真实外部账号/服务未测，三类原因不混合。

冻结补记：ac86cd3浏览器30检查（28真实Chromium+2日期）实际PASS/0skip，96.441秒、EXIT0；其191/404完整后端全轮未复验，不叠加旧19计数。当前4384后续预算切片尚未全量通过；该当时服务器行为3项是历史专项；后续de整操作/服务器/适配器真实13项已通过，完整新冻结仍待。aea2ece日期标记4单元PASS、浏览器未跑。预算口径为SELECT次数/decoded bytes/deadline，不承诺scan或heap限制。原FAIL全部保留。

## 历史de7222e有限代码缺口实施状态

当前main已推 `de7222edfd6baa7478a4e32e22f6b5399fc34daf`：整操作预算及显式SELECT失败关闭已实作，真实专项13项（9 PG/CH+4服务器/适配器）PASS/0skip，单元17项PASS；root16项是其子集，不重复累加。预算限制SELECT次数、decoded bytes与deadline，不保证扫描行数、heap峰值或性能提升。aea2ece人工日期标记已接趋势、4单元PASS，浏览器仍待新冻结。de新完整空库/浏览器/镜像正在准备，不能称已过；19与ac历史证据及所有旧FAIL保留，托管不触发。

当前de完整冻结验收已开始：209单元PASS；集成仍运行，已知 `clickhouse.test.ts:145` 旧mirror统计source回归失败，最终集成summary待负责人提供。原断言不降低，C按既定同client mirror/hybrid统计scope修复、A独立max1回归；不是扩新功能。此前13真实定向及17单元通过不抵消本轮真实失败。浏览器/镜像阶段尚未到达，不记全轮PASS，旧失败证据保持。

### de原冻结实际结束（84979，失败保留）

原完整冻结已EXIT1并完成Compose cleanup：54文件209单元PASS；154集成文件中153文件PASS/1文件FAIL，417检查中415PASS/2FAIL。两项均为clickhouse统计来源回归：首项过滤读取来源应全CH的断言失败，另项Redis来源期望CH却得到PG；同新增stats snapshot regression范围。浏览器与镜像NOT RUN。此前13定向通过不覆盖原失败，F保留原报告。C同client mirror/hybrid stats scope窄修、A新增4项及原文件实际回归正在运行；后续正常提交及新不可变全轮尚待，不提前改写这次EXIT1。

统计来源窄修定向实际通过：新增max1 stats-replica4项+原完整clickhouse.test16项=20 PASS/0FAIL/0SKIP，Redis启用，原55/153来源断言未改。precommit WIP摘要见 `docs/test-evidence/stats-replica-validation-record.json`（相对仓库根）。这20项不冲销de原209单元/415集成通过/2FAIL，也不累加全球计数；新不可变完整空库/浏览器/镜像仍待。文档当前冻结回交，旧FAIL报告保留。

当前c890冻结已结束，完整入口EXIT1、cleanup完成：55文件211单元+155文件421真实集成全部PASS/0skip=632应用通过；30浏览器检查29PASS/1FAIL（27真实Chromium+2日期通过），operations Chromium因固定x58画布点击点未命中失败，UI证明不完整。原FAIL保留，不能称全轮通过。root仅测试夹具1c1cb65按实际趋势/canvas几何窄修，焦点、PV、时区断言未降低；下一步同应用源码定向浏览器复验，不重复已过后端。新1c（含Compose预算配置前向传递）的镜像及性能仍待，不将632加旧源计数，托管不触发。

## 历史c890/1c分阶段记录（当前结果见顶栏）

| 源/阶段 | 实际结果 | 边界 |
|---|---|---|
| c890后端冻结 | 55文件211单元+155文件421真实集成=632 PASS/0skip | 已实际执行；不称1c重跑后端 |
| c890首轮浏览器 | 30检查29PASS/1FAIL，整轮EXIT1/cleanup | 原画布固定点失败保留 |
| 1c1cb65浏览器复验 | 30检查=28真实Chromium+2日期全部PASS/0skip，92.6437秒、EXIT0/cleanup | src/db/packages与c890应用源码一致已核；operations单项1PASS10.333秒是子集，不累计 |

有限两项实现缺口已本地闭合：日期标记真实canvas/键盘/时区/权限及PV1断言通过；累计SELECT次数/decoded bytes/deadline预算已由13定向（9PGCH+4服务器/适配器）及同应用632后端证明。限制预算不保证scan/heap或性能SLO。de417中的2FAIL及c890首轮浏览器1FAIL原记录保留，不改写历史EXIT1。

最新1c应用镜像（含cdbenvforward）与独立负载仍待，负责人下一步串行镜像验收；19镜像与ac负载证据不外推此源。托管不触发，真实外部未测边界保持。

1c最终固定负载：1000 PASS、最终HTTP5120ms；5000总体FAIL：4900accepted、2unsent、39delayed、queryfail0，drainReached=false且120秒deadline，剩余积压1350/最大3250。最终查询25.389秒FAIL、assertionsExecuted=[]，不得声称六完整性断言已过。Node峰730509312字节不含数据库，source unchanged且4项cleanup全true；没有预算拒绝。已通过代码功能/浏览器/镜像不等于关闭此本地性能欠项，不据此称提速/SLO。归档证据为 docs/test-evidence/main-1c1cb65-independent-strict-5000.json 及配套record；原FAIL保留。

0a0c171包含三批候选及idlefatal修复。第四轮实际19/19 PASS（11budget+4server+3triple+1strictrestore）、0skip/0uncaught，另10单元/type/lint通过；这是提交前源码摘要绑定定向证明，不是新全局计数。原前三轮FAIL及bd完整EXIT1全部保留。0a新完整空库、镜像和固定负载正在准备，不预写通过；旧c890632、1c30/image、1c1000PASS/5000FAIL各按原源码阶段保留，不外推0a。

## 历史前次状态入口（原记录保留）

## 当前验收入口（唯一当前表）

最新本地主干d67bb8a已保存，正常Git push权限当前不可用，不创建token。只在同run effects/vitals均为complete CH时省identity TEMP写，混源保持原路径；type/lint、新2+旧18=20受影响真实集成及217单元PASS/0skip。20是部分集成，不与旧426累加；217首次215PASS/2旧mockFAIL保留，随后仅修形状不降断言。d67新whole/image/load等待串行验收，最新已过完整全轮仍是661641+30；不推断提速。原镜像ENOSPC FAIL及精确自有旧cache清理/targethealthy EXIT0仅诊断恢复，native未跑，不称镜像生命周期通过。
d67整轮实际EXIT1/cleanup：645后端（217单元+428集成）ALL PASS；浏览器29PASS/1FAIL，protected share只读提示未找到、实际HTTP503“统计快照已改变请重试”，D正在诊断竞态，不称全passed。新完整镜像/负载待。父已核远端e441；local e441..d67 Gitbundle及tracked-source tar保存在/workspace/baize-checkpoints，bundleverify0且排runtime，不创建新凭据。

| 源/阶段 | 实际证据与边界 |
|---|---|
| 66150be正式全轮 | actualEXIT0/cleanup：55文件215单元+156文件426真实集成=641PASS/0skip/0unhandled；30E2E（28真实Chromium+2日期）全部PASS，约1.5分钟；lint/type/SDK/journal/build/migrate/compiledentry全部PASS |
| 66150be固定负载 | 1000PASS，finalHTTP5.047623651秒；5000整体FAIL：4350accepted/13unsent/35delayed、drainfalse120秒；已接受4350最终PV4350/coverage1/sourceCH，六完整性断言PASS，finalHTTP21.102973929秒；不是5000或SLO通过 |
| 最新镜像/远端状态 | 新镜像尚未完成；本地HEAD e441存在，HTTPS认证失败导致push尚未确认，不操作Git或托管 |
| 66150be独立静态/单元 | type/lint/215单元PASS，不代替正式全轮结果 |
| 0a提交前摘要绑定专项 | 19真实定向PASS，仅对应precommit源码摘要，不是全局计数 |
| c890后端（历史源） | 211单元+421真实集成=632PASS，未外推661 |
| 1c1cb65浏览器/镜像（历史源） | 30检查=28Chromium+2日期PASS；镜像EXIT0，均绑定1c非661 |
| 1c1cb65固定负载（历史源） | 1000PASS，5000FAIL，不称SLO达标或661结果 |

托管不触发。以下更新段全部是明确SHA对应的历史阶段原文：其中“当前/最新”仅指各历史时点，不构成另一个当前入口。bd未捕错误、0a类型FAIL、测试WIP两FAIL、1c负载FAIL及所有原来源完整保留。
