# 固定后台错误契约与多语言验收

当前工作区增量，未提交、未部署；不属于既有b56b7e9/9cd180快照，不冒充模拟模型的实际AI质量。

新增src/shared/error-codes.ts提供56个固定中英文API错误定义、ApplicationError及resolveApiError。应用生产handler优先处理外部可信错误和Zod，然后匹配固定legacy状态+消息白名单。未知4xx保留400–499状态并返回client_request_failed固定消息；其他未知错误返回500/internal_error固定消息。内部SQL、文件路径、模型/网络原文与凭证不得回显。已知collect invalid_json/rate_limited/invalid_write_key/invalid_signature机器码和HTTP状态保留。F29路由未修改，仅共享模块支持其已知固定消息的兼容映射。

治理share/export/experiment/report/invitation/replay/heatmap及实例GeoIP管理员错误已使用固定机器码；导出worker持久化export_limit_exceeded/export_failed，不把动态异常路径或SQL原文写到用户任务error中。原有鉴权、密码、删除保护、PG站点/分区锁和任务fencing不变。

## 实际结果与首轮失败

07:32:30影响范围15文件63测试，61通过、2失败（12.51秒）：

1. external-error-contract原来精确期望只有`{error:'internal_error'}`，新契约加入固定安全中文message导致失败。更新为固定API_ERRORS.internal_error.zh；保留not-for-public原文不得出现的断言。新增未知500/403实际API测试也验证敏感原文不会泄露。
2. governance旧UV历史告警fixture使用开发默认schema且有dirty/outbox数据，测试与真实后台worker共享读写边界，归档通知未如预期生成。改为独立真实PG schema、实际生产migrate、结束drop，避免后台消费fixture；保留所有UV历史/迟到水位/实际通知断言。未删测试、未禁用生产worker、未改变告警逻辑。首轮没有记录后台实际消费语句，不能将共享schema风险当作已追踪到具体进程的故障证据。

07:33:24同一影响范围最终15文件63测试通过、0失败、0跳过（14.45秒）。新增3单元验证未知错误隐藏、严格status+legacy匹配和固定双语语义；新增3实际生产createApp API验证管理员/站点/分享/导出/实验错误码，unknown500/403隐藏，以及真实filesystem导出失败仅保存固定代码。真实PG数据与生命周期测试，未替换生产错误handler或mock业务查询。类型检查与所属文件lint均EXIT0。

实际命令：

```sh
npm run typecheck
./node_modules/.bin/eslint src/shared/error-codes.ts src/server/governance.ts src/server/governance-worker.ts src/server/geoip-settings.ts tests/unit/api-errors.test.ts tests/integration/api-errors.test.ts tests/integration/governance.test.ts tests/integration/external-error-contract.test.ts
TEST_DATABASE_URL=postgresql://baize_dev@127.0.0.1:5432/baize_dev ./node_modules/.bin/vitest run tests/unit/api-errors.test.ts tests/unit/external*.test.ts tests/integration/api-errors.test.ts tests/integration/governance*.test.ts tests/integration/external*.test.ts
```

边界：accept-language=en真实API测试验证语言无关机器码及共享英文字典，不代表已完成英文浏览器展示。前端apiErrorMessage和导出状态展示由web唯一编辑，当前源码冻结，待集成与实际浏览器验收。开发验收报告保留中文不是面向产品用户的错误UI。真实外部账户仍未实测。

额外采集协议影响回归：07:34:04实际运行tracker-collector.test.ts与bot-collector.test.ts，2文件3测试通过、0失败/跳过（7.28秒），未修改采集机器码或bot过滤。
