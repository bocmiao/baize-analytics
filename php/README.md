# 白泽 PHP 安装版

PHP 版使用 PHP-FPM、MySQL 和 CLI worker，共用白泽的网页界面与追踪器。

- [安装、1Panel、私有目录与队列](../docs/PHP_INSTALLATION.md)
- [功能范围与 Node 版差异](../docs/PHP_INSTALLATION.md)

发布前先构建 React 界面和 tracker，再运行 `node scripts/package-php.mjs`。接收服务器只需要 PHP 和数据库，不需要 Node.js。

PHP 使用独立的数据表和安装器，不能执行 Node 的 PostgreSQL 迁移或直接恢复其数据库备份。

开发测试：构建 `php/tests/Dockerfile` 后运行 `scripts/verify-php.sh`。每个测试套件使用专用 MySQL/MariaDB 测试库，不要指向正式数据库。
