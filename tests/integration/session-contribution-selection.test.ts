import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {expect,it} from 'vitest';
import {migrate} from '../../src/server/db.js';
import {sessionContributionPredicate,sessionVitalContributionPredicate,carryRunReferenced} from '../../src/server/session-contribution-overlay.js';
import {pruneUnreferencedFactRuns} from '../../src/server/fact-member-query.js';

it.skipIf(!process.env.TEST_DATABASE_URL)('selects one complete A owner and keeps archived B including weighted vital samples',async()=>{
 const schema=`owner_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`,max:1});
 await admin.query(`CREATE SCHEMA ${schema}`);
 try{
  await migrate(pool);const site=randomUUID(),old=randomUUID(),next=randomUUID(),a=randomUUID(),b=randomUUID(),eventA=randomUUID(),eventB=randomUUID();
  await pool.query("INSERT INTO sites(id,name,domain,salt_secret) VALUES($1,'owner','example.test','test')",[site]);
  await pool.query('INSERT INTO aggregation_state(site_id,generation,processed_generation) VALUES($1,2,2)',[site]);
  const epoch=(await pool.query('SELECT epoch FROM aggregation_state WHERE site_id=$1',[site])).rows[0].epoch;
  for(const [run,generation]of [[old,1],[next,2]])await pool.query("INSERT INTO analytics_fact_runs(id,site_id,epoch,generation,outbox_high_watermark,status,query_version,retained_from) VALUES($1,$2,$3,$4,0,'published',2,'2026-10-02T00:00:00Z')",[run,site,epoch,generation]);
  await pool.query("INSERT INTO analytics_relational_buckets VALUES($1,'2026-10-01T23:00:00Z',$2,$3,1)",[site,old,epoch]);
  for(const [run,event,session,visitor,n]of [[old,eventA,a,'A',2],[next,eventA,a,'A',3],[old,eventB,b,'B',7]]){
   await pool.query("INSERT INTO analytics_effect_facts VALUES($1,$2,'2026-10-01T23:58:00Z',$3,$4,'/entry','{}','pv','[]',$5,false)",[run,event,session,visitor,n]);
   await pool.query("INSERT INTO analytics_vital_samples VALUES($1,$2,'2026-10-01T23:58:00Z','/entry','{}','lcp',$3)",[run,event,visitor==='A'?100:10000]);
  }
  await pool.query('INSERT INTO analytics_session_contribution_heads VALUES($1,$2,$3,$4,$5,2)',[site,a,'A',next,epoch]);
  expect((await pool.query(`SELECT sum(value)::int AS n FROM analytics_effect_facts e WHERE ${sessionContributionPredicate}`,[site])).rows[0].n).toBe(10);
  const samples=(await pool.query(`SELECT value FROM analytics_vital_samples e WHERE ${sessionVitalContributionPredicate} ORDER BY value`,[site])).rows;
  expect(samples).toEqual([{value:100},{value:10000}]);
  expect((await pool.query(`SELECT id FROM analytics_fact_runs r WHERE ${carryRunReferenced}`)).rows).toEqual([{id:next}]);
  const latest=randomUUID();await pool.query("INSERT INTO analytics_fact_runs(id,site_id,epoch,generation,outbox_high_watermark,status,query_version,retained_from) VALUES($1,$2,$3,3,0,'published',2,'2026-10-02T00:00:00Z')",[latest,site,epoch]);
  const client=await pool.connect();try{await pruneUnreferencedFactRuns(client,site);}finally{client.release();}
  expect((await pool.query('SELECT count(*)::int AS n FROM analytics_effect_facts WHERE run_id=$1',[next])).rows[0].n).toBe(1);
  expect((await pool.query('SELECT count(*)::int AS n FROM analytics_vital_samples WHERE run_id=$1',[next])).rows[0].n).toBe(1);
  expect((await pool.query(`SELECT sum(value)::int AS n FROM analytics_effect_facts e WHERE ${sessionContributionPredicate}`,[site])).rows[0].n).toBe(10);
  await pool.query('UPDATE analytics_session_contribution_heads SET epoch=gen_random_uuid() WHERE site_id=$1',[site]);
  // A stale owner must not resurrect its old hourly copy through the legacy fallback.
  expect((await pool.query(`SELECT sum(value)::int AS n FROM analytics_effect_facts e WHERE ${sessionContributionPredicate}`,[site])).rows[0].n).toBe(7);
  expect((await pool.query(`SELECT value FROM analytics_vital_samples e WHERE ${sessionVitalContributionPredicate}`,[site])).rows).toEqual([{value:10000}]);
 }finally{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
