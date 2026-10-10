# SEO 本地真实 HTTP 与数据库验收

实际执行 `TEST_DATABASE_URL=... npx vitest run tests/integration/seo-local-runtime.test.ts`，1 文件 / 1 测试通过，CLI EXIT0，9.11 秒（2026-10-10 07:56 UTC）。该新增测试当前属于开发工作树，尚未纳入最终不可变 feature 快照；不覆盖既有外部服务测试结果。

使用原生临时 HTTP listener 提供真实 robots.txt 与 HTML 页面，真实用户初始化/登录/站点权限、生产 crawler 与真实隔离 PostgreSQL。显式测试 transport 仅把唯一登记的 HTTPS fixture 域映射到该临时 listener；未修改生产 safeFetch 或放开私网访问，测试同时拒绝未登记域和生产私网 HTTP/HTTPS 请求。

验收实际请求 User-Agent、约两秒访问间隔、robots 排除、同站范围、查询链接排除、重复标题/缺少描述/图片 alt/404 问题入库；实际 API 生成本地证据与 SEO 建议并转换状态。修改 HTML 后真实复检触发新的扫描 ID，问题消除，而旧扫描证据保持不变，建议最终可验证完成。测试清理 listener、数据库 schema 与临时目录。

这是本地 HTTP 与 PG 端到端验收，网络域映射是显式测试适配，不证明真实外站抓取、生产 DNS/TLS 或任意网站兼容性；没有调用付费 API、生产凭据或发送外部通知。
