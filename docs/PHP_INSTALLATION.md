# PHP + MySQL 网页安装版

最终已验安装包、SHA-256、双数据库运行记录及剩余边界见 [2026-10-15 交付收据](PHP_DELIVERY_20261015.md)。

原 Node.js 标准版继续保留，原安装入口为仓库根目录 `install.sh`、`docs/PANEL_INSTALLATION.md`。本目录说明独立的 PHP 运行时，代码在 `php/`，安装包只携带预构建的 React / ECharts 前端和 tracker；接收服务器不需要 Node.js。

PHP 版使用独立的 InnoDB 文档表、事务锁行及队列租约，不执行 PostgreSQL 迁移，不将原库直接切换为 MySQL。原版的数据存档、scrypt 密码、加密设置和 ClickHouse 权威存储必须保留；没有经过验证的迁移工具时，不能直接复制表或替换正在运行的实例。PHP 目标为标准版功能；具体实现和测试边界请同时阅读随本次交付记录提供的功能对照，不把入口可用当作完整兼容证明。

## 运行条件

- PHP 8.3 或更新版本，启用 `pdo_mysql`、`curl`、`mbstring`、`dom`、`Phar`、`openssl`、`zlib`、`intl`；地域库纯 PHP 解码还需 `bcmath` 或 `gmp`。CLI 与 PHP-FPM 使用同一版本、扩展、配置路径和网站运行用户。
- MySQL 8.4，InnoDB、UTF-8。MariaDB 必须按交付记录中的实际版本和业务测试单独判断。
- 1Panel 网站的运行目录只指向安装包的 `public/`。配置、主密钥、删除日志和备份均在 `public/` 之外。
- 使用自己的 HTTPS 域名完成网页安装。数据库密码、供应商密钥在自己的安装页填写，不要发到聊天、工单或公开日志。
- 使用 PHP CLI 常驻队列，或 1Panel 每分钟执行一次计划任务。网站进程不承担可靠后台调度。

## 准备安装包

这是发布端操作；只在有源码和 Node.js 的构建环境执行：

```sh
npm ci
npm run build
node scripts/package-php.mjs --output /absolute/new/baize-php --archive /absolute/new/baize-php.tar.gz
node scripts/package-php.mjs --verify /absolute/new/baize-php
```

输出目录必须是新目录。打包清单包含每个文件的长度、SHA-256及权限，记录源码修订和构建时是否有未提交改动。代码目录为755、文件为644、CLI文件为755，空私有目录为700，不受发布环境umask影响。校验应在安装前、未加入实例配置时执行。打包脚本不递归复制仓库、私有配置、数据库、测试证据或 `node_modules`。

## 在 1Panel 安装

1. 创建 PHP 8.3+ 网站和独立数据库。解压安装包，将网站运行目录设为包内 `public/`；配置 HTTPS。命令行解压使用 `tar --same-permissions -xzf baize-php.tar.gz -C /your/new/directory` 保留包内权限；面板解压后按清单检查代码可读、私有目录为700。Nginx 规则参考包内 `deploy/nginx.conf.example`，其 PHP-FPM 地址需换为该站点现有运行环境的地址。
2. 为网站进程准备私有配置及数据目录，所有者设置为该网站实际PHP运行用户；目录700、配置和密钥文件600。代码保持目录755、文件644，不要将整个包改为私密或可写。可使用默认 `private/`，或在 PHP-FPM 与 CLI 共同设置 `BAIZE_CONFIG_PATH=/var/lib/baize-php/config.php`。不要通过 URL 读取配置、nonce 或主密钥。
3. 以 PHP-FPM 网站的同一运行用户，在同一 PHP 环境执行 `php bin/install.php --prepare`。命令显示私有安装凭据文件的位置；从服务器上读取后，在自己的 HTTPS 安装页输入。凭据不得放在查询字符串中。
4. 打开 `/install.php`，填写数据库连接、公开 HTTPS 地址、安装凭据和管理员信息。安装提交使用持久状态与数据库事务完成管理员认领。完成后安装入口关闭；删除所有用户也不能重新开放安装。
5. 登录后创建站点，按页面说明安装 tracker，再发送一个真实页面访问验证采集、统计、时区和隐私模式。
6. 配置 CLI worker。Supervisor 示例在 `deploy/worker.supervisor.conf.example`；计划任务示例在 `deploy/cron.example`。两者择一，确保配置路径与网站一致。常驻命令为 `php bin/worker.php --loop`，计划任务为 `php bin/worker.php --once`。

手动 CSV 导入允许5 MiB文件、最多100,000行；JSON封装需要较大的请求上限。示例使用 Nginx `client_max_body_size 32m`、PHP `post_max_size=32M`、`memory_limit=512M`、`max_execution_time=120`。采集接口仍在应用内限制为1 MiB。不要放宽私有文件的600/目录700权限来解决运行用户不同的问题。

不要使用 PHP 内置开发服务器承载正式网站；本地联调可用 `php -S 127.0.0.1:8080 -t public public/router.php`。

## 后台更新

签名完整包安装、后台检查与确认、独立 PHP-FPM/worker 监管、Docker 持久版本目录、离线导入和受控迁移见 [PHP 后台更新指南](PHP_BACKGROUND_UPDATES.md)。首次接入需主机操作者安装独立伴随执行器，原始旧包不能通过其 409 接口自行完成首次安装。

## 备份、恢复、升级

备份不只包括数据库，还需要当前及历史主密钥、独立删除日志和配置。必须独立保留当前 `data_dir/privacy-deletions.jsonl`、`data_dir/privacy-watermark.json` 与 `key_dir/privacy-journal-identity.json`；这里的 `data_dir`、`key_dir` 指实例配置中的私有路径。数据库回滚后必须在对外服务之前重放保留下来的删除日志，防止旧备份使已经删除的访客、回放帧和派生内容重新出现。不得用旧备份覆盖较新的独立删除日志。恢复会验证删除日志身份；缺失日志或误建的空日志不能用于恢复旧备份，不能通过重新安装绕过。

操作入口为包内 `bin/backup.php`、`bin/restore.php`、`bin/export.php` 和 `bin/upgrade.php`；执行参数与验证结果以本次交付记录及各命令的帮助输出为准。升级前保留完整可恢复副本，升级后验证安装仍为终态、历史 namespace 未丢失以及删除日志重放结果。不能只验证数据库连接就删掉旧版。

```sh
php bin/backup.php /private/backups/baize-php.enc
php bin/restore.php /private/backups/baize-php.enc --replace
php bin/export.php SITE_ID /private/exports/site.json
php bin/upgrade.php
```

这些命令使用与网站相同的配置和运行用户；示例路径需替换为自己的私有目录。`--replace` 会替换目标实例数据，恢复前停止对外访问及队列，先保存当前完整副本。CLI worker在执行导出、通知或外部任务前先修复持久删除日志，避免数据库事务回滚后泄露已删除的数据。

## 兼容边界

PHP 存储采用文档记录与按站点锁定的事务，可保存原始明细和配置；其吞吐与原版 PostgreSQL / ClickHouse 的容量模型不同。本次测试数据量只能证明所记录的业务条件，不能外推到原版压测规模。需要原版的大规模权威存储、实例增量更新协议或已有 Node 数据库原位升级时，继续使用 Node 标准版。

旧 Node scrypt 密码需要经过验证的重哈希迁移或独立重置；PHP 不会将不能验证的旧哈希当作有效密码。AES-GCM 历史信封只能在密钥与格式均明确时解密，不能据此承诺所有历史数据库直接兼容。外部供应商调用需要用户自己配置凭据；模拟提供商测试不等于真实账号联通。
