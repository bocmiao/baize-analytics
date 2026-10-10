import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {describe,it,expect} from 'vitest';
import {migrate} from '../../src/server/db.js';
import {ClickHouseFactStore,installFactStore,type FactStoreRecord} from '../../src/server/fact-store.js';
import {prepareFactReadSource,withFactReadSource} from '../../src/server/fact-store-source.js';
import {factReadSql,hasFactReadSource} from '../../src/server/fact-read-context.js';

describe.skipIf(!process.env.TEST_DATABASE_URL||!process.env.CLICKHOUSE_TEST_URL)('bounded transaction-local fact source with actual PG CH',()=>{
 it('unions CH effects and zero-kind receipts with legacy owned PG rows, filters identities and restores nested read context',async()=>{
  const schema='fact_source_'+randomUUID().replaceAll('-',''),site=randomUUID(),epoch=randomUUID(),run=randomUUID(),legacy=randomUUID(),session=randomUUID(),oldSession=randomUUID();
  const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1,options:`-c search_path=${schema}`}),store=new ClickHouseFactStore({url:process.env.CLICKHOUSE_TEST_URL!,username:'baize',password:'local-test-only'});
  await admin.query(`CREATE SCHEMA ${schema}`);
  try{
   await migrate(pool);await store.initialize();installFactStore(pool,store);
   await pool.query("INSERT INTO sites(id,name,domain,salt_secret)VALUES($1,'facts','example.test','producer-test')",[site]);await pool.query('INSERT INTO aggregation_state(site_id,epoch,generation,processed_generation)VALUES($1,$2,3,3)',[site,epoch]);
   const c=await pool.connect();try{
    await c.query('BEGIN');
    for(const id of[run,legacy])await c.query("INSERT INTO analytics_fact_runs(id,site_id,epoch,generation,outbox_high_watermark,status,query_version,retained_from)VALUES($1,$2,$3,3,0,'staging',$4,'2026-01-01')",[id,site,epoch,id===run?2:1]);
    const fence={expectedAggregationEpoch:epoch,verifyLiveFence:async()=>{expect((await c.query('SELECT epoch FROM aggregation_state WHERE site_id=$1',[site])).rows[0].epoch).toBe(epoch);}};
    for(let offset=0;offset<205;offset+=100){const records:FactStoreRecord[]=Array.from({length:Math.min(100,205-offset)},()=>({visitorId:'CH-visitor',sessionId:session,row:{run_id:run,event_id:randomUUID(),event_ts:'2026-01-02T00:00:00.000Z',session_id:session,visitor_id:'CH-visitor',event_path:'/ch',dimensions:{device:'desktop'},metric:'visitors',key:[],value:1,member:true}}));await store.stageRecords(c,site,run,'effects',records,fence);}
    await store.completeRunKind(c,site,run,'effects',fence);await store.completeRunKind(c,site,run,'vitals',fence);
    const oldEvent=randomUUID();await c.query("INSERT INTO analytics_effect_facts VALUES($1,$2,'2025-12-31',$3,'PG-visitor','/legacy','{}','visitors','[]',1,true)",[legacy,oldEvent,oldSession]);await c.query("INSERT INTO analytics_vital_samples VALUES($1,$2,'2025-12-31','/legacy','{}','lcp',123)",[legacy,oldEvent]);
    // An authoritative zero-kind marker must not fall back to leftover PG data.
    await c.query("INSERT INTO analytics_vital_samples VALUES($1,$2,'2026-01-02','/ch','{}','lcp',999)",[run,randomUUID()]);
    await c.query("UPDATE analytics_fact_runs SET status='published' WHERE site_id=$1",[site]);await c.query('INSERT INTO analytics_session_contribution_heads VALUES($1,$2,$3,$4,$5,3)',[site,oldSession,'PG-visitor',legacy,epoch]);
    expect((await c.query('SELECT count(*)::int n FROM analytics_effect_facts WHERE run_id=$1',[run])).rows[0].n).toBe(0);
    await withFactReadSource(c,pool,site,async source=>{
     expect(source.source).toBe('hybrid');expect(hasFactReadSource(c)).toBe(true);expect((await c.query(`SELECT count(*)::int n FROM ${source.effectsRelation}`)).rows[0].n).toBe(206);
     expect((await c.query(factReadSql(c,'SELECT count(DISTINCT visitor_id)::int n FROM analytics_effect_facts'))).rows[0].n).toBe(2);
     expect((await c.query(`SELECT value FROM ${source.vitalsRelation}`)).rows.map(r=>r.value)).toEqual([123]);
     await withFactReadSource(c,pool,site,async nested=>expect(nested.effectsRelation).toBe(source.effectsRelation));expect(hasFactReadSource(c)).toBe(true);
    });expect(hasFactReadSource(c)).toBe(false);expect(pool.waitingCount).toBe(0);
    await c.query("INSERT INTO identity_tombstones(site_id,visitor_id,user_id,started_at,ended_at)VALUES($1,'CH-visitor','A','2026-01-01','2026-01-03')",[site]);
    const filtered=await prepareFactReadSource(c,pool,site);expect((await c.query(`SELECT count(*)::int n FROM ${filtered.effectsRelation}`)).rows[0].n).toBe(1);await filtered.cleanup();
    const canonicalEpoch=randomUUID();await c.query("INSERT INTO canonical_event_authority(site_id,epoch,authority,deletion_epoch)VALUES($1,$2,'clickhouse',1)",[site,canonicalEpoch]);
    await c.query("UPDATE analytics_fact_runs SET source_authority='clickhouse',canonical_epoch=$2,canonical_deletion_epoch=0 WHERE id=$1",[run,canonicalEpoch]);
    // A stale publication is never a read-only complete result. A rebuild may
    // inspect authenticated surviving input only while the same-epoch state is
    // dirty and the same canonical namespace has advanced its deletion fence.
    await expect(prepareFactReadSource(c,pool,site)).rejects.toThrow('FACT_STORE_SOURCE_FENCE');
    await expect(prepareFactReadSource(c,pool,site,{forRebuild:true})).rejects.toThrow('FACT_STORE_SOURCE_FENCE');
    await c.query('UPDATE aggregation_state SET generation=4 WHERE site_id=$1',[site]);
    const repair=await prepareFactReadSource(c,pool,site,{forRebuild:true});expect((await c.query(`SELECT count(*)::int n FROM ${repair.effectsRelation}`)).rows[0].n).toBe(1);await repair.cleanup();
    await c.query('UPDATE aggregation_state SET processed_generation=0 WHERE site_id=$1',[site]);
    const invalidatedRepair=await prepareFactReadSource(c,pool,site,{forRebuild:true});expect((await c.query(`SELECT count(*)::int n FROM ${invalidatedRepair.effectsRelation}`)).rows[0].n).toBe(1);await invalidatedRepair.cleanup();
    await c.query('UPDATE aggregation_state SET processed_generation=3 WHERE site_id=$1',[site]);
    await c.query('UPDATE analytics_fact_runs SET epoch=gen_random_uuid() WHERE id=$1',[run]);
    await expect(prepareFactReadSource(c,pool,site,{forRebuild:true})).rejects.toThrow('FACT_STORE_SOURCE_FENCE');
    await c.query('UPDATE analytics_fact_runs SET epoch=$2 WHERE id=$1',[run,epoch]);
    await c.query('UPDATE canonical_event_authority SET epoch=gen_random_uuid() WHERE site_id=$1',[site]);
    await expect(prepareFactReadSource(c,pool,site,{forRebuild:true})).rejects.toThrow('FACT_STORE_SOURCE_FENCE');
    await c.query('UPDATE canonical_event_authority SET epoch=$2 WHERE site_id=$1',[site,canonicalEpoch]);
    const removal=new URL(process.env.CLICKHOUSE_TEST_URL!);removal.searchParams.set('query',"ALTER TABLE baize_derived_facts_v1 DELETE WHERE site_id={site:String} SETTINGS mutations_sync=2");removal.searchParams.set('param_site',site);const response=await fetch(removal,{method:'POST',headers:{'X-ClickHouse-User':'baize','X-ClickHouse-Key':'local-test-only'}});expect(response.ok).toBe(true);await response.body?.cancel();
    await expect(prepareFactReadSource(c,pool,site,{forRebuild:true})).rejects.toThrow('FACT_STORE_BODY_UNAVAILABLE');expect(hasFactReadSource(c)).toBe(false);await c.query('ROLLBACK');
   }finally{await c.query('ROLLBACK');await c.query('BEGIN');await store.eraseSegments(c,site,[{visitorId:'CH-visitor'}]);await c.query('COMMIT');c.release();}
  }finally{installFactStore(pool,null);await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
 },30000);
});
