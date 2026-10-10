import type {CutoverPrivacyRepairToken} from './cutover-receipt.js';
import {factReadRelations,hasFactReadSource} from './fact-read-context.js';
import {withFactReadSource} from './fact-store-source.js';
import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {queryPublishedNumericBuckets} from './fact-numeric-query.js';
import {pruneUnreferencedFactRuns} from './fact-member-query.js';

export interface FactDeletionSegment {visitorId:string;from?:string;to?:string|null}
export interface FactDeletionCapture {readonly kind:'fact_delete_capture'}
const captures=new WeakMap<FactDeletionCapture,{client:PoolClient;siteId:string;scope:string;name:string|null;partial:boolean}>();
const scopeOf=(segments:FactDeletionSegment[])=>JSON.stringify(segments.map(s=>({visitor:s.visitorId,from:s.from??null,to:s.to==='infinity'?null:s.to??null})));
const deletionMatch=`EXISTS(SELECT 1 FROM jsonb_to_recordset($2) s(visitor text,"from" timestamptz,"to" timestamptz) WHERE e.visitor_id=s.visitor AND (s."from" IS NULL OR e.event_ts>=s."from") AND (s."to" IS NULL OR e.event_ts<s."to"))`;
/** Capture only exact PG contribution/publication metadata before physical ACK.
 * The opaque token is bound to this client, site and durable journal scope.
 * Body loss after a physical ACK + PG rollback therefore cannot block replay.
 */
export async function captureFactDeletionMetadata(client:PoolClient,siteId:string,segments:FactDeletionSegment[]):Promise<FactDeletionCapture>{
 const active=(await client.query("SELECT 1 FROM analytics_fact_runs WHERE site_id=$1 AND query_version=2 AND status='published' LIMIT 1",[siteId])).rowCount;
 if(!active){const token=Object.freeze({kind:'fact_delete_capture' as const});captures.set(token,{client,siteId,scope:scopeOf(segments),name:null,partial:false});return token;}
 // Legacy rollups have no event contribution provenance; they cannot be truthfully subtracted.
const name=`fact_delete_${randomUUID().replaceAll('-','')}`;
 const scope=JSON.stringify(segments.map(s=>({visitor:s.visitorId,from:s.from??null,to:s.to==='infinity'?null:s.to??null})));
 await client.query("UPDATE stats_hourly SET data=analytics_bucket_without_members(data)||jsonb_build_object('relationalUnavailable','legacy_contributions_unavailable_after_deletion') WHERE site_id=$1 AND NOT(data ? 'relationalVersion')",[siteId]);
 const match=`EXISTS(SELECT 1 FROM jsonb_to_recordset($2) s(visitor text,"from" timestamptz,"to" timestamptz) WHERE e.visitor_id=s.visitor AND (s."from" IS NULL OR e.event_ts>=s."from") AND (s."to" IS NULL OR e.event_ts<s."to"))`;
 await client.query(`CREATE TEMP TABLE ${name} ON COMMIT DROP AS SELECT DISTINCT e.run_id,e.session_id,e.visitor_id,date_trunc('hour',e.event_ts AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS hour FROM analytics_effect_facts e JOIN analytics_fact_runs r ON r.id=e.run_id WHERE r.site_id=$1 AND ${match}`,[siteId,scope]);
 await client.query(`INSERT INTO ${name} SELECT DISTINCT e.run_id,e.session_id,e.visitor_id,date_trunc('hour',e.event_ts AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' FROM analytics_fact_store_members e JOIN analytics_fact_runs r ON r.id=e.run_id WHERE r.site_id=$1 AND e.kind='effects' AND ${match}`,[siteId,scope]);
 const partial=segments.some(s=>s.from!==undefined||s.to!=null);
 if(partial)await client.query(`INSERT INTO analytics_session_rebuild_requests SELECT DISTINCT $1,d.run_id,d.session_id,d.visitor_id,'identity_interval' FROM ${name} d ON CONFLICT DO NOTHING`,[siteId]);
 if(partial)await client.query(`INSERT INTO ${name} SELECT DISTINCT e.run_id,e.session_id,e.visitor_id,date_trunc('hour',e.event_ts AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' FROM analytics_effect_facts e WHERE EXISTS(SELECT 1 FROM ${name} affected WHERE affected.run_id=e.run_id AND affected.session_id=e.session_id)`);
 if(partial)await client.query(`INSERT INTO ${name} SELECT DISTINCT e.run_id,e.session_id,e.visitor_id,date_trunc('hour',e.event_ts AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' FROM analytics_fact_store_members e WHERE e.kind='effects' AND EXISTS(SELECT 1 FROM ${name} d WHERE d.run_id=e.run_id AND d.session_id=e.session_id)`);
 const token=Object.freeze({kind:'fact_delete_capture' as const});captures.set(token,{client,siteId,scope,name,partial});return token;
}
/** Caller holds P -> site and the journal is durable. No pool acquisition occurs here. */
export async function invalidateFactSegments(client:PoolClient,siteId:string,segments:FactDeletionSegment[],options:{pool?:Pool;captured?:FactDeletionCapture;cutoverRepair?:CutoverPrivacyRepairToken}={}):Promise<{relational:boolean;hours:number;partial:boolean}>{
 const token=options.captured??await captureFactDeletionMetadata(client,siteId,segments);
 const captured=captures.get(token);if(!captured||captured.client!==client||captured.siteId!==siteId||captured.scope!==scopeOf(segments))throw Error('FACT_DELETION_CAPTURE_INVALID');
 if(options.pool)return withFactReadSource(client,options.pool,siteId,()=>invalidateFactSegmentsInner(client,siteId,segments,token),{forRebuild:true,forAuthorityTransition:true,cutoverRepair:options.cutoverRepair});
 if(!hasFactReadSource(client)&&(await client.query('SELECT 1 FROM analytics_fact_store_runs WHERE site_id=$1 LIMIT 1',[siteId])).rowCount)throw Error('FACT_STORE_REQUIRED');
 return invalidateFactSegmentsInner(client,siteId,segments,token);
}
async function invalidateFactSegmentsInner(client:PoolClient,siteId:string,segments:FactDeletionSegment[],token:FactDeletionCapture):Promise<{relational:boolean;hours:number;partial:boolean}>{
 const relations=factReadRelations(client);
 const captured=captures.get(token);if(!captured||captured.client!==client||captured.siteId!==siteId||captured.scope!==scopeOf(segments))throw Error('FACT_DELETION_CAPTURE_INVALID');
 const {name,partial,scope}=captured;if(!name)return {relational:false,hours:0,partial:false};const match=deletionMatch;
 // Delete samples before their event provenance is removed, including rows whose events expired from canonical storage.
 await client.query(`DELETE FROM analytics_vital_samples v USING analytics_effect_facts e,analytics_fact_runs r WHERE v.run_id=e.run_id AND v.event_id=e.event_id AND e.run_id=r.id AND r.site_id=$1 AND ${match}`,[siteId,scope]);
 await client.query(`DELETE FROM analytics_effect_facts e USING analytics_fact_runs r WHERE r.id=e.run_id AND r.site_id=$1 AND ${match}`,[siteId,scope]);
 if(relations.effectsRelation!=='analytics_effect_facts'){await client.query(`DELETE FROM ${relations.vitalsRelation} v USING ${relations.effectsRelation} e,analytics_fact_runs r WHERE v.run_id=e.run_id AND v.event_id=e.event_id AND e.run_id=r.id AND r.site_id=$1 AND ${match}`,[siteId,scope]);await client.query(`DELETE FROM ${relations.effectsRelation} e USING analytics_fact_runs r WHERE r.id=e.run_id AND r.site_id=$1 AND ${match}`,[siteId,scope]);}
 for(const table of ['analytics_numeric_facts','analytics_member_facts','analytics_session_facts'])await client.query(`DELETE FROM ${table} f USING ${name} d WHERE f.run_id=d.run_id AND f.session_id=d.session_id`);
 const cursor=`hours_${randomUUID().replaceAll('-','')}`;let hours=0;
 await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT DISTINCT hour FROM ${name} ORDER BY hour`);
 try{while(true){const rows=(await client.query(`FETCH FORWARD 20 FROM ${cursor}`)).rows;if(!rows.length)break;for(const row of rows){hours++;const from=new Date(row.hour),to=new Date(+from+3600000);
  if(partial){
   // A deleted interval can change a session that started outside it. Lost raw timing cannot be reconstructed from reduced contributions.
   await client.query("UPDATE stats_hourly SET data=analytics_bucket_without_members(data)||jsonb_build_object('relationalUnavailable','identity_interval_requires_raw_session_rebuild') WHERE site_id=$1 AND hour=$2",[siteId,from]);
  }else{
   const buckets=await queryPublishedNumericBuckets(client,siteId,from.toISOString(),to.toISOString());
   const data=buckets.get(from.toISOString());
   if(data)await client.query("UPDATE stats_hourly SET data=$3::jsonb||jsonb_build_object('relationalVersion',2) WHERE site_id=$1 AND hour=$2",[siteId,from,JSON.stringify(data)]);
   else await client.query('DELETE FROM stats_hourly WHERE site_id=$1 AND hour=$2',[siteId,from]);
  }
 }}}finally{await client.query(`CLOSE ${cursor}`);}
 await pruneUnreferencedFactRuns(client,siteId);
 return {relational:true,hours,partial};
}

/** Rebase verified aggregate backing after restore/deletion; stale worker claims still fail their old epoch fence. */
export async function rebasePublishedFactEpoch(client:PoolClient,siteId:string):Promise<void>{
 await client.query("UPDATE analytics_fact_runs r SET epoch=s.epoch FROM aggregation_state s WHERE r.site_id=$1 AND s.site_id=r.site_id AND r.status='published' AND (r.query_version=2 OR EXISTS(SELECT 1 FROM analytics_carry_heads h WHERE h.site_id=r.site_id AND h.run_id=r.id) OR EXISTS(SELECT 1 FROM analytics_session_contribution_heads h WHERE h.site_id=r.site_id AND h.run_id=r.id) OR EXISTS(SELECT 1 FROM analytics_relational_buckets b WHERE b.site_id=r.site_id AND b.run_id=r.id))",[siteId]);
 await client.query('UPDATE analytics_relational_buckets p SET epoch=s.epoch FROM aggregation_state s WHERE p.site_id=$1 AND s.site_id=p.site_id',[siteId]);
 await client.query("DELETE FROM analytics_fact_runs WHERE site_id=$1 AND status<>'published'",[siteId]);
}
