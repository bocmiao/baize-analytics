# PR #3 UI v2 整合验收（2026-10-17）

> 历史附件已移至固定提交存档，以下结果仍只对应本文日期。原始图片、日志和 JSON 保持不变，见[仓库整理记录](REPOSITORY_MAINTENANCE_20261110.md)。

本轮在 main `b6744cbd50da0b60bf2393e418a04c37e737ebf5` 与原 PR head `b2b6672f89b37a6f6afd96c422794a955b0f1560` 上检查、修复和验证。保留 React/ECharts、青玉/墨玉、Node 标准版、Lite 能力边界和 PHP 标准版。未运行 GitHub Actions/CNB，未部署生产、购买服务或更改凭证/权限。

## 发现和修复

| 位置 | 复现及处理 |
| --- | --- |
| 成员邀请 | 真实 PostgreSQL 邀请 POST 成功后，成员列表重读加载/503 会卸载编辑器并丢失一次性链接。邀请编辑器现独立挂载、按站点隔离；重复提交加锁，离线失败保留输入和已有链接，成功重试清除旧错误。链接在 320px 换行。 |
| 实时事件 | 真实采集后 HTTP 返回 ISO 字符串，原 `Number(ts)` 得到 NaN，出现有事件却无分钟柱、时间为“—”。统一解析 ISO、ClickHouse UTC 字符串与毫秒时间戳；分钟桶按分钟边界对齐，显示站点时区。最近访问按时间降序，未知时间置末；完整窗口统计仍来自接口，预览不冒充总量。 |
| 实时覆盖率 | 实时主区与完整窗口区统一遵守 onlineCoverage；未知值保持“—”。320px 的时间/类型共一行，长路径独占下一行，避免中文被三列挤成每行两字。 |
| 手机指标 | 原 PR 将桌面表绝对定位叠在手机指标下，露出重复边框并保留重复可聚焦区域。手机隐藏桌面副本，手机 6 项指标的本期/上期/变化均保留。 |
| SEO 分组 | 真实本地 HTML/robots 抓取产生的 8 项 pass 被计入严重度问题组。现问题组排除 pass/not-applicable，完整规则证据列表保留。Google 传输明确模拟，不声明搜索排名收益。 |
| 墨玉趋势图 | 通用趋势轴文字原使用 ECharts 默认暗灰。现使用现有 muted/grid 语义色；用真实收入数据与 canvas fillText 颜色断言、截图验证。金额精度与格式化逻辑保留。 |
| 字体发行 | Noto Sans SC 作为构建依赖，锁定 5.2.8；四个 woff2 与完整 OFL 许可随预构建前端发行。真实空目录 npm ci 和干净构建通过，PHP 包验证包含全部字体及许可，不依赖共享 node_modules 补包来认定安装可用。 |

## 验证结果与边界

- 单元：112 文件、588 条通过。
- 可用 PostgreSQL/SQLite/Redis 集成与 server 测试：主轮原始摘要为 108 文件通过、1 文件失败、96 文件跳过，319 条通过、2 条失败、303 条跳过。tracker 文件主轮已有 2 条通过，另 2 条因尚未生成 `public/tracker.js` 失败；构建物齐备后完整文件 4/4 通过。按文件替换去重：319−2+4=321 条有效通过，109 个执行文件；另 96 文件、303 条按运行条件跳过。不宣称一轮全绿，原日志与补跑日志均保留。
- 四个 ClickHouse 测试文件在 main 与原 PR 字节一致，未配置 CH 时仍于 collection 执行 URL/客户端构造而失败。移入 beforeAll 后 16 条正确 skip；没有伪造 CH 通过。恢复 fixture 在 pool.end 后等待服务端连接归零，再普通 DROP，避免清理时强杀关闭中的连接产生 57P01。
- 最终 UI 独立配置 `playwright.ui-review.config.ts`：13 条通过。包含真实 30 天采集与 38 入口、320/390/768/1024/1440px、零/少/多/长中文、比较、主题与跨页同步、存储禁用、加载/503/真实 200 重试、键盘/reduced-motion、真实邀请注册和 viewer 写入 403。重试记录直接校验真实响应 PV=681，未通过扩大 DOM 断言时间掩盖问题。
- PHP 双主题：各 94 状态，共 188 状态通过，无页面异常、合同/语义失败或 body 溢出，匿名访问受拒。使用最终 Vite 前端的 loopback 代理及完全未改的 PHP/MySQL API；未拦截后端响应。少数据 fixture 不冒充完整管理记录编辑或外部供应商功能。
- `typecheck`、`lint`、干净 `npm ci --ignore-scripts --offline`（397 包）与完整 build 通过。PHP 标准包 126 文件 manifest 校验通过，包含四个 woff2 与 OFL；不对外部署此测试包。

本轮未运行 ClickHouse、真实 OAuth/AI/SMTP/通知发送、MariaDB 新验收、生产恢复或付费服务。既有 Node/PHP 后端与 contracts 相对 main 没有产品代码变更。本轮验证不替代历史后端验收。

根盘满期间的中间运行不作为通过证据。新 PostgreSQL 17、Redis 7 和提交 clone 均在 `/tmp` 独立空间；原服务数据、卷、历史证据及未迁移草稿保留。

## 复现与证据

在有 Chromium 与明确的可丢弃 PostgreSQL URL 的环境中：

```sh
npm ci
npm run build
npm run typecheck
npm run lint
npm run test:unit
TEST_DATABASE_URL='postgres://LOCAL_TEST_DATABASE' PLAYWRIGHT_CHROMIUM_EXECUTABLE='/usr/bin/chromium' npx playwright test --config playwright.ui-review.config.ts
```

集成测试另需本地测试 Redis；ClickHouse 等可选用例保持其原有显式环境条件。测试凭证全部为隔离合成 fixture，不是用户秘密。

[源文件/构建摘要与测试边界](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/pr3-ui-20261017/receipt.json)、[最终截图及视口/SHA256](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/pr3-ui-20261017/screenshots.json)、[UI 原始日志](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/pr3-ui-20261017/review-final.log.txt)、[集成整套中间日志](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/pr3-ui-20261017/integration-complete-intermediate.log.txt)、[tracker 完整补跑](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/pr3-ui-20261017/tracker-repeat.log.txt)、[PHP 青玉](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/pr3-ui-20261017/php-light-results.json)、[PHP 墨玉](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/pr3-ui-20261017/php-dark-results.json)。

截图均为合成数据；深色总览的受控统计单独标注。邀请链接遮罩。`before/` 仅为原 PR 缺陷的负例，不是最终界面。金额图、成员错误态和实时 ISO 示例均有独立最终截图。
