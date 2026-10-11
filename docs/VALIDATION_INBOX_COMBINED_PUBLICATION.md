# 单门消费隔离候选

源码 `9689ae027474a78ee2205a75f05475c928d0fd14`，2026-10-11 UTC。正式collect未改；默认separate，combined显式研究开关。

## 不变量和失败预算

validate/claim/publish同client、同次P/site→761持锁，50行上限及逐项body/digest/source/negative/receipt/CH读回不变。认领先建立持久attempt/lease；出版以SAVEPOINT隔离。错误必须等所有transport settle再撤回出版PG写，commit认领次数后tx外抛typed错误。保存点/COMMIT自身失败整体failclosed，不承诺成功，不解锁后留下仍运行外发。

开发审查曾发现整tx rollback会把attempt预算抹掉，该未验方案已修正，没有发布为默认。当前失败次数可耗尽maxAttempts，不能无限重试；lease到期才可重新认领。删除/查询严格门继续保留，不用新缓存证明、不增队列/lease/drain。

## 实际专项结果

**48 PASS / 0 FAIL / 0 skip，EXIT0**：14原PG、8 admission、8 combined PG、18真实CH；不是48个CH。whole typecheck与定向lint EXIT0。其中4新增真实CH案例证明出版PG失败保claim但孤儿白名单不可见、受控lease过期后retry、缺正文拒绝、精准删A保B。新PG覆盖maxAttempts1、deadline/settle/max1pool、同client、B短入队与删除屏障、未提交容量保守。

[完整JSON/源码哈希](performance/producer-canonical/inbox-combined-correctness-pass/)。未重跑整产品浏览器/镜像，正式全轮保持72ea929；此前B5000两个FAIL均保留。

## 后续闸

同SHA300 separate/combined正在串行比较，不以未测结果称提速。生产独立fsync及pending备份/恢复未接线；研究PG journal不等同生产耐久删除。当前尚不替换正式received/accepted契约。

## 同SHA300对照

两组独立入队均EXIT0：300received/validated/published、0失败/未发、7finalchecks PASS，源树不变、cleanup全true。separate operator周期64次/门134次、累计wall6724.915ms；combined86次/门86次、累计wall5245.516ms。周期含空轮询，不能把门次数减少当完全等工作量比例；低样本仅支持目标方向，不推出SLO。真实CH均12 timed transports，对应6批完整写读。

[原始对照](performance/producer-canonical/inbox-9689ae0-300-cycle-ab-pass/)。随后同冻结源码原100批50事件/1秒调度/10秒查询/queue8/con2/drain120秒运行一次combined5000；未改默认入口或验收阈值，尚待结果。
