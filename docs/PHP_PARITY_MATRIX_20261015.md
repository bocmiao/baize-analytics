# Node → PHP 接口与能力对照（2026-10-15）

原版基线为 `f26db98fbb727a1b5c6e42d5eeefda2a8bbcd0e6`。PHP独立实现检查点 `797851476f13a4daa3ea3edbc9869cc6e0477a6f` 已同步main；该检查点之后的独立复核发现HTTP隐私读取、历史快照语义和报表周期问题，收尾修复及最终验证必须一并查看，不能只部署该检查点就称完成。

对照分为实际接口清单、统计语义、安全与后台能力。每条接口都给出实现模块、组回归和差异；“组回归”表示对应业务测试有断言，不表示每个输入、状态和并发组合都经过Node/PHP逐字节差分。原React/ECharts前端保留不构成后端等价证明。

完整机器清单：[157条逐接口记录](test-evidence/php-20261015/interface-matrix.json)。实际注册来源：[Node/PHP路由清单](test-evidence/php-20261015/routes.json)。PHP多出的capabilities、operations与实验预检不计为原功能完成数。

## 统计语义与剩余差异

| 能力 | PHP实际处理和验证 | 差异与未验证范围 |
|---|---|---|
| 日期/时区/比较 | 含时区ISO半开范围；站点日历日；前期等长比较；未来、保留边界、小时覆盖与定义版本显式状态 | 没有穷举所有IANA时区和Node历史分区组合 |
| PV/UV/会话 | 原始去重事件、精确访客集合、30分钟会话及跨保留边界上下文；旧小时仅更新会话贡献，避免重复PV/收入 | 原始读取预算按站点全部保留事件计，超过100000即409，缩短查询日期不能绕过；未达到Node PG/CH的容量证明 |
| 页面/来源/设备/地域/内容/性能 | 统一AnalysisEngine口径；页面入口、出口、可见心跳与来源归因；未知地域保留unknown | GeoIP官方合成数据库实测，真实账户下载未联通；不是估算缺失心跳 |
| 转化/漏斗 | pageview/event目标；严格与非严格顺序、去重访客、步骤损失、属性/来源/设备分析 | 原始保留期外缺少逐人证据或定义历史时返回不可用，不用旧定义重算后冒充完整 |
| 留存 | first-seen独立账本；本地日历D1–D30；成熟/观察窗口/原始和历史覆盖分别检查 | daily-salt跨日身份与带筛选留存不能推断；历史小时覆盖不足时不返回0留存 |
| 路径/身份 | 时间绑定的匿名访客与user标识；身份活动、路径、注册事件前后分析 | 路径最多20组并标明截断；不能从被删除或保留期外原始明细恢复个人事实 |
| 收入 | 采集时保留十进制词法；订单去重；按币种精确字符串累加；微额1e-18与多币种已测 | 不汇率换算、不把多币种合计成一个金额；图表仅绘制能安全往返的数值，精确表格仍显示原值 |
| 回放 | 原协议帧、序号去重、保留和删除逐帧处理；恢复后原事件/分块均不复活 | 回放最多30天；接口明示分页/条数上限；真实生产浏览器及超大录像未穷举 |
| 热图 | 原始点归一、视口与类型筛选；详细行为以最终分析套件及收尾记录为准 | 历史归档功能复核中，不能由当前保留明细接口存在推断Node持久点归档等价 |
| 实验 | 稳定分流、Origin限制、采集→分配→贡献→删除端到端 | 不证明任何业务改版具有统计显著效果 |
| 实时/SSE | ingest单调游标，晚到事件仍推送；Last-Event-ID恢复、去重与权限 | 未做生产代理缓冲/长连接负载验收 |
| 历史namespace | 独立捕获配置、定义与完整小时聚合；备份附件、恢复到新namespace；活动统计不自动替换 | 与Node CH分区/权威切换协议不同；隐私删除使不能逐人证明的旧聚合失效；不是Node存档转换器 |

## 安全与后台能力

| 项目 | 已有验证 | 剩余条件 |
|---|---|---|
| 安装认领 | 私有nonce绑定；原子配置/密钥文件；提交前持久终态；并发认领/空用户旧备份仍封闭 | 故障后失败封闭，由操作者恢复；不提供公开重开初始化 |
| 密码与历史加密 | SHA384预哈希避免bcrypt截断；长Unicode密码；明确格式和原密钥的AES-GCM历史信封；版本密钥轮换 | Node scrypt未提供跨运行时验证器或PG原位迁移；保留原存档 |
| 权限 | Cookie/Token严格区分；站点范围、scopes、过期/吊销；viewer与owner保护；实例管理仅管理员Cookie | 组回归与独立fixture复核，不等于完整渗透测试 |
| 删除日志/水位 | 独立fsync日志、水位与key目录身份守卫；重复重放不重复扣减；截断/丢失/误建空日志拒绝读取/恢复 | 必须单独保留最新日志与所有密钥；旧快照不得覆盖它们 |
| 回放删除/防复活 | 混合时间块逐帧过滤；events与replays两份均处理；旧备份强制重放；未知派生与旧导出文件清理 | 不保留可重新映射被删访客的旧聚合 |
| HTTP/CLI隐私屏障 | 独立复核已实证旧检查点4个HTTP泄露窗口，收尾增加修复提交与API回归；worker启动、任务领取与直接导出均确认删除已应用 | 最终结果以收尾日志为准，不把旧检查点的91项当作HTTP修复完成证明 |
| 完整备份/导出 | 加密实例所有document种类、历史与导出附件；隔离namespace与manifest完整性；JSON全站点导出；CSV公式防护 | 大实例快照内存压力未测；恢复需要现有独立隐私日志身份匹配；不会恢复旧Token/分享/邀请有效授权 |
| AI预算/结算 | 站点锁内预留/结算、重复requestId/回调不重复记账、隐私epoch与权限重新检查；原Zod证据契约解析 | 不能保证供应商收到请求后断网时恰好一次计费；测试是注入模型，不验证真实质量 |
| 报表/告警/通知 | 持久任务、去重、重试、配置加密；删除后的缓存任务禁止发送；滚动报告和告警条件单独与Node核对 | 通知只用注入transport，未真实SMTP/企业微信发送；接受后崩溃可能再次投递 |
| SSO | 固定企业微信官方地址；state一次消费与浏览器绑定；仅映射现有用户；配置竞态/禁用/未映射拒绝 | 15项/数据库为注入响应；真实组织、域名HTTPS和供应商权限未联通 |
| 连接器/SEO | GSC/GA4严格分页、稳定计数、时间窗与原子发布；robots每跳同源检查与SEO V2复查 | 未用真实Google/付费SERP账号；robots未知拒绝；30请求预算记录遗漏 |
| 运维/升级 | 真实MySQL权威与状态；独立PHP schema升级、备份/恢复；Nginx/FPM网页安装与CLI处理队列 | PHP人工校验切包；Node自动增量/CH权威迁移命令返回明确409；真实1Panel面板、生产部署和跨机灾备未验 |

## 逐接口清单

下表的分类对应机器清单中的语义、源码文件、测试文件与剩余条件。`实现+组回归`不是逐接口穷举验收；`夹具/外部未联通`明确保留供应商条件；`运行时差异`表示与Node操作协议不等价。

| 原Node方法与路径 | PHP对应 | 分类 | 证据范围 |
|---|---|---|---|
| GET * | Nginx静态/SPA | static | 实现+组回归 |
| POST /api/admin/geoip/refresh | POST /api/admin/geoip/refresh | geoip | 实现+组回归 |
| GET /api/admin/geoip | GET /api/admin/geoip | geoip | 实现+组回归 |
| PUT /api/admin/geoip | PUT /api/admin/geoip | geoip | 实现+组回归 |
| POST /api/admin/keys/rotate | POST /api/admin/keys/rotate | keyring | 实现+组回归 |
| GET /api/admin/sso/wecom | GET /api/admin/sso/wecom | sso | 夹具/外部未联通 |
| PUT /api/admin/sso/wecom | PUT /api/admin/sso/wecom | sso | 夹具/外部未联通 |
| POST /api/admin/updates/apply | POST /api/admin/updates/apply | updates | 运行时差异 |
| POST /api/admin/updates/check | POST /api/admin/updates/check | updates | 运行时差异 |
| POST /api/admin/updates/rollback | POST /api/admin/updates/rollback | updates | 运行时差异 |
| GET /api/admin/updates/status | GET /api/admin/updates/status | updates | 运行时差异 |
| OPTIONS /api/collect | OPTIONS /api/collect | collect | 实现+组回归 |
| POST /api/collect | POST /api/collect | collect | 实现+组回归 |
| GET /api/google/callback | GET /api/google/callback | providers-gsc | 夹具/外部未联通 |
| POST /api/login | POST /api/login | auth | 实现+组回归 |
| POST /api/logout | POST /api/logout | auth | 实现+组回归 |
| GET /api/me | GET /api/me | auth | 实现+组回归 |
| POST /api/setup/diagnostics | POST /api/setup/diagnostics | diagnostics | 实现+组回归 |
| GET /api/setup | GET /api/setup | auth | 实现+组回归 |
| POST /api/setup | POST /api/setup | auth | 实现+组回归 |
| POST /api/sites/:siteId/ai/query | POST /api/sites/:siteId/ai/query | external-ai | 夹具/外部未联通 |
| GET /api/sites/:siteId/ai/questions/:callId | GET /api/sites/:siteId/ai/questions/:callId | external-ai | 夹具/外部未联通 |
| POST /api/sites/:siteId/ai/test | POST /api/sites/:siteId/ai/test | external-ai | 夹具/外部未联通 |
| GET /api/sites/:siteId/ai/usage | GET /api/sites/:siteId/ai/usage | external-ai | 夹具/外部未联通 |
| POST /api/sites/:siteId/ai | POST /api/sites/:siteId/ai | external-ai | 夹具/外部未联通 |
| POST /api/sites/:siteId/evidence | POST /api/sites/:siteId/evidence | external-ai | 夹具/外部未联通 |
| DELETE /api/sites/:siteId/external/:kind | DELETE /api/sites/:siteId/external/:kind | external-config | 实现+组回归 |
| POST /api/sites/:siteId/external/jobs/retry | POST /api/sites/:siteId/external/jobs/retry | external-config | 实现+组回归 |
| GET /api/sites/:siteId/external/jobs | GET /api/sites/:siteId/external/jobs | external-config | 实现+组回归 |
| GET /api/sites/:siteId/external | GET /api/sites/:siteId/external | external-config | 实现+组回归 |
| PUT /api/sites/:siteId/external | PUT /api/sites/:siteId/external | external-config | 实现+组回归 |
| POST /api/sites/:siteId/ga4/import | POST /api/sites/:siteId/ga4/import | providers-ga4 | 夹具/外部未联通 |
| GET /api/sites/:siteId/ga4/window | GET /api/sites/:siteId/ga4/window | providers-ga4 | 夹具/外部未联通 |
| GET /api/sites/:siteId/ga4 | GET /api/sites/:siteId/ga4 | providers-ga4 | 夹具/外部未联通 |
| POST /api/sites/:siteId/google/oauth | POST /api/sites/:siteId/google/oauth | providers-gsc | 夹具/外部未联通 |
| POST /api/sites/:siteId/gsc/import | POST /api/sites/:siteId/gsc/import | providers-gsc | 夹具/外部未联通 |
| GET /api/sites/:siteId/gsc | GET /api/sites/:siteId/gsc | providers-gsc | 夹具/外部未联通 |
| GET /api/sites/:siteId/manual-search/:id/csv | GET /api/sites/:siteId/manual-search/:id/csv | manual-search | 实现+组回归 |
| GET /api/sites/:siteId/manual-search/:id | GET /api/sites/:siteId/manual-search/:id | manual-search | 实现+组回归 |
| POST /api/sites/:siteId/manual-search/commit | POST /api/sites/:siteId/manual-search/commit | manual-search | 实现+组回归 |
| POST /api/sites/:siteId/manual-search/preview | POST /api/sites/:siteId/manual-search/preview | manual-search | 实现+组回归 |
| GET /api/sites/:siteId/manual-search/template | GET /api/sites/:siteId/manual-search/template | manual-search | 实现+组回归 |
| GET /api/sites/:siteId/manual-search | GET /api/sites/:siteId/manual-search | manual-search | 实现+组回归 |
| DELETE /api/sites/:siteId/mcp | DELETE /api/sites/:siteId/mcp | mcp | 实现+组回归 |
| GET /api/sites/:siteId/mcp | GET /api/sites/:siteId/mcp | mcp | 实现+组回归 |
| POST /api/sites/:siteId/mcp | POST /api/sites/:siteId/mcp | mcp | 实现+组回归 |
| GET /api/sites/:siteId/seo/conversions | GET /api/sites/:siteId/seo/conversions | providers-seo | 夹具/外部未联通 |
| POST /api/sites/:siteId/seo/scan | POST /api/sites/:siteId/seo/scan | providers-seo | 夹具/外部未联通 |
| GET /api/sites/:siteId/seo/scans | GET /api/sites/:siteId/seo/scans | providers-seo | 夹具/外部未联通 |
| POST /api/sites/:siteId/serp/check | POST /api/sites/:siteId/serp/check | providers-seo | 夹具/外部未联通 |
| GET /api/sites/:siteId/serp | GET /api/sites/:siteId/serp | providers-seo | 夹具/外部未联通 |
| POST /api/sites/:siteId/suggestions/:id/recheck | POST /api/sites/:siteId/suggestions/:id/recheck | external-ai | 夹具/外部未联通 |
| PATCH /api/sites/:siteId/suggestions/:id | PATCH /api/sites/:siteId/suggestions/:id | external-ai | 夹具/外部未联通 |
| GET /api/sites/:siteId/suggestions | GET /api/sites/:siteId/suggestions | external-ai | 夹具/外部未联通 |
| POST /api/sites/:siteId/suggestions | POST /api/sites/:siteId/suggestions | external-ai | 夹具/外部未联通 |
| GET /api/sso/wecom/callback | GET /api/sso/wecom/callback | sso | 夹具/外部未联通 |
| GET /api/sso/wecom/start | GET /api/sso/wecom/start | sso | 夹具/外部未联通 |
| GET /api/sso | GET /api/sso | sso | 夹具/外部未联通 |
| GET /api/tracker/config/:siteId | GET /api/tracker/config/:siteId | tracker-config | 实现+组回归 |
| POST /api/v1/experiments/:id/assign | POST /api/v1/experiments/:id/assign | analytics | 实现+组回归 |
| POST /api/v1/invites/:token/accept | POST /api/v1/invites/:token/accept | access | 实现+组回归 |
| POST /api/v1/invites/:token/register | POST /api/v1/invites/:token/register | access | 实现+组回归 |
| POST /api/v1/shares/:token | POST /api/v1/shares/:token | access | 实现+组回归 |
| POST /api/v1/sites/:siteId/alerts/:id/silence | POST /api/v1/sites/:siteId/alerts/:id/silence | operations | 实现+组回归 |
| DELETE /api/v1/sites/:siteId/alerts/:id | DELETE /api/v1/sites/:siteId/alerts/:id | operations | 实现+组回归 |
| GET /api/v1/sites/:siteId/alerts | GET /api/v1/sites/:siteId/alerts | operations | 实现+组回归 |
| POST /api/v1/sites/:siteId/alerts | POST /api/v1/sites/:siteId/alerts | operations | 实现+组回归 |
| GET /api/v1/sites/:siteId/analysis/features | GET /api/v1/sites/:siteId/analysis/features | analytics | 实现+组回归 |
| GET /api/v1/sites/:siteId/analysis | GET /api/v1/sites/:siteId/analysis | analytics | 实现+组回归 |
| DELETE /api/v1/sites/:siteId/annotations/:id | DELETE /api/v1/sites/:siteId/annotations/:id | annotations | 实现+组回归 |
| PATCH /api/v1/sites/:siteId/annotations/:id | PATCH /api/v1/sites/:siteId/annotations/:id | annotations | 实现+组回归 |
| GET /api/v1/sites/:siteId/annotations | GET /api/v1/sites/:siteId/annotations | annotations | 实现+组回归 |
| POST /api/v1/sites/:siteId/annotations | POST /api/v1/sites/:siteId/annotations | annotations | 实现+组回归 |
| GET /api/v1/sites/:siteId/audit | GET /api/v1/sites/:siteId/audit | operations | 实现+组回归 |
| GET /api/v1/sites/:siteId/bot-observations | GET /api/v1/sites/:siteId/bot-observations | jobs | 实现+组回归 |
| GET /api/v1/sites/:siteId/canonical | GET /api/v1/sites/:siteId/canonical | storage | 运行时差异 |
| POST /api/v1/sites/:siteId/canonical | POST /api/v1/sites/:siteId/canonical | storage | 运行时差异 |
| DELETE /api/v1/sites/:siteId/channels/:id | DELETE /api/v1/sites/:siteId/channels/:id | operations | 实现+组回归 |
| GET /api/v1/sites/:siteId/channels | GET /api/v1/sites/:siteId/channels | operations | 实现+组回归 |
| POST /api/v1/sites/:siteId/channels | POST /api/v1/sites/:siteId/channels | operations | 实现+组回归 |
| GET /api/v1/sites/:siteId/content/404.csv | GET /api/v1/sites/:siteId/content/404.csv | analytics | 实现+组回归 |
| GET /api/v1/sites/:siteId/content | GET /api/v1/sites/:siteId/content | analytics | 实现+组回归 |
| POST /api/v1/sites/:siteId/delete-visitor | POST /api/v1/sites/:siteId/delete-visitor | privacy | 实现+组回归 |
| GET /api/v1/sites/:siteId/event-properties | GET /api/v1/sites/:siteId/event-properties | analytics | 实现+组回归 |
| PATCH /api/v1/sites/:siteId/experiments/:id | PATCH /api/v1/sites/:siteId/experiments/:id | analytics | 实现+组回归 |
| GET /api/v1/sites/:siteId/experiments | GET /api/v1/sites/:siteId/experiments | analytics | 实现+组回归 |
| POST /api/v1/sites/:siteId/experiments | POST /api/v1/sites/:siteId/experiments | analytics | 实现+组回归 |
| GET /api/v1/sites/:siteId/exports/:id | GET /api/v1/sites/:siteId/exports/:id | exports | 实现+组回归 |
| GET /api/v1/sites/:siteId/exports | GET /api/v1/sites/:siteId/exports | exports | 实现+组回归 |
| POST /api/v1/sites/:siteId/exports | POST /api/v1/sites/:siteId/exports | exports | 实现+组回归 |
| GET /api/v1/sites/:siteId/funnels/:funnelId\|:id/analysis | GET /api/v1/sites/:siteId/funnels/:funnelId/analysis | analytics | 实现+组回归 |
| DELETE /api/v1/sites/:siteId/funnels/:funnelId\|:id | DELETE /api/v1/sites/:siteId/funnels/:id | analytics | 实现+组回归 |
| PUT /api/v1/sites/:siteId/funnels/:funnelId\|:id | PUT /api/v1/sites/:siteId/funnels/:id | analytics | 实现+组回归 |
| GET /api/v1/sites/:siteId/funnels | GET /api/v1/sites/:siteId/funnels | analytics | 实现+组回归 |
| POST /api/v1/sites/:siteId/funnels | POST /api/v1/sites/:siteId/funnels | analytics | 实现+组回归 |
| GET /api/v1/sites/:siteId/geography | GET /api/v1/sites/:siteId/geography | analytics | 实现+组回归 |
| DELETE /api/v1/sites/:siteId/goals/:id | DELETE /api/v1/sites/:siteId/goals/:id | analytics | 实现+组回归 |
| PUT /api/v1/sites/:siteId/goals/:id | PUT /api/v1/sites/:siteId/goals/:id | analytics | 实现+组回归 |
| GET /api/v1/sites/:siteId/goals | GET /api/v1/sites/:siteId/goals | analytics | 实现+组回归 |
| POST /api/v1/sites/:siteId/goals | POST /api/v1/sites/:siteId/goals | analytics | 实现+组回归 |
| GET /api/v1/sites/:siteId/heatmap | GET /api/v1/sites/:siteId/heatmap | analytics | 实现+组回归 |
| GET /api/v1/sites/:siteId/identities/:userKey/activity | GET /api/v1/sites/:siteId/identities/:userKey/activity | analytics | 实现+组回归 |
| GET /api/v1/sites/:siteId/identities | GET /api/v1/sites/:siteId/identities | analytics | 实现+组回归 |
| GET /api/v1/sites/:siteId/intake-status | GET /api/v1/sites/:siteId/intake-status | jobs | 实现+组回归 |
| POST /api/v1/sites/:siteId/invites | POST /api/v1/sites/:siteId/invites | access | 实现+组回归 |
| POST /api/v1/sites/:siteId/jobs/replay | POST /api/v1/sites/:siteId/jobs/replay | jobs | 实现+组回归 |
| GET /api/v1/sites/:siteId/jobs | GET /api/v1/sites/:siteId/jobs | jobs | 实现+组回归 |
| DELETE /api/v1/sites/:siteId/members/:userId | DELETE /api/v1/sites/:siteId/members/:userId | access | 实现+组回归 |
| PATCH /api/v1/sites/:siteId/members/:userId | PATCH /api/v1/sites/:siteId/members/:userId | access | 实现+组回归 |
| GET /api/v1/sites/:siteId/members | GET /api/v1/sites/:siteId/members | access | 实现+组回归 |
| GET /api/v1/sites/:siteId/notifications | GET /api/v1/sites/:siteId/notifications | operations | 实现+组回归 |
| GET /api/v1/sites/:siteId/pages/detail | GET /api/v1/sites/:siteId/pages/detail | analytics | 实现+组回归 |
| GET /api/v1/sites/:siteId/realtime/stream | GET /api/v1/sites/:siteId/realtime/stream | analytics | 实现+组回归 |
| GET /api/v1/sites/:siteId/realtime | GET /api/v1/sites/:siteId/realtime | analytics | 实现+组回归 |
| GET /api/v1/sites/:siteId/replay | GET /api/v1/sites/:siteId/replay | analytics | 实现+组回归 |
| GET /api/v1/sites/:siteId/reports/:id/run | GET /api/v1/sites/:siteId/reports/:id/run | operations | 实现+组回归 |
| DELETE /api/v1/sites/:siteId/reports/:id | DELETE /api/v1/sites/:siteId/reports/:id | operations | 实现+组回归 |
| PATCH /api/v1/sites/:siteId/reports/:id | PATCH /api/v1/sites/:siteId/reports/:id | operations | 实现+组回归 |
| GET /api/v1/sites/:siteId/reports | GET /api/v1/sites/:siteId/reports | operations | 实现+组回归 |
| POST /api/v1/sites/:siteId/reports | POST /api/v1/sites/:siteId/reports | operations | 实现+组回归 |
| PATCH /api/v1/sites/:siteId/retention | PATCH /api/v1/sites/:siteId/retention | privacy | 实现+组回归 |
| GET /api/v1/sites/:siteId/revenue | GET /api/v1/sites/:siteId/revenue | analytics | 实现+组回归 |
| DELETE /api/v1/sites/:siteId/schedules/:id | DELETE /api/v1/sites/:siteId/schedules/:id | operations | 实现+组回归 |
| GET /api/v1/sites/:siteId/schedules | GET /api/v1/sites/:siteId/schedules | operations | 实现+组回归 |
| POST /api/v1/sites/:siteId/schedules | POST /api/v1/sites/:siteId/schedules | operations | 实现+组回归 |
| GET /api/v1/sites/:siteId/self-host-diagnostics/export | GET /api/v1/sites/:siteId/self-host-diagnostics/export | diagnostics | 实现+组回归 |
| GET /api/v1/sites/:siteId/self-host-diagnostics | GET /api/v1/sites/:siteId/self-host-diagnostics | diagnostics | 实现+组回归 |
| DELETE /api/v1/sites/:siteId/shares/:id | DELETE /api/v1/sites/:siteId/shares/:id | access | 实现+组回归 |
| GET /api/v1/sites/:siteId/shares | GET /api/v1/sites/:siteId/shares | access | 实现+组回归 |
| POST /api/v1/sites/:siteId/shares | POST /api/v1/sites/:siteId/shares | access | 实现+组回归 |
| GET /api/v1/sites/:siteId/stats | GET /api/v1/sites/:siteId/stats | analytics | 实现+组回归 |
| POST /api/v1/sites/:siteId/storage/history/:id/backup | POST /api/v1/sites/:siteId/storage/history/:id/backup | history | 实现+组回归 |
| POST /api/v1/sites/:siteId/storage/history/:id/restore | POST /api/v1/sites/:siteId/storage/history/:id/restore | history | 实现+组回归 |
| POST /api/v1/sites/:siteId/storage/history/capture | POST /api/v1/sites/:siteId/storage/history/capture | history | 实现+组回归 |
| GET /api/v1/sites/:siteId/storage/history | GET /api/v1/sites/:siteId/storage/history | history | 实现+组回归 |
| POST /api/v1/sites/:siteId/storage/replay | POST /api/v1/sites/:siteId/storage/replay | storage | 运行时差异 |
| GET /api/v1/sites/:siteId/storage | GET /api/v1/sites/:siteId/storage | storage | 运行时差异 |
| PUT /api/v1/sites/:siteId/storage | PUT /api/v1/sites/:siteId/storage | storage | 运行时差异 |
| DELETE /api/v1/sites/:siteId/tokens/:id | DELETE /api/v1/sites/:siteId/tokens/:id | access | 实现+组回归 |
| GET /api/v1/sites/:siteId/tokens | GET /api/v1/sites/:siteId/tokens | access | 实现+组回归 |
| POST /api/v1/sites/:siteId/tokens | POST /api/v1/sites/:siteId/tokens | access | 实现+组回归 |
| GET /api/v1/sites/:siteId/usage | GET /api/v1/sites/:siteId/usage | operations | 实现+组回归 |
| GET /api/v1/sites/:siteId/users/:userId/paths | GET /api/v1/sites/:siteId/users/:userId/paths | analytics | 实现+组回归 |
| POST /api/v1/sites/:siteId/write-key | POST /api/v1/sites/:siteId/write-key | sites | 实现+组回归 |
| GET /api/v1/sites/:siteId | GET /api/v1/sites/:siteId | sites | 实现+组回归 |
| PATCH /api/v1/sites/:siteId | PATCH /api/v1/sites/:siteId | sites | 实现+组回归 |
| GET /api/v1/sites | GET /api/v1/sites | sites | 实现+组回归 |
| POST /api/v1/sites | POST /api/v1/sites | sites | 实现+组回归 |
| GET /embed/chart | GET /embed/chart | access | 实现+组回归 |
| GET /healthz | GET /healthz | health | 实现+组回归 |
| GET /tracker-consent.js | Nginx静态/SPA | static | 实现+组回归 |
| GET /tracker-heatmap.js | Nginx静态/SPA | static | 实现+组回归 |
| GET /tracker-min.js | Nginx静态/SPA | static | 实现+组回归 |
| GET /tracker-replay.js | Nginx静态/SPA | static | 实现+组回归 |
| GET /tracker-vitals.js | Nginx静态/SPA | static | 实现+组回归 |
| GET /tracker.js | Nginx静态/SPA | static | 实现+组回归 |
| GET /tracker.LICENSE.txt | Nginx静态/SPA | static | 实现+组回归 |

数据库分别实测，测试次数与源码绑定：[验证记录](PHP_VALIDATION_20261015.md)、[逐套件结果](test-evidence/php-20261015/suite-results.json)。
