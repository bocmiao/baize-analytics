# 056 增量会话归约设计与独立planner（生产闭环待验证）

> 状态入口（2026-10-11，本轮 057 在制）：056 为显式 opt-in，默认仍 full；已修复 archived dirty owner 的保守回退及正向访客元数据删除。下方早期「当前验收」是 a49 候选阶段记录，实际后续证据见 [PERFORMANCE_INCREMENTAL_056_VALIDATION.md](PERFORMANCE_INCREMENTAL_056_VALIDATION.md)。057 正在完成受签名约束的历史覆盖、收入与恢复 reset 连续性；新 5000 尚未执行，旧失败保留。


## 决策与最小边界

首片只支持**可信events-only变更下，dirty visitor完整闭包归约与其他visitor原贡献复用**。不先实现单session窗口剪枝。每个dirty visitor读取全部retained raw及有效旧sealed headers、expired prefix/carry，按原事件时间与event ID排序，使用原归约算法重算完整会话闭包。因此迟到事件连接两个会话时不遗漏邻会话；超长visitor仍走SQL TEMP/cursor，不建立全visitor JS数组。

复用不是跳过认证：原selected closure的044/047/043正文、hash/count/HMAC、source/delete/epoch检查照旧完整执行。第一片只减少重复归约及新派生正文发布，不能承诺减少旧读取，也不能预称strict5000通过。profile的300输入产生14,200派生行跨5次全范围重建，证明重复发布存在；成员集合INSERT局部约79%降低却未证明总worker改善，故不再微调该循环。

## 056 所需持久元数据

056迁移、独立planner与受控生产接线已写入候选，下面区分实际接口与待验证契约。

- `aggregation_state.non_event_generation`记录非事件变更证据。未知generation或epoch更新由trigger保守推进；只有同site、同epoch的事务内采集标记可保持旧证据，采集排除revenue和identify，并清除标记。不可仅以queued outbox非空推断events-only。
- `analytics_incremental_run_plans`记录 `full` / `visitor_delta`、parent run/generation、本次source generation、non-event generation与配置hash；原fact run继续保存source/epoch/HWM。父run是发布前fence证据，不是永久递归正文依赖，也不能把delta误称全站snapshot。
- dirty visitor集合在同client TEMP捕获，并持久到`analytics_incremental_run_visitors`。实际选择继续使用原session contribution heads：先把dirty visitor所有旧heads指向新run作为empty owners，再安装本次完整归约的现存session owners；未变化visitor heads保持原样。没有新增visitor supersession predicate。empty owners防止消失或合并的旧session经hour fallback复活。

## 精确集成位置

1. `worker-facts.ts`在beginPartitionSnapshot/sourceState与HWM捕获后，**先完成原prepare*完整认证hydration，再capture plan**；随后`afterHydration()`判定闭包资格。同RR读取证据：旧head正常published且所有source fences匹配；generation差由已提交events-only证据覆盖；non-event证据不变；无pending rebuild request、配置/定义指纹变化或不可信legacy前缀。任何不确定走原full rebuild，不把异常认证失败转为fallback成功。
2. 原044/047/043认证hydrate全部保留。dirty visitor由同RR内queued outbox≤HWM捕获到TEMP。原header/raw读取仍完整认证，逐批进行TEMP visitor membership筛选后进入原归约TEMP；header/raw同event ID按原优先级去重，过期源缺失保持原显式拒绝。没有按visitor重复raw网络读，batch/yield限制保持原值。
3. `buildSessionFacts`接收内部plan source，仅归约dirty visitor；原session timeout、daily边界、heartbeat/order keys、goal/funnel、vitals算法不变。未变化贡献继续引用原run及sealed attempt，不复制receipt、重签body或改原source provenance。
4. `publishSessionFacts`增加delta分支：fresh lease/site/epoch/source fence后，同事务替换affected visitor的旧owner闭包、插入新owners、更新全站head与processed HWM。不能执行当前全retained sessions/hour/day DELETE及仅新run INSERT。全站hour/day控制行按有效贡献并集更新affected buckets；exact UV/funnel使用SQL distinct visitor union，不能加减桶UV。
5. `sessionContributionPredicate`及其vitals关联维持原规则：session owner优先，其后仅无owner的合法legacy hour fallback。dirty visitor旧session全部获得新empty owner或重建owner，不靠新增visitor谓词过滤。selected run closure保留未变化owners所需原sealed runs。缺owner或正文仍不可用，不能空集合coverage1。
6. 当前读取numerics/members/session/definitions中仅查询latest run的路径必须改为有效贡献投影。先验证这些消费者完整改造再启用delta，否则保持full模式。需要核对AI、retention、export、cache、backup消费者，由root分配文件owner；本agent不跨边界直接改。

## Expired carry、删除与并发

第一版delta保守拒绝dirty visitor任何有效旧owner的effect.event_ts早于本次retainedFrom，fallbackReason为`archived_dirty_owner`。最后一个carry checkpoint不能重产该visitor更早已闭合的全部归档session，因此不能先将所有历史heads指向empty owner再仅归约最后prefix。该检查在原完整认证hydration后进行，认证异常不转换成成功fallback；full发布路径保持原有归档保留规则。

dirty visitor的不可变expired贡献来自认证旧owner，不凭raw保留范围推测完整；可变session summary/entry/exit/goal/funnel必须由可信prefix+tail重新归约。旧anchor或keys不足时完整fallback也不能伪造源：继续明确不可用。

capture后新采集可推进generation，最终发布只完成capture HWM，并保留后续queued事件；parent head/revision/authority/delete fences必须fresh验证。删除与restore仍先journal/fsync、物理ACK，再重base合规survivors；delta lineage不能让旧A owner经parent/hour复活。任何非事件revision变化使本次plan失效，按原错误与重试路径退出。

## 暂定独立模块契约

`captureIncrementalSessionPlan(client, identity)`已实现，返回内部plan：`mode:'full'|'visitor_delta'`、parentRunId、visitorTable、fallbackReason；不返回site-sized visitor/session数组。`afterHydration()`检查退休边界变化、rebuild requests以及effect/header组件完整owner覆盖；`persist(run)`写计划证据；`assertPublicationFence(client)`验证原identity和parent head仍适用；`close()`清理TEMP。

`enabled`默认false，root仅通过`BAIZE_INCREMENTAL_SESSIONS=1`显式启用；关闭时仍persist full baseline。parent FK采用ON DELETE SET NULL，parent_generation保留标量证据，避免无贡献引用的父run阻塞GC。未知generation/epoch更新的trigger以GREATEST(old non-event,old generation+1,new generation)记录，防回退或跳跃抹去未知变更。完整consumer/publication闭环验证前不启用生产默认。

## 当前验收状态

本批21单元与4项真实PG generation evidence专项已PASS，typecheck通过。4项PG专项证明标记连续性、未知中间更新、generation跳跃/回退、epoch/定义变更；其SQL模拟baseline不是CH认证或delta发布证明。主strict differential新receipt修复版正在运行，之前暴露的失败与修复记录保留，尚不能写完整闭环通过。

root不可变基线300诊断实际EXIT0、300完整接收并排空；增量候选尚无性能判定，不能将该基线结果当候选收益。下列故障、消费者和负载门槛仍按实际后续结果逐项判断，strict5000历史FAIL保持不变。

## 验证门槛

- 小样本原full reducer oracle对账：全部metrics、session IDs/entry/exit、currency/order去重、UV/funnel distinct、vitals原样本及centroid权重，不只PV。
- 同visitor late/乱序/多tab，桥接两旧session；跨本地日daily、跨cutoff、expired raw仍由carry/header闭包准确重算；其他visitor B原贡献不重复发布但仍认证。
- source body missing/hash/HMAC坏即拒；CH成功PG失败delta orphan不可见；capture后intake及non-event revision变化；原max1/lease/锁与cleanup。
- partial A身份区间删除B保留、changed=false replay、配置/定义变化full fallback、独立签名restore与owner闭包完整性。不同run共享hour不能误删或双计。
- 正确性通过后才由root串行一次同原参数固定负载，保留FAIL并报告派生输出量、worker/drain及查询；不改120秒/预算/认证/限额，不承诺收益。


## 057 历史覆盖与受控转换（在制）

`analytics_fact_coverage_witnesses` 不从最早 run 或 `retained_from` 猜历史完整性。只有实际完整认证的 FULL producer 可以首次建立证明，记录 coverage/from、已接受快照水位、观察时间、配置指纹、当前选定 owner/空 owner/receipt 闭包摘要及 HMAC。后续有效证明与同连接令牌控制转换，未知 generation、配置或 namespace 改变仍失效；legacy 已过期明细不能事后获得证明。

- TTL、精确删除与最新 journal 重放：证明先认证，原物理 ACK 顺序保持，在当前同 site 事务内更新幸存闭包和 live fence；旧原始 sealed body/attempt 不改。
- 可信收入采集：仅当前保留窗口内、无 identify/replay/heatmap 的受限 fresh 输入，真实 CH 发布完成后可续接一次精确 non-event generation。未聚合期间不推进原 accepted HWM 或观察时间，普通读取因 dirty 状态拒绝；下一真实 FULL 发布才推进快照。普通事件批次不增加闭包扫描。
- 独立签名恢复：原 witness/state/闭包先验证，全部独立目标 sidecar ACK 后在同连接转换 live 元数据，再应用最新独立删除日志；不能用空目标或旧快照代替授权。
- restore-runtime 的受控重建 reset：专用不可伪造令牌要求实际已验证的签包/目标/日志前提，并限制为一次 epoch 变化、generation+1、processed=0；同 canonical/delete/config 边界不变。全部生产 rebase 完成后保存原范围/HWM，普通 dirty 查询仍拒绝，后续真实 FULL 完成后才 clean。

覆盖证明只补充原缓存签名的接受快照范围。普通原始明细保留期守卫不放宽；缓存读取仍认证整个 selected source body 闭包，缺 CH 正文、坏 HMAC 或未知范围明确拒绝。新增 `coverage_witness_wall` 为累计内部阶段，包含在 worker wall 内，不能二者相加制造时间收益。最终独立恢复和固定负载以验证文档实际结果为准。
