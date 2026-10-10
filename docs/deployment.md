# 本地自托管安装与恢复

需 Docker Engine 与 Compose v2。当前发行从私有源码本地构建，不拉取或发布白泽镜像。运行 `./install.sh`：保持现有 .env、密钥和卷，随机生成数据库密码与 32 字节主密钥（0600），构建后等待健康检查。首次访问创建管理员，不提供固定初始密码。默认仅 `127.0.0.1:3000` 可访问。

Compose 中 PostgreSQL、Redis 不发布端口。密钥在 `.baize/master.key`，独立于数据库；备份文件含密钥必须限制读取权限。主密钥不可丢失，否则无法解密已有连接器密钥。云环境代理 CA 使用 BuildKit secret 挂载，保留 TLS 验证，不写入镜像。若在受代理管理的云环境测试真实外部连接器，使用 `docker compose -f docker-compose.yml -f docker-compose.cloud.yml` 使运行容器挂载当前 CODEX_PROXY_CERT 并设置 NODE_EXTRA_CA_CERTS；保留 Docker 注入的代理，不绕过网络策略。用户反向代理可自行配置 HTTPS；登记 TRUSTED_PROXIES 后才信任相应 IP 转发头。任何外网开放或部署需部署者明确操作，本开发任务不做。

`./scripts/backup.sh` 生成新目录，保存自定义格式 pg_dump、独立删除日志、主密钥、应用镜像 ID 与校验和。可通过操作系统定时器每日运行；备份应另存离机受限存储。没有删除日志时失败关闭。删除日志必须长期独立保留，不能随数据库备份过期一起丢弃。

`./scripts/restore.sh BACKUP_DIR baize_restore_NAME` 只创建新数据库，拒绝覆盖现有库。校验后恢复数据库，合并当前独立删除日志（覆盖备份后新增删除），重放 tombstone，递增 epoch/generation、废止旧任务、重建聚合、清站点缓存；不自动切换流量。原数据库及应用保持原有配置。恢复后先对账，再人工修改 DATABASE_URL 切流量。

`./upgrade.sh LOCAL_IMAGE_TAG` 先备份，停止应用后迁移并启动新镜像，健康检查失败时还原数据库快照及旧镜像，并通过启动重放期间独立删除日志。当前为停机升级，不承诺零停机。版本兼容见 compatibility.md。升级镜像必须已经在本机，脚本不发布镜像。

`bash scripts/ops-lifecycle-test.sh` 创建隔离命名栈验证安装、数据库备份、新库恢复、成功升级及失败回滚；结束删除这个测试栈的卷。只应对测试副本运行。相关结果见 validation-ops.md。

GeoIP 无离线库时降级未知；真实 MaxMind/GSC/SERP/AI 账号均由部署者配置，不会自动购买或创建生产凭证。Windows 使用 run.bat，先提供 DATABASE_URL、REDIS_URL 和 MASTER_KEY_FILE；生产推荐 Linux。
