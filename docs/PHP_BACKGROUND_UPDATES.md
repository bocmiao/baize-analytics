# PHP 后台更新、签名安装与离线导入

PHP/MySQL 现在使用“设置 → 系统更新”的真实检查、预览、确认、独立执行、进度与代码回滚。只有安装时认领实例的全局拥有者可操作；其他全局管理员、站点管理员和 API Token 均不能更新。旧安装没有认领记录时，主机操作者需在私有配置绑定经过核对的现存拥有者 UUID。页面不能改变账号、发布源、公钥、命令或主机权限。

正式 GitHub Releases／签名更新源目前没有发布，本次隔离源和测试密钥不能用于生产。这里交付发行和接入工具；没有替真实主机安装服务、生成生产签名密钥或部署。

## 首次接入的运行合同

网站仍运行 PHP；独立伴随执行器需要 Linux amd64、Node 24、flock、PHP 8.3+ CLI/FPM、Nginx，PHP 扩展为原安装指南要求加 pcntl。执行器使用非 root 的专用实例用户，与 FPM、worker 访问相同的私有配置。它监管固定 FPM、Nginx 和单个 worker，不接受任意服务命令。Nginx 监听高端口，由现有 HTTPS 代理转发；不要同时保留旧 FPM 池、cron、worker 或其他数据库写入者。

执行器和 Node 放在应用版本目录之外。首次切换先停止旧写入者、验证恢复点、导入受信新包，再启动独立服务；旧版 80bda57 的 409 接口不能自行安装这一步。`installPhpRelease` 只写新版本目录，不改配置、数据库、密钥或账号。签名验证证明发行者身份，不是代码沙箱；必须独立核对发行公钥指纹。

私有配置文件及环境文件权限 0600，状态、数据、密钥与版本目录 0700，属于同一实例用户。实例配置和数据/密钥必须放在发布目录之外。示例路径需换成真实绝对路径：

```json
{
  "version": 1,
  "ownerId": "核对过的现存实例拥有者UUID",
  "agentDir": "/var/lib/baize/updater",
  "releasesDir": "/var/lib/baize/releases",
  "initialRoot": "/var/lib/baize/releases/已签名版本",
  "initialManifestSha256": "从独立可信发行清单核对的64位SHA256",
  "dataDir": "/var/lib/baize/data",
  "keyDir": "/var/lib/baize/keys",
  "envFile": "/etc/baize/runtime.env",
  "nodePath": "/usr/local/bin/node",
  "publicUrl": "https://analytics.example.com",
  "php": {
    "phpPath": "/usr/bin/php",
    "fpmPath": "/usr/sbin/php-fpm8.3",
    "nginxPath": "/usr/sbin/nginx",
    "configPath": "/etc/baize/config.php"
  },
  "source": {
    "offlineDirectory": "/var/lib/baize/offline",
    "keys": {"发行者预先核验的key-id": "独立核对过的Ed25519 SPKI PEM公钥"}
  }
}
```

环境文件不执行 shell，按 Node `parseEnv` 语法解析：

```text
DATA_DIR=/var/lib/baize/data
KEYS_DIR=/var/lib/baize/keys
PUBLIC_URL=https://analytics.example.com
BAIZE_CONFIG_PATH=/etc/baize/config.php
BAIZE_PHP_SINGLE_INSTANCE=1
HOST=127.0.0.1
PORT=3000
```

`config.php` 中 `data_dir`、`key_dir`、`public_url` 必须与上述绑定一致；保留已有数据库配置与全部密钥版本。`BAIZE_PHP_SINGLE_INSTANCE=1` 是操作者对已停止外部写入者的确认，不是对其他数据库账号的技术隔离保证。备份额外拒绝可见的同库连接。

由现有 systemd/Supervisor 托管固定命令：

```sh
node /opt/baize-updater/baize-updater.mjs --config /etc/baize/updater.json
```

systemd 使用 `KillMode=control-group`、完整停止超时至少 60 秒。独立看门进程在父执行器断开时写入维护门闩并排空受管子进程；恢复会核对旧看门进程已退出。未知/未停止状态拒绝接管，不通过删除锁、门闩或状态文件绕过。

## 发布侧构建与签名

在冻结且干净的准确源码提交上构建；新包记录真实 Git SHA，不将历史包改名冒充新版本：

```sh
npm ci
npm run build
node scripts/package-php.mjs --output /absolute/new/release --updatable
node scripts/package-php.mjs --verify /absolute/new/release
npm run build:updater
```

`--updatable` 不包含默认私有目录，另生成完整内容清单 `release-manifest.json`，不包含实例配置和密钥。接收方可单独运行伴随执行器，无需 npm 安装、构建或修改 PHP 网站依赖。

使用发布者已经提供的离线 Ed25519 私钥文件（0600）；以下工具不会生成密钥、上传文件或创建 Release：

```sh
node dist/updater/baize-php-distribution.mjs --publish /absolute/new/release --output /absolute/new/install-bundle --key-file /offline/existing-key.pem --key-id TRUSTED_KEY_ID
node dist/server/scripts/publish-native-update.js --base /absolute/trusted/base --target /absolute/new/release --output /absolute/new/delta --key-file /offline/existing-key.pem --key-id TRUSTED_KEY_ID --label VERSION --notes-file /absolute/notes.json
```

完整安装目录为 `install.json + blobs/<sha256>`；增量目录为 `latest.json + blobs/<sha256>`。保留这些名称和字节，可按普通文件目录归档、传输；接收方工具不直接解压不可信 tar。实际迁移 SQL 与 `src/Database.php` 指纹有变化时，增量发布和执行都会拒绝。脏工作区 PHP 包只允许内部显式 fixture 路径，不接受为正常发行。

## 安装与离线更新

先通过独立渠道绑定公钥、基础清单 SHA256 和私有配置，再用伴随工具导入完整初始包：

```sh
node /opt/baize-updater/baize-php-distribution.mjs --config /etc/baize/updater.json --bundle /absolute/received/install-bundle
```

目标必须是 `releasesDir` 的一个全新直接子目录。签名、清单、每个文件长度和 SHA256 均校验；先写临时版本，持久化后原子安装。失败不覆盖既有版本。中断的 `.install-*` 仅是未启用候选，操作者核实无任务后再处理。

离线增量由主机维护者导入，不经浏览器上传任意路径：

```sh
node /opt/baize-updater/baize-import-update.mjs --config /etc/baize/updater.json --bundle /absolute/received/delta
```

导入先核验当前基础、签名、结构兼容和全部 blob，再原子发布本地 `latest.json`。中断的 `latest.pending` 保留并要求主机检查，不自动相信未完成导入。之后拥有者在后台检查更新、阅读发行说明与变化清单、确认维护窗口，再执行更新。PHP-FPM 先持久接收操作、完成网页响应，再确认执行；确认中断十秒后标为中断，保留旧服务并允许重新检查。执行器重启也不会执行未确认的请求。页面显示目标与当前 revision、清单 SHA256、预计下载量、备份及各阶段结果；应用操作 UUID 和预览身份防止重复或换包。

联网模式把 `offlineDirectory` 换为固定 HTTPS `url`，两者只能选一；可配置私有 `authorizationFile`（0600，仅发送到固定 origin）。公钥不能从待验证更新站自行获取后直接信任。接收方仍会校验每个变化文件，断网/损坏包不会改用全包或切换旧实例。

## Docker 固定伴随镜像＋持久版本目录

```sh
docker build -f deploy/php-updater.Dockerfile -t YOUR_PRIVATE_SUPERVISOR_IMAGE .
```

首次接入前固定并独立核验镜像 digest。使用 `deploy/php-update-compose.example.yml`，把已验证的初始版本与私有目录准备为 UID 1000，配置内采用容器绝对路径（如 `/var/lib/baize/releases`、`/run/baize-config/config.php`），二进制路径为 `/usr/local/bin/node`、`/usr/local/bin/php`、`/usr/local/sbin/php-fpm`、`/usr/sbin/nginx`；将只包含既有 `config.php` 的 `instance-config/` 目录以 UID 1000、0700 准备并只读挂载；PHP 要求配置父目录也私有，不能只把单个文件挂进公开可遍历的 `/run/secrets`。环境 `HOST=0.0.0.0`。只绑定本机发布端口，现有 HTTPS 代理在外层。MySQL 地址必须是实例专属数据库的实际地址。Web 和容器均不挂 Docker socket，不授予 Docker daemon 权限。

应用版本、状态、数据、密钥是独立持久挂载。停止并重新创建同一个固定伴随容器，执行器仍从持久 `current.json` 启动已确认版本，不回到镜像内旧代码。旧 image-owned Node 布局保持现有宿主层更新器；不能直接换本模板冒充无损迁移。Docker 数据卷首次迁移必须由操作者停写、备份并在隔离副本验证。

## 备份、失败和数据库迁移范围

每次代码切换前停止受管 HTTP/worker，调用旧版真实加密 MySQL 文档备份，并复制所有数据文件、全部密钥版本和配置。独立清单记录每个文件大小、SHA256，执行器再次校验并 fsync。备份位于执行器私有目录。回滚只切相同数据库结构的代码，继续使用当前数据库与最新独立删除日志，不用旧快照覆盖升级后的写入。备份恢复仍遵循 PHP 原有恢复入口的删除日志身份、重放与凭据撤销规则。

候选启动必须由真实 HTTP 证明数据库 ready、准确 revision、清单 SHA256 和本次 launch ID，另核对前端入口。失败切回旧代码再验证健康；恢复也失败时持续维护，要求主机处理。执行器重启会按持久事务恢复旧版本或已确认版本，不把活着的进程当成功。

**结构变化不属于自动升级/自动回滚范围。** MySQL DDL 可能逐语句提交。受控迁移流程：

1. 停止独立更新执行器以及所有 HTTP、worker、cron 和外部写入者，保留维护窗口；用旧版 `bin/update-ops.php backup 新私有目录` 创建并核验恢复点（设置与执行器相同的 `BAIZE_CONFIG_PATH`、`BAIZE_UPDATE_DATA_DIR`、`BAIZE_UPDATE_KEY_DIR`、`BAIZE_UPDATE_PUBLIC_URL`）。
2. 用独立数据库、配置、数据/密钥副本与保留的最新删除日志实际恢复；在该副本试迁移、核对功能、数据与回退方案，记录操作结果。
3. 在准确目标代码上运行 `php bin/upgrade.php --plan`，审查 pending SQL 和计划 SHA256。操作者确认试迁移结果后，在仍停写的正式实例明确运行 `BAIZE_PHP_MIGRATION_SOURCE_STOPPED=1 php bin/upgrade.php --apply 计划SHA256 --backup-dir 已验证备份目录`。
4. `bin/migrate.php` 也使用同一受控入口。CLI 核对现存结构、备份 schema/文件和计划，先持久记录意图后迁移。DDL 中断/失败保留未完成意图，不允许自动重跑或假称 down migration；操作者检查实际表结构，在克隆上恢复/修复，再制定明确接续步骤。应用、worker 和更新预检也会拒绝未完成或损坏的迁移意图。不得删除意图文件直接跳过检查。只有已验证目标通过健康与业务核对，才另行切换服务。

PHP 没有 ClickHouse 权威库；Node Full 配置外部 ClickHouse/历史 sidecar 时，原生自动备份仍提前拒绝，PG dump 不能冒充外部数据恢复点。

自动 PHP 备份当前只覆盖经核对的 `001_documents.sql` 文档布局：实际表、列类型、索引、JSON 约束与 InnoDB 引擎均核对，额外表、视图、触发器、事件或例程会拒绝，不能称为已完整备份。所有业务命名空间在 documents 中；锁行不承担业务数据。未来引入其他物理存储的版本需要先交付独立全库备份/恢复方案并更新维护适配；本控制入口不冒充覆盖未来布局的后续迁移。

部分 DDL 失败后的恢复路径是保留原失败实例及意图，保持停写；在全新的数据库、数据目录和私有配置中，用已验证的旧结构代码恢复升级前恢复点，并合并最新独立删除日志及其身份，完成真实健康与业务复核后再由操作者明确切换。未完成意图属于原失败数据库，继续保存在原实例供核查；不删除原意图，也不将切换克隆称为在原数据库自动 down migration。

Docker 初始安装或离线导入时，配置中的路径属于容器。使用同一固定伴随镜像的一次性 CLI，例如 `docker compose run --rm --entrypoint node -v /absolute/received/delta:/run/update-import:ro baize /opt/baize-updater/baize-import-update.mjs --config /run/secrets/updater.json --bundle /run/update-import`；完整初始目录改用 `baize-php-distribution.mjs` 和相应安装目录。导入容器仍以 UID 1000 执行，复用已准备的持久挂载，不启动网站或更改账号。Docker 固定伴随服务显式使用 `STOPSIGNAL SIGTERM` 和 60 秒停止窗口，不继承 PHP-FPM 镜像的 SIGQUIT。
