import {fixtureInstallationNonce} from '../helpers/install-fixture.js';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {Pool} from 'pg';
import {it,expect} from 'vitest';
import {TDigest} from 'tdigest';
import {createApp} from '../helpers/install-fixture.js';
import {claimSite,rebuildSite} from '../../src/server/worker.js';
import {lockSite} from '../../src/server/db.js';
import {CanonicalClickHouse} from '../../src/server/canonical-clickhouse.js';
import {installCanonicalEventStore} from '../../src/server/event-store.js';
import {shadowCanonicalBatch,verifyCanonicalShadow} from '../../src/server/canonical-migration.js';
import {ClickHouseSessionHeaderStore,installSessionHeaderStore} from '../../src/server/session-header-store.js';
import {ClickHouseFactStore,installFactStore} from '../../src/server/fact-store.js';
import {ClickHouseRemainingFactStore,installRemainingFactStore} from '../../src/server/remaining-fact-store.js';
import {ClickHouseCacheStore,installCacheStore,type CacheFence} from '../../src/server/cache-store.js';
import {migratePublishedHeaderClosure} from '../../src/server/session-header-publication.js';
import {migratePublishedFactClosure} from '../../src/server/fact-closure-migration.js';
import {migratePublishedCacheClosure} from '../../src/server/cache-closure-migration.js';
import {deleteVisitor} from '../../src/server/deletion.js';
import {rebuildInvalidatedCentroids} from '../../src/server/cache-centroid-rebuild.js';
it.skipIf(!process.env.TEST_DATABASE_URL||!process.env.CLICKHOUSE_TEST_URL)('real two-visitor CH samples rebuild invalidated centroids after exact deletion, without PG digest fallback',async()=>{
 const schema='centroid_rebuild_'+randomUUID().replaceAll('-',''),site=randomUUID(),a=randomUUID(),b=randomUUID(),dir=await mkdtemp('/tmp/baize-centroid-rebuild-');
 const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1,options:`-c search_path=${schema}`});
 const config={url:process.env.CLICKHOUSE_TEST_URL!,username:'baize',password:'local-test-only'},canonical=new CanonicalClickHouse(config),headers=new ClickHouseSessionHeaderStore(config),facts=new ClickHouseFactStore(config),remaining=new ClickHouseRemainingFactStore(config),cache=new ClickHouseCacheStore(config);let runtime:Awaited<ReturnType<typeof createApp>>|undefined;
 try{
 await admin.query(`CREATE SCHEMA ${schema}`);runtime=await createApp({pool,redis:null,background:false,dataDir:dir,keyDir:dir,publicUrl:'http://localhost',canonical});const base=await runtime.app.listen({host:'127.0.0.1',port:0});
 const setup=await runtime.app.inject({method:'POST',url:'/api/setup',payload:{installationNonce:fixtureInstallationNonce,email:'centroid@example.invalid',password:'Local-only-centroid-1234!'}});expect(setup.statusCode).toBe(200);const cookie=String(setup.headers['set-cookie']).split(';')[0]!;
 const created=await runtime.app.inject({method:'POST',url:'/api/v1/sites',headers:{cookie},payload:{name:'Centroid test',domain:'example.test',timezone:'UTC'}});expect(created.statusCode).toBe(201);const actualSite=created.json().site.id as string;
 // Keep the actual authorized site returned by the API; no fabricated owner.
 const selected=actualSite;
 await pool.query("UPDATE sites SET config=config||'{\"vitals\":true}'::jsonb WHERE id=$1",[selected]);
 const now=Date.now()-60000,events=[{visitor:a,value:900},{visitor:b,value:100}].flatMap(({visitor,value})=>{const page=randomUUID();return [{event_id:randomUUID(),visitor_id:visitor,page_id:page,type:'pageview',path:'/same',ts:now,url:'https://example.test/same'},{event_id:randomUUID(),visitor_id:visitor,page_id:page,type:'vitals',path:'/same',ts:now+1000,url:'https://example.test/same',vitals:{lcp:value}}]});
 const collected=await fetch(base+'/api/collect',{method:'POST',headers:{origin:'https://example.test','user-agent':'Mozilla/5.0 Chrome/120.0','content-type':'application/json'},body:JSON.stringify({protocol_version:1,site_id:selected,sdk:'centroid-native',sent_at:Date.now(),events})});expect(collected.status,await collected.text()).toBe(202);
 const run=async()=>{const claim=await claimSite(pool);expect(claim).not.toBeNull();expect(await rebuildSite(pool,claim!)).toBe(true);};await run();
 for(const store of[canonical,headers,facts,remaining,cache])await store.initialize();installCanonicalEventStore(pool,canonical);installSessionHeaderStore(pool,headers);installFactStore(pool,facts);installRemainingFactStore(pool,remaining);installCacheStore(pool,cache);
 const fence=async(c:import('pg').PoolClient):Promise<CacheFence>=>{const state=(await c.query('SELECT a.epoch,a.generation::text,c.epoch canonical,c.deletion_epoch::text deletion FROM aggregation_state a JOIN canonical_event_authority c USING(site_id) WHERE a.site_id=$1',[selected])).rows[0];return {expectedAggregationEpoch:state.epoch,expectedGeneration:state.generation,expectedCanonicalEpoch:state.canonical,expectedDeletionEpoch:state.deletion,verifyLiveFence:async()=>{}};};
 let c=await pool.connect();try{await c.query('BEGIN');await lockSite(c,selected);await shadowCanonicalBatch(c,canonical,selected,randomUUID());expect((await verifyCanonicalShadow(c,canonical,selected)).verified).toBe(4);const f=await fence(c);await migratePublishedHeaderClosure(c,headers,selected,f);await migratePublishedFactClosure(c,selected,{facts,remaining,headers},f);await c.query('COMMIT');}finally{await c.query('ROLLBACK');c.release();}
 const activation=await runtime.app.inject({method:'POST',url:`/api/v1/sites/${selected}/canonical`,headers:{cookie},payload:{action:'activate'}});expect(activation.statusCode,activation.body).toBe(200);await run();
 c=await pool.connect();try{await c.query('BEGIN');await lockSite(c,selected);const f=await fence(c);await migratePublishedHeaderClosure(c,headers,selected,f);await migratePublishedFactClosure(c,selected,{facts,remaining,headers},f);await migratePublishedCacheClosure(c,cache,selected,f);let total=0;for await(const owners of cache.streamCommittedOwners(c,selected))for(const owner of owners)if(owner.kind==='page_centroid')for await(const rows of cache.streamRows(c,selected,owner.owner_id,'page_centroid'))for(const record of rows)total+=Number(record.row.sample_count);expect(total).toBe(2);await c.query('COMMIT');}finally{await c.query('ROLLBACK');c.release();}
 await deleteVisitor(runtime.ctx,selected,{visitor_id:a},null);await run();
 c=await pool.connect();try{await c.query('BEGIN');await lockSite(c,selected);const f=await fence(c);const flags=(await c.query("SELECT kind,rebuildable_v2,rebuild_proof FROM analytics_cache_unavailable WHERE site_id=$1 AND kind IN('page_centroid','legacy_centroid') ORDER BY kind",[selected])).rows;expect(flags).toHaveLength(2);for(const flag of flags){expect(flag.rebuildable_v2).toBe(true);expect(flag.rebuild_proof[0].body.method).toBe('authenticated_centroid_cache_scope');expect(flag.rebuild_proof[0].body.bucketCount).toBeGreaterThan(0);}
 await c.query('SAVEPOINT no_witness');await c.query('DELETE FROM analytics_fact_coverage_witnesses WHERE site_id=$1',[selected]);await expect(migratePublishedCacheClosure(c,cache,selected,f,{pool})).rejects.toThrow('FACT_COVERAGE_UNAVAILABLE');await c.query('ROLLBACK TO SAVEPOINT no_witness');
 await c.query('SAVEPOINT wrong_site');await expect(rebuildInvalidatedCentroids(c,pool,cache,site,'page_centroid',new Date(now-3600000).toISOString(),new Date(now+3600000).toISOString(),f)).rejects.toThrow('FACT_COVERAGE_AUTHORITY');await c.query('ROLLBACK TO SAVEPOINT wrong_site');
 await c.query('DELETE FROM analytics_vital_samples WHERE run_id IN(SELECT id FROM analytics_fact_runs WHERE site_id=$1)',[selected]);await c.query('DELETE FROM analytics_vitals_facts WHERE run_id IN(SELECT id FROM analytics_fact_runs WHERE site_id=$1)',[selected]);await c.query('DELETE FROM page_vitals WHERE site_id=$1',[selected]);
 expect((await c.query('SELECT count(*)::int n FROM analytics_vital_samples')).rows[0].n).toBe(0);
 await migratePublishedCacheClosure(c,cache,selected,f,{pool});expect((await c.query('SELECT count(*)::int n FROM analytics_cache_unavailable WHERE site_id=$1',[selected])).rows[0].n).toBe(0);
 const originalScope=flags.find(flag=>flag.kind==='page_centroid').rebuild_proof[0].body;
 const rebuilt=[];for await(const owners of cache.streamCommittedOwners(c,selected))for(const owner of owners)if(owner.kind==='page_centroid')for await(const rows of cache.streamRows(c,selected,owner.owner_id,'page_centroid'))rebuilt.push(...rows);
 expect(rebuilt).toHaveLength(1);expect(Number(rebuilt[0]!.row.sample_count)).toBe(1);const digest=new TDigest();digest.push(100);digest.compress();expect(rebuilt[0]!.row.digest).toEqual(digest.toArray());expect(digest.percentile(.75)).toBe(100);expect(digest.percentile(.9)).toBe(100);expect(pool.waitingCount).toBe(0);await c.query('COMMIT');
 const mutate=async(query:string)=>{const url=new URL(process.env.CLICKHOUSE_TEST_URL!);url.searchParams.set('query',query);url.searchParams.set('param_site',selected);const response=await fetch(url,{method:'POST',headers:{'X-ClickHouse-User':'baize','X-ClickHouse-Key':'local-test-only'}});expect(response.ok).toBe(true);await response.body?.cancel();};
 await mutate("ALTER TABLE baize_derived_facts_v1 UPDATE body_hash='corrupt' WHERE site_id={site:String} AND kind='vitals' SETTINGS mutations_sync=2");await c.query('BEGIN');await expect(rebuildInvalidatedCentroids(c,pool,cache,selected,'page_centroid',originalScope.from,originalScope.to,f)).rejects.toThrow(/FACT_STORE_(BODY_UNAVAILABLE|SEAL_INVALID|MANIFEST_CORRUPT)/);await c.query('ROLLBACK');
 await mutate("ALTER TABLE baize_derived_facts_v1 DELETE WHERE site_id={site:String} AND kind='vitals' SETTINGS mutations_sync=2");await c.query('BEGIN');await expect(rebuildInvalidatedCentroids(c,pool,cache,selected,'page_centroid',originalScope.from,originalScope.to,f)).rejects.toThrow('FACT_STORE_BODY_UNAVAILABLE');await c.query('ROLLBACK');
 }finally{await c.query('ROLLBACK');c.release();}
 }finally{if(runtime){const sites=(await pool.query('SELECT id FROM sites')).rows;for(const row of sites){const c=await pool.connect();try{await c.query('BEGIN');await cache.invalidateSite(c,row.id);await c.query('COMMIT');}finally{await c.query('ROLLBACK');c.release();}}await runtime.app.close();for(const row of sites)for(const table of ['baize_canonical_batches_v1','baize_session_headers_v1','baize_derived_facts_v1','baize_remaining_facts_v1','baize_carry_recovery_v1']){const url=new URL(process.env.CLICKHOUSE_TEST_URL!);url.searchParams.set('query',`ALTER TABLE ${table} DELETE WHERE site_id={site:String} SETTINGS mutations_sync=2`);url.searchParams.set('param_site',row.id);const response=await fetch(url,{method:'POST',headers:{'X-ClickHouse-User':'baize','X-ClickHouse-Key':'local-test-only'}});await response.body?.cancel();if(!response.ok)throw Error('CENTROID_FIXTURE_CLEANUP_FAILED');}}await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();await rm(dir,{recursive:true,force:true});}
},90000);
