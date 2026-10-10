# 分析实现与验收边界

## Worker 发布规则

Worker 在 PostgreSQL REPEATABLE READ 快照内读取站点 generation、epoch、租约 owner、完整保留期事件及最大 outbox ID。随后计算完整保留范围汇总。发布时持有同站点 advisory transaction lock，并检查相同 epoch、相同 owner、租约有效，以及 `processed_generation <= 快照 generation <= 当前 generation`。

后续采集可以继续提升 generation，不阻止较早的完整快照发布。发布仅设置 processed_generation 为该快照 generation，且只完成 `outbox.id <= 快照最大 ID` 的任务；后续事务留下的 generation 和 outbox 保持待处理。删除、恢复、重放和升级改变 epoch，使旧 Worker 不能发布。Worker 进程中断后由租约回收；连续三次处理错误进入站点级死信，管理员可查看和重放。

会话按事件时间排序，标准模式可跨本地午夜，每日盐模式不缝合跨日访客。页面实例分别关联心跳和收入，心跳以页面实例和原始可见区间去重。收入按币种独立保存；标准模式订单按站点 HMAC 去重，每日盐模式订单只按事件本地日期去重。相同订单金额或币种不一致时拒绝，重复订单的新 event_id 只保存幂等收据，不添加事件或任务。

## 实际验证

命令：

```sh
TEST_DATABASE_URL=postgresql://baize_dev@127.0.0.1:5432/baize_dev npx vitest run tests/unit/analytics.test.ts tests/integration/analytics.test.ts
npm run typecheck
npx eslint src/server/analytics.ts src/server/worker.ts src/server/collect.ts tests/unit/analytics.test.ts tests/integration/analytics.test.ts
node_modules/.bin/tsx scripts/benchmark-analytics.ts
```

本模块目前 15 个单元测试、15 个 PostgreSQL 集成测试通过。集成测试使用独立 schema，并包含实际 HTTP SSE、Cookie 会话和成员撤销验证。它们验证迟到乱序、重复心跳、跨日 UV、每日盐不支持的口径、并发认领和租约回收、删除/恢复 epoch fencing、持续采集期间快照进展、订单收据冲突、混合币种、t-digest 不等样本量合并、原型名称输入、事件时间身份区间、过滤查询与旧汇总升级。

这份模块验收不能替代整个应用的浏览器、容器、安装、升级和备份恢复验收，完整结果见项目验收清单。

## 性能实测范围

当前云环境运行 `tsx scripts/benchmark-analytics.ts` 的一次结果：

| 合成事件数 | 会话数 | 会话计算 | 汇总计算 | 合计 | 进程 RSS |
|---|---:|---:|---:|---:|---:|
| 10,000 | 1,000 | 74 ms | 71 ms | 145 ms | 116 MB |
| 100,000 | 10,000 | 654 ms | 668 ms | 1,322 ms | 313 MB |

样本比例是 70% pageview、10% heartbeat、10% vitals、10% 自定义事件，共 18 个小时桶。这是本地合成数据的内存计算基准，**没有测量采集 HTTP 吞吐、PostgreSQL 写入/读取、Worker 数据库发布耗时或并发看板查询**。不能据此宣称每日百万事件或其他容量承诺。性能数值会随机器、负载和事件分布变化。

## 未解决的规模与历史边界

- 当前采用完整保留范围重算，正确性优先；尚未实现只重算完整受影响桶的规模优化。
- 无 PostgreSQL HLL 扩展依赖时使用精确访客集合，跨日 UV 不相加，但集合存储和合并内存成本较高。
- 非整点边界和维度过滤通过完整保留事件重建会话，查询成本随明细量增长；尚未做并发负载压测。
- 已过明细保留期的非完整桶及过滤查询无法精确恢复，返回明确不可用范围与 coverage。
- 旧汇总未保存币种时，收入返回 unsupported_legacy_currency 和单独的 revenueCurrencyCoverage；已知币种金额仅为可确认部分，不代表完整周期。升级触发保留范围重建，保留期外的未知币种不能猜测或补零。
- 前端上报收入是业务方自述金额，不是已付款或财务对账事实。

## 分位口径补充

查询时间窗口的 `precision: exact` 表示边界未被静默向整小时扩张，并不表示压缩分位精确。vitals 显式返回 `quantileMethod: weighted_centroid_type7` 与 `quantileStatus: approximate_tdigest_centroid_means`。未压缩 singleton centroid 的计算等价于原样本 Type-7 排名插值；重复点按完整权重保持质量阶跃。不等日期/桶的样本数不会先平均各桶分位。压缩后的 centroid 以均值代表其质量，原始桶内分布不可恢复，因此属于近似估计。
