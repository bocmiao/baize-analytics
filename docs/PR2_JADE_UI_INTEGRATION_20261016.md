# PR2 青玉／墨玉 UI 集成修复（2026-10-16）

> 历史附件已移至固定提交存档，以下结果仍只对应本文日期。原始图片、日志和 JSON 保持不变，见[仓库整理记录](REPOSITORY_MAINTENANCE_20261110.md)。

接续 [PR #2](https://github.com/bocmiao/baize-analytics/pull/2) 的 `52579f1f162d49524d88f0c1e7227881d2d85bf5`，基线 `c087b64b112faf9caefd810b66b37736b8b91fd6`。保留 React / ECharts、青玉／墨玉色彩、鎏金重点、移动导航和动效。原 Node 标准版、Node Lite、PHP 的后端、数据库模型、追踪协议及能力边界没有改变。

## 修复后的行为

| 问题 | 修复 |
| --- | --- |
| 对比开关只隐藏桌面 KPI，手机与比较线仍显示 | 状态传至 View 和总览，同时控制桌面／手机上期与变化、比较线、图例和前期说明。关闭时取消前期读取，保留本期事实；开启正常恢复。手机保留开关、键盘操作和完整点按区域；开关仅在总览出现。 |
| 当天禁止完整前期比较，但“未完结”formatter依赖比较线 | 独立注册 formatter，无比较线的真实 canvas tooltip 也显示末个时间桶“未完结”。保持实际时刻和未知值，未完结范围不输出涨跌；完整比较保留两期实际日期。 |
| 三个主题按钮各存 state，存储异常中断启动或切换 | 共享主题快照，统一按钮、可访问名称、meta及现有图表。真实跨标签 storage 事件同步，保留图表实例。存储被拒绝仍能启动和当页切换，不能保证该环境的持久保存；语言读取也安全降级。 |
| 全局 `.auth` 双栏误伤分享和邀请 | 仅登录／初始化使用 `auth-entry` 双栏。分享、邀请保持居中单列，真实密码解锁与受邀注册继续可用，手机无全局横向溢出。 |

实际联调另修复三项关联问题：删除被 PHP 原 CSP 拦截的重复内联主题脚本，由外部 React 入口在渲染前初始化，**不放宽 CSP**；事实条只在确有页面浏览时显示，避免空范围重复“0次目标完成”撑高空图；将墨玉刻度、洞察说明、筛选控件及对比文字接入语义色。浏览器对四类相关文字合成真实 RGBA 背景后检查，两主题均达到4.5:1；不称全站可访问性认证。

## 实际验证

最终 `dist/web/index.html` SHA-256：`727b05cf98835a08e3c2d48406a3d69349b593d263460e0ff2b119d44468282f`。PHP 使用同次预构建文件；另以 HTTP GET 核对资源指纹。

| 本轮检查 | 结果与证据 |
| --- | --- |
| 专项浏览器 | **6/6**，桌面／390px对比、canvas提示、同页／跨标签主题、拒绝存储、真实分享及邀请；[结果](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/pr2-jade-20261016/fixed/playwright-results.json) |
| 原 Node／Lite 浏览器 | **5/5组**，含标准版38入口、真实PG采集／聚合、多／少／空／长中文、320–1440px及容器断点、权限、错误重试、键盘、reduced-motion、精确金额及Lite；[结果](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/pr2-jade-20261016/regression/playwright-results.json) |
| PHP HTTP | **29/29**，含采集重试、鉴权、安装终态、微额收入和预构建网页；[结果](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/pr2-jade-20261016/php-http/http-results.json) |
| PHP 青玉／墨玉报告 | **各94/94状态**：39入口×少量／空数据桌面，以及8关键入口×少量／空数据390px。检查实际主题、控制台、网络、契约、金额和全局溢出；[青玉](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/pr2-jade-20261016/php-browser/browser-jade-light-results.json)、[墨玉](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/pr2-jade-20261016/php-browser-dark/browser-jade-dark-results.json) |
| 单元／静态／构建 | **584/584**，新增5项tooltip语义；typecheck、全仓lint、Tracker／React／server／updater完整构建通过；[单测日志](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/pr2-jade-20261016/unit-final.log.txt) |
| 发布／文档 | Node发布检查 **9/9**、PHP **18/18**，文档目标及39份归档原文校验通过；同目录保留日志 |

专项的确定性统计、未完结和长路径采用显式控制响应，认证／站点仍连接真实 Node Lite，不把数字当生产测量。原报告回归连接真实 PG／SQLite，空／错误／长文字的受控案例另有 controlled 标记。分享、邀请连接真实 Node PostgreSQL。PHP报告连接真实 PHP HTTP + MySQL，不替换后台响应、不调用模型或外部提供商。

桌面、390px、两主题、对比关闭、提示、分享、邀请和空状态的最终截图已经实际打开检查；图片与观察见 [人工复核](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/pr2-jade-20261016/visual-review.json)，汇总及实际资源指纹见 [收据](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/pr2-jade-20261016/receipt.json)。不宣称覆盖所有浏览器、屏幕阅读器或真机。管理列表的空记录不当作已测试全部详情编辑。

## 修复前与过程记录

用 `git archive 52579f1` 独立构建原PR2，运行同一专项，6项均失败。首次桌面鼠标操作受1px输入框遮挡；键盘重试明确复现关闭后仍有3个比较点。见 [基线](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/pr2-jade-20261016/negative-baseline.json)、[失败日志](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/pr2-jade-20261016/browser-before.log.txt)、[键盘复现](https://github.com/bocmiao/baize-analytics/blob/3dac02284c4dee43b891a65c85e8b1da46a1bc7c/docs/test-evidence/pr2-jade-20261016/browser-before-desktop.log.txt)。

手机点击、空图和PHP CSP的中间失败保留于 `intermediate/`、`regression-intermediate/`、`php-csp-before-fix/`。颜色测试工具最初不识别 `color(srgb … / alpha)`，改用浏览器原生RGBA并合成背景后重验；该工具错误不计作产品失败或最终通过。最终结果分别位于 `fixed/`、`regression/` 和两个PHP主题目录，不覆盖历史证据。

本轮未重跑原PHP双数据库961项业务套件，也不把2026-10-15的Node完整集成次数算作本轮通过。PHP原始事件预算、Node存档／scrypt限制、真实提供商及生产容量未验范围继续有效，见 [能力矩阵](PHP_PARITY_MATRIX_20261015.md)。未触发Actions/CNB，未部署、购买、创建凭证或修改生产安全权限。
