# PHP 安装版最终交付收据（2026-10-15）

原 Node 标准版继续保留。本轮从 `f26db98fbb727a1b5c6e42d5eeefda2a8bbcd0e6` 独立实现 `php/`，使用原 React / ECharts 预构建网页，面向 PHP-FPM、MySQL 和 1Panel。它的业务范围包含采集、分析、收入、回放、热图、连接器、AI、权限、隐私删除、备份与维护，不按 Node Lite 删减入口；实际差异和仍未验证的条件见下文，不宣称与原 Node 在全部语义和容量上等价。

## 冻结源码与安装包

安装包绑定已经正常推送的实现提交 [8ee220f17ed921e92f775bc3b93e8380f05e8318](https://github.com/bocmiao/baize-analytics/commit/8ee220f17ed921e92f775bc3b93e8380f05e8318)。构建时工作树干净；其后的提交仅补充本收据与最终运行证据，不回写包内容。

| 项目 | 实际值 |
| --- | --- |
| 本执行环境中的包 | `/workspace/baize-analytics/.baize/releases/baize-php-8ee220f.tar.gz` |
| 字节数 | 1,912,027 |
| SHA-256 | `560455292f59af694b5fa2eefa3274c6b545e6d6636e1f52323c0f635166cb7e` |
| 清单 | `php-release-manifest.json`，121 个运行文件，`workingTreeChanges:false` |
| 清单 SHA-256 | `cd27ff10dc987f39fec310850ea605a2dba00a8e337bb6f074469963736b2d27` |
| 实际 HTTP index SHA-256 | `2d3cffa5760a3e1fa4a9ae73d360e6c0647eecf3b859898ce0b9c8be147521c1` |

包已经实际按 `tar --same-permissions` 解包，并用发布校验器重新核对内容、文件清单与权限。包不含实例配置、密钥、nonce、数据库或 Node 依赖；网站运行目录必须设为 `public/`。安装与维护步骤见 [安装指南](PHP_INSTALLATION.md)。没有发布 GitHub Release、注册表镜像或生产网站；本环境内的包路径不能当作公共下载 URL。

随包 `VALIDATION.md` 保留构建时的验证记录；最终封装后的检查次数、实际数据库身份和资源指纹以本收据及 [机器运行记录](test-evidence/php-20261015/fpm-final-runtime.json) 为准。发布端可从冻结提交按指南重建，时间字段变化意味着重建归档不保证字节相同。

## 同一源码和最终包的实测

| 检查 | 结果及证据 |
| --- | --- |
| PHP CLI 全业务回归 | MySQL 8.4.11、MariaDB 11.4.13 **各 961/961**；同一冻结源码、11 套件逐套串行，包含删除日志/旧备份、RR 双连接队列、历史水位及 AI 分阶段幂等；[汇总](test-evidence/php-20261015/suite-results.json)、[完整日志](test-evidence/php-20261015/php-dual-database-final.log.txt) |
| 最终包 MySQL HTTP | Nginx 1.28.0 + PHP-FPM 8.3.35，持有原测试私有状态后执行最终包升级，**29/29**；[结果](test-evidence/php-20261015/fpm-final/http-results.json) |
| 最终包 MariaDB 网页安装与 HTTP | 同一最终包、独立空数据库，网站用户执行 prepare、真实安装 POST 303、登录及创建站点，再 **29/29**；[安装](test-evidence/php-20261015/fpm-mariadb-final/web-install.log.txt)、[HTTP](test-evidence/php-20261015/fpm-mariadb-final/http-results.json) |
| 最终包只读浏览器 | 39 个报告 × 少量/空数据桌面，加 8 个关键入口 × 少量/空数据 390px 窄屏，**94/94**、560 次 API GET；页面错误、API 契约错误及全局横向溢出均为零；[结果](test-evidence/php-20261015/fpm-final/browser-release-results.json)、[独立看图](test-evidence/php-20261015/fpm-final/browser-release-review.json)、[实际 HTTP 资源指纹](test-evidence/php-20261015/fpm-final/browser-release-asset-verification.json) |
| 最终包删除后的新完整导出 | 两种数据库分别真实采集、重试、删除访客、CLI 生成 JSON/CSV、下载扫描所有导出表；均没有已删回放路径、visitor 或 page 标识，重试仍被拒绝；[MySQL](test-evidence/php-20261015/fpm-final-receipts/results.json)、[MariaDB](test-evidence/php-20261015/fpm-mariadb-final-receipts/results.json) |
| 安装包发布检查 | **18/18**，包括严格 umask、权限、资源、篡改/额外文件/外逸链接拒绝和真实 tar 解包；[发布测试](test-evidence/php-20261015/package-publisher.log.txt)、[最终包指纹](test-evidence/php-20261015/package-final-release.log.txt) |
| 原 Node 回归 | 最终单测 **579/579**；完整 PG/CH/Redis 集成 **574 通过、2 初次跳过**，随后原 2 个备份/恢复案例均另行通过；typecheck、lint、完整构建通过；[验证记录](PHP_VALIDATION_20261015.md) |
| 原 Node 打包 | **9/9**，包含 Supervisor 原字节、同 SHA 文档目标和私有目录拒绝；[最终日志](test-evidence/php-20261015/node-package-final-release.log.txt) |

两套最终 FPM 容器均确认没有 Node 可执行文件。FPM 与 CLI worker 使用同一网站用户 `33:33`；worker 实际完成队列任务。两套站点的 `/private/config.php`、`/bootstrap.php` 为 404，`/.env` 为 403，管理员更新状态实际读到包内实现修订和清单哈希。HTTP 测试脚本的 `browser.backend` 有历史固定文字 MySQL；MariaDB 的身份由该实例真实 `/api/admin/operations` 的 `11.4.13-MariaDB-ubu2404` 单独证明，不能从此固定文字推断数据库。

浏览器没有拦截后台响应；使用 `.test` 合成站点和事件，没有真实凭证或付费提供商调用。桌面和窄屏截图已独立实际打开检查，包版本与网页资源通过 HTTP GET 另行核对。早期预览包、磁盘满中断及修复前失败证据保留，不能累加成最终通过数。证据不记录 cookie、安装 nonce、配置内容或主密钥。

## 同时完成的总览与仓库整理

总览把本期观察放到趋势下方，热门页面与会话入口合为保留五列比较的页面表，来源、地域、设备按内容分组。没有机械等高或增加无关数据填空。原 Node 真实 PG 数据、Lite、长中文、空/少/多数据及窄屏另有 [截图与验收](OVERVIEW_LAYOUT_20261015.md)。最终 PHP/MySQL 和 PHP/MariaDB 的实际少量数据截图也保留在上述运行目录。

39 份历史文档移入归档，原路径、Git blob、前后 SHA 与理由均有记录；1,518 个原证据文件保留，其中 1,496 个非 Markdown 原始 blob 不变。Node 源码、迁移、SDK、测试和原安装入口保留，停止的 CI 参考未恢复。原 Node 包的 Supervisor 白名单和冻结文档链接已修复。见 [仓库整理记录](REPOSITORY_ORGANIZATION_20261015.md) 和 [归档映射](archive/moves-20261015.json)。不以归档宣称镜像或内存收益。

## 使用前仍需面对的边界

- **尚未实测**真实 1Panel 控制面板、域名 HTTPS、用户 Google/企业微信/MaxMind/模型/SERP/SMTP 账号、生产并发和跨物理机灾备。提供商验证采用注入响应，不能作为真实账号连通性或模型质量证明。用户秘密只在自己的 HTTPS 实例填写。
- PHP 原始分析读取预算按站点全部保留事件计 **100,000 条**，超限明确 409；缩短查询日期不能绕过。不具原 Node PostgreSQL/ClickHouse 的已验证大规模处理能力。保留期外只使用完整且有证据的小时聚合；缺少旧关系事实、已裁剪边界小时晚到和缺失旧热图均明确不可用，不能将未知显示为零。
- 不直接导入 Node PostgreSQL/ClickHouse 归档或验证旧 Node scrypt 密码。特定 AES-GCM 兼容测试要求格式和原密钥明确；没有通用转换器，原版和原存档必须保留。
- PHP 使用精确十进制收入字符串、逐帧回放裁剪、短 SSE 重连及手动包升级；原 Node 在相应接口上有不同类型或行为。逐接口、统计与安全差异见 [能力矩阵](PHP_PARITY_MATRIX_20261015.md)，路由覆盖不能证明全部语义等价。

本轮没有访问、迁移、覆盖或删除 Windows `D:\codex存储\2026-10-15\task-5` 草稿。没有触发 Actions/CNB，没有生产部署、购买或创建供应商凭证，也没有修改生产安全权限。没有待审批的本轮实现动作；上述外部条件及明确能力差异仍然保留，不能据此宣布完整标准等价验收结束。
