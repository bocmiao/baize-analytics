# F29 逐步流失特征验收（下一批模块）

独立模块 `src/server/funnel-analysis.ts` 导出 `registerFunnelAnalysis(app,ctx)`；主应用工作区已由 web 负责人注册，真实 PG 测试现在走 createApp 的正式注册路由；第三批不可变版本9cd7cd0尚不含本模块，不能当成该已发布提交的功能。浏览器专项由 web 负责人集成。

路由 `/api/v1/sites/:siteId/funnels/:funnelId/analysis?from=ISO&to=ISO&property=可选属性` 返回各步 entered/completed/lost/lossRate、Top10来源/设备；属性仅支持非身份字段原生 string/number/boolean，按 type+value 分桶（boolean true 与字符串 "true" 分开），properties 返回 type/value/count，并报告实际 propertySamples/missingPropertySamples。严格/宽松匹配使用生产 funnelVisitors、事件时间 sessionize、配置会话超时；同一访客任一合法会话到下一步即排除该步流失，不拼接不同会话。每步维度归属最早到达该步的会话与事件。

站点权限先校验，漏斗ID限定本站并验证UUID。共享站点事务锁协调采集/删除；实际 readSiteEvents 事务PG snapshot显式source/fallbackReason，屏蔽visitor tombstone及身份时间段残留。明细上下文至多90天、100000条，最多90天请求；明细保留外、上下文边界不足、daily_salt跨日、事件超上限明确 coverage=0/状态，超上限只报至少100001条，不用残缺样本虚构历史零。Top10维度只是展示边界，entered/lost按完整明细计数。

实际命令 `TEST_DATABASE_URL=... npx vitest run tests/integration/funnel-analysis.test.ts`，独立真实PostgreSQL schema，4项通过：真实管理员初始化/账号登录/站点/漏斗/collector→PG；strict/loose/多页面乱序事件及同访客多会话去重；布尔与缺失属性样本、401/403/跨站404/非法ID；原始数据仍存在时tombstone/身份时间段过滤；实际100001 PG明细触发上限而不是样本计算；daily跨日、过期、未来/超过90天拒绝。100001条上限样本通过SQL写入验证读取防线，其余行为通过真实collector写入。类型检查与owned ESLint通过。

浏览器逐步特征表待本批专项验收；已验证工作区主应用路由，不宣称第三批冻结版本提供新路由。现有 `/analysis/features` 原基础流失特征不因本模块改变。
