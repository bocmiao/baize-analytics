# 蜘蛛访问记录接入

白泽会记录访问采集端点、被现有机器人规则识别的请求。许多搜索引擎不执行网页 JavaScript，因此这部分记录不能代表网站服务器的全部蜘蛛访问。要记录这些访问，需要由网站后端或访问日志转发器调用以下服务端接口。

## 数据和口径

- 每条记录对应一次请求，单个浏览器采集批次只记一次；批次中用于展示的路径经过清理。
- 引擎名称由 User-Agent 声明识别，不等于完成反向 DNS / 官方 IP 段验证。`request_burst` 表示访问突增，被单独标记，不会命名为 Google、百度等搜索引擎。
- 独立 IP 使用站点盐和规范化 IP 的 HMAC 去重。IPv4 与其 IPv6 映射写法视为同一个 IP。不同站点的值不相同，API 不返回 HMAC。
- 列表只显示 IPv4 /24、IPv6 /64 脱敏前缀；相同前缀不代表同一个独立 IP。`daily_salt` 站点不保存 IP 前缀或稳定 IP 标识，独立 IP 计数返回 `null`。
- 不保存原始 IP、User-Agent、请求体、URL 查询参数、片段或 URL 中的账号密码。路径中的用户资料应由网站在上报前进一步改写，例如把 `/users/alice@example.com` 换成 `/users/:id`。
- 保留期取站点保留天数与 90 天中较小值；缩短保留期后查询立即隐藏过期行，保留期任务删除它们。删除站点会级联删除记录。

## 认证和上报

站点管理员调用 `POST /api/v1/sites/:siteId/write-key` 创建或轮换已有的服务端密钥。该密钥也用于服务端事件采集；轮换后两个接口的旧密钥都会失效。密钥只放在后端环境变量里。

`POST /api/v1/sites/:siteId/bot-visits/ingest` 必须携带：

- `Authorization: Bearer <站点 write-key>`
- `X-Baize-Signature: <HMAC-SHA256 的十六进制值>`，签名密钥为 write-key，内容为下述排序后的完整 JSON。
- `Content-Type: application/json`

接口拒绝带有 `Origin` 或 `Cookie` 的浏览器请求。每站点每分钟最多 120 个请求，每批 1–100 条，总请求体不超过 1 MiB。超限返回 429 与 `Retry-After: 60`。请在公网使用 HTTPS。

```js
import {createHmac, randomUUID} from 'node:crypto';

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

// 从网站服务器实际请求读取；不要信任未配置可信代理的 X-Forwarded-For。
const visit = {
  id: randomUUID(), // 同一条日志重试时保留 id、ts、ip、path、user_agent
  ts: Date.now(),   // 实际访问时间，Unix 毫秒
  ip: request.socket.remoteAddress,
  path: request.url,
  user_agent: request.headers['user-agent'] || '',
};
const body = {sent_at: Date.now(), visits: [visit]};
const key = process.env.BAIZE_WRITE_KEY;
const signature = createHmac('sha256', key).update(canonical(body)).digest('hex');
const response = await fetch(
  `${process.env.BAIZE_URL}/api/v1/sites/${process.env.BAIZE_SITE_ID}/bot-visits/ingest`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'X-Baize-Signature': signature,
    },
    body: JSON.stringify(body),
    redirect: 'error',
  },
);
const result = await response.json();
// 后台队列处理 accepted / duplicates / rejected，不阻塞网站正常响应。
```

`sent_at` 必须在服务器当前时间前后 5 分钟内。访问时间 `ts` 允许在保留期内补报，最多超前 5 分钟。若网络失败，保留每条 `id` 和访问内容，重新生成 `sent_at` 与签名后重试。同站点、同来源的相同 `id` 不重复计数；改变已接收内容会返回 `id_conflict`。普通浏览器 UA 返回 `not_detected_as_bot`，排除 IP 返回 `excluded_ip`，它们不会进入蜘蛛统计。

成功处理批次返回 HTTP 202：

```json
{"accepted":1,"duplicates":0,"rejected":[],"coverage":"Only crawler requests explicitly forwarded by an authenticated server integration.","engineVerification":"user_agent_claim_only"}
```

## 查询

`GET /api/v1/sites/:siteId/bot-visits?from=2026-11-01&to=2026-11-10&page=1&limit=50`

使用现有站点会话或站点只读 API Token。日期按站点时区计算，最多 31 天。`limit` 最大 100，可选 `engine=google`、`source=collector|server_log`。返回分页记录、全筛选范围的 `totals`、按引擎/类别的 `summary`，各项包含访问次数、独立 IP、不同路径数和最近访问时间。无记录时总数为 0；隐私模式不支持的独立 IP 为 `null`。

新增表 `bot_visit_log` 由现有完整 PostgreSQL 备份包含。迁移 062 的固定校验加入历史备份 schema 白名单；该独立运维账本不改变之前历史事实包的签名范围。
