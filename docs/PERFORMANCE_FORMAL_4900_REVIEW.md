# 原正式4900证据复核（2026-10-11 UTC）

239bb53确有4900 strict **accepted**，不是B received，也不是服务器容量上限4900。100目标/98实际HTTP202、rejected0/failed0；81、82两批在发送器queue8/active2时未发到入口。已收完整性和排空通过，整体因2unsent FAIL。

直接时序：batch71 71.016229→82.091045秒，batch72 72.067185→82.389611秒；73..80积成8个waiting；81/82分别81.008677/82.019260秒判满。同期query70.067709→81.722974秒高度重叠，但旧观测没有请求关联的持锁时序，不将相交本身称因果证明。定时器迟到仅8.677/19.260ms，当前证据不支持CPU停顿或due-loop误丢。queue8不含2个inflight，原deadline220秒未触。

## 72ea929原始摘录（未重跑）

完整原件在 `docs/performance/producer-canonical/strict5000-72ea929-failure/`：plan.json、result.json、source-binding.txt、wall.txt、scheduler-summary.json。准确字段复制见[JSON摘录](performance/formal-4900-review/existing-evidence-excerpt.json)，原件哈希一并记录。

plan：100×50=5000、interval1000ms、query10000ms、queue8、concurrency2、drain120000ms；coverageReuse1/pagePathBatch1/publicationConcurrency2；启动磁盘可用7000199168B。六未发index68、79、80、81、82、83，sent/status/duration均null，outcome全部queue_full_unsent。query60.002869耗8.479346秒；70.040963耗12.722556秒→82.763518；90.002284耗11.226715秒。其余完整12条querySamples保留在摘录，均ok，但过程coverage0不可称实时统计已完成。

wall.txt实际overall200.492930050秒/child峰710716KiB；原windows intake103.216729秒/drain66.165968/final19.487540，最终HTTP18.187秒。sameNode窗口峰727773184B不含数据库。239 wall224.249575950秒/child峰723596KiB；不能混计进程峰与窗口RSS。

## 输入/环境及可比性边界

两正式入口benchmark/bootstrap/scheduler源文件239→当前main此前完全相同，旧原件绑定sourceSha和Git blob digest前后相等。每请求新randomUUID visitor，50个pageview，每事件独立event_id/page_id，5路径/p/0..4，ts=发送时Date.now()-50+i，standard隐私、固定UA Chrome145，origin continuous.example.invalid，sdk independent-benchmark。seed一条bootstrap不计负载，最终canonical多1。不是逐字节固定数据集：UUID、盐、绝对时间和命中的closed/dirty批次随run变。精确72生成源码见[生成器摘录](performance/formal-4900-review/72-event-generator-source.txt)。查询固定site/from启动前1秒/to当前时刻，独立单在途、每10秒目标，与collect并发；background worker，无手动聚合。

历史raw未保存CPU/内存quota、确切Node/PG/CH版本，不能补用今天配置冒充历史环境等价。两轮已收集合不同；72默认047读取宽度3，239为1且canonical单记录复用等后来改变，不能把4700比4900称确定回退。B9689的4350为PG received先回执、有独立publisher，另有pending1000/16MiB，因此不直接排性能名次。

下一步同当前安全源码、相同仪器与固定压力做baseline/candidate，而非运行旧239丢安全修复。首先补有限匿名请求/阶段时序，证明collect等待与stats共享门占用；不改发送器队列/调度/ACK，任何未来发送器改动单独披露。性能、安全正确性、ACK分开报告，旧失败不改写。

## 新诊断与候选状态（2026-10-12 UTC）

匿名仪器26检查（24unit+2实际PG）PASS，default应用不输出诊断scope/不信来访header；全type/lint PASS。172148a原formal5000诊断轮启动23:58:26 UTC、seed23:57:29.455，采集跨UTC午夜，accepted4400/12queue_full、已接收完整性/排空PASS。原始[边界诊断](performance/formal-4900-review/boundary-diagnostic-172148a/)保留，**不可作单日基线/候选等布局比较**。首次未记录精确HTTPfrom/to，不能事后编造；PG已提交成员只读采样恢复seed/latest并显著标明来源。

当前候选仅047读取阶段复用一条最终Zod规范化record的canonical字节，默认false；不缓存wire/source/envelope，不跨row，不删任何schema/size/SHA/HMAC/key/source/CP检查，writer/restore默认canonical不变。47定向检查PASS/0skip（19unit+28实际PG/CH），包含store真实两模式12案例，typedEOF/缺正文、group/source、signed独立body恢复及stats快照/预算。不是新整产品全轮或吞吐通过。

后续同源码flag0/1在离小时/日期边界超过2分钟且距下一边界至少10分钟时开跑，仍原100×50/每秒1/并发2/队列8/每10秒query/drain120。记录UTC起止、seed及全部查询窗口；固定原事件生成shape，不改Date.now合同或补发。当前runtime Node24.19.0、PG17.11、CH25.8.33.6、quota4CPU/32GiB，仅适用于当前，不补历史。依结果决定是否保留候选，不先默认新算法更快。

旧镜像611d已可恢复归档206273792B至/tmp/baize-checkpoints-preserved-20261011/retired-image-611d-20261011/baize-image-611d2da964e3.docker-save.tar.gz，SHA256408b53486cb4a98706f9a614c2a8649b2140cd9765890e1aab3539b3f6c5945f。config哈希匹配原imageID且所有容器未用，保护现daaf镜像与全部卷；移除缓存引用前后实测可用空间仅增加2297856B，不把572MB逻辑镜像大小当释放量。docker load可恢复，manifest已入[证据](performance/formal-4900-review/retired-image-archive-manifest.json)。
