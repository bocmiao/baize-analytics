# 文档导航

Node 标准版、Node Lite 和 PHP 版使用不同数据库与维护命令。先选择运行方式，再查看对应指南。

## 安装与接入

| 任务 | 入口 |
| --- | --- |
| Node 标准版或 Lite | [部署方式](deployment-methods.md) · [Docker 与 HTTPS](deployment.md) |
| NAS 固态硬盘测试 | [SSD 目录与独立实例](NAS_TESTING.md) |
| 1Panel / 宝塔托管 Node | [面板安装](PANEL_INSTALLATION.md) |
| PHP + MySQL | [PHP 安装与兼容边界](PHP_INSTALLATION.md) |
| 预编译 Node 包 | [发布包](release-packages.md) · [原生维护](release-native-ops.md) |
| 网站、WordPress、小程序 | [API](api.md) · [WordPress 插件](../plugins/wordpress/README.md) · [Tracker 与 SDK](../packages/tracker/README.md) |
| 英文文档 | [English guides](en/README.md) |

## 使用与维护

| 任务 | 入口 |
| --- | --- |
| 隐私、同意与保留期限 | [隐私说明](en/privacy.md) |
| 地域、运营商、独立 IP 与流量预测 | [流量数据配置](TRAFFIC_DATA_SETUP.md) |
| 目录规则、推广链接、二维码 | [目录与推广](CONTENT_CAMPAIGN_SETUP.md) |
| 只读看板与嵌入图表 | [分享指南](SHARED_DASHBOARDS.md) |
| 服务器蜘蛛访问日志 | [签名上报与查询](spider-log-ingest.md) |
| MCP 与搜索数据导入 | [MCP](mcp.md) · [手动导入](MANUAL_SEARCH_IMPORT.md) |
| 备份、恢复、升级 | [迁移与恢复](migration.md) · [原生维护](release-native-ops.md) · [Lite 维护](lite-deployment.md) |
| Lite 迁移到标准版 | [离线迁移](lite-migration.md) |
| 实例更新 | [增量更新与回滚](INSTANCE_INCREMENTAL_UPDATES.md) |
| ClickHouse 与历史存储 | [副本运维](clickhouse-operations.md) · [历史快照](history-operations.md) · [来源不明的恢复](RAW_RETIREMENT_059_RECOVERY.md) |

## 开发

| 任务 | 入口 |
| --- | --- |
| 修改源码与测试 | [开发指南](development.md) · [贡献说明](../CONTRIBUTING.md) |
| 统计规则与运行约束 | [统计口径](analytics-correctness.md) · [Lite 实现](lite-implementation.md) · [兼容性](compatibility.md) |
| 构建与发布 | [镜像内容](runtime-artifact.md) · [发布包](release-packages.md) · [手动 CI 与镜像同步](cnb-ci.md) |
| 许可证 | [依赖与许可证](licenses/README.md) |
