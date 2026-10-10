import type {PoolClient} from 'pg';
import {factReadSql} from './fact-read-context.js';
/** Reconstruct compatibility views from authenticated remaining-fact relations,
 * retaining precise owner selection and the existing export table bound. */
export async function exportedPublishedSessions(c:PoolClient,site:string){
 return (await c.query(factReadSql(c,`SELECT DISTINCT ON(e.session_id) e.session_id AS id,$1::text AS site_id,e.visitor_id,d.*,r.generation FROM analytics_session_facts e JOIN analytics_fact_runs r ON r.id=e.run_id JOIN aggregation_state a ON a.site_id=r.site_id LEFT JOIN analytics_session_contribution_heads h ON h.site_id=r.site_id AND h.session_id=e.session_id CROSS JOIN LATERAL jsonb_to_record(e.data)d(started_at timestamptz,last_active timestamptz,entry_path text,exit_path text,pageviews integer,duration_s double precision,visible_ms double precision,bounced boolean,dimensions jsonb) WHERE r.site_id=$1 AND r.status='published' AND r.epoch=a.epoch AND (h.session_id IS NULL OR(h.run_id=e.run_id AND h.epoch=a.epoch AND h.generation<=a.processed_generation)) AND NOT EXISTS(SELECT 1 FROM tombstones t WHERE t.site_id=$1 AND t.visitor_id=e.visitor_id) ORDER BY e.session_id,r.generation DESC,r.created_at DESC,r.id LIMIT 100001`),[site])).rows;
}
export async function exportedPublishedDefinitions(c:PoolClient,site:string){
 const run=(await c.query("SELECT r.id,r.generation FROM analytics_fact_runs r JOIN aggregation_state a ON a.site_id=r.site_id WHERE r.site_id=$1 AND r.status='published' AND r.query_version=2 AND r.epoch=a.epoch ORDER BY r.generation DESC,r.created_at DESC LIMIT 1",[site])).rows[0];if(!run)return[];
 const sessions=Number((await c.query(factReadSql(c,'SELECT count(*)::text n FROM analytics_session_facts WHERE run_id=$1'),[run.id])).rows[0].n);
 const goalRows=(await c.query(factReadSql(c,"SELECT key->>0 id,sum(value)::float n FROM analytics_numeric_facts WHERE run_id=$1 AND bucket_kind='hourly' AND metric='goal' GROUP BY 1"),[run.id])).rows;
 const channels=(await c.query(factReadSql(c,"SELECT (key->>0)::jsonb->>'goalId' id,(key->>0)::jsonb->>'channel' channel,sum(value)::float n FROM analytics_numeric_facts WHERE run_id=$1 AND bucket_kind='hourly' AND metric='goalAttribution' GROUP BY 1,2"),[run.id])).rows;
 const steps=(await c.query(factReadSql(c,"SELECT key->>0 id,(key->>1)::int step,count(DISTINCT visitor_id)::int n FROM analytics_member_facts WHERE run_id=$1 AND bucket_kind='hourly' AND metric='funnel' GROUP BY 1,2"),[run.id])).rows;
 const goals=(await c.query('SELECT id,name FROM goals WHERE site_id=$1 ORDER BY id LIMIT 100001',[site])).rows.map(g=>{const conversions=Number(goalRows.find(r=>r.id===g.id)?.n??0);return {id:g.id,name:g.name,conversions,rate:sessions?conversions/sessions:0,channels:Object.fromEntries(channels.filter(r=>r.id===g.id).map(r=>[r.channel,Number(r.n)]))}});
 const funnels=(await c.query('SELECT id,name,steps FROM funnels WHERE site_id=$1 ORDER BY id LIMIT 100001',[site])).rows.map(f=>{const counts=f.steps.map((_:unknown,i:number)=>Number(steps.find(r=>r.id===f.id&&r.step===i)?.n??0));return {id:f.id,name:f.name,steps:counts,dropoff:counts.map((n:number,i:number)=>i?counts[i-1]-n:0),rate:counts[0]?counts.at(-1)/counts[0]:0}});
 if(goals.length>100000||funnels.length>100000)throw Error('Export table exceeds 100000 rows');return[{site_id:site,data:{goals,funnels},generation:run.generation}];
}

/** Strict compatibility rollups are projections of the current authenticated
 * fact vector, never stale cache body or control-field default-zero values. */
export async function exportedPublishedRollups(c:PoolClient,site:string,kind:'hourly'|'daily',rows:Record<string,unknown>[]){
 const state=(await c.query('SELECT generation::text,processed_generation::text FROM aggregation_state WHERE site_id=$1',[site])).rows[0];if(!state||state.generation!==state.processed_generation)throw Error('EXPORT_AGGREGATION_PENDING');
 const {queryPublishedNumericBuckets}=await import('./fact-numeric-query.js'),{queryPublishedMembers}=await import('./fact-member-query.js'),{mergeBuckets}=await import('./analytics.js');
 const {publishedFactPredicate}=await import('./fact-member-query.js');
 const keyColumn=kind==='hourly'?'hour':'day',keys=await c.query(factReadSql(c,`SELECT DISTINCT ${kind==='hourly'?"date_trunc('hour',e.event_ts AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'":"to_char(e.event_ts AT TIME ZONE s.timezone,'YYYY-MM-DD')"} AS key FROM analytics_effect_facts e JOIN sites s ON s.id=$1 WHERE ${publishedFactPredicate} ORDER BY key LIMIT 100001`),[site]);
 if(keys.rows.length>100000)throw Error('Export table exceeds 100000 rows');
 const input=new Map<string,Record<string,unknown>>();const key=(value:unknown)=>kind==='hourly'?new Date(value as string|Date).toISOString():String(value);
 for(const row of rows)input.set(key(row[keyColumn]),row);
 for(const row of keys.rows)if(!input.has(key(row.key)))input.set(key(row.key),{site_id:site,[keyColumn]:row.key,data:{relationalVersion:2},generation:state.processed_generation});
 if(input.size>100000)throw Error('Export table exceeds 100000 rows');
 const output:Record<string,unknown>[]=[];
 for(const row of [...input.values()].sort((a,b)=>key(a[keyColumn]).localeCompare(key(b[keyColumn])))){const control=row.data as Record<string,unknown>;if(control.relationalUnavailable)throw Error('CACHE_BASELINE_UNAVAILABLE');if(!control.relationalVersion&&!control.cacheBodyStored){output.push(row);continue;}
  const bounds=kind==='hourly'?{start:new Date(row.hour as string|Date),finish:new Date(+new Date(row.hour as string|Date)+3600000)}:(await c.query('SELECT $2::date::timestamp AT TIME ZONE timezone start,($2::date+1)::timestamp AT TIME ZONE timezone finish FROM sites WHERE id=$1',[site,row.day])).rows[0];
  const from=new Date(bounds.start).toISOString(),to=new Date(bounds.finish).toISOString(),numbers=await queryPublishedNumericBuckets(c,site,from,to),members=await queryPublishedMembers(c,site,from,to),data=mergeBuckets([...numbers.values()]);
  output.push({...row,generation:state.processed_generation,data:{...data,relationalVersion:2,uv:members.uv,membership_counts:{uv:members.uv,pageUV:members.pageUV,segmentUV:members.segmentUV,eventUV:members.eventUV,funnels:members.funnels},visitor_values_exported:false}});
 }
 return output;
}

export async function exportedPublishedPageVitals(c:PoolClient,site:string){
 const {TDigest}=await import('tdigest'),{sessionVitalContributionPredicate}=await import('./session-contribution-overlay.js');
 const cursor='export_vital_'+(await import('node:crypto')).randomUUID().replaceAll('-','');
 await c.query(factReadSql(c,`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT to_char(e.event_ts AT TIME ZONE s.timezone,'YYYY-MM-DD') AS day,e.event_path AS path,e.metric,e.value FROM analytics_vital_samples e JOIN sites s ON s.id=$1 WHERE ${sessionVitalContributionPredicate} ORDER BY day,path,metric,event_ts,event_id`),[site]);
 const rows:Record<string,unknown>[]=[];let prior:{day:string;path:string;metric:string}|undefined,digest=new TDigest(),count=0;
 const flush=()=>{if(!prior)return;if(rows.length>=100000)throw Error('Export table exceeds 100000 rows');digest.compress();rows.push({site_id:site,...prior,digest:digest.toArray(),sample_count:count});};
 try{for(;;){const batch=(await c.query(`FETCH 100 FROM ${cursor}`)).rows;if(!batch.length)break;for(const row of batch){if(!prior||row.day!==prior.day||row.path!==prior.path||row.metric!==prior.metric){flush();prior={day:String(row.day),path:String(row.path),metric:String(row.metric)};digest=new TDigest();count=0;}const value=Number(row.value);if(!Number.isFinite(value))throw Error('EXPORT_VITAL_INVALID');digest.push(value);if(++count%100===0)digest.compress();}}flush();}finally{await c.query(`CLOSE ${cursor}`)}return rows;
}
