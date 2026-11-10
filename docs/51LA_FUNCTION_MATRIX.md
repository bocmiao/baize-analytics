# 51.LA V6 功能对照表

更新日期：2026-11-10。范围是白泽 **Node 标准版**的网站统计功能，依据 51.LA 的公开页面、帮助和已发布客户端逐项核对。Node Lite、独立 PHP 版及 51.LA 的广告、短信、充值套餐不在本表中。

本轮先记录了基线 `eb65ad82` 的缺口，再补齐目录、推广、事件、热图、访客轨迹、日期比较、站点管理和分享能力。原始研究证据保留在本地忽略目录 `.baize/51la-reference/`。本表记录最终实现位置和实际执行过的检查；部署后的桌面、平板、手机交互与截图由对应版本的验收报告单独记录，源码和单元测试不代替浏览器验收。

## 对照依据

本轮重新读取了 14 个官方页面和脚本，均返回 HTTP 200。桌面公开脚本 `app.4cc3fb56.js` 的 SHA256 为 `966197035dc999d1e3166603f971c4e41c5cc760d686e403cbd8a8fe7f55560a`，与此前保留的菜单、列定义和路由证据一致。

主要参考为 [51.LA V6](https://v6.51.la/)、[趋势分析](https://v6.51.la/help-doc/doc/dssn4w.html)、[日期比较](https://v6.51.la/help-doc/doc/cqg85b.html)、[访问明细](https://v6.51.la/help-doc/doc/fn3i2r.html)、[渠道追踪](https://v6.51.la/help-doc/doc/xsad85.html)、[热力图](https://v6.51.la/help-doc/doc/iaautew820makaqi.html)、[事件分析](https://v6.51.la/help-doc/doc/kadxe7.html)、[事件管理](https://v6.51.la/help-doc/doc/lfnd22.html)、[IP 过滤](https://v6.51.la/help-doc/doc/usuc46.html)、[参数设置](https://v6.51.la/help-doc/doc/ggktml.html)。公开资料不能证明其私有服务端的算法或内部实现。

表中“已接入”表示有真实数据或配置读写路径；“既有验证”只引用此前执行记录。最终源码 `80c2e79` 已完成 801 项全量单测、67 项 NAS HTTP 检查，以及桌面、手机、窄屏和平板共 190 次页面检查。真实圈选、热图、录屏、推广和导出的操作证据见[本轮实机验收](validation/51LA_FUNCTIONAL_NAS_20261110.md)。

## 站点、安装与访问统计

| 功能 | 前端入口 | 后端 / 采集实现 | 验证与口径 |
| --- | --- | --- | --- |
| 应用列表、添加、分组、站点指标 | `SiteDirectory`、`SiteMetadata` | `sites.ts`、统计接口 | 已接入；既有 NAS 站点/API 验证；收到访问与安装检测分别显示 |
| 名称、域名、时区、别名 | `SiteMetadata` | `sites.ts`、`site-hosts.ts` | 已接入；别名受同一注册域限制，独立站点各自建站 |
| SDK 安装、SPA 页面采集 | `InstallationSnippet`、`IntakeStatus` | tracker、tracker config、intake-status | 已接入；既有真实 tracker 采集验证 |
| 网页安装检测 | `SiteInstallationCheck` | `site-lifecycle.ts` installation-check | 本轮已接真实授权 URL 探测；不以历史 PV 代替安装检查 |
| 刷新服务端采集密钥 | 站点设置 | `sites.ts` write-key | 已接入；服务器请求仍需签名，浏览器 siteId 不是私有密钥 |
| 停用、回收与恢复站点 | `SiteRemoval`、`SiteRecycleBin` | `site-lifecycle.ts`、采集与授权检查 | 本轮已接；采用可恢复回收站，停用后采集/新授权/公开分享拒绝访问，原数据保留 |
| 今日、昨日、昨日同期 | `FiftyOneOverview` | `overview-summary` | 已接入；既有 NAS API 对比人工统计，按站点时区 |
| 今日流量预测 | `ForecastNote` | `traffic-forecast.ts` | 已接入；独立实现 `historical_remaining_v1`，样本不足保留未知 |
| 本月、总量、历史峰值日期 | 概况展开区 | `51la-history-summary.ts` | 已接入；真实 PG 验证旧 raw 过期和汇总重叠边界 |
| 概况趋势、来源、页面、地域和设备 | `FiftyOneOverview` | stats、traffic-report、geography | 已接入；已有 NAS 桌面/手机截图，本次新版另验 |
| 日报 | `TrafficWorkspace` daily | traffic-report、前日统计 | 已接入；逐日指标与定时通知是不同功能 |
| 实时访问与 5/15/30 分钟活跃 | `RealtimeReport`、实时页 | traffic-report、visits live | 已接入；真实会话统计，可暂停刷新，页面隐藏时停止轮询 |
| 日 / 小时趋势、周 / 月分析 | `TrafficWorkspace` | `51la-report-model.ts` | 已接入；本轮增加专用分支日期比较；周/月独立去重，不累加每日 UV |
| 等长日期比较、维度历史趋势 | `PeriodComparison`、`ReportComparison` | traffic-report、stats 范围查询 | 本轮覆盖趋势、来源概况、新老访客、互动度和通用维度；图表缺失值保留为空 |

## 内容、来源、访客与环境

| 功能 | 前端入口 | 后端 / 采集实现 | 验证与口径 |
| --- | --- | --- | --- |
| 来源概览与来路汇总 | sources、referrers | channel/referrer 真实维度 | 已接入；本轮补来源概览日期比较 |
| 搜索引擎、外部链接、搜索词 | 对应流量页 | searchEngine/external/keyword | 已接入；浏览器未提供的搜索词显示未知 |
| 来源规则与 AI 引荐域名 | `SourceSettings` | `channel_rules`、`ai_referrer_hosts` | 已接入真实采集归因；本轮修正切站读取和保存旧值问题 |
| 受访页面、TOP 页面、单页趋势 | pages、`PageInspection` | stats pages、pages/detail | 已接入；路径筛选保留，通用页表支持比较 |
| 入口页面与入口会话 | entryPages | 首次页面 / session 归组 | 已接入；受访页面与会话入口分别计算 |
| 目录规则增改删、启用停用 | `DirectoryRules` | `site-content-management.ts` | 新增；10 项相关 unit、5 项真实 PG 资源测试通过 [T1] |
| 目录统计、趋势、访问下钻 | directories、`ReportComparison` | `directoryLabels` + groups/trend/visits | 新增；真实 PG 验证配置规则到统计和明细 [T2]；前缀按路径段匹配，重叠目录分别统计 |
| 受访域名、趋势与对比 | domains | 实际 URL hostname | 已接入；不构造未采集域名的数据 |
| 新老访客、每日趋势与图表切换 | visitors | firstSeen + visitorType | 已接入；本轮补比较；每日盐模式不伪造跨日新老身份 |
| 互动度页数与时长 | engagement | 会话重建 | 已接入；本轮补日期比较；会话时长与前台可见时长分别计算 |
| 访问明细分页、筛选、自定义列 | `VisitsReport` | `51la-reports.ts` visits | 已接入；筛选后分页，导出范围按页面说明 |
| 访客跨会话轨迹 | `VisitsReport` 访客历史 | visitor history 接口 | 本轮新增；真实 PG 验证身份范围、分页和隐私限制 [T2] |
| 国家、省、市联合筛选 | `VisitsReport` | visits filter + 真实地域字段 | 本轮新增；未知地理字段保留未知 [T2] |
| 设备、浏览器、系统、屏幕、语言、品牌、色深 | environment | 采集维度 + groups | 已接入；无法检测的值不补猜测 |
| 浏览器版本、系统版本 | environmentDetails | browserVersion/osVersion | 本轮新增；真实 PG 统计与下钻检查 [T2] |
| 国家、省、市、运营商地图与趋势 | `GeographyExplorer` | `geography-analytics.ts` | 已接入；本轮补新访客和会话指标 [T2] |
| IPv4 / IPv6 离线地域库 | `GeoIpSettings` | ip2region 固定版本下载、manifest、SHA256 | 已验证离线 known-IP、NAS 安装与原子更新；MaxMind 保留可选 |
| 运营商分析 | providers | 实际采集 isp | 已接入；官方库无结果时显示未知 |
| 独立 IP、趋势与明细 | ips、visits | 规范化全地址、站点 HMAC 去重 | 已接入；真实 PG 验证 IPv4/IPv6；只展示脱敏网段及不透明标识，不公开原 IP |
| 单 IP、CIDR、起止范围过滤 | `IpFilterSettings` | IP 过滤规则、采集判定 | 本轮新增结构化管理和验证 [T3]；不把网段按钮当原始单 IP 封禁 |

## 推广、事件、热图与蜘蛛

| 功能 | 前端入口 | 后端 / 采集实现 | 验证与口径 |
| --- | --- | --- | --- |
| 五项 UTM 采集与筛选 | `DashboardFilters`、渠道页 | tracker + content filters | 已接入 source/campaign/medium/content/term |
| 来源 → 活动 → 媒介 → 内容 / 关键词分析 | `CampaignAnalysis` | traffic-report 真实维度过滤 | 本轮新增；维度和全局筛选 unit 通过 [T1]，服务端维度真实 PG 通过 [T2] |
| 推广链接保存、编辑、删除 | `CampaignBuilder` | campaign-links CRUD，站点 config | 本轮新增；并发/权限/容量原子回滚真实 PG 通过 [T1] |
| 推广二维码与 SVG 下载 | `CampaignBuilder` | 本地 qrcode 编码 | 本轮新增；二维码经 jsQR 解码还原完整 URL [T1]，不发送第三方 |
| UTM 参数值管理 | `CampaignBuilder` 参数库 | campaign-parameters CRUD | 本轮新增；保存链接自动入库，删除建议值不删除历史链接 [T1] |
| 点击热图、滚动热图 | `HeatmapWorkspace` | tracker + heatmap-analysis | 本轮补页面配置、叠图、强度与筛选；保留真实坐标和覆盖状态 [T3] |
| 热图页面管理、元素排行 | `HeatmapWorkspace` | heatmap_pages、advanced reports | 本轮新增；不能读取网页上下文时明确说明，不伪造截图 [T3] |
| 会话回放控制 | `ReplayViewer` | masked replay chunks | 既有能力；遮罩 DOM 回放不等同原像素视频，隐私遮罩继续生效 |
| 事件总次数、UV、人均 | `EventAnalysis` | event-analysis | 本轮扩展真实指标与趋势 [T3] |
| 多事件、参数值比较 | `EventAnalysis` | advanced-reports + identity sets | 本轮新增最多五组比较、参数筛选、UV/人均与时间序列 [T3] |
| 事件名称与说明管理、代码埋点 | `EventDefinitions` | event-management + SDK track | 已接入；本轮补查看数据与代码入口，删除名称保留历史事件 |
| 可视化圈选与采集范围 | `EventCaptureRules` | visual tracker、短期授权、capture rules | 本轮新增；受信 Origin、选择器与页面范围控制，停用规则停止后续采集 [T3] |
| 蜘蛛引擎 / IP / URL / 最近访问 | `BotVisits` | bot-visit-log | 已接入；真实日志统计和隐私回归通过，名称来自 UA 声明 |
| 蜘蛛时间趋势 | `BotVisits` | bot-visit-log trend | 本轮新增按时段/引擎统计，复用真实日志 [T4] |
| 蜘蛛分页日志与服务端上报 | `BotVisits`、接入说明 | HMAC ingest + collector | 已验证鉴权、限流、去重、保留期；非 JS 爬虫需接服务器日志 |
| 机器人与 IP 拦截原因 | 自动访问拦截区 | bot-observations | 已接入；过滤原因账本与蜘蛛访问记录分开 |

## 分享、授权与运维

| 功能 | 前端入口 | 后端 / 采集实现 | 验证与口径 |
| --- | --- | --- | --- |
| 日期筛选表格导出、访问明细导出、整站导出 | `DenseTable`、`VisitsReport`、数据管理 | 前端 CSV、visits.csv、export jobs | 表格导出当前日期 / 筛选的已加载全表；访问明细由服务端导出完整筛选范围；后台整站导出是保留期快照，不随顶部日期筛选；均有明确容量上限 |
| 分享密码、失效、撤销 | `ShareEditor` | governance share_links | 已接入；本轮真实 HTTP / PG 验证，包括旧长密码兼容 [T5] |
| 只读统计看板 | `SharedDashboard` | `projectSharedReport` | 本轮新增总览、逐小时趋势、来源、设备、地域、热门页面；汇总白名单不输出身份 [T5] |
| iframe 图表 | `ShareEditor` | `renderSharedEmbed` | 本轮支持五种真实图表，CSP 域名限制保留；密码/撤销/归档验证通过 [T5] |
| 成员与账号间授权 | `InviteEditor`、成员设置 | memberships、invites、scoped tokens | 已接入；白泽本地账号体系，不接 51.LA 账号；站点停用后的新授权关闭 |
| OpenAPI 密钥与权限 | token 设置 | 站点限定 read/write/admin REST | 已接入；已有 NAS 401/403/撤销验证，不输出可恢复原密钥 |
| 保存报表与定时通知 | `SavedReport`、`ReportSchedule`、`GovernanceRecordManagement` | report definitions、governance-worker、通知队列 | 保存查询按固定日期重放；推送计划按日 / 周 / 月滚动周期应用保存的筛选；支持删除计划 / 渠道 / 告警并撤销未发送任务，停用站点暂停新任务 |
| 保留期、访客删除与恢复保护 | 数据管理 | retention、tombstones、backup restore | 既有能力；本轮新增功能沿用删除、身份和站点隔离规则 |
| 手机与平板 | 工作区抽屉、表格局部滚动 | 与桌面共用 API | 320 / 375 / 768 / 1440 共 190 次页面检查通过；抽屉、日期焦点、筛选、回放、CSV 下载已实测 |

## 已执行检查

所有 PG 用例使用独立 schema，完成后清理。共享回归前后固定检查原有 3 个站点，事件数均为 3444，事件 ID 摘要均为 `d654099fa3abc67338ca9e703481faa7`。测试站点不计入真实业务访问。

- **[T1] 目录与推广**：`tests/unit/site-content-management.test.ts` 10 项通过；`tests/integration/site-content-management.test.ts` 5 项在 NAS PostgreSQL 通过。覆盖规则边界、重叠、URL/UTM、二维码往返、权限、并发重复、容量回滚和无关配置保留。本地证据 `.baize/nas/site-content-resources/`。
- **[T2] 访问与维度**：`tests/integration/network-ip-reports.test.ts` 在 NAS PostgreSQL 上 12 项通过，包含目录配置到 groups / trend / visits、28 会话分页与 CSV、访客轨迹、地域和版本维度。相关 8 个 unit 文件合计 54 项通过。本地证据 `.baize/nas/ip-metrics/`。
- **[T3] 事件与热图**：11 个定向 unit 文件共 68 项通过；NAS `tests/integration/advanced-functions.test.ts` 7 项通过，覆盖 collector → 事件参数 UV → 热图日期 / 元素 → 暂停 / 删除拒绝 → IPv4 / IPv6 过滤 → read token 权限 → 完整 JSON 导出下载。tracker 构建及 7 个分发变体版权与 gzip 往返 2 项通过。本地证据 `.baize/nas/advanced-functions-20261110/`。实际浏览器圈选、规则保存、普通访客点击入库及真实网页叠图已通过，详见本轮实机验收。
- **[T4] 生命周期与蜘蛛趋势**：NAS `tests/integration/site-lifecycle.test.ts` 4 项和 `bot-visit-log.test.ts` 10 项通过，包含站点管理、采集停用、授权竞态和蜘蛛趋势。本地证据 `.baize/nas/site-lifecycle/`。
- **[T5] 分享**：`tests/unit/shared-dashboard.test.ts` 8 项通过；NAS 上 `tests/integration/shared-dashboard.test.ts` 3 项和 `legacy-share-password.test.ts` 1 项通过。覆盖所有五种嵌入、真实汇总、身份隔离、CSP、密码、有效期、撤销和归档。本地证据 `.baize/nas/shared-dashboard/`。
- 新增文件通过定向 ESLint，完整 `npm run typecheck` 通过。Linux 全量 unit 在补齐隔离容器工具、校验合法迁移换行变体并增加篡改拒绝回归后，**最终 80c2e79 的 136 个文件、801 项一次通过**；历史迁移 SQL 字节和数据库已应用校验值未改。本地证据 `.baize/nas/completion-unit-final-80c2e79/`，处理说明见 [历史迁移换行兼容](validation/HISTORY_MIGRATION_LINE_ENDINGS_20261110.md)。最终构建与实际浏览器验收见本轮实机验收报告。

- **[T6] 删除管理**：NAS `tests/integration/governance-resource-deletion.test.ts` 5 项通过，验证匿名 / 只读 / 跨站权限、计划和告警任务撤销、已保存报表删除关联计划与任务、通知渠道关联清理及已发送记录保留；原 3 站事件摘要前后相同。本地证据 `.baize/nas/governance-resource-deletion/`。设置页的安装检查与移除入口已移到实际渲染分支，回收站保留在站点列表。

## 实现差异

- **IP 与隐私**：白泽采用站点隔离标识和脱敏显示，原 IP 仅在请求内存中用于地域判断与标识计算。每日盐模式不合并跨日身份；旧数据只有网段时不补造完整 IP。
- **预测与反作弊**：采用可解释的独立历史预测与过滤规则，不声称复制 51.LA 私有算法、商业地域库或账号风控。
- **站点删除**：用户管理使用可恢复回收站，保留数据并停止采集和授权；不把“从列表移走”说成物理销毁数据库。
- **分享**：公开能力只包含明确投影的汇总，不能通过 token 获取原始事件、访客轨迹、密钥或回放。无密码 iframe 的 Origin 限制不等同访问密码。
- **热图与回放**：只展示已授权采集的数据。网站跨域、CSP、iframe 或隐私遮罩限制无法绕过；不会用演示图替代真实网页。
- **数据期限**：查询范围、明细保留、未知搜索词和缺失覆盖按实际数据解释；不存在的记录不填成正常访问或零值。
- **范围**：51.LA 的短信、付费容量和云账户服务没有伪装成本地同名开关；白泽保留既有 SEO、AI、回放、留存等自身能力。

配置与使用参见 [目录与推广管理](CONTENT_CAMPAIGN_SETUP.md)、[只读看板与嵌入](SHARED_DASHBOARDS.md)、[地域库与蜘蛛接入](TRAFFIC_DATA_SETUP.md)及 [API 手册](api.md)。
