# 外部集成与证据链验收

本文件描述已执行的应用验收，不能替代生产账号验证。所有功能免费；外部提供商计费由部署者承担。没有创建或索取生产凭证，没有外网部署。

## 实际执行

在当前私有仓库功能分支执行：

```sh
npm run typecheck
npm run db:migrate
./node_modules/.bin/eslint src/server/external.ts src/server/external-worker.ts src/server/outbound.ts src/server/geoip.ts src/server/geoip-settings.ts src/server/keyring.ts src/server/sso.ts tests/unit/external*.test.ts tests/integration/external*.test.ts
TEST_DATABASE_URL=postgresql://baize_dev@127.0.0.1:5432/baize_dev ./node_modules/.bin/vitest run tests/unit/external*.test.ts tests/integration/external*.test.ts
```

结果：类型检查与上述 lint 通过；6 个测试文件、26 个测试通过（12 单元 + 9 外部集成 + 3 SSO/密钥环/GeoIP配置 + 1真实告警链 + 1真实漏斗建议链），最后执行时间 2026-10-10 06:04 UTC。PostgreSQL 是真实运行的数据库；Google、SERP、LLM、企业微信返回值由显式注入 transport 的测试夹具提供，未使用生产账号。SSO/密钥轮换测试创建独立 PostgreSQL 测试库并在结束后删除，避免全局密钥状态影响其他测试。

单元测试中的本地 HTTP 服务是真实 Node HTTP 服务，用于验证 DNS 固定、超时、大小上限、重定向与本地模型例外，**不是实际 Ollama 推理验收**。

## 功能与边界

| 项目 | 已实现与实际测试 | 未实测或剩余边界 |
| --- | --- | --- |
| F48 GA4 | Google OAuth、Data API 分页聚合导入、事务更新、来源/覆盖日/不可恢复字段说明；真实 PG 写入测试 | 真实 Google 账号、配额、历史覆盖范围未实测。仅 PV/UV/会话/来源聚合，不能恢复访客身份、原始事件或历史漏斗；不同来源 UV 不可相加。图表验收由前端记录。 |
| F51 GSC | PKCE、用户和浏览器会话绑定、一次性 state、刷新 token 加密、Search Analytics 分页、日聚合存储、显式 opt-in 每日重拉最近七个完整报告日、2–3 天延迟声明 | Google 站点验证、真实搜索属性、真实配额未实测；查询词不能关联到具体访客或订单。 |
| F52 百度 | 明确返回 `unsupported-unverified`，没有编造接口或伪造数据 | 缺少已核验的官方流量/关键词 API 文档；这项不能记为完成或已集成。 |
| F53 SEO | 授权站点域名范围；HTTPS；robots 分组、Allow/Disallow、通配符和更具体规则；每两秒一次、最多 30 页/1000 URL；缺 title/description/h1/alt/canonical/OG/viewport、重复 title；每日持久任务；SEO 建议复检重新爬取并保存新 scan_id | 广泛真实站点、复杂 robots 百分号编码等互操作性、大站完整覆盖未实测。默认安全限制不会被本地模型例外绕过。测试网站 HTML 来自注入夹具。 |
| F54 SERP | SerpAPI/DataForSEO 可插拔适配器、加密自备凭证、每日关键词任务、排名历史、`largeChange` 标记；治理模块真实PG最新2→15排名触发持久SERP告警、旧历史排除/小时去重测试通过 | 真实付费账户、提供商计费/排名口径未实测。告警渠道交付由治理模块独立验收，不以返回布尔标记冒充送达。 |
| F55 搜索转化 | GSC 页面点击/展示/加权排名与自然搜索会话入口页/目标转化聚合对照；收入按币种分开，PV/收入说明为事件页面口径 | GSC 使用提供商报告日，站内使用站点时区，可能有日期口径差异；不宣称查询词→个人订单的链接或优化因果效果。 |
| F56 BYOK | AES-256-GCM、随机 nonce、版本化独立受限密钥文件、原子文件保存+fsync 后数据库激活、保留旧版本、重启/旧备份解密；base/full completion URL 兼容；超时/响应上限/DNS 固定/每次重定向检查 | 真实外部模型与真实 Ollama 推理未实测。禁用不会撤回已经发送的请求。模型 URL 不允许凭证/query/fragment，密钥单独加密保存。 |
| F57 日报 | 按站点时区昨日聚合；显式 enabled+dailyReport；维护任务调用；持久日任务认领、租约、generation、五次上限、指数退避；真实计时器重入+PG 验证失败退避后成功一次 | 文本质量、提供商真实 token 账单未实测。缺少 usage 或失败时保守计入预算上限，接口明确说明不等于实测账单。 |
| F58 异常候选归因 | F38→F58 自动绑定，以及前一期同天数/日报级候选解释；联合渠道×页面×设备精确集合在服务端计数后只输出汇总，不向模型输出标识符 | 候选是观察性相关，不能证明因果。已直接读取 F38 的真实 traffic notification_jobs：显式 opt-in、按通知UUID与固定触发日幂等、失败指数退避；证据保存原告警快照与同一完整小时对28个历史小时的渠道×页面×设备联合变化（PV/精确UV），仅访问 stats_hourly，写审计关联。真实 collect→worker→两连续小时告警→并发任务/失败重试→immutable evidence 测试通过。 |
| F59 建议复检 | 真实 `/api/collect` 小写 lcp→脱敏持久化→Worker 聚合→慢页规则建议；真实漏斗25→5去重流失输入；共享阈值；小样本明确证据不足；按受影响数量×观测严重度代理排序并存优先级依据，不宣称预测或实测收益；不可修改事实快照、共享状态机、实施时间、SEO 新爬取、同口径前后值、干扰因素；本地 evidence 不调用 AI、token=0 | 模型建议质量和整改真实收益未实测；排序仅为有公开公式和事实输入的优先级代理，规则候选不是实测预期收益。verified 表示完成观测复检，不是因果证明。 |
| F60 问数 | OpenAI-compatible tool orchestration、严格只读 DSL、授权站点在服务端绑定、时间范围/指标/维度/数量上限；仅读取 stats_daily 预聚合和权限/状态元数据；不接收 SQL、不发送访客集合/原始事件；联合维度、转化率分子分母、跨组 UV 不相加 | 部分不保留的联合口径返回 unsupported。每日盐模式跨日 UV/留存不支持。真实模型问数稳定性未实测。 |
| F63 GeoIP | 实例管理员 cookie-only GET/PUT/refresh 配置；许可加密保存，状态仅指纹不返明文；并发部分更新保留密钥；startup优先DB并内存reload；官方 MaxMind 下载端点、独立官方 SHA256 校验、TLS 保持校验、归档路径限制、mmdb 验证；缺少账户/许可或失败时 unknown，内存查询接口供采集使用 | 当前没有 MaxMind 凭证；未下载或验证真实 GeoLite2 数据库内容，不伪造地域。测试以真实本地tar归档+注入官方响应检验SHA成功后仍必须通过mmdb验证，错误artifact不能覆盖旧文件。 |
| P2 Ollama | 仅实例管理员登记准确的 localhost/私有 IP origin；元数据/link-local 禁止；例外仅传给模型请求，不传爬虫、通知或其他出口 | 本地 HTTP 安全传输已实测；当前无 Ollama 可执行文件/镜像；模型registry不在restricted package_managers快照允许域名内，未修改策略或绕过代理，真实模型未安装/推理。 |
| P2 WordPress | 官方 WordPress 6.9.4/PHP 8.3.31/MariaDB 实际 localhost 栈；真实UI安装WordPress→上传ZIP安装当前插件→启用/保存配置/停用/重启；真实匿名Chromium tracker→HTTP202→独立PG→worker小时聚合与API PV一致；同意前零身份零采集、撤回清身份停止、关闭同意自动采集、管理员不采集 | 更多主题、缓存插件、CMP组合与WordPress多站点未验证。本轮只绑定localhost，未公网部署；实际报告 `docs/test-evidence/wordpress-actual-runtime.json`，可复用运行器 `scripts/wordpress-acceptance.ts`。 |
| P2 企业微信 SSO | QRConnect→官方 auth/getuserinfo；浏览器绑定一次性 state；加密企业 secret；管理员显式映射到已有账号，不自动创建用户/管理员；真实 PG+注入官方响应形状测试 | 真实企业、授权 IP/回调域名、扫码登录未实测。开发环境不为测试而外网部署。 |

## 持久配置与并发

`PUT /api/sites/:siteId/external` 的首次配置需要密钥。之后可省略 `secret` 保留已加密密钥，`settings` 为部分更新。每连接的数据库互斥与行锁避免两个更新丢失各自的字段或密钥；Google 同 clientId 更新 clientSecret 保留 refreshToken，改变 clientId 后要求重新授权。OAuth 回调以旧加密数据/设置比较拒绝覆盖期间的新配置；导入在提交前再次检查配置。

外部任务的自动开关默认关闭：站点 config `seoAutoScan`、Google settings `dailyGsc`、SERP settings `daily/keywords`、AI settings `enabled/dailyReport/automaticAnomaly`。失败任务显示 attempts/next_attempt_at，可由管理员提前请求重试，但仍受五次上限约束。提供商只读请求采用至少一次语义；进程在提供商完成后、记录完成前崩溃可能导致重试与再次计费，不能宣称外部 API 恰好一次。

主密钥位于 `KEYS_DIR` 的 `master.vN.key`，文件 0600、目录 0700。数据库备份不包含这些文件；必须单独密封保留所有仍可能被历史备份引用的版本。不能把单纯更换镜像或恢复数据库等同完整密钥恢复。

## 可自主继续与真实外部验证

应用 E2E、Docker 安装/升级/备份/恢复、GA4 虚线历史图与 SERP 告警渠道交付以各负责模块的实际测试记录为准。这里的 26 个测试不是整个应用测试，也不是这些功能已全部验收的声明。F38 直接绑定与 F59 漏斗建议已在本文件所属真实 PG pipeline 验收；模型仅使用明确注入的接口响应，不冒充真实推理。

真实外部服务验证留待部署者已有的账号和安全配置：Google OAuth/已验证站点/GA4 属性、SERP 账号、LLM 或本地 Ollama、MaxMind 账户与许可、企业微信应用与已授权回调。不得在聊天粘贴凭证，不自动购买服务或部署公开回调。

## 新增实测链路

`tests/integration/external-alert.test.ts` 不直接插入通知：合法 UUID 的事件实际送入 `/api/collect`，过去28个同小时各1PV、两连续小时各20PV，经worker重算后调用带可注入时间的真实 `evaluateAlerts`，确认第一次不触发、第二次创建告警。关闭自动AI时模型零调用；开启后并发tick仅认领一次，失败后有退避，再次并发重试完成；新增UV告警复用精确集合计数。存储的 `alertTrigger.notificationId`、原始快照、`alertWindow` 与审计串联，模型请求不含任何原始访客UUID。

`tests/integration/external-suggestions.test.ts` 用实际采集与worker构建25人进入/5人完成漏斗及25个小写lcp=4500样本。模型收到的事实快照只有漏斗计数和聚合指标；建议含20人流失证据、性能候选、公开优先级公式与非因果/非实测收益说明。每日盐模式跨日漏斗返回unsupported，不冒充跨日识别。

## WordPress 实际本地运行

2026-10-10 06:39:52 UTC 执行成功，EXIT0、29.9秒：

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium \
TEST_DATABASE_URL=postgresql://baize_dev@127.0.0.1:5432/baize_dev \
./node_modules/.bin/tsx scripts/wordpress-acceptance.ts
```

官方镜像digest、版本和逐项结果见JSON报告；截图见 `docs/screenshots/wordpress-local-acceptance.png`。同意后实际WordPress网页加载本实例构建的tracker.js并发送真实请求，不模拟钩子、采集接口或数据存储。测试使用独立临时app数据库与localhost 3280/3290；原生3000、开发PG业务数据和其他任务栈未更改。结束后清理自己容器/网络/卷/测试DB/临时凭据，之后仅删除本任务拉取的WordPress/MariaDB镜像释放空间。

早期失败如实说明：第一次并发镜像pull在VFS盘满时失败，并影响同时进行的ops回滚演练；已暂停，ops清理旧缓存并完整重跑EXIT0后，再顺序拉取。初版测试使用Docker internal网络无法发布localhost端口；已改独立bridge+localhost绑定并禁用WordPress外部HTTP。初版对201响应/默认未安装Playwright浏览器的假设已纠正，使用现成Chromium。实际WordPress UI揭示宿主私有0700目录/0600PHP文件不能被www-data读取，故改真实UI ZIP上传安装而未放宽宿主权限。最终当前实现完整通过，早期失败不算通过。

## 外部错误语义增量（当前工作区，2026-10-10 07:01 UTC）

`src/server/external-errors.ts` 定义稳定机器代码与固定中文公开消息，供中英文界面映射。配置无效为400、外连安全目标拒绝403、未启用/尚未配置/聚合待完成409、上下文边界413、预算不足429、提供商失败/响应无效502、超时504。原始网络错误与模型响应不得作为公开错误消息或暴露密钥；连接器模拟测试不算真实外部账号验证。

实际运行所属文件 ESLint、全仓 `npm run typecheck` 均通过；以下显式真实PG与模拟外部传输回归于07:01:56执行，7文件27测试通过、0失败、0跳过（5.33秒），含新增固定错误契约用例。此增量不属于前述 b56b7e9 的148用例索引快照。

```sh
TEST_DATABASE_URL=postgresql://baize_dev@127.0.0.1:5432/baize_dev ./node_modules/.bin/vitest run tests/unit/external.test.ts tests/unit/external-errors.test.ts tests/unit/external-geoip.test.ts tests/integration/external.test.ts tests/integration/external-alert.test.ts tests/integration/external-suggestions.test.ts tests/integration/external-sso-keyring.test.ts
```

全应用错误处理及英文界面映射由集成负责人/前端负责；此处不将尚未运行的全应用浏览器翻译验收算作通过。

2026-10-10 normalized-fact regression follow-up: the first affected old compatibility run failed4/12 at10:25:05 (F59 funnel reads/F38 UV JSON reads, unpublished fixture backing and a test deleting protected quota). Exact published relational reads now supply F59 summaries and aligned UTC-hour distinct UV; assertions PV20/UV20/baseline1/calls3 and actual25→5 funnel remain unchanged. Compatibility passed12/12 at10:30:45; corrected isolated combined8-file group passed31/31 at10:37:57. Initial outer URL search_path isolation failure and a later concurrent worker syntax import block are preserved in ACCEPTANCE_AI_QUESTION_EVIDENCE.md. Final owned AI/ledger/schema retry passed20/20 at10:42:55 after token overflow handling. Real external Google/model/SERP accounts remain untested; tests explicitly inject provider transport while exercising actual PG/auth/collector/worker/schedules/evidence.
