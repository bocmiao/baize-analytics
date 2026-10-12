import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {it,expect} from 'vitest';
import {migrate} from '../../src/server/db.js';
import {queryStats} from '../../src/server/analytics.js';
import {runWorkerOnce} from '../../src/server/worker.js';
import {computeLiteStats} from '../../src/lite/analytics.js';
import type {AppContext} from '../../src/server/context.js';
import type {AnalyticsEvent} from '../../src/server/analytics-core.js';
import type {LiteSnapshot} from '../../src/lite/types.js';
import {dateRange} from '../../src/web/time.js';
it.skipIf(!process.env.TEST_DATABASE_URL)('Lite and real PG share millisecond boundary, visitor, session and quantile fixture',async()=>{
 const schema=`liteparity_${randomUUID().replaceAll('-','')}`,site=randomUUID(),visitor=randomUUID(),page=randomUUID(),now=Date.now();const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`});
 try{await admin.query(`CREATE SCHEMA ${schema}`);await migrate(pool);await pool.query("INSERT INTO sites(id,name,domain,salt_secret,timezone) VALUES($1,'parity','example.test','synthetic','Asia/Shanghai')",[site]);await pool.query('INSERT INTO aggregation_state(site_id,generation) VALUES($1,1)',[site]);
 const day=new Date(now-2*86400000).toISOString().slice(0,10),q=new URLSearchParams(dateRange(day,day,'Asia/Shanghai')),from=q.get('from')!,to=q.get('to')!,end=+new Date(to);
 const make=(ts:number,type:string,payload:Record<string,unknown>={}):AnalyticsEvent=>({site_id:site,event_id:randomUUID(),ts:new Date(ts),visitor_id:visitor,page_id:page,type,path:'/boundary',payload,dimensions:{channel:'direct'}});
 const events=[make(end-120000,'pageview'),make(end-60000,'vitals',{vitals:{LCP:1250}}),make(end-1,'pageview'),make(end,'pageview')];
 for(const e of events)await pool.query('INSERT INTO events(site_id,event_id,ts,visitor_id,page_id,type,path,payload,dimensions) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[site,e.event_id,e.ts,e.visitor_id,e.page_id,e.type,e.path,JSON.stringify(e.payload),JSON.stringify(e.dimensions)]);
 expect(await runWorkerOnce(pool)).toBe(true);const pg=await queryStats({pool,redis:null} as unknown as AppContext,site,from,to);
 const snapshot:LiteSnapshot={site:{id:site,name:'parity',domain:'example.test',timezone:'Asia/Shanghai',privacy_mode:'standard',retention_days:30,salt_secret:'synthetic',config:{},generation:1,epoch:'synthetic',owner_id:'synthetic'},events,goals:[],generation:1,epoch:'synthetic'};const lite=computeLiteStats(snapshot,from,to,{},now);
 for(const key of ['pv','uv','sessions','bounceRate','averageDuration','visibleSeconds','conversions'] as const)expect(lite.totals[key],key).toBe(pg.totals[key]);expect(lite.vitals).toEqual(pg.vitals);expect(lite.sources).toEqual(pg.sources);expect(lite.pages).toEqual(pg.pages);expect(lite.coverage).toBe(pg.coverage);
 }finally{await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
});
