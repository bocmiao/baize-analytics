import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {Pool} from 'pg';
import {it,expect} from 'vitest';
import {migrate} from '../../src/server/db.js';
import {initializeJournal} from '../../src/server/deletion.js';
import {ClickHouseCacheStore,cacheRowKey} from '../../src/server/cache-store.js';
import {captureSelectedCacheBodies,restoreSelectedCacheBodies} from '../../src/server/history-cache-store-backup.js';

it.skipIf(!process.env.TEST_DATABASE_URL||!process.env.CLICKHOUSE_TEST_URL)('selected history caches preserve producer seals and original owners in an isolated target with exact heatmap mapping',async()=>{
 const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),sourceSchema='histcache_s_'+randomUUID().replaceAll('-',''),targetSchema='histcache_t_'+randomUUID().replaceAll('-',''),site=randomUUID(),owner=randomUUID(),epoch=randomUUID(),targetEpoch=randomUUID(),canonicalEpoch=randomUUID(),targetCanonical=randomUUID(),sourceBatch=randomUUID(),targetBatch=randomUUID(),dir=await mkdtemp('/tmp/baize-history-cache-');
 const sourcePool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1,options:`-c search_path=${sourceSchema}`}),targetPool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1,options:`-c search_path=${targetSchema}`});
 const database='histcache_'+randomUUID().replaceAll('-',''),targetUrl=new URL(process.env.CLICKHOUSE_TEST_URL!);targetUrl.searchParams.set('database',database);
 const source=new ClickHouseCacheStore({url:process.env.CLICKHOUSE_TEST_URL!,username:'baize',password:'local-test-only'}),target=new ClickHouseCacheStore({url:targetUrl.toString(),username:'baize',password:'local-test-only'});
 async function ch(query:string){const u=new URL(process.env.CLICKHOUSE_TEST_URL!);u.searchParams.set('query',query);const r=await fetch(u,{method:'POST',headers:{'X-ClickHouse-User':'baize','X-ClickHouse-Key':'local-test-only'}});if(!r.ok){await r.body?.cancel();throw Error('fixture CH failed')}await r.body?.cancel()}
 let body:Awaited<ReturnType<typeof captureSelectedCacheBodies>>;
 try{await admin.query(`CREATE SCHEMA ${sourceSchema}`);await admin.query(`CREATE SCHEMA ${targetSchema}`);await initializeJournal(dir);await ch(`CREATE DATABASE ${database}`);await source.initialize();await target.initialize();
  for(const [pool,e,ce]of [[sourcePool,epoch,canonicalEpoch],[targetPool,targetEpoch,targetCanonical]] as const){await migrate(pool);await pool.query("INSERT INTO sites(id,name,domain,salt_secret)VALUES($1,'history cache','example.test','same-producer-secret')",[site]);await pool.query('INSERT INTO aggregation_state(site_id,epoch,generation,processed_generation)VALUES($1,$2,1,1)',[site,e]);await pool.query("INSERT INTO canonical_event_authority(site_id,epoch,authority)VALUES($1,$2,'clickhouse')",[site,ce]);}
  const c=await sourcePool.connect();try{await c.query('BEGIN');const fence={expectedAggregationEpoch:epoch,expectedCanonicalEpoch:canonicalEpoch,expectedDeletionEpoch:'0',expectedGeneration:'1',verifyLiveFence:async()=>{}};
   const hour={site_id:site,hour:'2026-01-01T00:00:00.000Z',data:{pv:19,visitors:['B'],vitals:{}},generation:'1'},heat={site_id:site,path:'/B',kind:'click',x:25,y:50,viewport:100,count:'7'};
   await source.stageRows(c,site,owner,'hourly_rollup',[hour],fence);await source.completeOwnerKind(c,site,owner,'hourly_rollup',1,fence);await source.publishBucket(c,site,owner,'hourly_rollup',cacheRowKey('hourly_rollup',hour),fence);
   await source.stageRows(c,site,owner,'heatmap_cache',[heat],fence);await source.completeOwnerKind(c,site,owner,'heatmap_cache',1,fence);await source.publishBucket(c,site,owner,'heatmap_cache',cacheRowKey('heatmap_cache',heat),fence);
   await source.completeOwnerKind(c,site,owner,'legacy_centroid',0,fence);await c.query('INSERT INTO cache_heatmap_coverage_batches(site_id,owner_id,batch_id,canonical_epoch,deletion_epoch)VALUES($1,$2,$3,$4,0)',[site,owner,sourceBatch,canonicalEpoch]);body=await captureSelectedCacheBodies(c,source,site,[owner]);expect(body?.records).toHaveLength(2);await c.query('COMMIT');
  }finally{await c.query('ROLLBACK');c.release();}
  const t=await targetPool.connect();try{await t.query('BEGIN');const fence={expectedAggregationEpoch:targetEpoch,expectedCanonicalEpoch:targetCanonical,expectedDeletionEpoch:'0',expectedGeneration:'1',verifyLiveFence:async()=>{}};
   await expect(restoreSelectedCacheBodies(t,target,site,body!,new Map([[owner,randomUUID()]]),fence,dir)).rejects.toThrow('ORIGINAL_OWNER_REQUIRED');expect((await t.query('SELECT count(*)::int n FROM analytics_cache_owners')).rows[0].n).toBe(0);
   await expect(restoreSelectedCacheBodies(t,target,site,body!,new Map([[owner,owner]]),fence,dir)).rejects.toThrow('MAPPING_REQUIRED');
   await t.query('CREATE TEMP TABLE baize_restore_batch_mapping(site_id text,source_batch_id uuid,target_batch_id uuid)ON COMMIT DROP');await t.query('INSERT INTO baize_restore_batch_mapping VALUES($1,$2,$3)',[site,sourceBatch,targetBatch]);
   expect(await restoreSelectedCacheBodies(t,target,site,body!,new Map([[owner,owner]]),fence,dir)).toMatchObject({requiresLatestJournalReplay:false});
   const records=[];for await(const batch of target.streamRows(t,site,owner,'hourly_rollup'))records.push(...batch);expect(records[0]?.bodySeal).toBe(body!.records.find(r=>r.kind==='hourly_rollup')?.record.bodySeal);expect(records[0]?.row.data).toMatchObject({pv:19,visitors:['B']});expect((await t.query('SELECT batch_id FROM cache_heatmap_coverage_batches')).rows[0].batch_id).toBe(targetBatch);expect(targetPool.waitingCount).toBe(0);
   const read=async(id=site)=>{for await(const batch of target.streamRows(t,id,owner,'hourly_rollup'))expect(batch.length).toBeGreaterThan(0);};
   await expect(read(randomUUID())).rejects.toThrow('CACHE_SOURCE_FENCE');
   for(const sql of ['UPDATE aggregation_state SET epoch=$2 WHERE site_id=$1','UPDATE canonical_event_authority SET epoch=$2 WHERE site_id=$1','UPDATE canonical_event_authority SET deletion_epoch=deletion_epoch+1 WHERE site_id=$1']){await t.query('SAVEPOINT changed_fence');await t.query(sql,sql.includes('$2')?[site,randomUUID()]:[site]);await expect(read()).rejects.toThrow('CACHE_SOURCE_FENCE');await t.query('ROLLBACK TO SAVEPOINT changed_fence');}
   await read();await t.query('COMMIT');
  }finally{await t.query('ROLLBACK');t.release();}
  const check=await sourcePool.connect();try{await check.query('BEGIN');expect((await captureSelectedCacheBodies(check,source,site,[owner]))?.checksum).toBe(body!.checksum);await check.query('DELETE FROM analytics_cache_pointers WHERE site_id=$1',[site]);await check.query('DELETE FROM analytics_cache_owners WHERE site_id=$1',[site]);await check.query("INSERT INTO analytics_cache_unavailable(site_id,kind,reason)VALUES($1,'hourly_rollup','privacy_invalidated')",[site]);const negativeOnly=await captureSelectedCacheBodies(check,source,site,[owner]);expect(negativeOnly?.owners).toEqual([]);expect(negativeOnly?.unavailable).toHaveLength(1);await check.query('ROLLBACK');}finally{check.release();}
 }finally{for(const [pool,store]of [[sourcePool,source],[targetPool,target]] as const){const c=await pool.connect();try{await c.query('BEGIN');await store.invalidateSite(c,site);await c.query('COMMIT');}finally{await c.query('ROLLBACK');c.release();}await pool.end();}await admin.query(`DROP SCHEMA ${sourceSchema} CASCADE`);await admin.query(`DROP SCHEMA ${targetSchema} CASCADE`);await admin.end();await ch(`DROP DATABASE IF EXISTS ${database}`);await rm(dir,{recursive:true,force:true});}
},30000);
