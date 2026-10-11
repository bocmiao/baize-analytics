import {randomUUID} from 'node:crypto';
import {Pool,type PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {migrate} from '../../src/server/db.js';
import {ClickHouseFactStore,type FactStageFence} from '../../src/server/fact-store.js';
import {ClickHouseRemainingFactStore} from '../../src/server/remaining-fact-store.js';
import {publishRunFactBodies} from '../../src/server/fact-store-publication.js';
import {publishRemainingFactBodies} from '../../src/server/remaining-fact-publication.js';
import {migratePublishedFactClosure} from '../../src/server/fact-closure-migration.js';
import {consumeClickHouseCommand} from '../../src/server/clickhouse-command-response.js';

describe.skipIf(!process.env.TEST_DATABASE_URL||!process.env.CLICKHOUSE_TEST_URL)('selected sealed pruned owner and fresh PG closure migration (real PG CH)',()=>{
 const schema=`pruned_closure_${randomUUID().replaceAll('-','')}`,site=randomUUID(),epoch=randomUUID(),sourceEpoch=randomUUID(),oldRun=randomUUID(),newRun=randomUUID();
 const oldSession=randomUUID(),newSession=randomUUID(),oldEvent=randomUUID(),newEvent=randomUUID(),at='2026-10-01T00:00:00.000Z';
 const visitors=['pruned-old','fresh-new'];
 const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1,options:`-c search_path=${schema}`});
 const config={url:process.env.CLICKHOUSE_TEST_URL!,username:'baize',password:'local-test-only'},facts=new ClickHouseFactStore(config),remaining=new ClickHouseRemainingFactStore(config),stores={facts,remaining};
 const fence:FactStageFence={expectedAggregationEpoch:epoch,verifyLiveFence:async()=>{}};
 async function insertOriginal(c:PoolClient,run:string,session:string,event:string,visitor:string){
  await c.query("INSERT INTO analytics_effect_facts VALUES($1,$2,$3,$4,$5,'/real','{\"channel\":\"direct\"}','pv','[]',1,false)",[run,event,at,session,visitor]);
  await c.query('INSERT INTO analytics_session_facts VALUES($1,$2,$3,$4)',[run,session,visitor,{id:session,visitor_id:visitor,started_at:at,last_active:at,entry_path:'/real',exit_path:'/real',pageviews:1,duration_s:0,visible_ms:0,bounced:true,dimensions:{channel:'direct'}}]);
 }
 async function transaction(fn:(c:PoolClient)=>Promise<void>,commit=false){const c=await pool.connect();try{await c.query('BEGIN');await fn(c);await c.query(commit?'COMMIT':'ROLLBACK');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 async function sealedMetadata(c:PoolClient){return {
  facts:(await c.query('SELECT * FROM analytics_fact_store_runs WHERE run_id=$1 ORDER BY kind',[oldRun])).rows,
  batches:(await c.query('SELECT * FROM analytics_fact_store_batches WHERE run_id=$1 ORDER BY id',[oldRun])).rows,
  members:(await c.query('SELECT * FROM analytics_fact_store_members WHERE run_id=$1 ORDER BY row_key',[oldRun])).rows,
  remaining:(await c.query('SELECT * FROM analytics_remaining_fact_runs WHERE run_id=$1 ORDER BY kind',[oldRun])).rows,
  remainingBatches:(await c.query('SELECT * FROM analytics_remaining_fact_batches WHERE run_id=$1 ORDER BY id',[oldRun])).rows
 };}
 beforeAll(async()=>{
  await admin.query(`CREATE SCHEMA ${schema}`);await migrate(pool);await facts.initialize();await remaining.initialize();
  await pool.query("INSERT INTO sites(id,name,domain,salt_secret) VALUES($1,'mixed closure','example.test','test-only-seal')",[site]);
  await pool.query('INSERT INTO aggregation_state(site_id,epoch,generation,processed_generation) VALUES($1,$2,2,2)',[site,sourceEpoch]);
  await transaction(async c=>{
   await c.query("INSERT INTO analytics_fact_runs(id,site_id,epoch,generation,outbox_high_watermark,status,query_version,retained_from) VALUES($1,$2,$3,1,0,'staging',2,$4)",[oldRun,site,sourceEpoch,at]);
   await insertOriginal(c,oldRun,oldSession,oldEvent,visitors[0]!);
   for(let i=1;i<130;i++)await c.query('INSERT INTO analytics_effect_facts SELECT run_id,$2,event_ts,session_id,visitor_id,event_path,dimensions,metric,key,value,member FROM analytics_effect_facts WHERE run_id=$1 AND event_id=$3',[oldRun,randomUUID(),oldEvent]);
   const originalFence={...fence,expectedAggregationEpoch:sourceEpoch};await publishRunFactBodies(c,facts,site,oldRun,originalFence);await publishRemainingFactBodies(c,remaining,site,oldRun,originalFence);
   await c.query("UPDATE analytics_fact_runs SET status='published' WHERE id=$1",[oldRun]);
   // Emulate the restore lifecycle's authorized mutable live-epoch remapping,
   // never changing immutable source epochs, body hashes or producer seals.
   await c.query('UPDATE aggregation_state SET epoch=$2 WHERE site_id=$1',[site,epoch]);await c.query('UPDATE analytics_fact_runs SET epoch=$2 WHERE id=$1',[oldRun,epoch]);
   for(const table of ['analytics_fact_store_runs','analytics_fact_store_batches','analytics_remaining_fact_runs','analytics_remaining_fact_batches'])await c.query(`UPDATE ${table} SET aggregation_epoch=$2 WHERE run_id=$1`,[oldRun,epoch]);
   await c.query('INSERT INTO analytics_session_contribution_heads VALUES($1,$2,$3,$4,$5,1)',[site,oldSession,visitors[0],oldRun,epoch]);
   await c.query('DELETE FROM analytics_effect_facts WHERE run_id=$1',[oldRun]);await c.query('DELETE FROM analytics_session_facts WHERE run_id=$1',[oldRun]);
   await c.query("INSERT INTO analytics_fact_runs(id,site_id,epoch,generation,outbox_high_watermark,status,query_version,retained_from) VALUES($1,$2,$3,2,0,'published',2,$4)",[newRun,site,epoch,at]);
   await insertOriginal(c,newRun,newSession,newEvent,visitors[1]!);await c.query('INSERT INTO analytics_session_contribution_heads VALUES($1,$2,$3,$4,$5,2)',[site,newSession,visitors[1],newRun,epoch]);
  },true);
 });
 afterAll(async()=>{await transaction(async c=>{await facts.eraseSegments(c,site,visitors.map(visitorId=>({visitorId})));await remaining.eraseSegments(c,site,visitors.map(visitorId=>({visitorId})));},true);await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
 it('authenticates unchanged old sealed kinds while backfilling the new PG run with exact original rows',async()=>{
  await transaction(async c=>{const before=await sealedMetadata(c);expect(await migratePublishedFactClosure(c,site,stores,fence)).toMatchObject({runs:2,pruned:false});expect(await sealedMetadata(c)).toEqual(before);
   for(const run of [oldRun,newRun]){let n=0;for await(const rows of facts.streamRunRows(c,site,run,'effects')){expect(rows.length).toBeLessThanOrEqual(100);n+=rows.length;if(run===oldRun)expect(rows.every(r=>r.source.aggregationEpoch===sourceEpoch)).toBe(true);}expect(n).toBe(run===oldRun?130:1);let sessions=0;for await(const rows of remaining.streamRunRows(c,site,run,'sessions'))sessions+=rows.length;expect(sessions).toBe(1);}
   expect((await c.query('SELECT count(*)::int n FROM analytics_effect_facts WHERE run_id=$1',[oldRun])).rows[0].n).toBe(0);expect(pool.waitingCount).toBe(0);
  },true);
 });
 it('does not exempt a nonempty mismatched PG oracle even when its CH marker is complete',async()=>{
  await transaction(async c=>{await insertOriginal(c,oldRun,oldSession,oldEvent,visitors[0]!);await c.query('UPDATE analytics_effect_facts SET value=9 WHERE run_id=$1',[oldRun]);await expect(migratePublishedFactClosure(c,site,stores,fence)).rejects.toThrow('FACT_STORE_MIGRATION_INCOMPLETE');});
  expect((await pool.query('SELECT count(*)::int n FROM analytics_effect_facts WHERE run_id=$1',[oldRun])).rows[0].n).toBe(0);
 });
 it('fails closed when the already-pruned owner retains receipts but its real CH body is missing',async()=>{
  const url=new URL(config.url);url.searchParams.set('query',`ALTER TABLE baize_derived_facts_v1 DELETE WHERE site_id='${site}' AND run_id='${oldRun}' SETTINGS mutations_sync=2`);
  await consumeClickHouseCommand(await fetch(url,{method:'POST',headers:{'X-ClickHouse-User':config.username,'X-ClickHouse-Key':config.password}}),'fixture-delete-failed');
  const before=await pool.query('SELECT count(*)::int n FROM analytics_fact_store_members WHERE run_id=$1',[oldRun]);expect(before.rows[0].n).toBe(130);
  await transaction(async c=>{await expect(migratePublishedFactClosure(c,site,stores,fence)).rejects.toThrow('FACT_STORE_BODY_UNAVAILABLE');});
  expect((await pool.query('SELECT count(*)::int n FROM analytics_fact_store_members WHERE run_id=$1',[oldRun])).rows[0].n).toBe(130);expect(pool.waitingCount).toBe(0);
 });
});
