# Durable inbox 隔离原型验证

范围：`scripts/prototypes/durable-inbox.ts` 与独立 PG 专项；**不接入正式采集、不改变正式 202、不部署**。见 [ADR 060](ADR_060_INGEST_RECEIPTS.md)。本文只报告本次原型，不重分类已交付产品功能。

## 最新隔离专项（字节预算）

在两文件冻结摘要上实际运行14项真实PG，EXIT0、0fail/skip；新增每站pending字节上限、整批回滚、重试不重复计费、删除/重放释放与metadata不一致拒绝。原始JSON及文件SHA256见 [字节预算专项](performance/producer-canonical/inbox-byte-cap-pg-pass/)。publisher仍模拟；未运行新正式应用全轮。

## 历史8项实际结果

`/tmp/baize-inbox-prototype-pg-r1.json` 与同名 `.log`：1 文件、8 tests PASS、0 FAIL、0 skip，实际 EXIT0。`/tmp/baize-inbox-prototype-demo-r1.json`：`received=1`、`publishedEvents=1`、`publisher=simulated_transport`、`productionIntegrated=false`。PG 为真实数据库，publisher 为注入模拟传输，不能称实际 CH 验收。

八项实际通过：

1. `received` 为 PG commit 后回执；同摘要重试幂等、冲突使批次回滚。
2. 有界接收/明确失败、每日别名及原始输入不越过 prepared 边界。
3. 模拟发布 ACK 后 PG rollback 仍未发布；过期 lease 的旧完成拒绝。
4. 同 schema 删除日志重放清理 pending 恢复行，保留给定事件时间区间外的 B。
5. 重试次数有界，模拟 publisher 失败不发布 pending 行。
6. 伪造重复 claim 在模拟传输前拒绝。
7. 超时仍持 privacy gate，直至注入 callback 实际 settle。
8. source epoch 变化在模拟传输前拒绝。

`publishedEvents` 仅表示原型事件发布状态，不表示会话、聚合、水位或看板 ready。派生统计覆盖另行验证。

## 下一闸与不能外推的边界

- 尚无真实 CH 写入/完整读回、HMAC 与 PG 提交白名单闭环、正文物理删除 ACK；模拟 ACK 不提供 CH exactly-once 或外部擦除证明。
- 只保存 ts 与给定删除区间，未验证真实 identify 映射、迟到重分段、上游 day-HMAC、跨午夜/DST；不能冒充完整 collector 身份语义。
- 单行 16 KiB、批次最多 100、pending 条数受限；每站pending字节上限已专项验收；队列年龄/全局站点公平/总历史存储限制未实现。
- 同 schema PG journal 不是独立 fsync 最新删除日志或签名 pending 包的跨数据库恢复。进程终止、真实双 transport 故障、独立目标恢复与源不变仍需专项。
- 不配合 AbortSignal 的 callback 可无限阻塞 privacy gate。安全 fail closed 已测，整体有界延迟没有保证。
- 本次没有 B 性能、5000 容量或聚合 SLO 结论。A72 原 5000 FAIL（4700 accepted、6 未发送）及其他历史失败保留；短 HTTP 约 19–21% 改善不足以证明容量闭环。

下一步先补耐久 publisher/隐私/恢复接口及真实故障闸，再使用同一到达节奏、数据与最终完整性条件比较；不能靠提前 `received` 或改变基准掩盖原严格回执成本。

实际原始结果与两份源码SHA256归档：[inbox-prototype-pg-pass](performance/producer-canonical/inbox-prototype-pg-pass/)。完整应用72冻结验收不含这两份原型文件，不能混报新HEAD全轮。
