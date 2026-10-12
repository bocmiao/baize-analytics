import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {it,expect} from 'vitest';
import {migrate} from '../../src/server/db.js';
import {queryStats} from '../../src/server/analytics.js';
import {runWorkerOnce} from '../../src/server/worker.js';
import type {AppContext} from '../../src/server/context.js';
import {dateRange} from '../../src/web/time.js';
it.skipIf(!process.env.TEST_DATABASE_URL)('picker half-open civil day includes final millisecond and excludes next midnight in real stats',async()=>{
 const schema=`civil_${randomUUID().replaceAll('-','')}`,site=randomUUID();const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`});
 try{await admin.query(`CREATE SCHEMA ${schema}`);await migrate(pool);await pool.query("INSERT INTO sites(id,name,domain,salt_secret,timezone) VALUES($1,'boundary','example.test','synthetic','Asia/Shanghai')",[site]);await pool.query('INSERT INTO aggregation_state(site_id,generation) VALUES($1,1)',[site]);
 const day=new Date(Date.now()-2*86400000).toISOString().slice(0,10),q=new URLSearchParams(dateRange(day,day,'Asia/Shanghai')),to=+new Date(q.get('to')!);
 for(const ts of [to-1,to])await pool.query("INSERT INTO events(site_id,event_id,ts,visitor_id,page_id,type,path,payload,dimensions) VALUES($1,$2,$3,$4,$5,'pageview','/boundary','{}','{}')",[site,randomUUID(),new Date(ts),randomUUID(),randomUUID()]);
 expect(await runWorkerOnce(pool)).toBe(true);const stats=await queryStats({pool,redis:null} as unknown as AppContext,site,q.get('from')!,q.get('to')!);expect(stats.totals.pv).toBe(1);expect(stats.coverage).toBe(1);
 }finally{await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
});
