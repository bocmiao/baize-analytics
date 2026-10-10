import {createHash,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {canonical} from './security.js';
import {ClickHouseCacheStore,type CacheKind,type CacheRecord} from './cache-store.js';

export interface HistoryCacheStoreBacking {
 sourceScope:string;
 owners:{ownerId:string;kind:CacheKind;count:number;source:CacheRecord['source']}[];
 records:{ownerId:string;kind:CacheKind;record:CacheRecord}[];
 pointers:Record<string,unknown>[];
 coverage:Record<string,unknown>[];
 unavailable:Record<string,unknown>[];
 checksum:string;
}
const digest=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');
/** Outer signed history package authenticates the complete closure, including
 * zero markers and negative coverage. Producer seals remain unmodified. */
export async function captureSelectedCacheBodies(c:PoolClient,store:ClickHouseCacheStore|undefined,site:string,runs:string[]):Promise<HistoryCacheStoreBacking|undefined>{
 if(!(await c.query("SELECT to_regclass('analytics_cache_owners') present")).rows[0].present)return;
 const selected="o.site_id=$1 AND(o.kind='legacy_centroid' AND o.owner_id=ANY($2::uuid[]) OR o.kind<>'legacy_centroid' AND(o.row_count=0 OR EXISTS(SELECT 1 FROM analytics_cache_pointers p WHERE p.site_id=o.site_id AND p.owner_id=o.owner_id AND p.kind=o.kind)))";
 if(!(await c.query(`SELECT 1 FROM analytics_cache_owners o WHERE ${selected} LIMIT 1`,[site,runs])).rowCount&&!(await c.query('SELECT 1 FROM analytics_cache_unavailable WHERE site_id=$1 LIMIT 1',[site])).rowCount)return;
 if(!store)throw Error('HISTORY_CACHE_STORE_REQUIRED');
 const owners:HistoryCacheStoreBacking['owners']=[],records:HistoryCacheStoreBacking['records']=[];let bytes=0;
 const cursor='history_cache_capture_'+randomUUID().replaceAll('-','');
 await c.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT o.* FROM analytics_cache_owners o WHERE ${selected} ORDER BY owner_id,kind`,[site,runs]);
 try{for(;;){const rows=(await c.query(`FETCH 100 FROM ${cursor}`)).rows;if(!rows.length)break;for(const row of rows){if(row.state!=='complete')throw Error('HISTORY_CACHE_KIND_INCOMPLETE');if(owners.length>=100000)throw Error('HISTORY_CACHE_BACKUP_LIMIT');const owner={ownerId:String(row.owner_id),kind:row.kind as CacheKind,count:Number(row.row_count),source:{aggregationEpoch:String(row.source_aggregation_epoch),canonicalEpoch:row.canonical_epoch??null,deletionEpoch:row.deletion_epoch===null?null:String(row.deletion_epoch),generation:String(row.generation)}};owners.push(owner);let count=0;for await(const batch of store.streamRows(c,site,owner.ownerId,owner.kind))for(const record of batch){bytes+=Buffer.byteLength(canonical(record));if(records.length>=100000||bytes>128*1024*1024)throw Error('HISTORY_CACHE_BACKUP_LIMIT');records.push({ownerId:owner.ownerId,kind:owner.kind,record});count++;}if(count!==owner.count)throw Error('HISTORY_CACHE_BODY_CLOSURE_INCOMPLETE');}}}finally{await c.query(`CLOSE ${cursor}`)}
 const metadata=async(table:string)=>{const result:Record<string,unknown>[]=[];const cursor='history_cache_meta_'+randomUUID().replaceAll('-','');await c.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT to_jsonb(t) row FROM ${table} t WHERE site_id=$1 ORDER BY to_jsonb(t)::text`,[site]);try{for(;;){const rows=(await c.query(`FETCH 100 FROM ${cursor}`)).rows;if(!rows.length)break;for(const row of rows){const r=row.row as Record<string,unknown>;if(table!=='analytics_cache_unavailable'&&!owners.some(o=>o.ownerId===r.owner_id&&(table==='cache_heatmap_coverage_batches'?o.kind==='heatmap_cache':o.kind===r.kind)))continue;bytes+=Buffer.byteLength(canonical(r));if(result.length>=100000||bytes>128*1024*1024)throw Error('HISTORY_CACHE_BACKUP_LIMIT');result.push(r);}}}finally{await c.query(`CLOSE ${cursor}`)}return result;};
 const body={sourceScope:store.scopeIdentity(),owners,records,pointers:await metadata('analytics_cache_pointers'),coverage:await metadata('cache_heatmap_coverage_batches'),unavailable:await metadata('analytics_cache_unavailable')};return {...body,checksum:digest(body)};
}

/** Restore is a private pre-publication step. The caller must replay the latest
 * verified deletion journal and rebuild before exposing target HTTP traffic. */
export async function restoreSelectedCacheBodies(c:PoolClient,store:ClickHouseCacheStore,site:string,body:HistoryCacheStoreBacking,ids:Map<string,string>,fence:import('./cache-store.js').CacheFence,journalDir:string){
 const {checksum,...unsigned}=body;if(checksum!==digest(unsigned)||body.sourceScope===store.scopeIdentity()||body.records.length>100000||body.owners.length>100000)throw Error('HISTORY_CACHE_BODY_CHECKSUM_OR_SCOPE');
 const known=new Map<string,HistoryCacheStoreBacking['owners'][number]>();
 for(const owner of body.owners){const key=canonical([owner.ownerId,owner.kind]);if(!['hourly_rollup','daily_rollup','page_centroid','legacy_centroid','heatmap_cache'].includes(owner.kind)||known.has(key)||owner.kind==='legacy_centroid'&&ids.get(owner.ownerId)!==owner.ownerId||!Number.isSafeInteger(owner.count)||owner.count<0)throw Error('HISTORY_CACHE_ORIGINAL_OWNER_REQUIRED');known.set(key,owner);if((await c.query('SELECT 1 FROM analytics_cache_owners WHERE site_id=$1 AND owner_id=$2 AND kind=$3',[site,owner.ownerId,owner.kind])).rowCount)throw Error('HISTORY_CACHE_TARGET_NOT_EMPTY');await store.assertEmptyOwner(site,owner.ownerId,owner.kind);}
 const groups=new Map<string,CacheRecord[]>();let bytes=0;
 for(const item of body.records){const key=canonical([item.ownerId,item.kind]),owner=known.get(key);if(!owner||canonical(item.record.source)!==canonical(owner.source))throw Error('HISTORY_CACHE_BODY_REFERENCE');bytes+=Buffer.byteLength(canonical(item));if(bytes>128*1024*1024)throw Error('HISTORY_CACHE_BACKUP_LIMIT');const list=groups.get(key)??[];list.push(item.record);groups.set(key,list);}
 for(const owner of body.owners)if((groups.get(canonical([owner.ownerId,owner.kind]))?.length??0)!==owner.count)throw Error('HISTORY_CACHE_BODY_CLOSURE_INCOMPLETE');
 for(const p of body.pointers)if(p.site_id!==site||!known.has(canonical([p.owner_id,p.kind])))throw Error('HISTORY_CACHE_POINTER_SCOPE');
 for(const row of [...body.coverage,...body.unavailable])if(row.site_id!==site)throw Error('HISTORY_CACHE_METADATA_SCOPE');
 if(body.coverage.length&&!(await c.query("SELECT to_regclass('pg_temp.baize_restore_batch_mapping') present")).rows[0].present)throw Error('CACHE_RESTORE_HEATMAP_BATCH_MAPPING_REQUIRED');
 for(const row of body.coverage){if(!known.has(canonical([row.owner_id,'heatmap_cache']))||!(await c.query('SELECT 1 FROM baize_restore_batch_mapping WHERE site_id=$1 AND source_batch_id=$2 LIMIT 1',[site,row.batch_id])).rowCount)throw Error('CACHE_RESTORE_HEATMAP_BATCH_MAPPING_REQUIRED');}
 const journal=await (await import('./deletion.js')).readVerifiedDeletionRecords(journalDir);
 const assertIsolated=async()=>{if(body.sourceScope===store.scopeIdentity())throw Error('HISTORY_CACHE_SOURCE_NAMESPACE');};
 for(const owner of body.owners){const records=groups.get(canonical([owner.ownerId,owner.kind]))??[];for(let at=0;at<records.length;at+=100)await store.restoreSealedRows(c,site,owner.ownerId,owner.kind,records.slice(at,at+100),fence,assertIsolated);await store.restoreCompletion(c,site,owner.ownerId,owner.kind,owner.source,owner.count,fence,assertIsolated);}
 for(const p of body.pointers)await store.publishBucket(c,site,String(p.owner_id),p.kind as CacheKind,String(p.row_key),fence);
 for(const row of body.coverage){const mapped=(await c.query('SELECT target_batch_id FROM baize_restore_batch_mapping WHERE site_id=$1 AND source_batch_id=$2',[site,row.batch_id])).rows;if(!mapped.length)throw Error('CACHE_RESTORE_HEATMAP_BATCH_MAPPING_REQUIRED');for(const m of mapped)await c.query('INSERT INTO cache_heatmap_coverage_batches(site_id,owner_id,batch_id,canonical_epoch,deletion_epoch)VALUES($1,$2,$3,$4,$5)ON CONFLICT DO NOTHING',[site,row.owner_id,m.target_batch_id,fence.expectedCanonicalEpoch,fence.expectedDeletionEpoch]);}
 for(const row of body.unavailable)await c.query('INSERT INTO analytics_cache_unavailable(site_id,kind,reason,from_ts,to_ts,invalidated_at,rebuildable_v2,rebuild_proof)VALUES($1,$2,$3,$4,$5,$6,$7,$8)ON CONFLICT(site_id,kind)DO UPDATE SET rebuildable_v2=analytics_cache_unavailable.rebuildable_v2 AND excluded.rebuildable_v2,rebuild_proof=CASE WHEN analytics_cache_unavailable.from_ts IS NOT DISTINCT FROM excluded.from_ts AND analytics_cache_unavailable.to_ts IS NOT DISTINCT FROM excluded.to_ts THEN excluded.rebuild_proof ELSE \'[]\'::jsonb END,from_ts=CASE WHEN analytics_cache_unavailable.from_ts IS NULL OR excluded.from_ts IS NULL THEN NULL ELSE LEAST(analytics_cache_unavailable.from_ts,excluded.from_ts)END,to_ts=CASE WHEN analytics_cache_unavailable.to_ts IS NULL OR excluded.to_ts IS NULL THEN NULL ELSE GREATEST(analytics_cache_unavailable.to_ts,excluded.to_ts)END',[site,row.kind,row.reason,row.from_ts,row.to_ts,row.invalidated_at,row.rebuildable_v2===true,JSON.stringify(row.rebuild_proof??[])]);
 return {requiresLatestJournalReplay:journal.some(row=>row.site_id===site),sourceOwnerIds:body.owners.map(row=>row.ownerId)};
}
