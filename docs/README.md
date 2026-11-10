# 文档导航

先选择运行方式，再查接入、维护和开发文档。Node 标准版、Node Lite 和独立 PHP 版的数据库、安装入口与维护命令不同。

## 安装与接入

| 任务 | 入口 |
| --- | --- |
| 安装 Node 标准版或 Lite | [部署与首次使用](deployment-methods.md) · [Docker、HTTPS 与反向代理](deployment.md) |
| 在 NAS 固态硬盘上部署测试实例 | [SSD 目录、独立 Compose 与采集验证](NAS_TESTING.md) |
| 使用 1Panel / 宝塔托管 Node | [安装与网页初始化](PANEL_INSTALLATION.md) |
| 安装独立 PHP + MySQL 版 | [PHP 安装](PHP_INSTALLATION.md) · [PHP 功能对照](PHP_PARITY_MATRIX_20261015.md) |
| 使用预编译 Node 包 | [包内容与平台要求](release-packages.md) · [原生维护](release-native-ops.md) |
| 接入网站、WordPress 或小程序 | [API 手册](api.md) · [WordPress 插件](../plugins/wordpress/README.md) · [Tracker 与 SDK](../packages/tracker/README.md) |
| 阅读英文手册 | [English guides](en/README.md) |

## 使用与维护

| 任务 | 入口 |
| --- | --- |
| 配置隐私、同意与数据保留 | [隐私说明（英文）](en/privacy.md) |
| 配置地域、运营商、独立 IP 和流量预测 | [流量数据配置](TRAFFIC_DATA_SETUP.md) · [报表范围](51LA_ALIGNMENT.md) |
| 配置目录规则、推广链接和二维码 | [目录与推广管理](CONTENT_CAMPAIGN_SETUP.md) |
| 分享只读看板、嵌入图表 | [授权与图表嵌入](SHARED_DASHBOARDS.md) |
| 接入服务器蜘蛛访问日志 | [签名上报、重试与查询](spider-log-ingest.md) |
| 使用 MCP 或导入搜索数据 | [MCP](mcp.md) · [手动搜索导入](MANUAL_SEARCH_IMPORT.md) |
| 备份、恢复与迁移 | [迁移与恢复](migration.md) · [Node 原生维护](release-native-ops.md) · [Lite 维护](lite-deployment.md) |
| 从 Lite 迁移到 Node 标准版 | [Lite → 标准版](lite-migration.md) |
| 核对实例更新要求 | [实例增量更新](INSTANCE_INCREMENTAL_UPDATES.md) |
| 使用 ClickHouse 扩展存储 | [ClickHouse 运维](clickhouse-operations.md) |

## 开发与版本记录

| 任务 | 入口 |
| --- | --- |
| 修改源码和运行测试 | [开发指南](development.md) · [贡献说明](../CONTRIBUTING.md) |
| 查项目设计与功能范围 | [项目规格](PROJECT_SPEC.md) · [逐项实现清单](IMPLEMENTATION_CHECKLIST.md) |
| 核对 51.LA 对应功能与实现差异 | [完整功能对照](51LA_FUNCTION_MATRIX.md) |
| 查版本状态与验收记录 | [状态记录](STATUS.md) · [完整目标核对](PROJECT_ACCEPTANCE_MATRIX.md) |
| 核对依赖许可证 | [依赖与许可证](licenses/README.md) |
| 查旧文档与原始路径 | [历史文档归档](archive/README.md) · [仓库整理记录](REPOSITORY_ORGANIZATION_20261015.md) |
| 查本次文件清理与历史附件 | [仓库维护记录（2026-11-10）](REPOSITORY_MAINTENANCE_20261110.md) |

历史资料按版本保存：`test-evidence/` 是测试结果，`performance/` 是性能研究，`screenshots/` 是界面验证，`validation/` 是安装、恢复和交付材料。部分旧附件已从当前目录移出，改用固定提交链接访问，具体位置见 [维护记录](REPOSITORY_MAINTENANCE_20261110.md)。这些资料不是安装所需文件，其中的测试数量与截图只对应各自记录的源码版本。

`ci-reference/` 保存停用工作流的历史副本。启用或修改托管流水线前，应重新核对其依赖、权限与触发条件。
