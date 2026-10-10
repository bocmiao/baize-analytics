# ClickHouse 可靠镜像阶段验收

此阶段保留 PostgreSQL 为权威源。采集响应仍取决于 PostgreSQL 事务，不取决于 ClickHouse 可用性。已完成完整事件字段的可靠镜像、可选读切换、删除与恢复屏障、重试和旧快照清理；**P2 的 PostgreSQL 仅存元数据、全部查询迁移及容量验收尚未完成**。

## 已实现范围

- 022/023 前向迁移保存镜像状态、上传记录、清理租约及失败重试。事件保留 payload、dimensions、页面实例、机器人标记，按站点和不可变快照查询。重复上传同一快照按事件主键去重。
- RR 快照捕获 generation/epoch；发布允许采集继续推进 generation，后续变化保持待镜像。发布必须持有有效租约且 epoch 不变。默认每站点最短发布间隔 60 秒。
- `postgres`、`mirror`、`prefer_clickhouse` 可由站点管理员选择。最后一种模式在读取前后核对 PG 高水位、epoch、指针和事件数。过期、不完整、请求期间源变化或 CH 失败均明确返回 PG fallback，持续采集时可能持续 fallback。
- 接入查询包括看板保留期内边界/筛选重算、内容分析和地域分析。聚合 worker 的 RR 快照、历史 rollup、治理、身份、实时和事件属性仍使用 PG；管理接口明确列出范围。
- 删除日志先可靠保存，再等待上传互斥屏障、同步清除站点镜像并失效指针。失败不返回删除成功。恢复重放可以调用同一屏障；root 应用还接入启动隐私清理和全站恢复失效。
- 非当前旧快照、失败上传和崩溃遗留由持久清理队列处理。活跃上传与当前快照受保护，失败退避重试。按站点保留期同步清除 CH 过期事件，即使模式已切回 PG 也继续清理。
- 源快照和 CH 响应默认限制 128 MiB，超限失败或 fallback，不发布截断数据。HTTP 超时有上限，凭证不进入 URL 或错误正文，查询使用类型绑定参数。
- 统计缓存键包含模式和镜像指针/版本，模式切换和重放失效站点 Redis 缓存。

## 实际验证

本机使用原生 PostgreSQL、Redis 和真实 `clickhouse/clickhouse-server:25.8-alpine` 容器。镜像 digest 为 `sha256:87e0a5b72f5465b18eacca7c76850e7ff551c9795c50e451f5646299e5e24146`；测试端口仅为本机 38123。没有外部账号、付费 API 或生产凭证。

```sh
node_modules/.bin/eslint src/server/analytics.ts src/server/clickhouse*.ts src/server/event-store.ts tests/unit/clickhouse.test.ts tests/integration/clickhouse.test.ts
node_modules/.bin/tsc --noEmit
TEST_DATABASE_URL=postgresql://baize_dev@127.0.0.1:5432/baize_dev REDIS_URL=redis://127.0.0.1:6379 CLICKHOUSE_TEST_URL=http://127.0.0.1:38123 node_modules/.bin/vitest run tests/unit/clickhouse.test.ts tests/integration/clickhouse.test.ts tests/integration/redis-cache.test.ts
```

以上 lint、类型检查通过；3 文件、16 测试通过（3 单元测试，12 CH 集成测试及 1 既有 Redis 删除缓存集成测试）。真实集成涵盖完整字段及重复上传、持续实际采集下高水位推进、租约/epoch fencing、上传与删除竞态、删除失败日志及恢复、读失败/缺失/中途源变化 fallback、三次失败 DLQ 与重放、旧快照清理失败重试、站点保留期物理清理、源预算拒绝、真实 Redis 模式/发布/重放缓存，以及 worker 保持 PG RR。

随后在同一真实 PG/CH/Redis 环境联合运行 analytics、content、geography、地图资源、CH 和 Redis 缓存的单元/集成测试，9 文件、54 测试通过，耗时 13.71 秒。

初次真实 CH 执行暴露 DateTime64 参数的 ISO `Z` 格式不兼容及 SELECT 别名覆盖 WHERE 时间字段，均已修复并通过复测。CI 已配置同 digest 的真实 CH service；远端 CI 尚未运行，不能把本机通过当成远端结果。

## 运维与尚未验收项

配置 `CLICKHOUSE_URL`、`CLICKHOUSE_USER`、`CLICKHOUSE_PASSWORD` 或密码文件后才启用镜像；默认部署仍为 PG。CH 副本可从 PG 保留期内源事件重建，备份/恢复权威数据仍为 PG 与独立删除日志。保留期外 PG 已不存在的明细不能借此迁移重建。

目前采用全站保留事件快照，适合验证正确性，尚未实现增量分区迁移、PG 明细移除、所有模块查询切换、历史 rollup 到 CH 的等价迁移、CH 集群/故障转移以及百万级吞吐/存储成本验收。128 MiB 预算会限制大站点，实际大规模应采用有界分区增量方案。本阶段不承诺 scale-out，也没有执行 CH Docker 安装升级、独立 CH 集群备份恢复或远端 CI。

## 后续可靠性加固

上传每 1000 条前检查有效租约、owner 和站点模式，默认总上传预算 120 秒（可配置 1–300 秒，单次 HTTP 另有最多 30 秒超时）。过期租约在上传前被拒绝，真实测试确认新快照物理行数为 0、旧已发布指针不变。成功 mutation 响应释放 body，防止连接资源滞留。模式切换/重放先记录审计，Redis 失效失败返回 `cacheInvalidated:false`，避免已经持久成功的操作被误报为失败；统计键仍由模式和镜像指针版本隔离。

## 2026-10-10 增量与统一读取（本批工作区验证，尚待完整发布验收）

以上“全站快照”描述的是默认 `snapshot_v1` 已发布阶段。新增可选 `incremental_v1`：初始化及需要身份重写的重建用 PostgreSQL RR 快照；同 epoch 的后续事件按 captured outbox 高水位增量上传。发布允许当前 generation 已前进，后续脏数据保持待处理。每批任务可靠保存，失败 generation 不可读并由持久清理队列重试；删除与保留期 barrier 使指针失效并物理清除副本。

源读取使用 `WITH HOLD` 游标：RR 内同时记录可靠上传任务，COMMIT 后分块取数；PG 可按 work_mem 将源快照物化到临时存储。每块至多 100 行且不超过 8 MiB，单事件也受 8 MiB 上限；不再对整个增量初始化施加默认 128 MiB 应用数组预算。游标在释放副本屏障前关闭，后台退出会清理 PG 临时存储。120 秒默认上传期限仍是容量约束，超限拒绝发布并可重试，并不证明任意规模可成功上传。

增量模式优先读采用已发布 CH 前缀加 captured PG RR outbox 尾部，按事件键去重，返回 `source:hybrid`、副本 generation、captured 高水位及一致性元数据；持续新采集不会因 generation 不等而永久回退。删除 epoch 变化、身份重写、计数不符或读取失败仍明确回退 PG。PG 保留身份段、删除标记、可靠队列与汇总，尚未移除权威明细。共享有界读取接口已用于事件属性、用户路径、身份/收入视图及实时/SSE事件正文；治理导出等接线由对应模块专项验收。

本批真实 PG/CH/Redis 执行：默认池 max10 的镜像与 9 个真实删除竞争、上传前 HTTP503 注入、max1 清理失败持久重试共 3 项通过；与分区/副本锁排队、增量和既有 CH 测试联合为 26/26。随后增量单连接发布/混合读取与分析、成熟度留存、实时 Top 回归为 28/28（包含重复测试，不累加）。HTTP503 是显式故障注入；数据库、删除、CH 插入/查询/物理清理为真实操作。类型检查与相关 lint 通过。

这些结果不等于完整 P2 迁移验收：仍需本批完整应用 PG/CH/Redis、浏览器及 Docker 回归；PG 明细移除、历史汇总迁移、全部查询/worker 聚合内存界限、CH 集群故障转移、独立副本灾备及百万规模增量容量仍未完成。此前锁排队专项证明修复后的队列能完成，未实际复现旧三方 advisory 死锁，不能把静态风险推断写成已复现事故。
