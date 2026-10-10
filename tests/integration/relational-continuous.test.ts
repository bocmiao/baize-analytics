import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import Fastify from 'fastify';
import {Pool} from 'pg';
import {describe,it,expect} from 'vitest';
import {migrate} from '../../src/server/db.js';
import {beginSiteSnapshot} from '../../src/server/site-snapshot.js';
import {registerCollect} from '../../src/server/collect.js';
import {queryStats} from '../../src/server/analytics.js';
import {claimSite,rebuildSite,runWorkerOnce} from '../../src/server/worker.js';
import {queryPublishedNumericBuckets} from '../../src/server/fact-numeric-query.js';
import type {AppContext} from '../../src/server/context.js';

describe.skipIf(!process.env.TEST_DATABASE_URL)('033 real HTTP continuing intake and exact relational reads',()=>{
 it('publishes captured prefixes while later batches stay dirty, reports RSS/lag, and fails closed on missing backing',async()=>{
  const schema=`continuous_${randomUUID().replaceAll('-','')}`,site=randomUUID(),admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`,max:2}),app=Fastify();
  const ctx={pool,redis:null} as AppContext;const from=new Date(Date.now()-60000).toISOString(),to=new Date(Date.now()+60000).toISOString(),observations:Record<string,unknown>[]=[];let accepted=0;
  await admin.query(`CREATE SCHEMA ${schema}`);
  try{
   await migrate(pool);await pool.query("INSERT INTO sites(id,name,domain,salt_secret,timezone) VALUES($1,'continuous','example.test','test','UTC')",[site]);await pool.query('INSERT INTO aggregation_state(site_id) VALUES($1)',[site]);await registerCollect(app,ctx);const address=await app.listen({host:'127.0.0.1',port:0});
   const collect=async()=>{const count=10,events=Array.from({length:count},()=>({event_id:randomUUID(),page_id:randomUUID(),visitor_id:randomUUID(),ts:Date.now()-1000,type:'pageview',url:'https://example.test/continuous',path:'/continuous'}));
    const response=await fetch(`${address}/api/collect`,{method:'POST',headers:{'content-type':'application/json',origin:'https://example.test','user-agent':'Mozilla/5.0 Chrome/120.0'},body:JSON.stringify({protocol_version:1,site_id:site,sdk:'relational-continuous',sent_at:Date.now(),events})});expect(response.status).toBe(202);expect((await response.json()).accepted).toBe(count);accepted+=count;
   };
   await collect();
   for(let i=0;i<5;i++){
    const claim=await claimSite(pool);expect(claim).not.toBeNull();const captured=accepted;
    // The next real HTTP batch commits after the source snapshot but before publication.
    expect(await rebuildSite(pool,claim!,{afterSnapshot:collect})).toBe(true);
    const started=performance.now(),stats=await queryStats(ctx,site,from,to),queryMs=performance.now()-started;
    expect(stats.totals.pv).toBe(captured);expect(stats.totals.uv).toBe(captured);expect(stats.coverage).toBe(0);
    const state=(await pool.query('SELECT generation::int,processed_generation::int,watermark FROM aggregation_state WHERE site_id=$1',[site])).rows[0];expect(state.generation).toBeGreaterThan(state.processed_generation);
    observations.push({accepted,publishedPV:stats.totals.pv,queryMs,rssBytes:process.memoryUsage().rss,watermarkLagMs:Date.now()-+new Date(state.watermark)});
   }
   expect(await runWorkerOnce(pool)).toBe(true);const final=await queryStats(ctx,site,from,to);expect(final.totals.pv).toBe(60);expect(final.totals.uv).toBe(60);expect(final.coverage).toBe(1);const future=await queryStats(ctx,site,new Date(Date.now()+86400000).toISOString(),new Date(Date.now()+90000000).toISOString());expect(future.rangeStatus).toBe('future_only');expect(future.coverage).toBe(0);expect(future.trend).toEqual([]);expect(future.totals.pv).toBe(0);
   const client=await pool.connect();try{await beginSiteSnapshot(client,site);await expect(queryPublishedNumericBuckets(client,site,from,to,{},1)).rejects.toMatchObject({code:'analytics_query_limit'});await client.query('ROLLBACK');}finally{client.release();}
   const pointer=(await pool.query('DELETE FROM analytics_relational_buckets WHERE site_id=$1 RETURNING *',[site])).rows;expect(pointer.length).toBeGreaterThan(0);await expect(queryStats(ctx,site,from,to)).rejects.toMatchObject({code:'aggregate_members_unavailable'});
   await writeFile('/tmp/baize-033-continuous-observations.json',JSON.stringify({scope:'60 real HTTP events, correctness and measurements only; not a million-event SLO',observations},null,2));
  }finally{await app.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
 },30000);
});
