# 标准 MCP 只读站点分析

当前开发工作树新增 `registerMcp(app,ctx)`，路由 `/api/sites/:siteId/mcp`。独立真实PG/nativeHTTP/官方 `@modelcontextprotocol/sdk` 1.32.1 Client验收已通过；根集成注册及下一不可变main全量验收前，不能假定旧安装镜像包含此入口。本文不是前一版HTTP typed-query接口的改名：它实际提供JSON-RPC2的MCP初始化、工具发现和调用，并使用官方StreamableHTTP客户端执行。

## 连接

先用管理UI创建该站点只读API Token，安全绑定到 `BAIZE_API_TOKEN`，URL绑定到 `BAIZE_MCP_URL`（完整本地 `/api/sites/实际ID/mcp`）。不把Token放URL、tracker、文档、提交记录或日志；不打印环境、不启用shell tracing。端点限该站点，Token失效/撤销、所属用户失去权限会拒绝。每请求（含notification）检查read权限，工具读取前/返回前重新检查。提供Origin时须与PUBLIC_URL来源一致；标准服务端客户端可不发送Origin。

采用stateless Streamable HTTP：POST JSON，客户端Accept为application/json和text/event-stream；响应JSON，无Mcp-Session-Id、服务端SSE连接或会话恢复。GET/DELETE已鉴权后405，Allow: POST。无OAuth发现/动态客户端注册；当前使用已有站点Token，不能把登录Cookie/Token支持说成完整MCP OAuth实现。

```typescript
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const client = new Client({name:'local-analytics-client',version:'1.0.0'});
const transport = new StreamableHTTPClientTransport(new URL(process.env.BAIZE_MCP_URL!), {
  requestInit:{headers:{authorization:`Bearer ${process.env.BAIZE_API_TOKEN}`}}
});
try {
  await client.connect(transport); // initialize + notifications/initialized
  const tools = await client.listTools();
  const result = await client.callTool({name:'query_analytics',arguments:{
    metric:'pv',dimension:'day',start:process.env.BAIZE_START_DATE!,end:process.env.BAIZE_END_DATE!,limit:30
  }});
  // 使用 result.structuredContent；保留status/storage/coverage，不把null显示成零。
} finally {
  await client.close();
}
```

SDK作为仓库devDependency供测试/例子；运行服务本身不调用模型或付费API。示例客户端不要记录含Token的requestInit。

## 协议与工具

支持initialize、ping、tools/list、tools/call。有效无id通知返回202，无额外副作用；resources/prompts/mutation工具不提供。初始化协商2025-11-25、2025-06-18、2025-03-26；未知版本返回当前版本供客户端决定是否支持，后续显式未知MCP-Protocol-Version请求400。官方SDK1.32.1实际验收协商2025-11-25；不能由此推称全部历史客户端矩阵已实测。

capabilities仅tools/listChanged:false；工具仅 `query_analytics`，annotations readOnlyHint:true、destructiveHint:false、idempotentHint:true、openWorldHint:false。输入严格：

| 字段 | 可用值/限制 |
|---|---|
| metric | pv、uv、sessions、conversions、conversion_rate |
| dimension | day、page、source、device，默认day |
| start/end | YYYY-MM-DD，包含两端、有序、最多31天 |
| limit | 1–100，默认30 |
| filters | source、device、os、page字符串，拒绝未知键 |

不接受site_id、SQL、表名、原始事件、身份或任意URL，也无export/delete/模型工具。site来自路径授权，不能在工具参数切站。复用真实PG预聚合、exact访客集合与币种/隐私边界，不单独创造Mock答案。result含content text和structuredContent；成功status=ok，series包含metric/dimension/unit/points、truncated/totalGroups/timezone/precision，storage包含PG-preaggregate generation/epoch/watermark/coverage。跨日每日盐UV显式unsupported；dirty聚合返回tool isError与aggregation_pending，不显示假零。

JSON-RPC错误：JSON解析失败-32700、无效请求-32600、未知方法-32601、未知工具/参数-32602。工具执行已知错误返回200的result.isError/content固定code；认证/撤销错误仍为HTTP401/403，不包含工具数据。服务异常使用应用固定错误，不泄露SQL/凭据。列表无分页游标（仅一个工具），数据上限通过limit/truncated披露；不支持批量JSON-RPC数组。

## 已执行验证与限制

`TEST_DATABASE_URL=... npx vitest run tests/integration/mcp.test.ts`：4/4通过，CLI EXIT0，1.72秒；相关lint/typecheck通过。独立PG schema、max1 pool、原生HTTP、实际管理员/站点/Token、实际collector→worker PV1→官方SDK标准初始化/列表/调用对账。拒绝SQL/foreign site/过长范围/limit101/未知工具，通知与GET/DELETE行为、每日盐UV/dirty状态均检查。持真实站点锁阻塞读取时真实撤销Token，返回前重新鉴权401且无result，证明没有持client再借池。schema/密钥清理完成，无外部模型调用。

首次撤销回归错误地用admin默认public schema UPDATE0，导致预期401实际200，测试失败记录保留；改为限定测试schema并assert rowCount1后通过。该失败不称作生产权限漏洞。标准Client实际成功，不只是手写HTTP探针。第三方桌面MCP产品、远程OAuth、历史协议版本全矩阵、生产网络/负载尚未实测。
