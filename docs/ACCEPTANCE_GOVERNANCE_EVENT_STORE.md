# 治理读路径与真实来源验收

本批为当前工作区增量，不属于 b56b7e9 的148测试快照，未部署或提交。新增026前向迁移给export_jobs保存read_metadata；无历史迁移重写。

raw/full导出通过统一readSiteEvents接口，显式client、includeBots=true、limit=100001，超限或截断拒绝完成。站点PG事务锁、任务lease令牌、独立删除日志、删除撤销导出与文件清理均保留。事务内读取仍强制PostgreSQL（fallbackReason=transaction_snapshot_requires_postgres），不能据此宣称治理worker已经迁到ClickHouse。来源、读取覆盖率、实际limit/truncated以及事务内aggregation generation/processed_generation/epoch/watermark/dirty保存到任务；JSON及完整CSV包含storage记录，列表和下载响应头提供实际来源。无成功metadata就显示unknown/0，不伪造PG/CH成功。

分享与embed使用queryStats真实汇总和其边界规则，保留期内部分桶可使用统一明细读接口，过期汇总不会因只扫描raw而消失。日趋势读取stats_daily真实exact_set计数，标site-calendar-days，不叠加小时UV，不提供每日盐跨日去重。来源、读取fallback、coverage与watermark公开；dirty时覆盖率0，不冒充已完成聚合。分享与embed均no-store；密码、过期、撤销、嵌入CSP检查保留。embed支持显式lang=en且默认中文。

新增governance-event-store.test.ts使用独立真实PG schema、实际createApp管理员/站点/分享流程，事件实际送/api/collect，生产worker重算，再真实retention移除raw而保留汇总，验证分享和英文embed仍有页面/PV/日UV；新采集未重算时coverage0；实际完整JSON导出包含当前PG元数据，真实删除后旧下载404。所有临时测试资源清理，未使用mock事件读取或演示数据。

实际命令：

```sh
npm run db:migrate
npm run typecheck
./node_modules/.bin/eslint src/server/governance.ts src/server/governance-worker.ts tests/integration/governance*.test.ts
TEST_DATABASE_URL=postgresql://baize_dev@127.0.0.1:5432/baize_dev ./node_modules/.bin/vitest run tests/integration/governance.test.ts tests/integration/governance-privacy.test.ts tests/integration/governance-file-cleanup.test.ts tests/integration/governance-event-store.test.ts
```

07:23:06实际4文件28测试通过、0失败/跳过（6.99秒）；全仓类型检查及所属lint通过。之后仅补分享POST的no-store响应头，07:24:29新增真实PG专项重跑1文件3测试通过、0失败/跳过（1.70秒）。

边界：本批不声称完整治理迁移。replay关联、存储使用字节统计、告警事务、删除与身份修改仍有明确PG路径；完整导出受10万行/每表边界限制，不能冒充无限全量导出。已知Share unavailable、Export not ready与导出worker失败文本尚需稳定错误码/英文统一，已向web报告，未修改主界面或弱化鉴权。
