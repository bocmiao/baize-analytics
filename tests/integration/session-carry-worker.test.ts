import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {expect,it} from 'vitest';
import {migrate} from '../../src/server/db.js';
import {queryAiPublishedSeries} from '../../src/server/ai-fact-query.js';
import {queryStats} from '../../src/server/analytics.js';
import {runWorkerOnce} from '../../src/server/worker.js';
import type {AppContext} from '../../src/server/context.js';

it.skipIf(!process.env.TEST_DATABASE_URL)('production carry keeps a cross-retention session and unrelated archived B after raw pruning',async()=>{
 const schema=`carryworker_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`,max:1});
 await admin.query(`CREATE SCHEMA ${schema}`);
 try{
  await migrate(pool);const site=randomUUID(),page=randomUUID(),boundary=Date.now()-86400000,ctx={pool,redis:null} as AppContext;
  await pool.query("INSERT INTO sites(id,name,domain,salt_secret,retention_days,timezone) VALUES($1,'carry worker','example.test','test',1,'UTC')",[site]);await pool.query('INSERT INTO aggregation_state(site_id,generation) VALUES($1,1)',[site]);
  for(const [offset,visitor,type,path,payload]of [[-120000,'A','pageview','/entry',{}],[-60000,'A','heartbeat','/entry',{interval_start:0,interval_end:1000,visible_ms:700}],[60000,'A','pageview','/tail',{}],[120000,'A','pageview','/later',{}],[-3600000,'B','pageview','/b',{}]] as [number,string,string,string,Record<string,unknown>][])await pool.query('INSERT INTO events(site_id,event_id,ts,visitor_id,page_id,type,path,payload,dimensions) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[site,randomUUID(),new Date(boundary+offset),visitor,page,type,path,payload,{channel:'search'}]);
  expect(await runWorkerOnce(pool)).toBe(true);
  const first=(await pool.query("SELECT * FROM sessions WHERE site_id=$1 AND visitor_id='A'",[site])).rows[0];expect(first.pageviews).toBe(3);expect(first.visible_ms).toBe(700);expect(first.entry_path).toBe('/entry');
  await pool.query('DELETE FROM events WHERE site_id=$1 AND ts<$2',[site,new Date(boundary)]);await pool.query('UPDATE aggregation_state SET generation=generation+1 WHERE site_id=$1',[site]);
  expect(await runWorkerOnce(pool)).toBe(true);
  const later=(await pool.query("SELECT * FROM sessions WHERE site_id=$1 AND visitor_id='A'",[site])).rows[0];expect(later.id).toBe(first.id);expect(later.pageviews).toBe(3);expect(later.entry_path).toBe('/entry');expect(later.visible_ms).toBe(700);expect(later.duration_s).toBe(240);
  const stats=await queryStats(ctx,site,new Date(boundary-7200000).toISOString(),new Date(boundary+3600000).toISOString());expect(stats.totals.pv).toBe(4);expect(stats.totals.uv).toBe(2);expect(stats.totals.sessions).toBe(2);expect(stats.totals.visibleSeconds).toBe(.7);expect(stats.coverage).toBe(1);expect(pool.waitingCount).toBe(0);const client=await pool.connect();try{const rate=await queryAiPublishedSeries(client,site,{from:new Date(boundary-7200000).toISOString(),to:new Date(boundary+3600000).toISOString(),dimension:'day',metric:'conversion_rate'},'UTC');expect(rate.status).toBe('ok');expect(rate.rows.reduce((n,r)=>n+(r.denominator??0),0)).toBe(2);expect(rate.rows.reduce((n,r)=>n+(r.numerator??0),0)).toBe(0);}finally{client.release();}
 }finally{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
},30000);
