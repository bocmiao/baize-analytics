# 外部连接器异常覆盖复核

2026-10-11；起始基线为父线程指定的 `957431ba`，以下是工作树切片，不表示已提交、全仓集成或真实账号验收。

核对范围：PROJECT_SPEC F48、F51–F60 的聚合导入、SEO 授权爬取、SERP、BYOK/预算/只读证据要求，IMPLEMENTATION_NOTES 实施勘误及 IMPLEMENTATION_CHECKLIST 外部未测边界。没有改外网、账户、预算策略、迁移或共享出站安全模块。

## 覆盖矩阵

| 故障 | 既有实现/测试证据 | 本轮动作与边界 |
|---|---|---|
| 请求超时/正文过大 | outbound 原10秒请求截止、DNS最多5秒、正文cap；external.test 单元使用真实本地HTTP慢/大响应 | 复跑旧单元；不把单请求timeout当整任务SLO |
| 429/提供商非200 | Google导入立即固定provider_failed；没有隐式HTTP重试 | 新模拟429用例断言每次仅一次运输；不自动尊重远端Retry-After等待，不称已有该功能 |
| 重试预算 | external_jobs 原attempts<5、租约代次、5分钟指数退避最高1小时；AI reservations原持久额度 | 原PG测试已有定时任务失败后重试/并发月额度；本轮不重写或重复运行其闭环 |
| 畸形200/分页 | GSC和旧gaRows原直接JSON.parse/spread，非数组rows导致普通异常；没有单页数量拒绝 | 本轮统一固定502格式错误，拒null/非对象根/非数组行集/非记录行/超声明页量；合法缺rows仍表示空报告。第二页坏响应不返回此前页面 |
| 脱敏 | 固定ExternalError消息；既有API encryptedsecret read断言 | 新测试恶意provider正文/凭证字符串不进入错误；不打印外部原文 |
| SSRF/重定向 | outbound私网/映射IPv6/DNS检查、最多3跳、授权跨源不转发；模型精确origin例外隔离 | 原单元复跑；共享安全模块未改，不声称新增DNS竞态或真实公网验收 |
| 缺配置/optin/权限 | connector_missing、google_authorization_required、ai_opt_in_required、跨站403既有 | 原PG已覆盖，未改变API或降低guard |
| GA4原子性 | ga4-windows旧PG畸形日期/重复/失败保留事实用例；生产采用fetchGaWindow，不采用旧gaRows | 不混淆旧adapter此次单元与生产GA4新验收 |
| SEO失败/未知 | robots、原HTML、抓取失败unknown、目标定点复检已有seo-local/seo-gsc-v2 | 无新爬取或假“健康”结果，本轮未重跑PG/localcrawl |

## 确定缺口修复

`external-response.ts` 的 `providerRows` 是唯一新增生产helper。`external-worker.ts` 的 gscRows 与旧gaRows分页采用它；严格输入边界，不改变Google授权/请求窗口/分页步长/覆盖标签/锁与保存逻辑。

新增8个模拟provider单元。既有external及external-errors单元一并运行：3文件18 PASS、0 FAIL；此前首轮3文件16 PASS（当时新增6例），未发生被掩盖失败。JSON证据 `test-evidence/external-resilience-unit-current.json`。命令：

```
npx vitest run tests/unit/external-resilience.test.ts tests/unit/external.test.ts tests/unit/external-errors.test.ts --reporter=json --outputFile=/tmp/baize-external-resilience-unit-final.json
npx eslint src/server/external-response.ts src/server/external-worker.ts tests/unit/external-resilience.test.ts tests/integration/external.test.ts
npx tsc --noEmit
```

以上单元、scoped lint、type实际EXIT0。新增真实PG API回归源码位于external.test.ts，拟检查畸形GSC输入的固定502、原gsc_stats与gsc_import_windows逐行完整保留；已由root在隔离PG串行执行并通过；最终源码与计数见本批验收记录。该fixture显式模拟Google运输，PG/auth/加密配置真实，不是Google账号验收。

真实Google/GSC/GA4、商业SERP、外部模型及其限流配额/质量未实测；本轮没有发外网请求、购买、创建凭据、运行重型CI或提交。任何后续PG结果须另写精确源码与计数，不以这18个单元替代。
