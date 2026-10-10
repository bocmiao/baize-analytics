# 白泽 Analytics 第二轮产品差异化研究

核查日期：2026-10-10。目的：在现有开发验收收尾后，为单人维护的 TypeScript、AGPL 免费自托管产品选择下一批可落地改进。研究范围为公开官网、官方文档、官方 GitHub，以及获授权只读的白泽代码；没有注册竞品账号、改变仓库、触发 CI 或完成竞品运行验收。

## 结论

优先把“采集是否接通、数字为什么这样、下次如何复用”做完整。白泽已经实现较宽的分析、SEO、BYOK AI 功能，继续增加漏斗、热图、MCP 等同名模块不是本轮有效结论。

建议按以下顺序做 5 项小切片。优先级与维护成本是本报告的判断，不是已测工期。

| 优先级 | 建议 | 真正新增的部分 | 单人维护判断 |
|---|---|---|---|
| P0 | 首次接入状态检查 | 从复制代码走到确认收到数据、确认报表可用；无数据时给明确下一步 | 高收益，低至中成本；先复用已有元数据，不远程执行网页 |
| P0 | 流量过滤诊断 | 已有 Bot 决策理由转成隐私安全的聚合解释，区分请求数和事件数 | 高收益，中成本；不新增指纹、IP 库或机器学习反作弊 |
| P1 | 保存并重用完整筛选 | 修正“保存当前筛选”实际只保存 path/channel 的不一致；复用报表 DSL | 高收益，低至中成本；先保存已有 7 个条件，再考虑扩充算子 |
| P1 | 图表变更标注 | 把发布、活动、故障时间放到趋势上，区分用户备注和测量事实 | 中高收益，低至中成本；避免自动因果归因 |
| P1 | 自托管诊断摘要 | 将现有健康、聚合、存储、保留、备份证明状态集中为管理员可读检查与脱敏文件 | 高收益，中成本；做只读体检，不另建运维平台 |

定位建议：中文优先的免费自托管分析工具，能解释采集与统计边界，并把 SEO 和 AI 建议接到可复核证据。此定位是白泽现有能力组合的产品推断；不声称市场唯一，也不声称“竞品没有 AI”。

## 证据强度和快照

- **已验证（文档/源码）**：本次实际读到的一手资料明确说明，或源码中可定位。它不等于本次运行实测通过。
- **推断**：从已验证材料导出的用户价值、实现建议或成本判断。
- **未核**：需要账号、部署版本、实际运行或进一步证据才能成立。找不到公开资料不等于没有该功能。
- 白泽读取基线是 main `f4dbbccb4ba4e37c40bb0a7d68265d3b32d44030`，提交时间 2026-10-10 18:14:54 UTC。后续若 main 变化，实施者应先对照差异。研究没有把 README 中历史测试数重新记作本次测试。
- Rybbit 版本辨析补充核到 master `bc23257db96a41051b4ea2a9f5f4d3ed45d40ac2`，提交时间 2026-10-09 05:54:41 UTC；Umami 参考官方 v3.4.0 发布和当前文档。Plausible Cloud 文档不自动适用于 CE。

## 白泽现有能力基线

以下均应保留，不能改写成“需要从零开发”：

| 范围 | 已有证据 | 本轮增量界限 |
|---|---|---|
| 基础与高级分析 | 实现清单列明 PV/UV/会话、UTM、来源、目标、漏斗、留存、路径、下载、404、Web Vitals；回放、热图、实验也已有本地验收 | 不新增同名模块，不把复杂站点兼容未测说成无功能 |
| 首次向导 | `Auth` 完成管理员→站点→追踪代码，`Snippet` 支持复制和同意提示 | 缺的是向导后“确实接通”的闭环，而不是安装器或建站向导 |
| 筛选与报表 | 全局 path/channel/5 个 UTM 字段已影响真实查询、比较和缓存；保存报表已有 CRUD/运行/推送 | 增量是完整保存、重用与一致显示；不另外造一套相同分群数据库 |
| 过滤与告警 | 已有 UA/请求突发 Bot 过滤、内部 IP/CIDR 排除、流量/目标/漏斗告警、24h 脚本掉线检查 | 增量是诊断可见性；不把过滤器、离线告警推荐成新功能 |
| 数据可信边界 | 已展示 watermark、coverage、部分范围不可用、每日盐跨日限制、查询核验来源；GA4 历史与本地口径分开 | 只改善解释和操作路径，不重复造“来源徽章” |
| AI | BYOK、预算、typed 只读查询、实际工具 trace、确定性图表、历史答案、建议复检、权限/删除失效已有实现 | 真实提供方账号与模型质量尚有未测边界；新标注若传给模型必须保持来源区分和现有授权 |
| 自托管与隐私 | install/upgrade、备份恢复、独立删除日志、密钥分离、保留策略、可选/严格 CH 路径已有实现和分阶段证据 | 增量是可读的只读运维体检；不重建备份或绕过验证门槛 |

基线来源：[README](https://github.com/bocmiao/baize-analytics/blob/f4dbbccb4ba4e37c40bb0a7d68265d3b32d44030/README.md)、[逐项实现与验收清单](https://github.com/bocmiao/baize-analytics/blob/f4dbbccb4ba4e37c40bb0a7d68265d3b32d44030/docs/IMPLEMENTATION_CHECKLIST.md)、[API 手册](https://github.com/bocmiao/baize-analytics/blob/f4dbbccb4ba4e37c40bb0a7d68265d3b32d44030/docs/api.md)。

## 六家竞品对照

此表只列与本轮决策直接相关的特征，不是全功能评分或性能排名。

| 产品与核查范围 | 接入与排障 | 筛选与解释 | 自托管边界 | 对白泽的意义 |
|---|---|---|---|---|
| 51LA 当前官网与 V6 帮助 | V6 帮助提供代码成功检查与首次有数说明 | V6 有实时、来路、页面、日期对比、指标释义；当前官网已有 AI 助手宣传 | 官网多个服务应分别核，不把独立 SEO/性能工具算为 V6 内建 | 中文低门槛和 AI 都不能单独作为差异化；接入反馈应更清楚 |
| 百度统计当前帮助 | 代码检查、统计助手与手动核验 | 实时访客多维筛选、过滤规则、指标说明；营销版能力需单列 | 本次未核到免费可下载自托管版本，不据此证明不存在其他商业部署 | 借鉴排障和过滤解释；不要照搬推广版广告屏蔽 |
| Umami 当前文档与 v3.4.0 | 指导埋码后访问网站、检查网络请求；SPA 自动导航追踪 | 通用过滤、AND/OR 与排除等算子、保存 segments；3.4 有图表标注和只读 MCP | v3.4 官方开源发布明确包含这些新增；某些网站功能页仍需逐项看版本 | 用完整保存和一键重用补体验缺口；“MCP 独有”不成立 |
| Plausible Cloud 与 CE 分开 | Cloud 文档描述自动安装检查横幅、测试流量不进正式数据、失败重试/手动检查 | Cloud 有过滤/segments/标注，且详细解释丢弃请求与口径差异 | CE 官方明确不含 marketing funnels、user journeys、revenue goals、SSO、sites API；Bot 过滤比 Cloud 基础 | 借鉴状态和解释机制；不能从 Cloud 功能页推 CE 支持 |
| Rybbit 当前官网与官方源码 | 详细覆盖 CSP、错误 site ID、属性被优化器删除、SPA 延迟、过滤规则排查 | 可重用 segments；Bot 独立记录检测层；明示 JS 看不到不执行 JS 的爬虫 | 对照 MDX 显示 Web Vitals 自托管可用，GSC 需 OAuth env；README 仍留 Cloud only 口径 | 不以单一 README 判断当前自托管缺失；借鉴检测理由可见性 |
| Matomo 当前文档与 On-Premise | 明确分开真实实时采集和归档报表延迟；System Check 可复制/下载 | 保存分群、AND/OR、TEST、自动提示；自托管可预处理减轻查询负担 | 免费 Core 与付费 Premium plugins/Cloud 分开，不能把热图、漏斗等一概记作免费 Core | 学习只读诊断和范围解释，避免引入单人难维护的预处理分群平台 |

### 51LA 与百度统计的一手证据

**51LA（已验证公开说明，未登录实测）：**

- 当前[官网](https://www.51.la/)和[资讯](https://www.51.la/info)已宣传“AI智能助手全新上线”和智能问数，包含流量问答与指标/用法解释；账号覆盖、价格额度及 BYOK 是否支持未核。因此不能以“竞品没有 AI 问数”为依据。
- 官网分别列出 V6、旧 V5 入口、灵雀、SEO 查询助手、小程序和 APP 等服务；`web.51.la` 本次访问重定向 V6。独立入口不是 V6 内建能力证据；所谓 A5 或其他新版统计的独立能力本次未核。[官网](https://www.51.la/)、[旧 web 入口](https://web.51.la/)、[灵雀](https://perf.51.la/)、[APP 统计](https://app.51.la/download)。
- V6 [参数设置](https://v6.51.la/help-doc/doc/ggktml.html)已有“代码安装检测/开始检测”；[安装检查](https://v6.51.la/help-doc/doc/nnvdii.html)还指导查看 SDK 与 collect 请求、Referer/Origin。白泽补闭环属于追平并改善可解释性，不能宣传51LA完全没有接入检测。
- [快速上手](https://v6.51.la/help-doc/)写首次有数约 5 分钟，参数页则写约 1 分钟，[FAQ](https://v6.51.la/help-doc/doc/ta941g.html)承认已有数据但检测状态可能滞后；[实时文档](https://v6.51.la/help-doc/doc/yte27g.html)说明 5/15/30 分钟窗口、每 5 秒刷新并提示凌晨处理峰值可能短暂零值。它们分别是首次等待、检测状态与刷新频率，不是可互换的生产延迟 SLA。
- [IP 过滤](https://v6.51.la/help-doc/doc/usuc46.html)规则只影响添加后的数据；[指标释义](https://v6.51.la/help-doc/doc/oggv2l.html)已有 PV/UV/会话/跳出率定义；[蜘蛛统计](https://v6.51.la/help-doc/doc/zxfdvo.html)限定能观察到的爬虫。不同官方页的识别率宣传不一致，本报告不采用精度百分比。

**百度统计（已验证当前可访问帮助，未登录实测）：**

- [统计助手](https://tongji.baidu.com/web/help/article?id=317&type=0)与[安装常见问题](https://tongji.baidu.com/web/help/article?id=348&type=0)有站点 ID、请求日志和代码检测说明；助手不覆盖 iframe 内请求，帮助页区分配置更新等待与实时核验。
- [实时访客](https://tongji.baidu.com/web/help/article?id=139&type=0)已有来源、设备、地域、时间、新老访客、频次、深度、时长筛选；[明细边界说明](https://tongji.baidu.com/web/help/article?id=351&type=0)列基础版最近 14 天/5000 条限制，历史明细与异常访客广告屏蔽有推广版范围。不能用分析云或推广版反推基础版权益。
- 广告屏蔽不是拦截网站访问，也不自动删除统计；排除统计需过滤规则。[推广屏蔽说明](https://tongji.baidu.com/web/help/article?id=351&type=0)。[盗用代码排查](https://tongji.baidu.com/web/help/article?id=348&type=0)另介绍域名/IP/白名单过滤。白泽无需复制广告投放业务。
- [报告时效](https://tongji.baidu.com/web/help/article?id=126&type=0)区分实时与其他报告，但无清晰更新日期，不当作实测 SLA；[分析云说明](https://tongji.baidu.com/web/help/article?id=343&type=0)有分群，不能混为所有统计账号的普通筛选。
- [下载和定时发送](https://tongji.baidu.com/web/help/article?id=128&type=0)、[SEO 检查](https://tongji.baidu.com/web/help/article?id=108&type=0)已有官方功能说明。当前账号权限未实测，但足以否定“百度没有报告/SEO”的笼统竞争结论。

### 外文竞品一手证据

- Umami：[Collect data](https://docs.umami.is/docs/collect-data)、[Filters](https://docs.umami.is/docs/filters)、[Segments](https://docs.umami.is/docs/segments)、[Annotations](https://docs.umami.is/docs/annotations)、[v3.4.0 官方发布](https://github.com/umami-software/umami/releases/tag/v3.4.0)。其过滤文档明确已有 All/Any、等于/排除/包含/正则等；保存 segment 是条件集合的复用。v3.4 发布确认标注、MCP、API key 与 session property filters，不依赖第三方评测。
- Plausible：[接入排障](https://plausible.io/docs/troubleshoot-integration)、[Cloud/CE 官方区分](https://plausible.io/self-hosted-web-analytics)。前者是当前 Cloud 产品体验证据，不据此宣称所有 CE 标签均有自动浏览器检测；后者明确维护责任、半年级 CE 长期发行和收费功能边界。
- Rybbit：[脚本排障](https://rybbit.com/docs/script-troubleshooting)、[Bot detection](https://rybbit.com/docs/bot-detection)、[Segments](https://rybbit.com/docs/segments)、[Self-hosted vs Cloud](https://rybbit.com/docs/self-host-vs-cloud)。Bot 文档明确“多层可同时命中”，各层计数相加可能超过总数；无 JS 爬虫需服务器/边缘上报，不能从 JS Bot 面板推出完整爬虫覆盖。
- Matomo：[确认追踪是否正常](https://matomo.org/faq/reports/check-matomo-is-tracking/)、[自定义分群](https://matomo.org/faq/reporting-tools/build-custom-segments-in-matomo/)、[复制系统诊断](https://matomo.org/faq/troubleshooting/how-do-i-find-and-copy-the-system-check-in-matomo-on-premise/)、[On-Premise Premium 说明](https://matomo.org/blog/2023/11/discovering-our-premium-on-premise-features/)。Matomo 的原始采集与归档区分适合白泽事件→outbox→聚合链路，但不代表应复制 PHP/cron 架构。

### Rybbit Web Vitals 口径纠正

不能直接写成“Rybbit Web Vitals 仅云端”。当前官方[对照文档源码](https://github.com/rybbit-io/rybbit/blob/bc23257db96a41051b4ea2a9f5f4d3ed45d40ac2/docs/content/docs/%28docs%29/self-host-vs-cloud.mdx)对自托管打勾；[DisabledOverlay](https://github.com/rybbit-io/rybbit/blob/bc23257db96a41051b4ea2a9f5f4d3ed45d40ac2/client/src/components/DisabledOverlay.tsx)在非 Cloud 返回未禁用；[EnableWebVitals](https://github.com/rybbit-io/rybbit/blob/bc23257db96a41051b4ea2a9f5f4d3ed45d40ac2/client/src/app/%5Bsite%5D/performance/components/EnableWebVitals.tsx)可设置 webVitals；[后端配置生命周期](https://github.com/rybbit-io/rybbit/blob/bc23257db96a41051b4ea2a9f5f4d3ed45d40ac2/server/src/services/sites/siteConfigurationLifecycle.ts)区分 Cloud 计费并允许该配置字段。结论是“当前文档和源码支持自托管可启用”，并保留 README 遗留 Cloud only 标签、具体发行/默认界面和运行未核的边界。白泽已有 Web Vitals，本轮不因该比较新增实现。

## 建议一 首次接入状态检查

### 依据与真实差距

已验证：白泽 [main.tsx 的 Auth 与 Snippet](https://github.com/bocmiao/baize-analytics/blob/f4dbbccb4ba4e37c40bb0a7d68265d3b32d44030/src/web/main.tsx#L49-L95)第三步只有代码、复制按钮、同意提示和“进入看板”。同文件通用空态把无数据统一解释为安装后等待。`collect.ts` 已维护 `sites.last_event_at`，聚合也已有 generation/processed_generation/watermark，因此不需要新建分析链路才能给接入反馈。

竞品依据：Plausible Cloud 提供明确的安装核验状态；Umami、Rybbit、Matomo 都有安装后真实请求检查步骤。推断：首次使用者最需要知道自己是未收到事件、已收到但在处理，还是查询范围不对。

### 最小实现

1. 新增站点级只读状态接口，或扩展已有授权站点详情，返回 `observedAt`、`lastAcceptedAt`、聚合是否有 pending、当前发布水位和可解释状态。先只读现有行与索引，不扫描整站事件，不以 `MAX(event_time)` 代替服务端接收时间。
2. 三个明确阶段：“追踪代码已提供”“已接收站点事件”“已生成可用统计”。第一项只表示代码可复制，不能假称已在目标页安装；后两项必须由服务端证据确认。`last_event_at` 是任意接受事件的接收证据，单靠它不证明浏览器 pageview 或这个 snippet 成功；如需更强文案，必须另外记录/核验对应事件类型和来源。
3. 向导第 3 步与无数据空态复用一张卡。给“打开我的网站后回来检查”“查看站点/域名与同意设置”“查看排障步骤”。没有事件时保持“尚未观察到”，不能在固定超时后断言脚本失效。
4. 首版不自动抓任意 URL，不运行用户网站脚本，不修改 CSP、不绕过 consent/DNT/IP 排除，也不自动制造正式 PV。可以列安全、明确的客户端排查步骤。
5. “已收到一次数据”只证明该站某次采集成功，不证明所有页面已装好、所有浏览器可采集或全部自然访客未被拦截。

### 验收

- 新站零事件；真实浏览器正常采集后状态推进；worker 停止时显示已收到但未就绪，恢复后推进。
- consent 未授权、DNT、内部 IP 排除、域名不符分别不被误判为“安装成功”；无法观察客户端原因时显示待检查而非猜测。
- 重复 event_id、仅 Bot 请求、无效事件、CH 失败不得推进正式采集成功；无权限或跨站访问返回拒绝。
- 重复点击、切站、离开重进、轮询取消、后台停刷；日期排除了新数据时仍能看到接入状态而不会混同报表空态。

## 建议二 隐私安全的流量过滤诊断

### 依据与真实差距

已验证：白泽 [bot-filter.ts](https://github.com/bocmiao/baize-analytics/blob/f4dbbccb4ba4e37c40bb0a7d68265d3b32d44030/src/server/bot-filter.ts)已产生 `reason=ua/request_burst`、`ruleId` 和 `ruleVersion`；[collect.ts#L45](https://github.com/bocmiao/baize-analytics/blob/f4dbbccb4ba4e37c40bb0a7d68265d3b32d44030/src/server/collect.ts#L45)持久化的却只是站点/日期/category/count。其 [Bot 文档](https://github.com/bocmiao/baize-analytics/blob/f4dbbccb4ba4e37c40bb0a7d68265d3b32d44030/docs/bot-filter.md)已诚实说明 NAT 误报、低频伪装漏报和 Redis 故障的进程内降级。本轮应把这些已知事实放到用户诊断中，不另造反作弊引擎。

竞品依据：Rybbit 独立 Bot 检测层解释；Plausible 排障强调 HTTP Accepted 不一定表示已记入统计。推断：只看 PV 下跌，用户容易把同意策略、采集过滤和真实流失混为一谈。

### 最小实现

1. 保存有限枚举的聚合计数：时间桶、站点、类别、原因、规则版本。首版只统计现有 `ua` 与 `request_burst`，展示已有过滤边界，避免引入 ASN/IP 商业数据源。
2. 清楚标注 Bot 数为“被过滤的 HTTP 请求数”，PV 为“页面浏览事件数”，批次 20 个事件仍只算一次请求。两者不能相加、相除成“真实流量百分比”。若要算过滤率，需另外有同口径可观察入口请求分母。
3. 附短解释：“规则命中不等于验证了爬虫身份”；“JS 未执行的访问及网络前端拦截不可观察”；“突发规则可能影响共享出口”。数据缺失与未启用必须单列，不能显示零来暗示完全没有过滤。
4. 可继续扩展采集 rejection 原因计数，但不得把已删除身份、事件 ID、原始 UA/IP、URL query 或请求正文放入诊断。面向用户的原因仅用白名单枚举；详细配置仍按管理员权限。
5. 在首页/接入卡提供入口，正式分析仍排除 Bot。诊断统计应有独立、短保留期；实现前决定计数原子性、失败可见性与热路径开销，不能把每项明细日志写入数据库。

### 验收

- UA 命中与 burst 命中分开；AI UA 优先逻辑不变；单批多事件不放大请求计数；重试请求和重复事件的口径分别说明。
- 正常共享 NAT 场景不会被文案自动判为攻击；Redis 正常/故障测试保持既有过滤和分钟限流边界。
- 诊断响应、日志、导出没有 IP/UA/访客标识/凭据；跨站权限、短保留删除、无事件站点检查。
- 同源 PG 和严格 CH 采集路径中，诊断新增不改变 accepted/rejected 与权威正文一致性，也不增加明细扫描。

## 建议三 保存并重用完整筛选

### 依据与真实差距

已验证： [DashboardFilters.tsx](https://github.com/bocmiao/baize-analytics/blob/f4dbbccb4ba4e37c40bb0a7d68265d3b32d44030/src/web/DashboardFilters.tsx#L3-L5)支持 path、channel、utm_source/medium/campaign/term/content；但 [SavedReport](https://github.com/bocmiao/baize-analytics/blob/f4dbbccb4ba4e37c40bb0a7d68265d3b32d44030/src/web/Connectors.tsx#L64)只接收站点与日期，要求重新输入 path/channel；[governance.ts#L67-L70](https://github.com/bocmiao/baize-analytics/blob/f4dbbccb4ba4e37c40bb0a7d68265d3b32d44030/src/server/governance.ts#L67-L70)的 strict DSL 也只有 from/to/path/channel，运行仅传后两项。标题“保存当前筛选”与全局 UTM 实际上下文不一致，是确定可修的缺口。

竞品依据：Umami/Rybbit 保存条件集合后可一键应用；Matomo 保存前可 TEST。推断：白泽先补全现有条件的保存，比立即引入复杂用户 cohort 引擎更适合单人维护。

### 最小实现

1. 在共享 contracts 定义唯一的、带版本的已支持筛选 schema，前端、查询 API、报表 CRUD/run、比较、导出、定时报告均引用它。迁移兼容旧 DSL，保留既有报表 ID。
2. `SavedReport` 接收当前真实 filters，预览 7 个条件及日期后保存；从既有报表选择“应用筛选”。明确“使用保存日期”与“沿用当前日期”，不要静默改成动态范围。
3. 把活动筛选做成可移除的摘要，或交给同批 UI 工作做 URL 同步；摘要中明确是 AND。内部 IP 排除是采集设置，不应混入查询条件使用户误以为能恢复已丢弃流量。
4. 首批先支持已存在的 7 条件。后续若扩展 device/os/排除/路径前缀，必须贯通全部后端与 CH/PG 口径，不仅在前端过滤表格。不要一次接受任意正则、嵌套布尔树或 SQL。
5. 不承诺所有模块支持任意筛选。身份、外部 GSC/GA4/SERP 等有现存差异，沿用其明确的支持范围；不能将站内筛选套到外部数据后暗示同口径。

### 验收

- 同一 UTM+channel+path 条件：总览即时查询、保存后运行、同期比较、导出和有支持的推送一致。
- 旧 DSL 回归；含空串/重复键/未知字段/跨站 ID 拒绝或规范化；缓存 key 包含完整条件。
- 同一访客跨多页/多渠道不能累加行 UV；每日盐跨日 UV 保持不支持；超明细保留范围保持明确不可用。
- UI 保存后重载仍还原，切站不串条件，取消/返回不误覆盖，viewer 不获得 write 权限；PG 与 strict CH 对账。

## 建议四 图表变更标注与可解释报告

### 依据与真实差距

已验证：Umami v3.4 已提供部署、活动、故障的日期标注；Rybbit 当前性能页面也有标注切换。白泽已读的 `Charts.tsx`、主路由/表单及迁移清单中没有发现面向用户的日期标注接口和编辑入口。此结论限定本次读到的这些文件，不把搜索无命中当作全仓证明。

白泽已有规则洞察、异常下钻和建议复检，不缺 AI 解释能力。缺口是把人知道的“那天改过什么”以独立证据放在同一时间线上。 [Charts.tsx](https://github.com/bocmiao/baize-analytics/blob/f4dbbccb4ba4e37c40bb0a7d68265d3b32d44030/src/web/Charts.tsx)可复用， [StorageEvidence](https://github.com/bocmiao/baize-analytics/blob/f4dbbccb4ba4e37c40bb0a7d68265d3b32d44030/src/web/StorageEvidence.tsx)与既有 watermark/coverage 不必重建。

### 最小实现

1. 一个站点级 annotations 表：id、site_id、发生时间/站点日期、分类（发布/活动/故障/其他）、短文本、创建者和更新时间。API 按现有 read/write 权限，写操作审计；首版不加 CI webhook、外部日历或自动抓发布日志。
2. 趋势图提供标记与同等可操作的列表，点击定位日期；编辑/删除仍为明确操作。严格转义文本，不允许执行 HTML、自动抓取备注链接。
3. 复用查询元数据，在报告边上显示：站点时区、实际时间范围、筛选摘要、比较区间、数据水位、完整性与模式限制。为跳出率/可见时长/UV 提供与本产品实现一致的短定义，不能复制竞品不同口径。
4. 标注文字是用户提供的背景，测量值来自查询，两者必须区分。默认仅站点授权成员可见；不要自动扩散到公开分享、外部通知或 AI 请求。需要共享/模型上下文时另有清晰开关并沿用授权。
5. 若未来结合异常分析，输出“时间上同时发生/值得核对”，不能因曲线和发布标记重合就生成因果结论。

### 验收

- 站点时区与 UTC 边界、夏令时、同日多个标注、日期范围外不显示、小时/日聚合标记定位正确。
- reader 只读、analyst/write 可编辑、跨站拒绝；公开分享默认不泄露内部备注。
- HTML/Markdown/script 文本按普通文字处理；超长截断/校验；删除站点和用户治理策略可解释。
- 键盘/读屏列表和图表标记一致；无数据、部分不可用或低样本时不生成“改善已证明”的文案。

## 建议五 自托管只读诊断摘要

### 依据与真实差距

已验证：Matomo On-Premise 有可复制、下载的 System Check，用于支持排障；Plausible CE 官方强调更新、备份和容量是自托管者责任。白泽 [app.ts#L117](https://github.com/bocmiao/baize-analytics/blob/f4dbbccb4ba4e37c40bb0a7d68265d3b32d44030/src/server/app.ts#L117)的 `/healthz` 当前检查 DB、Redis、GeoIP，并返回固定 `schemaVersion:1`；它适合作为基础存活信息，却不足以回答“worker 是否工作、实际跑的什么版本、备份是否可恢复”。白泽已有用量/存储证据、备份恢复手册和实际验证，不是没有运维能力。

### 最小实现

1. 管理员只读页面与 `/api/admin/diagnostics`：构建 commit/version、实际迁移水位、DB/cache 可达、worker 最近完成/积压与最老待处理年龄、每站发布水位摘要、当前权威/副本模式、GeoIP 状态。
2. 把“应用存活”“数据可查询”“外部服务配置”“恢复准备情况”分别显示，任一条正常不能给整体无条件绿灯。低流量站点的事件时间旧不直接判 worker 故障；pending 与 worker 完成证据才解释延迟。
3. 备份项只引用真实成功凭据/manifest/最近恢复演练记录；没有机器可读记录就明确“未记录/未验证”，不要靠备份目录存在或日志文件存在声称恢复安全。独立最新删除日志与密钥保管仍沿用现有运行手册。
4. 可下载白名单 JSON/文本诊断：版本、枚举状态、数量/年龄、受限错误码。禁止环境变量值、secret、数据库 URL、内部 IP、用户列表、访客标识、原事件和任意原始错误。下载前可预览，不自动上传 GitHub 或发给任何人。
5. 热路径限制：使用元数据和已有监测计数，不每次体检扫描所有 raw 或验证所有 CH 正文。重型完整恢复/备份验证仍走现有明确 CLI 流程。

### 验收

- DB 正常但 worker 停止、cache 故障、CH 权威不可用、无 GeoIP、外部连接器未配置分别显示具体状态。
- 真正安装版本与迁移记录不匹配时明确警示；无版本标记显示未知，不伪造 commit。
- secrets、内部路径、URL 凭据、原始 IP 注入测试全部不会出现在 UI/导出；普通站点成员/分享链接不可访问实例诊断。
- 旧备份、删除日志推进、缺密钥/缺恢复证明时不得显示可恢复；体检只读且不会轮换密钥、修权限、删除数据或触发全量重建。

## 本轮不建议扩大范围的项目

- 不建新的会话回放、热图、漏斗、MCP 或“全功能 AI 助手”，这些白泽已有实现，且竞品也已有。
- 不建机器学习反作弊、长期原始 IP/UA 分析或付费网络情报同步；先让既有规则可解释。
- 不追求无限层级布尔分群、实时画像/CDP、任意 SQL 问数。它们会显著扩大正确性、隐私和查询成本。
- 不因为竞品宣传“即时/一键”而承诺白泽固定 5 分钟、1C2G 或生产规模 SLO；按实际验收证据发布。
- 不将 51LA 的独立 SEO/性能/小程序服务混成一套 V6 功能，不将百度推广版广告屏蔽写成免费通用反作弊。
- 不把自托管、每日盐或“不存原始 IP”直接写成对所有部署的法律合规保证。这里仅比较产品机制，不提供法律结论。

## 实施顺序与完成标准

1. 先完成当前不可变源码对应的原验收，不让研究改动污染正在收尾的验证快照。
2. 第一切片：接入只读状态卡＋完整筛选保存。它们最容易直接改善第一次和第二次使用，不依赖外部账号。
3. 第二切片：过滤原因聚合＋诊断摘要，优先保证无额外敏感数据与无热路径性能回退。
4. 第三切片：日期标注＋报告上下文，借此把已有 AI/SEO 证据链呈现得更易理解。
5. 每片必须有真实 API/数据库和浏览器验收，覆盖权限、零数据、未知、不支持、pending、严格 CH 与保留期边界；最后在一个明确 SHA 上完成整体验收。研究报告本身不改变任何“通过/未测”状态。

## 仍未核的范围

- 未登录竞品后台，未用真实站点验证其声明延迟、过滤准确率、导入、实时性能或付费功能。
- Plausible 当前自动安装核验是否在每个 CE 发布标签可用，本次未核，不用 Cloud 文档代替。
- Rybbit 当前源码支持自托管 Web Vitals，但未启动对应镜像验证默认 UI、全部安装路径与迁移行为。
- 白泽真实外部 Google/模型/SERP/企业账号能力按原验收记录保留边界；本轮研究不替代实测。
- 单人维护成本与产品差异化均为建议，不是时间承诺、效果保证或市场份额判断。
