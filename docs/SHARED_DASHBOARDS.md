# 只读看板与嵌入图表

Node 标准版可以把站点的最近 30 天统计生成只读分享。接收者不需要后台账号，可以看到总览指标、逐小时趋势、流量来源、设备、国家与地区和热门页面。排行榜最多显示前 20 项，图表和表格使用同一批真实汇总。

在站点的分享设置中新建链接，可以设置访问密码和失效时间。链接生成后只显示一次；丢失后可撤销原链接并重新生成。分享列表可以随时撤销授权，站点停用或进入回收站后也不能继续访问这些分享。

## 嵌入到自己的页面

1. 新建分享时展开“图表嵌入安全设置”，填写允许嵌入的 Origin，一行一个，例如 `https://dashboard.example.com`。Origin 只包括协议、域名和可选端口，不包含路径。
2. 普通 iframe 无法发送分享密码，因此为嵌入创建不带密码的链接，并限制允许嵌入的 Origin。
3. 创建完成后选择热门页面、流量趋势、流量来源、设备分布或国家与地区，再复制生成的 iframe 代码。切换图表类型不会新建分享，可以复用同一个授权。
4. 将代码放到已授权的页面。失效、撤销或停用站点后，所有使用这条分享的 iframe 同时失效。

嵌入使用服务端生成的 HTML、SVG 和表格，不运行页面脚本。允许嵌入的域名通过 CSP `frame-ancestors` 限制。没有配置域名时，返回 `frame-ancestors 'none'`。**嵌入域名限制不等同于访问密码**：持有无密码分享链接的人仍可直接打开其只读内容。

## 数据口径

- 总览和趋势使用同一个滚动 30 天区间；趋势按小时展示，时间标注使用站点时区。
- UV、独立 IP 和会话数沿用站点统计口径，不通过累加各时段去重数计算总量。不可用指标显示 `—`。
- 每日盐模式不提供跨日 UV 或跨日独立 IP 合并值。
- 分享只投影允许公开的汇总字段，不返回事件正文、事件属性、用户身份、访客 ID、原始 IP、内部 IP 标识、站点密钥或回放数据。
- 页面排行移除查询参数和片段，相同路径合并。地域显示采集到的国家与地区；未知记录不会猜测成某个地点。
- 统计尚未聚合或部分区间不可用时，看板和嵌入显示覆盖提示。空数据保留空状态。
- 原有 API 的 `days` 字段继续保留，表示最近 30 个站点自然日；新版看板使用同一滚动区间内的 `report`，两种时间口径不能相互混加。

## 接口

| 接口 | 用途 |
| --- | --- |
| `POST /api/v1/sites/:siteId/shares` | 站点管理员生成分享；可传 `password`、`expires_at`、`frame_origins` |
| `GET /api/v1/sites/:siteId/shares` | 管理员查看分享授权，不重新显示原始 token |
| `DELETE /api/v1/sites/:siteId/shares/:id` | 管理员撤销分享 |
| `POST /api/v1/shares/:token` | 读取汇总，正文可传 `password` |
| `GET /embed/chart?token=…&type=…&lang=…` | 读取嵌入图表 |

`type` 只能为 `top-pages`、`trend`、`sources`、`devices`、`geography`；默认为 `top-pages`。`lang` 为 `zh-CN` 或 `en`。服务端客户端可以使用 `x-share-password` 请求头访问带密码的嵌入内容，普通 iframe 不支持该请求头。

验证用例见 `tests/unit/shared-dashboard.test.ts`、`tests/integration/shared-dashboard.test.ts` 和 `tests/integration/legacy-share-password.test.ts`。集成测试在独立 PostgreSQL schema 内检查真实汇总、五种图表、身份字段隔离、密码、有效期、撤销、站点停用及 CSP。
