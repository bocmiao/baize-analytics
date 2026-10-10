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

恢复证明追加最终源一致性检查：verifyReplayRetentionProofStillCurrent只读取源最新完整站点/cutoff向量，不再次调度；签名/来源/有效期与向量不匹配时阻止成功标记。新增第三实际用例验证初始current通过、源cutoff推进1秒后拒绝、源CH仍不改；最终proof专项3/3PASS1.68s。目标028历史归档中的rrweb也必须按最新cutoff物理清理，ops负责对应helper，当前canonical proof专项不扩大为历史全命名空间恢复或Docker验收。

后续v2范围/source TTL实际回归：canonical-replay-history-retention.test.ts3 +canonical-replay-retention-proof.test.ts3 +canonical-replay-retention.test.ts5，3文件11/11PASS4.47s。proof.version2/scope canonical-and-history-replay，activeCH∪publishedrawhistory∪037既有授权站点；v1failclosed。PG权威history-only真实源CH混合records过期物理去除/新records和hourlyPV7保留，ACKrollback重试成功，rawmanifest移除仍proof保留旧授权cutoff。ops sourceCLI/targetscope/index.retentionSites接线中，完整Docker新模式尚待验收。

通知派送门禁（后续G切片）：governance-notification-race.test.ts实际nativeHTTP→collector→worker→report producer→显式映射的本地HTTP provider，真实PG删除/共享site gate。3/3PASS2.43s，验证claim缓存之后真实删除导致零派送；派送中删除真实advisory锁等待，provider返回后才删除ACK，之后不再旧发送；仍running但epoch改变的报表被撤销且正文最小化。明确provider为本地测试映射，不改变生产SSRF guard，不代表SMTP/企业账号外发验收；已经发出/在途外网消息不能召回。report/goal/funnel绑定aggregationEpoch，sameclient重新读取并在15秒有界transport期间持P/site shared gate，状态与日志同client，不持连接借同pool。ownedlint/全仓types通过。

后续G稳定生产接口与定向组合（非root第八冻结全量）：canonical-replay-retention.ts 导出 replayRetentionScope(client)/replayRetentionScopeSql，scheduler/proof/ops package共用精确v2范围；history-replay-retention-restore.ts由ops导出applyHistoryReplayRetentionCutoffs供源运行期调用，已验证真实PG权威源CH记录级TTL。governance-worker.ts绑定report/所有alert的aggregationEpoch，dispatchClaimedNotification同client复读status/attempts/lease/epoch并持gate至有界派送结束。2026-10-10 11:26，governance.test.ts21 +governance-event-store.test.ts3 +governance-pool-race.test.ts2 +governance-notification-race.test.ts3 +governance-canonical.test.ts7，5文件36/36PASS9.97s，测试期间owned code稳定。此前v2scope/history/retention另3文件11PASS不重复计入36，也不加到root旧318/20或第八Compose计数。ops sourceCLI/完整target历史恢复及新Docker由root下一冻结统一验收；标准PG/CH真数据和本地显式provider映射不是外部账号/SMTP投递承诺。


ops后续v2 native CLI真实验收：`/tmp/baize-canonical-proof-v2-source-advance-final-real.log`实际EXIT0。执行PG dump/snapshot→独立PG/CH恢复→最新7→90授权对canonical与028混合回放逐记录物理裁剪，验证worker失败拒绝/恢复、源cutoff推进1秒后still-current拒绝；源正文和历史namespace不变，trafficSwitched=false。另4文件21PASS包含签名daily canonical/028整包和双precommit隐私helper，不并入上述治理36或root全量。该CLI证据的schema范围是exact versions、036 carry非空尚不支持；ops后续非空036包/helper/runtime仍在制，新完整包、Docker、不可变root全量与native canonical浏览器仍待验收。持久入口见[历史归档验收](ACCEPTANCE_HISTORY_STORE.md)。


后续非空036范围推进（保留前一empty-only运行记录）：`/tmp/baize-carry-proved-041-native-entry-real.log`实际EXIT0，sourceSchemaScope=`exact-versions;carry-v1-authenticated`，实际migration版本包含036与041。真实PG dump→独立CH/PG恢复验证nonemptyCarryRestored、latest journal删A保B、source proof推进拒绝、worker失败拒绝/恢复、当前与历史混合rrweb物理裁剪；source正文/历史namespace不变，trafficSwitched=false。standard carry包定向5文件24PASS；daily非空carry包另2PASS不等于完整daily activation/restore。严格PG metadata闭环、daily完整激活/恢复及新Docker/不可变全量仍待后续证据，生产activation/replay guard仍false。此进展不覆盖此前empty-only、签名/worker故障等失败记录，也不合并成root全量计数。


ops补充精确范围：上述native fixture的041表行为空，不能当非空041端到端。非空producer-HMAC headers/remap与删除A保B由history-carry-backup专项证明（`/tmp/baize-041-package-real.log`4文件6PASS、`/tmp/baize-carry-header-delete-final-real.log`2PASS，分别记录不合并）；daily2PASS为真实daily collector trusted lineage→raw/key过期→PG包capture/anchor导入→伪造lineage拒绝与partial unavailable刷新，不是daily CH carry producer激活。独立canonical-daily-backup的signed039/per038-column proofs不能冒充partial reducer闭环。已知exact041包仍拒绝未知未来版本/缺provenance；CANONICAL_ACTIVATION_READY=false。


后续042/043范围（工作树，非不可变发行）：ops报告`/tmp/baize-042-canonical-native-entry-real-retry.log`实际EXIT0，真实042手动导入及aggregate随PG dump保留，沿用standard非空036/latest journal A删B留、retention/worker故障门禁；sourceManifest284记录摘要，sourceCommit=null。`/tmp/baize-042-ops-final-targeted.log`3文件3PASS含非空041、daily包与独立daily namespace；首次过早C6导致ledger fingerprint失败，修fixture为真实pipeline顺序后通过，原失败保留。新Docker/CH shellwrapper未验收。

043 header消费者新增定向实际验收：session-header-source.ts及session-header-source.test.ts，2026-10-10 12:10:40，1文件1PASS、924ms；真实PG/CH且pool max1，205条CH producer-HMAC headers分100批上传后删除PG该run正文，再混合旧PG owner。逐run committed043 receipt选源；同client TEMP ON COMMIT DROP，以owner/published predicate筛选、visitor/eventtime排序cursor100输出，验证tombstone、seal篡改拒绝、TEMP清理、pool waiting0。实际CH ALTER物理移除body但保留PG receipt时明确SESSION_HEADER_BODY_UNAVAILABLE，不能回退PG零值。ownedlint/tsc EXIT0。该专项不代表A reducer接线、完整metadata-only或043备份恢复已完成，生产guard仍关闭。


044事实读取TEMP桥（尚非整体metadata-only完成）：新增fact-store-source.ts与fact-store-source.test.ts。2026-10-10 12:26:57，真实PG/CH max1池专项1文件1PASS、780ms；205条CH effects（PG该run事实为0）融合旧PG owner，SQL exact UV2；完整zero-vitals-kind marker不回退故意残留的PG999，合法旧PG vital123保留。验证identity时间段tombstone、同client TEMP有界staging、nested read context复用/restore/cleanup，以及真实CH ALTER删body但receipt保留时FACT_STORE_BODY_UNAVAILABLE。初轮0test因consumer SQL字符串quote解析错误，修后才执行通过，不冒称首轮全绿。ownedlint/全仓types EXIT0。prepareFactReadSource返回独立relation names，不shadow永久表；withFactReadSource安装context并可靠恢复。A producer/reducer/全部查询接线、session/carry正文迁出、044备份恢复及生产activation仍待各自验收，本专项不能证明严格PGmetadata已完成。


044后续重建输入门禁：prepareFactReadSource新增显式forRebuild选项，只有最新head与当前aggregation epoch一致、generation>processed_generation、源/现authority均CH、canonical namespace相同且deletion epoch前进时，允许读已认证存活backing供修复；默认只读仍拒绝陈旧来源，不声称coverage1。2026-10-10 12:37:27 actualPGCH专项1PASS、871ms，clean generation/epoch改变/namespace改变均拒绝，repair模式真实CH正文缺失仍失败关闭。删除fence推进由真实PG元数据fixture控制，非完整worker删除链，A另验producer/rebuild路径；ownedlint/types EXIT0。

046首次权威迁移及可靠删除修复（工作树定向验收，生产guard仍false）：cutover-receipt.ts、fact-run-closure.ts、046_canonical_cutover_receipts.sql绑定真实PG已发布闭包及实际CH shadow验证；cursor100稳定流式SHA计入归档owner正文/引用，不以run UUID代替内容证明。原receipt审计字段不变，修复字段仅在实际fsync journal记录校验/HMAC opaque scope、同client token、精准physical ACK及epoch重base后提交。cutover-receipt.test.ts真实PG/CH max1验证旧PG归档B留存；删除当前A时故意在CH physical ACK后抛错、PG回滚，journal重放后durable repair允许下一worker读取B。默认普通只读仍拒绝source mismatch，未调用公开activation guard。初次fixture使用错误legacy-vitals字段及误把replay返回对象当数字的失败已修，不隐去重跑性质。

047五类剩余正文消费者：remaining-fact-source.ts、remaining-fact-source.test.ts真实CH sessions/numerics/members/carry checkpoints/keys原型正文，PG当前run五表实际清空后与旧PG owner混读；同client TEMP/cursor100、标准carry checksum/owner校验、真实typed numeric SUM212及exact UV2不变，FK转run后的carry head仍必须拥有认证CP backing。身份时间段重叠删除整派生行供重建，不做伪精确算术扣减；CH CP正文实际物理删除且receipt存留明确失败，不能PG fallback。strict模式缺任何已选owner/kind的完成marker（包括zero kind）明确NOT_MIGRATED；transition才允许明确未迁旧PG输入。2026-10-10 13:15:22组合fact-store-source、cutover-receipt、remaining-fact-source实际3文件3PASS，3.82s，不并入root全量；047最初fixture参数整数类型冲突修正后才通过。044/047消费者接线与备份/删除完整运行矩阵由对应代理继续，旧PG stats_hourly/daily JSON、page_vitals/legacy centroids仍待048迁出，不能把该专项称metadata-only完成。

048有限兼容缓存正文桥（工作树，新功能不扩范围）：048_cache_store.sql、cache-store.ts/cache-store-source.ts、cache-store.test.ts覆盖stats_hourly/daily原Bucket JSON、page_vitals原加权centroids、analytics_vitals_facts legacycentroids及heatmap_points完整coords/count原row；PG仅owner/attempt/hash/count/每bucket指针及heatmap committed batch白名单。单bucket原body上限8MiB、单上传batch预算12MiB/≤100rows，超限失败关闭，不宣称大基数compatibility Bucket无限容量；steady strict worker仍需A避免构造全站高基数JSON，SQL事实读取是独立闭环。发布只切换相关bucket指针，不替换整个保留周期；允许freshlease校验下live generation≥captured generation、epoch/deletion fence仍严格。完整zero-kind marker不以空PG结果推断。

2026-10-10 13:25:47实际1文件2PASS、2.28s：真实PG/CH max1，历史PV12+另一天7保留为19，原[100×2,500×19]不等样本centroids不改权重，真实heatmap count19；PG当前cache正文为0，cursor/TEMP/context清理、真实rollback孤立attempt GC、实际物理删除CHbody保PGreceipt拒绝fallback。独立target PG schema+独立CH namespace验证原producer body/seal不变、仅live epoch stamp映射；伪造body在任何target owner写入前拒绝。此为模块恢复专项，不等于F完整签名包/CLI/Docker恢复入口已通过，也不支持任意owner UUID重签/映射。

048热图恢复须按source原batch或covered/uncovered同质区间恢复并精确映射target batch；不能清白名单却保base双计，不能盲保失效source batch IDs。个人删除若无法从存活精确backing重建唯一过期legacybase，cache全量安全擦除必须保留analytics_cache_unavailable负覆盖元数据，并报CACHE_BASELINE_UNAVAILABLE，不能把B的缺历史当0或coverage1。该不可用元数据/精确batch映射与完整48包入口仍待F/A/root联合验收；activation guard仍false，所有原失败/尚未集成边界保持。

048消费者与负覆盖细化（2026-10-10，工作树专项，非root全量）：published-window-counts.ts使用同client SQL numeric/member backing读取控制行，分享逐日UV保持站点日历边界与exact distinct；不填造未发布日期或把控制JSON当PV0。governance traffic与external alert/daily consumer接该桥，site-export缓存改同client授权关系读取，strict sessions/definitions使用published-export-projections.ts真实事实投影。负覆盖按请求kind和时间交集检查，未请求的热图缺历史不阻断无关PV查询；严格PG只允许有限routing控制字段。较新控制generation覆盖旧CH指针，较旧控制不能覆盖真实body。

15:21:07实际四文件六测试全部通过（6.72s）：cache-store、cutover-receipt、remaining-fact-source、governance-sharing-facts。包含原TDigest对象centroids不等权重保留、live高水位发布、kind/window负覆盖、原CHbody与新PG控制时序、046捕获前真实048缓存及捕获后元数据变化拒绝；047无页面session/CP的旧numeric事实通过真实producer-HMAC043事件组件取得visitor与时间边界，不伪造session。标准与daily_salt分享测试均从真实collector接受事件，再真实V2发布及native HTTP读取，跨两个半小时时区边界保持PV3/UV2，旧日PV3/UV3不丢失。types实际EXIT0。

保留失败与修复边界：消费者初次六文件31项29通过2失败，涉及手工PG缓存与已发布CH指针冲突、分享多填零日期/半小时时区范围；后续25项24通过1失败是daily fixture没有真实lineage，改真实collector后首次又因claim早于采集导致FACT_SNAPSHOT_MISMATCH，改为采集后claim才通过。未减少任何PV/UV/阈值断言。048 full signed namespace/CLI、strict首次迁移及完整生产查询矩阵仍由对应真实联合验收确认；此段不声明metadata-only生产guard已开启或新Docker已通过。

消费者续验实际结果：15:21:24 governance21、external-alert1、external-suggestions1、cutover-receipt1共四文件24PASS；15:22:19 governance-full-export、canonical-site-export、site-export-notification-epoch共三文件7PASS。合并前述四文件6PASS、去重重复cutover项，当前涉及十文件36个不同专项均通过；不是一次完整CI命令，也不替代仍在制strict生产activation/backup矩阵。原完整PG导出与canonical EAV缺正文/跨站/删除段/通知epoch断言保留，strict sessions/definitions新投影的实际首次activation专项仍待A native fixture接测。owned ESLint实际EXIT0。

Standalone history048适配（工作树，尚不等于完整signed history入口）：history-cache-store-backup.ts捕获选中闭包的原owner/完成zero marker、producer-sealed正文、per-bucket指针、heatmap coverage和负覆盖；128MiB/100k受控包预算，不重签公开body，不把ownerUUID当内容证明。恢复要求独立CHscope，legacy centroid原runUUID身份映射，目标owner无碰撞；热图source→target批次映射先于任何正文写入校验。helper只负责私有预发布恢复，返回requiresLatestJournalReplay，真实caller必须全部sidecars装完后同client精确重放最新journal并重建，不接受no-op callback或negative flag替代B保留验收。

15:30:53专属真实PG/CH测试1PASS、935ms：独立PG schemas和真实独立CH database，source checksum不变、原bodySeal/owner不变、PV19和B基线保留、热图批次映射真实、错误run重映射/缺映射拒绝。初次fixture非规范ISO key导致pointer拒绝、第二次误用不支持的config.database导致scope相同，均按真实接口修正，保留失败记录；该测试尚未证明外层签名history包/latestjournal完整入口，F继续联合验收。中英用户API更新真实selectedsource，迁移手册补migrate-facts/strict实际预览契约及生产guardfalse边界。

Strict restore缓存修复协作：B/F真实operator恢复已到目标migrate-facts时暴露CACHE_MIGRATION_EXISTING_BODY_MISMATCH；PG已经pruned的routing control不能和真实sealedCH正文做exact JSON比较，也不能从PGrows=0臆造zero kind。A独占cache-closure-migration修复，该native首次失败日志保留为/tmp/baize-strict-identity-restore-first.log，完整同pipeline重测仍以B实际结果为准。E仅补adapter负例：15:43:57 cache-store与history-cache-store-backup两文件四测试PASS、6.56s，真实目标pointer+CHbody在wrongsite/aggregation epoch/canonical epoch/deletion epoch变化均失败，回滚后原认证body可读；实际CH body物理缺失、伪造恢复内容仍拒绝。该定向通过不代替native operator恢复成功。

048冻结前实际缺口与修复在制：C核实删除入口尚未调用cacheadapter的物理ACK，故仅V2控制行覆盖旧缓存不足以证明旧A正文消失。C接同client同步erase+ACK及真实native source/target断言；A处理实际新generation重建的单bucket发布及可证明覆盖恢复。E strict fullsite-export小时/日统计改为当前已认证44/47 numeric/member事实投影，干净generation检查，membercounts为SQL DISTINCT，旧cachePV不会作为当前结果。manifest新增实际published_fact_source、raw authority及canonical/deletion/aggregation epoch+gen/processed/watermark向量；访客值不导出，uv和membership_counts才是精确数。未知legacy基线仍负覆盖不可用，不能因投影新统计自动宣称原个人正文已物理清除。

15:50:13真实collector→V2事实分享与完整PG导出两文件5PASS、5.15s；额外投影断言将陈旧V2输入PV999/erased-A投影为真实PV3/UV2且无erased-A。此为投影正确性专项，非真实缓存A物理删除验收，后者须C/native结果；类型和ownedlint EXIT0。不将A/F/B已有operator恢复通过冒称已经关闭该物理缺口。

Scoped privacy导出续验：严格入口只绑定认证44/47；当前explicitV2小时/日控制槽直接数值/成员投影，不要求物理擦除后的048 namespace存在；真正legacy routing正文仍须认证缓存。已知隐私失效的热图legacy表省略（没有[]假零），manifest unsupported_tables/table_read_metadata coverage0与范围；未知正文缺失/损坏/HMAC/TCP仍抛错。实际vitals样本cursor100重算TDigest，collector21样本2×100+19×500原权重/weighted mean通过。16:01:54完整PG导出、canonical EAV与真实collector分享/新projection三文件7PASS，7.46s；types/lint0。

新失败继续保留：page-vitals SQL别名day首次缺AS导致语法错误，实际样本test修正后通过；C真实native物理清理已过ACK后，scoped export首次仍对无负flag且无048hourlyowner绑定缓存而报CACHE_SOURCE_NOT_MIGRATED（/tmp/baize-cache-privacy-scoped-first.json），已改knownV2始终直读44/47。C最终native物理0/B PV3 UV1/fullsite export/热图省略闭环尚以C最终结果为准，不能用以上七项旧范围替代。

C后续native还暴露第二条真实边界：strict producer可没有PG stats_hourly/daily兼容槽，直接遍历空PG槽使导出0而真实B queryStats已有PV3/UV1（/tmp/baize-cache-privacy-final.json）。E已改小时/站点日历日键从认证published044 effects SQL DISTINCT派生，≤100k，和明确槽合并后逐范围精确numeric/member投影；不造PG控制行、不以空PG当零。16:03:23真实collector空daily/hour槽投影PV3及21不等权重vitals专项PASS、2.83s，types/lint0；真实C/native最终仍单列，不用该PG专项替代CHphysical source/target闭环。

C最终真实native闭环通过：/tmp/baize-cache-privacy-closed.json，1PASS/0skip，对应独立快照/tmp/baize-cache-privacy-closed-fbo2hqa7（C保存SHA manifest，非main提交）。真正strict源删除A后048所有attempt物理count0、owner/pointer0、负覆盖元数据保留；真实B worker查询PV3/UV1/coverage1，完整站点导出由认证effects派生hour/day均PV3、无A，heatmap table不存在且manifest coverage0/reason，不假零。changedfalse独立journal重放仍物理0，重建后B3/1保持。未放松生产guard或未知legacy flags。该通过是新的源侧隐私与导出native专项，B独立目标operator restore复验与root统一冻结全量另列。


### 048 已认证 V2 缓存删除后的精确重建（2026-10-10 16:17 UTC，工作树专项）

独立严格恢复首次失败仍保留在 `/tmp/baize-strict-identity-restore-physical.log`。安全诊断确认仅 hourly/daily `privacy_invalidated`，没有热图负面标记；不能据此清除未知历史。048 新增 `rebuildable_v2` / `rebuild_proof`：物理删除前以真实 CH/HMAC 验证原 V2 缓存，保存不含访客或正文的范围、来源头、流式摘要和站点 HMAC。操作迁移仅在当前已发布、干净、权威一致的 44/47 真实保留区间证明通过后重建对应小时/日桶并清除该标记。原未知标记保持 false；过期独有基线不推断为零。

实际 collector → PG V2 发布 → CH 缓存 → 物理清除 → 认证证明 → 同客户端事实重建专项 1 PASS（16:17:22），含篡改证明拒绝与未知 false 拒绝；缓存/独立历史缓存 2 文件 4 PASS（16:16:10）。首次新增 SQL `hour` 别名语法失败已修正；原失败不抹去。旧治理两文件 24 PASS（16:17:35）：漏斗 fixture 按站点时区构造完整日，仍断言 0.2/0.8；分享存储标注断言真实 `postgres`。这些不是 root 全量验收，也不是独立 target restore 已通过；该原生流程由 B 继续复验。

16:20 补充：独立恢复的安全遮蔽 `CANONICAL_OPERATION_FAILED` 对应新增日桶 SQL 的 `day` 保留字别名错误；扩展真实源专项同时覆盖 hourly/daily 后复现 PG42601，改为明确引用别名。16:20:23 两种认证缓存实际物理删除后重建均通过（同一测试还保留篡改和未知拒绝断言）。原小时单一路径通过不能代表日桶通过；此前恢复失败保留，B 重新验证独立目标。
