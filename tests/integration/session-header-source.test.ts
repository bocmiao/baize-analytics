import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {describe,it,expect} from 'vitest';
import {migrate} from '../../src/server/db.js';
import {stageSessionEventHeaders,type SessionEventHeaderRecord} from '../../src/server/session-event-headers.js';
import {ClickHouseSessionHeaderStore,installSessionHeaderStore} from '../../src/server/session-header-store.js';
import {streamSelectedHeaders} from '../../src/server/session-header-source.js';
import {migratePublishedHeaderClosure} from '../../src/server/session-header-publication.js';

describe.skipIf(!process.env.TEST_DATABASE_URL||!process.env.CLICKHOUSE_TEST_URL)('transaction-local header consumer with actual PG and CH',()=>{
 it('spills mixed published CH/legacy PG owners, verifies seals, filters tombstones and never borrows the max1 pool',async()=>{
  const schema='header_source_'+randomUUID().replaceAll('-',''),site=randomUUID(),epoch=randomUUID(),run=randomUUID(),oldRun=randomUUID(),oldSession=randomUUID(),session=randomUUID();
  const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1,options:`-c search_path=${schema}`});
  const store=new ClickHouseSessionHeaderStore({url:process.env.CLICKHOUSE_TEST_URL!,username:'baize',password:'local-test-only'});
  await admin.query(`CREATE SCHEMA ${schema}`);
  try{
   await migrate(pool);await store.initialize();installSessionHeaderStore(pool,store);
   await pool.query("INSERT INTO sites(id,name,domain,salt_secret) VALUES($1,'headers','example.test','producer-test')",[site]);
   await pool.query('INSERT INTO aggregation_state(site_id,epoch,generation,processed_generation) VALUES($1,$2,3,3)',[site,epoch]);
   const c=await pool.connect();
   try{
    await c.query('BEGIN');
    for(const id of[run,oldRun])await c.query("INSERT INTO analytics_fact_runs(id,site_id,epoch,generation,outbox_high_watermark,status,query_version,retained_from)VALUES($1,$2,$3,3,0,'staging',$4,'2026-01-01')",[id,site,epoch,id===run?2:1]);
    for(let offset=0;offset<205;offset+=100){const headers=Array.from({length:Math.min(100,205-offset)},(_,i)=>({sessionId:session,event:{site_id:site,event_id:randomUUID(),visitor_id:'z-visitor',page_id:randomUUID(),ts:new Date(Date.UTC(2026,0,2,0,0,205-offset-i)).toISOString(),type:'pageview',path:'/retained',dimensions:{device:'desktop'},payload:{}}}));await stageSessionEventHeaders(c,site,run,headers);}
    await stageSessionEventHeaders(c,site,oldRun,[{sessionId:oldSession,event:{site_id:site,event_id:randomUUID(),visitor_id:'a-legacy',page_id:randomUUID(),ts:'2025-12-31T00:00:00.000Z',type:'pageview',path:'/legacy',dimensions:{},payload:{}}}]);
    // Test-only producer extraction is bounded just like the production flush.
    for(let offset=0;offset<205;offset+=100){const records=(await c.query('SELECT * FROM analytics_session_event_headers WHERE run_id=$1 ORDER BY event_id LIMIT 100 OFFSET $2',[run,offset])).rows as SessionEventHeaderRecord[];await store.stageRows(c,site,run,records,{expectedAggregationEpoch:epoch,verifyLiveFence:async()=>{expect((await c.query('SELECT epoch FROM aggregation_state WHERE site_id=$1',[site])).rows[0].epoch).toBe(epoch);}});}
    await store.completeRun(c,site,run,205,{expectedAggregationEpoch:epoch,verifyLiveFence:async()=>{}});
    await c.query("UPDATE analytics_fact_runs SET status='published' WHERE site_id=$1",[site]);
    await c.query('INSERT INTO analytics_session_contribution_heads VALUES($1,$2,$3,$4,$5,3)',[site,oldSession,'a-legacy',oldRun,epoch]);
    await c.query('DELETE FROM analytics_session_event_headers WHERE run_id=$1',[run]);
    const all=[];for await(const batch of streamSelectedHeaders(c,pool,site,{mode:'clickhouse'})){expect(batch.length).toBeLessThanOrEqual(100);all.push(...batch);}
    expect(all).toHaveLength(206);expect(all[0]!.visitor_id).toBe('a-legacy');expect(all.slice(1).map(e=>e.ts)).toEqual(all.slice(1).map(e=>e.ts).sort());expect(pool.waitingCount).toBe(0);
    expect((await c.query("SELECT count(*)::int n FROM pg_tables WHERE schemaname LIKE 'pg_temp%' AND tablename LIKE 'header_stage_%'")).rows[0].n).toBe(0);
    await c.query("INSERT INTO tombstones(site_id,visitor_id,source)VALUES($1,'z-visitor','test')",[site]);
    let count=0;for await(const batch of streamSelectedHeaders(c,pool,site,{mode:'clickhouse'}))count+=batch.length;expect(count).toBe(1);
    await c.query("UPDATE analytics_session_event_headers SET reducer_payload='{"+'"event_name":"forged"'+"}' WHERE run_id=$1",[oldRun]);
    await expect((async()=>{for await(const batch of streamSelectedHeaders(c,pool,site,{mode:'clickhouse'}))void batch;})()).rejects.toThrow('SESSION_HEADER_SEAL_INVALID');
    await c.query("UPDATE analytics_session_event_headers SET reducer_payload='{}' WHERE run_id=$1",[oldRun]);
    const original=(await c.query('SELECT * FROM analytics_session_event_headers WHERE run_id=$1',[oldRun])).rows as SessionEventHeaderRecord[];
    await expect(store.migratePublishedRows(c,site,oldRun,[{...original[0]!,event_path:'/invented'}],{expectedAggregationEpoch:epoch,verifyLiveFence:async()=>{}})).rejects.toThrow('SESSION_HEADER_MIGRATION_BODY_MISMATCH');
    expect((await migratePublishedHeaderClosure(c,store,site,{expectedAggregationEpoch:epoch,verifyLiveFence:async()=>{}})).runs).toBe(2);
    await c.query('DELETE FROM analytics_session_event_headers WHERE run_id=$1',[oldRun]);
    let migratedCount=0;for await(const batch of streamSelectedHeaders(c,pool,site,{mode:'clickhouse'}))migratedCount+=batch.length;expect(migratedCount).toBe(1);
    const removal=new URL(process.env.CLICKHOUSE_TEST_URL!);removal.searchParams.set('query',"ALTER TABLE baize_session_headers_v1 DELETE WHERE site_id={site:String} SETTINGS mutations_sync=2");removal.searchParams.set('param_site',site);
    const removed=await fetch(removal,{method:'POST',headers:{'X-ClickHouse-User':'baize','X-ClickHouse-Key':'local-test-only'}});expect(removed.ok).toBe(true);await removed.body?.cancel();
    // A committed receipt with missing physical bodies is unavailable, even
    // when a legacy PG owner remains healthy or deletion hides those visitors.
    await expect((async()=>{for await(const batch of streamSelectedHeaders(c,pool,site,{mode:'clickhouse'}))void batch;})()).rejects.toThrow('SESSION_HEADER_BODY_UNAVAILABLE');
    expect(pool.waitingCount).toBe(0);
    await c.query('ROLLBACK');
   }finally{await c.query('ROLLBACK');await c.query('BEGIN');await store.eraseSegments(c,site,[{visitorId:'z-visitor'}]);await c.query('COMMIT');c.release();}
  }finally{installSessionHeaderStore(pool,null);await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
 },30000);
});
