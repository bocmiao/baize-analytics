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
