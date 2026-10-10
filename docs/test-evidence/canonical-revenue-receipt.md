# 收入重复订单可靠 receipt 本地专项

修改 `src/server/collect.ts`：新 event_id、相同 order_id/currency/value 的去重分支读取原订单 event_id，并在同持锁 client 上验证 canonical 正文 receipt；验证成功后才保存别名 key 并 ACK。新测试 `tests/integration/canonical-revenue-receipt.test.ts`。

实际命令（隔离源码副本 `/tmp/baize-revenue-receipt-9r98l5q7`，仅 readiness 常量启用；生产仓库 guard 未修改）：

```sh
TEST_DATABASE_URL=postgresql://baize_dev@127.0.0.1:5432/baize_dev CLICKHOUSE_TEST_URL=http://127.0.0.1:38123 npx vitest run tests/integration/canonical-revenue-receipt.test.ts --reporter=json --outputFile=/tmp/baize-revenue-receipt-retained-pg.json
```

结果 **1 PASS / 0 FAIL / 0 SKIP**，EXIT0。初始收入真实 PG 收集，经公开 HTTP shadow/verify/activate 成为 CH authority；保留 PG raw，**没有运行 prune**。相同订单的新 event_id 正常返回 duplicate202；实际删除原 CH 正文后，即使 PG raw 尚在也返回503且不保存别名 key；真实闭合 TCP 端口同样返回503、不保存 key。本证据不声称测试了新 canonical 收入写入或备份门控后的 raw prune。

第一次真实运行尝试新 canonical 收入写入，原收入 ledger 外键依赖 PG events，返回 internal_error，**1 FAIL**，日志 `/tmp/baize-revenue-receipt-first.json`。该失败保留于同目录 initial-failure JSON；后续 049 外键修复和新写入专项属于其他独立证据，未覆盖本历史结果。

相关 ESLint EXIT0。该时刻全仓 tsc EXIT2 只报告 canonical-migration 在制 epoch/proof 未定义；root 后续另报告全仓 typecheck EXIT0。本专项不把后续结果倒填为当时通过。仅本地执行，无 Git/CNB/托管 CI。
