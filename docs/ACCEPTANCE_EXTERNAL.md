# 外部集成与证据链验收

本文件描述已执行的应用验收，不能替代生产账号验证。所有功能免费；外部提供商计费由部署者承担。没有创建或索取生产凭证，没有外网部署。

## 实际执行

在当前私有仓库功能分支执行：

```sh
npm run typecheck
./node_modules/.bin/eslint src/server/external.ts src/server/external-worker.ts src/server/outbound.ts src/server/geoip.ts src/server/keyring.ts src/server/sso.ts tests/unit/external.test.ts tests/integration/external*.ts
TEST_DATABASE_URL=postgresql://baize_dev@127.0.0.1:5432/baize_dev ./node_modules/.bin/vitest run tests/unit/external.test.ts tests/integration/external.test.ts tests/integration/external-sso-keyring.test.ts
```

结果：类型检查与上述 lint 通过；3 个测试文件、20 个测试通过（9 单元 + 9 集成 + 2 SSO/密钥环）。PostgreSQL 是真实运行的数据库；Google、SERP、LLM、企业微信返回值由显式注入 transport 的测试夹具提供，未使用生产账号。SSO/密钥轮换测试创建独立 PostgreSQL 测试库并在结束后删除，避免全局密钥状态影响其他测试。

单元测试中的本地 HTTP 服务是真实 Node HTTP 服务，用于验证 DNS 固定、超时、大小上限、重定向与本地模型例外，**不是实际 Ollama 推理验收**。

## 功能与边界

| 项目 | 已实现与实际测试 | 未实测或剩余边界 |
| --- | --- | --- |
| F48 GA4 | Google OAuth、Data API 分页聚合导入、事务更新、来源/覆盖日/不可恢复字段说明；真实 PG 写入测试 | 真实 Google 账号、配额、历史覆盖范围未实测。仅 PV/UV/会话/来源聚合，不能恢复访客身份、原始事件或历史漏斗；不同来源 UV 不可相加。图表验收由前端记录。 |
| F51 GSC | PKCE、用户和浏览器会话绑定、一次性 state、刷新 token 加密、Search Analytics 分页、日聚合存储、显式 opt-in 每日重拉最近七个完整报告日、2–3 天延迟声明 | Google 站点验证、真实搜索属性、真实配额未实测；查询词不能关联到具体访客或订单。 |
| F52 百度 | 明确返回 `unsupported-unverified`，没有编造接口或伪造数据 | 缺少已核验的官方流量/关键词 API 文档；这项不能记为完成或已集成。 |
| F53 SEO | 授权站点域名范围；HTTPS；robots 分组、Allow/Disallow、通配符和更具体规则；每两秒一次、最多 30 页/1000 URL；缺 title/description/h1/alt/canonical/OG/viewport、重复 title；每日持久任务；SEO 建议复检重新爬取并保存新 scan_id | 广泛真实站点、复杂 robots 百分号编码等互操作性、大站完整覆盖未实测。默认安全限制不会被本地模型例外绕过。测试网站 HTML 来自注入夹具。 |
| F54 SERP | SerpAPI/DataForSEO 可插拔适配器、加密自备凭证、每日关键词任务、排名历史、`largeChange` 标记 | 真实付费账户、提供商计费/排名口径未实测。告警渠道交付由治理模块独立验收，不以返回布尔标记冒充送达。 |
| F55 搜索转化 | GSC 页面点击/展示/加权排名与自然搜索会话入口页/目标转化聚合对照；收入按币种分开，PV/收入说明为事件页面口径 | GSC 使用提供商报告日，站内使用站点时区，可能有日期口径差异；不宣称查询词→个人订单的链接或优化因果效果。 |
| F56 BYOK | AES-256-GCM、随机 nonce、版本化独立受限密钥文件、原子文件保存+fsync 后数据库激活、保留旧版本、重启/旧备份解密；base/full completion URL 兼容；超时/响应上限/DNS 固定/每次重定向检查 | 真实外部模型与真实 Ollama 推理未实测。禁用不会撤回已经发送的请求。模型 URL 不允许凭证/query/fragment，密钥单独加密保存。 |
| F57 日报 | 按站点时区昨日聚合；显式 enabled+dailyReport；维护任务调用；持久日任务认领、租约、generation、五次上限、指数退避；真实计时器重入+PG 验证失败退避后成功一次 | 文本质量、提供商真实 token 账单未实测。缺少 usage 或失败时保守计入预算上限，接口明确说明不等于实测账单。 |
| F58 异常候选归因 | 前一期相同天数对照，渠道/页面/设备绝对变化排序；显式 automaticAnomaly 允许日报级异常候选解释；手动 anomaly 同样可调用 | 候选是观察性相关，不能证明因果。F38 告警触发记录的直接绑定由告警模块单独记录，不将独立每日检测等同该绑定。 |
| F59 建议复检 | 真实 `/api/collect` 小写 lcp→脱敏持久化→Worker 聚合→慢页规则建议；共享阈值；小样本明确证据不足；不可修改事实快照、共享状态机、实施时间、SEO 新爬取、同口径前后值、干扰因素；本地 evidence 不调用 AI、token=0 | 模型建议质量与预期收益排序未做真实模型实测；规则候选不是实测预期收益。verified 表示完成观测复检，不是因果证明。 |
| F60 问数 | OpenAI-compatible tool orchestration、严格只读 DSL、授权站点在服务端绑定、时间范围/指标/维度/数量上限；仅读取 stats_daily 预聚合和权限/状态元数据；不接收 SQL、不发送访客集合/原始事件；联合维度、转化率分子分母、跨组 UV 不相加 | 部分不保留的联合口径返回 unsupported。每日盐模式跨日 UV/留存不支持。真实模型问数稳定性未实测。 |
| F63 GeoIP | 官方 MaxMind 下载端点、独立官方 SHA256 校验、TLS 保持校验、归档路径限制、mmdb 验证；缺少账户/许可或失败时 unknown，内存查询接口供采集使用 | 当前没有 MaxMind 凭证；未下载或验证真实 GeoLite2 数据库内容，不伪造地域。 |
| P2 Ollama | 仅实例管理员登记准确的 localhost/私有 IP origin；元数据/link-local 禁止；例外仅传给模型请求，不传爬虫、通知或其他出口 | 本地 HTTP 安全传输已实测；真实 Ollama 模型未安装/推理。 |
| P2 企业微信 SSO | QRConnect→官方 auth/getuserinfo；浏览器绑定一次性 state；加密企业 secret；管理员显式映射到已有账号，不自动创建用户/管理员；真实 PG+注入官方响应形状测试 | 真实企业、授权 IP/回调域名、扫码登录未实测。开发环境不为测试而外网部署。 |

## 持久配置与并发

`PUT /api/sites/:siteId/external` 的首次配置需要密钥。之后可省略 `secret` 保留已加密密钥，`settings` 为部分更新。每连接的数据库互斥与行锁避免两个更新丢失各自的字段或密钥；Google 同 clientId 更新 clientSecret 保留 refreshToken，改变 clientId 后要求重新授权。OAuth 回调以旧加密数据/设置比较拒绝覆盖期间的新配置；导入在提交前再次检查配置。

外部任务的自动开关默认关闭：站点 config `seoAutoScan`、Google settings `dailyGsc`、SERP settings `daily/keywords`、AI settings `enabled/dailyReport/automaticAnomaly`。失败任务显示 attempts/next_attempt_at，可由管理员提前请求重试，但仍受五次上限约束。提供商只读请求采用至少一次语义；进程在提供商完成后、记录完成前崩溃可能导致重试与再次计费，不能宣称外部 API 恰好一次。

主密钥位于 `KEYS_DIR` 的 `master.vN.key`，文件 0600、目录 0700。数据库备份不包含这些文件；必须单独密封保留所有仍可能被历史备份引用的版本。不能把单纯更换镜像或恢复数据库等同完整密钥恢复。

## 可自主继续与真实外部验证

应用 E2E、Docker 安装/升级/备份/恢复、GA4 虚线历史图、SERP 告警交付和 F38 绑定以各负责模块的实际测试记录为准。这里的 20 个测试不是整个应用测试，也不是这些功能已全部验收的声明。

真实外部服务验证留待部署者已有的账号和安全配置：Google OAuth/已验证站点/GA4 属性、SERP 账号、LLM 或本地 Ollama、MaxMind 账户与许可、企业微信应用与已授权回调。不得在聊天粘贴凭证，不自动购买服务或部署公开回调。
