# Manifest 元数据索引与观测验收

2026-10-10 UTC。054 索引、实验及原始记录已随 `2ec2723` 保存。实验执行记录的基线是 `5ee7afea783918c242321a50e1aaf1dfb7c41f1f`，执行时 `experimentSourceCommit` 为 null；不能把事后提交号冒充实验启动时的不可变源码。脚本与054迁移 SHA256 保留在 [执行记录](../../test-evidence/054-member-index-record.json)。

## 真实 PostgreSQL 元数据实验

使用完整已迁移 DDL、独立随机 schema、max1 连接池，构造合成 receipt 元数据；每批100行，逐批按真实 batch_id/row_key 查询。仅在自有实验 schema 移除新索引复现基线，然后建立候选索引并 ANALYZE。四种数据集前后返回行数、字节数与摘要完全一致，约束未改变，执行 EXIT0、schema 清理完成；相关 lint/type EXIT0。

| 元数据表 | 行数/批数 | 前查询总耗时 ms | 后查询总耗时 ms | 基线 ANALYZE ms | 索引构建 ms | 后 ANALYZE ms |
|---|---:|---:|---:|---:|---:|---:|
| analytics_fact_store_members | 25000/250 | 566.698 | 209.105 | 67.383 | 146.233 | 67.342 |
| analytics_remaining_fact_members | 25000/250 | 609.277 | 293.442 | 62.137 | 137.754 | 73.414 |
| analytics_fact_store_members | 50000/500 | 2099.307 | 408.775 | 100.501 | 262.524 | 91.110 |
| analytics_remaining_fact_members | 50000/500 | 2292.684 | 454.527 | 101.799 | 262.439 | 93.282 |

查询计时不包含表中单列出的索引构建和 ANALYZE 开销；不能只报后查询而隐去这些成本。完整 EXPLAIN ANALYZE/BUFFERS、字节数与 SHA256 见 [四场景原始实验](../../test-evidence/054-baize-member-index-experiment-final.json)。首次合成 INSERT 因 UUID 类型推断产生 PG `42804`，自有 schema 已清理；显式 UUID cast 修正后重跑通过，原失败记录保留，不记为首次通过。

这是实际 PostgreSQL 上的合成元数据实验，不含 CH 传输、EOF、正文 HMAC、归属验证、TEMP正文填充或完整应用 HTTP/worker 成本，不证明 CH 应用提速、生产 SLO、1C2G 或5000规模达标。

054 namespace exact 兼容补充已提交 `b0cb142`，2项静态单元通过；这不是实际 restore 或镜像运行证明，与元数据实验及完整应用计数分别记录。

## manifest_sql 有界阶段观测

新增 `manifest_sql` 后固定阶段共9类：pool_acquire、partition_lock、site_lock、ch_transport、authentication、temp_fill、aggregate_sql、json_serialize、manifest_sql。固定7个 adapter 标签×4个 operation×9阶段，adapter 聚合键最多252组合；未知接口未观察不能当作耗时零。计数/行数/批数/字节只使用真实观测，未测量字段为 null。阶段可嵌套或并行，是 inclusive 时长，不能相加为 CPU 占比。关联标识仅有界保存在内存，不输出 visitor、正文、凭据或关联 ID。

root 实际阶段单元专项 [原始报告](../../test-evidence/main-2ec2723-manifest-stage-unit.json) 为7 PASS、0 FAIL、0 skip；不加入旧全量计数。044 fresh 成员单次 typed INSERT 已随 `19d97af` 保存，提交前文件摘要绑定的真实 PG/CH 专项14 PASS、单元3 PASS，见 [记录](../../test-evidence/044-fresh-member-bulk-record.json)。CH 读回、fresh fence、原 header 锁及事务顺序保持，普通 PK/FK 错误传播，写入数量不符拒绝；未使用 ON CONFLICT 吞错。后续不可变源码空库联合验收与应用负载尚在进行，不能将上述索引或观测实验替代整轮结果或声称性能达标。此文档更新没有重新运行测试、容器或托管流水线。
