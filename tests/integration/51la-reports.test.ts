import {randomUUID} from 'node:crypto';
import Fastify from 'fastify';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {migrate} from '../../src/server/db.js';
import {runWorkerOnce} from '../../src/server/worker.js';
import {emptyBucket} from '../../src/server/analytics-core.js';
import {register51laReports} from '../../src/server/51la-reports.js';
import type {AppContext} from '../../src/server/context.js';

describe.skipIf(!process.env.TEST_DATABASE_URL)('51LA reports with real PostgreSQL facts',()=>{
 const schema='traffic_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`}),site='traffic-'+randomUUID(),app=Fastify();
 let from:string,to:string;
 beforeAll(async()=>{
  await admin.query(`CREATE SCHEMA ${schema}`);await migrate(pool);
  await pool.query("INSERT INTO sites(id,name,domain,salt_secret,timezone) VALUES($1,'traffic test','example.test','test-secret','Asia/Shanghai')",[site]);await pool.query('INSERT INTO aggregation_state(site_id) VALUES($1)',[site]);
  const now=Date.now();from=new Date(now-3600000).toISOString();to=new Date(now).toISOString();
  for(const [offset,visitor,path,bot] of [[120000,'a','/landing',false],[60000,'a','/next',false],[90000,'b','/landing',false],[80000,'deleted','/hidden',false],[70000,'robot','/bot',true]] as const){
   await pool.query("INSERT INTO events(site_id,event_id,ts,visitor_id,page_id,type,path,payload,dimensions,is_bot) VALUES($1,$2,$3,$4,$5,'pageview',$6,$7,$8,$9)",[site,randomUUID(),new Date(now-offset),visitor,randomUUID(),path,JSON.stringify({url:'https://example.test'+path}),JSON.stringify({channel:'search',referrer:'www.google.com',browser:'Firefox',ip_truncated:'192.0.2.0'}),bot]);
  }
  await pool.query('INSERT INTO tombstones(site_id,visitor_id) VALUES($1,$2)',[site,'deleted']);await pool.query('UPDATE aggregation_state SET generation=generation+1 WHERE site_id=$1',[site]);expect(await runWorkerOnce(pool)).toBe(true);
  const ctx={pool,redis:null,authorize:async()=>({id:'test-owner'})} as unknown as AppContext;await register51laReports(app,ctx);
 },120000);
 afterAll(async()=>{await app.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
 const url=(route:string)=>`/api/v1/sites/${site}/${route}?`+new URLSearchParams({from,to});
 it('excludes bots and erased visitors while exposing real group and entry metrics',async()=>{
  const response=await app.inject(url('traffic-report'));expect(response.statusCode,response.body).toBe(200);const body=response.json();expect(body).toMatchObject({coverage:1,totals:{pv:3,uv:2,sessions:2,ips:null}});expect(body.groups.entry).toEqual([expect.objectContaining({label:'/landing',pv:3,uv:2,sessions:2})]);expect(body.groups.ipPrefix[0]).toMatchObject({label:'192.0.2.0',ips:null,uv:2});
 });
 it('paginates actual sessions and retains their complete in-window paths',async()=>{
  const response=await app.inject(url('visits')+'&pageSize=1');expect(response.statusCode,response.body).toBe(200);const body=response.json();expect(body).toMatchObject({total:2,pageSize:1,coverage:1});expect(body.rows).toHaveLength(1);expect(body.live.active[15]).toBe(2);expect(body.live.pages.reduce((sum:number,row:{pv:number})=>sum+row.pv,0)).toBe(3);
 });
 it('matches site-calendar SQL counts for all overview periods and leaves IP unknown',async()=>{
  const response=await app.inject(`/api/v1/sites/${site}/overview-summary`);expect(response.statusCode,response.body).toBe(200);const body=response.json();
  for(const key of ['today','yesterday','yesterdaySameTime']){const period=body[key],expected=(await pool.query("SELECT count(*)::int AS pv,count(DISTINCT e.visitor_id)::int AS uv FROM events e WHERE e.site_id=$1 AND e.ts>=$2 AND e.ts<$3 AND e.type='pageview' AND NOT e.is_bot AND NOT EXISTS(SELECT 1 FROM tombstones t WHERE t.site_id=e.site_id AND t.visitor_id=e.visitor_id)",[site,period.from,period.to])).rows[0];expect(period.totals).toMatchObject({...expected,ips:null});expect(period.coverage).toBe(1);}
  expect(body.active15.visitors).toBe(2);expect(body.forecast.pv).toBeNull();
 });
 it('reads whole-history exact facts after old raw events expire and returns separate peak dates',async()=>{
  const old=new Date(Date.now()-40*86400000);await pool.query("INSERT INTO events(site_id,event_id,ts,visitor_id,page_id,type,path,payload,dimensions) VALUES($1,$2,$3,'a',$4,'pageview','/archive',$5,$6)",[site,randomUUID(),old,randomUUID(),JSON.stringify({url:'https://example.test/archive'}),JSON.stringify({channel:'search',referrer:'www.google.com',browser:'Firefox'})]);
  await pool.query('UPDATE aggregation_state SET generation=generation+1 WHERE site_id=$1',[site]);expect(await runWorkerOnce(pool)).toBe(true);
  await pool.query('DELETE FROM events WHERE site_id=$1 AND ts=$2',[site,old]);
  const response=await app.inject(`/api/v1/sites/${site}/overview-summary?extended=1`);expect(response.statusCode,response.body).toBe(200);const body=response.json().extended;
  expect(body.total).toMatchObject({coverage:1,status:'complete',totals:{pv:4,uv:2,ips:null,sessions:3}});expect(new Date(body.history.from).getTime()).toBeLessThan(Date.now()-39*86400000);expect(body.peaks.pv.value).toBe(3);expect(body.peaks.pv.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);expect(body.peaks.uv.value).toBe(2);expect(body.peaks.ips).toEqual({value:null,date:null});
 });
 it('never double-counts a legacy cutoff hour that also has a selected fact tail or carry contribution',async()=>{
  const oldest=(await pool.query('SELECT hour FROM stats_hourly WHERE site_id=$1 ORDER BY hour LIMIT 1',[site])).rows[0].hour;
  const legacy=emptyBucket();legacy.pv=1;legacy.visitors=['a'];legacy.sessions=1;
  await pool.query('UPDATE stats_hourly SET data=$3 WHERE site_id=$1 AND hour=$2',[site,oldest,JSON.stringify(legacy)]);
  const response=await app.inject(`/api/v1/sites/${site}/overview-summary?extended=1`);expect(response.statusCode,response.body).toBe(200);const body=response.json().extended;
  expect(body.total).toMatchObject({coverage:0,status:'overlapping_legacy_history',totals:{pv:null,uv:null,sessions:null}});expect(body.peaks).toMatchObject({coverage:0,status:'overlapping_legacy_history',pv:{value:null,date:null}});expect(body.history.overlap).toMatchObject({from:new Date(oldest).toISOString()});expect(body.thisMonth.coverage).toBe(1);
 });
});
