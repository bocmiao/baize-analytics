# 地域、独立 IP、预测与蜘蛛日志

本页适用于 Node 标准版。新增流量报表沿用现有站点权限、保留期限与删除规则。

## 地域和运营商

管理员打开「地域与运营商数据库」，选择 **ip2region**，勾选启用，点击「下载并加载数据库」。无需注册 MaxMind 账号。固定快照来自 [ip2region 官方仓库](https://github.com/lionsoul2014/ip2region)，包含 IPv4 与 IPv6 数据。下载后先校验 SHA-256、Git blob 和 XDB 格式，再原子切换当前版本；失败会保留原文件。

网络受限时可离线安装。按 `packages/ip2region-data/manifest.json` 指定的版本获取 `ip2region_v4.xdb`、`ip2region_v6.xdb` 和上游 `LICENSE.md`，将许可证保存为 **`LICENSE.ip2region.md`**。这三个文件放在同一目录中，仅允许管理员访问，然后在安装目录执行：

```sh
node --import tsx scripts/geoip-install.ts --data-dir /app/data --from /private/geoip
node --import tsx scripts/geoip-install.ts --data-dir /app/data --check
```

`--from` 仍执行完整校验。安装后在后台保存启用设置，或重启应用以重新加载。数据位于 `DATA_DIR/geoip/ip2region`，应挂载到持久卷。MaxMind 可选来源需要自己的账号与 License Key；目前该来源只提供地域，不提供运营商。

私网、保留地址或数据库未识别的地址显示未知。内网测试时，NAS 看到的私网客户端不会被强行标成某个城市。反向代理部署须配置明确的 `TRUSTED_PROXIES`；没有受信代理时，外部提交的 `X-Forwarded-For` 不参与 IP 识别。

## 独立 IP 和预测

IP 标识由完整的规范化地址和站点私有盐生成，同一地址在不同站点不共用标识。表格显示脱敏网段与不可逆展示编号；一个网段内的不同 IP 分别计数。历史事件缺少完整标识时，`ips=null`，并返回覆盖率，不能从网段或 UV 补造。完整、确实没有访问的区间独立 IP 为 `0`。

每日匿名模式不保存稳定 IP，相关指标保持不可用。跨天总 IP 直接对已发布事实做集合去重，不累加每天的 IP 数。

概况的「预计今日」按历史完整日期的同期及剩余流量估算。展开「流量预测依据与范围」可查看方法、样本天数及启发式范围。没有足够历史时，今日运行至少两小时且达到最低样本才使用运行速度估算；数据聚合尚未完成时不输出预测。

## 蜘蛛访问日志

「蜘蛛统计」区分浏览器埋点和服务器日志。前者只记录到达采集接口并被识别为自动访问的请求；完整网站爬虫日志需由 Web 服务器或日志转发程序上报。

在站点设置中创建服务端 write-key，将其保存在服务器，不能放到网页。发送 `POST /api/v1/sites/:siteId/bot-visits/ingest`：

```json
{
  "sent_at": 1794268800000,
  "visits": [{
    "id": "f754c327-f1d8-48a7-9769-81b7dcda599f",
    "ts": 1794268790000,
    "ip": "192.0.2.1",
    "path": "/articles/hello?ignored=1",
    "user_agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
  }]
}
```

时间戳替换为真实毫秒时间。每批 1–100 条，`sent_at` 与服务器当前时间相差不得超过五分钟。请求带 `Authorization: Bearer <write-key>` 和 `X-Baize-Signature`；签名为 write-key 对递归键名排序的 canonical JSON 做 HMAC-SHA256，编码为 hex。canonical 方法与现有 `/api/collect` SDK 一致。请求不带浏览器 Origin 或 Cookie。

HTTP 202 返回 `accepted`、`duplicates`、`rejected`。重试保留访问记录 `id` 和原内容，刷新 envelope 的 `sent_at` 并重签名。同一 ID 内容冲突会拒绝；无法识别的普通浏览器 UA 不计为蜘蛛。接口受站点限流、IP 排除和保留期约束。

日志只保存去掉查询参数和 fragment 的路径、引擎类别、时间与脱敏 IP。原始 IP 和 UA 不落库。`GET /api/v1/sites/:siteId/bot-visits` 需要 read 权限，`from/to` 为站点时区日期，最多 31 天；支持 `page`、`limit`、`engine` 和 `source`。返回按引擎汇总、IP 与 URL 去重数、最近时间和分页日志。

Node.js 签名示例、重试、限流和完整字段说明见 [蜘蛛日志接入](spider-log-ingest.md)。
