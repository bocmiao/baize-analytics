# API / 只读分享请求预算

本模块为 `registerRequestRateLimits(app, ctx, options?)`，应在应用注册路由前安装 `preHandler` hook；已在 app 注册路由前接线；真实 PG/Redis专项结果见本批验收记录。

默认固定窗口60秒。认证预算每用户600次：`/api/stats`、`/api/v1/sites`及子路径、`/api/sites`及子路径、`/api/admin`及子路径共用。由 `ctx.user` 验证的实际用户ID计数，同用户Cookie/API Token、不同站点不会得到新预算。`/api/admin/...`在计数前统一调用真实`requireAdminSession`，必须有效实例管理员Cookie并拒绝任何Authorization头；无Cookie维持403管理员guard契约，路由自身仍保留同一guard。其他认证路径仍由ctx.user验证。路由自身仍独立检查站点权限。本预算不是权限替代。采集、追踪器、登录原有专用限制不受本模块控制。

公共预算每可信来源120次：POST `/api/v1/shares/:token` 和GET/HEAD `/embed/chart`共用；更换分享token、查询参数、伪造X-Forwarded-For不会刷新预算。来源只采用Fastify `req.ip`（应用必须保持现有不信任代理头的配置）；使用masterKey域隔离HMAC，内存/Rediskey不保存原IP、用户ID、URL、token、body。

Redis已配置时使用原子INCR+首次PEXPIRE，进程之间共享；调用故障/超时返回503 `request_rate_limit_unavailable`，不回退到新内存额度。最多256个在途Redis命令，超时后占位直到实际命令结束，避免离线队列无限增长。Rediskey按窗口分隔，TTL为当前窗口剩余时间。未配置Redis时才使用进程内最多10000个HMAC主体，过期窗口删除；容量满返回503而非逐出活跃计数。此模式不提供多副本共享保证。

超限429 `request_rate_limit_exceeded`，两种拒绝均带Retry-After秒数（至窗口结束）。窗口边界允许两相邻窗口的突发，这是固定窗口语义，不宣称平滑速率或容量SLO。界面快速筛选/API真实查询仍可能触发限额。

测试可通过第三参数注入authenticatedLimit/publicLimit/windowMs/maxEntries/redisTimeoutMs/clock；所有数字要求正安全整数。不提供原IP/secret配置，不读取用户自报身份header。`tests/unit/request-rate-limit.test.ts`中身份header只是假ctx测试替身，生产始终调用真实ctx.user。

单元验证覆盖N/N+1、跨站共用、主体隔离、下一窗口、伪XFF、内存容量与Redis故障；PG/Redis专项已由root串行执行，两应用实例共享原子额度、TTL、故障拒绝通过；具体源码与最终结果见本批验收记录。未使用外网或生产凭据。
