# 历史迁移与备份切片验收记录

下述为第一阶段独立接口记录；后续可选激活闭环见文末。第一阶段实现文件仅为 `028_history_manifests.sql`、`src/server/history-store.ts`、专属集成测试及本文。没有修改本批冻结的应用、采集、worker、删除或安装代码，没有接入公共路由或后台任务。PG 仍是权威源，P2 的“PG 只留元数据”仍未完成。

`captureSiteHistory(pool,store,siteId,{namespace?,afterSnapshot?})` 捕获保留期内真实脱敏事件，以及所有已存小时/日汇总和 page_vitals。使用既有分区快照 gate、RR 与副本屏障；WITH HOLD 游标每次最多 100 行且写入块不得超过 8 MiB。任务在源事务中可靠保存，COMMIT 后上传；期间采集可继续。逐类型/UTC日期记录有序 SHA256、行数与 outbox 高水位。CH 流式 shadow 校验通过后，释放副本屏障，在站点锁下以 epoch fencing 发布。后来 generation 前进不会阻止 captured snapshot 发布；删除改变 epoch 则拒绝发布并清理上传。

事件只复制实际保留的明细。保留期外已删事件标为 `rawBeforeRetainedFrom:unavailable_not_reconstructed`；旧汇总保留原 JSON，不生成虚构事件，不把小时 UV 相加，不把多个币种相加，也不重新计算不等样本分位。存储编码明确为 `original_json_no_quantile_or_currency_reduction`。逐日期清单中存在 daily/hourly 而不存在 raw 的日期只能作为 aggregate-only 证据，不表示曾经不存在访客。

接口：

- `verifyHistoryShadow(pool,store,manifest)`：有界分页校验和 epoch 前后核验。
- `exportHistoryBackup(pool,store,manifest,maxRows=100000)`：只导出当前 epoch 的已发布清单，校验实际行 SHA256；超过行数或 128 MiB 明确拒绝，不截断冒充完整。
- `restoreHistoryBackup(store,backup,{namespace,verifyDeletionJournal})`：必须不同 namespace；恢复前后均调用必填删除日志核验回调，内容校验失败或后置日志核验失败则清理目标。恢复不会替换源指针或覆盖源数据。接口尚未接 CLI，回调须由运维层实现实际 journal 核验，不能生产中传空函数。
- `invalidateSiteHistory(database,store,siteId)`：同步物理删除该站点全部历史 namespace，随后把 PG manifests 标 obsolete；database 可传当前 PoolClient，禁止持站点锁时另借池。
- `cleanupHistoryFailures(pool,store)`：持久 failed manifests 是清理重试队列，HTTP 失败不销毁证据；每次处理最多 10 项。

**激活前必须接线**：删除 journal fsync 后、返回成功前，在现有站点锁/副本屏障内调用 invalidate；恢复及 privacy 版本升级同样失效；后台运行 failed 清理；提供有权限的任务接口与有实际 journal 语义的恢复入口。尚未接线时不能宣称现应用的历史副本已纳入可靠删除/恢复保证，因此本模块保持独立、默认不激活。对备份进行 SHA256 校验只保证内容一致，不提供来源签名或加密；备份访问和加密由既有运维边界处理。

本机真实 PG 5432 / CH 38123、独立 PG schema、max1 池测试覆盖：原始事件与跨保留期归档；USD/CNY 独立和 25:1 vitals centroid 原样保存；不同 namespace 恢复且源不变；坏校验/过时删除证据拒绝；持续采集 captured source 稳定；epoch 变化中断上传发布；HTTP503 失败持久记录；备份超限拒绝；超过一块的半失败上传、持久清理重试、shadow 校验与恢复。

未验收：生产接线、权限/UI/CLI、整套备份文件加密/认证、CH 集群灾备、百万级历史容量、CH-only 权威明细模式、worker 全量数组消除及旧汇总查询全切换。本切片不对上述未完成目标作完成承诺。

2026-10-10 最终执行：相关 eslint、`tsc --noEmit` 均通过；`TEST_DATABASE_URL=postgresql://baize_dev@127.0.0.1:5432/baize_dev CLICKHOUSE_TEST_URL=http://127.0.0.1:38123 node_modules/.bin/vitest run tests/integration/history-store.test.ts` 为 1 文件 6/6 PASS，1.33 秒。持续写入测试通过独立 PG 连接真实写入源表，不是完整 collector HTTP 流量验收；HTTP503 明确为注入故障。其他流水线、浏览器、Docker及远端 CI 不计入本切片结果。


## 后续可选激活与可靠删除闭环

本批实际接入管理员 `/api/v1/sites/:siteId/storage/history`、`/capture`、`/:id/backup`、`/:id/restore`，均检查站点 admin 权限并记录审计。普通读取权限不能捕获、导出或恢复，跨站 token 不可使用。备份接口返回 id、字节数、行数和完整性方法，不返回本机文件路径，不实现不安全的旧文件下载。

生产默认仍关闭：显式 `options.history` 或 `HISTORY_STORE_ENABLED=1` 加既有 CH 配置才激活。配置实例在应用 journal 重放前初始化；已有 active history manifest 而存储不可用/关闭时，删除和重放拒绝假成功。privacy 清理、普通删除、恢复重放及保留期维护均接 history barrier。无 CH 的新 PG 隔离恢复先撤销目标复制来的旧指针及本机备份记录，不连接或删除源 CH。

本机备份由 `history_backup_files` 管理，不等于操作员持有的外部 PG 备份副本。文件在 0700 目录以 0600 创建，payload/manifest/site/epoch 由显式 keyVersion 的 HMAC-SHA256 认证，兼容既有保留密钥的轮换。签名提供完整性和来源认证，不提供文件内容加密；本机文件访问依赖上述权限。恢复必须验证 ready 元数据、签名、站点、原 epoch、不同 namespace、完整最新独立 journal 与当前保留边界；前后核验复用同一数据库 client，不能省略或用空回调代替生产入口。

mint 持同 client P→H 屏障贯穿快照读取、签名、文件 fsync/rename 和元数据 ready；可靠 writing 记录及 nonce 临时路径先保存。删除 journal 可先 fsync，但删除 ACK 必须等待屏障。mint 若观察到删除则撤销、清理文件，保证 ACK 后不会再生成含已删除身份的新文件。错误处理只清理本次确实拥有的文件，不会因早期读失败删除既有 ready 备份。

删除 conservatively 撤销同站全部本机历史备份和 CH 历史快照，PG 其他身份的权威数据保留。清理只处理登记的 history UUID 路径，最终文件及 nonce `.tmp` 都可可靠重试，不复用 exports 目录队列。失败记录包含通用错误码、次数及重试时间；删除结果 `historyBackups.pending` 明示尚待磁盘清理。ready 被撤销后 API/CLI 恢复立即拒绝，startup 若仍有 pending 文件清理则关闭查询。崩溃 writing 使用 try-H 确认无活跃 mint 后回收；capturing 超过十分钟且无活跃屏障也可恢复清理。源捕获、shadow 与恢复上传默认 120 秒期限，超限拒绝发布，不能由此声称百万容量通过。

真实 operator CLI：`node_modules/.bin/tsx scripts/history-cli.ts capture SITE`、`backup SITE MANIFEST`、`restore SITE MANIFEST NEW_NAMESPACE`。要求已配置 DATABASE_URL、CLICKHOUSE_URL、本地 MASTER_KEY_FILE 和 DATA_DIR，读取现 keyring，输出 id/计数，不输出凭据或源正文。CLI 实际子进程在隔离 PG schema 与真实 CH 执行捕获、签名文件备份和恢复对账。

2026-10-10 后续最后复测：`history-store.test.ts`、`history-security.test.ts`、`history-app.test.ts` 共 3 文件 **22/22 PASS**，5.98 秒，真实 PG/CH dev5432/38123，不使用并行完整 CI 的服务端口；类型检查及相关 lint 通过。包含真实初始化→站点→collector→管理员会话路由、启动 journal/privacy 清理、删除 HTTP503 阻断 ACK/重放恢复、mint 两个真实删除屏障、EISDIR 实际磁盘失败/重试、nonce 临时文件崩溃恢复、密钥版本、跨站权限和旧 ready 文件早失败保护。持续写入专项使用真实源表写入；故障 HTTP503 为显式注入。

本批全量浏览器/Docker、Docker 中的独立历史恢复 CLI 和远端 CI 尚待 root 完整验收，不以这 22 项代替。PG 仍保留权威事件和报表；完全 CH 权威写入、历史查询全切换、有界 worker 聚合、独立 CH 灾备和百万容量仍未完成，P2 不标全完成。
