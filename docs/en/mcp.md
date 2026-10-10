# Standard MCP read-only site analytics

The current development addition exports `registerMcp(app,ctx)` at `/api/sites/:siteId/mcp`. Real PostgreSQL/native HTTP and official `@modelcontextprotocol/sdk`1.32.1 client tests have passed. Default application registration is present; the next immutable full acceptance is still being consolidated; do not assume an older image has this endpoint. This is real JSON-RPC2 MCP initialization/tool discovery/calling, not renaming the earlier typed HTTP query.

## Connect safely

Create a read-only API token for the selected site in the administration UI. Privately bind it as BAIZE_API_TOKEN and the complete local endpoint as BAIZE_MCP_URL. Never place secrets in URLs, browser tracker code, documentation, commits or logs. Do not dump the environment or enable shell tracing.

Every request, including notifications, checks read permission. Tool execution checks it again before reading and before returning. Token expiry/revocation/current membership apply. If Origin is supplied it must equal the instance PUBLIC_URL origin; native server-side clients need not send Origin.

This is stateless Streamable HTTP: POST JSON with Accept application/json,text/event-stream, JSON responses, no MCP session ID or persistent server SSE. Authenticated GET/DELETE returns405 with Allow: POST. There is no OAuth discovery/dynamic registration; existing site tokens are not a complete MCP OAuth implementation.

```typescript
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const client = new Client({name:'local-analytics-client',version:'1.0.0'});
const transport = new StreamableHTTPClientTransport(new URL(process.env.BAIZE_MCP_URL!), {
  requestInit:{headers:{authorization:`Bearer ${process.env.BAIZE_API_TOKEN}`}}
});
try {
  await client.connect(transport);
  const tools = await client.listTools();
  const result = await client.callTool({name:'query_analytics',arguments:{
    metric:'pv',dimension:'day',start:process.env.BAIZE_START_DATE!,end:process.env.BAIZE_END_DATE!,limit:30
  }});
  // Read structuredContent and preserve status/storage/coverage and null values.
} finally {await client.close();}
```

The SDK is a development dependency for test/client examples. The server does not call a model or paid provider. Never log the authorization requestInit.

## Protocol and contract

Supported methods are initialize,ping,tools/list,tools/call. Valid no-ID notifications return202 and have no mutation side effect. No resources/prompts/mutation tools are offered. Negotiation recognizes2025-11-25,2025-06-18,2025-03-26; unsupported initialize versions receive the current version for client compatibility decision. Unknown subsequent MCP-Protocol-Version returns400. Official SDK1.32.1 actually negotiated2025-11-25; older-client matrix compatibility is not claimed tested.

Capabilities advertise only tools/listChanged:false. The single query_analytics tool has readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false. Arguments are strict:

| Field | Contract |
|---|---|
| metric | pv,uv,sessions,conversions,conversion_rate |
| dimension | day,page,source,device; defaultday |
| start/end | Ordered inclusiveYYYY-MM-DD, at most31 days |
| limit |1–100, default30 |
| filters | source/device/os/page strings only |

SQL, table names, site IDs, identities, raw events, URLs, mutation/export/delete/model tools are rejected. The authorized path fixes the site. Queries reuse actual PG aggregates and exact visitor sets; no fabricated model answer. Results have text content and structuredContent. Successful status=ok includes series metric/dimension/unit/points/truncated/totalGroups/timezone/precision and storage generation/epoch/watermark/coverage. Daily-salt cross-day UV is explicitly unsupported. Dirty aggregates return tool isError/aggregation_pending, never fake zeros.

JSON-RPC errors are-32700 JSON parse error,-32600 invalid request,-32601 unknown method,-32602 unknown tool/arguments. Known execution errors return HTTP200 result.isError with safe fixed codes. Authentication/revocation remains HTTP401/403 without tool results. Internal errors never expose SQL/secrets. tools/list contains one tool and no cursor; query truncation is explicit. JSON-RPC batch arrays are not supported.

## Actual acceptance

`TEST_DATABASE_URL=... npx vitest run tests/integration/mcp.test.ts`:4/4 pass, CLI EXIT0,1.72seconds; lint/typecheck pass. An isolated real PG schema/max1 pool/native HTTP server executes genuine administrator/site/token setup, collector→worker PV1, official standard Client initialization/list/call and result reconciliation. SQL/foreign-site/range/limit101/unknown-tool rejection, notifications/405, daily privacy and dirty state are checked. Revocation while a real site lock blocks aggregate reading causes final401 without data; the aggregate client is released before final authorization. Schema/temp keys are removed; no external model calls.

The first revocation test mistakenly updated the admin connection's default public schema (zero rows) and failed. The corrected test qualifies the isolated schema and asserts one changed token; it then passes. This test defect is not reported as a production authorization vulnerability. Standard SDK interoperability is actually executed, not inferred from manual HTTP. Third-party desktop products, remote OAuth, historical-version matrices and production load remain untested.
