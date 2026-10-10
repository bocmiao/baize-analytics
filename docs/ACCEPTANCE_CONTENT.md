# 内容分析和转化流失验收

本轮新增 `content-analytics.ts`，从 PostgreSQL 中保留的真实非机器人事件读取，并排除访客删除 tombstone 与身份时间段 tombstone。没有演示数据替换真实查询，也未修改旧汇总结构。

接口已从 registerAnalytics 注册。接口：

- `GET /api/v1/sites/:siteId/content?from&to`：下载 URL/文件扩展类型/发生页面/count/UV、404 路径/来源渠道/来源 URL、按小时事件趋势；同时返回目标渠道趋势和漏斗流失来源/设备。
- `GET /api/v1/sites/:siteId/content/404.csv?from&to`：404 修链 CSV，含待填修复目标列，防公式注入并写审计日志。
- `GET /api/v1/sites/:siteId/analysis/features?from&to`：同样的内容和转化特征结果，可供现有目标/漏斗界面扩展。

筛选字段为 path/channel/utm_source/utm_medium/utm_campaign/utm_term/utm_content。下载、404、事件趋势按事件维度筛选；目标和漏斗按会话入口维度筛选，再读取完整会话后续事件。原始采集中的 term/content 维度由集成负责人补齐，不声称此前历史已持久化这些值。stats/analysis/pages-detail 的筛选也已用于完整重算查询；stats缓存与同期比较包含筛选字段，避免仅过滤展示维度表。

目标按会话首次完成时间归入小时，渠道使用完成时最近一次非 direct 页面来源。漏斗按会话首次页面浏览时间入组，按严格或宽松事件顺序计算；访客去重后，当前步骤进入者减后续步骤进入者为流失集合。来源和设备按每名访客最早入组会话的首步归属，而非随机事件样本。sampleRate 为 1，表示保留期内全量事件；不代表整个站点无限历史完整。

查询限定最多90天，而且整个所选区间必须在原始明细保留期内。超出保留期时返回 outside_raw_retention/coverage 0 和空结果；修链导出返回409。每日盐模式跨日漏斗返回 unsupported_in_this_mode，下载跨日 UV 返回 null。历史不完整时不以剩余明细猜测完整周期。

实际命令和结果（2026-10-10 UTC）：

```
node_modules/.bin/eslint src/server/content-analytics.ts tests/unit/content-analytics.test.ts tests/integration/content-analytics.test.ts
node_modules/.bin/tsc --noEmit
TEST_DATABASE_URL=postgresql://baize_dev@127.0.0.1:5432/baize_dev node_modules/.bin/vitest run tests/unit/content-analytics.test.ts tests/integration/content-analytics.test.ts
```

所属 ESLint 与全局类型检查退出0。测试2个文件、4项通过：2项单元测试、2项真实 PostgreSQL 隔离 schema 集成测试，实际 Fastify HTTP 请求验证下载类型、404完整来源路径、CSV、目标last-click渠道、漏斗真实流失设备/渠道、UTM入口筛选、过期数据明确不可用、每日盐跨日不支持。测试数据写入真实 PG，仅授权身份在测试中注入，不是外部生产账号实测。

待完成或限制：浏览器展示由web负责；尚无这三个新接口的浏览器E2E证据。明细全站读取并按会话重算是正确性基线，大数据量性能未测，不声称百万事件吞吐。过期归档汇总尚不能提供新内容/流失特征；当前显式不可用。

整合后额外运行 analytics 与 content 四个测试文件，共34项通过（17项单元、17项真实PG集成）。真实PG测试同时通过已注册 stats/analysis 的完整 UTM 筛选验证。并行代理修复 external-alert 时钟注入签名后，最终全局类型检查退出0。

## 地域钻取与真实地图资产

新增并注册 `/api/v1/sites/:siteId/geography?from&to&country&region`，同样支持 UTM 筛选，返回按国家、省、市合并的真实 PV 和精确 visitor 集合 UV。城市或页面之间重复访客不相加；每日盐跨日 UV 返回 null。中文/英文省名只对已知别名规范化，无法识别的地域保留 unknown 或原始值。geographyCoverage 是有已知国家和区域的实际页面浏览占比，独立于查询明细保留 coverage。

本地没有预置边界资产，后仅通过已有 registry.npmjs.org 取得官方 echarts@4.9.0 npm包，验证原始SHA512，将 china.json 与34省地图原样保存到 packages/geography，并保留发布包 Apache2 LICENSE、NOTICE和逐文件SHA256。未安装旧库，没有从新域名下载，没有手绘或模拟地理区域。当前 ECharts6 SVG SSR 实际解析并生成地图路径和四川标签，1项资产兼容性测试通过；不是浏览器交互验收。

地域新增组合验收：2项单元测试 + 已扩展真实PG内容集成的1项地域HTTP测试，通过国家→四川→成都查询验证PV2/UV1及unknown导致实际地域coverage0.5。analytics/content/geography组合5文件37项通过；资产兼容性额外1项通过。最终所属lint和全局类型检查退出0。地图浏览器渲染/点击由web继续，未声称此处已经验收。
