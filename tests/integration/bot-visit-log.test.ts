import {createHmac,randomUUID} from 'node:crypto';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {migrate} from '../../src/server/db.js';
import {authFunctions} from '../../src/server/auth.js';
import {registerRequestRateLimits} from '../../src/server/request-rate-limit.js';
import {registerCollect} from '../../src/server/collect.js';
import {registerSites} from '../../src/server/sites.js';
import {canonical,hashToken} from '../../src/server/security.js';
import {recordBotVisit,purgeExpiredBotVisits,registerBotVisitLog} from '../../src/server/bot-visit-log.js';
import type {AppContext} from '../../src/server/context.js';
import type {BotDecision} from '../../src/server/bot-filter.js';

describe.skipIf(!process.env.TEST_DATABASE_URL)('spider visit ledger with real PostgreSQL',()=>{
 const schema='bot_visit_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:process.env.TEST_DATABASE_URL});
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`}),app=Fastify();
 let ctx:AppContext;
 const user=randomUUID(),session=randomUUID(),writeKey='local-bot-fixture-write-key-0123456789',headers={cookie:'baize_session='+session};
 const decision:BotDecision={isBot:true,category:'bot',reason:'ua',ruleId:'search-crawlers',requests:1};
 const today=()=>new Date().toISOString().slice(0,10);
 const view=(site:string,query='')=>`/api/v1/sites/${site}/bot-visits?from=${today()}&to=${today()}${query}`;
 async function site(privacy='standard'){
  const id=randomUUID();await pool.query("INSERT INTO sites(id,name,domain,salt_secret,timezone,privacy_mode,retention_days,config) VALUES($1,'spider fixture','example.test','shared-test-salt','UTC',$2,365,$3)",[id,privacy,{write_key_hash:hashToken(writeKey)}]);
  await pool.query("INSERT INTO site_members(site_id,user_id,role) VALUES($1,$2,'owner')",[id,user]);return id;
 }
 const sample=(extra:Record<string,unknown>={})=>({id:randomUUID(),ts:Date.now()-1000,ip:'203.0.113.73',path:'https://example.test/article?token=must-not-save#hidden',user_agent:'Mozilla Googlebot/2.1 raw-ua-private',...extra});
 const signed=(body:unknown,key=writeKey)=>({authorization:'Bearer '+key,'x-baize-signature':createHmac('sha256',key).update(canonical(body)).digest('hex')});
 const post=(site:string,body:Record<string,unknown>,requestHeaders:Record<string,string>=signed(body))=>app.inject({method:'POST',url:`/api/v1/sites/${site}/bot-visits/ingest`,headers:requestHeaders,payload:body});
 beforeAll(async()=>{
  await admin.query(`CREATE SCHEMA ${schema}`);await migrate(pool);
  await pool.query("INSERT INTO users(id,email,name,password_hash,is_admin) VALUES($1,'bot-ledger@example.test','fixture','unused',false)",[user]);
  await pool.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')",[hashToken(session),user]);
  ctx={pool,redis:null,config:{masterKey:Buffer.alloc(32,9)},...authFunctions(pool)} as AppContext;
  await app.register(cookie);registerRequestRateLimits(app,ctx);await registerBotVisitLog(app,ctx);await registerCollect(app,ctx);await registerSites(app,ctx);
 });
 afterAll(async()=>{await app.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
 it('stores site-isolated HMACs, masked IPs and sanitized paths; paginates and counts exact distinct IPs/URLs',async()=>{
  const a=await site(),b=await site();
  for(const [id,ip,path] of [[a,'203.0.113.73','/one?secret=yes#part'],[a,'::ffff:203.0.113.73','/two'],[a,'203.0.113.74','/one'],[b,'203.0.113.73','/one']]){
   expect(await recordBotVisit(pool,{siteId:id!,ip:ip!,path,userAgent:'Googlebot raw-ua-private',decision})).toEqual({recorded:true});
  }
  const stored=(await pool.query('SELECT * FROM bot_visit_log WHERE site_id IN($1,$2)',[a,b])).rows;
  const serialized=JSON.stringify(stored);for(const raw of ['203.0.113.73','203.0.113.74','::ffff:','raw-ua-private','secret=yes','#part'])expect(serialized).not.toContain(raw);
  expect(stored.filter(row=>row.site_id===a).every(row=>row.ip_prefix==='203.0.113.0')).toBe(true);
  expect(stored.find(row=>row.site_id===a).ip_identity).not.toBe(stored.find(row=>row.site_id===b).ip_identity);
  const response=await app.inject({url:view(a,'&limit=2'),headers});expect(response.statusCode,response.body).toBe(200);
  const body=response.json();expect(body.totals).toMatchObject({visits:3,ips:2,urls:2});expect(body.rows).toHaveLength(2);expect(body.pages).toBe(2);
  expect(body.summary).toEqual([expect.objectContaining({engine:'google',category:'bot',visits:3,ips:2,urls:2})]);
  expect(JSON.stringify(body.rows)).not.toContain('ip_identity');expect(response.body).not.toContain('receipt_hash');
  const next=(await app.inject({url:view(a,'&limit=2&page=2'),headers})).json();expect(next.rows).toHaveLength(1);
  expect(new Set([...body.rows,...next.rows].map(row=>row.id)).size).toBe(3);
  expect((await app.inject({url:view(a,'&engine=bing'),headers})).json().rows).toHaveLength(0);
 });
 it('requires the server key AND signature, rejects browser submissions, and makes authenticated retries idempotent',async()=>{
  const id=await site(),visit=sample(),body={sent_at:Date.now(),visits:[visit]};
  expect((await post(id,body,{})).statusCode).toBe(401);
  expect((await post(id,body,signed(body,'wrong-key-00000000000000000000000'))).statusCode).toBe(401);
  expect((await post(id,body,{authorization:'Bearer '+writeKey,'x-baize-signature':'0'.repeat(64)})).statusCode).toBe(401);
  expect((await post(id,body,{...signed(body),origin:'https://example.test'})).statusCode).toBe(403);
  expect((await post(id,body,{...signed(body),cookie:headers.cookie})).statusCode).toBe(403);
  const expired={...body,sent_at:Date.now()-600000};expect((await post(id,expired)).statusCode).toBe(400);
  const valid=await post(id,body);expect(valid.statusCode,valid.body).toBe(202);expect(valid.json()).toMatchObject({accepted:1,duplicates:0,rejected:[]});
  expect((await post(id,body)).json()).toMatchObject({accepted:0,duplicates:1,rejected:[]});
  const conflict={sent_at:Date.now(),visits:[{...visit,path:'/changed'}]};expect((await post(id,conflict)).json().rejected).toEqual([{id:visit.id,reason:'id_conflict'}]);
  const records=(await pool.query('SELECT * FROM bot_visit_log WHERE site_id=$1',[id])).rows;expect(records).toHaveLength(1);expect(records[0].source).toBe('server_log');
  expect(JSON.stringify(records)).not.toContain('must-not-save');expect(JSON.stringify(records)).not.toContain('raw-ua-private');
  await pool.query("UPDATE sites SET config=jsonb_set(config,'{write_key_hash}',to_jsonb($2::text)) WHERE id=$1",[id,hashToken('rotated-private-key')]);
  expect((await post(id,body)).statusCode).toBe(401);
 });
 it('does not convert excluded traffic or ordinary user agents to crawler entries',async()=>{
  const id=await site();await pool.query("UPDATE sites SET config=config||'{\"excluded_ips\":[\"198.51.100.0/24\"]}'::jsonb WHERE id=$1",[id]);
  const ordinary=sample({user_agent:'Mozilla/5.0 Chrome/145'}),excluded=sample({ip:'198.51.100.1'}),invalid=sample({ip:'not-an-address'});
  const result=await post(id,{sent_at:Date.now(),visits:[ordinary,excluded,invalid]});expect(result.statusCode,result.body).toBe(202);
  expect(result.json()).toMatchObject({accepted:0,rejected:[{id:ordinary.id,reason:'not_detected_as_bot'},{id:excluded.id,reason:'excluded_ip'},{id:invalid.id,reason:'invalid_ip'}]});
  expect(await recordBotVisit(pool,{siteId:id,ip:'198.51.100.2',path:'/',userAgent:'Googlebot',decision})).toEqual({recorded:false,reason:'excluded_ip'});
  expect((await app.inject({url:view(id),headers})).json().totals.visits).toBe(0);
 });
 it('authorizes reads against real membership and site-scoped tokens',async()=>{
  const id=await site(),other=await site(),token='site-read-token-fixture';
  await pool.query("INSERT INTO api_tokens(id,site_id,user_id,token_hash,scopes) VALUES($1,$2,$3,$4,ARRAY['read'])",[randomUUID(),id,user,hashToken(token)]);
  expect((await app.inject({url:view(id)})).statusCode).toBe(401);
  expect((await app.inject({url:view(id),headers:{authorization:'Bearer '+token}})).statusCode).toBe(200);
  expect((await app.inject({url:view(other),headers:{authorization:'Bearer '+token}})).statusCode).toBe(403);
  await pool.query('DELETE FROM site_members WHERE site_id=$1 AND user_id=$2',[other,user]);
  expect((await app.inject({url:view(other),headers})).statusCode).toBe(403);
 });
 it('omits every IP identity/prefix in daily-salt mode and reports IP count as unavailable',async()=>{
  const id=await site('daily_salt');await recordBotVisit(pool,{siteId:id,ip:'2001:db8:1::73',path:'/',userAgent:'Googlebot',decision});
  expect((await pool.query('SELECT ip_identity,ip_prefix FROM bot_visit_log WHERE site_id=$1',[id])).rows).toEqual([{ip_identity:null,ip_prefix:null}]);
  const data=(await app.inject({url:view(id),headers})).json();expect(data).toMatchObject({ipStatus:'unsupported_in_this_mode',totals:{visits:1,ips:null,urls:1}});expect(data.summary[0].ips).toBeNull();
 });
 it('enforces retention on ingest and reads, cleans shortened policies, and cascades site removal',async()=>{
  const id=await site();
  expect(await recordBotVisit(pool,{siteId:id,ip:'203.0.113.73',path:'/',userAgent:'Googlebot',decision,at:Date.now()-91*86400000})).toMatchObject({recorded:false,reason:'outside_retention_or_future'});
  await recordBotVisit(pool,{siteId:id,ip:'203.0.113.73',path:'/old',userAgent:'Googlebot',decision,at:Date.now()-2*86400000});
  await recordBotVisit(pool,{siteId:id,ip:'203.0.113.73',path:'/new',userAgent:'Googlebot',decision});
  await pool.query('UPDATE sites SET retention_days=1 WHERE id=$1',[id]);expect(await purgeExpiredBotVisits(pool)).toBeGreaterThanOrEqual(1);
  expect((await pool.query('SELECT path FROM bot_visit_log WHERE site_id=$1',[id])).rows).toEqual([{path:'/new'}]);
  await pool.query("UPDATE bot_visit_log SET expires_at=now()-interval '1 second' WHERE site_id=$1",[id]);
  expect((await app.inject({url:view(id),headers})).json().rows).toHaveLength(0);await purgeExpiredBotVisits(pool);
  await recordBotVisit(pool,{siteId:id,ip:'203.0.113.73',path:'/cascade',userAgent:'Googlebot',decision});
  await pool.query('DELETE FROM sites WHERE id=$1',[id]);expect((await pool.query('SELECT id FROM bot_visit_log WHERE site_id=$1',[id])).rows).toHaveLength(0);
 });
 it('blocks privacy-mode changes when a site has only spider visits and no normal events',async()=>{
  for(const privacy of ['standard','daily_salt']){
   const id=await site(privacy);
   await recordBotVisit(pool,{siteId:id,ip:'203.0.113.73',path:'/',userAgent:'Googlebot',decision});
   expect((await pool.query('SELECT 1 FROM event_keys WHERE site_id=$1',[id])).rowCount).toBe(0);
   const response=await app.inject({method:'PATCH',url:`/api/v1/sites/${id}`,headers,payload:{privacy_mode:privacy==='standard'?'daily_salt':'standard'}});
   expect(response.statusCode,response.body).toBe(409);
   expect((await pool.query('SELECT privacy_mode FROM sites WHERE id=$1',[id])).rows[0].privacy_mode).toBe(privacy);
  }
 });
 it('reports incomplete identities honestly for old mixed-mode records and hides prefixes in daily mode',async()=>{
  const id=await site('daily_salt');
  await recordBotVisit(pool,{siteId:id,ip:'203.0.113.73',path:'/private',userAgent:'Googlebot',decision});
  // Simulate data restored from a deployment before the spider mode guard.
  await pool.query("UPDATE sites SET privacy_mode='standard' WHERE id=$1",[id]);
  let data=(await app.inject({url:view(id),headers})).json();
  expect(data).toMatchObject({ipStatus:'not_collected',ipCoverage:0,totals:{visits:1,ips:null,knownIps:0}});
  await recordBotVisit(pool,{siteId:id,ip:'203.0.113.73',path:'/known',userAgent:'Googlebot',decision});
  await recordBotVisit(pool,{siteId:id,ip:'203.0.113.73',path:'/bing',userAgent:'bingbot',decision});
  data=(await app.inject({url:view(id),headers})).json();
  expect(data).toMatchObject({ipStatus:'partial_ip_identity',ipCoverage:2/3,totals:{visits:3,ips:null,knownIps:1}});
  expect(data.summary.find((row:Record<string,unknown>)=>row.engine==='google')).toMatchObject({ips:null,knownIps:1,ipCoverage:0.5,ipStatus:'partial_ip_identity'});
  expect(data.summary.find((row:Record<string,unknown>)=>row.engine==='bing')).toMatchObject({ips:1,ipCoverage:1,ipStatus:'complete'});
  await pool.query("UPDATE sites SET privacy_mode='daily_salt' WHERE id=$1",[id]);
  data=(await app.inject({url:view(id),headers})).json();
  expect(data).toMatchObject({ipStatus:'unsupported_in_this_mode',ipCoverage:0,totals:{ips:null,knownIps:null}});
  expect(data.rows.every((row:Record<string,unknown>)=>row.ip_prefix===null)).toBe(true);
  expect(JSON.stringify(data)).not.toContain('203.0.113.0');
  expect(JSON.stringify(data.rows)).not.toContain('ip_identity');
 });
 it('bounds authenticated ingestion even when Redis is unavailable',async()=>{
  const id=await site(),body={sent_at:Date.now(),visits:[sample()]};
  ctx.redis={eval:async()=>{throw Error('fixture redis unavailable');}} as unknown as AppContext['redis'];
  try{
   for(let count=0;count<120;count++)expect((await post(id,body)).statusCode).toBe(202);
   const response=await post(id,body);expect(response.statusCode).toBe(429);expect(response.headers['retry-after']).toBe('60');
  }finally{ctx.redis=null;}
 });
 it('the real collector rejects bad credentials and excluded IPs before writing either bot ledger',async()=>{
  const id=await site();await pool.query("UPDATE sites SET config=config||'{\"excluded_ips\":[\"198.51.100.0/24\"]}'::jsonb WHERE id=$1",[id]);
  const envelope={protocol_version:1,site_id:id,sdk:'bot-ledger-collector-test',sent_at:Date.now(),events:[
   {event_id:randomUUID(),visitor_id:randomUUID(),page_id:randomUUID(),ts:Date.now(),type:'pageview',url:'https://example.test/first',path:'/first?private=yes#hidden'},
   {event_id:randomUUID(),visitor_id:randomUUID(),page_id:randomUUID(),ts:Date.now(),type:'pageview',url:'https://example.test/second',path:'/second'},
  ]};
  const send=(ip:string,extraHeaders:Record<string,string>={})=>app.inject({method:'POST',url:'/api/collect',remoteAddress:ip,headers:{'user-agent':'Googlebot/2.1',...extraHeaders},payload:envelope});
  expect((await send('203.0.113.73',{authorization:'Bearer invalid-private-key'})).statusCode).toBe(401);
  expect((await send('198.51.100.1')).statusCode).toBe(204);
  expect((await pool.query('SELECT id FROM bot_visit_log WHERE site_id=$1',[id])).rowCount).toBe(0);
  expect((await pool.query('SELECT site_id FROM bot_observations WHERE site_id=$1',[id])).rowCount).toBe(0);
  expect((await send('203.0.113.73')).statusCode).toBe(204);
  const rows=(await pool.query('SELECT source,path FROM bot_visit_log WHERE site_id=$1',[id])).rows;
  expect(rows).toEqual([{source:'collector',path:'/first'}]);
  expect((await pool.query('SELECT filtered_requests,declared_events FROM bot_observations WHERE site_id=$1',[id])).rows).toEqual([{filtered_requests:'1',declared_events:'2'}]);
 });
});
