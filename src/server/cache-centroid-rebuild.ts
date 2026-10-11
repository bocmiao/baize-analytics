import {randomUUID} from 'node:crypto';
import {TDigest} from 'tdigest';
import type {Pool,PoolClient} from 'pg';
import {verifyFactCoverageWitness} from './fact-coverage-witness.js';
import {assertFactRunClosure,selectedFactRunPredicate} from './fact-run-closure.js';
import {assertSessionContributionOwners,sessionVitalContributionPredicate} from './session-contribution-overlay.js';
import {withRemainingFactReadSource} from './remaining-fact-source.js';
import {factReadSql,hasFactReadSource} from './fact-read-context.js';
import {cacheRowKey,normalizeCacheRow,type CacheFence,type CacheRow,type ClickHouseCacheStore} from './cache-store.js';
/** Rebuild only after the caller authenticates the original centroid-cache
 * scope proof. A centroid cannot be arithmetically erased: each surviving,
 * authenticated immutable sample contributes exactly one unit of weight. */
export async function rebuildInvalidatedCentroids(c:PoolClient,pool:Pool,store:ClickHouseCacheStore,site:string,kind:'page_centroid'|'legacy_centroid',from:string,to:string,fence:CacheFence){
 await verifyFactCoverageWitness(c,site,{from,to,bucketSnapshot:true});
 await assertFactRunClosure(c,site);await assertSessionContributionOwners(c,site);
 return withRemainingFactReadSource(c,pool,site,async()=>{
  if((await c.query(factReadSql(c,`SELECT 1 FROM analytics_vital_samples e WHERE ${sessionVitalContributionPredicate} AND (e.event_ts<$2 OR e.event_ts>=$3) LIMIT 1`),[site,from,to])).rowCount)throw Error('CACHE_CENTROID_SCOPE_INCOMPLETE');
  const rows=await collectSelectedCentroidRows(c,site,kind,from,to);
  let owners=0;
  if(kind==='page_centroid'){
   for(const row of rows){const owner=randomUUID();await store.stageRows(c,site,owner,kind,[row],fence);await store.completeOwnerKind(c,site,owner,kind,1,fence);await store.publishBucket(c,site,owner,kind,cacheRowKey(kind,normalizeCacheRow(site,owner,kind,row)),fence);owners++;}
   if(!rows.length){await store.completeOwnerKind(c,site,randomUUID(),kind,0,fence);owners++;}
   await c.query("DELETE FROM page_vitals p USING sites s WHERE p.site_id=$1 AND s.id=p.site_id AND p.day>=($2::timestamptz AT TIME ZONE s.timezone)::date AND p.day<(($3::timestamptz-interval '1 microsecond') AT TIME ZONE s.timezone)::date+1",[site,from,to]);
  }else{
   const runs=(await c.query(`SELECT r.id FROM analytics_fact_runs r JOIN aggregation_state a ON a.site_id=r.site_id WHERE r.site_id=$1 AND ${selectedFactRunPredicate} ORDER BY r.id LIMIT 100001`,[site])).rows;if(runs.length>100000)throw Error('CACHE_CENTROID_REBUILD_LIMIT');
   for(const run of runs){const owned=rows.filter(row=>row.run_id===run.id);for(let i=0;i<owned.length;i+=100)await store.stageRows(c,site,run.id,kind,owned.slice(i,i+100),fence);await store.completeOwnerKind(c,site,run.id,kind,owned.length,fence);owners++;}
   await c.query('DELETE FROM analytics_vitals_facts WHERE run_id IN(SELECT id FROM analytics_fact_runs WHERE site_id=$1)',[site]);
  }
  await fence.verifyLiveFence();await c.query('DELETE FROM analytics_cache_unavailable WHERE site_id=$1 AND kind=$2',[site,kind]);
  return {rows:rows.length,owners};
 });
}

/** Bound to authenticated immutable source relations, never a bare PG-empty
 * fallback. Shared by privacy reconstruction and ordinary legacy publication. */
async function collectSelectedCentroidRowsUnchecked(c:PoolClient,site:string,kind:'page_centroid'|'legacy_centroid',from?:string,to?:string){
 if(!hasFactReadSource(c))throw Error('CACHE_CENTROID_AUTHENTICATED_SOURCE_REQUIRED');
 await assertSessionContributionOwners(c,site);
  const cursor='centroid_rebuild_'+randomUUID().replaceAll('-','');
  const rows:CacheRow[]=[];let current:string|undefined,digest=new TDigest(),count=0,shape:CacheRow={};
  const flush=()=>{if(current===undefined)return;if(rows.length>=100000)throw Error('CACHE_CENTROID_REBUILD_LIMIT');digest.compress();rows.push({...shape,digest:digest.toArray(),sample_count:count});};
  // DISTINCT logical PK prevents overlapping source hydration from assigning
  // a second weight. Owner selection excludes superseded/retired contributions.
  const query=`WITH samples AS(SELECT DISTINCT e.run_id,e.event_id,e.metric,e.event_ts,e.event_path,e.value FROM analytics_vital_samples e WHERE ($2::timestamptz IS NULL OR e.event_ts>=$2) AND ($3::timestamptz IS NULL OR e.event_ts<$3) AND ${sessionVitalContributionPredicate}) SELECT e.*,to_char(e.event_ts AT TIME ZONE s.timezone,'YYYY-MM-DD') AS "day",date_trunc('hour',e.event_ts AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS "hour" FROM samples e JOIN sites s ON s.id=$1 ORDER BY e.run_id,e.event_ts,e.event_id,e.metric`;
  // The cursor itself is bounded; maps below store at most 100k output groups,
  // not raw samples. Independent per-group digests preserve unequal weights.
  const groups=new Map<string,{row:CacheRow;digest:TDigest;count:number}>();
  await c.query(factReadSql(c,`DECLARE ${cursor} NO SCROLL CURSOR FOR ${query}`),[site,from??null,to??null]);
  let cursorFailed=false;
  try{for(;;){const batch=(await c.query(`FETCH 100 FROM ${cursor}`)).rows;if(!batch.length)break;for(const sample of batch){
   const value=Number(sample.value);if(!Number.isFinite(value)||value<0||!['lcp','inp','cls','fcp','ttfb'].includes(String(sample.metric).toLowerCase()))throw Error('CACHE_CENTROID_SAMPLE_INVALID');
   const variants=kind==='page_centroid'?[{site_id:site,day:String(sample.day),path:sample.event_path,metric:sample.metric}]:[{run_id:sample.run_id,bucket_kind:'hourly',bucket:new Date(sample.hour).toISOString(),path:sample.event_path,metric:sample.metric},{run_id:sample.run_id,bucket_kind:'daily',bucket:String(sample.day),path:sample.event_path,metric:sample.metric}];
   for(const row of variants){const key=JSON.stringify(row);let group=groups.get(key);if(!group){if(groups.size>=100000)throw Error('CACHE_CENTROID_REBUILD_LIMIT');group={row,digest:new TDigest(),count:0};groups.set(key,group);}group.digest.push(value);if(++group.count%100===0)group.digest.compress();}
  }}}catch(error){cursorFailed=true;throw error;}finally{if(!cursorFailed)await c.query(`CLOSE ${cursor}`);}
  for(const [key,group]of [...groups].sort(([a],[b])=>a.localeCompare(b))){flush();current=key;shape=group.row;digest=group.digest;count=group.count;}flush();
 return rows;
}

/** Keep the original SQL error visible to the outer authenticated-source
 * cleanup. Failed DECLARE/FETCH must not leave that cleanup in an aborted TX. */
export async function collectSelectedCentroidRows(c:PoolClient,site:string,kind:'page_centroid'|'legacy_centroid',from?:string,to?:string){
 const savepoint='centroid_source_'+randomUUID().replaceAll('-','');
 await c.query(`SAVEPOINT ${savepoint}`);
 try{const rows=await collectSelectedCentroidRowsUnchecked(c,site,kind,from,to);await c.query(`RELEASE SAVEPOINT ${savepoint}`);return rows;}
 catch(error){try{await c.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);await c.query(`RELEASE SAVEPOINT ${savepoint}`);}catch{/* Preserve first cause; caller still must roll back. */}throw error;}
}
