import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import Fastify,{type FastifyInstance} from 'fastify';
import {ZodError} from 'zod';
import type {AppContext} from '../../src/server/context.js';
import {EVENT_DEFINITION_LIMIT,readEventDefinitions,registerEventManagement} from '../../src/server/event-management.js';

const db=vi.hoisted(()=>({query:vi.fn(),lock:vi.fn(),transaction:vi.fn()}));
vi.mock('../../src/server/db.js',()=>({transaction:db.transaction,lockSite:db.lock}));
let app:FastifyInstance,ctx:AppContext,config:Record<string,unknown>,exists:boolean;
const base='/api/v1/sites/site-a/event-definitions';
const timestamp='2026-11-10T00:00:00.000Z';
const definition=(name='download')=>({name,displayName:'下载',description:'下载开源软件',createdAt:timestamp,updatedAt:timestamp});
beforeEach(async()=>{
 vi.clearAllMocks();exists=true;config={replay:true,session_timeout_minutes:45};
 db.transaction.mockImplementation(async(_pool:unknown,callback:(client:{query:typeof db.query})=>Promise<unknown>)=>callback({query:db.query}));
 db.query.mockImplementation(async(sql:string,params:unknown[])=>{
  if(sql.startsWith('SELECT config'))return {rows:exists?[{config}]:[]};
  if(sql.startsWith('UPDATE sites')){config={...config,event_definitions:JSON.parse(params[1] as string)};return {rows:[],rowCount:1};}
  if(sql.startsWith('INSERT INTO audit_logs'))return {rows:[],rowCount:1};
  throw new Error('Unexpected query '+sql);
 });
 ctx={pool:{query:db.query},authorize:vi.fn().mockResolvedValue({id:'owner'})} as unknown as AppContext;
 app=Fastify();app.setErrorHandler((error,_request,reply)=>reply.status(error instanceof ZodError?400:(error as {statusCode?:number}).statusCode||500).send({error:error instanceof Error?error.message:'error'}));await registerEventManagement(app,ctx);
});
afterEach(async()=>{await app.close();vi.restoreAllMocks();});

describe('site-scoped event definitions',()=>{
 it('creates, lists, edits and deletes metadata while preserving all other config and event history',async()=>{
  const created=await app.inject({method:'POST',url:base,payload:{name:'download',displayName:'下载',description:'下载开源软件'}});expect(created.statusCode).toBe(201);expect(created.json().definition).toMatchObject({name:'download',displayName:'下载'});expect(db.lock).toHaveBeenCalledWith(expect.anything(),'site-a');
  const list=await app.inject(base);expect(list.json()).toMatchObject({definitions:[{name:'download'}],limit:100});
  const changed=await app.inject({method:'PATCH',url:base+'/download',payload:{displayName:'软件下载'}});expect(changed.statusCode).toBe(200);expect(changed.json().definition).toMatchObject({name:'download',displayName:'软件下载',description:'下载开源软件',createdAt:created.json().definition.createdAt});
  const deleted=await app.inject({method:'DELETE',url:base+'/download'});expect(deleted.statusCode).toBe(204);expect(config).toEqual({replay:true,session_timeout_minutes:45,event_definitions:{}});
  const sql=db.query.mock.calls.map(call=>call[0] as string);expect(sql.filter(value=>value.startsWith('UPDATE')).every(value=>value.includes('jsonb_set'))).toBe(true);expect(sql.some(value=>value.includes('DELETE')||value.includes('analytics_events'))).toBe(false);
  expect(db.query.mock.calls.filter(call=>String(call[0]).startsWith('INSERT INTO audit_logs')).map(call=>(call[1] as string[])[2])).toEqual(['event_definition.create','event_definition.update','event_definition.delete']);
 });
 it.each(['GET','POST','PATCH','DELETE'] as const)('checks site authorization before %s reads or writes storage',async method=>{
  vi.mocked(ctx.authorize).mockRejectedValue(Object.assign(new Error('forbidden'),{statusCode:403}));const response=await app.inject({method,url:method==='PATCH'||method==='DELETE'?base+'/download':base,...(method==='POST'||method==='PATCH'?{payload:{name:'download',displayName:'下载'}}:{})});expect(response.statusCode).toBe(403);expect(db.query).not.toHaveBeenCalled();expect(db.transaction).not.toHaveBeenCalled();expect(ctx.authorize).toHaveBeenCalledWith(expect.anything(),'site-a',method==='GET'?'read':'admin');
 });
 it('returns meaningful conflicts and missing records instead of silently replacing identities',async()=>{
  config.event_definitions={download:definition()};expect((await app.inject({method:'POST',url:base,payload:{name:'download',displayName:'覆盖'}})).statusCode).toBe(409);
  expect((await app.inject({method:'PATCH',url:base+'/missing',payload:{description:'不存在'}})).statusCode).toBe(404);expect((await app.inject({method:'DELETE',url:base+'/missing'})).statusCode).toBe(404);
  expect((await app.inject({method:'PATCH',url:base+'/download',payload:{name:'renamed'}})).statusCode).toBe(400);expect(config.event_definitions).toEqual({download:definition()});
 });
 it.each(['__proto__','constructor','prototype',' event ','event\nname'])('rejects unsafe identifiers %j without storage mutation',async name=>{
  expect((await app.inject({method:'POST',url:base,payload:{name,displayName:'事件'}})).statusCode).toBe(400);expect(db.transaction).not.toHaveBeenCalled();
 });
 it('accepts SDK-compatible Chinese and punctuated names without interpreting markup',async()=>{
  const response=await app.inject({method:'POST',url:base,payload:{name:'下载:文件/v1',displayName:'<script>literal</script>'}});expect(response.statusCode).toBe(201);expect(response.json().definition.displayName).toBe('<script>literal</script>');
 });
 it('bounds metadata size and total definitions',async()=>{
  expect((await app.inject({method:'POST',url:base,payload:{name:'test',displayName:'事件',description:'x'.repeat(1001)}})).statusCode).toBe(400);
  config.event_definitions=Object.fromEntries(Array.from({length:EVENT_DEFINITION_LIMIT},(_,index)=>['e'+index,definition('e'+index)]));expect((await app.inject({method:'POST',url:base,payload:{name:'overflow',displayName:'事件'}})).statusCode).toBe(409);
 });
 it('does not leak another site or claim missing sites have an empty configuration',async()=>{
  exists=false;expect((await app.inject(base)).statusCode).toBe(404);expect((await app.inject({method:'POST',url:base,payload:{name:'new',displayName:'事件'}})).statusCode).toBe(404);expect(db.query.mock.calls.every(call=>(call[1] as unknown[])[0]==='site-a')).toBe(true);
 });
 it('filters malformed persisted metadata without accepting prototype properties',()=>{
  expect(readEventDefinitions({event_definitions:{ok:definition('ok'),wrong:definition('different'),broken:{name:'broken'}}})).toEqual([definition('ok')]);expect(readEventDefinitions(null)).toEqual([]);expect(readEventDefinitions({event_definitions:[]})).toEqual([]);
 });
});
