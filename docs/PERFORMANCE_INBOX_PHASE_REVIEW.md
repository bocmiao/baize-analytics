# 隔离 inbox 本阶段结论与下一协议门槛

2026-10-11 UTC；最近候选源码9689ae027474a78ee2205a75f05475c928d0fd14。依据实际结果，不替换正式入口、不同ACK始终区分。

## 已有收益及未达到目标

独立入队消除receiver共用站点门等待，100批均可发到HTTP，背压原因明确为pending条数。合并validate/claim/publish一次门保留认领预算/lease，48真实PG/CH专项通过；300对照有方向性收益。两次原参数5000仍FAIL：4100/18×429→4350/13×429，事件工作集不同，不能把这些数字当可靠因果容量提升。publisher站点门等待183.968→184.100秒，门次数482→227不解决长期占用。原B4850/429/2未发及正式strict4700/6未发都保留。

不得继续增pending、减少查询、改速度/drain、跳认证、提前accept或无源码改变重复压测。已收到的完整性通过和5000容量通过是两个结论。

## 不能直接复用缓存的源码依据（只读评估）

- cache-store-source.ts的withCacheReadSource仍先withRemainingFactReadSource，包含044完整hydrate，然后cache.streamRows另验正文SHA/HMAC，不是已有免全认证聚合快照。
- session-facts-publication.ts中的strict hourly/day控制为relationalVersion:2；精确跨桶UV、过滤和漏斗依赖member/owner集合，不能相加每日UV或换近似。
- fact-store.ts逐rowHMAC/schema/source验证需要规范化完整row；PG成员body_hash并非已封印整个manifest/键范围/selected union的承诺。CH stored hash列不能代替实际正文SHA256。
- 两次CH SELECT（proof与cache）不共享CH事务快照；PG RR/站门只固定PG白名单和受控修改，不能冒称CH物理读取同快照。

## 需要的新内部协议（设计，不是实现或批准的默认）

可研究发布时封印cache→exact contribution owners/receipts的依赖闭包，读取时同一有界CH语句计算实际正文摘要/数量/键范围并返回对应聚合。必要门槛：发布阶段完整HMAC/schema/body认证；旧未封印数据保守回退；已提交attempt白名单排除CH成功PG回滚孤儿；未脏visitor正文缺失仍unavailable；epoch/配置/retirement连续性、删除/restore精确失效；跨桶UV/filters/funnels/vital分位保持精确。不能只对存储hash列检查，不能跨两个SELECT宣称原子证明。

这会涉及发布/签名、查询、备份恢复、删除和旧版本迁移，超出当前“合并门穿越”的最小修改，尚无收益或正确性证据。实施前须建立独立协议与故障夹具，不把草案放默认生产。是否优于保留PG普通模式需要实测，而非为了追5000牺牲契约。

## 与生产接入不同的剩余项

B仍缺正式wire/HMAC身份来源、identify/revenue副作用、独立fsync日志接新admission门/队列清理、signed pending备份恢复与全局公平/年龄。现PGjournal不是独立删除日志；可复用deletion.ts既有journal/verified replay而非新造协议，但即使补接这些也不证明吞吐达标。本轮未混入正式路由。
