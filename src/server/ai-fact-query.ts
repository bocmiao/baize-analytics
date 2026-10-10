import {withFactReadSource} from './fact-store-source.js';
import {factReadSql,hasFactReadSource,factReadRelations} from './fact-read-context.js';
import {assertSessionContributionOwners} from './session-contribution-overlay.js';
import {factAuthorityMatches} from './fact-authority.js';
import type {Pool,PoolClient} from 'pg';
import {ApplicationError} from '../shared/error-codes.js';
import {factSelection,publishedFactPredicate,publishedMemberSource} from './fact-member-query.js';
import type {ContentFilters} from './content-analytics.js';

export interface AiFactQuery {
 from:string;to:string;dimension:'day'|'page'|'source'|'device';
 metric:'pv'|'uv'|'sessions'|'conversions'|'conversion_rate';
 filters?:{source?:string;page?:string;device?:string;os?:string};
}
export interface AiFactSeries {
 rows:{key:string;value:number|null;numerator?:number;denominator?:number}[];
 source?:'postgres'|'clickhouse'|'hybrid';status:'ok'|'unsupported';coverage:0|1;semantics:string;reason?:string;totalGroups:number;
}
/** Exact aggregate-only SQL adapter. Caller owns the captured client and deletion fence. */
export async function queryAiPublishedSeries(client:PoolClient,siteId:string,q:AiFactQuery,timezone:string,options:{pool?:Pool}={}):Promise<AiFactSeries>{
 if(options.pool)return withFactReadSource(client,options.pool,siteId,async()=>({...await queryAiSeries(client,siteId,q,timezone),source:factReadRelations(client).source??'postgres'}));
 if(!hasFactReadSource(client)&&(await client.query('SELECT 1 FROM analytics_fact_store_runs WHERE site_id=$1 LIMIT 1',[siteId])).rowCount)throw Error('FACT_STORE_REQUIRED');
 return queryAiSeries(client,siteId,q,timezone);
}
async function queryAiSeries(client:PoolClient,siteId:string,q:AiFactQuery,timezone:string):Promise<AiFactSeries>{
 const filters={...q.filters,channel:q.filters?.source,path:q.filters?.page} as Record<string,string|undefined>;delete filters.source;delete filters.page;
 const selected=factSelection(q.from,q.to,filters as ContentFilters),values:unknown[]=[siteId,...selected.values,timezone],tz=`$${values.length}`;
 const semantics=q.metric==='conversion_rate'?'distinct_any_goal_completed_sessions_in_start_cohort_and_completion_window':'event_time_exact_relational_aggregate';
 const unsupported=(reason:string):AiFactSeries=>({rows:[],status:'unsupported',coverage:0,semantics,reason,totalGroups:0});
 const current=(await client.query(`SELECT r.retained_from,${factAuthorityMatches} AS authority_matches FROM analytics_fact_runs r LEFT JOIN canonical_event_authority c ON c.site_id=r.site_id JOIN aggregation_state s ON s.site_id=r.site_id AND s.epoch=r.epoch AND s.processed_generation=r.generation AND s.generation=s.processed_generation WHERE r.site_id=$1 AND r.query_version=2 AND r.status='published' ORDER BY r.generation DESC,r.created_at DESC LIMIT 1`,[siteId])).rows[0];
 if(!current)return unsupported('relational_backing_unavailable');
 if(!current.authority_matches)return unsupported('published_authority_mismatch');
 try{await assertSessionContributionOwners(client,siteId);}catch(error){if(error instanceof Error&&error.message==='CARRY_CONTRIBUTION_SOURCE_UNAVAILABLE')return unsupported('session_contribution_backing_unavailable');throw error;}
 const legacy=(await client.query("SELECT 1 FROM stats_hourly WHERE site_id=$1 AND hour<$3::timestamptz AND hour+interval '1 hour'>$2::timestamptz AND NOT(data ? 'relationalVersion') LIMIT 1",[siteId,q.from,q.to])).rowCount;
 if(legacy&&Object.values(filters).some(v=>v!==undefined))return unsupported('filtered_legacy_history_unavailable');
 const missing=(await client.query("SELECT 1 FROM stats_hourly h WHERE site_id=$1 AND hour<$3::timestamptz AND hour+interval '1 hour'>$2::timestamptz AND ((data ? 'relationalUnavailable') OR (data ? 'relationalVersion' AND NOT EXISTS(SELECT 1 FROM analytics_relational_buckets p WHERE p.site_id=h.site_id AND p.hour=h.hour))) LIMIT 1",[siteId,q.from,q.to])).rowCount;
 if(missing)return unsupported('relational_backing_unavailable');
 const dimension=(alias:string)=>q.dimension==='day'?`to_char(${alias}.event_ts AT TIME ZONE ${tz},'YYYY-MM-DD')`:q.dimension==='page'?`${alias}.event_path`:`COALESCE(${alias}.dimensions->>'${q.dimension==='source'?'channel':'device'}','unknown')`;
 let sql:string,params=values;
 if(q.metric==='uv'){
  const members=publishedMemberSource(siteId,q.from,q.to,filters as ContentFilters);params=[...members.values,timezone];const mtz=`$${params.length}`;
  const metric=q.dimension==='day'?'visitors':q.dimension==='page'?'pageVisitor':'segmentVisitor';
  const group=q.dimension==='day'?`to_char(event_ts AT TIME ZONE ${mtz},'YYYY-MM-DD')`:q.dimension==='page'?`key->>0`:`COALESCE((key->>0)::jsonb->>'${q.dimension==='source'?'channel':'device'}','unknown')`;
  sql=`SELECT ${group} AS key,count(DISTINCT visitor_id)::double precision AS value FROM (${members.sql}) e WHERE metric='${metric}' GROUP BY 1 ORDER BY 1 LIMIT 10001`;
 }else if(q.metric==='conversion_rate'){
  if(legacy)return unsupported('legacy_session_cohort_backing_unavailable');
  if(+new Date(q.from)<+new Date(current.retained_from)&&+new Date(q.to)>+new Date(current.retained_from)){const absent=(await client.query(factReadSql(client,`SELECT 1 FROM analytics_effect_facts e WHERE ${publishedFactPredicate} AND e.event_ts>=$2::timestamptz AND e.event_ts<$3::timestamptz AND NOT EXISTS(SELECT 1 FROM analytics_session_contribution_heads h WHERE h.site_id=$1 AND h.run_id=e.run_id AND h.session_id=e.session_id) LIMIT 1`),[siteId,q.from,q.to])).rowCount;if(absent)return unsupported('retention_boundary_session_carry_unavailable');}
  // Goal completion and session starts have different event times; join by stable event-time session ID.
  sql=`WITH starts AS(SELECT DISTINCT e.session_id,${dimension('e')} AS key FROM analytics_effect_facts e WHERE ${publishedFactPredicate} AND ${selected.sql} AND NOT member AND metric='sessions'), completed AS(SELECT DISTINCT e.session_id FROM analytics_effect_facts e WHERE ${publishedFactPredicate} AND e.event_ts>=$2::timestamptz AND e.event_ts<$3::timestamptz AND NOT member AND metric='goal') SELECT s.key,count(DISTINCT c.session_id)::int AS numerator,count(DISTINCT s.session_id)::int AS denominator,count(DISTINCT c.session_id)::double precision/NULLIF(count(DISTINCT s.session_id),0) AS value FROM starts s LEFT JOIN completed c USING(session_id) GROUP BY s.key ORDER BY s.key LIMIT 10001`;
 }else{
  const metric=q.metric==='conversions'?'goal':q.metric;
  const legacyDimension=q.dimension==='day'?`to_char(hour AT TIME ZONE ${tz},'YYYY-MM-DD')`:q.dimension==='page'?`segment.key::jsonb->>'path'`:`COALESCE(segment.key::jsonb->>'${q.dimension==='source'?'channel':'device'}','unknown')`;
  const legacyValue=q.metric==='conversions'?`COALESCE((SELECT sum(v::double precision) FROM jsonb_each_text(COALESCE(${q.dimension==='day'?'data':'segment.value'}->'goals','{}')) g(k,v)),0)`:`COALESCE((${q.dimension==='day'?'data':'segment.value'}->>'${metric}')::double precision,0)`;
  const old=`SELECT ${legacyDimension} AS key,${legacyValue} AS value FROM stats_hourly ${q.dimension==='day'?'':"CROSS JOIN LATERAL jsonb_each(COALESCE(data->'segments','{}')) segment"} WHERE site_id=$1 AND hour>=$2::timestamptz AND hour+interval '1 hour'<=$3::timestamptz AND NOT(data ? 'relationalVersion')`;
  sql=`SELECT key,sum(value)::double precision AS value FROM(SELECT ${dimension('e')} AS key,value FROM analytics_effect_facts e WHERE ${publishedFactPredicate} AND ${selected.sql} AND NOT member AND metric='${metric}' UNION ALL ${old}) facts GROUP BY key ORDER BY key LIMIT 10001`;
 }
 const rows=(await client.query(factReadSql(client,`SELECT * FROM (${sql}) series WHERE $${params.length}::text IS NOT NULL`),params)).rows as AiFactSeries['rows'];
 if(rows.length>10000||Buffer.byteLength(JSON.stringify(rows))>8*1024*1024)throw new ApplicationError('analytics_query_limit');
 if(legacy&&(+new Date(q.from)%3600000||+new Date(q.to)%3600000))return unsupported('partial_legacy_hour_unavailable');
 return {rows,status:'ok',coverage:1,semantics,totalGroups:rows.length};
}
