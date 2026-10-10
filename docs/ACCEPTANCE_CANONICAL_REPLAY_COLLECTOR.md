# Canonical 回放可靠入口与046实际切换验收（WIP）

本次仅 collector 接线及原生测试，不启用 main 的 readiness guard。真实 PG/CH、独立schema、max1池和 localhost HTTP；隔离源变体只有 `CANONICAL_ACTIVATION_READY false→true` 一个差异，完整哈希及差异复核见 `test-evidence/canonical-replay-collector.json`。

入口不再直接拒绝 canonical replay。仍先检查站点 opt-in、event-time、identity/tombstone、原 wire hash及严格遮罩；`ingestGovernance(...,{canonical:true})` 同事务仅写 replay_chunk_keys 索引，不写 PG replay_chunks。CH 已验证持久正文和 PG keys/index/outbox/manifest 共同成功提交后才202；CH故障真实503使整事务回滚。

同一事件ID原 wire hash不一致仍冲突。同 visitor/page/seq 的新事件ID若遮罩payload hash不同则 `replay_sequence_conflict`；相同内容只写 alias receipt、计duplicate，不额外发布正文或outbox。已提交凭据必须验证同epoch活成员及真实CH正文；当前批内待发布成员仅延迟到该批最后 CH 发布/PG COMMIT，不提早确认。保留期不可变替换更新 replay index 后，旧 wire 原hash仍可指向当前可靠正文；不会复写已删除的旧记录。canonical heatmap 通过现有 governance canonical选项避免持久PGpointcache，权限路由和CH点读取由根负责。

新 `canonical-replay-collect.test.ts` 实际setup→站点→PG采集→PGworker processed→shadow/verify→生产activate捕获046receipt→worker/prune→遮罩回放202。检查真实CH正文、PGevents/replay_chunks=0、索引、同wire/跨ID/批内序号幂等、冲突/未遮罩拒绝、读取及JSON全导出、30日嵌入记录物理裁剪和旧wire重试、访客独立删除日志、删除后读取/导出为空、旧wire拒绝。真实临时TCP端口关闭引起CH不可用，新回放的key/index/proof/outbox/member均回滚，既有receipt重试也503。

原三daily用仓库历史producer夹具真实采集/HMAC证明，通过实际PGprocessed head和管理员046activate凭据的head/epoch/gen/hash/count断言，不手工插ledger或authority。它们仍验证当前共享策略升级、签名replacement、CH ACK后PGproof回滚再启动恢复、每日盐精确删除和故障503。

最终执行（从独立源码变体）：

```sh
TEST_DATABASE_URL=<local PG> CLICKHOUSE_TEST_URL=http://127.0.0.1:38123 npx vitest run tests/integration/canonical-daily-authority-flow.test.ts tests/integration/canonical-replay-collect.test.ts tests/integration/canonical-provenance-collect.test.ts tests/unit/canonical-retry-receipt.test.ts
```

2026-10-10 13:34:39：**4文件8项PASS，0FAIL/0SKIP，14.08秒**。三daily单独046强断言先在13:28:05通过3/3、11.80秒。所属lint和whole types通过。不同阶段重叠，不相加进第八377或托管结果。

失败保留：初次typed import错误（hash须从独立replay-hash导入）与泛型fixture字段类型已修。首次native replay13:31:51 FAIL是预期时序：导出先捕获快照，同轮末尾才执行操作性retention；测试错误期待首份导出已经裁剪。修为首份实际两记录、retention物理ACK后第二份仅存活记录，13:33:16原生1/1通过；未修改产品retention时序或降低安全断言。

这是标准模式原生回放入口专项；未新增 daily replay还原质量、实际浏览器播放器、新Docker/灾备/规模或 main激活声明。047其他正文迁出及完整生产readiness仍在各负责模块集成。不能以本项宣称P2/全部计划完成。

最终交回时当前共享工作树types再检发现其他在制模块 `fact-backup-readiness.ts:26` 的 union.event_ts 类型错误；所属collect/daily/replay lint仍PASS。早期whole type检查PASS与本次来源variant8PASS保留，但不将当前WIP整体类型结果记为通过。已交根/D处理，未改其文件。
