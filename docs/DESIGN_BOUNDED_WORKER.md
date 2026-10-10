# 有界 worker：闭包计划与后续事实存储设计

本批已实现 `dirty-session-plan.ts`，尚未接 worker。worker 当前仍读取整个保留期并持有 events/session.events/维度成员/vitals 数组；本 helper 不等于解决这些内存问题，更不代表 P2 CH canonical 或 PG-only-metadata 完成。

## 实际闭包 planner

调用方必须已通过 beginPartitionSnapshot 获取一致 PG RR 快照，传入捕获的 site/epoch/generation/outbox 高水位/保留边界。SQL temp table 与 window 排序可由 PG work_mem 外部 spill，应用不持事件数组。dirty visitor 按 captured queued outbox 选择，完整读取该 visitor 的所有保留事件，而不是事件日附近固定窗口；lag(ts) 与 timeout、本地每日盐 day 边界计算 session components。无 pageview 的孤立事件参与事实，但不计成 session。心跳保持为事件，不能用 PV 时间代替 session 活动时间。

默认 changeKind unknown 必须 full_retained_rebuild。只有上层可靠证明本次 generation 完全是事件采集、没有混合定义/config/身份重写，才可传 confirmed_events_only。目前 collector 没有这种可靠 mutation-kind 状态，因此未来接线前仍应默认 full rebuild；“outbox 非空”本身不能证明无定义变更。无队列证据也 full rebuild。

旧 sessions 的完整 retained 时间跨度逐小时保守列为受影响桶，覆盖旧入口、退出、目标完成和路径事实曾落入的桶，不能只删除新事件所在日。实际旧 session contribution facts 尚未保存，planner 的桶范围是待重算范围而不是精确扣减数值。遇到开始于保留边界前的 session，或缺少证明且首事件落在 cutoff+timeout 内，carryComplete=false；不生成未知前缀，更不能据此覆盖过保留期 archive。标准模式跨午夜不分 session，daily_salt 按本地 day 分，DST 使用 timestamptz 实际秒差。

输出为连接内暂存句柄，page() 只分页 visitor；一个病理长 visitor 的桶列表仍可能大，已明确不是有界 reducer。COMMIT/ROLLBACK 自动释放 temp table。assertPublicationFence 必须使用**发布事务的当前 client**，不可在源 RR 的旧 snapshot 内检查新 epoch；上层还必须取 P→site lock、检查 lease owner/租约与 processed/captured generation。后续 generation 前进不阻止 captured publication；outbox 只完成 <=captured HWM。

## 下一阶段的必要规范化状态（尚未实现）

1. 可靠 dirty mutation ledger：site,generation,epoch,kind,event_time,visitor，以及 definitions/config fingerprint。collector/deletion/identify/定义变更同事务记录理由，才能证明 events-only 并选择闭包，而非用 queued 非空推断。
2. versioned session contributions：site,epoch,generation,session_id,visitor,first_event key,started_at,last_active,entry/exit,pageviews,duration seconds,visible milliseconds,bounce,first page dimensions。事件事实贡献分别记 bucket hour/day，避免晚完成目标归到 session 起点。
3. 精确 membership：bucket/dimension/event/funnel step + visitor/session provenance。移除一个 session 不应删掉仍由其他 session 支持的 visitor；UV 是集合 union，不是日 UV 求和。每日盐不允许把这些成员解释为跨日同人。
4. exact per-page/session scratch：page_id→真实页面路径，heartbeat interval 唯一键，scroll100 去重，以及 paths 前一 PV。長 session/multitab 不允许无限 JS Map；这些键应由连接内磁盘暂存表/受控外部存储保存。Session 目标首次完成、strict funnel 已中断状态与来源最后非direct click必须 event-time 更新。
5. vitals 流式 digest：保留整数样本权重、centroid mean 与 weighted Type7 元数据；比较旧原始数组统计 fixture，压缩仍标近似，不把大权重质点插值变成高尾假峰。
6. 跨边界 carry：起点 provenance、最后活动/前一 PV、来源归因、页面实例与心跳去重、目标/漏斗进度、epoch、source high watermark、carryComplete。删除、恢复、身份重写、privacy flag、超保留边界无法证明来源时失效并全 retained 重建/明确边界不完整。

## 接线顺序与验证

先建立 staging facts 与精确 reducer：逐 visitor component 的事件 cursor→session effects→磁盘事实，小时/日 contributions 外部排序归约，输出桶分批写 staging。对既有 sessionize/aggregate 使用真实 fixtures 比较全部标量/精确成员/币种/路径，digest 在注明近似误差下比较；之后才把 worker 双全量数组替换。旧 archived 桶不因小批次被替换，partial cutoff 桶保持现有不可用/保留策略。所有 staging 发布以 epoch/lease/captured generation fence 原子交换，失败旧 generation 继续可查。

最后才启用 dirty component 差分：晚到桥接会使旧两个 session 被新一个替代，需移除旧 provenance 的全部 facts并写新闭包；删除也必须覆盖旧 contributions，不能只给当前日减一个 visitor。连续活跃组件能任意长，必须流式或 spill，不以有限 window 偷换正确性。CH 明细成为权威还需要 durable ingress、身份/删除一致版本、历史 rollup 等价查询和独立灾备；本规划不删 PG 事实来降低最终要求。

本机 dev5432 独立 PG schema/max1 真测试当前覆盖完整 100-event/33小时跨日链、迟到桥接两旧会话、旧入口桶、本地 daily-salt/标准/DST口径、孤立 vitals 不算 session、混合未知变更 full rebuild、retention carry 不完整、tombstone 源过滤、RR 内持续真实 SQL 写入与 captured 分页、发布新事务 epoch 变化拒绝。尚未验证 collector mutation ledger、磁盘 scratch reducer、巨大单 visitor 实际内存上界或 worker 最终接线，因此 P2 不标完成。

2026-10-10 实际执行：相关 eslint、tsc --noEmit 通过；TEST_DATABASE_URL 指向 dev5432 的 dirty-session-plan.test.ts 真实 PG **6/6 PASS**。新加旧 session 无剩余原始页面时仍规划完整 29 小时旧贡献范围、机器人排除及无 outbox 全重建兜底。没有运行新的 worker 发布或 CH canonical 路径，不能把 planner 的通过记成那些未接线功能完成。

## 031 规范化事实与真实归约证据（2026-10-10）

`session-facts.ts` 现在把保留期原始流写入连接 TEMP 表，PG event-time 排序/窗口完整形成 visitor component，逐事件 cursor 驱动一个会话 summary。长会话的 heartbeat segment、完成滚动页面键落磁盘唯一表；目标/漏斗状态有 1000 个定义的显式预算。numeric effects 与精确 visitor membership 每 200 条刷写 031 facts，身份与维度键不使用原型对象。Vitals 单样本流入 digest，整数权重不展开，压缩仍是近似 centroid mean 分位。

`session-facts-publication.ts` 使用新事务 epoch/lease/captured generation fence，同一连接通过 SQL 插入会话、逐桶写旧查询表、SQL 归约目标与漏斗以及 visitor_first_seen，最后提交 processed_generation 与 captured outbox 高水位。目标转换是会话计数；漏斗跨日、跨会话使用 COUNT DISTINCT visitor，禁止日 UV 求和。partial cutoff 桶与旧 archived 汇总保持旧生产策略。`worker-facts.ts` 已建立可直接替换现 rebuildSite 的完整 rebuild 入口，测试调用真实 PG，而不是模拟返回值；默认 worker 路由接线需删除/恢复/隐私同事务 invalidateSiteFacts 先到位。

兼容 Bucket 仍含精确成员数组。它们不是无限内存：归约只持有一个桶，输入数值、成员和 digest JSON 累计默认 8 MiB 预算，超预算明确 FACT_BUCKET_BUDGET 并回滚发布，旧汇总继续存在；不会隐式改 HLL 或截断统计。此预算会拒绝高基数桶，不能据此声称所有百万事件场景容量已通过。长期目标需要规范化成员查询或磁盘输出，而非恢复无限数组。全局事件/Session.events 数组已在独立新 worker 消除，原小样本纯函数仅保留为对账 oracle。

实际执行：dev5432 独立 schema、max=1、work_mem=64kB，facts 8 项 + planner 6 项 **14/14 PASS**；owned eslint、全仓 tsc --noEmit 通过。1201 事件的长多页面 heartbeat 会话 EXPLAIN ANALYZE 确认 external merge 磁盘排序，visible_ms 与旧 oracle 精确一致。覆盖原型键、标准/每日盐/DST跨日、孤立 heartbeat/vitals、订单幂等/币种分开、25:1 不等权重分位、跨日漏斗 union、预算失败完整回滚、旧 archive 保留、持续 SQL intake captured 发布、epoch 删除阻断以及同 max1 连接无额外借池。

仍未完成：dirty mutation-kind ledger、跨保留边界完整 prefix carry、dirty component 差分生产应用、百万高基数输出容量、CH canonical 写接收与 batch committed 白名单、精确权威 CH 身份删除、PG metadata-only 与最终迁移灾备。当前 CH 故障下的可靠 202 依赖 PG canonical 明细，不能将新 worker 或 facts helper 通过写成完整 P2-01 完成。

生产接线后补验：tracker 已在删除、journal 重放、restore allsite、站点时区/会话/隐私变更与 privacy cleanup 同连接接 invalidateSiteFacts。`worker.ts` 的 rebuildSite 现在委托新磁盘事实入口；保留原 claim/fairness、失败 DLQ、保留期旧汇总策略，raw retention 删除后级联清理 facts。首轮真实 PG **51 PASS / 2 FAIL**，原始工具输出记录保存在 `/tmp/baize-031-first-failure.log`：坏时区从旧 JS generic error 变成 PG22023；孤立 heartbeat 小时的空桶未持久化使旧归档成熟度证据缺失。修复前置 Intl 时区校验与零 bucket-presence facts，保留原测试预期；另将孤立 heartbeat oracle 放到独立小时。随后同命令九 suite **53/53 PASS**，09:32:38 UTC，16.42 秒。该结果包含已接线的新 production worker，不以旧 289+20 冻结快照替代。新增 CH adapter/032 尚未接到此 worker；本轮没有 CH canonical、浏览器或 Docker 新验收证据。

### 专属续租与独立权威读 fence

原 max1 短测试不能证明长 RR 的续租活性：同池 heartbeat 会排在自身占用的唯一源连接后面，超过 lease 后不能发布。现改为每个活跃 worker 至多一条专属 pg.Client，复用配置但不占 Pool 配额；仅做短 autocommit lease UPDATE，不持 site/partition 锁或长事务，最多一个 in-flight，服务端 lock_timeout 2 秒、statement_timeout 5 秒，finally 关闭。源 RR 与贡献磁盘处理全过程保持同一事件快照。连接故障/真实 lease 丢失仍拒绝发布；部署连接预算需计入每个活跃 worker 的额外一条连接。

实际补验：max1、初始 1 秒 lease、100ms renew，源 RR 运行真实 pg_sleep(2.2)，另一连接用 500ms statement_timeout 完成 generation 写入；1.3 秒时 lease 仍 live、captured generation1，最后发布1并留下current2 dirty。facts10 + planner6 **16/16 PASS**；最后补充服务端 timeout 后该长续租专项再执行 **1 PASS / 0 FAIL / 9 未选中**，原生 Vitest JSON `/tmp/baize-031-lease.json`，type/lint通过。此验证不等同百万吞吐测试。

031 同时保存 source_authority、canonical_epoch、canonical_deletion_epoch，读取前 captureEventReadState 包括零事件源；新发布事务对独立 authority/epoch/deletion_epoch 再核验，不能复用 prefer/mirror 水位。实际 PG 证明零事件 PG 源捕获后权威切换会被拒绝。CH 权威接收、切换、全路径读与裁剪仍由独立032阶段继续，不由这个 fence 宣称迁移完成。
