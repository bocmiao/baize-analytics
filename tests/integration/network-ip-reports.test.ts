import {randomBytes,randomUUID} from 'node:crypto';
import Fastify from 'fastify';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {migrate} from '../../src/server/db.js';
import {runWorkerOnce} from '../../src/server/worker.js';
import {registerCollect} from '../../src/server/collect.js';
import {register51laReports} from '../../src/server/51la-reports.js';
import {queryStats,registerAnalytics} from '../../src/server/analytics.js';
import {aggregate,sessionize,emptyBucket,type AnalyticsEvent} from '../../src/server/analytics-core.js';
import {queryRealtime} from '../../src/server/realtime-analysis.js';
import {registerGeographyAnalytics} from '../../src/server/geography-analytics.js';
import {query51laHistory} from '../../src/server/51la-history-summary.js';
import {networkIPIdentity,publicIPKey} from '../../src/server/network-ip.js';
import {queryPublishedIPMetrics} from '../../src/server/published-ip-metrics.js';
import type {AppContext} from '../../src/server/context.js';

describe.skipIf(!process.env.TEST_DATABASE_URL)('51LA full IP collection and published history (isolated PostgreSQL)',()=>{
 const schema='network_ip_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`}),app=Fastify({trustProxy:false}),statsApp=Fastify();
 const site='network-'+randomUUID(),daily='daily-'+randomUUID(),legacy='legacy-'+randomUUID(),secret='ip-test-site-secret',visitorA=randomUUID(),visitorB=randomUUID(),visitorC=randomUUID();
 const ctx={pool,redis:null,config:{dataDir:process.cwd(),masterKey:randomBytes(32),publicUrl:'http://localhost'},authorize:async()=>({id:'owner'}),audit:async()=>{}} as unknown as AppContext;
 const now=Date.now(),from=new Date(now-3600000).toISOString(),to=new Date(now+1000).toISOString(),legacyStart=Math.floor(now/3600000)*3600000-3*3600000;
 const packet=(visitor:string,path:string,ts:number)=>({event_id:randomUUID(),visitor_id:visitor,page_id:randomUUID(),type:'pageview',ts,path,url:'https://network.example.test'+path});
 const send=(siteId:string,address:string,events:unknown[],xff?:string)=>app.inject({method:'POST',url:'/api/collect',remoteAddress:address,headers:{origin:'https://network.example.test','user-agent':'Mozilla/5.0 Firefox/120',...(xff?{'x-forwarded-for':xff}:{})},payload:{protocol_version:1,site_id:siteId,sdk:'ip-integration',sent_at:Date.now(),events}});
 const publish=async()=>{for(let i=0;i<20;i++){if(!await runWorkerOnce(pool))return;}throw Error('worker did not finish isolated fixture');};
 const metrics=async()=>{const c=await pool.connect();try{return await queryPublishedIPMetrics(c,site,'0001-01-01T00:00:00Z',new Date(Date.now()+1000).toISOString(),'UTC',false,from);}finally{c.release();}};
 beforeAll(async()=>{
  await admin.query(`CREATE SCHEMA ${schema}`);await migrate(pool);for(const [id,mode] of [[site,'standard'],[daily,'daily_salt']]){await pool.query("INSERT INTO sites(id,name,domain,salt_secret,timezone,privacy_mode) VALUES($1,'network test','network.example.test',$2,'UTC',$3)",[id,secret,mode]);await pool.query('INSERT INTO aggregation_state(site_id) VALUES($1)',[id]);}
  await registerCollect(app,ctx,address=>({country:'CN',region:'Henan',city:address==='192.0.2.1'?'洛阳':'郑州',isp:address==='192.0.2.1'?'中国联通':'中国移动'}));await register51laReports(app,ctx);await registerGeographyAnalytics(app,ctx);
  await registerAnalytics(statsApp,ctx);
  await pool.query("INSERT INTO sites(id,name,domain,salt_secret,timezone) VALUES($1,'legacy IP fixture','network.example.test',$2,'UTC')",[legacy,secret]);await pool.query('INSERT INTO aggregation_state(site_id,generation,processed_generation) VALUES($1,1,1)',[legacy]);
  const legacyEvents:AnalyticsEvent[]=[[10,'legacy-a','192.0.2.1','direct'],[20,'legacy-b','192.0.2.2','search'],[30,'legacy-c','192.0.2.1','direct'],[70,'legacy-a','192.0.2.1','direct'],[80,'legacy-d','192.0.2.3','search'],[90,'legacy-e','192.0.2.1','direct']].map(([minute,visitor,address,channel])=>({site_id:legacy,event_id:randomUUID(),visitor_id:String(visitor),page_id:randomUUID(),type:'pageview',ts:new Date(legacyStart+Number(minute)*60000),path:'/'+channel,payload:{url:'https://network.example.test/'+channel},dimensions:{channel:String(channel),client_ip_id:networkIPIdentity(String(address),legacy,secret)!}}));
  for(const event of legacyEvents)await pool.query('INSERT INTO events(site_id,event_id,ts,visitor_id,page_id,type,path,payload,dimensions) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[event.site_id,event.event_id,event.ts,event.visitor_id,event.page_id,event.type,event.path,event.payload,event.dimensions]);
  const buckets=aggregate(legacyEvents,sessionize(legacyEvents,'UTC',false,1800000),event=>new Date(Math.floor(+new Date(event.ts)/3600000)*3600000).toISOString());for(const [hour,bucket] of buckets)await pool.query('INSERT INTO stats_hourly(site_id,hour,data,generation) VALUES($1,$2,$3,1)',[legacy,hour,bucket]);
 },120000);
 afterAll(async()=>{await app.close();await statsApp.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
 it('uses trusted socket address rather than forged forwarding headers and preserves idempotency',async()=>{
  const events=[packet(visitorA,'/a',now-120000),packet(visitorB,'/b',now-110000)];const response=await send(site,'192.0.2.1',events,'203.0.113.7');expect(response.statusCode,response.body).toBe(202);expect(response.json()).toMatchObject({accepted:2});expect((await send(site,'192.0.2.1',events,'203.0.113.8')).json()).toMatchObject({duplicates:2});
  expect((await send(site,'192.0.2.2',[packet(visitorA,'/next',now-100000),packet(visitorC,'/c',now-90000)])).statusCode).toBe(202);
  const rows=(await pool.query('SELECT dimensions FROM events WHERE site_id=$1',[site])).rows;expect(rows).toHaveLength(4);expect(new Set(rows.map(row=>row.dimensions.client_ip_id)).size).toBe(2);expect(rows.map(row=>row.dimensions.client_ip_id)).toContain(networkIPIdentity('192.0.2.1',site,secret));expect(JSON.stringify(rows)).not.toContain('192.0.2.1');expect(JSON.stringify(rows)).not.toContain('203.0.113.7');await publish();
 },120000);
 it('returns real same-prefix distinct IPs and masked selectors without HMAC in reports or generic stats',async()=>{
  const response=await app.inject(`/api/v1/sites/${site}/traffic-report?`+new URLSearchParams({from,to}));expect(response.statusCode,response.body).toBe(200);const report=response.json();expect(report.totals).toMatchObject({pv:4,uv:3,ips:2,ipCoverage:1,ipStatus:'complete'});expect(report.groups.ip).toHaveLength(2);expect(report.groups.ipPrefix[0]).toMatchObject({ips:2});expect(response.body).not.toContain(networkIPIdentity('192.0.2.1',site,secret));
  const key=publicIPKey(networkIPIdentity('192.0.2.2',site,secret))!;const visits=await app.inject(`/api/v1/sites/${site}/visits?`+new URLSearchParams({from,to,ipKey:key}));expect(visits.statusCode,visits.body).toBe(200);expect(visits.json().rows.every((row:{ipKeys:string[]})=>row.ipKeys.includes(key))).toBe(true);
  const stats=await queryStats(ctx,site,from,new Date().toISOString());expect(stats.totals.ips).toBe(2);expect(stats).toMatchObject({ipCoverage:1,ipStatus:'complete',distinctStorage:'postgres_relation'});expect(JSON.stringify(stats)).not.toContain('client_ip_id');expect(JSON.stringify(stats)).not.toContain(networkIPIdentity('192.0.2.1',site,secret));const realtime=await queryRealtime(ctx,site);expect(realtime.events).toHaveLength(4);expect(JSON.stringify(realtime)).not.toContain('client_ip_id');
 },120000);
 it('never writes stable network identities in daily-salt mode',async()=>{
  const response=await send(daily,'192.0.2.1',[packet(randomUUID(),'/daily',now-10000)]);expect(response.statusCode,response.body).toBe(202);const row=(await pool.query('SELECT dimensions FROM events WHERE site_id=$1',[daily])).rows[0];expect(row.dimensions).not.toHaveProperty('client_ip_id');expect(row.dimensions.ip_truncated).toBeNull();await publish();
 },120000);
 it('accepts bounded repeated trend labels over HTTP and keeps absent group totals exact',async()=>{
  const params=new URLSearchParams({from,to,trendDimension:'city'});params.append('trendLabels','洛阳');params.append('trendLabels','不存在的城市');
  const response=await app.inject(`/api/v1/sites/${site}/traffic-report?${params}`);expect(response.statusCode,response.body).toBe(200);
  const body=response.json();expect(body.groups.city.find((row:Record<string,unknown>)=>row.label==='不存在的城市')).toMatchObject({pv:0,uv:0,ips:0,sessions:0});
  expect(new Set(body.dimensionTrend.city.map((row:Record<string,unknown>)=>row.label))).toEqual(new Set(['洛阳','不存在的城市']));
  expect(body.dimensionTrend.city.filter((row:Record<string,unknown>)=>row.label==='洛阳').reduce((sum:number,row:{pv:number})=>sum+row.pv,0)).toBe(2);
 },120000);
 it('drills geography into exact IP/ISP totals and site-calendar trends while preserving privacy limits',async()=>{
  const response=await app.inject(`/api/v1/sites/${site}/geography?`+new URLSearchParams({from,to,country:'CN',region:'河南',city:'洛阳市',isp:'中国联通'}));expect(response.statusCode,response.body).toBe(200);const body=response.json();expect(body).toMatchObject({coverage:1,status:'supported',selected:{totals:{pv:2,uv:2,ips:1,ipCoverage:1}}});expect(body.regions[0]).toMatchObject({region:'河南',pv:2,ips:1});expect(body.isps).toEqual([expect.objectContaining({isp:'中国联通',ips:1})]);expect(body.trend.reduce((sum:number,row:{pv:number})=>sum+row.pv,0)).toBe(2);expect(response.body).not.toContain('client_ip_id');
  const privateReport=await app.inject(`/api/v1/sites/${daily}/geography?`+new URLSearchParams({from:new Date(now-2*86400000).toISOString(),to}));expect(privateReport.statusCode,privateReport.body).toBe(200);expect(privateReport.json().selected.totals).toMatchObject({pv:1,uv:null,ips:null,ipStatus:'unsupported_in_this_mode'});expect(privateReport.json().trend.reduce((sum:number,row:{uv:number})=>sum+row.uv,0)).toBe(1);
  const outside=await app.inject(`/api/v1/sites/${site}/geography?`+new URLSearchParams({from:new Date(now-400*86400000).toISOString(),to:new Date(now-399*86400000).toISOString()}));expect(outside.statusCode,outside.body).toBe(200);expect(outside.json()).toMatchObject({coverage:0,status:'outside_raw_retention',selected:{totals:{pv:null,ips:null}}});
 },120000);
 it('supports all-result visit sorting, prefix filters, pagination, path drill and CSV independently of page size',async()=>{
  const target=site+'-visits',start=now-4*3600000;
  await pool.query("INSERT INTO sites(id,name,domain,salt_secret,timezone,privacy_mode) VALUES($1,'visit report fixture','network.example.test',$2,'UTC','standard')",[target,secret]);await pool.query('INSERT INTO aggregation_state(site_id) VALUES($1)',[target]);
  for(let index=0;index<27;index++){
   const visitor='history-'+String(index).padStart(2,'0'),timestamp=new Date(start+index*60000),dimensions={country:'CN',region:index<20?'Henan':'Sichuan',city:index<20?'洛阳':'成都',channel:'search',referrer:'google.com',keyword:index===0?'=HYPERLINK("evil")':'stats',ip_truncated:'192.0.2.0',client_ip_id:networkIPIdentity('192.0.2.'+(index%3+1),target,secret)!};
   await pool.query("INSERT INTO events(site_id,event_id,ts,visitor_id,page_id,type,path,payload,dimensions) VALUES($1,$2,$3,$4,$5,'pageview',$6,'{}',$7)",[target,randomUUID(),timestamp,visitor,randomUUID(),'/docs/'+index,dimensions]);
   await pool.query('INSERT INTO visitor_first_seen(site_id,visitor_id,first_date) VALUES($1,$2,$3)',[target,visitor,timestamp.toISOString().slice(0,10)]);
  }
  await pool.query("INSERT INTO events(site_id,event_id,ts,visitor_id,page_id,type,path,payload,dimensions) VALUES($1,$2,$3,'history-00',$4,'pageview','/second-session','{}',$5)",[target,randomUUID(),new Date(start+2*3600000),randomUUID(),{country:'CN',region:'Henan',channel:'direct'}]);
  const params={from:new Date(start-60000).toISOString(),to:new Date(now).toISOString()},url=(route:string,extra:Record<string,string>={})=>`/api/v1/sites/${target}/${route}?`+new URLSearchParams({...params,...extra});
  const asc=await app.inject(url('visits',{sort:'time',direction:'asc',pageSize:'10',page:'2'}));expect(asc.statusCode,asc.body).toBe(200);expect(asc.json()).toMatchObject({total:28,page:2,pageSize:10,coverage:1});expect(asc.json().rows[0].visitorKey).toBe('history-10');
  const filtered=await app.inject(url('visits',{country:'cn',region:'Henan',ipLabel:'192.0.2',visitorKey:'history-0'}));expect(filtered.json().total).toBe(10);
  const history=await app.inject(url('visits',{visitorKey:'history-00'}));expect(history.json().total).toBe(2);expect(history.json().rows.map((row:{entry:string})=>row.entry)).toEqual(['/second-session','/docs/0']);
  const drill=await app.inject(url('visits',{visitDimension:'page',visitLabel:'/docs/5'}));expect(drill.json().rows).toHaveLength(1);expect(drill.json().rows[0].paths.map((row:{path:string})=>row.path)).toEqual(['/docs/5']);
  const csv=await app.inject(url('visits.csv',{pageSize:'1',page:'9',sort:'time',direction:'asc'}));expect(csv.statusCode,csv.body).toBe(200);expect(csv.headers['x-baize-export-rows']).toBe('28');expect(csv.headers['x-baize-export-truncated']).toBe('false');expect(csv.headers['content-type']).toContain('text/csv');expect(csv.body).toContain('"\'=HYPERLINK(""evil"")"');expect(csv.body).toContain('/docs/26');expect(csv.body).not.toContain('client_ip_id');expect(csv.body).not.toContain(networkIPIdentity('192.0.2.1',target,secret));
  const bounded=await app.inject(url('visits.csv',{to:new Date(start+10*60000).toISOString()}));expect(bounded.headers['x-baize-export-rows']).toBe('10');expect(bounded.body).not.toContain('/docs/10');expect(bounded.body).not.toContain('/second-session');
  const geo=await app.inject(url('geography',{country:'CN',region:'河南'}));expect(geo.statusCode,geo.body).toBe(200);expect(geo.json().selected.totals).toMatchObject({pv:21,uv:20,sessions:21,newVisitors:20,returningVisitors:0,unknownVisitors:0});
  const rules=[{id:randomUUID(),name:'文档',path:'/docs',match:'prefix',enabled:true,createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString()}];await pool.query("UPDATE sites SET config=jsonb_set(config,'{directory_rules}',$2::jsonb) WHERE id=$1",[target,JSON.stringify(rules)]);
  const directory=await app.inject(url('traffic-report',{trendDimension:'directory'}));expect(directory.json().groups.directory.find((row:{label:string})=>row.label==='文档')).toMatchObject({pv:27,sessions:27});const directoryVisits=await app.inject(url('visits',{visitDimension:'directory',visitLabel:'文档'}));expect(directoryVisits.json().total).toBe(27);
  const expired=await app.inject(url('visits.csv',{from:new Date(now-400*86400000).toISOString(),to:new Date(now-399*86400000).toISOString()}));expect(expired.statusCode).toBe(409);
  const denied=Fastify();await register51laReports(denied,{...ctx,authorize:async()=>{throw Object.assign(new Error('forbidden'),{statusCode:403});}});try{expect((await denied.inject(url('visits.csv'))).statusCode).toBe(403);expect((await denied.inject(url('visits'))).statusCode).toBe(403);}finally{await denied.close();}
 },120000);
 it('unions IPs across retained facts after raw expiry instead of adding daily distincts',async()=>{
  const old=new Date(now-40*86400000),oldId=randomUUID();await pool.query("INSERT INTO events(site_id,event_id,ts,visitor_id,page_id,type,path,payload,dimensions) VALUES($1,$2,$3,$4,$5,'pageview','/archive','{}',$6)",[site,oldId,old,visitorA,randomUUID(),JSON.stringify({client_ip_id:networkIPIdentity('192.0.2.1',site,secret),ip_truncated:'192.0.2.0'})]);await pool.query('UPDATE aggregation_state SET generation=generation+1 WHERE site_id=$1',[site]);await publish();await pool.query('UPDATE sites SET retention_days=30 WHERE id=$1',[site]);await pool.query('DELETE FROM events WHERE site_id=$1 AND event_id=$2',[site,oldId]);
  const exact=await metrics();expect(exact.total).toMatchObject({ips:2,pageviews:5,knownPageviews:5,ipCoverage:1});expect([...exact.days.values()].reduce((sum,row)=>sum+row.ips!,0)).toBe(3);
  const response=await app.inject(`/api/v1/sites/${site}/overview-summary?extended=1`);expect(response.statusCode,response.body).toBe(200);expect(response.json().extended.total.totals).toMatchObject({pv:5,ips:2});expect(response.json().extended.history).toMatchObject({ipStatus:'complete',ipCoverage:1});expect(response.json().extended.peaks.ips.value).toBe(2);
 },120000);
 it('honors visitor and time-bounded identity tombstones even before a new published rebuild',async()=>{
  const c=await pool.connect();try{await c.query('BEGIN');await c.query('INSERT INTO tombstones(site_id,visitor_id) VALUES($1,$2)',[site,visitorC]);await c.query("INSERT INTO identity_tombstones(site_id,visitor_id,user_id,started_at,ended_at) VALUES($1,$2,'erased-user',$3,$4)",[site,visitorA,new Date(now-105000),new Date(now-95000)]);const exact=await queryPublishedIPMetrics(c,site,'0001-01-01T00:00:00Z',to,'UTC',false,from);expect(exact.total).toMatchObject({ips:1,pageviews:3,knownPageviews:3,ipCoverage:1});const history=await query51laHistory(ctx,c,site,new Date().toISOString(),{timezone:'UTC',privacy_mode:'standard'});expect(history.total.totals).toMatchObject({pv:3,ips:1});await c.query('ROLLBACK');}catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
 });
 it('reports partial coverage for historical pages without IDs instead of treating their prefix as an IP',async()=>{
  await pool.query("INSERT INTO events(site_id,event_id,ts,visitor_id,page_id,type,path,payload,dimensions) VALUES($1,$2,$3,'old-unknown',$4,'pageview','/old','{}',$5)",[site,randomUUID(),new Date(now-30000),randomUUID(),JSON.stringify({ip_truncated:'192.0.2.0'})]);await pool.query('UPDATE aggregation_state SET generation=generation+1 WHERE site_id=$1',[site]);await publish();const exact=await metrics();expect(exact.total).toMatchObject({ips:null,knownIps:2,ipStatus:'partial_ip_identity'});expect(exact.total.ipCoverage).toBeCloseTo(5/6);
  const response=await app.inject(`/api/v1/sites/${site}/overview-summary?extended=1`);expect(response.statusCode,response.body).toBe(200);expect(response.json().extended.total.totals.ips).toBeNull();expect(response.json().extended.peaks.ips.value).toBeNull();
 },120000);
 it('provides exact legacy stats IP union, partial-hour filters and previous-period comparisons over HTTP',async()=>{
  expect((await pool.query('SELECT count(*)::int n FROM analytics_fact_runs WHERE site_id=$1',[legacy])).rows[0].n).toBe(0);
  const url=(start:number,end:number,extra:Record<string,string>={})=>`/api/v1/sites/${legacy}/stats?`+new URLSearchParams({from:new Date(start).toISOString(),to:new Date(end).toISOString(),...extra});
  const full=await statsApp.inject(url(legacyStart,legacyStart+2*3600000));expect(full.statusCode,full.body).toBe(200);expect(full.json()).toMatchObject({coverage:1,ipCoverage:1,ipStatus:'complete',totals:{pv:6,ips:3}});expect(full.json().trend.map((row:{ips:number})=>row.ips)).toEqual([2,2]);expect(full.body).not.toContain('client_ip_id');expect(full.body).not.toContain(networkIPIdentity('192.0.2.1',legacy,secret));
  const compared=await statsApp.inject(url(legacyStart+3600000,legacyStart+2*3600000,{compare:'previous'}));expect(compared.statusCode,compared.body).toBe(200);expect(compared.json()).toMatchObject({totals:{pv:3,ips:2},comparison:{totals:{pv:3,ips:2},change:{ips:0}}});
  for(const [filter,ips,pv] of [[{channel:'search'},2,2],[{path:'/direct'},1,4]] as const){const filtered=await statsApp.inject(url(legacyStart,legacyStart+2*3600000,filter));expect(filtered.statusCode,filtered.body).toBe(200);expect(filtered.json()).toMatchObject({coverage:1,totals:{pv,ips}});}
  const boundary=await statsApp.inject(url(legacyStart+15*60000,legacyStart+75*60000));expect(boundary.statusCode,boundary.body).toBe(200);expect(boundary.json()).toMatchObject({coverage:1,totals:{pv:3,ips:2}});
 });
 it('keeps archived legacy IP membership without raw events and reports unknown or unavailable coverage honestly',async()=>{
  const hour=legacyStart-400*86400000,known=emptyBucket(),partial=emptyBucket();known.pv=3;known.audience.client_ip_id={[networkIPIdentity('192.0.2.1',legacy,secret)!]:2,[networkIPIdentity('192.0.2.2',legacy,secret)!]:1};partial.pv=2;partial.audience.client_ip_id={[networkIPIdentity('192.0.2.1',legacy,secret)!]:1};
  await pool.query('INSERT INTO stats_hourly(site_id,hour,data,generation) VALUES($1,$2,$3,1),($1,$4,$5,1)',[legacy,new Date(hour),known,new Date(hour+3600000),partial]);
  const archived=await queryStats(ctx,legacy,new Date(hour).toISOString(),new Date(hour+3600000).toISOString());expect(archived).toMatchObject({coverage:1,ipCoverage:1,totals:{pv:3,ips:2}});
  const unknown=await queryStats(ctx,legacy,new Date(hour).toISOString(),new Date(hour+7200000).toISOString());expect(unknown).toMatchObject({coverage:1,ipCoverage:.8,ipStatus:'partial_ip_identity',knownIps:2,totals:{pv:5,ips:null}});
  const clipped=await queryStats(ctx,legacy,new Date(hour+60000).toISOString(),new Date(hour+3600000).toISOString());expect(clipped).toMatchObject({coverage:0,ipStatus:'incomplete_data',totals:{ips:null}});
  await pool.query("UPDATE sites SET privacy_mode='daily_salt' WHERE id=$1",[legacy]);try{const privacy=await queryStats(ctx,legacy,new Date(legacyStart).toISOString(),new Date(legacyStart+7200000).toISOString());expect(privacy).toMatchObject({ipStatus:'unsupported_in_this_mode',totals:{ips:null}});expect(JSON.stringify(privacy)).not.toContain('client_ip_id');}finally{await pool.query("UPDATE sites SET privacy_mode='standard' WHERE id=$1",[legacy]);}
 });
 it('withholds stale IPs during pending deletion then returns the exact surviving set after publication',async()=>{
  await pool.query('INSERT INTO tombstones(site_id,visitor_id) VALUES($1,$2)',[legacy,'legacy-b']);await pool.query('UPDATE aggregation_state SET generation=generation+1 WHERE site_id=$1',[legacy]);const start=new Date(legacyStart).toISOString(),end=new Date(legacyStart+7200000).toISOString();const pending=await queryStats(ctx,legacy,start,end);expect(pending).toMatchObject({coverage:0,ipStatus:'incomplete_data',totals:{ips:null}});await publish();const published=await queryStats(ctx,legacy,start,end);expect(published).toMatchObject({coverage:1,ipStatus:'complete',totals:{pv:5,ips:2}});expect(JSON.stringify(published)).not.toContain('client_ip_id');
 },120000);
});
