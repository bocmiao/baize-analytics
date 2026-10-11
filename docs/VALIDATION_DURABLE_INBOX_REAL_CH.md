# 隔离 inbox 真实 CH 第一轮

## 第二轮（当前隔离专项）

真实PG/CH联合21PASS（14原型PG+7真实PG/CH），0fail/skip、EXIT0。新增4项：已发布A物理删除与B保留/新pendingB可发布；CH物理ACK后PG删除回滚不返回成功、缺A正文拒读，受控删除重试完成；同client重复event key认证原正文后不多写；正文物理丢失的重试拒绝并回滚PG。

module在staged PG journal后调用同client eraser，强制physicalAck=true，再回查本事务确切journal IDs、推进负向代际并提交。**此PG journal可回滚，不是独立fsync journal**。CH已删PG回滚会短暂不一致，当前只证明fail-closed和受控重试，不证明生产跨库原子性/恢复防复活。正式接入仍须独立最新journal证明；原型不默认启用。

[第二轮原始JSON/日志/源码摘要](performance/producer-canonical/inbox-real-ch-r2-pass/)。无5000结果，不把received等价于原accepted；没有重跑正式应用/镜像。

## 第一轮历史结果（f75f089）

本轮采用真实PG17/CH25.8，随机schema/独立站点，pool max1；不接正式collect、不改变202或发布。类型检查与scoped lint EXIT0。两文件专项17PASS、0fail/skip，实际EXIT0：14既有PG原型 + 3新PG/CH测试。不是正式应用全轮重跑。

原型所有事务先沿现有 P→site gate，再取原型锁，publish callback复用持锁client和fresh claim闭包。真实publisher调用现有publishCanonicalIngest/CanonicalClickHouse完整读回与PG白名单，不另造可见性协议。

实际证明：

1. 两条prepared标准事件真实CH发布和PG commit，精确事件时间/visitor/page/body与prepared摘要相等，无二次身份hash。
2. CH写入及完整读回后，PG published UPDATE trigger强制失败：CH物理1行，但PG keys/batches/members及inboxpublished为0，committed reader为空；同claim新attempt重试后CH物理2行、只有1条已提交可读。孤儿不因后来成功显露。
3. A事件时间区间删除后旧claim在CH前拒绝，B区间外新claim可发布，A旧重试拒绝。

局限：仅standard pageview/event/heartbeat/vitals、字符串维度；拒identify/revenue/daily_salt。prepared SHA研究回执不是原wire receipt/HMAC身份来源证明，不凭空补签。第3项删除使用原型PG journal，未证明独立fsync日志，也未涵盖已发布CH正文物理擦除；下一轮补该物理删除与重复event-key缺正文拒绝。真实发布不等于统计ready或5000容量通过。

证据：[原始JSON、日志、源码摘要](performance/producer-canonical/inbox-real-ch-r1-pass/)。旧模拟8/14结果及所有性能FAIL保留。快照工具检查只提供environment status/config draft，没有创建/导出接口；技能说明用户产品发布才建立快照，当前未发布或重建环境。
