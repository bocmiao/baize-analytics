import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {queryPublishedNumericBuckets} from './fact-numeric-query.js';
import {pruneUnreferencedFactRuns} from './fact-member-query.js';

export interface FactDeletionSegment {visitorId:string;from?:string;to?:string|null}
/** Caller holds P -> site and the journal is durable. No pool acquisition occurs here. */
export async function invalidateFactSegments(client:PoolClient,siteId:string,segments:FactDeletionSegment[]):Promise<{relational:boolean;hours:number;partial:boolean}>{
 const active=(await client.query("SELECT 1 FROM analytics_fact_runs WHERE site_id=$1 AND query_version=2 AND status='published' LIMIT 1",[siteId])).rowCount;
 if(!active)return {relational:false,hours:0,partial:false};
 // Legacy rollups have no event contribution provenance; they cannot be truthfully subtracted.
const name=`fact_delete_${randomUUID().replaceAll('-','')}`;
 const scope=JSON.stringify(segments.map(s=>({visitor:s.visitorId,from:s.from??null,to:s.to==='infinity'?null:s.to??null})));
 await client.query("UPDATE stats_hourly SET data=analytics_bucket_without_members(data)||jsonb_build_object('relationalUnavailable','legacy_contributions_unavailable_after_deletion') WHERE site_id=$1 AND NOT(data ? 'relationalVersion')",[siteId]);
 const match=`EXISTS(SELECT 1 FROM jsonb_to_recordset($2) s(visitor text,"from" timestamptz,"to" timestamptz) WHERE e.visitor_id=s.visitor AND (s."from" IS NULL OR e.event_ts>=s."from") AND (s."to" IS NULL OR e.event_ts<s."to"))`;
 await client.query(`CREATE TEMP TABLE ${name} ON COMMIT DROP AS SELECT DISTINCT e.run_id,e.session_id,date_trunc('hour',e.event_ts AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS hour FROM analytics_effect_facts e JOIN analytics_fact_runs r ON r.id=e.run_id WHERE r.site_id=$1 AND ${match}`,[siteId,scope]);
 const partial=segments.some(s=>s.from!==undefined||s.to!=null);
 if(partial)await client.query(`INSERT INTO ${name} SELECT DISTINCT e.run_id,e.session_id,date_trunc('hour',e.event_ts AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' FROM analytics_effect_facts e WHERE EXISTS(SELECT 1 FROM ${name} affected WHERE affected.run_id=e.run_id AND affected.session_id=e.session_id)`);
 // Delete samples before their event provenance is removed, including rows whose events expired from canonical storage.
 await client.query(`DELETE FROM analytics_vital_samples v USING analytics_effect_facts e,analytics_fact_runs r WHERE v.run_id=e.run_id AND v.event_id=e.event_id AND e.run_id=r.id AND r.site_id=$1 AND ${match}`,[siteId,scope]);
 await client.query(`DELETE FROM analytics_effect_facts e USING analytics_fact_runs r WHERE r.id=e.run_id AND r.site_id=$1 AND ${match}`,[siteId,scope]);
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
 await client.query("UPDATE analytics_fact_runs r SET epoch=s.epoch FROM aggregation_state s WHERE r.site_id=$1 AND s.site_id=r.site_id AND r.query_version=2 AND r.status='published'",[siteId]);
 await client.query('UPDATE analytics_relational_buckets p SET epoch=s.epoch FROM aggregation_state s WHERE p.site_id=$1 AND s.site_id=p.site_id',[siteId]);
 await client.query("DELETE FROM analytics_fact_runs WHERE site_id=$1 AND status<>'published'",[siteId]);
}
