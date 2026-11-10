# 机器人过滤规则

入口按 HTTP 请求检测，不按批次内事件数量。每个站点和可信入口 IP 的一秒滑动窗口超过 20 个请求时，本次请求记为 bot，返回 204，不写正式事件；已有一分钟 100 请求限流独立保留。正常 20 事件批次只增加一次请求，tracker 最多四次指数退避重试不会单独达到行为阈值。大量同源 NAT 用户仍可能触发共享 IP 规则，这是启发式检测的边界。

`src/server/bot-rules.json` 是自维护 UA 规则库。修改 version / rules 后重启服务生效；tokens 为不区分大小写的字面片段，禁止自定义正则，规则数量和长度有上限。AI 命中优先于通用 bot；OpenAI、Anthropic、Perplexity 等规则明确记为 ai。Google-Extended 仅识别该字面标识，不代表服务器验证了其爬虫身份。伪装普通浏览器的低频爬虫可能漏报，UA 命中也不进行 DNS 身份验证。

入口 IP 仅用于内存中的 HMAC 计算。内存与 Redis 都只保留域分隔的站点 HMAC 键；Redis 通过原子 Lua 和 Redis TIME 维护窗口，成员为随机请求 UUID，一秒后过期，无 IP / UA 明文。Redis 故障时继续使用每次请求同步维护的有界本地窗口，不关闭过滤；独立进程间的全局窗口此时降级为进程内窗口。各类 bot 请求按站点独立计数，不进入普通流量指标。

验证文件：`tests/unit/bot-filter.test.ts`、`tests/integration/bot-filter-redis.test.ts`、`tests/integration/bot-collector.test.ts`、`tests/integration/bot-minute-failover.test.ts`。Redis 客户端在第 99 次请求后断开时，第 100 次仍受行为过滤，第 101 次返回 429 和 Retry-After: 60，证明分钟窗口不因缓存故障重置。集成项分别使用真实 Redis 并发窗口和真实 PostgreSQL 采集入口。
