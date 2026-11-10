# 标准 MCP 只读站点分析

接口 /api/sites/:siteId/mcp 通过 JSON-RPC 2 和无状态 Streamable HTTP 提供站点只读分析。

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

支持initialize、ping、tools/list、tools/call。有效无id通知返回202，无额外副作用；resources/prompts/mutation工具不提供。初始化协商2025-11-25、2025-06-18、2025-03-26；未知版本返回当前版本供客户端决定是否支持，后续显式未知MCP-Protocol-Version请求400。客户端需支持协商后的协议版本。

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
