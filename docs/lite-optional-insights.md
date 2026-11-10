# Lite 手动基础 SEO 与 BYOK AI

Lite 提供基础手动 SEO 和 BYOK AI。没有抓站、模型权重、自动后台 AI、搜索排名接口或内置账户。

## 基础 SEO：仅已观察路径证据

`GET /api/sites/:siteId/seo/basic?from=ISO&to=ISO` 需要站点读取权限。返回当前授权聚合中的最多100个已观察路径、PV、路径长度/查询参数观察和覆盖状态。超过100项明确 `truncated`。不发送网络请求，不接受抓取 URL，不评价 title、robots、canonical、索引或排名；无数据保持空状态，流量不能证明 SEO 质量。

### 手动粘贴页面 HTML 审计

`POST /api/sites/:siteId/seo/basic` 接受严格 `{url,html}`，需要站点读取权限。URL 必须是此站点允许的 HTTP/HTTPS origin，不接受凭据。整个请求以及 HTML UTF-8 内容都限128KiB；拒绝明显非HTML、截断标签/注释/原始文本元素、NUL及未知字段。

仅使用本地 Cheerio/parse5 解析用户提供的初始 HTML，**不抓取 URL、不执行脚本**。证据包括 title/meta description、canonical 声明、h1、robots/noindex、图片缺失/空 alt。canonical 根据提供页面及安全 base 解析，非HTTP或含凭据的声明标 unsafe，不输出危险 URL；跨站声明只作复核线索。空 alt 可能适合装饰图片，不能直接视作错误。最多返回20项h1/robots/canonical，文本也有有限长度；完整数量与 `truncated` 明示，不静默当完整结果。

响应 `provided_html_audit` 不证明实际服务器返回、HTTP头、robots.txt、JavaScript渲染结果、可索引性、排名或真实外网部署。HTML仅应展示为文本，不能把输入渲染到浏览器DOM。

## 手动 AI：默认关闭，管理员明确开启

管理员使用 `/api/sites/:siteId/ai/manual/config` 的 GET/PUT。PUT 接受 `enabled`、用户自己的 `apiKey`、`model`、`dailyRequests`、`maxOutputTokens`。不接受 endpoint、代理、local model 或后台调度字段。生产目标固定为 `https://api.openai.com/v1/chat/completions`，保留 TLS、公共地址校验及官方 origin 限制。开发测试通过构造参数注入合成 transport；不能通过 HTTP 配置本地目标。测试没有使用真实外部凭据或发起付费调用。

BYOK 使用站点绑定 AAD 的 AES-256-GCM 加密存入 SQLite 内部配置；主密钥为独立保护的 `master.v1.key`（32字节、0600、单链接普通文件）。任何响应均不包含 key 或加密 envelope；不要丢失独立密钥备份。普通站点公开配置过滤 `lite_*` 内部字段。

管理员手动 POST `/api/sites/:siteId/ai/manual`，提供 `from`、`to`、`question` 和显式 `allowExternal:true`。只有完整覆盖的授权聚合 totals 与用户自己输入的问题发送给提供者，不发送访客、页面ID、事件正文或路径列表。用户输入的问题本身会发送外部，不要填写个人数据或秘密。分析是观察性解释，不证明因果。

## 预算与失败语义

- 每站每天 UTC 默认5次、可配置1–100次；整个 Lite 实例每天最多100次。
- 单问题最多2000字符，最终输入最多12000 bytes；输出配置16–1024 tokens，默认512；响应最多65536 bytes、答案最多12000字符。
- 单实例一次仅一个手动调用在途，忙时429。提供者请求配置10秒超时；DNS阶段另有最多5秒约束，模块另设15秒硬截止。合成 hung transport 用测试专用20毫秒截止验证503及额度耗用；测试截止参数只允许与注入 transport 一起提供，生产HTTP配置不能设置。
- 预算单位是**尝试请求次数**，不是精确 tokens 或任何货币费用。持久事务先保留额度再调用；超时、提供者失败、无效响应、权限/隐私变化后的拒绝也耗用额度，不退款。更换 key 或关闭重开不会重置当天额度。
- 这是保守费用限制，不是准确账单；实际付费价格和模型可用性由用户的提供者账户决定。Lite 首版拒绝站点删除，实例额度汇总全部站点；未来支持删除须先提供独立实例账本，不能通过删除配置重置额度。恢复旧备份无法证明当天完整账本，因此恢复目标持久写入全实例 UTC 当日阻断标记：当天所有手动 AI 请求拒绝429，重新启用、更换 key、新建站点也不能绕过；下一 UTC 日自动解除。状态摘要显示 restoreBudgetBlockedDay；损坏、符号链接或多链接标记失败关闭，不自动删除标记。

调用前后重新验证管理员权限、配置版本、站点隐私 epoch 及精确聚合 generation。调用期间发生删除或配置变化时，返回409，不展示旧答案。普通后续采集改变 generation 时同样拒绝旧答案。传出与返回证据包含 generation/epoch、UV/会话支持状态和 limitations；答案明确 answerVerified:false，只是未核验模型解释，不是事实权威。提供者失败503、额度耗尽429、未启用/覆盖不完整409；错误不回传提供者正文或凭据。
