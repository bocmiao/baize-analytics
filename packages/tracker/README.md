# 白泽独立追踪器（MIT）

核心脚本通过第一方上下文写 `_baize_uid`，不使用 localStorage 恢复标识。站点远端配置获取成功前不采集；每日盐模式不写 Cookie。DNT、webdriver、默认 iframe、预渲染均不采集。

```html
<script async src="/tracker.js" data-site-id="YOUR_SITE_ID" data-api-host="https://analytics.example" data-consent-required="true"></script>
```

`data-website-id` 是兼容别名。`baize.grantConsent()` 后开始采集，`revokeConsent()` 停止并清队列/Cookie。属性 boolean/string/finite number 最多 20 个。`data-before-send` 指向全局清洗函数，返回 null 排除事件。表单只在 `data-form="true"` 且表单 `data-baize-form` 时记录 id/action，不采集字段值。

Web Vitals 官方 attribution、rrweb 回放和匿名网格位置热图分别放在独立脚本；回放和热图必须同时由站点配置显式启用并获得同意。回放默认遮罩所有文本与输入，阻断私密元素、iframe、canvas、video。PV 不采样。滚动深度使用页面实例初始文档高度。

每个 SPA 页面实例有独立 UUIDv7 page_id；心跳保留 interval_start/end 与 visible_ms。事件 ID 和序列化批次在 fetch 重试时保持不变，指数退避最多重试三次；失败只 debug，不影响宿主。sendBeacon 返回 true 仅表示浏览器排队，不证明 202 或服务器持久化；卸载时不存在可靠送达保证。

小程序 SDK 使用注入的 wx.request 兼容传输，显式同意前无身份及队列，不保存到平台存储；调用者负责提供 Web Crypto 支持（UUIDv7 需要 crypto.getRandomValues）。

回放额外递归移除全部 DOM 属性、URL 与任意字符串元数据，只保留白名单 HTML 标签、文档兼容模式和已遮罩文本；这是保守的结构回放，外链样式与图片属性不会重现。`replay_seq` 按页面实例单调递增。撤回同意只发送独立的最小 consent 审计事件（尽力发送），不会将待发行为队列混入撤回记录。

极简变体不含滚动/点击/表单自动采集；仍提供手动事件 API、PV、SPA 和可见心跳。主脚本/极简脚本均强制 gzip ≤5KB，rrweb 等扩展不计入核心预算。内存事件队列最多 1000，正常批次同时请求最多 4；达到容量丢弃后续事件保护宿主页。

小程序无 Web Crypto 时，可通过 `createMiniProgramTracker` 第四参数注入平台支持的安全 UUIDv7 生成器；不得使用 Math.random 生成身份。小程序传输失败保留原批次（含 sent_at），再次 flush 原样发送。真实微信账号、设备及 SDK 兼容性未实测。

为保护宿主页和采集 API，单事件序列化上限为 128000 个字符；超大完整回放快照会被丢弃，页面可能没有可播放回放，应通过减少 DOM 内容、降低回放采样解决。批次按 UTF-8 字节分割在 900000 字节以内，敏感清洗钩子返回循环引用时丢弃事件，不向宿主页抛异常。字符串属性最多 2048 字符。

每日盐隐私模式禁止 `identify`，该调用在构造事件或生成 ID 前直接返回；事件属性中的已知稳定身份字段（user_id、distinct_id、identity、email、phone 等）会移除，清洗钩子也不能重新注入这些字段。小程序 SDK 同样执行该规则。自定义字段仍需调用方避免传入个人数据或伪装在其他字段中的身份；字段过滤不能证明任意业务字符串都是匿名的。

核心脚本从站点配置读取 replay/heatmap/vitals，获得所需同意后才从采集服务按需加载对应独立模块；无需增加多个嵌入标签。重复加载模块或主脚本会被阻止，不会重复注册采集。

站点要求同意且未自行提供同意 UI 时，在核心脚本之后添加 `<script src="/tracker-consent.js"></script>`。独立中文组件在远端配置完成后显示同意/拒绝按钮；点击前不会生成访客 ID 或采集事件。重复加载不重复挂载。同意前先移除组件，避免组件高度影响滚动深度。

原生表单提交只收集显式 `data-baize-form` 表单的 id 与 action 路径，立即通过非阻塞 beacon 发送，不收集字段名称或值。跨域 beacon 使用 CORS safelisted `text/plain;charset=UTF-8` 承载同一版本化 JSON 协议，避免导航时 JSON MIME preflight 导致行为批次丢失；发送失败仍受浏览器生命周期限制。

每日盐模式的已知稳定属性别名由独立 MIT `src/privacy.ts` 统一过滤，浏览器、微信 SDK 与服务器入口使用同一规则，包括 `customer_id`、`device_id`、`uuid`、`contact`、属性里的 `page_id` / `pageId` 及邮箱形字符串。协议必需的顶层页面实例 ID 保留，由服务器再按站点本地日期隔离；任意业务自定义字段仍不应包含个人身份信息。

应用回放播放器支持 `createReplayPlayer(container, events, {language: 'en'})`；默认语言为 `zh-CN`，语言只影响控件和隐私说明，不改变采集协议。

小程序本地运行时回归见 `tests/integration/mini-runtime.test.ts`：真实独立 SDK bundle 在无 DOM / Web Crypto 的 Node VM 中运行，注入安全 UUIDv7，使用微信形态的 request 回调经真实本地 HTTP 接入 Fastify / PostgreSQL。测试通过实际断开首次已接受请求的 socket 验证原样重试和幂等，并验证同意前无 ID、每日盐身份禁止与属性清洗。该测试不是微信官方开发者工具或真实设备验收；官方运行时、账号登录、网络域名白名单与真机兼容性仍未实测。

跨子域第一方标识默认关闭（Cookie 为 host-only）。需要共享时，在同一站点的管理员设置中显式登记每个 `allowed_hosts`，嵌入脚本增加 `data-cookie-domain="example.com"`，或独立 SDK 配置 `cookieDomain: 'example.com'`。只支持已登记、同可注册父域的 HTTPS 页面；可信配置端点使用完整公共后缀列表（含 GitHub Pages 等私有托管后缀）校验，客户端再次检查域名范围。公共后缀、IP、无效域名、无关域或未登记子域不获共享授权，回退 host-only；不会自动允许所有子域访问采集入口。

显式共享范围的撤回会清除同 Domain 的 UID，并写入按站点隔离的布尔拒绝 Cookie（不含身份）。其他已打开子域在下一次采集、发送或重试检查时停止、清空队列并取消待发请求；新页面不会隐式清除拒绝，只有显式 grantConsent 才重新开启。已经发送并持久化的 HTTP 请求无法由撤回倒收。每日盐模式不使用共享 UID 或拒绝 Cookie。

共享 UID 的 Cookie 名为 `_baize_uid_shared`；默认 host-only 继续使用 `_baize_uid`，因此移除共享选项不会隐式沿用旧共享 ID。共享拒绝名为 `_baize_denied_shared_<URL编码站点ID>`，仅存布尔值 `1`。撤回或再次同意的 wire 协议保持不变。

真实本地跨子域回归见 `tests/integration/tracker-subdomain.test.ts`：Playwright 只路由提供两个 HTTPS 宿主页面；SDK、配置与采集均访问真实本地应用和 PostgreSQL。隔离 BrowserContext 明确授予 `local-network-access`（类似浏览器用户允许测试 HTTPS 页面访问 loopback），不关闭 CORS/TLS 或改变环境网络策略。首轮未授此权限被 Chromium address-space 检查拒绝，不能当作采集器故障；授予后实际共享、两页面撤回停止、默认 host-only、未知/HTTP 子域拒绝和私有公共后缀拒绝均有真实链路断言。

标准模式的自动出站链接事件包含 `props.url`（仅 origin/path，移除查询与 hash）和 `props.text`（实际渲染的链接文字，归一空白后最多 50 个 Unicode 字符）。邮箱、长号码/手机号及明显 IPv6 字符串会替换为 `[redacted]`；隐藏文字不采集。输入/editable、`data-private` / `data-baize-private` / `data-baize-mask`、rrweb mask/block 及 `data-baize-ignore` 的链接或私密子树不会自动记录。原生跳转不被阻止；同意前仍不采集。每日盐模式的自动外链事件只记录 URL，不新增文字属性。

这是最小化处理，不保证任意业务文字或 URL 路径都匿名。站长应给敏感链接添加忽略/私密标记，或用 before-send 钩子进一步清洗；自动文字过滤不能识别伪装账号、任意姓名或所有国际号码格式。真实 Chromium→本地 HTTP 采集→PG/EAV→worker 属性统计→JSON/CSV 导出回归见 `tests/integration/tracker-outbound-text.test.ts`，不使用 mock 采集器。

Root独立索引快照实际lint/typecheck通过，完整build后5文件13 tracker/同意/跨子域/外链专项通过、0失败/0跳过。初次快照未先生成public SDK，导致3个浏览器用例404/ORB/超时；这是本次验证顺序错误，原失败报告保留outbound-isolated-sdk-not-built-failed.json，按CI先build再测后原断言全部通过，未改产品或弱化测试。核心gzip4583字节、min3994字节。本批随后仍需新整应用/Docker集成，不沿用bf77作为这些源码证明。
