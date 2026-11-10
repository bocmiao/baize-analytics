# 目录规则和渠道推广

Node 标准版在「内容分析 → 目录分析」配置目录，在「渠道追踪 → 渠道设置」保存推广链接和参数。配置保存在当前站点的 `sites.config`，无需额外数据库服务或第三方二维码接口。

## 目录

- **目录及子页面**：`/docs` 匹配 `/docs` 和 `/docs/start`，不匹配 `/docsmith`。
- **精确页面**：只匹配指定页面路径。路径不包含查询参数、锚点或域名。
- 没有启用任何规则时，继续按页面父目录分组。有启用规则时，未命中的页面列为「未分组」。
- 一页可以属于多个目录。每个目录的 PV、UV、IP、会话独立计算，目录行不能相加作为全站总量。
- 修改、停用或删除规则只调整报表分组，不改写历史事件。名称在站点内唯一，最多保存 100 条规则。

## 推广链接

填写名称、目标网址与渠道来源，可选择活动名称、渠道媒介、推广内容和关键词。保存后，链接保留在当前站点，可复制、编辑、删除或下载 SVG 二维码。原网址的其他查询参数和锚点会保留；已有同名 UTM 参数会被当前输入替换。中文域名按标准 URL 转换为 Punycode。

二维码在浏览器本地使用 `qrcode` 生成，不向第三方发送目标网址。编码后链接最长 2000 字符，链接过长时需缩短网址或参数。每个站点最多保存 200 条推广链接，最多 500 个参数值；每个参数值最长 128 字符。

保存链接会把使用的 UTM 值加入参数列表。删除参数值仅删除填写建议；已投放的链接和已采集的统计不变。删除一个保存的链接也不会让外部已投放的 URL 失效。

「渠道分析」按渠道来源 → 活动名称 → 渠道媒介下钻，最后查看推广内容或关键词；保留页面和日期筛选。按时间展示时可选择最多五个渠道序列。未设置字段按真实缺失值显示，不会用其他维度补值。

## API

以下接口都以 `/api/v1/sites/:siteId` 开头。查询要求站点读取权限；新增、更新和删除要求站点管理员权限。修改均取得站点事务锁并写入审计记录。

| 资源 | 查询/新增 | 更新/删除 |
| --- | --- | --- |
| 目录规则 | `GET /directory-rules`、`POST /directory-rules` | `PATCH /directory-rules/:id`、`DELETE /directory-rules/:id` |
| 推广链接 | `GET /campaign-links`、`POST /campaign-links` | `PATCH /campaign-links/:id`、`DELETE /campaign-links/:id` |
| 参数值 | `GET /campaign-parameters`、`POST /campaign-parameters` | `PATCH /campaign-parameters/:id`、`DELETE /campaign-parameters/:id` |

查询返回 `{items, limit}`，新增和修改返回 `{item}`，删除返回 204。

目录新增示例：

```json
{"name":"技术文档","path":"/docs","match":"prefix","enabled":true}
```

推广新增示例：

```json
{
  "name": "新版本公告",
  "targetUrl": "https://example.com/docs?lang=zh#start",
  "parameters": {
    "utm_source": "newsletter",
    "utm_campaign": "release",
    "utm_medium": "email",
    "utm_content": "header",
    "utm_term": ""
  }
}
```

参数新增示例：

```json
{"field":"utm_source","value":"newsletter"}
```

原始数据库备份包含全部配置；完整站点数据导出同时保留经过类型校验的目录、推广链接和参数配置，敏感凭据仍由既有导出策略排除。
