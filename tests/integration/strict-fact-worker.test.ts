import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {Pool} from 'pg';
import {it,expect} from 'vitest';
import {createApp} from '../../src/server/app.js';
import {claimSite,rebuildSite} from '../../src/server/worker.js';
import {lockSite,dirtySite} from '../../src/server/db.js';
import {readFullSiteFacts} from '../../src/server/site-export.js';
import {queryStats} from '../../src/server/analytics.js';
import {CanonicalClickHouse} from '../../src/server/canonical-clickhouse.js';
import {installCanonicalEventStore} from '../../src/server/event-store.js';
import {shadowCanonicalBatch,verifyCanonicalShadow,CANONICAL_ACTIVATION_READY} from '../../src/server/canonical-migration.js';
import {captureCanonicalCutoverReceipt} from '../../src/server/cutover-receipt.js';
import {ClickHouseSessionHeaderStore,installSessionHeaderStore} from '../../src/server/session-header-store.js';
import {ClickHouseFactStore,installFactStore} from '../../src/server/fact-store.js';
import {ClickHouseRemainingFactStore,installRemainingFactStore} from '../../src/server/remaining-fact-store.js';
import {ClickHouseCacheStore,installCacheStore} from '../../src/server/cache-store.js';
import {migratePublishedHeaderClosure} from '../../src/server/session-header-publication.js';
import {migratePublishedFactClosure} from '../../src/server/fact-closure-migration.js';
import {migratePublishedCacheClosure} from '../../src/server/cache-closure-migration.js';
import {activateStrictFactBodies} from '../../src/server/strict-fact-storage.js';
import {backupSessionHeaders} from '../../src/server/session-header-backup.js';
import {backupFactBodies} from '../../src/server/fact-body-backup.js';
import {backupRemainingBodies} from '../../src/server/remaining-body-backup.js';
import {backupCacheBodies} from '../../src/server/cache-body-backup.js';
import {loadVerifiedFactBackup,type VerifiedFactBackup} from '../../src/server/fact-backup-readiness.js';

it.skipIf(!process.env.TEST_DATABASE_URL||!process.env.CLICKHOUSE_TEST_URL||!CANONICAL_ACTIVATION_READY)('real sealed backup activates strict facts and subsequent workers retain no persistent PG body',async()=>{
 const schema='strictfacts_'+randomUUID().replaceAll('-',''),site=randomUUID(),visitor=randomUUID(),page=randomUUID(),dir=await mkdtemp('/tmp/baize-strict-facts-'),admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1,options:`-c search_path=${schema}`});let runtime:Awaited<ReturnType<typeof createApp>>|undefined;
 const config={url:process.env.CLICKHOUSE_TEST_URL!,username:'baize',password:'local-test-only'},canonical=new CanonicalClickHouse(config),headers=new ClickHouseSessionHeaderStore(config),facts=new ClickHouseFactStore(config),remaining=new ClickHouseRemainingFactStore(config),cache=new ClickHouseCacheStore(config),key=randomBytes(32),now=Date.now()-60000;
 await admin.query(`CREATE SCHEMA ${schema}`);
 try{
  runtime=await createApp({pool,redis:null,background:false,dataDir:dir,keyDir:dir});await pool.query("INSERT INTO sites(id,name,domain,salt_secret) VALUES($1,'strict','example.test','strict-test-secret')",[site]);await pool.query('INSERT INTO aggregation_state(site_id) VALUES($1)',[site]);
  let eventSequence=0;
  const collect=async(path:string,type='pageview',extra:Record<string,unknown>={})=>{const r=await runtime!.app.inject({method:'POST',url:'/api/collect',headers:{origin:'https://example.test','user-agent':'Mozilla/5.0 Chrome/120.0'},payload:{protocol_version:1,site_id:site,sdk:'strict-native',sent_at:Date.now(),events:[{event_id:randomUUID(),visitor_id:visitor,page_id:page,ts:now+eventSequence++,type,url:'https://example.test'+path,path,...extra}]}});expect(r.statusCode).toBe(202);};
  const run=async()=>{const claim=await claimSite(pool);expect(claim).not.toBeNull();expect(await rebuildSite(pool,claim!)).toBe(true);};
  await collect('/entry');await collect('/entry','vitals',{vitals:{lcp:100}});await collect('/orphan','event',{visitor_id:randomUUID(),event_name:'orphan_custom',props:{plan:'免费'}});await run();
  for(const store of [canonical,headers,facts,remaining,cache])await store.initialize();installCanonicalEventStore(pool,canonical);installSessionHeaderStore(pool,headers);installFactStore(pool,facts);installRemainingFactStore(pool,remaining);installCacheStore(pool,cache);
  const c=await pool.connect();try{await c.query('BEGIN');await lockSite(c,site);await shadowCanonicalBatch(c,canonical,site,randomUUID());expect((await verifyCanonicalShadow(c,canonical,site)).verified).toBe(3);const state=(await c.query('SELECT a.epoch,c.epoch canonical,c.deletion_epoch::text deletion,a.generation::text generation FROM aggregation_state a JOIN canonical_event_authority c USING(site_id) WHERE a.site_id=$1',[site])).rows[0],fence={expectedAggregationEpoch:state.epoch,expectedCanonicalEpoch:state.canonical,expectedDeletionEpoch:state.deletion,expectedGeneration:state.generation,verifyLiveFence:async()=>{}};
   await migratePublishedHeaderClosure(c,headers,site,fence);await migratePublishedFactClosure(c,site,{facts,remaining,headers},fence);await captureCanonicalCutoverReceipt(c,site);
   // Test-only activation; public canonical readiness guard remains disabled.
   await c.query("UPDATE canonical_event_authority SET authority='clickhouse' WHERE site_id=$1",[site]);await dirtySite(c,site);await c.query('COMMIT');
  }finally{await c.query('ROLLBACK');c.release();}
  await run();
  const b=await pool.connect();try{await b.query('BEGIN');await lockSite(b,site);const s=(await b.query('SELECT a.epoch,c.epoch canonical,c.deletion_epoch::text deletion,a.generation::text generation FROM aggregation_state a JOIN canonical_event_authority c USING(site_id) WHERE a.site_id=$1',[site])).rows[0],fence={expectedAggregationEpoch:s.epoch,expectedCanonicalEpoch:s.canonical,expectedDeletionEpoch:s.deletion,expectedGeneration:s.generation,verifyLiveFence:async()=>{}};
   await migratePublishedHeaderClosure(b,headers,site,fence);await migratePublishedFactClosure(b,site,{facts,remaining,headers},fence);await migratePublishedCacheClosure(b,cache,site,fence);
   const packages=join(dir,'packages');await mkdir(packages,{mode:0o700});await backupSessionHeaders(b,headers,join(packages,'headers'),key);await backupFactBodies(b,facts,join(packages,'facts'),key);await backupRemainingBodies(b,remaining,join(packages,'remaining'),key);await backupCacheBodies(b,cache,join(packages,'caches'),key);
   const proof=await loadVerifiedFactBackup(b,{packageDirectory:packages,journalDir:runtime.ctx.config.dataDir,key,stores:{headers,facts,remaining,cache},scope:'all'});
   await expect(activateStrictFactBodies(b,site,{verified:true,scope:'all'} as VerifiedFactBackup,{facts,remaining})).rejects.toThrow('PROOF_INVALID');
   expect(await activateStrictFactBodies(b,site,proof,{facts,remaining})).toMatchObject({strict:true,authority:'clickhouse'});const cacheOwnersBefore=Number((await b.query('SELECT count(*) n FROM analytics_cache_owners WHERE site_id=$1',[site])).rows[0].n);await migratePublishedCacheClosure(b,cache,site,fence);expect(Number((await b.query('SELECT count(*) n FROM analytics_cache_owners WHERE site_id=$1',[site])).rows[0].n)).toBe(cacheOwnersBefore);await b.query('COMMIT');
  }finally{await b.query('ROLLBACK');b.release();}
  const assertNoBodies=async()=>{for(const table of ['analytics_effect_facts','analytics_vital_samples','analytics_session_facts','analytics_numeric_facts','analytics_member_facts','analytics_carry_checkpoints','analytics_carry_keys','analytics_vitals_facts','analytics_session_event_headers'])expect(Number((await pool.query(`SELECT count(*) n FROM ${table} x JOIN analytics_fact_runs r ON r.id=x.run_id WHERE r.site_id=$1`,[site])).rows[0].n),table).toBe(0);};
  await assertNoBodies();await collect('/tail');await collect('/orphan','event',{visitor_id:randomUUID(),event_name:'orphan_custom',props:{plan:'免费'}});await run();await assertNoBodies();await collect('/later');await run();await assertNoBodies();
  const stats=await queryStats(runtime.ctx,site,new Date(now-1000).toISOString(),new Date().toISOString());expect(stats.coverage).toBe(1);expect(stats.totals.pv).toBe(3);expect(stats.totals.uv).toBe(1);expect(stats.totals.sessions).toBe(1);expect(stats.events.find(e=>e.name==='orphan_custom')).toMatchObject({count:2,uv:2});expect(stats.pages.find(p=>p.path==='/entry')?.pv).toBe(1);expect(stats.vitals.find(v=>v.metric==='lcp')?.sampleCount).toBe(1);const exportClient=await pool.connect();try{await exportClient.query('BEGIN');await lockSite(exportClient,site);const exported=await readFullSiteFacts(exportClient,site,false,{pool,canonicalReplayRows:[]});expect(exported.sessions).toHaveLength(1);expect(exported.sessions[0]).toMatchObject({pageviews:3,entry_path:'/entry',exit_path:'/later'});expect(exported.analytics_definitions).toHaveLength(1);expect(exported.analytics_definitions[0].data).toMatchObject({goals:[],funnels:[]});await exportClient.query('COMMIT');}finally{await exportClient.query('ROLLBACK');exportClient.release();}expect(pool.waitingCount).toBe(0);expect((await pool.query("SELECT count(*)::int n FROM pg_class WHERE relnamespace=pg_my_temp_schema() AND relname LIKE 'strict_publish_%' ")).rows[0].n).toBe(0);
 }finally{const cleanup=await pool.connect();try{await cleanup.query('BEGIN');await cache.invalidateSite(cleanup,site);const visitors=(await cleanup.query('SELECT DISTINCT m.visitor_id FROM analytics_remaining_fact_members m JOIN analytics_fact_runs r ON r.id=m.run_id WHERE r.site_id=$1',[site])).rows.map(row=>({visitorId:row.visitor_id}));if(visitors.length){await remaining.eraseSegments(cleanup,site,visitors);await facts.eraseSegments(cleanup,site,visitors);await headers.eraseSegments(cleanup,site,visitors);await canonical.deleteSegments(cleanup,site,visitors,async()=>{});}await cleanup.query('COMMIT');}finally{await cleanup.query('ROLLBACK');cleanup.release();}await runtime?.app.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();await rm(dir,{recursive:true,force:true});}
},40000);
