# PHP 安装版验证记录（2026-10-15）

> 当前仍在独立复核收尾，新增统计/保留边界变更不能套用下文第一检查点的最终计数；待验清单见 [源码检查点](PHP_REVIEW_CHECKPOINT_20261015.md)。

本轮从 `f26db98fbb727a1b5c6e42d5eeefda2a8bbcd0e6` 独立实现，未取得 Windows `D:\codex存储\2026-10-15\task-5` 草稿，未迁移、覆盖或删除该草稿。原 Node 标准版及 PostgreSQL 迁移、SDK、测试均保留。

## 实际实现

| 范围 | PHP 实现 | 验证依据 |
|---|---|---|
| 安装与认证 | 私有一次性nonce、原子文件发布、写前持久终态、事务认领、恢复封闭、RBAC、Cookie/API Token、CSRF、长密码、离线PSL | `php/tests/kernel.php`、`sso.php` |
| 采集与后台 | 原Tracker协议、事件/订单/回放幂等、属性类型、Node签名排序、脱敏、独立队列租约/重试/死信、单调游标 | `php/tests/collect.php` |
| 分析 | 完整会话上下文、跨保留边界归约头、趋势/来源/页面/受众/性能/内容、转化/严格与非严格漏斗、留存、路径、收入/身份、实验、回放、热图 | `php/tests/analytics.php` |
| 删除与恢复 | 独立删除日志、半开毫秒身份区间、逐帧回放处理、派生清理、旧备份重放、历史namespace、文件附件、授权失效、任务取消、加密备份/完整导出 | `php/tests/governance.php` |
| 外部与AI | Google OAuth/GSC/GA4、完整GA4独立报表、robots/SEO V2、SERP、手动搜索CSV、模型工具证据、原子预算预留与结算、重复调用防护、隐私版本检查 | `php/tests/providers.php`、`governance.php`、`manual-search.php` |
| 实例管理 | 显式企业微信身份映射、GeoIP官方SHA256下载/离线解码、密钥版本轮换、脱敏诊断、只读MCP、人工日期备注 | `php/tests/platform.php`、`keyring.php`、`mcp.php`、`annotations.php` |
| 网页与分发 | 原React/ECharts预构建界面、PHP网页安装、PHP-FPM/CLI、发行清单及安装包 | `php/tests/http.mjs`、`browser.mjs`；实际结果见下文及证据目录 |

此表是实现与测试的索引，不把注册路由、编译通过或模拟提供商响应视为生产验收。实际结果如下；尚未运行的条件继续列在边界中。

## PHP 实测结果

PHP 8.3.35 下，MySQL 8.4.11、MariaDB 11.4.13各自运行11套件并通过。每个数据库的最终断言数：安装/认证59、采集100、分析100、治理91、SSO15、GeoIP/诊断30、密钥15、手动搜索48、供应商94、MCP73、日期备注48，共673。公共PSL和解析案例在不同数据库运行时重复执行，断言数不代表独立功能数。

完整日志中的治理计数为78；随后增加CLI未注册路由、持久日志已写入但数据库删除事务回滚、待导出/缓存通知/已领取外部任务的回归，治理最终91、采集100在两个数据库上重新通过。Worker在调度前配置并重放日志；直接导出、快照、通知及外部任务也在站点锁内确认删除已应用。测试通知transport计数为零，未向外发送消息。日志和逐套件结果见 [套件结果](test-evidence/php-20261015/suite-results.json)、[完整日志](test-evidence/php-20261015/php-dual-database.log.txt)、[最终隐私回归](test-evidence/php-20261015/php-privacy-final.log.txt)。

- 源码HTTP与独立发行包的Nginx 1.28 / PHP-FPM 8.3环境均完成真实网页安装、登录、创建站点、采集重试、统计与浏览器联调，各28项检查通过。FPM与CLI以同一网站用户运行；worker实际处理采集队列。发行运行容器没有Node可执行文件。公开路径不能读取配置、bootstrap或隐藏环境文件。测试地址仅限隔离loopback，不是正式部署；未安装或操作真实1Panel控制面板。
- 当前预构建React前端连接真实PHP/MySQL，39个报告入口分别检查少量/空数据桌面，再对8个关键入口检查390px窄屏，共94状态通过。最终记录555条API GET响应，页面/控制台/API契约/横向溢出错误均为零。未为凑数据模拟管理记录，记录详情与编辑流程由对应业务套件覆盖。见 [浏览器结果](test-evidence/php-20261015/browser-final-results.json)、[独立看图记录与构建哈希](test-evidence/php-20261015/browser-final-review.json)。
- 原Fastify真实注册157条路由，PHP注册152条；参数别名归一后原API路径均有对应。原通配SPA及7个Tracker路径由Nginx静态服务处理；PHP另有capabilities/operations/实验预检入口。此清单仅用于查漏，不能证明处理语义相同，见 [路由清单](test-evidence/php-20261015/routes.json)。
- 发布包18项检查通过，包括严格umask构建、文件和目录模式、完整资源、无实例私密文件/Node依赖、内容篡改/多余文件/符号链接拒绝、保留权限解包后再验证，以及禁止输出覆盖源码。清单含121个运行文件；最终发布包修订、大小和SHA256以交付的清单及收据为准。见 [发布检查](test-evidence/php-20261015/package-publisher.log.txt)。

安装页的一次性nonce、配置和主密钥未记录到证据；测试账号和事件使用`.test`合成数据。桌面和窄屏截图已经分别实际打开查看，截图路径与是否使用受控API夹具均在各自JSON中标明。

## 已完成的原 Node 回归

- 基线单元测试：108文件、568项通过；最终新增金额精度和API异常响应回归后，110文件、578项通过。最终typecheck、全仓lint、Tracker/React/server/updater构建通过。
- PostgreSQL + ClickHouse + Redis 完整集成：193文件、574项通过，2项因首次未提供 PostgreSQL 容器名称而跳过。
- 随后为同一测试数据库配置本地容器，两个签名备份/独立恢复测试均通过，覆盖了上述2项。
- 原Node发布包测试9/9通过；Supervisor实际Git blob与文件清单、归档后文档链接、私密目录拒绝均有检查。
- 首次未构建Tracker、未配置ClickHouse的试跑失败后已停止；这次试跑不计入验收。完整配置后的结果保存在证据目录。

## 边界与使用条件

- MySQL 8.4.11 和 MariaDB 11.4.13 分别在真实服务上测试；不把MySQL通过推断成MariaDB通过。PHP CLI使用8.3，具体运行指纹见证据。
- 外部提供商使用官方形态的注入响应验证分页、错误、竞态和契约；未使用真实Google/企业微信/MaxMind/模型/SERP账号，没有购买、创建凭证或进行付费调用。真实账号连通性仍需用户在自己的HTTPS实例配置后验证。
- PHP不直接恢复Node/PostgreSQL/ClickHouse存档。旧Node scrypt密码没有跨运行时验证器，不能当作兼容；旧AES-GCM信封只在格式与私有原密钥明确时通过兼容测试。原存档必须保留。
- PHP的精确原始分析读取预算为100000条，超限返回409并说明范围，不采样后冒充完整结果。热图、回放、属性与路径的截断或限制由响应显式标记。未验证原Node大规模压测吞吐。
- PHP使用MySQL事务与历史聚合，不伪造ClickHouse权威迁移状态。PHP安装包由主机操作者校验、备份和切换；Node专用增量更新执行器不能用于PHP。CLI `upgrade.php`执行PHP schema迁移与隐私日志重放，不能自动把Node发布包变成PHP包。
- 同意授权沿原Tracker客户端门控；服务端DNT/GPC与隐私过滤已测，不能据此证明任意宿主页已取得有效同意。
- 本轮只运行隔离的本地测试服务，不部署生产，不触发GitHub Actions或CNB，不改变生产安全权限。

测试中曾因本地磁盘满导致浏览器请求中断；该次失败不计入上述最终结果。仅清理本轮已完成的Node测试容器、卷及对应镜像后，重新验证当前构建。原PostgreSQL开发数据、Windows草稿与历史证据没有删除。CLI和FPM权限必须一致，不能用放宽私密文件权限规避。

证据目录：[php-20261015](test-evidence/php-20261015/)。总览单独的整页截图与验收：[总览布局记录](OVERVIEW_LAYOUT_20261015.md)。仓库归档：[整理记录](REPOSITORY_ORGANIZATION_20261015.md)。
