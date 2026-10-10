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
