# AI 044 事实来源接线（工作区，本地专项）

`readQuestionAggregate` 给精确关系查询传入既有 pool 作为注册表身份，同时复用该函数已持有的 max1 client。pool 不在持锁时再次借用连接。CH facts TEMP 桥由实际发布 owner/kind receipts 选源，AI 证据采用兼容新增标签 `postgresql-preaggregate` / `clickhouse-preaggregate` / `hybrid-preaggregate`，不是从 canonical authority 猜来源。旧 PG 标签、epoch、generation、coverage 与 query version 不变。

仅来源 fence `FACT_STORE_SOURCE_FENCE` 转为已有 `unsupported/published_authority_mismatch`，无图而不伪零；缺 body、网络失败等不吞掉。正常 PG 路径不要求 CH 账号。A 所有指标 SQL 的最终执行已改走 `factReadSql`，避免 TEMP 桥已加载却仍读空 PG 表。

实际 `tests/integration/ai-fact-source.test.ts` 使用独立 schema、pool max1、真实 collector 3PV/2访客、真实 canonical publication 与 worker effects/vitals shadow。夹具显式建立 CH authority 以触发 worker 发布，**不是生产管理员激活验收**。已完成 kind 的 PG effects/vitals 正文被显式裁去，永久 PG effects count=0 后，工具仍读取 `/a=2`、`/b=1`、日UV2、coverage1、实际来源 clickhouse-preaggregate。模拟模型必须请求 query_analytics，第二轮接到的工具结果与真实 PV series 相等，typed charts 与工具证据逐字相等。此处只验证内部 scoped helper/图证据，权限/预算生产端点由既有验收覆盖，未新增真实模型质量或 API 端到端声明。

随后真实 CH ALTER 物理删除所选 backing、保留 committed receipt，AI 读取拒绝 `FACT_STORE_BODY_UNAVAILABLE`，不回落空 PG 或返回 coverage1/0数值；pool waitingCount=0。测试结束删除自己 CH rows 和 PG schema，不操作其他站点。

执行：

```sh
TEST_DATABASE_URL=<local PG> CLICKHOUSE_TEST_URL=http://127.0.0.1:38123 npx vitest run tests/integration/ai-evidence.test.ts tests/integration/ai-fact-source.test.ts
npx tsc --noEmit
npx eslint src/server/ai-evidence.ts packages/contracts/ai-evidence.ts tests/integration/ai-fact-source.test.ts
```

最终 2026-10-10 12:55:02 UTC：**2文件6测试 PASS**，4.97秒；其中新增 CH source 1项，既有 helper 5项，未加进第八377。类型与所属 lint 通过。

失败历史保留：12:53:32 新1项 FAIL，期望真实/a2/b1，实际 empty series 且coverage1。原因是精确适配器最终 SQL 绕过 TEMP 选源；A 修复后同断言1项12:54:22 PASS。12:54:45 两文件5PASS/1FAIL，来源 fence 抛出比既有 unsupported 契约更早；只对该特定 fence 维持旧 unsupported 返回后原断言全部通过。没有减低 PV/UV 期望或关闭缺正文保护。

当前仍 WIP；不是最新 main、全量CI、浏览器或Docker验收。新044备份恢复/精准删除/完整 canonical readiness 仍由各模块整合，不以此单项替代。真实外部提供者未使用。
