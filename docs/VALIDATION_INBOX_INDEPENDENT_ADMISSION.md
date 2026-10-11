# 隔离收件箱独立入队门验证

源码 `4d1affac265d5f23647d8c2471e5642e37afd7b7`，2026-10-11 UTC。仅研究入口，正式 collect 不变。原 B5000 4850/429/未发送 FAIL 和正式 strict5000 FAIL 保留。

真实隔离 PG 与 CH 联合 **36 PASS、0 FAIL、0 skip，EXIT0**：14 原 PG，8 admission，14 两种模式真实 CH。第一次35项通过后增加超时用例，完整重验36项；不是36个真实CH测试。类型与定向 lint EXIT0。

独立模式 receive 取共享分区门→762短事务门，不拿站点发布锁，不更新共享计数行，也不持 parent FOR UPDATE；预算扫描 pending 元数据，发布未提交释放只令预算保守偏高。publisher 仍站点严格门→761，普通parent读取，逐行receipt/来源/最终校验保留。delete/replay 先站点门→761→762再parent FOR UPDATE；等已接收事务结束，阻止新接收，并按事件时间安装负例和清理。模式持久且不可修改。

实际屏障验证不同key同站点在publisher暂停时提交、FK已插入后delete排队无反转、删除未提交不能ACK接收、并发N/N+1字节预算、来源/真实tombstone、模式拒绝、publisher deadline回滚与锁连接释放。两种模式均真实CH写入读回、CH ACK后PG失败孤儿不可见、精确物理删A保B、删除跨库回滚失败关闭、缺正文重试拒绝。

[完整报告及源码哈希](performance/producer-canonical/inbox-independent-correctness-pass/)；未重跑整产品/浏览器/镜像，正式验证仍绑定72ea929。

生产删除尚未取新762门/清prototype表，研究PG删除journal不是独立fsync日志。不能宣称完整生产接入或替代既有删除恢复协议。新模式默认关闭，随后同SHA300比较才决定受控5000，尚无性能达标结论。

## 同SHA300接线对照（不是容量结论）

site_gate 与 independent 均 EXIT0：300received/validated/published、零失败/未发、7finalchecks PASS，源树前后相同且cleanup全true。最终断言阶段分别1423.744/1415.709ms；接收HTTP累计484.365/508.518ms，operator周期包含墙钟5513.926/6604.300ms。后者不是独立CPU时间；嵌套CH/PG阶段不能相加。低负载没有观察到提速，不把约8ms最终断言差异称性能收益。

[两模式原始结果](performance/producer-canonical/inbox-4d1affa-300-ab-pass/)。5000候选正在原100批/50事件/1秒调度/10秒查询/queue8/concurrency2/drain120秒条件下运行；依据是原B约84.64秒站点门等待和确定性长发布屏障已解耦，不是300提速。

## 原参数5000独立入队候选 FAIL

同冻结4d1affa，EXIT1。100批均发送，82研究202/4100received=validated=published，18批/900事件HTTP429，准确错误码全部pending_backpressure（条数，不是字节），0未发送。query/probe/publisher错误0；7 finalchecks PASS，drain116.548秒在原120秒内，但不是5000容量通过。canonical4101/UV83含bootstrap1，9正式PG正文表0，outbox4101全done、水位/generation完整。最终HTTP15600.861ms；源码前后相同且cleanup全true。

接收HTTP累计11.364秒，batchP95 263.067ms；相比旧B门等待已移除，但收到集合不同，不称整体性能改善。背压峰2050包括canonical outbox+inbox，两者不能等同pending1000违约。publisher200周期/82发布、累计包含wall224.027秒，operator站点门482次累计183.968秒，CH164次累计1.485秒；同统计调用16次累计166.164秒，认证55.726秒/TEMP35.619秒/SQL4.864秒（嵌套不相加）。Node/app+harness峰620015616字节，不含PG/CH/Redis；未记录独立child RSS，不拿旧run值顶替。

[本次完整原始JSON和阶段摘要](performance/producer-canonical/inbox-4d1affa-5000-independent-failure/)。原B及正式strict FAIL不改写，B不同ACK始终显著标注。接下来唯一有据候选：把当前validate/claim/publish三次门穿越合到一次同client事务，保留50条上限、逐项认证/receipt、来源、删除严格门及超时settle，不增加pending或drain。仍隔离默认关闭，不先承诺容量提升。
