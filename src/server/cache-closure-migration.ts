import {randomUUID,createHmac,timingSafeEqual} from 'node:crypto';
import type {PoolClient} from 'pg';
import {lockSite} from './db.js';
import {selectedFactRunPredicate,assertFactRunClosure} from './fact-run-closure.js';
import {cacheRowKey,normalizeCacheRow,type ClickHouseCacheStore,type CacheFence,type CacheKind} from './cache-store.js';
import {canonical} from './security.js';
import {factAuthorityMatches} from './fact-authority.js';
import {assertCurrentFactRangeBacking} from './fact-range-backing.js';
import {withRemainingFactReadSource} from './remaining-fact-source.js';
import {exportedPublishedRollups} from './published-export-projections.js';
import type {Pool} from 'pg';
import {sanitizeDailyValue} from './daily-privacy-policy.js';
/** Actual original PG cache → immutable per-bucket CH pointers. Site lock plus
 * clean state protects the source baseline and captured canonical batch coverage.
 * Each body has its original currency and weighted centroid representation.
 * This is a migration, never a batch replacing the whole historical period. */
export async function migratePublishedCacheClosure(c:PoolClient,store:ClickHouseCacheStore,site:string,fence:CacheFence,options:{pool?:Pool}={}){
 await lockSite(c,site);const state=(await c.query('SELECT a.epoch,a.generation::text,a.processed_generation::text,a.lease_until>clock_timestamp() leased,s.privacy_mode FROM aggregation_state a JOIN sites s ON s.id=a.site_id WHERE a.site_id=$1 FOR UPDATE OF a',[site])).rows[0];
 if(!state||state.epoch!==fence.expectedAggregationEpoch||state.generation!==fence.expectedGeneration||state.generation!==state.processed_generation||state.leased)throw Error('CACHE_CLOSURE_MIGRATION_FENCE');await assertFactRunClosure(c,site);await fence.verifyLiveFence();
 const unavailable=(await c.query('SELECT * FROM analytics_cache_unavailable WHERE site_id=$1 ORDER BY kind',[site])).rows;
 for(const flag of unavailable){
  if(!options.pool||!flag.rebuildable_v2||!['hourly_rollup','daily_rollup'].includes(flag.kind)||!flag.from_ts||!flag.to_ts||!Array.isArray(flag.rebuild_proof)||flag.rebuild_proof.length!==1)throw Error('CACHE_BASELINE_UNAVAILABLE');
  const proof=flag.rebuild_proof[0];if(!proof||!proof.body||typeof proof.body!=='object')throw Error('CACHE_REBUILD_PROOF_INVALID');const body=proof.body,secret=(await c.query('SELECT salt_secret FROM sites WHERE id=$1',[site])).rows[0].salt_secret,expected=createHmac('sha256',secret).update(canonical(['cache-rebuild-v1',site,body])).digest('hex');
  if(!body||body.version!==1||body.method!=='authenticated_v2_cache_body'||body.kind!==flag.kind||body.from!==new Date(flag.from_ts).toISOString()||body.to!==new Date(flag.to_ts).toISOString()||!Number.isSafeInteger(body.bucketCount)||body.bucketCount<=0||typeof proof.seal!=='string'||proof.seal.length!==expected.length||!timingSafeEqual(Buffer.from(proof.seal),Buffer.from(expected)))throw Error('CACHE_REBUILD_PROOF_INVALID');
  await assertCurrentFactRangeBacking(c,options.pool,site,body.from,body.to);
  const kind=flag.kind as 'hourly_rollup'|'daily_rollup',daily=kind==='daily_rollup',table=daily?'stats_daily':'stats_hourly';
  const seed=(await c.query(daily?"SELECT $1::text site_id,to_char(g,'YYYY-MM-DD') AS \"day\",'{\"relationalVersion\":2}'::jsonb data,$4::bigint generation FROM sites s CROSS JOIN LATERAL generate_series(($2::timestamptz AT TIME ZONE s.timezone)::date,(($3::timestamptz-interval '1 microsecond') AT TIME ZONE s.timezone)::date,interval '1 day') g WHERE s.id=$1 LIMIT 10001":"SELECT $1::text site_id,g AS \"hour\",'{\"relationalVersion\":2}'::jsonb data,$4::bigint generation FROM generate_series($2::timestamptz,$3::timestamptz-interval '1 hour',interval '1 hour') g LIMIT 10001",[site,body.from,body.to,state.generation])).rows;
  if(seed.length>10000)throw Error('CACHE_REBUILD_RANGE_LIMIT');
  const rebuilt=await withRemainingFactReadSource(c,options.pool,site,()=>exportedPublishedRollups(c,site,daily?'daily':'hourly',seed));
  for(const row of rebuilt){const at=daily?new Date(String(row.day)+'T00:00:00Z'):new Date(row.hour as string|Date);if(!daily&&(+at<+new Date(body.from)||+at>=+new Date(body.to)))continue;if(daily&&!seed.some(x=>String(x.day)===String(row.day)))continue;
   const owner=randomUUID(),key=cacheRowKey(kind,normalizeCacheRow(site,owner,kind,row));await store.stageRows(c,site,owner,kind,[row],fence);await store.completeOwnerKind(c,site,owner,kind,1,fence);await store.publishBucket(c,site,owner,kind,key,fence);
   await c.query(`INSERT INTO ${table}(site_id,${daily?'day':'hour'},data,generation)VALUES($1,$2,'{"relationalVersion":2}'::jsonb,$3)ON CONFLICT(site_id,${daily?'day':'hour'})DO UPDATE SET data=excluded.data,generation=excluded.generation`,[site,daily?row.day:row.hour,state.generation]);
  }
  await fence.verifyLiveFence();await c.query('DELETE FROM analytics_cache_unavailable WHERE site_id=$1 AND kind=$2',[site,kind]);
 }

 let rows=0,owners=0;
 for(const [kind,table]of Object.entries({hourly_rollup:'stats_hourly',daily_rollup:'stats_daily',page_centroid:'page_vitals',heatmap_cache:'heatmap_points'}) as [CacheKind,string][]){
  const cursor='cache_closure_'+randomUUID().replaceAll('-','');await c.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT to_jsonb(t) body FROM ${table} t WHERE site_id=$1 ORDER BY to_jsonb(t)::text`,[site]);let count=0;
  try{for(;;){const batch=(await c.query(`FETCH 100 FROM ${cursor}`)).rows;if(!batch.length)break;for(const item of batch){
   const body=item.body;if(state.privacy_mode==='daily_salt'){if(canonical(sanitizeDailyValue(body.data??{}))!==canonical(body.data??{}))throw Error('CACHE_MIGRATION_DAILY_UNSAFE_BODY');if((kind==='hourly_rollup'||kind==='daily_rollup')&&body.data?.relationalVersion!==2)throw Error('CACHE_MIGRATION_DAILY_LEGACY_SOURCE_UNAVAILABLE');}
   const owner=randomUUID(),normalized=normalizeCacheRow(site,owner,kind,body),key=cacheRowKey(kind,normalized),pointer=(await c.query('SELECT owner_id FROM analytics_cache_pointers WHERE site_id=$1 AND kind=$2 AND row_key=$3',[site,kind,key])).rows[0];
   const routingControl=(kind==='hourly_rollup'||kind==='daily_rollup')&&body.data&&typeof body.data==='object'&&Object.keys(body.data).every(k=>k==='relationalVersion'||k==='cacheBodyStored'||k==='relationalUnavailable')&&(body.data.relationalVersion===2||body.data.cacheBodyStored===true);
   if(pointer){let matches=0,keyMatches=0,olderSource=false;for await(const published of store.streamRows(c,site,pointer.owner_id,kind))for(const record of published)if(cacheRowKey(kind,record.row)===key){keyMatches++;olderSource=BigInt(record.source.generation)<BigInt(state.processed_generation);
    // Strict pruning leaves routing metadata, not a second oracle for the
    // original body. The reader above authenticates physical CH/body/source
    // scope; compare original full rows only when PG still contains a body.
    if(routingControl){if(BigInt(record.source.generation)>BigInt(state.processed_generation)||BigInt(String(body.generation))>BigInt(state.processed_generation))throw Error('CACHE_MIGRATION_CONTROL_FENCE');matches++;}
    else if(canonical(record.row)===canonical(normalized))matches++;
   }if(matches!==1){
    // A completed journal rebuild can produce a newer, smaller full bucket.
    // Authenticate the old body before replacing exactly this bucket, and
    // require the new PG body's generation and authority-bound head to match.
    const newerFullBody=!routingControl&&(kind==='hourly_rollup'||kind==='daily_rollup')&&body.data?.relationalVersion===2&&String(body.generation)===state.processed_generation&&keyMatches===1&&olderSource;
    const head=newerFullBody&&(await c.query(`SELECT 1 FROM analytics_fact_runs r JOIN aggregation_state a ON a.site_id=r.site_id LEFT JOIN canonical_event_authority c ON c.site_id=r.site_id WHERE r.site_id=$1 AND r.status='published' AND r.query_version=2 AND r.epoch=a.epoch AND r.generation=a.processed_generation AND ${factAuthorityMatches} LIMIT 1`,[site])).rowCount;
    if(!head)throw Error('CACHE_MIGRATION_EXISTING_BODY_MISMATCH');
    await store.stageRows(c,site,owner,kind,[body],fence);await store.completeOwnerKind(c,site,owner,kind,1,fence);await store.publishBucket(c,site,owner,kind,key,fence);owners++;
   }}
   else if(routingControl){
    if(body.data.cacheBodyStored===true)throw Error('CACHE_MIGRATION_CONTROL_BODY_UNAVAILABLE');
    const column=kind==='hourly_rollup'?'hour':'day';
    const backing=(await c.query(`SELECT 1 FROM analytics_relational_buckets h JOIN analytics_fact_runs r ON r.id=h.run_id JOIN aggregation_state a ON a.site_id=h.site_id WHERE h.site_id=$1 AND r.status='published' AND r.query_version=2 AND r.epoch=a.epoch AND h.epoch=a.epoch AND h.generation<=a.processed_generation AND ${kind==='hourly_rollup'?"h.hour=$2::timestamptz":"(h.hour AT TIME ZONE (SELECT timezone FROM sites WHERE id=$1))::date=$2::date"} LIMIT 1`,[site,body[column]])).rowCount;
    if(!backing||BigInt(String(body.generation))>BigInt(state.processed_generation))throw Error('CACHE_MIGRATION_CONTROL_FENCE');
   }
   else{await store.stageRows(c,site,owner,kind,[body],fence);await store.completeOwnerKind(c,site,owner,kind,1,fence);await store.publishBucket(c,site,owner,kind,key,fence);if(kind==='heatmap_cache')await store.captureHeatmapCoverage(c,site,owner,fence);owners++;}rows++;count++;
  }}}finally{await c.query(`CLOSE ${cursor}`);}
  // No local rows after strict pruning is not evidence of an empty kind.
  // Verify all currently pointed owners (or its explicit zero marker) first.
  let sealedBaseline=false;
  if(!count){const existing='cache_existing_'+randomUUID().replaceAll('-','');await c.query(`DECLARE ${existing} NO SCROLL CURSOR FOR SELECT DISTINCT o.owner_id FROM analytics_cache_owners o WHERE o.site_id=$1 AND o.kind=$2 AND o.state='complete' AND o.aggregation_epoch=$3 AND o.generation<=$4 AND (o.row_count=0 OR EXISTS(SELECT 1 FROM analytics_cache_pointers p WHERE p.site_id=o.site_id AND p.owner_id=o.owner_id AND p.kind=o.kind)) ORDER BY o.owner_id`,[site,kind,state.epoch,state.generation]);try{for(;;){const batch=(await c.query(`FETCH 100 FROM ${existing}`)).rows;if(!batch.length)break;for(const owner of batch){for await(const authenticated of store.streamRows(c,site,owner.owner_id,kind))rows+=authenticated.length;sealedBaseline=true;}}}finally{await c.query(`CLOSE ${existing}`)}}
  if(!count&&!sealedBaseline){await store.completeOwnerKind(c,site,randomUUID(),kind,0,fence);owners++;}
 }
 const cursor='cache_legacy_'+randomUUID().replaceAll('-','');await c.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT r.id FROM analytics_fact_runs r JOIN aggregation_state a ON a.site_id=r.site_id WHERE r.site_id=$1 AND ${selectedFactRunPredicate} ORDER BY r.id`,[site]);
 try{for(;;){const runs=(await c.query(`FETCH 100 FROM ${cursor}`)).rows;if(!runs.length)break;for(const run of runs){const complete=(await c.query("SELECT 1 FROM analytics_cache_owners WHERE site_id=$1 AND owner_id=$2 AND kind='legacy_centroid' AND state='complete'",[site,run.id])).rowCount;if(complete){for await(const verified of store.streamRows(c,site,run.id,'legacy_centroid'))rows+=verified.length;continue;}
  const values='cache_centroids_'+randomUUID().replaceAll('-','');let count=0;await c.query(`DECLARE ${values} NO SCROLL CURSOR FOR SELECT to_jsonb(t) body FROM analytics_vitals_facts t WHERE run_id=$1 ORDER BY bucket_kind,bucket,path,metric`,[run.id]);try{for(;;){const batch=(await c.query(`FETCH 100 FROM ${values}`)).rows;if(!batch.length)break;await store.stageRows(c,site,run.id,'legacy_centroid',batch.map(row=>row.body),fence);count+=batch.length;}}finally{await c.query(`CLOSE ${values}`);}await store.completeOwnerKind(c,site,run.id,'legacy_centroid',count,fence);rows+=count;owners++;
 }}}finally{await c.query(`CLOSE ${cursor}`);}
 return {rows,owners,pruned:false};
}
