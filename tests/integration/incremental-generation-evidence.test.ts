import {randomUUID} from 'node:crypto';
import {Pool,type PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {beginPartitionSnapshot,migrate} from '../../src/server/db.js';
import {captureIncrementalSessionPlan,incrementalSessionConfigHash,type IncrementalSessionIdentity} from '../../src/server/incremental-session-plan.js';

/** Real PostgreSQL evidence/trigger tests. Synthetic run metadata does NOT prove
 * authenticated CH hydration, delta publication, or actual collector behavior. */
describe.skipIf(!process.env.TEST_DATABASE_URL)('incremental generation evidence continuity (real PG)',()=>{
 const schema=`incremental_evidence_${randomUUID().replaceAll('-','')}`;
 const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1});
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1,connectionTimeoutMillis:3000,options:`-c search_path=${schema}`});
 beforeAll(async()=>{await admin.query(`CREATE SCHEMA ${schema}`);await migrate(pool);});
 afterAll(async()=>{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
 async function baseline(){
  const siteId=randomUUID(),epoch=randomUUID(),canonicalEpoch=randomUUID(),run=randomUUID();
  await pool.query("INSERT INTO sites(id,name,domain,salt_secret) VALUES($1,'evidence','example.test','test-only')",[siteId]);
  await pool.query('INSERT INTO aggregation_state(site_id,epoch,generation,processed_generation,non_event_generation) VALUES($1,$2,10,10,10)',[siteId,epoch]);
  const identity:IncrementalSessionIdentity={siteId,epoch,generation:'10',high:'0',strict:true,enabled:true,canonicalEpoch,canonicalDeletionEpoch:'0',timezone:'UTC',privacy:false,retentionDays:30,config:{session_timeout_minutes:30},goals:[],funnels:[],retainedFrom:new Date('2026-10-01T00:00:00Z')};
  await pool.query("INSERT INTO analytics_fact_runs(id,site_id,epoch,generation,outbox_high_watermark,status,source_authority,canonical_epoch,canonical_deletion_epoch,query_version,retained_from) VALUES($1,$2,$3,10,0,'published','clickhouse',$4,0,2,$5)",[run,siteId,epoch,canonicalEpoch,identity.retainedFrom]);
  await pool.query("INSERT INTO analytics_incremental_run_plans(run_id,site_id,mode,source_generation,non_event_generation,config_hash) VALUES($1,$2,'full',10,10,$3)",[run,siteId,incrementalSessionConfigHash(identity)]);
  return identity;
 }
 async function marked(client:PoolClient,siteId:string,generation?:number){
  await client.query("SELECT set_config('baize.aggregation_ingest_site',$1,true)",[siteId]);
  await client.query(`UPDATE aggregation_state SET generation=${generation===undefined?'generation+1':'$2'} WHERE site_id=$1`,generation===undefined?[siteId]:[siteId,generation]);
  await client.query("SELECT set_config('baize.aggregation_ingest_site','',true)");
 }
 async function transaction(fn:(client:PoolClient)=>Promise<void>){const c=await pool.connect();try{await c.query('BEGIN');await fn(c);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 async function state(siteId:string){return(await pool.query('SELECT generation::text,non_event_generation::text,epoch::text FROM aggregation_state WHERE site_id=$1',[siteId])).rows[0];}
 async function plan(identity:IncrementalSessionIdentity){
  await pool.query("INSERT INTO outbox(site_id,event_id,ts,visitor_id) VALUES($1,$2,'2026-10-02T00:00:00Z','dirty')",[identity.siteId,randomUUID()]);
  const c=await pool.connect();try{await beginPartitionSnapshot(c);const s=(await c.query('SELECT generation::text,epoch::text FROM aggregation_state WHERE site_id=$1',[identity.siteId])).rows[0];const high=(await c.query('SELECT max(id)::text AS high FROM outbox WHERE site_id=$1',[identity.siteId])).rows[0].high;const p=await captureIncrementalSessionPlan(c,{...identity,...s,high});const result={mode:p.mode,reason:p.fallbackReason};await p.close();expect(pool.waitingCount).toBe(0);return result;}finally{await c.query('ROLLBACK');c.release();}
 }
 it('same-site marked ingest preserves evidence, clears the setting, and cannot authenticate delta by metadata alone',async()=>{
  const i=await baseline();await transaction(async c=>{await marked(c,i.siteId);expect((await c.query("SELECT current_setting('baize.aggregation_ingest_site',true) AS marker")).rows[0].marker).toBe('');});
  expect(await state(i.siteId)).toMatchObject({generation:'11',non_event_generation:'10'});
  // Candidate mode only; afterHydration must still reject absent authenticated context.
  expect(await plan(i)).toEqual({mode:'visitor_delta',reason:null});
  const c=await pool.connect();try{await beginPartitionSnapshot(c);const p=await captureIncrementalSessionPlan(c,{...i,generation:'11',high:String((await c.query('SELECT max(id) AS id FROM outbox WHERE site_id=$1',[i.siteId])).rows[0].id)});await expect(p.afterHydration()).rejects.toThrow('AUTHENTICATED_SOURCE_REQUIRED');}finally{await c.query('ROLLBACK');c.release();}
 });
 it('unknown middle update survives subsequent ordinary ingest and forces full planning',async()=>{
  const i=await baseline();await transaction(async c=>{await marked(c,i.siteId);await c.query('UPDATE aggregation_state SET generation=generation+1 WHERE site_id=$1',[i.siteId]);await marked(c,i.siteId);});
  expect(await state(i.siteId)).toMatchObject({generation:'13',non_event_generation:'12'});
  expect(await plan(i)).toEqual({mode:'full',reason:'non_event_change'});
 });
 it('unknown jump and backward generation changes cannot erase the conservative marker',async()=>{
  const i=await baseline();await pool.query('UPDATE aggregation_state SET generation=100 WHERE site_id=$1',[i.siteId]);expect(await state(i.siteId)).toMatchObject({generation:'100',non_event_generation:'100'});
  await pool.query('UPDATE aggregation_state SET generation=11 WHERE site_id=$1',[i.siteId]);expect(await state(i.siteId)).toMatchObject({generation:'11',non_event_generation:'101'});
  await transaction(c=>marked(c,i.siteId));expect(await state(i.siteId)).toMatchObject({generation:'12',non_event_generation:'101'});expect(await plan(i)).toEqual({mode:'full',reason:'non_event_change'});
 });
 it('epoch changes are unknown even inside marked ingest; definition-equivalent change/revert still invalidates evidence',async()=>{
  const epochCase=await baseline(),nextEpoch=randomUUID();await transaction(async c=>{await c.query("SELECT set_config('baize.aggregation_ingest_site',$1,true)",[epochCase.siteId]);await c.query('UPDATE aggregation_state SET epoch=$2 WHERE site_id=$1',[epochCase.siteId,nextEpoch]);await c.query("SELECT set_config('baize.aggregation_ingest_site','',true)");});expect(await state(epochCase.siteId)).toMatchObject({generation:'10',non_event_generation:'11',epoch:nextEpoch});expect(await plan(epochCase)).toEqual({mode:'full',reason:'source_fence'});
  const definitionCase=await baseline(),goal=randomUUID();await transaction(async c=>{
   await c.query("INSERT INTO goals(id,site_id,name,type,config) VALUES($1,$2,'temporary','page','{\"path\":\"/changed\"}')",[goal,definitionCase.siteId]);
   await c.query('UPDATE aggregation_state SET generation=generation+1 WHERE site_id=$1',[definitionCase.siteId]);
   await c.query('DELETE FROM goals WHERE id=$1',[goal]);
   await c.query('UPDATE aggregation_state SET generation=generation+1 WHERE site_id=$1',[definitionCase.siteId]);
   await marked(c,definitionCase.siteId);
  });expect(await plan(definitionCase)).toEqual({mode:'full',reason:'non_event_change'});
 });
});
