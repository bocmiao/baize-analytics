import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {Pool} from 'pg';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createApp} from '../../src/server/app.js';
import {registerMcp} from '../../src/server/mcp.js';
import {runWorkerOnce} from '../../src/server/worker.js';
describe.skipIf(!process.env.TEST_DATABASE_URL)('standard MCP SDK over actual HTTP and PostgreSQL',()=>{
 const schema=`mcp_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1});
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1,connectionTimeoutMillis:1500,options:`-c search_path=${schema},public`,application_name:schema});
 let instance:Awaited<ReturnType<typeof createApp>>,directory:string,address:string,site:string,other:string,cookie:string,token:string;
 const today=new Date().toISOString().slice(0,10);
 const send=async(method:string,id?:number,params?:unknown,headers:Record<string,string>={})=>fetch(`${address}/api/sites/${site}/mcp`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json',accept:'application/json, text/event-stream',...headers},body:JSON.stringify({jsonrpc:'2.0',...(id===undefined?{}:{id}),method,...(params===undefined?{}:{params})})});
 beforeAll(async()=>{
  await admin.query(`CREATE SCHEMA ${schema}`);directory=await mkdtemp('/tmp/baize-mcp-');instance=await createApp({pool,redis:null,background:false,clickhouse:null,dataDir:join(directory,'data'),keyDir:join(directory,'keys'),masterKey:randomBytes(32)});
  if(!instance.app.hasRoute({method:'POST',url:'/api/sites/:siteId/mcp'}))await registerMcp(instance.app,instance.ctx);
  address=await instance.app.listen({host:'127.0.0.1',port:0});const setup=await fetch(address+'/api/setup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'mcp@example.invalid',password:'Actual-standard-mcp-password'})});expect(setup.status).toBe(200);cookie=setup.headers.get('set-cookie')!.split(';')[0];
  const create=async()=>{const r=await fetch(address+'/api/v1/sites',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({name:'MCP fixture',domain:'mcp-fixture.example.invalid',timezone:'UTC'})});expect(r.status).toBe(201);return (await r.json() as {site:{id:string}}).site.id;};site=await create();other=await create();
  const ts=Date.now()-60000;const receipt=await fetch(address+'/api/collect',{method:'POST',headers:{origin:'https://mcp-fixture.example.invalid','user-agent':'Mozilla/5.0 Chrome/145.0.0.0','content-type':'application/json'},body:JSON.stringify({protocol_version:1,site_id:site,sdk:'mcp-test',sent_at:Date.now(),events:[{event_id:randomUUID(),visitor_id:randomUUID(),page_id:randomUUID(),ts,type:'pageview',url:'https://mcp-fixture.example.invalid/pricing',path:'/pricing'}]})});expect(receipt.status).toBe(202);expect(await runWorkerOnce(pool)).toBe(true);
  const r=await fetch(`${address}/api/v1/sites/${site}/tokens`,{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({scopes:['read']})});expect(r.status).toBe(200);token=(await r.json() as {token:string}).token;
 },30000);
 afterAll(async()=>{await instance?.app.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();if(directory)await rm(directory,{recursive:true,force:true});});
 it('official standard Client initializes, lists read-only schema and obtains exact persisted aggregate via Streamable HTTP',async()=>{
  const client=new Client({name:'baize-real-client',version:'1.0.0'});const transport=new StreamableHTTPClientTransport(new URL(`${address}/api/sites/${site}/mcp`),{requestInit:{headers:{authorization:`Bearer ${token}`}}});
  try{await client.connect(transport);expect(client.getServerCapabilities()).toMatchObject({tools:{listChanged:false}});const list=await client.listTools();expect(list.tools).toHaveLength(1);expect(list.tools[0]).toMatchObject({name:'query_analytics',annotations:{readOnlyHint:true,destructiveHint:false}});const result=await client.callTool({name:'query_analytics',arguments:{metric:'pv',start:today,end:today}});expect(result.isError).not.toBe(true);expect(result.structuredContent).toMatchObject({status:'ok',series:{metric:'pv',points:[{label:today,value:1}]},storage:{source:'postgresql-preaggregate',coverage:1}});expect(pool.waitingCount).toBe(0);}finally{await client.close();}
 });
 it('enforces JSON-RPC methods/version/schema and denies raw SQL, foreign sites, ranges and mutation tools',async()=>{
  const malformed=await fetch(`${address}/api/sites/${site}/mcp`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:'{'});expect(malformed.status).toBe(400);expect(await malformed.json()).toMatchObject({jsonrpc:'2.0',error:{code:-32700}});
  expect((await send('notifications/initialized')).status).toBe(202);expect(await (await send('tools/call',1,{name:'delete_visitor',arguments:{}})).json()).toMatchObject({error:{code:-32602}});
  for(const args of [{metric:'pv',start:today,end:today,sql:'SELECT * FROM events'},{metric:'pv',start:today,end:today,site_id:other},{metric:'pv',start:'2026-01-01',end:'2026-03-01'},{metric:'pv',start:today,end:today,limit:101}])expect(await (await send('tools/call',2,{name:'query_analytics',arguments:args})).json()).toMatchObject({error:{code:-32602}});
  expect(await (await send('resources/list',3)).json()).toMatchObject({error:{code:-32601}});expect((await send('ping',4,{}, {'mcp-protocol-version':'unknown'})).status).toBe(400);
  for(const method of ['GET','DELETE']){const r=await fetch(`${address}/api/sites/${site}/mcp`,{method,headers:{authorization:`Bearer ${token}`}});expect(r.status).toBe(405);expect(r.headers.get('allow')).toBe('POST');}
  expect((await send('ping',5,{}, {origin:'https://untrusted.example.invalid'})).status).toBe(403);expect((await fetch(`${address}/api/sites/${other}/mcp`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})})).status).toBe(403);
  expect((await send('notifications/initialized',undefined,{}, {authorization:'Bearer invalid'})).status).toBe(401);
 });
 it('daily-salt cross-day UV is explicitly unsupported and dirty aggregate is a tool error rather than invented zeros',async()=>{
  await pool.query("UPDATE sites SET privacy_mode='daily_salt' WHERE id=$1",[site]);const previous=new Date(Date.parse(today+'T00:00:00Z')-86400000).toISOString().slice(0,10);const uv=await (await send('tools/call',6,{name:'query_analytics',arguments:{metric:'uv',start:previous,end:today}})).json();expect(uv.result.structuredContent).toEqual({status:'unsupported',reason:'daily-salt-cross-day-uv'});await pool.query("UPDATE sites SET privacy_mode='standard' WHERE id=$1",[site]);await pool.query('UPDATE aggregation_state SET generation=generation+1 WHERE site_id=$1',[site]);const dirty=await (await send('tools/call',7,{name:'query_analytics',arguments:{metric:'pv',start:today,end:today}})).json();expect(dirty.result.isError).toBe(true);expect(JSON.parse(dirty.result.content[0].text).error).toBe('aggregation_pending');await pool.query('UPDATE aggregation_state SET processed_generation=generation WHERE site_id=$1',[site]);
 });
 it('rechecks revocation after a real blocked aggregate read and never releases its result to a revoked caller',async()=>{
  const holder=await admin.connect();try{await holder.query('BEGIN');await holder.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[site]);const response=send('tools/call',8,{name:'query_analytics',arguments:{metric:'pv',start:today,end:today}});const deadline=Date.now()+3000;let waiting=false;while(Date.now()<deadline){waiting=Number((await holder.query("SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a USING(pid) WHERE a.application_name=$1 AND l.locktype='advisory' AND NOT l.granted",[schema])).rows[0].count)>0;if(waiting)break;await new Promise(r=>setTimeout(r,10));}expect(waiting).toBe(true);expect((await holder.query(`UPDATE ${schema}.api_tokens SET revoked=true WHERE site_id=$1`,[site])).rowCount).toBe(1);await holder.query('COMMIT');const denied=await response;expect(denied.status).toBe(401);expect(await denied.json()).not.toHaveProperty('result');expect(pool.waitingCount).toBe(0);}finally{await holder.query('ROLLBACK');holder.release();}
 },7000);
});
