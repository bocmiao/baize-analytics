import {ClickHouseCacheStore,cacheRowKey,installCacheStore} from '../../src/server/cache-store.js';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {Pool} from 'pg';
import {describe,it,expect} from 'vitest';
import {migrate,dirtySite,lockSite} from '../../src/server/db.js';
import {deleteVisitor,replayDeletionJournal} from '../../src/server/deletion.js';
import type {AppContext} from '../../src/server/context.js';
import type {PoolClient} from 'pg';
import type {CanonicalSegment} from '../../src/server/canonical-clickhouse.js';
import {CanonicalClickHouse,installCanonicalStore} from '../../src/server/canonical-clickhouse.js';
import {shadowCanonicalBatch,verifyCanonicalShadow} from '../../src/server/canonical-migration.js';
import {captureCanonicalCutoverReceipt,verifyCanonicalCutoverReceipt} from '../../src/server/cutover-receipt.js';
import {prepareFactReadSource} from '../../src/server/fact-store-source.js';

describe.skipIf(!process.env.TEST_DATABASE_URL||!process.env.CLICKHOUSE_TEST_URL)('first-authority transition exact archived-owner receipt',()=>{
 it('binds verified CH shadow to old PG head and surviving V1 archive, rejects mutation, stale state and deletion advancement',async()=>{
  const schema='cutover_'+randomUUID().replaceAll('-',''),site=randomUUID(),epoch=randomUUID(),canonicalEpoch=randomUUID(),archive=randomUUID(),head=randomUUID(),oldSession=randomUUID(),session=randomUUID(),event=randomUUID();
  const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1,options:`-c search_path=${schema}`}),store=new CanonicalClickHouse({url:process.env.CLICKHOUSE_TEST_URL!,username:'baize',password:'local-test-only'});
  await admin.query(`CREATE SCHEMA ${schema}`);
  try{
   await migrate(pool);await store.initialize();await pool.query("INSERT INTO sites(id,name,domain,salt_secret)VALUES($1,'cutover','example.test','producer-test')",[site]);await pool.query('INSERT INTO aggregation_state(site_id,epoch,generation,processed_generation)VALUES($1,$2,2,2)',[site,epoch]);
   const cache=new ClickHouseCacheStore({url:process.env.CLICKHOUSE_TEST_URL!,username:'baize',password:'local-test-only'});await cache.initialize();installCacheStore(pool,cache);const c=await pool.connect();let held=true;const dataDir=await mkdtemp('/tmp/baize-cutover-repair-');try{
    await c.query('BEGIN');await lockSite(c,site);
    for(const id of[archive,head])await c.query("INSERT INTO analytics_fact_runs(id,site_id,epoch,generation,outbox_high_watermark,status,query_version,retained_from)VALUES($1,$2,$3,$4,0,'published',$5,'2026-01-01')",[id,site,epoch,id===head?2:1,id===head?2:1]);
    await c.query("INSERT INTO analytics_effect_facts VALUES($1,$2,'2025-12-31',$3,'archive-B','/archive','{}','visitors','[]',1,true)",[archive,randomUUID(),oldSession]);
    await c.query("INSERT INTO analytics_effect_facts SELECT $1,gen_random_uuid(),'2025-12-31'::timestamptz,$2,'archive-B','/archive','{}'::jsonb,'visitors','[]'::jsonb,1,true FROM generate_series(1,205)",[archive,oldSession]);
    await c.query("INSERT INTO analytics_effect_facts VALUES($1,$2,'2026-01-02',$3,'current-A','/current','{}','visitors','[]',1,true)",[head,event,session]);
    await c.query('INSERT INTO analytics_session_contribution_heads VALUES($1,$2,$3,$4,$5,1)',[site,oldSession,'archive-B',archive,epoch]);
    await c.query("INSERT INTO events(site_id,event_id,ts,visitor_id,page_id,type,path,payload,dimensions)VALUES($1,$2,'2026-01-02','current-A',$3,'pageview','/current','{}','{}')",[site,event,randomUUID()]);
    await c.query("INSERT INTO event_keys(site_id,event_id,hash,ts,visitor_id)VALUES($1,$2,$3,'2026-01-02','current-A')",[site,event,'a'.repeat(64)]);
    // The raw validation is the real streaming verifier and actual CH body,
    // not a hand-written validated_at fixture or an activation guard bypass.
    await shadowCanonicalBatch(c,store,site,canonicalEpoch);expect((await verifyCanonicalShadow(c,store,site)).verified).toBe(1);
    const cacheOwner=randomUUID(),cacheRow={site_id:site,hour:'2025-12-31T00:00:00.000Z',data:{pv:2,visitors:['archive-B']},generation:'1'},cacheFence={expectedAggregationEpoch:epoch,expectedGeneration:'2',expectedCanonicalEpoch:canonicalEpoch,expectedDeletionEpoch:'0',verifyLiveFence:async()=>{}};await cache.stageRows(c,site,cacheOwner,'hourly_rollup',[cacheRow],cacheFence);await cache.completeOwnerKind(c,site,cacheOwner,'hourly_rollup',1,cacheFence);await cache.publishBucket(c,site,cacheOwner,'hourly_rollup',cacheRowKey('hourly_rollup',cacheRow),cacheFence);
    const receipt=await captureCanonicalCutoverReceipt(c,site);expect(receipt.headRun).toBe(head);expect(receipt.count).toBeGreaterThan(205);
    // Test-only authority switch exercises the protected downstream consumer;
    // this fixture does not claim to exercise the public activation API.
    await c.query("UPDATE canonical_event_authority SET authority='clickhouse' WHERE site_id=$1",[site]);await dirtySite(c,site);
    expect(await verifyCanonicalCutoverReceipt(c,site,head)).toBe(true);
    await c.query("INSERT INTO analytics_cache_unavailable(site_id,kind,reason)VALUES($1,'hourly_rollup','privacy_invalidated')",[site]);await expect(verifyCanonicalCutoverReceipt(c,site,head)).rejects.toThrow('CANONICAL_CUTOVER_CLOSURE_CHANGED');await c.query('DELETE FROM analytics_cache_unavailable WHERE site_id=$1',[site]);expect(await verifyCanonicalCutoverReceipt(c,site,head)).toBe(true);
    await expect(prepareFactReadSource(c,pool,site)).rejects.toThrow('FACT_STORE_SOURCE_FENCE');
    const input=await prepareFactReadSource(c,pool,site,{forAuthorityTransition:true});expect((await c.query(`SELECT count(DISTINCT visitor_id)::int n FROM ${input.effectsRelation}`)).rows[0].n).toBe(2);await input.cleanup();expect(pool.waitingCount).toBe(0);
    await c.query("UPDATE analytics_effect_facts SET value=9 WHERE run_id=$1",[archive]);await expect(verifyCanonicalCutoverReceipt(c,site,head)).rejects.toThrow('CANONICAL_CUTOVER_CLOSURE_CHANGED');await c.query('UPDATE analytics_effect_facts SET value=1 WHERE run_id=$1',[archive]);
    await c.query('UPDATE aggregation_state SET processed_generation=generation WHERE site_id=$1',[site]);await expect(verifyCanonicalCutoverReceipt(c,site,head)).rejects.toThrow('CANONICAL_CUTOVER_PROOF_STALE');await c.query('UPDATE aggregation_state SET processed_generation=2 WHERE site_id=$1',[site]);
    await c.query('UPDATE canonical_event_authority SET deletion_epoch=1 WHERE site_id=$1',[site]);await expect(prepareFactReadSource(c,pool,site,{forAuthorityTransition:true})).rejects.toThrow('CANONICAL_CUTOVER_PROOF_STALE');await c.query('UPDATE canonical_event_authority SET deletion_epoch=0 WHERE site_id=$1',[site]);
    await c.query('UPDATE analytics_fact_runs SET epoch=gen_random_uuid() WHERE id=$1',[archive]);await expect(verifyCanonicalCutoverReceipt(c,site,head)).rejects.toThrow('FACT_RUN_CLOSURE_UNAVAILABLE');
    await c.query('UPDATE analytics_fact_runs SET epoch=$2 WHERE id=$1',[archive,epoch]);await c.query('COMMIT');c.release();held=false;
    const ctx:AppContext={pool,redis:null,config:{dataDir,masterKey:randomBytes(32),publicUrl:'http://localhost'},user:async()=>{throw Error('not-used');},authorize:async()=>{throw Error('not-used');},audit:async(actorId,siteId,action,target)=>{await pool.query('INSERT INTO audit_logs(actor_id,site_id,action,target)VALUES($1,$2,$3,$4)',[actorId,siteId,action,JSON.stringify(target)]);}};
    let inject=true;class AckFault extends CanonicalClickHouse{override async deleteSegments(client:PoolClient,id:string,segments:CanonicalSegment[],barrier:()=>Promise<void>){const result=await super.deleteSegments(client,id,segments,barrier);if(inject){inject=false;throw Error('test-after-physical-ACK');}return result;}}
    installCanonicalStore(pool,new AckFault({url:process.env.CLICKHOUSE_TEST_URL!,username:'baize',password:'local-test-only'}));
    await expect(deleteVisitor(ctx,site,{visitor_id:'current-A'},null)).rejects.toThrow('canonical_delete_unavailable');
    // Independent fsync journal survives rollback; replay uses the authentic
    // original proof, then persists repair authorization for a fresh worker.
    installCanonicalStore(pool,store);expect((await replayDeletionJournal(pool,dataDir)).records).toBeGreaterThan(0);
    const remaining=await pool.connect();try{await remaining.query('BEGIN');await lockSite(remaining,site);const repairRow=(await remaining.query('SELECT repair_journal_scope,repair_closure_hash FROM canonical_cutover_receipts WHERE site_id=$1',[site])).rows[0];expect(repairRow.repair_journal_scope).toMatch(/^[0-9a-f]{64}$/);expect(repairRow.repair_closure_hash).toMatch(/^[0-9a-f]{64}$/);
     const repaired=await prepareFactReadSource(remaining,pool,site,{forAuthorityTransition:true});expect((await remaining.query(`SELECT DISTINCT visitor_id FROM ${repaired.effectsRelation}`)).rows.map(row=>row.visitor_id)).toEqual(['archive-B']);await repaired.cleanup();await expect(prepareFactReadSource(remaining,pool,site)).rejects.toThrow('FACT_STORE_SOURCE_FENCE');await remaining.query('ROLLBACK');
    }finally{await remaining.query('ROLLBACK');remaining.release();}

   }finally{if(held){await c.query('ROLLBACK');c.release();}installCanonicalStore(pool,null);const cleanup=await pool.connect();try{await cleanup.query('BEGIN');await cache.invalidateSite(cleanup,site);await cleanup.query('COMMIT');}finally{cleanup.release()}await store.eraseEventID(site,event);await rm(dataDir,{recursive:true,force:true});}
  }finally{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
 },30000);
});
