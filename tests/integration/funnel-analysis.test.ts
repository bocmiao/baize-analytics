import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {createApp} from '../../src/server/app.js';
describe.skipIf(!process.env.TEST_DATABASE_URL)('actual PG collector funnel loss analysis',()=>{
 const schema=`funnel_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`});
 const hour=Math.floor((Date.now()-86400000)/3600000)*3600000,visitors=Array.from({length:4},()=>randomUUID());
 let instance:Awaited<ReturnType<typeof createApp>>,temporary:string,cookie:string,site:string,other:string,loose:string,strict:string;
 const range=`from=${new Date(hour).toISOString()}&to=${new Date(hour+4*3600000).toISOString()}`;
 const request=(id=loose,query=range,headers:Record<string,string>={cookie})=>instance.app.inject({url:`/api/v1/sites/${site}/funnels/${id}/analysis?${query}`,headers});
 beforeAll(async()=>{
  await admin.query(`CREATE SCHEMA ${schema}`);temporary=await mkdtemp(join(tmpdir(),'baize-funnel-'));instance=await createApp({pool,redis:null,background:false,clickhouse:null,dataDir:join(temporary,'data'),keyDir:join(temporary,'keys'),masterKey:randomBytes(32)});
  const setup=await instance.app.inject({method:'POST',url:'/api/setup',payload:{email:'funnel@example.invalid',password:'Actual-funnel-password-2026'}});expect(setup.statusCode).toBe(200);cookie=String(setup.headers['set-cookie']).split(';')[0];
  const createSite=async()=>{const response=await instance.app.inject({method:'POST',url:'/api/v1/sites',headers:{cookie},payload:{name:'funnel',domain:'funnel.example.invalid',timezone:'UTC'}});expect(response.statusCode).toBe(201);return response.json().site.id as string;};site=await createSite();other=await createSite();
  const createFunnel=async(isStrict:boolean)=>{const response=await instance.app.inject({method:'POST',url:`/api/v1/sites/${site}/funnels`,headers:{cookie},payload:{name:isStrict?'strict':'loose',strict:isStrict,steps:[{type:'page',value:'/a'},{type:'page',value:'/b'}]}});expect(response.statusCode).toBeLessThan(300);return response.json().id as string;};loose=await createFunnel(false);strict=await createFunnel(true);
  const events:Record<string,unknown>[]=[];
  const add=(visitor:number,path:string,offset:number,channel='direct',flag?:boolean)=>events.push({event_id:randomUUID(),visitor_id:visitors[visitor],page_id:randomUUID(),ts:hour+offset*1000,type:'pageview',url:`https://funnel.example.invalid${path}`,path,utm_medium:channel==='email'?'email':channel==='search'?'organic':undefined,referrer:channel==='search'?'https://google.com/search':undefined,screen:visitor===1?'390x844':'1920x1080',props:flag===undefined?{}:{flag}});
  add(0,'/a',1,'search',false);add(0,'/noise',2);add(0,'/b',3);
  add(1,'/a',1,'email',true);add(2,'/a',1);add(2,'/b',3);
  add(3,'/a',1);add(3,'/a',3601);add(3,'/b',3602);
  const accepted=await instance.app.inject({method:'POST',url:'/api/collect',headers:{origin:'https://funnel.example.invalid','user-agent':'Mozilla/5.0 Chrome/145.0.0.0'},payload:{protocol_version:1,site_id:site,sdk:'funnel-regression',sent_at:Date.now(),events}});expect(accepted.statusCode).toBe(202);expect(accepted.json().accepted).toBe(events.length);
 },30000);
 afterAll(async()=>{await instance?.app.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();if(temporary)await rm(temporary,{recursive:true,force:true});});
 it('uses actual event-time/multi-page sessions, unique visitors and strict/loose progression with typed properties',async()=>{
  const result=await request(loose,`${range}&property=flag`);expect(result.statusCode).toBe(200);expect(result.json()).toMatchObject({status:'supported',coverage:1,truncated:false,storage:{source:'postgres'},steps:[{entered:4,completed:3,lost:1,sources:[{value:'email',count:1}],propertySamples:1,properties:[{type:'boolean',value:'true',count:1}]},{entered:3,lost:0}]});
  const strictResult=(await request(strict,`${range}&property=flag`)).json();expect(strictResult.steps[0]).toMatchObject({entered:4,completed:2,lost:2,propertySamples:2});expect(strictResult.steps[0].sources).toEqual([{value:'email',count:1},{value:'search',count:1}]);expect(strictResult.steps[0].properties).toEqual([{type:'boolean',value:'false',count:1},{type:'boolean',value:'true',count:1}]);
  expect((await request(loose,`${range}&property=user_id`)).statusCode).toBe(400);
  expect((await request(strict,`${range}&property=missing`)).json().steps[0]).toMatchObject({propertySamples:0,missingPropertySamples:2,properties:[]});
  expect((await request('invalid-id')).statusCode).toBe(400);
  await pool.query("UPDATE events SET payload=jsonb_set(payload,'{props,flag}',to_jsonb('true'::text)) WHERE site_id=$1 AND path='/a' AND dimensions->>'channel'='search'",[site]);
  expect((await request(strict,`${range}&property=flag`)).json().steps[0].properties).toEqual([{type:'boolean',value:'true',count:1},{type:'string',value:'true',count:1}]);
 });
 it('enforces actual authentication/site scoping and blocks deleted visitors and identity time segments even with raw remnants',async()=>{
  expect((await request(loose,range,{})).statusCode).toBe(401);
  await pool.query("INSERT INTO users(email,password_hash,name) SELECT 'outsider@example.invalid',password_hash,'outsider' FROM users LIMIT 1");
  const outsider=await instance.app.inject({method:'POST',url:'/api/login',payload:{email:'outsider@example.invalid',password:'Actual-funnel-password-2026'}});expect(outsider.statusCode).toBe(200);const outsiderCookie=String(outsider.headers['set-cookie']).split(';')[0];expect((await request(loose,range,{cookie:outsiderCookie})).statusCode).toBe(403);
  const foreign=await instance.app.inject({url:`/api/v1/sites/${other}/funnels/${loose}/analysis?${range}`,headers:{cookie}});expect(foreign.statusCode).toBe(404);
  const hashed=(await pool.query("SELECT visitor_id FROM events WHERE site_id=$1 AND dimensions->>'channel'='email'",[site])).rows[0].visitor_id;
  await pool.query("INSERT INTO tombstones(site_id,visitor_id,source) VALUES($1,$2,'acceptance')",[site,hashed]);
  expect((await request()).json().steps[0]).toMatchObject({entered:3,completed:3,lost:0});
  const search=(await pool.query("SELECT visitor_id FROM events WHERE site_id=$1 AND dimensions->>'channel'='search'",[site])).rows[0].visitor_id;
  await pool.query('INSERT INTO identity_tombstones(site_id,visitor_id,user_id,started_at,ended_at) VALUES($1,$2,$3,$4,$5)',[site,search,'deleted-A',new Date(hour),new Date(hour+60000)]);
  expect((await request(strict)).json().steps[0]).toMatchObject({entered:2,completed:2,lost:0});
 });
 it('refuses actual PG oversized detail instead of claiming exact UV from a truncated sample',async()=>{
  await pool.query("INSERT INTO events(site_id,event_id,ts,visitor_id,page_id,type,path,payload,dimensions) SELECT $1,gen_random_uuid(),$2::timestamptz+n*interval '1 millisecond','limit-'||n,gen_random_uuid(),'pageview','/a','{}'::jsonb,'{}'::jsonb FROM generate_series(1,100001) n",[site,new Date(hour)]);
  const response=(await request()).json();expect(response).toMatchObject({status:'event_limit_exceeded',coverage:0,truncated:true,steps:[],observedEventsAtLeast:100001,eventLimit:100000});
  await pool.query("DELETE FROM events WHERE site_id=$1 AND visitor_id LIKE 'limit-%'",[site]);
 });
 it('marks daily cross-day and expired/future/oversized ranges unavailable instead of returning historical zero',async()=>{
  await pool.query("UPDATE sites SET privacy_mode='daily_salt' WHERE id=$1",[site]);
  const crossday=`from=${new Date(hour).toISOString()}&to=${new Date(hour+86400000).toISOString()}`;expect((await request(loose,crossday)).json()).toMatchObject({status:'unsupported_in_this_mode',coverage:0,steps:[]});
  await pool.query("UPDATE sites SET privacy_mode='standard',retention_days=1 WHERE id=$1",[site]);expect((await request()).json()).toMatchObject({status:'outside_raw_retention',coverage:0,steps:[]});
  expect((await request(loose,`from=${new Date(hour-100*86400000).toISOString()}&to=${new Date(hour).toISOString()}`)).statusCode).toBe(400);
  expect((await request(loose,`from=${new Date(hour).toISOString()}&to=${new Date(Date.now()+86400000).toISOString()}`)).statusCode).toBe(400);
 });
});
