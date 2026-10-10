# 有界读取与完整查询窗口

基准提交 ce6ebcc0a2a54f2881418b21781b6aa31543605c，不可变 Git archive，全部 Git blob 前后摘要一致。独立调度单站 20 批×50事件：1000 accepted、零失败；后台自行聚合，最终 HTTP PV1000/coverage1，认证正文 PV1001（含初始化1）/UV21，九类 PG 正文均零，outbox1001全部完成。自有 schema、CH namespace、临时目录及应用已清理。

采集阶段仅2查询样本，排空阶段4样本，后者 P95 7726.857ms；最终完整 HTTP 查询8825.490ms。最大积压650，最终零；排空49.151秒。Node 应用与测试器共享进程峰值642490368字节，不含数据库。完整性通过不能证明实时 SLO、1C2G 或性能达标。原先仅采集窗口结果保留，不替换口径。

本批改变044派生事实正文读取：同类型最多并行2次 CH 请求，仍按原游标顺序逐批最多100行输出；每请求原16MiB限制、正文哈希、HMAC、归属和epoch校验保持。总在途正文预算最多32MiB。失败必须等待另一请求结束再抛出，不遗留后台读，不额外借PG连接。

真实 PG/CH受影响10项与单元3项全部通过（13/13），类型与相关lint通过。包括120正文有序对账、确证并发上限2、网络失败后另一请求结束、max1连接池无等待，以及既有缺正文/篡改/删除/epoch门槛。性能对比尚未运行，本批不能宣称提速。

证据：docs/test-evidence/main-ce6ebcc-independent-strict-1000.json、prefetch2-real-pg-ch.json。回放焦点与workspace导航的ce6ebcc专项2真实浏览器通过；不代表该SHA全29浏览器已复验。全部托管CI保持不触发。

## 同口径优化后实测

b0be327d233f17163d01a2841669cdac033f95fa 不可变归档实测EXIT0，完整Git blob前后相同，全部独立资源清理。20批/1000事件零失败，最终六类完整性断言全部通过。采集2查询、排空5查询；排空P95 6437.624ms，最终HTTP7009.640ms，排空48.232秒。共享Node峰664985600字节（不含存储）。相比ce基准7.73秒/8.83秒下降，但仅一次共享宿主试验、样本不同，不能宣称因果收益或SLO达标，查询与聚合仍慢。证据 main-b0be327-independent-strict-1000.json；原基准保留。


## 0c3ca6a 固定适配器独立1000（实际）

根代理 immutable runner actual passed；[原JSON](../../test-evidence/main-0c3ca6a-independent-strict-1000.json)、[详细边界](../../test-evidence/main-0c3ca6a-independent-summary.md)。20批全部202/1000接受，严格六项断言与namespace清理、sourceunchanged通过。drain查询4点P95约4.65s/finalHTTP7.63s，maxbacklog750；HTTP facts893次13.80s、worker facts1340次13.39s为目前主要观测成本，非性能改善结论。5000仍待完成，不覆盖ce/b0或旧结果。


### 同源5000实际失败（EXIT1）

[原JSON](../../test-evidence/main-0c3ca6a-independent-strict-5000.json)、[完整解释](../../test-evidence/main-0c3ca6a-independent-summary.md)：94/100批202，4700接受/6未发送，32延迟，maxbacklog3500/末1950；drain deadline reached，1query超时、final断言尝试失败且executed空，不能称strict验收通过。HTTP facts5014次82.87s/worker facts6714次74.22s，下一需聚焦重复事实来源读取链；不改限额、不称性能改善。实际四项namespace清理/source961blobs unchanged通过，旧1000PASS/ce/b0均保留。


## 33e005a 同批 TEMP CTE 校验

不可变提交 `33e005abe4d571f1180d8055d08399bbfcbbbf5a` 的真实 PG/CH 两文件 2 项全部通过，EXIT0、无跳过。专属单元 2 项、相关 lint、全仓类型检查通过。原报告与命令见 [实际 JSON](../../test-evidence/main-33e005a-fact-cte.json)、[执行记录](../../test-evidence/main-33e005a-fact-cte-record.json)、[单元 JSON](../../test-evidence/main-33e005a-fact-cte-unit.json)。

仅将 044 source 每批最多100个已认证 envelope 的 identity 和 target 两次写入合为一个 MATERIALIZED CTE，JSON 只序列化一次。identity 保留 ON CONFLICT 去重；target 直接读取完整 envelope，不依赖去重后的 RETURNING，故同 event 的多条 effect 不丢失。真实205条同 event 不同 key、跨3批身份冲突与旧 PG contribution 精确对账；身份区间过滤、零 kind、缺正文、source/repair fence 和事务清理保持。101行单元拒绝并清理 TEMP。HTTP 正文 EOF、原请求限额、哈希/HMAC 和精确统计均未更改。

本片尚无同口径负载实测，不宣称性能收益或 SLO 达标；0c3ca6a 的5000失败及其他原始结果保持不变。


## 33e005a 实际1000 PASS（5000 pending）

[原JSON](../../test-evidence/main-33e005a-independent-strict-1000.json)、[解释](../../test-evidence/main-33e005a-independent-summary.md)。981blobs/sourcecleanup通过，六strict断言通过。HTTPfacts CH/auth/TEMP均1103，证明每批1PGcommand而旧2；不等于性能达标。finalHTTP7.143s vs旧7.625s仅共享主机两单轮，样本/时段有别不能因果或SLO结论。drainP956.297s；5000等待实际结束。


### 33e005a 5000 actual EXIT1

[原JSON](../../test-evidence/main-33e005a-independent-strict-5000.json)、[表格与边界](../../test-evidence/main-33e005a-independent-summary.md)。97批/4850接受、3未发送、38延迟；queryFailed2，drain deadline/末backlog1450，final断言executed空。HTTP facts5468CH/auth/TEMP，87.93/34.11/28.27s，site lock93.49s；worker facts7481CH/1581auth/TEMP。cleanup四true/source981blobs不变，仍负载失败，不声称SLO或因果改进。


## 5ee7afe 同类型两批单请求真实验收

不可变提交 `5ee7afea783918c242321a50e1aaf1dfb7c41f1f` 实际13项 PG/CH 全部通过，EXIT0、无跳过；5项单元、相关lint与类型检查通过。[原报告](../../test-evidence/main-5ee7afe-fact-pair.json)、[执行及摘要记录](../../test-evidence/main-5ee7afe-fact-pair-record.json)、[单元报告](../../test-evidence/main-5ee7afe-fact-pair-unit.json)已保存。

仅同 site/run/kind 的最多两个已提交 manifest 使用单请求，显式 attempt_id 分组与 `LIMIT 101 BY attempt_id` 保留每原批超限哨兵。真实120条两manifest验证只有1次HTTP，原排序/正文完全一致；默认writer生成接近32KiB的Unicode记录通过新reader认证。正文使用无损base64运输，解码前44036字符界限、规范base64重编码、fatal UTF8均验证；完整EOF、16MiB+1拒绝及cancel、原SHA/HMAC/形状/大小/主键/source/epoch/逐组数量与最多100行输出全部保持。singleton和mixed-kind仍走原运输。

有效producer及严格restore固定3字段source，normalized正文最多32768 UTF8 bytes，sealed增量最多259 bytes；202哨兵行base64正文最多8,895,272 bytes加固定小元数据，低于未提高的16MiB总限额。新增decoder计入authentication但不重复计rows；该阶段观察次数不等于HMAC调用次数。

首轮b65aefa为12通过1失败：新Unicode回滚留下本测试2个CH孤儿，导致旧exact1断言看到3。仅对新测试site+target run作物理DELETE、完整EOF及count ACK0清理后，旧孤儿exact1断言原样通过；首轮失败记录不覆盖。尚未做本片同口径负载，不能宣称延迟收益或性能达标。


## 054 manifest成员索引实际隔离实验

044及047原PK均 `(run_id,kind,row_key)`，原identity索引不以batch_id开头，实际读取却按batch_id过滤、row_key排序。独立随机schema、max1、真实完整DDL上的synthetic receipt实验，25k/50k每批100行，前后完整行/字节/SHA摘要及PK/FK约束一致，schema清理后catalog残留为0。实际计划由Seq Scan变为Bitmap Heap Scan加100行排序。04425k逐批循环566.70→209.10ms、04725k609.28→293.44ms；04450k2099.31→408.78ms、04750k2292.68→454.53ms。index build138–263ms，后ANALYZE67–94ms，均计入原报告而不藏在query成本之外。

054仅新增两个nonunique `(batch_id,row_key)` lookup索引，不修改PK/FK或production reader。报告 [实际计划及结果](../../test-evidence/054-baize-member-index-experiment-final.json)、[命令/来源与界限](../../test-evidence/054-member-index-record.json)；首次seed UUID参数推断42804的 [原失败日志](../../test-evidence/054-baize-member-index-experiment.log)保留，显式cast修复，ownschema cleanup完成。该证据仅PG metadata loop，不包含CH、EOF、正文认证或应用SLO，不能替代整应用性能验收。

044 fresh receipt typed单次INSERT已真实PG/CH三文件14/14通过，首次EXIT0，无失败或跳过；单元3项、相关lint和类型检查通过。[原实际JSON](../../test-evidence/044-fresh-member-bulk-real-first.json)、[命令/源摘要](../../test-evidence/044-fresh-member-bulk-record.json)已保存，未发布源码以文件SHA绑定，sourceCommit=null。每批最多100个fresh成员，fresh CH读回/原SHA和checksum/fence后在原header lock/事务内单次jsonb_to_recordset INSERT，无ON CONFLICT，rowCount严格等于fresh.length。真实PK23505/FK23503保持，触发器RETURN NULL模拟短写严格拒绝并回滚，现有120个已认证CH正文前后完全一致；原Unicode/EOF/超限/source/删除/worker回归同轮通过。manifest_sql固定facts标签计时不重复计rows；不扩展047 bulk。尚无本片应用负载测量，不宣称性能收益或SLO达标。
