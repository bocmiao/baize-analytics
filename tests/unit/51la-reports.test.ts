import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import Fastify,{type FastifyInstance} from 'fastify';
import type {AppContext} from '../../src/server/context.js';
import type {AnalyticsEvent} from '../../src/server/analytics-core.js';
import {ZodError} from 'zod';

const mocks=vi.hoisted(()=>({read:vi.fn(),snapshot:vi.fn(),stats:vi.fn(),query:vi.fn(),history:vi.fn()}));
vi.mock('../../src/server/event-store.js',()=>({readSiteEvents:mocks.read}));
vi.mock('../../src/server/stats-read-snapshot.js',()=>({withStatsReadSnapshot:mocks.snapshot}));
vi.mock('../../src/server/analytics.js',()=>({queryStats:mocks.stats}));
vi.mock('../../src/server/51la-history-summary.js',()=>({query51laHistory:mocks.history}));
import {register51laReports} from '../../src/server/51la-reports.js';

const now=Date.parse('2026-11-03T08:30:00.000Z');
const input:AnalyticsEvent[]=[{site_id:'site-a',event_id:'event-1',visitor_id:'visitor-1',page_id:'page-1',type:'pageview',ts:'2026-11-03T08:29:00.000Z',path:'/guide',payload:{url:'https://example.test/guide'},dimensions:{browser:'Firefox',ip_truncated:'192.0.2.0'}}];
let app:FastifyInstance,ctx:AppContext,retiredBefore:string|undefined,privacy:string,dirty:boolean;
const client={query:mocks.query};
beforeEach(async()=>{
 vi.clearAllMocks();vi.spyOn(Date,'now').mockReturnValue(now);retiredBefore=undefined;privacy='standard';dirty=false;
 mocks.query.mockImplementation(async(sql:string)=>{
  if(sql.includes('SELECT timezone,privacy_mode'))return {rows:[{timezone:'Asia/Shanghai',privacy_mode:privacy,retention_days:365,config:{}}]};
  if(sql.includes('analytics_raw_retirement_frontiers'))return {rows:retiredBefore?[{retired_before:retiredBefore}]:[]};
  if(sql.includes('visitor_first_seen'))return {rows:[{visitor_id:'visitor-1',first_date:'2026-11-03'}]};
  if(sql.includes('AS today_start'))return {rows:[{today_start:'2026-11-02T16:00:00.000Z',yesterday_start:'2026-11-01T16:00:00.000Z',yesterday_same:'2026-11-02T08:30:00.000Z'}]};
  throw Error('Unexpected query: '+sql);
 });
 mocks.snapshot.mockImplementation(async(_ctx:unknown,_site:string,_from:string,_to:string,read:(value:typeof client)=>Promise<unknown>)=>({value:await read(client),dirty}));
 mocks.read.mockResolvedValue({events:input,coverage:1,source:'clickhouse',mode:'canonical_clickhouse',rangeStatus:'complete',retentionBoundary:'2025-11-03T08:30:00.000Z',truncated:false});
 mocks.stats.mockResolvedValue({totals:{pv:13,uv:7,sessions:9,bounceRate:1/3,averageDuration:42},coverage:1,rangeStatus:'complete',uvStatus:'supported',watermark:'2026-11-03T08:29:00.000Z'});
 ctx={pool:{},authorize:vi.fn().mockResolvedValue({id:'owner'})} as unknown as AppContext;
 app=Fastify();app.setErrorHandler((error,_request,reply)=>{reply.status(error instanceof ZodError?400:((error as {statusCode?:number}).statusCode||500)).send({error: error instanceof Error?error.message:'error'});});await register51laReports(app,ctx);
});
afterEach(async()=>{await app.close();vi.restoreAllMocks();});
const range='from=2026-11-03T00:00:00.000Z&to=2026-11-03T08:30:00.000Z';

describe('authenticated 51LA report routes',()=>{
 it.each(['traffic-report','visits','overview-summary'])('authorizes %s before any storage access',async(route)=>{
  vi.mocked(ctx.authorize).mockRejectedValue(Object.assign(Error('forbidden'),{statusCode:403}));
  const response=await app.inject('/api/v1/sites/site-a/'+route+'?'+range);expect(response.statusCode).toBe(403);expect(mocks.snapshot).not.toHaveBeenCalled();expect(mocks.read).not.toHaveBeenCalled();expect(mocks.query).not.toHaveBeenCalled();
 });
 it.each(['from=2026-11-03T00:00:00Z&to=2026-11-01T00:00:00Z','from=2024-11-01T00:00:00Z&to=2026-11-01T00:00:00Z','pageSize=101','page=0'])('rejects invalid ranges/pagination %s',async(query)=>{
  const response=await app.inject('/api/v1/sites/site-a/visits?'+query);expect(response.statusCode).toBe(400);expect(mocks.snapshot).not.toHaveBeenCalled();
 });
 it('uses the captured storage abstraction and reports actual metrics with no independent IP fabrication',async()=>{
  const response=await app.inject('/api/v1/sites/site-a/traffic-report?'+range);expect(response.statusCode).toBe(200);const result=response.json();
  expect(mocks.read).toHaveBeenCalledWith(ctx.pool,'site-a',expect.objectContaining({client,statsMirrorRead:true,limit:100000,order:'asc'}));expect(result).toMatchObject({coverage:1,ipStatus:'not_collected',providerStatus:'not_collected',totals:{pv:1,uv:1,ips:null},visitors:{new:1,returning:0,unknown:0}});expect(result.groups.isp).toEqual([]);expect(result).not.toHaveProperty('visits');
 });
 it('applies visit filters before pagination and exposes current live windows independently',async()=>{
  const response=await app.inject('/api/v1/sites/site-a/visits?'+range+'&browser=Firefox&pageSize=1');expect(response.statusCode).toBe(200);const result=response.json();
  expect(result).toMatchObject({total:1,page:1,pageSize:1,coverage:1,live:{to:'2026-11-03T08:30:00.000Z',active:{5:1,15:1,30:1}}});expect(result.rows[0]).toMatchObject({entry:'/guide',visitorType:'new',pageviews:1,ipPrefix:'192.0.2.0'});
  const unmatched=await app.inject('/api/v1/sites/site-a/visits?'+range+'&browser=Chrome');expect(unmatched.json()).toMatchObject({rows:[],total:0});
 });
 it('never renders a truncated raw sample as complete counts or zero',async()=>{
  mocks.read.mockResolvedValue({events:input,coverage:0,source:'postgres',mode:'postgres',truncated:true,rangeStatus:'complete'});
  const response=await app.inject('/api/v1/sites/site-a/traffic-report?'+range);expect(response.statusCode).toBe(200);expect(response.json()).toMatchObject({status:'detail_limit_exceeded',coverage:0,totals:{pv:null,uv:null,ips:null},groups:{},days:[],visitors:{new:null,returning:null,unknown:null}});
 });
 it('returns raw-detail unavailability after retirement without querying missing event bodies',async()=>{
  retiredBefore='2026-11-03T05:00:00.000Z';const response=await app.inject('/api/v1/sites/site-a/traffic-report?'+range);expect(response.json()).toMatchObject({status:'raw_detail_retired',coverage:0,totals:{pv:null}});expect(mocks.read).not.toHaveBeenCalled();
 });
 it('keeps exact page counts but suppresses session metrics when only the context expired',async()=>{
  mocks.read.mockResolvedValue({events:input,coverage:0,source:'postgres',mode:'postgres',truncated:false,rangeStatus:'outside_raw_retention',retentionBoundary:'2026-11-02T23:50:00.000Z'});
  const response=await app.inject('/api/v1/sites/site-a/traffic-report?'+range);expect(response.json()).toMatchObject({coverage:1,sessionStatus:'partial_session_context',totals:{pv:1,uv:1,sessions:null,bounceRate:null,averageDuration:null}});
  const visits=await app.inject('/api/v1/sites/site-a/visits?'+range);expect(visits.json()).toMatchObject({rows:[],total:null,coverage:0,status:'partial_session_context'});
 });
 it('queries three site-calendar periods through existing exact facts in one snapshot',async()=>{
  const response=await app.inject('/api/v1/sites/site-a/overview-summary');expect(response.statusCode).toBe(200);
  expect(mocks.snapshot).toHaveBeenCalledTimes(1);expect(mocks.stats.mock.calls.map(call=>call.slice(1,4))).toEqual([['site-a','2026-11-02T16:00:00.000Z','2026-11-03T08:30:00.000Z'],['site-a','2026-11-01T16:00:00.000Z','2026-11-02T16:00:00.000Z'],['site-a','2026-11-01T16:00:00.000Z','2026-11-02T08:30:00.000Z']]);
  expect(mocks.stats.mock.calls.every(call=>call[5].client===client)).toBe(true);expect(response.json()).toMatchObject({today:{totals:{pv:13,uv:7,ips:null}},active15:{visitors:1,pageviews:1},forecast:{pv:null,uv:null,ips:null,status:'not_estimated'}});
  expect(mocks.history).not.toHaveBeenCalled();expect(response.json()).not.toHaveProperty('extended');
 });
 it('only loads optional historical facts after extended=1 is explicitly requested',async()=>{
  mocks.history.mockResolvedValue({thisMonth:{coverage:1,totals:{pv:7}},total:{coverage:1,totals:{pv:100,uv:9}},peaks:{coverage:1,pv:{value:50,date:'2026-11-01'}}});
  const response=await app.inject('/api/v1/sites/site-a/overview-summary?extended=1');expect(response.statusCode).toBe(200);expect(mocks.history).toHaveBeenCalledWith(ctx,client,'site-a','2026-11-03T08:30:00.000Z',expect.objectContaining({timezone:'Asia/Shanghai'}),{});expect(response.json().extended).toMatchObject({total:{totals:{pv:100,uv:9}},peaks:{pv:{value:50,date:'2026-11-01'}}});
 });
 it('marks fact-based periods pending when publication generation changed',async()=>{
  dirty=true;const response=await app.inject('/api/v1/sites/site-a/overview-summary');const body=response.json();expect(body).toMatchObject({aggregationPending:true,today:{coverage:0},yesterday:{coverage:0},yesterdaySameTime:{coverage:0}});
 });
 it('retains complete today visitor data when yesterday raw bodies were retired',async()=>{
  retiredBefore='2026-11-02T12:00:00.000Z';const response=await app.inject('/api/v1/sites/site-a/overview-summary');expect(response.statusCode).toBe(200);expect(response.json()).toMatchObject({today:{visitors:{new:1,returning:0,unknown:0,status:'complete'}},yesterday:{visitors:{new:null,status:'raw_detail_retired'}},yesterdaySameTime:{visitors:{new:null,status:'raw_detail_retired'}}});
 });
 it('isolates truncated yesterday coverage and retries the smaller yesterday-same-time window once',async()=>{
  mocks.read.mockImplementation(async(_pool:unknown,_site:string,query:{from:Date;to:Date})=>({events:input,coverage:query.to.toISOString()==='2026-11-02T16:00:00.000Z'?0:1,source:'postgres',mode:'postgres',truncated:query.to.toISOString()==='2026-11-02T16:00:00.000Z',rangeStatus:'complete'}));
  const response=await app.inject('/api/v1/sites/site-a/overview-summary');expect(response.statusCode).toBe(200);expect(response.json()).toMatchObject({today:{visitors:{new:1,status:'complete'}},yesterday:{visitors:{new:null,status:'detail_limit_exceeded'}},yesterdaySameTime:{visitors:{new:0,returning:0,unknown:0,status:'complete'}}});
  expect(mocks.read.mock.calls.filter(call=>call[2].to.toISOString()==='2026-11-02T08:30:00.000Z')).toHaveLength(1);expect(mocks.read.mock.calls.filter(call=>call[2].from.toISOString()==='2026-11-02T16:00:00.000Z')).toHaveLength(1);
 });
 it('preserves daily-salt privacy in visit rows and new/returning statistics',async()=>{
  privacy='daily_salt';const response=await app.inject('/api/v1/sites/site-a/visits?'+range);expect(response.json().rows[0]).toMatchObject({ipPrefix:null,visitorType:'unknown'});
  const report=await app.inject('/api/v1/sites/site-a/traffic-report?'+range);expect(report.json().visitors).toEqual({new:null,returning:null,unknown:null,status:'unsupported_in_this_mode'});expect(report.json().groups.visitorType).toEqual([]);
 });
});
