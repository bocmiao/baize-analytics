# Producer canonical 候选：证据与保留决策

本页只归档有限候选专项，不是完整应用验收或规模吞吐通过。真实 PG/CH 对照使用旧 `239bb53c706f0f5f4fab0379bd551b2b566dbd03` 与冻结候选 `21a3c202118e38b16a68733419ad8f885bfeed72` 的不可变 archive；上游 cached 产品引用为 `6c77c4a1e49eb18ccb78c193dbc64471d6b10fb0`。原始 JSON 不含源码 SHA，因此身份另存于 [source binding](performance/producer-canonical/same-data-source-binding.json)，没有改写原始报告。root 已重新验证 21a 的 Git blob 全树绑定，报告为 `/tmp/baize-21a3c20-full-local.binding.json`；本次文档归档没有自行重新验证 archive，也没有执行测试。不可变 21a 全轮正在运行，结果未出，不标记通过。

## 真实 PG/CH 同数据对照

原始 [JSON](performance/producer-canonical/same-data-real-pgch.json) 与 [log](performance/producer-canonical/same-data-real-pgch.txt) 按原字节归档，两者 SHA256 均为 `a913da44069e4dd9f48e87ba9a94744c284f326551931f904da8895d42855ded`。

同一 held client、site、run、salt 与 records，按 baseline → candidate → baseline → candidate 顺序执行，trial 之间事务回滚。每组 1000 行、10 个逻辑批、22 次 fence 检查，发布宽度 2，每批最多 100 行、最多两个 pending；四组 digest 相同。这是发布微基准，不是应用 HTTP 负载或 SLO。

| 配对 | publication 墙钟 ms：旧 → 新 | authentication ms：旧 → 新 | whole ms：旧 → 新 |
| --- | --- | --- | --- |
| 第一对 | 277.888 → 245.950 | 110.358 → 92.062 | 403.826 → 358.179 |
| 第二对 | 210.121 → 207.047 | 87.127 → 96.582 | 308.901 → 326.219 |

两对 publication 均缩短，但第二对 whole 变慢。不能称稳定端到端收益，不能把累计嵌套阶段相加作为墙钟，也不能据此直接进入或宣称 5000 事件通过。最近 239 的 5000 结果为 4900 accepted / 2 unsent，仍为 FAIL；更早 4550 accepted / 9 unsent 的 FAIL 也保留，不能只呈现较早记录。

## 单元与 native 专项

已归档的完整单元报告为 359 个通过，native 报告为 6 文件、22 个通过（37.32 秒）。它们是本候选的验证范围，不能代替整轮联合应用、浏览器或托管 CI。原报告及源码文件摘要位于 [证据目录](performance/producer-canonical/)。

## CPU 隔离诊断与首次失败

首次模拟 CPU 诊断 [JSON](performance/producer-canonical/cpu-isolation-first-failure.json) / [log](performance/producer-canonical/cpu-isolation-first-failure.txt) 保留：`status=failed`，`trials=[]`，错误 `SIMULATED_RECEIPT_BOUND`。根协调确认原因是夹具 row_count 参数错误；不是实际产品 PG/CH 失败。不能将尚未产生的 trial 当作收益数据。

修正后的 r2 实际 EXIT0，[JSON](performance/producer-canonical/cpu-isolation-r2.json) / [log](performance/producer-canonical/cpu-isolation-r2.txt) 已另存。两对 process CPU 为 943.574 → 795.496 ms、747.288 → 609.128 ms。四组均为 10000 行、706 次模拟 PG query、100 个 INSERT batch、100 次 readback、10000 member rows、100 receipts、202 fence 检查，digest 相同。使用实际源类执行序列化、HMAC 与 readback hash 校验，但 PG/CH transport 为零延迟模拟；因此仅支持该模拟条件下 CPU 成本降低，不能冒充真实 PG/CH、应用容量或净端到端墙钟收益。首次失败文件不覆盖。

## 维护成本与建议

候选需维护 producer canonical 字节表示与现有认证 oracle 的等值关系，以及避免重复计算时的生命周期边界；错误复用、失效或表示差异都可能损害完整 readback 认证。保留必须以既有认证与 fence 不减、真实同数据 digest 等值及维护成本可控为前提。

root 在 r2 后决定保留低复杂度的 per-record 序列化复用：依据是模拟条件下 CPU 成本降低与摘要/计数等值，不是稳定真实端到端收益。strict 容量目标仍未闭合，不追加 5000 负载，不因本候选改写原规模失败。若后续无法形成可复核净收益，应撤回而非增加默认复杂度；不得把专项通过写成全计划完成。

## 其他候选的维护边界

| 候选 | 当前默认 | 保留依据与维护成本 |
| --- | --- | --- |
| 事务内 selected-run 元数据复用 | 关闭 | 有同摘要/计数、反向顺序与真实 PG/CH/独立恢复证据；维护两条选集路径和 TEMP 生命周期，仅允许同站点 gate 或受支持快照，不复用正文认证。 |
| pagePath ≤100 行集合查找 | 关闭 | 300 输入中叶查询139.610ms→7.127ms，但不是主要成本且净应用收益未证明；保留一个受限 SQL 分支及 NULL/空串等价测试，不作为容量解决方案，不继续扩大该实验。 |
| 两批发布流水线 | 单批 | 等工作量1000局部发布两对约33%收益，但实际300无净收益、5000仍FAIL；额外维护双任务 settle、顺序 PG commit、最大200条准备记录和故障原子性测试。默认不提高并发。 |
| selected TEMP 查询投影 | 已撤出 | 无净收益；实验归档保留，产品不维护该分支。 |

这些保留项均有具体局部证据，仍不等同于默认启用或容量承诺；全轮检查验证维护分支的正确性，不证明高负载性能闭合。后续维护若不再有局部收益，应正常撤出代码并保留失败与实验档案。

## 不可变21a完整本地联合验收：首次FAIL保留

2026-10-11以 Git blob 校验的 `21a3c202118e38b16a68733419ad8f885bfeed72` archive 运行 `scripts/validate-local-final.sh`，使用新建独立 PostgreSQL/ClickHouse/Redis 服务，最终 **EXIT1**。lint、类型、独立 SDK、journal、构建及359单元通过；完整集成183文件中182通过、1失败，490断言中489通过、1失败、0跳过，581.44秒。浏览器未运行，镜像/恢复未启动，不能称全轮通过。

唯一失败 `canonical-daily-backup.test.ts` 为 `HISTORY_NAMESPACE_FACT_BACKING_MISMATCH`，堆栈位于历史 namespace 恢复对账。初步查证该夹具未复制059 origin及完整aggregation元数据，尚待窄修专项确认；产品签名与checksum guard不修改。原始 [集成JSON](performance/producer-canonical/full-21a3c20-failure/integration.json)、[完整入口log](performance/producer-canonical/full-21a3c20-failure/regular.txt)、[源码绑定](performance/producer-canonical/full-21a3c20-failure/source-binding.json) 均保留。入口自然结束并清理本轮所属服务/卷后，workspace空余恢复约5.4GiB；未清理其他项目数据。

窄修确认：夹具复制源完整 `aggregation_state` 和 `analytics_raw_retirement_origins`，在同站锁事务下对两表全行精确对账，替代触发代际变更的 epoch-only UPDATE。真实PG/CH单文件专项1断言通过，1393ms，类型及scoped lint通过。产品代码、签名、guard不变。证据 [JSON](performance/producer-canonical/daily-backup-fixture-fix.json) / [log](performance/producer-canonical/daily-backup-fixture-fix.txt)。修后完整入口尚待新不可变提交运行。

## 修后不可变2d2dda2完整本地入口：EXIT0

`2d2dda2219c0c755fc3570926c7138c5269c9fb5` Git archive重新逐blob绑定后，使用全新独立PG/CH/Redis运行相同 `scripts/validate-local-final.sh`。359单元、490真实集成（183文件）、31真实Chromium浏览器均通过，0失败/0跳过；lint、类型、SDK、journal、tracker/Vite/server构建、迁移、编译生产入口启动均通过。完整入口 **EXIT0**，其自有服务/卷清理完成。证据 [完整log](performance/producer-canonical/full-2d2dda2-pass/regular.txt)、[集成JSON](performance/producer-canonical/full-2d2dda2-pass/integration.json)、[源码绑定](performance/producer-canonical/full-2d2dda2-pass/source-binding.json)。新镜像和独立恢复仍待执行，性能5000 FAIL不变。

镜像前资源处理：本项目四个已结束且无容器引用的 `security-e991f4c`、`ops-failed-26948`、`security-05360be`、`ops-fallback-c610` 镜像完整保存到 `/tmp/baize-ended-images-20261011/old-ops-four.tar`，1220518400字节，SHA256 `cfab15e900ba01d53e89c990675979f7b3299a50e6067d4ee505f8a04083fa13`，配置ID与所有layer可读性校验后仅非force移除四tag。可用归档`docker image load`恢复；共享层仍被cache引用，workspace空余仍约5.7GiB，未声称释放标称容量。未prune、未清理源码/卷/有效证据/其他项目。归档本身在另一tmp盘占用约1.22GB，不算释放该盘空间。
