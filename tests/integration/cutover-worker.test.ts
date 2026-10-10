import {migratePublishedFactClosure} from '../../src/server/fact-closure-migration.js';
import {ClickHouseRemainingFactStore,installRemainingFactStore} from '../../src/server/remaining-fact-store.js';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {Pool} from 'pg';
import {it,expect} from 'vitest';
import {createApp} from '../../src/server/app.js';
import {claimSite,rebuildSite} from '../../src/server/worker.js';
import {queryStats} from '../../src/server/analytics.js';
import {dirtySite,lockSite} from '../../src/server/db.js';
import {CanonicalClickHouse} from '../../src/server/canonical-clickhouse.js';
import {shadowCanonicalBatch,verifyCanonicalShadow} from '../../src/server/canonical-migration.js';
import {captureCanonicalCutoverReceipt} from '../../src/server/cutover-receipt.js';
import {installCanonicalEventStore} from '../../src/server/event-store.js';
import {ClickHouseSessionHeaderStore,installSessionHeaderStore} from '../../src/server/session-header-store.js';
import {ClickHouseFactStore,installFactStore} from '../../src/server/fact-store.js';

it.skipIf(!process.env.TEST_DATABASE_URL||!process.env.CLICKHOUSE_TEST_URL)('first rebuilding worker consumes the real processed PG head through a verified cutover receipt',async()=>{
 const schema='cutoverworker_'+randomUUID().replaceAll('-',''),site=randomUUID(),page=randomUUID(),visitor=randomUUID(),event=randomUUID(),dir=await mkdtemp('/tmp/baize-cutover-worker-');
 const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1,options:`-c search_path=${schema}`});let runtime:Awaited<ReturnType<typeof createApp>>|undefined;
 const config={url:process.env.CLICKHOUSE_TEST_URL!,username:'baize',password:'local-test-only'},store=new CanonicalClickHouse(config),headers=new ClickHouseSessionHeaderStore(config),facts=new ClickHouseFactStore(config),remaining=new ClickHouseRemainingFactStore(config);
 await admin.query(`CREATE SCHEMA ${schema}`);
 try{
  runtime=await createApp({pool,redis:null,background:false,dataDir:dir,keyDir:dir});await pool.query("INSERT INTO sites(id,name,domain,salt_secret)VALUES($1,'cutover-worker','example.test','test')",[site]);await pool.query('UPDATE sites SET retention_days=2 WHERE id=$1',[site]);await pool.query('INSERT INTO aggregation_state(site_id)VALUES($1)',[site]);
  const ts=Date.now()-60000,response=await runtime.app.inject({method:'POST',url:'/api/collect',headers:{origin:'https://example.test','user-agent':'Mozilla/5.0 Chrome/120.0'},payload:{protocol_version:1,site_id:site,sdk:'native',sent_at:Date.now(),events:[{event_id:event,page_id:page,visitor_id:visitor,ts,type:'pageview',url:'https://example.test/real',path:'/real'},{event_id:randomUUID(),page_id:randomUUID(),visitor_id:randomUUID(),ts:Date.now()-25*3600000,type:'pageview',url:'https://example.test/archive',path:'/archive'}]}});expect(response.statusCode).toBe(202);
  const pgclaim=await claimSite(pool);expect(pgclaim).not.toBeNull();expect(await rebuildSite(pool,pgclaim!)).toBe(true);
  await pool.query('UPDATE sites SET retention_days=1 WHERE id=$1',[site]);await pool.query('UPDATE aggregation_state SET generation=generation+1 WHERE site_id=$1',[site]);const second=await claimSite(pool);expect(await rebuildSite(pool,second!)).toBe(true);
  const old=(await pool.query("SELECT id,source_authority FROM analytics_fact_runs WHERE site_id=$1 AND status='published' ORDER BY generation DESC LIMIT 1",[site])).rows[0];expect(old.source_authority).toBe('postgres');
  await store.initialize();await headers.initialize();await facts.initialize();await remaining.initialize();installRemainingFactStore(pool,remaining);installCanonicalEventStore(pool,store);installSessionHeaderStore(pool,headers);installFactStore(pool,facts);
  const c=await pool.connect();try{await c.query('BEGIN');await lockSite(c,site);await shadowCanonicalBatch(c,store,site,randomUUID());expect((await verifyCanonicalShadow(c,store,site)).verified).toBe(2);const migrationEpoch=(await c.query('SELECT epoch FROM aggregation_state WHERE site_id=$1',[site])).rows[0].epoch;const canonicalEpoch=(await c.query('SELECT epoch FROM canonical_event_authority WHERE site_id=$1',[site])).rows[0].epoch;const migrated=await migratePublishedFactClosure(c,site,{facts,remaining},{expectedAggregationEpoch:migrationEpoch,expectedCanonicalEpoch:canonicalEpoch,expectedDeletionEpoch:'0',verifyLiveFence:async()=>{const state=(await c.query('SELECT a.epoch,c.epoch canonical,c.deletion_epoch::text deletion FROM aggregation_state a JOIN canonical_event_authority c USING(site_id) WHERE a.site_id=$1',[site])).rows[0];expect(state).toEqual({epoch:migrationEpoch,canonical:canonicalEpoch,deletion:'0'});}});expect(migrated.runs).toBeGreaterThanOrEqual(2);expect((await captureCanonicalCutoverReceipt(c,site)).headRun).toBe(old.id);
   // Explicit test-only authority mutation. The guarded public activation
   // is exercised separately; this proves the captured downstream worker contract.
   await c.query("UPDATE canonical_event_authority SET authority='clickhouse' WHERE site_id=$1",[site]);await dirtySite(c,site);await c.query('COMMIT');
  }finally{await c.query('ROLLBACK');c.release();}
  const chclaim=await claimSite(pool);expect(chclaim).not.toBeNull();expect(await rebuildSite(pool,chclaim!)).toBe(true);
  const current=(await pool.query("SELECT source_authority FROM analytics_fact_runs WHERE site_id=$1 AND status='published' ORDER BY generation DESC LIMIT 1",[site])).rows[0];expect(current.source_authority).toBe('clickhouse');
  const stats=await queryStats(runtime.ctx,site,new Date(ts-1000).toISOString(),new Date(ts+1000).toISOString());expect(stats.totals).toMatchObject({pv:1,uv:1,sessions:1});expect(stats.coverage).toBe(1);const full=await queryStats(runtime.ctx,site,new Date(Date.now()-26*3600000).toISOString(),new Date(Date.now()).toISOString());expect(full.totals).toMatchObject({pv:2,uv:2,sessions:2});expect(full.pages.find(p=>p.path==='/archive')?.pv).toBe(1);expect(pool.waitingCount).toBe(0);
 }finally{if(runtime){const c=await pool.connect();try{await c.query('BEGIN');const rows=(await c.query('SELECT visitor_id FROM canonical_event_members WHERE site_id=$1',[site])).rows;for(const row of rows){await remaining.eraseSegments(c,site,[{visitorId:row.visitor_id}]);await facts.eraseSegments(c,site,[{visitorId:row.visitor_id}]);await headers.eraseSegments(c,site,[{visitorId:row.visitor_id}]);}await c.query('COMMIT');}finally{await c.query('ROLLBACK');c.release();}}await store.eraseEventID(site,event);const originalEvents=(await pool.query('SELECT event_id FROM canonical_event_members WHERE site_id=$1',[site])).rows;for(const item of originalEvents)await store.eraseEventID(site,item.event_id);await runtime?.app.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();await rm(dir,{recursive:true,force:true});}
},30000);
