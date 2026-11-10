import {randomUUID,createHmac} from 'node:crypto';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {Pool} from 'pg';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {migrate,lockSite} from '../../src/server/db.js';
import {authFunctions} from '../../src/server/auth.js';
import {registerSites} from '../../src/server/sites.js';
import {registerSiteLifecycle} from '../../src/server/site-lifecycle.js';
import {registerCollect} from '../../src/server/collect.js';
import {registerBotVisitLog,recordBotVisit} from '../../src/server/bot-visit-log.js';
import {registerGovernance} from '../../src/server/governance.js';
import {dispatchClaimedNotification,evaluateAlerts} from '../../src/server/governance-worker.js';
import {registerExternal} from '../../src/server/external.js';
import {hashToken,canonical} from '../../src/server/security.js';
import type {AppContext} from '../../src/server/context.js';
import type {Transport} from '../../src/server/outbound.js';

describe.skipIf(!process.env.TEST_DATABASE_URL)('recoverable site lifecycle with real permissions and concurrent PostgreSQL intake',()=>{
 const schema='lifecycle_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`,max:15}),app=Fastify();
 const owner=randomUUID(),viewer=randomUUID(),outsider=randomUUID(),instanceAdmin=randomUUID(),sessions=new Map<string,string>(),writeKey='lifecycle-test-write-key-0123456789';let ctx:AppContext;
 const headers=(user=owner)=>({cookie:'baize_session='+sessions.get(user)}),requests:{url:string;options:unknown}[]=[];
 let html='',transportStatus=200;
 let external:Awaited<ReturnType<typeof registerExternal>>,outbound=0,archiveDuringFetch:string|undefined;
 const transport:Transport=async(url,options)=>{requests.push({url,options});return {status:transportStatus,headers:{'content-type':'text/html'},text:html};};
 const fresh=async()=>{const id=randomUUID(),config={allowed_hosts:['www.example.test'],write_key_hash:hashToken(writeKey),session_timeout_minutes:20};await pool.query("INSERT INTO sites(id,name,domain,salt_secret,timezone,config) VALUES($1,'保留数据站','example.test','fixture-secret','UTC',$2)",[id,config]);await pool.query("INSERT INTO site_members(site_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'viewer')",[id,owner,viewer]);await pool.query('INSERT INTO aggregation_state(site_id) VALUES($1)',[id]);return {id,config};};
 const archive=(id:string,user=owner,confirmName='保留数据站')=>app.inject({method:'DELETE',url:`/api/v1/sites/${id}`,headers:headers(user),payload:{confirmName}});
 const restore=(id:string,user=owner)=>app.inject({method:'POST',url:`/api/v1/sites/${id}/restore`,headers:headers(user),payload:{confirmName:'保留数据站'}});
 const packet=(id:string)=>({protocol_version:1,site_id:id,sdk:'lifecycle-test',sent_at:Date.now(),events:[{event_id:randomUUID(),visitor_id:randomUUID(),page_id:randomUUID(),ts:Date.now(),type:'pageview',path:'/keep',url:'https://example.test/keep'}]});
 const collect=(id:string,bot=false)=>app.inject({method:'POST',url:'/api/collect',headers:{origin:'https://example.test','user-agent':bot?'Googlebot/2.1':'Mozilla/5.0 Firefox/120'},payload:packet(id)});
 const botIngest=(id:string)=>{const body={sent_at:Date.now(),visits:[{id:randomUUID(),ts:Date.now(),ip:'192.0.2.5',path:'/bot',user_agent:'Googlebot/2.1'}]};return app.inject({method:'POST',url:`/api/v1/sites/${id}/bot-visits/ingest`,headers:{authorization:'Bearer '+writeKey,'x-baize-signature':createHmac('sha256',writeKey).update(canonical(body)).digest('hex')},payload:body});};
 beforeAll(async()=>{
  await admin.query(`CREATE SCHEMA ${schema}`);await migrate(pool);
  for(const id of [owner,viewer,outsider,instanceAdmin]){const session=randomUUID();sessions.set(id,session);await pool.query('INSERT INTO users(id,email,name,password_hash,is_admin) VALUES($1,$2,\'fixture\',\'unused\',$3)',[id,id+'@example.test',id===instanceAdmin]);await pool.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')",[hashToken(session),id]);}
  ctx={pool,redis:null,config:{masterKey:Buffer.alloc(32,9),publicUrl:'https://stats.example.test',dataDir:process.cwd()},...authFunctions(pool),audit:async()=>{}} as AppContext;
  await app.register(cookie);await registerSites(app,ctx);await registerSiteLifecycle(app,ctx,transport);await registerCollect(app,ctx);await registerBotVisitLog(app,ctx);await registerGovernance(app,ctx);
  external=await registerExternal(app,ctx,async()=>{outbound++;if(archiveDuringFetch){await pool.query("UPDATE sites SET config=config||jsonb_build_object('archived_at',now()::text) WHERE id=$1",[archiveDuringFetch]);archiveDuringFetch=undefined;}return {status:200,headers:{'content-type':'text/html'},text:''};});
  app.post('/api/v1/sites/:siteId/storage/history/:id/restore',async()=>({unexpected:true}));
 },120000);
 afterAll(async()=>{await app.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
 it('requires owner session and exact confirmation, preserves data/config, and never revives revoked credentials after restore',async()=>{
  const {id,config}=await fresh(),token='lifecycle-api-token',share='lifecycle-share-token',schedule=randomUUID();
  expect((await collect(id)).statusCode).toBe(202);await recordBotVisit(pool,{siteId:id,ip:'192.0.2.5',userAgent:'Googlebot',path:'/bot',decision:{isBot:true,category:'bot',reason:'ua',ruleId:'search-crawlers',requests:1}});
  await pool.query("INSERT INTO api_tokens(id,site_id,user_id,token_hash,scopes) VALUES($1,$2,$3,$4,ARRAY['admin'])",[randomUUID(),id,owner,hashToken(token)]);await pool.query('INSERT INTO share_links(id,site_id,token_hash) VALUES($1,$2,$3)',[randomUUID(),id,hashToken(share)]);await pool.query("INSERT INTO report_schedules(id,site_id,cadence,next_at) VALUES($1,$2,'daily',now())",[schedule,id]);
  const snapshot=async()=>JSON.stringify((await pool.query('SELECT event_id,visitor_id,path,payload,dimensions FROM events WHERE site_id=$1 ORDER BY event_id',[id])).rows),before=await snapshot();
  expect((await archive(id,viewer)).statusCode).toBe(403);expect((await archive(id,outsider)).statusCode).toBe(403);expect((await archive(id,owner,'保留')).statusCode).toBe(400);
  expect((await app.inject({method:'DELETE',url:`/api/v1/sites/${id}`,headers:{authorization:'Bearer '+token},payload:{confirmName:'保留数据站'}})).statusCode).toBe(403);
  expect((await archive(id)).statusCode).toBe(200);expect(await snapshot()).toBe(before);expect((await pool.query('SELECT count(*)::int n FROM bot_visit_log WHERE site_id=$1',[id])).rows[0].n).toBe(1);
  expect((await app.inject({url:'/api/v1/sites',headers:headers()})).json().sites.some((site:{id:string})=>site.id===id)).toBe(false);
  expect((await app.inject({url:'/api/v1/archived-sites',headers:headers()})).json().sites.some((site:{id:string})=>site.id===id)).toBe(true);expect((await app.inject({url:'/api/v1/archived-sites',headers:headers(viewer)})).json().sites).toEqual([]);
  expect((await collect(id)).statusCode).toBe(410);expect((await collect(id,true)).statusCode).toBe(410);expect((await botIngest(id)).statusCode).toBe(410);
  expect((await app.inject({method:'POST',url:`/api/v1/sites/${id}/storage/history/${randomUUID()}/restore`,headers:headers(),payload:{}})).statusCode).toBe(410);
  expect((await restore(id,viewer)).statusCode).toBe(403);expect((await restore(id,outsider)).statusCode).toBe(403);expect((await restore(id)).statusCode).toBe(200);
  expect((await pool.query('SELECT config FROM sites WHERE id=$1',[id])).rows[0].config).toEqual(config);expect(await snapshot()).toBe(before);
  expect((await pool.query('SELECT revoked FROM api_tokens WHERE site_id=$1',[id])).rows[0].revoked).toBe(true);expect((await pool.query('SELECT revoked FROM share_links WHERE site_id=$1',[id])).rows[0].revoked).toBe(true);expect((await pool.query('SELECT enabled FROM report_schedules WHERE id=$1',[schedule])).rows[0].enabled).toBe(false);
  expect((await app.inject({url:`/api/v1/sites/${id}/tokens`,headers:{authorization:'Bearer '+token}})).statusCode).toBe(401);expect((await app.inject({method:'POST',url:'/api/v1/shares/'+share,payload:{}})).statusCode).toBeGreaterThanOrEqual(400);
  expect((await collect(id)).statusCode).toBe(202);expect((await archive(id,instanceAdmin)).statusCode).toBe(200);expect((await restore(id,instanceAdmin)).statusCode).toBe(200);
 });
 it('rechecks archive state after waiting on the same site lock for human/bot intake and new credentials',async()=>{
  const {id}=await fresh(),blocker=await pool.connect();let pending:Promise<unknown>[]=[];
  try{
   await blocker.query('BEGIN');await lockSite(blocker,id);const pid=(await blocker.query('SELECT pg_backend_pid() pid')).rows[0].pid;
   pending=[collect(id),collect(id,true),botIngest(id),...['tokens','shares','schedules'].map(route=>app.inject({method:'POST',url:`/api/v1/sites/${id}/${route}`,headers:headers(),payload:route==='tokens'?{scopes:['read']}:route==='shares'?{}:{report_id:randomUUID(),channel_id:randomUUID(),cadence:'daily'}}))].map(request=>request.then(value=>value));
   const deadline=Date.now()+10000;let waiting=0;while(Date.now()<deadline){waiting=Number((await pool.query('SELECT count(*) n FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[pid])).rows[0].n);if(waiting>=pending.length)break;await new Promise(resolve=>setTimeout(resolve,25));}expect(waiting).toBe(pending.length);
   await blocker.query("UPDATE sites SET config=config||jsonb_build_object('archived_at',now()::text) WHERE id=$1",[id]);await blocker.query('COMMIT');
   const results=await Promise.all(pending);expect(results.map(response=>(response as {statusCode:number}).statusCode)).toEqual([410,410,410,410,410,410]);
   for(const table of ['events','bot_visit_log','bot_observations','bot_counts','api_tokens','share_links','report_schedules'])expect((await pool.query(`SELECT count(*)::int n FROM ${table} WHERE site_id=$1`,[id])).rows[0].n,table).toBe(0);
  }finally{await blocker.query('ROLLBACK');blocker.release();await Promise.allSettled(pending);}
 });
 it('limits installation checks to authorized HTTPS origins and inspects exact matching tracker markup only',async()=>{
  const {id}=await fresh(),check=(url:string,user=owner)=>app.inject({method:'POST',url:`/api/v1/sites/${id}/installation-check`,headers:headers(user),payload:{url}});
  requests.length=0;expect((await check('https://example.test/',viewer)).statusCode).toBe(403);expect((await check('https://example.test/',outsider)).statusCode).toBe(403);
  for(const url of ['http://example.test/','https://attacker.test/','https://example.test.attacker.test/','https://user:password@example.test/','https://127.0.0.1/'])expect((await check(url)).statusCode).toBe(400);expect(requests).toHaveLength(0);
  html=`<script src="https://stats.example.test/tracker.js" data-site-id="${id}" defer></script><script src="https://evil.test/tracker.js" data-site-id="${id}"></script><script src="https://stats.example.test/tracker.js" data-site-id="another"></script>`;
  const result=await check('https://www.example.test/path#part');expect(result.statusCode,result.body).toBe(200);expect(result.json()).toMatchObject({found:true,matchingScripts:1,otherSiteScripts:2,scope:'html_source',url:'https://www.example.test/path'});expect(requests[0]).toEqual({url:'https://www.example.test/path',options:{allowedOrigin:'https://www.example.test',maxBytes:2_000_000,timeoutMs:10000}});
  html='<html><body>no tracker</body></html>';expect((await check('https://example.test/')).json().found).toBe(false);transportStatus=302;expect((await check('https://example.test/')).statusCode).toBe(422);transportStatus=200;
 });
 it('stops assignments, queued notifications, alerts and automatic external tasks after archive',async()=>{
  const {id}=await fresh(),experiment=randomUUID(),pending=randomUUID(),running=randomUUID();
  await pool.query("UPDATE sites SET config=config||'{\"experiments\":true,\"seoAutoScan\":true}'::jsonb WHERE id=$1",[id]);await pool.query("INSERT INTO experiments(id,site_id,name,variants,goal) VALUES($1,$2,'archive gate','[\"a\",\"b\"]','goal')",[experiment,id]);
  await pool.query("INSERT INTO notification_jobs(id,site_id,body,dedupe_key,status,attempts,lease_until) VALUES($1::uuid,$3,'{}',$1::text,'pending',0,NULL),($2::uuid,$3,'{}',$2::text,'running',1,now()+interval '1 minute')",[pending,running,id]);
  await pool.query("INSERT INTO alert_rules(id,site_id,kind,config) VALUES($1,$2,'offline','{}')",[randomUUID(),id]);
  expect((await archive(id)).statusCode).toBe(200);
  expect((await app.inject({method:'POST',url:`/api/v1/experiments/${experiment}/assign`,payload:{site_id:id,visitor_id:'new-visitor',consent:true}})).statusCode).toBeGreaterThanOrEqual(400);expect((await pool.query('SELECT count(*)::int n FROM experiment_assignments WHERE experiment_id=$1',[experiment])).rows[0].n).toBe(0);
  expect((await pool.query('SELECT status FROM notification_jobs WHERE site_id=$1',[id])).rows.map(row=>row.status)).toEqual(['revoked','revoked']);expect(await dispatchClaimedNotification(ctx,{id:running,site_id:id,attempts:1})).toMatchObject({sent:false});
  const late=randomUUID();await pool.query("INSERT INTO notification_jobs(id,site_id,body,dedupe_key,status,attempts,lease_until) VALUES($1::uuid,$2,'{}',$1::text,'running',1,now()+interval '1 minute')",[late,id]);expect(await dispatchClaimedNotification(ctx,{id:late,site_id:id,attempts:1})).toEqual({sent:false,reason:'site_archived'});
  await evaluateAlerts(ctx);expect((await pool.query('SELECT count(*)::int n FROM notification_jobs WHERE site_id=$1',[id])).rows[0].n).toBe(3);
  outbound=0;expect(await external.runJobs()).toEqual([]);expect(outbound).toBe(0);
  expect((await restore(id)).statusCode).toBe(200);archiveDuringFetch=id;await external.runJobs();expect(outbound).toBe(1);expect((await pool.query('SELECT count(*)::int n FROM seo_scans WHERE site_id=$1',[id])).rows[0].n).toBe(0);
 });
});
