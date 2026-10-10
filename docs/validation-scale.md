# 真实全链路规模验收

运行 `TEST_DATABASE_URL=... npx tsx scripts/full-pipeline-benchmark.ts`，默认 100,000 页面浏览、40 个站点；`--events=1000000` 可选择 1M，必须先确认数据库容器底层磁盘至少 5 GiB 空闲。脚本为容器目录不可见情形记录 workspace 文件系统探测，不能把它当成独立数据库卷剩余空间证明。

每站每秒最多一个 HTTP 批次，每批 50 条，保留生产 100 请求/分钟/IP 和 20 请求/秒机器人规则。真实管理员初始化、创建站点与采集均经过独立 localhost 随机端口 HTTP；实际 Redis 服务，不清空共享缓存。实际 PostgreSQL 唯一 schema 隔离并在结束后删除。关闭后台任务，先验证完整持久 outbox，再逐站运行生产 worker，检查已处理 generation、水位、未完成 outbox 与失败次数，最后同时校验原始 SQL、sessions 和生产 queryStats 的 PV/UV/会话及 coverage。

每批使用独立访客、50 次不同页面实例浏览，预期 UV=会话=事件数/50；时间落在完整 UTC 历史小时。此负载是明确构造的验收数据，不代表真实客户流量分布，也不包含回放/心跳/付费外部服务。记录真实批次 HTTP 延迟分位数、采集/worker/query 耗时、同进程 Node RSS 峰值和独立 schema 表/索引大小。结果写入 `docs/test-evidence/full-pipeline-100000.json`（1M 对应另一个文件）。只允许 status=passed 的当前结果作为通过证据，失败记录不能推断上线性能。

2026-10-10 本轮 100k 实际通过：40 站点/2,000 个 HTTP 批次均 202，每批可靠接受 50 条，无重复/拒绝；采集 67.393 秒，HTTP 批次 p50 840ms / p95 1380ms / p99 1636ms。采集后 100,000 条 outbox 全部 queued；真实 worker 38.168 秒完成，40 站点 dirty=0、uncovered=0、attempts=0，100,000 条 outbox 全部 done。SQL 与 queryStats 一致：PV=100,000、UV=2,000、会话=2,000，逐站 coverage=1；40 站点查询合计154ms。隔离 schema 约204.6MiB，同进程 Node RSS 峰值约1125.3MiB（包含 HTTP/server/worker/脚本，不等于生产服务器独立常驻 RSS），运行后 schema 已删除。实际 `docker exec baize-dev-postgres df -h /var/lib/postgresql/data` 得到 19GiB 可用；不据100k外推其他负载的吞吐或资源。

1M 实际完整通过（2026-10-10 06:43:27–07:01:55 UTC，CLI EXIT0）：40 站点，每站25,000条明细；20,000 个真实 HTTP 批次全部202，无重复/拒绝。采集687.650秒，批次p50=850ms/p95=1439ms/p99=1711ms；真实生产RR/exact-set worker 416.703秒（每站p50=10.384秒/p95=11.836秒）。采集后1,000,000条持久outbox全部queued；worker后全部done，40站点dirty=0、uncovered=0、attempts=0。原始SQL、sessions及逐站coverage=1的queryStats完全一致：PV=1,000,000、UV=20,000、会话=20,000。40站点查询合计1.655秒；独立schema总表/索引约1.913GiB，Node同进程RSS峰值2.031GiB，schema已删除。

此结果使用启动时HEAD `cb72a7e` 加当时未提交工作区源码；其后提交 `0590df3`/`b56b7e9` 不能替代不可变启动源码快照。CH代码当时在制，但显式 `clickhouse:null`，所以本结果仅证明PG管道，不能声称ClickHouse容量或线上SLA。后续脚本记录启动HEAD并提醒工作区边界。1M资源前置实际cgroup上限32GiB、当前约10.8GiB，以及数据库Docker底层磁盘19GiB可用；规模脚本保留生产限流、隔离schema并收尾删除。高水位/gen最终一致性已验收；持续混合采集、删除并发、回放大体积与更大单站明细不属于这次构造负载，需另外验收。

此规模验收关闭background后顺序运行worker，1M聚合阶段约416秒；没有验证持续后台聚合小于5分钟SLO，也没有在1C/2GiB配置验收。
