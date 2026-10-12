# Linux x64 原生发布与离线维护

Node-ready 包需要运营者安装受支持的 Node 24；bundled-node 包附经官方来源及 SHA256 校验的 Node Linux x64。两者都不包含 PostgreSQL 服务、PG client 工具、Redis、反向代理或服务管理器。数据、密钥和0600私有环境文件均在不可变 release 目录之外。包内文件完整校验后才启动。仅 Linux x64，不能外推 Windows/ARM/其他发行版。

`./scripts/release-start.sh --env-file /etc/baize/runtime.env` 根据 manifest profile 启动 standard 或 Lite。不执行环境文件中的 shell，不依赖 Codex 会话。示例 systemd unit 由运营者审阅路径/用户后安装，本任务不会执行 enable/start。应用只默认 loopback:3000；PUBLIC_URL 不签发证书或开放公网，HTTPS由运营者配置。

标准版必须配置外部 PostgreSQL `DATABASE_URL`。Redis 为可选 `REDIS_URL`：未提供时使用已有有界本地限速、无共享缓存；不能声称多副本/分布式额度一致。DATA_DIR/KEYS_DIR 独立私有目录，MASTER_KEY_FILE 指向受限密钥文件。

## 标准版 PG-only native 运维

需宿主官方 PostgreSQL 客户端 `pg_dump/pg_restore/createdb/psql`，建议同服务器主要版本17；可用 `BAIZE_PG_BIN` 指定已有受信目录，不自动安装。连接凭据通过私有环境传递，不放 argv 或日志。

维护前由运营者停止服务、所有 worker/其他写入者，显式设置 `BAIZE_NATIVE_SOURCE_STOPPED=1`、`BAIZE_NATIVE_SINGLE_INSTANCE=1`；工具还获取同 DATA_DIR/native-runtime.lock，拒绝源 DB 其他连接。只支持 public schema 的 PG-only 数据；严格 CH 权威、CH mirror/历史正文/相关外部 sidecar 前置拒绝，不能把 pg_dump 当完整 CH 包。PG-only replay/heatmap 正文在 PG dump 中保留。

```bash
./scripts/release-ops.sh --env-file /etc/baize/runtime.env backup /var/backups/baize/new-point
./scripts/release-ops.sh --env-file /etc/baize/runtime.env restore /var/backups/baize/new-point baize_restore_example /var/lib/baize/restored-data /var/lib/baize/restored-keys
```

目标父目录先由运营者准备为受信目录；所有目标必须全新，数据/密钥相互独立且不在 source、backup 或 release 内。备份保持源静止，使用真实 pg_dump 和导出一致快照，核实 journal/watermark 与 DB 删除标记；签名 manifest 最后耐久写入。仅复制可信已完成、当前 privacy epoch 的关联导出及可选 GeoIP库；孤儿文件不归档。密钥独立包仅 master.key/master.vN.key，安装 nonce 不读、不归档。

恢复只创建新数据库/目录；签名、完整文件清单、源数据库身份、最新独立删除日志延伸先验证。调用既有 compiled restore-runtime 完成删除重放、epoch/任务/导出撤销和真实聚合重建；旧导出不恢复为可下载附件。恢复目标安装入口保持 restored_blocked，不能从旧 nonce 抢占账号。失败保留目标供诊断，无成功 marker、不切流量。

## 升级与回滚：候选数据库、运营者切换

```bash
./scripts/release-ops.sh --env-file /etc/baize/runtime.env upgrade /opt/baize/releases/NEW /var/backups/baize/upgrade-point baize_restore_upgrade /var/lib/baize/new-data /var/lib/baize/new-keys
./scripts/release-ops.sh --env-file /etc/baize/runtime.env rollback /var/backups/baize/upgrade-point baize_restore_rollback /var/lib/baize/rollback-data /var/lib/baize/rollback-keys
```

这是停机候选升级：先保全源，再在新 DB/目录迁移恢复，用新 release 的真实 main 独立子进程启动并验健康及实际前端 HTML（内部 BAIZE_NATIVE_VALIDATE_ONLY=1 禁止候选后台任务与 GeoIP 自动下载，避免验证期间外发），验证后停止子进程。返回 `trafficSwitched:false`；运营者审阅对账后明确更新服务 release/config 指向并启动。工具不修改用户服务或当前 release 指针。失败源 DB/release 保持，保留恢复点和失败记录。回滚使用匹配旧 release 的恢复点和**最新**删除日志，恢复到另一新目标并验证旧程序健康；不直接用旧程序打开新 schema，不声称自动原地升级/零停机。

SIGINT/TERM、丢锁、超时需停止并等待所有子进程实际退出，不能留下 pg_restore 或应用继续运行后报告成功。SIGKILL/宿主故障仍需人工确认锁、部分目标和恢复点；没有完成标记不得开放查询。真实外网、跨机灾备及实际 systemd 用户部署不在本次本地矩阵验收内。

## Lite

保留既有 compiled `lite-ops.js`/`lite-migrate.js`，同发布启动器使用相同 owner flock；备份/恢复前停止运营者服务。SQLite backup API、签名/最新 journal/独立密钥、严格精确保留及恢复当日 AI 预算阻断保持，不复制简化实现。Lite→PG 为离线独立空目标导入，不是改连接串自动切换。
