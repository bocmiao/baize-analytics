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
