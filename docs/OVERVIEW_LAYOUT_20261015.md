# 总览布局修复与验收（2026-10-15）

> 历史附件已移至固定提交存档，以下结果仍只对应本文日期。原始图片、日志和 JSON 保持不变，见[仓库整理记录](REPOSITORY_MAINTENANCE_20261110.md)。

本次保留 Node 标准版的 React / ECharts、已有品牌颜色、数据口径及报告入口，调整总览的信息分组。未读取或迁移原本机 `D:\codex存储\2026-10-15\task-5` 草稿。

## 改动与理由

- 趋势图和本期观察组成一个连续区块。桌面观察横排，窄屏顺序排列；观察按实际内容增长，不再占用趋势右侧的整列。
- 热门内容与会话入口合为“页面表现”。同一张表始终保留路径、浏览量、访客、入口次数和平均可见时长（秒）；“按浏览量 / 按入口次数”只改变排序和入选页面，便于同时核对同一路径的访问与入口贡献。入口视图仍筛出实际返回的正入口记录，不补造会话。
- 页面表保留前六条预览、全部页面报告入口和路径筛选链接。窄屏使用有名称、可键盘聚焦的局部横向滚动区域，附滚动提示并固定路径列；不隐藏比较指标。
- 来源、地域、设备及已配置目标在页面表之后按维度分组。各容器随内容增长，不设置等高、额外最小高度或用于填空的指标。真实接入说明仍在来源下方。
- 长中文和无断点英文路径在自身单元格内换行。实际看图发现旧全局 `th` 的 `white-space: nowrap` 可使路径越过数字列，已修复并补充单元格溢出检查。
- 未配置地域、完整范围无记录、部分范围不可用、加载及错误保留不同语义；不可用值仍为 `—`，HTTP 失败提供当前视图重试。

## 实际验收

测试使用本地 Chromium，前端来自实际 Vite 构建。标准版用隔离 PostgreSQL schema，采集器接收合成事件，再由实际聚合器与查询 API 生成报告；地域维度是显式合成数据，不是 GeoIP 精度证明。受控状态截图的统计响应由测试替换，文件名带 `controlled`，不得当成实际采集结果。

| 范围 | 结果与证据 |
| --- | --- |
| 标准版 30 天数据、前期对比、多来源/页面/地域 | 浏览器通过；[桌面整页](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/overview-20261015/after/overview-desktop-full.png)、[移动整页](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/overview-20261015/after/overview-mobile-full.png)、[真实合成种子](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/overview-20261015/after/synthetic-seed.json) |
| 页面排序与完整比较列 | 键盘切换入口排序，核对真实最高入口路径及入口数；五列保持，路径链接保留；[入口排序](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/overview-20261015/after/overview-session-entries-desktop.png) |
| 容器边界 | 320、679、680、979、980、1040 px；[结构与键盘结果](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/overview-20261015/after/container-layout-results.json) |
| 真实视口 | 1440、1024、768、390、320 px 无页面横向溢出；移动页面表在自身区域滚动，滚动时路径列可见 |
| 0 / 少 / 多 / 长中文 | [完整空范围](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/overview-20261015/after/overview-empty-unconfigured-controlled.png)、[空范围移动版](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/overview-20261015/after/overview-empty-mobile-controlled.png)、[单页面与单来源](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/overview-20261015/after/overview-few-desktop-controlled.png)、[少量移动版](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/overview-20261015/after/overview-few-mobile-controlled.png)、[50 个长路径与 30 个长来源，桌面](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/overview-20261015/after/overview-long-chinese-1440-controlled.png)、[390 px](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/overview-20261015/after/overview-long-chinese-390-controlled.png)、[320 px](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/overview-20261015/after/overview-long-chinese-320-controlled.png) |
| 不可用、加载、错误与恢复 | [部分范围未知值](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/overview-20261015/after/overview-unavailable-controlled.png)、[加载](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/overview-20261015/after/overview-loading-controlled.png)、[HTTP 503](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/overview-20261015/after/overview-error-controlled.png)；重试后恢复真实统计 |
| 真实只读成员 | 真实注册、登录和会话；总览读取成功，写目标返回 403，管理员地域设置与 SEO 管理入口不出现；[只读总览](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/overview-20261015/after/overview-viewer-real-api.png) |
| Node Lite 兼容 | 实际 SQLite 与采集 API；一条有效时间桶显示独立点，移动无全局溢出，未请求不支持的实时窗口；[结果](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/overview-20261015/after/lite-ui-results.json) |
| 图表、键盘、动效 | 五次指标切换保留同一 ECharts 实例；洞察对话框 Enter / Escape 及焦点恢复；页面排序 Tab / Enter；reduced-motion；旧实时响应不覆盖最新结果 |
| 原标准版入口 | `approved-ui.spec.ts` 通过原 38 个报告入口、移动导航与洞察模态检查；旧宽度约束改为验证五列表、排序入口和与趋势区块的关系 |

截图已实际打开检查：先看整页和长文本图，再合并自动结构断言。发现并修复了路径跨列、设备/目标在桌面列内缩成窄块、移动表格缺少滚动说明，以及部分不可用状态将空观察挤进标题窄列四项问题。没有设置“美观评分”或用测试通过代替人工视觉判断。

[改前桌面](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/overview-20261015/before/overview-desktop-full.png)保留为本次基线；[浏览器运行记录](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/overview-20261015/after/playwright-results.json)及[标准版结果](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/overview-20261015/after/ui-results.json)记录本次实际执行。`web-overview-state.test.ts` 的 4 项测试、前端类型检查、相关 ESLint 和 Vite 构建均通过。Vite 仍报告已有的大分包体积提示；本次未改变依赖或拆包策略。

## 复验命令

在已准备测试 PostgreSQL、依赖与本地 Chromium 的仓库中运行：

```sh
npx vite build
TEST_DATABASE_URL=postgres://baize_dev@127.0.0.1:5432/baize_dev \
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium \
BAIZE_OVERVIEW_TEST_MATCH='**/{overview-redesign,overview-layout,approved-ui}.spec.ts' \
BAIZE_OVERVIEW_EVIDENCE_DIR="$PWD/docs/test-evidence/overview-20261015/after" \
BAIZE_APPROVED_UI_SCREENSHOT_DIR="$PWD/docs/test-evidence/overview-20261015/approved-ui" \
npx playwright test --config playwright.overview-ui.config.ts
```

未执行生产部署、Actions 或 CNB。未声称完成屏幕阅读器、触摸真机、浏览器原生 200% 缩放、所有配色组合对比度或跨浏览器验证；本次证据覆盖 Chromium 的键盘、内容重排及 reduced-motion。页面表保留必要二维比较，因此窄屏仍需要局部横向滚动。


## PHP 运行时标签兼容补充

总览验收之后另补安装诊断和来源标签：响应提供 `runtime.phpVersion` 或 MySQL/MariaDB 后端时，安装诊断显示 PHP 与 Schema 版本；原 Node.js、Schema / SQLite 版本和 Node 进程说明保留。查询来源字典增加 MySQL / MariaDB 显式名称，未知来源仍为 `—`。

类型检查、相关 ESLint、Vite 构建与既有来源字典单元测试通过；对实际新构建前端分别返回受控 PHP/MySQL、Node/SQLite 诊断响应，检查运行时、Schema 与说明文案，保留[结果和源码哈希](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/overview-20261015/after/setup-runtime-labels-controlled.json)、[PHP 诊断截图](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/overview-20261015/after/setup-php-diagnostics-controlled.png)和[Node 诊断截图](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/overview-20261015/after/setup-node-diagnostics-controlled.png)。这是前端响应展示验证，不能代替 PHP 安装器或数据库兼容性测试。总览截图元数据保留原验收构建的真实哈希，后续兼容补充记录自己的新构建哈希。

## PHP 精确金额兼容补充

PHP 的收入聚合以规范十进制字符串返回，原总览只接受 `number`，会把实际微额显示为 `—`。新增 `moneyFormat.ts`：严格校验十进制文本，用 `BigInt` 处理整数分组，小数逐位保留，不先转换成 `Number`，也不按币种小数位舍入。原 Node 数值调用继续使用各调用点原有的普通文本或 Intl 格式；PV、UV 等普通指标格式化不变。

总览、自述收入表、收入归因、身份分币种汇总、身份活动，以及通用报告和来源维度中的金额已接入。币种分别展示，不换汇、不相加；原自述收入和归因边界说明保留。窄屏金额表可以聚焦并局部横向滚动，同一金额保持连续，混币单元格每个币种独立一行。

收入图表只将十进制往返后数值不变的金额字符串转换为坐标；超安全整数或会被舍入、溢出、下溢的文本金额不转换为失真坐标，图中留空并明确指向精确表格。`0.000000000000000001` 可以绘制为非零点，轴采用短科学计数，提示和表格保留原金额。大金额仍完整显示，不以省略的图表点代替未知金额或零。

- `web-money-format.test.ts` 覆盖微额、真实零、超过 `Number.MAX_SAFE_INTEGER` 的金额及小数、千位大数、严格非法文本、混币展示、原 Node 数值格式，以及图表坐标精度边界。连同原总览语义共 9 项单元测试通过。
- `overview-money-format.spec.ts` 通过受控接口响应验证总览、收入、身份及活动、来源普通表和维度表，覆盖 `1e-18`、0、大数与 Node 的 99.95，包含 390 px 和收入披露；[浏览器结果](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/overview-20261015/money/money-ui-results.json)、[混币总览](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/overview-20261015/money/money-overview-desktop-controlled.png)、[微额趋势](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/overview-20261015/money/money-revenue-micro-controlled.png)、[大数完整表格](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/overview-20261015/money/money-revenue-large-controlled.png)、[窄屏身份金额](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/overview-20261015/money/money-identities-mobile-controlled.png)。这些是受控响应，不作为实际 PHP 采集证明。
- 已使用本地 PHP 8099 现有测试会话只读复验，没有替换响应。实际聚合返回 `USD 0.000000000000000002`，总览和收入归因页完整匹配，微额点实际绘制，390 px 无页面溢出；[真实接口结果](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/overview-20261015/money/money-php-real-api-results.json)、[PHP 总览](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/overview-20261015/money/money-php-overview-real-api.png)、[PHP 收入](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/overview-20261015/money/money-php-revenue-real-api.png)、[PHP 窄屏](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/overview-20261015/money/money-php-mobile-real-api.png)。记录不包含本地会话 cookie。

实际打开截图后，修复了摘要大数末位被挤成单独一行、身份窄屏长小数中途换行两项可读性问题。另将死信恢复说明改为“从已持久化事件重新处理”，避免 PHP 版普通操作文案误称 PostgreSQL；Node 原含义保留。

金额补充后的最终回归组（原 38 入口、容器断点、精确金额、真实采集总览、Lite）5 项全部通过，耗时 52.4 秒，0 跳过、0 失败；[最终运行记录](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/overview-20261015/final/playwright-results.json)。类型检查、相关 ESLint 与 Vite 构建通过，已有大分包体积提示未在本次改变。
