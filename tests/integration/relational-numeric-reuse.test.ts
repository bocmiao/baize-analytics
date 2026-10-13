import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import Fastify from 'fastify';
import {Pool} from 'pg';
import {describe,it,expect} from 'vitest';
import {migrate} from '../../src/server/db.js';
import {beginSiteSnapshot} from '../../src/server/site-snapshot.js';
import {registerCollect} from '../../src/server/collect.js';
import {queryStats} from '../../src/server/analytics.js';
import {runWorkerOnce} from '../../src/server/worker.js';
import type {AppContext} from '../../src/server/context.js';

describe.skipIf(!process.env.TEST_DATABASE_URL)('request-local exact numeric bucket reuse',()=>{
 it('keeps filtered and partial-hour owner totals exact and performs one numeric scan per read',async()=>{
  const schema=`numericreuse_${randomUUID().replaceAll('-','')}`,site=randomUUID();
  const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`}),app=Fastify(),ctx={pool,redis:null} as AppContext;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const hour=Math.floor(Date.now()/3600000)*3600000-7200000,observations:Record<string,unknown>[]=[];
  try{
   await migrate(pool);await pool.query("INSERT INTO sites(id,name,domain,salt_secret,timezone) VALUES($1,'reuse','reuse.test','local-test','UTC')",[site]);await pool.query('INSERT INTO aggregation_state(site_id) VALUES($1)',[site]);await registerCollect(app,ctx);
   const events=[{path:'/a',at:hour+600000},{path:'/b',at:hour+1200000},{path:'/a',at:hour+1800000}].map(e=>({event_id:randomUUID(),page_id:randomUUID(),visitor_id:randomUUID(),ts:e.at,type:'pageview',url:`https://reuse.test${e.path}`,path:e.path}));
   const intake=await app.inject({method:'POST',url:'/api/collect',headers:{origin:'https://reuse.test','user-agent':'Mozilla/5.0 Chrome/120'},payload:{protocol_version:1,site_id:site,sdk:'numeric-reuse',sent_at:Date.now(),events}});expect(intake.statusCode,intake.body).toBe(202);expect(intake.json().accepted).toBe(3);expect(await runWorkerOnce(pool)).toBe(true);
   for(const item of [{name:'aligned',from:hour,to:hour+3600000,filters:{},pv:3},{name:'partial',from:hour+900000,to:hour+2400000,filters:{},pv:2},{name:'filtered',from:hour,to:hour+3600000,filters:{path:'/a'},pv:2},{name:'filtered-partial',from:hour+900000,to:hour+2400000,filters:{path:'/a'},pv:1}]){
    const client=await pool.connect();let scans=0,sqlCalls=0;const original=client.query.bind(client);
    client.query=((...args:unknown[])=>{sqlCalls++;if(typeof args[0]==='string'&&/^DECLARE numbers_/.test(args[0]))scans++;return (original as (...values:unknown[])=>unknown)(...args);}) as typeof client.query;
    try{await beginSiteSnapshot(client,site);const start=performance.now(),result=await queryStats(ctx,site,new Date(item.from).toISOString(),new Date(item.to).toISOString(),item.filters,{client});const wallMs=performance.now()-start;
     expect(result.totals.pv).toBe(item.pv);expect(result.totals.uv).toBe(item.pv);expect(result.coverage).toBe(1);expect(scans).toBe(process.env.NUMERIC_REUSE_BASELINE==='1'&&item.name!=='aligned'?2:1);
     observations.push({name:item.name,scans,sqlCalls,wallMs,pv:result.totals.pv,uv:result.totals.uv,coverage:result.coverage});await original('ROLLBACK');
    }finally{client.query=original as typeof client.query;client.release();}
   }
   if(process.env.NUMERIC_REUSE_EVIDENCE)await writeFile(process.env.NUMERIC_REUSE_EVIDENCE,JSON.stringify({scope:'same real PG fixture; SQL calls include snapshot setup; single-run timings are diagnostic, not an SLO',observations},null,2));
  }finally{await app.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
 });
});
