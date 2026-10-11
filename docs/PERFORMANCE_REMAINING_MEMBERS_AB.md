# Strict worker PG 成员写入：有界集合化与 A/B 诊断

当前产品候选源 `5c3be16aaa36db2a2cd751ac2257422deec014e5`；A 为仅加观测、不改SQL的 `073f70d498ca7de67a474bc00b810cec72275b3e`。本批只有一项SQL优化：remaining事实最终成员receipt INSERT集合化。没有修改UI、CH发布协议、迁移、依赖、原验收阈值或预算。

## 结论

局部成员INSERT成本稳定降低约79%，保持该窄改动。**整体worker收益未证实，strict高负载仍未闭环**。B1总墙钟仍处于A两轮波动范围，B2多做一轮重建、派生工作量更大。停止本轮微调，不据局部收益追加5000重跑追绿；原5000FAIL不变，候选源原参数5000未运行。

四次300事件诊断全部EXIT0：接收300，未发/延迟/失败/查询失败均0，排空、六项最终完整性断言、sourceUnchanged及四项清理通过。最终HTTP PV300/coverage1，canonical301包含bootstrap1；九类PG正文0，outbox301全done。小样本通过不证明持续容量、日均百万或生产SLO。

## 分段与可比较性

每轮独立全新PG schema/CH namespace，使用相同Node依赖和现有本地PG/CH/Redis，无其他重任务并行。固定50事件/秒、每请求50事件、独立10秒查询、队列8/并发2、排空120秒、后台worker，均6批；没有手动追赶。A1/A2/B1/B2顺序串行，不是随机化统计实验。

`worker_facts_wall` 包括所有PG/CH/锁/认证/校验；`session_build_wall` 包括beforeSource、prefix和source读取及归约，不是纯CPU。ownership包含原逐项owner/carry-provenance循环；members仅包含PG batch INSERT和最终成员INSERT，不含CH；completion仅普通completeKind，不含历史迁移的完整核验。下表均累计跨调用的包含计时，不能相加成CPU时间。

| 轮 | worker调用 | worker秒 | build秒 | owner毫秒 | members毫秒 | 成员行/批 | members毫秒/行 | completion毫秒 | 最终HTTP秒 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A1 | 5 | 9.937 | 2.583 | 280.273 | 217.304 | 1394 / 22 | 0.155885 | 20.070 | 1.305 |
| A2 | 5 | 9.103 | 2.328 | 277.184 | 218.024 | 1394 / 22 | 0.156402 | 19.930 | 1.214 |
| B1 | 5 | 9.636 | 2.361 | 489.538 | 46.769 | 1394 / 22 | 0.033550 | 20.707 | 1.195 |
| B2 | 6 | 12.445 | 2.983 | 354.255 | 58.572 | 1798 / 29 | 0.032576 | 25.645 | 1.269 |

A1/A2/B1同为14,200条facts派生发布，B2为18,453条；并非输入事件增加。B2的worker6调用/25次ordinary complete，对比其余5调用/20次complete。固定输入与调度不保证后台claim边界相同，不能删除B2或按同工作量宣称总耗时加速。最终HTTP落在1.195–1.305秒，不能由两样本均值外推更大负载。

A两个members每行0.155885/0.156402毫秒，B两个0.033550/0.032576毫秒。固定batch/member工作量对应A1/A2的1416条成员及batch INSERT派发；B1为44条，B2为58条（分别22/29批）。这是依据成功路径、实际行/批数计算，不是独立SQL采样器。实际请求完成前的JS映射/JSON编码仍包含在stage内，没有挪到计时外。

CH三用途仍为同一transport事件的互斥分类，四份原始结果分别逐组对账一致；invalidObservations0。samples缓冲截断不截断总计，json_serialize未instrumented，其他adapter请求数/字节仍有未测null。未把未知成本归咎于某条SQL。

## 改动与正确性

`remaining-fact-members.ts` 接收最多100条原14列receipt元数据，以typed jsonb_to_recordset单次INSERT；不使用ON CONFLICT，保留PK、复合FK、区间CHECK及nullable列，严格核rowCount等于输入数。单独batch INSERT仍在前，同一client/同一事务/原header锁；CH完整EOF写入、独立正文读回/hash/checksum及fresh live fence全部在此前完成。没有owner查询集合化，避免改动session优先及checkpoint/header fallback语义。

247单元PASS/0FAIL/0SKIP；观测专项24单元及原3文件8真实PG/CH项通过。候选首次4文件12真实项为11PASS/1FAIL/0SKIP：新夹具期望回滚后缺run的读取为[]，实际产品拒绝REMAINING_FACT_SOURCE_FENCE。只修夹具预期，复验新增4项全PASS；原8项产品代码相同树已PASS，**不把两轮写成一次12全绿**。新4项覆盖100行/全部nullable列精确保存、duplicate PK、缺FK与事务回滚，以及真实CH写入成功后PG触发失败：PG receipt/member0、CH孤儿真实存在、读取拒绝、重试新attempt唯一可读、按确切visitor物理清理。初次失败留下的1条测试孤儿也已按确切site/visitor/run删除并检查0，没有全局清理。

完整typecheck与lint EXIT0，diff check通过；原首轮失败JSON、修正复验和清理证据均归档。此候选未运行整套真实集成、浏览器、新Docker镜像/独立恢复，不能引用之前源码的全轮作为新HEAD全轮验收。没有任何GitHub Actions/CNB执行、同步或触发。

## 当前已测边界与下一方向

新候选只证明本机有限300事件burst完整排空，不能称持续50events/s可用。此前5c02abf原固定50events/s：1000PASS最终HTTP3.881秒；5000FAIL，5000接收/36延迟，120秒未排空，lastBacklog2600，最终完整断言未完成。保留 `PERFORMANCE_055_FIXED.md` 原结果。

较低到达率探索是旧源87e1f64、10events/s/30秒独立查询，并非本候选验收：PG有限1000/5000均PASS，5000最终HTTP2.325秒、采样最大队列年龄40.496秒；strict有限1000PASS最终HTTP4.818秒/采样最大队列年龄32.330秒，strict5000FAIL、15延迟/lastBacklog500/120秒未排空。日均百万、1C2G和真实生产SLO仍无证明。不能笼统把接收202等同于统计完整可用。

源码确认每次dirty claim重建保留范围，再产生新派生发布；300输入的14,200/18,453派生行说明重复工作规模，但尚未单独证明它是所有总体耗时的主要原因。PG归属/普通完成循环已量化，不能再靠调大CH批次或减少校验掩盖剩余成本。

如果继续优化，较大的方向是可信的“受影响会话闭包归约＋未变化贡献引用”，不是改一次SQL：需要界定迟到事件可能合并/拆分的会话及相邻边界、跨日/cutoff/carry、订单去重与精确UV/漏斗贡献；引用保留原sealed body/run/provenance，不能仅改run_id或复制receipt使旧HMAC正文伪装新归属。新发布选择/贡献supersession必须与高水位、删除epoch、tombstone和恢复严格一致，无法证明闭包时完整重建。必须独立设计并验证迟到/跨日/定义变更、A删B留、缺正文拒绝、CH成功PG失败、fence失效和恢复，禁止直接套read偏好或跳过旧范围。此方案尚未实现、尚无性能证明。本轮到此停止无效调参。

原始证据：`docs/test-evidence/main-073f70d-pg-loop-*`、`main-5c3be16-pg-loop-*` 与 `main-5c3be16-remaining-bulk-*`；汇总 `main-5c3be16-pg-loop-ab-summary.json` 保留源码SHA、实际工作量、清理、所有断言及raw SHA256。UI保持冻结，等待用户确认实际v3参考稿后按图实施。
