# 本地自托管安装与恢复

## 安装方式与实际依赖

推荐 Linux Docker Engine + Compose v2，从私有 checkout 本地构建。私有交付现提供已验的应用镜像 save、Node-ready 与 bundled-node 运行包；没有公开 registry/Release 发布。三个入口及首次使用见 [部署方式](deployment-methods.md)。

```bash
./install.sh
# 在本机浏览器访问 http://localhost:3000，创建首位管理员
```

手工 Compose：先准备 `.env` 中的 `POSTGRES_PASSWORD`、`PUBLIC_URL`、数字 `BAIZE_UID/BAIZE_GID`，以及 `.baize/master.key`（32 字节随机密钥的64位十六进制文本、0600，属主与 app UID 一致）；然后 `docker compose build app`、`docker compose up -d --wait`。`.env` 中的 `BAIZE_IMAGE` 决定本地目标 tag，安装和升级保持同一解析方式，不执行 `.env` 内容。可选 `docker-compose.build-ca.yml` 只给构建注入环境已有 CA；普通安装不依赖管理云环境。

初装只需 Docker/Compose 与 Bash 常规工具；**备份、恢复、升级还需宿主 Node 24+、sha256sum、支持 `sort -z` 的 GNU 工具、find/xargs/tar/cut**，升级还需 fallocate、GNU sed、mktemp。脚本在创建备份或停止应用前检查依赖；缺失时给出指引，不自动安装工具。推荐 Linux 运维；Windows `run.bat` 未实测。

Node 24 源码方式需要独立 PostgreSQL 17、Redis 7，以及 `DATABASE_URL`、`REDIS_URL`、`DATA_DIR`、`KEYS_DIR`、`MASTER_KEY_FILE`（0600）与持久目录：`npm ci` → `npm run db:migrate` → `npm run build` → `node dist/server/src/server/main.js`。`npm start` 和维护工具仍用 tsx，不要直接 prune devDependencies。原生运行包提供经完整性校验的 compiled 启动器、Node 面板入口和运营者审阅的 [systemd 示例](../deploy/baize.service.example)，已实测独立 supervisor 自动重启；未提供 Kubernetes/Helm 成品，也未替用户安装 systemd 或验收真实宝塔实例。源码 npm start 与运行包派生 npm start 不同，后者调用 compiled panel-start，无需 tsx。

Compose 默认连接内置 postgres/redis；只在 `.env` 写同名 `DATABASE_URL/REDIS_URL` 不会切换外部服务，需明确的 Compose override。默认 loopback 端口只供本机；`PUBLIC_URL` 不会配置 TLS 或开放公网。持久卷为 `app_data/app_keys/postgres_data/redis_data`，可选 CH 增加 `clickhouse_data`；不要删除业务卷或遗失密钥。

[历史阶段记录](deployment-history.md) 保留原始失败和性能欠项；[上一轮运维证据](test-evidence/2026-10-12-ops-maintenance/summary.json) 不外推本轮新版本。恢复依赖当前源 Compose 环境、最新独立删除日志及 proof，不是可脱离源环境的跨机灾备安装包；恢复到新库/卷后不自动切流量。未实测真实域名、HTTPS、Windows 或跨机上线。

需 Docker Engine 与 Compose v2。当前发行从私有源码本地构建，不拉取或发布白泽镜像。运行 `./install.sh`：保持现有 .env、密钥和卷，随机生成数据库密码与 32 字节主密钥（0600），构建后等待健康检查。首次访问创建管理员，不提供固定初始密码。默认仅 `127.0.0.1:3000` 可访问。

Compose 中 PostgreSQL、Redis 不发布端口。密钥在 `.baize/master.key`，独立于数据库；密钥备份必须独立于数据库备份保护。版本化密钥位于独立 app_keys 卷（KEYS_DIR=/app/keys），不进入 app_data 卷归档。主密钥不可丢失，否则无法解密已有连接器密钥。云环境代理 CA 使用 BuildKit secret 挂载，保留 TLS 验证，不写入镜像。若在受代理管理的云环境测试真实外部连接器，使用 `docker compose -f docker-compose.yml -f docker-compose.cloud.yml` 使运行容器挂载当前 CODEX_PROXY_CERT 并设置 NODE_EXTRA_CA_CERTS；保留 Docker 注入的代理，不绕过网络策略。用户反向代理可自行配置 HTTPS；登记 TRUSTED_PROXIES 后才信任相应 IP 转发头。任何外网开放或部署需部署者明确操作，本开发任务不做。

`./scripts/backup.sh` 生成新目录，保存自定义格式 pg_dump、独立删除日志、脱离密钥的应用卷归档、应用镜像 ID 与校验和。密钥另存 `BAIZE_KEY_BACKUP_DIR`（默认 `.baize/key-backups`）内的0700目录；数据库备份只含密钥指纹与独立恢复包位置，不含明文密钥。可通过操作系统定时器每日运行；备份应另存离机受限存储。没有删除日志时失败关闭。删除日志必须长期独立保留，不能随数据库备份过期一起丢弃。

`./scripts/restore.sh BACKUP_DIR baize_restore_NAME` 只创建新数据库，拒绝覆盖现有库。校验后恢复数据库，合并当前独立删除日志（覆盖备份后新增删除），重放 tombstone，递增 epoch/generation、废止旧任务、重建聚合、清站点缓存；不自动切换流量。原数据库及应用保持原有配置。恢复后先对账，再人工修改 DATABASE_URL 切流量。

`./upgrade.sh LOCAL_IMAGE_TAG` 停止应用后创建恢复点，再迁移并启动新镜像，健康检查失败时还原数据库快照、应用卷及旧镜像（保留当前独立删除日志），并通过启动重放期间独立删除日志。当前为停机升级，不承诺零停机。版本兼容见 compatibility.md。升级镜像必须已经在本机，脚本不发布镜像。

`bash scripts/ops-lifecycle-test.sh` 创建隔离命名栈验证安装、数据库备份、新库恢复、成功升级及失败回滚；结束删除这个测试栈的卷。只应对测试副本运行。相关结果见 validation-ops.md。

GeoIP 无离线库时降级未知；真实 MaxMind/GSC/SERP/AI 账号均由部署者配置，不会自动购买或创建生产凭证。Windows 有 run.bat 脚本，但未在本 Linux 环境实测；生产推荐 Linux。

## 反向代理与HTTPS示例（由部署者自行配置）

应用继续绑定loopback，代理独立终止TLS。将 PUBLIC_URL 设为实际 HTTPS 地址，TRUSTED_PROXIES 只填写真实代理的CIDR，不能信任任意互联网客户端。下面证书路径是运营者已有证书位置；此开发任务不签发证书、不开放外网。

```nginx
server {
  listen 443 ssl;
  server_name stats.example.com;
  ssl_certificate /etc/ssl/local/stats.fullchain.pem;
  ssl_certificate_key /etc/ssl/local/stats.key;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off; # SSE实时流
  }
}
```

只在授权开放网络后部署者启用该配置。代理必须限制请求体大小并匹配应用采集批量限制，保留真实协议/站点的CORS要求；不要把数据库或Redis端口公开。

恢复必须保留独立当前 `tombstones.jsonl` 与 fsync 水位 `tombstones.watermark.json`，并验证当前日志完整延伸备份日志；缺失、截断、重置、水位不符会在创建目标数据库前拒绝。`scripts/restore.sh` 将 `app-data.tar.gz` 与独立密钥恢复到全新具名卷，记录 `.baize/restores/<database>.json`，不切换现有流量。恢复撤销旧导出、实际清理恢复卷内文件、取消旧通知/外部任务、暂停定时报表、旋转聚合 epoch 并重算及按站点失效缓存。操作员复核后才能启用目标应用与调度。

旧版本非空删除日志没有水位时，应用会拒绝启动。先停止应用，在可访问原数据库与原数据卷的维护容器显式执行 `node --import tsx scripts/ops-migrate-journal.ts`；该工具逐条检查数据库删除标记已存在于独立日志，才 fsync 写入水位。不能用于初始化丢失日志、不能替代独立日志恢复，禁止在恢复流程自动运行。

升级开始前检查工作区至少2GiB可用空间（`BAIZE_UPGRADE_MIN_FREE_BYTES` 可提高），并预留128MiB紧急回滚空间，回滚开始先释放预留。该检查不能保证其他并发Docker拉取不会耗尽存储；升级期间停止无关构建/拉取并监控Docker数据盘。任何回滚失败都必须保留恢复点，应用停机后由运营者释放空间并手动恢复，不能把旧镜像启动或部分回滚视为成功。

以下仅描述PG-authority的可选mirror副本恢复分支，不是当前全局存储契约；严格CH权威及044等正文迁出已交付并有19d同源应用/镜像证据。PG-authority副本分支的新数据库恢复默认禁用ClickHouse，清除目标数据库复制指针、上传/维护旧任务并将存储模式设回postgres，不读取、删除或清理源副本。需要新目标副本时显式设置 `BAIZE_RESTORE_CLICKHOUSE_URL`、`BAIZE_RESTORE_CLICKHOUSE_USER`、`BAIZE_RESTORE_CLICKHOUSE_PASSWORD`；目标须为不同endpoint（同endpoint仅改query/database不算独立目标）。当前副本表namespace固定，不能让新旧恢复实例共用。新目标恢复完成后由管理员明确启用mirror并重建，不直接信任备份中的snapshot。原库升级回滚仍使用原ClickHouse删除屏障，失败不会宣称恢复成功。

已逐站切换的严格canonical CH权威恢复必须使用独立signed target分支，不能按上述mirror分支回空PG或信任备份自报authority。原producer seal/完成receipt/目标隔离、独立最新journal、当前retention proof及真实正文校验仍强制，失败关闭；实际参数与权限见 [迁移运行手册](migration.md)、[API手册](api.md)。

严格 canonical/历史正文恢复必须显式设置 `BAIZE_RESTORE_SOURCE_MAINTENANCE=1`，并设置 `BAIZE_RESTORE_SOURCE_SINGLE_INSTANCE=1` 确认独占源维护窗口、无其他副本及外部写入者，事先暂停独立 worker/cron。脚本检查唯一原 app、已知运行服务、同镜像/数字 UID 和相同 mount 元数据；使用按 Compose project 唯一命名的临时容器原子拒绝并发恢复，停 app 后拒绝任何其他已连接 PG client（包括 idle worker）。无法枚举断开的外部写入者，确认标志不是跨机全局锁，不支持任意多副本编排。原 app 以原容器 ID 和标准 CMD 重启，不重新应用/扩容 Compose；成功、失败及可捕捉 INT/TERM/HUP 均执行清理，重启失败不重复硬跑并撤销本次成功标记。`restore.sh` 暂停原 app，通过同一不可变镜像、原 Compose 配置及既有卷/secret 的临时 idle Node 容器读取源 journal、采集当前保留期证明和作最终复核；该容器不启动 HTTP 或后台维护。成功标记在源仍静止时写入；临时证明/容器移除后恢复原运行 app，重启失败则撤销本次成功标记。原 app 本来已停止时，结束后保持停止。没有 opt-in 的 canonical 恢复在目标建库前拒绝；PG-only 恢复路径保持原行为。此流程是停机维护，不是零停机或自动切流量。单独 producer seal 不冻结每分钟推进的保留期 cutoff；任何外部写入导致 journal/cutoff 变化仍拒绝。证明有效期仍为10分钟，不降低校验；超时/源变化的目标保留诊断，未获成功标记不得开放。

若源存在历史 namespace，使用官方可选 CH profile 时在 `.env` 设置 `HISTORY_STORE_ENABLED=1`；profile 将该非秘密配置传入 app。不能关闭历史 store 后重启需要历史删除重放的实例。真实跨机服务器、域名和 HTTPS 仍需独立部署验收。
