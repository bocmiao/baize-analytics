# 文档导航

先按运行时选择安装指南，再查操作与实现资料。原 Node 标准版继续保留；独立的 PHP + 数据库版本面向 PHP-FPM 与 1Panel，目标是完整标准功能，不能按 Lite 的能力边界理解。PHP 的实际实现、数据库兼容性和未验收项以其专属说明为准。

| 任务 | 入口 |
| --- | --- |
| 运行原 Node 标准版或 Node Lite | [部署与首次使用](deployment-methods.md)、[1Panel／宝塔 Node 托管](PANEL_INSTALLATION.md) |
| 安装独立 PHP + 数据库版 | [PHP 安装与验证边界](PHP_INSTALLATION.md) |
| 核对运行包依赖与内容 | [Node 发布包](release-packages.md)、[原生维护](release-native-ops.md) |
| 备份、升级或迁移 | [迁移与恢复](migration.md)、[实例增量更新](INSTANCE_INCREMENTAL_UPDATES.md)、[Lite → Node 标准版](lite-migration.md) |
| 使用 API 与连接器 | [API 手册](api.md)、[MCP](mcp.md)、[手动搜索导入](MANUAL_SEARCH_IMPORT.md) |
| 修改源码与核对实现 | [开发](development.md)、[项目规格](PROJECT_SPEC.md)、[逐项实现清单](IMPLEMENTATION_CHECKLIST.md)、[当前状态](STATUS.md) |
| 查旧版本与原始证据 | [历史文档归档与原路径映射](archive/README.md)、[仓库整理说明](REPOSITORY_ORGANIZATION_20261015.md) |
| 阅读英文手册 | [English guides](en/README.md) |

`test-evidence/` 保存实际测试结果，`performance/` 保存固定负载及性能研究证据，`screenshots/` 保存各轮界面证据，`validation/` 保存安装、恢复和交付的原始材料。它们不是安装输入，也不能把不同 SHA 的计数累加为当前版本通过。

`ci-reference/` 是停用工作流的历史副本，禁止放回 `.github/workflows` 或据此触发 Actions/CNB。仓库整理不触发托管流水线，也不进行生产部署。
