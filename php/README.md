# 白泽 PHP 标准功能安装版

保留原 Node.js / PostgreSQL 标准版，另提供 PHP + MySQL 网页安装入口。原版代码、数据库迁移、SDK 和测试均在仓库原位置。

- 安装、私有目录、1Panel 和队列：[PHP 安装指南](../docs/PHP_INSTALLATION.md)。
- 实际实现、测试与兼容边界：[PHP 验证记录](../docs/PHP_VALIDATION_20261015.md)。
- 发布端先构建原 React / ECharts 与 tracker，再运行 `node scripts/package-php.mjs`；接收服务器只运行 PHP 和数据库。
- PHP 不直接执行 Node 的 PostgreSQL 迁移或恢复其存档；保留原实例及所有旧存档，按验证记录处理迁移边界。

测试使用独立的本地 MySQL 3307 / MariaDB 3308 测试服务，构建 `php/tests/Dockerfile` 后可运行 `scripts/verify-php.sh`。每个套件使用专用测试库；不得指向正式数据库。
