# Canonical 治理切片验收（在制，未启用权威迁移）

2026-10-10 本切片仅涉及 `governance.ts`、`governance-worker.ts`、034 回放索引及独立测试。不是新 main 的全集或 Docker 验收，也不是 canonical 激活证明。

- `ingestGovernance(...,{canonical:true})` 校验 opt-in、保守掩码、合法序号和记录时间；PG 034 仅保存 chunk 索引、事件标识、hash、路径和记录时间边界，rrweb payload 仍只存在 CH 已提交 body。
- canonical 回放按同一 RR 客户端读取已提交 CH body，匹配首个认可 page/seq 索引，校验 hash/掩码/seq；单次最多 1000 chunks、128 MiB。空过滤也读权威源，不把 CH 故障变成空 PG 回放。
- canonical usage 在同客户端流式消费权威、删除过滤后的事件；event_count 是逻辑事件数量。`bytes:null` 表示未提供 CH 实际磁盘用量，`logical_bytes` 是规范事件 JSON 字节，不能替代磁盘容量告警。
- 目标与漏斗告警改用同客户端 `queryStats` 与站点日历窗口；不完整 coverage 或不支持的漏斗范围延后检查，不把缺失历史当作零。
- 现有 PG 回放存储分支仍保持，完整站点导出调用传入已有 pool，以复用同一事务连接。

实际命令：

```sh
TEST_DATABASE_URL=postgresql://baize_dev@127.0.0.1:5432/baize_dev CLICKHOUSE_TEST_URL=http://127.0.0.1:38123 npx vitest run tests/integration/governance-canonical.test.ts tests/integration/governance.test.ts tests/integration/governance-event-store.test.ts tests/integration/governance-pool-race.test.ts tests/integration/governance-full-export.test.ts
```

最终当前切片结果：5 文件 / 37 tests PASS，8.58 秒（canonical7 + 原治理21 + event-store3 + 真实池屏障2 + full-export4）；另外实际运行 canonical-site-export 2/2 PASS，746ms。新 canonical 文件独立实际 PG + CH、max=1 pool；证明 metadata-only、真实 payload 重构、重复序号选首条、非法输入拒绝、提供者 503 失败关闭，以及已保存 visitor tombstone 隐藏。原目标/漏斗告警测试补真实 worker 发布，不以直接插入 events 等同已发布汇总。

首次新专项 4 项中 3 项失败：CH 对对象键进行规范排序，而入口直接 JSON.stringify 的 hash 对键序敏感；已修为稳定键序 hash。另一断言误将错误 code 当作中文错误 message 匹配，已改按 code 验证。修复后新专项4/4及中间组合28/28、30/30通过；加入两项真实删除等待锁时序后删除等待组合32/32通过，完整导出桥接后最终37/37通过，不把中间版本计数冒充最终数。该首次失败记录保留。

未完成边界：034 记录时间范围能发现潜在 A→B 混合 chunk，单凭索引不能证明 CH 内每条 rrweb 记录的精确物理删除与独立 journal 恢复；后续 C4 三项真实 PG/CH 专项已验证不可变替换、旧 body 物理 ACK、故障回滚/孤儿恢复及独立 journal 重放，但原生 canonical 浏览器与下一完整验收仍待验证。仅按 wire ts 删除整 chunk 可能遗漏 A 或误删 B；索引隐藏不等于物理删除。canonical replay 采集 guard 与整个 activation guard 必须继续保持，直至该端到端流程实测通过。033 normalized analytics 正在其他 agent 开发；本切片不会将旧 queryStats 的保留明细重建称作无全数组新事实查询。完整导出桥接已实际验证，不能把空 PG replay_chunks 当成 canonical 完整导出。

治理 schedule/alerts 与单站 usage/replay 在 RR 固定之前先取得 session partition 共享锁和排序的 session site 共享锁，再 BEGIN RR、转为 xact 共享锁并释放 session 锁。实际删除等待测试观察 PG advisory 等待，独立事务删除旧事件后释放，后续 RR 读取零事件且 advisory 锁无残留；不能先创建快照再等待 site 删除 gate。完整导出的 canonicalReplayExport 桥接已实现，复用同客户端和已经权威/删除过滤的导出 events，校验序号与掩码/hash；created_at 不可还原则为 null，另列实际 wire 与记录时间。site-export fourth canonicalReplayRows 接线已完成，真实 queued full export→worker→磁盘 JSON 验证有 CH payload、manifest 标记 canonical_committed_replay、PG replay_chunks 为零。首次这项测试误读 manifest 而真实字段名为 export_manifest，导致36通过1失败；修复断言后37/37通过。

本切片相关 eslint 已通过。全 workspace typecheck 在10:05执行出现并行在制 relational-stats.ts 的缺失 errors.js 导入错误，已通知拥有者，未擅自修改；拥有者修正后10:10实际 tsc --noEmit EXIT0。这些结果仍为工作区小切片，不是不可变 main 全集证明。

37通过切片交付后另补分享兼容：governanceSharedDays对旧daily桶在SQL中取集合大小，对relationalVersion2桶调用同client queryPublishedMembers精确计数；共享stats/嵌入读取改为同client RR。独立tests/integration/governance-sharing-facts.test.ts实际源events→V2 build/publish→nativeHTTP share，Asia/Kolkata半小时区、standard/daily_salt各验证重复访客跨小时不相加、旧legacy day不丢失、匿名分享不返回标识、撤销404，max1无借池；1/1 PASS1.41秒。此新增切片不算入之前37，且未重复跑根已接收的37。replay hash从同一稳定键序算法抽为replay-hash.ts供C4物理重写使用，避免循环依赖与键序漂移；后续C4专项由tracker/ops验证。

V2 UV告警兼容：traffic UV不读取light bucket缺失的visitors数组，改用同client publishedMemberSource按UTC小时COUNT DISTINCT，含28天对齐基线。2026-10-10 10:32，完全迁移的独立schema执行external-alert.test.ts真实collector→worker→PV/UV告警→AI任务，1/1 PASS（3.00s），原PV20/UV20/baseline1/calls3断言保留。首次共享旧public直接执行因031 source_authority缺列失败；未修改共享schema，隔离schema在finally删除。此结果不覆盖其他外部回归失败或根全量验收。

运行期物理回放保留（后续工作树，不算入第七318/20）：canonical-replay-retention.ts用站点配置及实际记录时间cutoff=min(站点保留,30d)，同client partition/site gate先redactCanonicalReplay物理替换/ACK，再提交PG索引；可靠指针在失败时保留，重试可恢复已验证CH孤儿，不借同pool新连接。每站10k访客、每访客10k chunks超预算failclosed，未先删索引；并不伪称个人删除journal。governance-worker minute接线，canonical-retention先调用物理helper再genericrawexpire，避免先清旧索引。新tests/integration/canonical-replay-retention.test.ts真实隔离PG(max1)/CH四项PASS1.68s：30天cap、7天短站点混合保新、ACK后PGrollback重试、整chunk过期body/index/member清除；后续epoch更新加同client dirtySite以重算snapshot，再组合小回归记录如下。activation仍关闭，非原生canonical浏览器或不可变全量证明。

10:37最终小组合：canonical-replay-retention.test.ts四项 + canonical-retention.test.ts一项=2文件5/5 PASS2.16秒；owned lint和全仓typecheck EXIT0。该阶段重试测试是相同策略cutoff下的ACK后回滚；后续发现策略延长可能让旧metadata重试失选，需先持久提交单调授权cutoff任务再物理变更，迁移编号待root协调。此风险尚未测试/关闭，不将当前指针方案说成任意策略变更下完整闭环。

037扩展关闭运行期策略延长重试缺口：scheduler独立提交单调cutoff，队列P→site→job，sameclient固定codemsg/指数退避；ACKrollback→7→90policy实际恢复PASS。首次新增第五用例组合4PASS1FAIL是最后fixture倒退时钟到已完成next_at之前，真实队列正确未执行；修为后续时间，不调整生产backoff。最终2文件6/6PASS2.28s、lint/type EXIT0。旧backup恢复最新cutoff集成仍待验证，不能用个人journal替代此运行期账本。

最新sourcecutoff恢复证明：canonical-replay-retention-proof.ts及canonical-replay-retention-proof.test.ts两项PASS1.61s，ownedlint/全仓types通过。实际canonical备份文件+独立targetCH namespace，旧PG元数据索引及30d任务为真实数据库fixture（未执行pg_dump/docker命令）；最新源7→90策略后授权7d，签名完整proof fsync→sameclienttargetGREATESTmerge→bodyrestore→physicalrecordfilter→commit，源CH原body不变。缺失/不完整/错误sourceScope/篡改/stale在body发布前拒绝。首轮1PASS1FAIL仅断言查询未初始化目标CH空表导致CANONICAL_CH_UNAVAILABLE，fixture初始化空表后通过，生产failclosed未放松。CLI/shell由ops接线，完整Docker恢复尚未据本专项标完成。
