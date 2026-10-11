# 056 增量会话候选：在制证据

基线：`a86993d626bac551d5222d4006f8edaa0a41f29b`。本候选尚未完成整轮验收；`BAIZE_INCREMENTAL_SESSIONS=1` 才启用，默认保留原全量归约。仅 strict 模式可以选择 visitor delta，PG 继续作为全量对账。未知 generation、收入、identify、定义/时区/删除/恢复及不完整 owner 均走保守全量或拒绝，认证失败不得通过全量回退伪成功。

## 已执行

- 类型、lint 检查通过；新增相关专项最新 34 单元断言通过，小时引用专项另有 2 项单元通过。非全目录单元计数。
- 4 项真实 PG generation 证据专项通过；这不是 CH 正文认证的替代。
- strict 差分主用例通过：A/B 同小时未变 owner、迟到桥接、退役空 owner、与强制全量对账、收入/identify 回退、配置 epoch 与 receipt 重绑定、删除及 PG 正文裁剪。
- 边界初轮及第二轮均为 2 通过 / 2 失败；v3 为 3 通过 / 1 失败；v6 最终 4 通过 / 0 失败 / 0 skip。涵盖无页面组件、未变正文缺失、每日盐 DST/当地午夜、原始过期前缀。修正有据夹具之外，窄修合法设备分类缓存误拒，并为 delta 新小时追加缺失引用，保留旧小时引用与 missing 守卫。失败 JSON 原样保留。
- 3 项 CH ACK 后 PG 回滚/失 lease/删除 epoch 拒绝真实故障专项全部通过；1 项真实 PG 多 run 导出定义专项通过。独立签名恢复已执行两次失败（回退与 carry 夹具断言有误），v3 亦失败（PG 保留清理未产生 dirty 的夹具顺序错误），调整为在真实 strict 激活后执行保留清理。恢复仍待验，不宣称闭环。

## 同条件小基线

不可变 `a86993d`：300 事件，50 事件/请求、每秒计划一请求、独立 10 秒查询、队列 8、并发 2、120 秒 drain。实际 EXIT0，300 接收、0 未发送、最终积压 0，完整性断言通过。采集 P95 400.322ms，查询 P95 371.109ms，最终断言 1363.345ms。此为短样本基线，不证明 strict5000 或百万日事件 SLO。

首个启动因 `/usr/bin/time` 不存在 EXIT127，应用未执行；保留原日志，改为 Python monotonic + RUSAGE_CHILDREN 后才运行上述 v2。既有 strict5000 FAIL 及低速探索不变；没有降低预算、延长 drain 或改变验收阈值。

不可变候选 `a49aec17034d8c6344528da5d702630839592578` 同条件 300 事件 EXIT0，300 接收、0 未发送、最终积压 0。墙钟 17.025s（基线 21.165s），进程峰值 499176KiB（基线 624092KiB），采集 P95 274.436ms、查询 P95 355.557ms、最终断言 1405.234ms。044 旧事实读取仍为 9,364,444 字节，请求由 8 增至 11；发布 INSERT/独立读回各由 144 降至 88 请求。只证明该短样本减少派生发布，不能证明持续容量；跨 run 认证请求增加仍是风险。

该候选随后真实复现归档正确性 P1：同 visitor 已关闭旧会话与当前会话隔离，当前追加增量使独立保存的旧区间 PV 从 2 降至 0。原 FAIL 已入证据目录；因此上述性能结果不能作为候选可交付验收。修复后真实 PG/CH 专项 1 PASS / 0 FAIL / 0 SKIP，明确观察 `fullPlans=1`、`deltaPlans=0`、`archived_dirty_owner`，旧区间 PV2/session2/vitals2、owner run/generation 和正文哈希不变，当前 PV2、dirty/outbox 排空。没有用受损后强制全量当 oracle。056 正向访客元数据删除专项已通过，范围见下。独立恢复 v4 另实测 `CACHE_SOURCE_FENCE` 失败，原证据保留；TTL live receipt 重绑定修复尚待真实回归，不宣称恢复通过。

## 计数口径

`reusedSessions` 只数已认证 session summary 与当前有效 owner 的精确匹配；`reusedOwnerHeads` 包含空退役 owner，因此另列。`producedEffectRows` 为 staging 派生行，`hydratedEffectRows` 为认证后可见旧 TEMP 行，均不是唯一事件或 HMAC 实际认证总量。阶段时间可嵌套/累计，不能相加作为墙钟比例。每轮 fallback 原因固定枚举；关闭功能不计为真正 fallback。

本批未运行任何 CNB/同步/GitHub Actions。原始证据见 [目录](performance/incremental-056/)。

## 后续删除与保留专项（非整轮验收）

056 正向访客范围按同一 site/client 在访客删除、身份段删除、journal 重放中物理清理，不依赖 raw 或 `changed=true`；只清 planner 元数据，不清幸存 B 的 run/head/正文。真实 strict PG/CH 专项修正 cursor 事务夹具后 1 PASS / 0 SKIP：A/B 同 delta run，删 A 保 B 的 owner 与认证 PV2，两次恢复残留范围再重放均清 A，新签名 namespace 备份无 A 正向范围、含 B。首轮尚未触删除的夹具 FAIL 保留。新专项未单独覆盖同一派生 visitor 的 A/B 身份段；此边界不冒称已新测。

raw 保留物理 ACK 后，仅给同 epoch 的 complete cache owner 推进 live deletion fence，旧签名来源、hash、attempt 不改，stale/staging/其他站点/旧 aggregation 不被收养。真实 PG 1 PASS；相关删除与保留单元 5 PASS，类型和定向 lint EXIT0。独立签名恢复正在重验，仍不能把这些专项当作整轮通过。

独立恢复继续发现真实混合闭包缺陷：旧 run PG 正文已裁剪为 0 行但有 130 条 CH receipts，旧迁移按 PG 0 行重新完成校验而拒绝。修复仅对 complete 且 PG kind 为 0 的旧正文完整认证读取 sealed CH，保留 receipt、attempt 和 source epoch；非空 PG 仍走原精确迁移与七 kind 对账。真实 PG/CH 专项 3 PASS / 0 SKIP（首轮一条错误码预期失败保留），包括混合旧130行与新PG run、非空PG篡改拒绝、缺失旧CH正文拒绝。恢复 v9 已越过事实闭包，但缓存范围 backing 仍失败，正在诊断；未完成独立恢复。

当前完整单元目录 294 PASS / 0 FAIL / 0 SKIP，完整 lint、构建通过，记录绑定测试时源码哈希；发生在上述混合事实闭包修复之前，不作为新修复全轮绿灯。新修复的定向类型和 lint 通过，整轮应用/浏览器/镜像仍未执行。

恢复 v10 安全计数诊断确认：缓存签名窗口从前日 00:00 / 09:00 开始，当前 full snapshot 的 `retained_from` 为前日约 10:02，clean head/authority 匹配且无 pending rebuild。旧完整 run 和 receipts 存在，仍不足以证明整个历史窗口与空桶完整。没有删除 unavailable 标记或放宽普通保留边界。057 历史覆盖 witness 正在实现，将由真实 full producer 在原范围仍可认证时捕获，明确绑定 accepted HWM、selected owner 闭包和授权删除/恢复转换；未知历史不能事后猜成完整。当前独立恢复和最终性能仍未闭环。


## 057 阶段化定位（在制，不是最终整轮）

独立恢复 v11/v12 均真实 EXIT1，历史失败未删除。v12 的安全阶段记录证明：初始 FULL、raw prune、strict activation、retention PATCH、physical TTL 与 TTL worker 保持原 365 天 coverage；收入 FULL 首次缩到 1 天。签名导出/目标导入/latest journal 保持这个已缩范围，restore-runtime 的第二次 epoch reset 又缩短约 8 秒。不是签名 guard 假失败，也未放宽范围 guard。

收入转换已独立最小复现：首次 1 FAIL；窄修后的专项 1 PASS，另 1 项因 `-t` 过滤未运行。只允许当前保留期内、durable CH 发布完成的可信收入批次精确推进一代，保持旧覆盖范围/accepted HWM/观察时间且闭包不变；未聚合状态仍不能作为 clean 查询。旧历史 PV/session/vitals 与 owner 哈希断言保留。普通批次无新增闭包扫描，identify/未知代际变化不会取得续接许可。恢复 reset 的专用同连接转换正在独立测试，未重跑整条恢复追绿。

阶段计时 runtime Set 漏项已由 1 FAIL 实际复现并修复，定向 metrics 11 PASS；新增 stage 后有限槽位为 7 adapter × 4 operation × 17 stage = 476，保留真实收集、脱敏和非重复计时语义断言。此前全单元目录 308 PASS / 3 FAIL / 0 SKIP，三项为旧槽位断言；该失败报告保留，尚不称最终全目录已通过。当前类型检查、lint 通过。


恢复 reset 最小真实 PG/CH 回归第二轮 1 PASS、另 2 项由 `-t` 过滤未运行。首轮失败是测试错误要求 live head generation 不变，而授权 restore 的既有 `LEAST(head.generation, processed_generation)` 将其重绑定为 0；修订后精确断言 0，并保留 session/run、原 receipt/attempt/source epoch/checksum/body hash、历史 PV/session/vitals 与 dirty 查询拒绝断言。此专项只验证同目标受控 reset，不冒称独立签名目标恢复。完整单元目录复验为 313 PASS / 0 FAIL / 0 SKIP，绑定测试时源码哈希；类型和 lint EXIT0。独立全链 v13 正在串行复验，当前不能称其通过。


v13 全链仍 EXIT1：源/目标及 runtime 均保持原 365 天范围，旧缓存范围拒绝已消失；签名 sidecar 恢复、缓存迁移、strict CLI、B 身份查询通过。失败是夹具要求恢复 FULL 后仍至少两个 owner run；当前允许 FULL 合法合并，但修订必须在源备份及目标重建前断言多 run 导入完整，并以源删 A 后保存的真实 totals/pages/vitals/funnels 与目标差分及 archive/carry/head/receipt/hash 断言验收。v14 尚未运行。057 构建 EXIT0（现有 chunk 体积提示保留），本次保存是功能在制检查点，不是完整应用/负载验收。


不可变提交 `a111d639e57601b62669ab3a1ab838c2bb5ebc89` 的 v14 独立恢复为 1 FAIL / 0 SKIP（约 27.68 秒）。原覆盖范围已保持，随后目标缓存闭包因 `page_centroid/legacy_centroid` 的 `privacy_invalidated` 且 `rebuildable_v2=false` 返回 `CACHE_BASELINE_UNAVAILABLE`；新增真实 LCP900 暴露该确定缺口。源删 A 后的真实查询仍有 sampleCount=1、p75/p90=900。目标完整差分断言尚未到达，不冒称全链通过。正在对 centroid 转换做独立真实样本重建专项，不删除失效标记或降 LCP/漏斗断言，不无变更重跑整链。


`a111d63` 不可变快照相关回归：9 个文件、21 项真实 PG/CH 测试全部 PASS、0 SKIP（strict 主闭环、迟到/跨日/无页组件、发布失败 fencing、057 覆盖转换、归档 owner、generation、混合 pruned facts、TTL cache fence、056 删除元数据）。这是该提交的相关专项，不包含独立恢复，也不作为后续 centroid 在制改动或最终整轮验收的证据。


## 保留期扩大正确性修复（独立于 centroid）

隔离 `a111d63` 生产源码与新增回归夹具，实际复现 `365→1→365`：3 天前独立旧区间 PV2 / session2 在 FULL 后归零。操作前已保存旧 totals/vitals/head/hash 对照，不在受损库后 force full 当 oracle。首次直接工作区测试被并行 centroid 在制 bootstrap 阻断，未到扩窗，不算该 P1 复现；之后隔离生产文件的真实失败才是复现证据。

修复仅在 strict CH 原完整正文认证之后、任何 prefix/build/publication 之前限制窗口向过去移动。有已发布历史但无可认证边界也明确拒绝，不依赖 057 witness 是否存在；完全无历史才可首次 bootstrap。拒绝 `FACT_RETAINED_WINDOW_EXPANSION_UNPROVEN` 时旧 owner/ref/run/receipt/body hash 不修改，新事件仍 queued，dirty 状态不能假完整查询。保守拒绝不等于证明原始正文永久无法恢复；需真正认证的历史正文/backfill 才能支持扩大，不能仅改变保留天数。

隔离仅该 guard 的真实 PG/CH 专项 2 PASS，另 3 项由 `-t` 过滤；含正常 witness 与 legacy 无 witness，再次 FULL 都不能抹历史或创建假证明。数据证据与源文件补丁 hash 一同保存；并行 centroid 在制变更不计入这两项通过范围。guard 定向 11 单元、类型和 lint EXIT0，最终完整目录仍待冻结后执行。


## Centroid 删除后重建专项（整链仍待验）

真实 PG/CH 定向测试第三次 1 PASS / 0 SKIP，测试约 4.616 秒：A900 删除后，认证幸存 B100 样本，裁剪 PG sample/digest 后重建 sampleCount=1、p75/p90=100。缺 witness、跨站、篡改正文与缺失 B 正文均拒绝，max1 连接池路径保持。前两次 FAIL（清理掩盖原 SQL 错误、day 别名语法错误）原始记录保留；定点修复使用明确引用别名及局部 savepoint 保留首个错误，不放宽完整性检查。5 项单元通过，类型与定向 lint EXIT0。全部删除的零幸存样本仅单元覆盖；旧 V1 无可认证样本的迁移未专项，不能凭失效空缓存补造证明。独立恢复 v15 将绑定当前源码重验，不把该单项当整链通过。


v15 独立签名恢复实际 1 FAIL / 0 SKIP，约 29.96 秒，已绑定 6434ed6 的相关生产与夹具 blob。已越过 centroid 故障，缓存迁移、strict 切换、B 身份页面/会话、A 删除与收入回执通过；首次失败位于最终历史查询的 captured/live 来源向量复核，抛 aggregate_source_changed。尚未执行最终数值差分及源不变断言，因此整链仍未通过。具体变化字段暂无证据，先增加只在夹具的安全阶段诊断，不改生产拒绝 guard，不以重试掩盖。


v16 新增精确状态读取诊断后仍实际 1 FAIL / 0 SKIP，约 30.24 秒。仅首次 stateSql 被执行，尚未到 COMMIT 后 live 查询；因此纠正 v15 初步归因，未证实 captured/live 向量发生变化。实际异常来源为 FACT_STORE_SOURCE_FENCE 的公开错误映射。当前 authority 为 clickhouse，mirror 字段均 null；未改生产 fence，正在用精确 producer/head 与旧 run 状态定位首次不匹配。v15 的失败本身保持，原始阶段证据不改写。


v17 精确 head 诊断仍实际 1 FAIL / 0 SKIP，但定位到首次不一致：选中最新 generation12（等于 processed12），并非错选旧高代 run；epoch_matches=true、authority_matches=false、dirty=true、deletion_advanced=true。恢复后的 createApp 即使 background:false 仍正常重放删除 journal，推进删除 epoch，夹具随后未运行 worker 就查询旧聚合。生产 guard 正确拒绝。下一修订按真实启动契约等待真实 worker 发布，并显式检查 dirty/错误/队列清净，不改 selector、不放宽删除或签名检查。


v18 独立恢复修订真实 1 PASS / 0 FAIL / 0 SKIP，EXIT0，总 runner 31.66 秒（测试约 30 秒，夹具既有显式 180 秒上限）。生产源码与 6434ed6 一致，夹具增加真实启动 journal 后有界 worker 发布检查。最新 journal 再删 A 后 generation12→13，原 365 天 witness 保持；同区间源/目标 totals、pages、LCP900 sampleCount1、funnels[1,1] 精确差分通过。多 run 导入、carry、旧 receipt/hash 认证、A 无贡献、B 身份、收入别名及源原始签名/正文不变全部通过。Centroid 可重建 privacy 标记可能仍存在，reader 用真实已认证 V2 样本；不宣称所有标记清空。仅测试自身资源已清理，旧 FAIL 全保留。此为独立恢复全链专项，不是最新源码完整应用/浏览器/镜像或 5000 性能验收。


不可变 `b78d7cba08587ff1c494fc9ffc39ff98c11a729f` 完整单元目录 321 PASS / 0 FAIL / 0 SKIP，tracked blob 验证通过。此提交已含保留期扩大 guard、认证 centroid 重建与启动 journal 后发布夹具修订。10 文件真实 PG/CH 相关目录正在串行执行，尚未宣布结果；最终全目录/浏览器/镜像与原 5000 性能仍待执行。


父补充时序实际复现：隔离 b78d7cb 生产源码、仅替换新增夹具，TTL 已提交但缩窗 worker 未跑时立即扩大，两例（有 witness / legacy 无 witness）均 0 PASS / 2 FAIL，另 5 项由 -t 过滤。原 guard 允许 FULL 返回而非拒绝，说明 producer.retained_from 并不代表已物理执行的退役范围。058 正在独立记录真实 physical ACK 后的单调 retirement frontier，并在发布前检查；此处尚未称其修复已通过，ACK 后 PG rollback 的跨库恢复边界也不冒称原子。


058 修复后隔离专项 2 PASS / 0 FAIL，另 5 项由 -t 过滤：physical TTL 已提交、缩窗 worker 未执行就扩大，有/无 witness 均拒绝，旧 owner/ref/run/receipt/hash/已认证正文不变。生产基线 b78d7cb 加 058 guard/TTL/DDL 精确补丁 hash 保存，其他 backup/restore 在制文件不纳本次通过范围。13 单元与类型/lint 通过。058 仅记真实成功 ACK 后同事务的单调 frontier；不拿 FULL.from 伪称物理退役，不猜 pre058 旧历史。跨库 ACK 后 PG rollback 的缺记录恢复边界尚未覆盖，另见 RAW_RETIREMENT_058_BOUNDARY。签名备份/独立恢复与完整新源码验收待收齐。


不可变 `15e1cf0a60901d3f45e6bf1a3174e53985b2b808` 完整单元 323 PASS / 0 SKIP；同提交全部 coverage-witness 7 用例与独立签名恢复 1 用例合计 8 PASS / 0 SKIP，EXIT0。包括两种 deferred shrink-worker 时序、legacy 无 witness、frontier 签名备份/隔离 target 重绑定及完整源/目标差分。不是完整集成目录、浏览器、最终镜像或性能5000通过。


ACK 后 PG rollback 真实 reader 专项 2 PASS / 0 SKIP：原故障注入成功物理删 CH A、PG 旧 manifest 仍保留；新 snapshot 首次 streamCommitted.next() 拒绝 CANONICAL_UNAVAILABLE、未 yield 数据，随后同 cutoff 重试保留 B 和证明。此验证 fail-closed 普通 raw reader 与重试，不扩称 rollback 后扩大 FULL、任意 legacy unknown 历史均已证明安全。生产固定 15e1cf0，仅 test 断言 patch 单独 hash 绑定。
