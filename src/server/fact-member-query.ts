import {factReadSql} from './fact-read-context.js';
import {sessionContributionPredicate as publishedFactPredicate} from './session-contribution-overlay.js';
import type {PoolClient} from 'pg';
import {carryRunReferenced,carryEffectReferenced,carryVitalReferenced} from './session-contribution-overlay.js';
import {ApplicationError} from '../shared/error-codes.js';
import {dictionary} from './analytics.js';
import type {ContentFilters} from './content-analytics.js';

/** Parameterized event-time predicate shared by numeric and exact membership queries. */
export function factSelection(from:string,to:string,filters:ContentFilters={},start=2){
 const values:unknown[]=[from,to];const clauses=[`event_ts>=$${start}::timestamptz`,`event_ts<$${start+1}::timestamptz`];
 for(const [key,value]of Object.entries(filters)){if(value===undefined)continue;if(key==='path'){values.push(value);clauses.push(`event_path=$${start+values.length-1}`);}else{values.push(key,value);clauses.push(`dimensions->>$${start+values.length-2}=$${start+values.length-1}`);}}
 return {values,sql:clauses.join(' AND ')};
}
export interface RelationalMembers {uv:number;pageUV:Record<string,number>;segmentUV:Record<string,number>;eventUV:Record<string,number>;funnels:Record<string,number[]>;trendUV:Record<string,number>}
/** Newest captured retained snapshot takes precedence over immutable older hour references. */
export {sessionContributionPredicate as publishedFactPredicate} from './session-contribution-overlay.js';
/** Exact union performed in spill-capable SQL, with no visitor values returned to JavaScript. */
async function readMembers(client:PoolClient,sourceSql:string,params:unknown[],usePublishedSource=true):Promise<RelationalMembers>{
 const result:RelationalMembers={uv:0,pageUV:dictionary(),segmentUV:dictionary(),eventUV:dictionary(),funnels:dictionary(),trendUV:dictionary()};
 const rows=(await client.query(`SELECT metric,key,count(DISTINCT visitor_id)::text AS n FROM (${usePublishedSource?factReadSql(client,sourceSql):sourceSql}) facts GROUP BY metric,key ORDER BY metric,key LIMIT 10001`,params)).rows;
 if(rows.length>10000||Buffer.byteLength(JSON.stringify(rows))>8*1024*1024)throw new ApplicationError('analytics_query_limit');
 for(const row of rows){const key=row.key as string[],n=Number(row.n);switch(row.metric){case 'visitors':result.uv=n;break;case 'pageVisitor':result.pageUV[key[0]!]=n;break;case 'segmentVisitor':result.segmentUV[key[0]!]=n;break;case 'eventVisitor':result.eventUV[key[0]!]=n;break;case 'funnel':{const counts=result.funnels[key[0]!]??=[];while(counts.length<=Number(key[1]))counts.push(0);counts[Number(key[1])]=n;break;}}}
 const hours=(await client.query(`SELECT date_trunc('hour',event_ts AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS hour,count(DISTINCT visitor_id)::text AS n FROM (${usePublishedSource?factReadSql(client,sourceSql):sourceSql}) facts WHERE metric='visitors' GROUP BY 1 ORDER BY 1 LIMIT 10001`,params)).rows;
 if(hours.length>10000)throw new ApplicationError('analytics_query_limit');for(const row of hours)result.trendUV[new Date(row.hour).toISOString()]=Number(row.n);
 return result;
}
export async function queryRunMembers(client:PoolClient,run:string,from:string,to:string,filters:ContentFilters={}):Promise<RelationalMembers>{
 const selected=factSelection(from,to,filters);return readMembers(client,`SELECT metric,key,visitor_id,event_ts FROM analytics_effect_facts WHERE run_id=$1 AND member AND ${selected.sql}`,[run,...selected.values],false);
}

/** Old exact JSON sets are expanded inside PG and unioned with current relational facts, never summed. */
export function publishedMemberSource(siteId:string,from:string,to:string,filters:ContentFilters={},excludedHours:Date[]=[]){
 const selected=factSelection(from,to,filters);const exclusion=selected.values.length+2;const values:unknown[]=[siteId,...selected.values,excludedHours];const filtered=Object.values(filters).some(v=>v!==undefined);
 const legacy=filtered?'SELECT hour,data FROM stats_hourly WHERE false':`SELECT hour,data FROM stats_hourly WHERE site_id=$1 AND hour>=$2::timestamptz AND hour+interval '1 hour'<=$3::timestamptz AND NOT(data ? 'relationalVersion') AND hour<>ALL($${exclusion}::timestamptz[])`;
 const sql=`WITH old AS(${legacy})
 SELECT metric,key,visitor_id,event_ts FROM analytics_effect_facts e WHERE member AND ${selected.sql} AND ${publishedFactPredicate} AND (date_trunc('hour',e.event_ts AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')<>ALL($${exclusion}::timestamptz[])
 UNION ALL SELECT 'visitors','[]'::jsonb,v,hour FROM old CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(data->'visitors','[]')) v
 UNION ALL SELECT 'pageVisitor',jsonb_build_array(p.key),v,hour FROM old CROSS JOIN LATERAL jsonb_each(COALESCE(data->'pages','{}')) p CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(p.value->'visitors','[]')) v
 UNION ALL SELECT 'segmentVisitor',jsonb_build_array(p.key),v,hour FROM old CROSS JOIN LATERAL jsonb_each(COALESCE(data->'segments','{}')) p CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(p.value->'visitors','[]')) v
 UNION ALL SELECT 'eventVisitor',jsonb_build_array(p.key),v,hour FROM old CROSS JOIN LATERAL jsonb_each(COALESCE(data->'events','{}')) p CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(p.value->'visitors','[]')) v
 UNION ALL SELECT 'funnel',jsonb_build_array(p.key,(step-1)::text),v,hour FROM old CROSS JOIN LATERAL jsonb_each(COALESCE(data->'funnels','{}')) p CROSS JOIN LATERAL jsonb_array_elements(p.value) WITH ORDINALITY st(arr,step) CROSS JOIN LATERAL jsonb_array_elements_text(st.arr) v`;
 return {sql,values};
}
export async function queryPublishedMembers(client:PoolClient,siteId:string,from:string,to:string,filters:ContentFilters={},excludedHours:Date[]=[]):Promise<RelationalMembers>{
 const source=publishedMemberSource(siteId,from,to,filters,excludedHours);return readMembers(client,source.sql,source.values);
}

/** Publish references atomically with rollups; older referenced hours are not discarded by a new retained rebuild. */
export async function publishFactHourReferences(client:PoolClient,siteId:string,run:string,replaceFrom:Date){
 if((await client.query('SELECT site_id FROM analytics_fact_runs WHERE id=$1',[run])).rows[0]?.site_id!==siteId)throw Error('FACT_SITE_SCOPE');
 await client.query('DELETE FROM analytics_relational_buckets WHERE site_id=$1 AND hour>=$2',[siteId,replaceFrom]);
 await client.query(factReadSql(client,`INSERT INTO analytics_relational_buckets SELECT $2,hour,r.id,r.epoch,r.generation FROM analytics_fact_runs r CROSS JOIN LATERAL(SELECT DISTINCT date_trunc('hour',event_ts AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS hour FROM analytics_effect_facts WHERE run_id=r.id) hours WHERE r.id=$1 AND hour>=$3`),[run,siteId,replaceFrom]);
}

/** Raw expiry does not erase unique archived aggregate membership; only unreferenced fact runs are disposable. */
export async function pruneUnreferencedFactRuns(client:PoolClient,siteId:string):Promise<void>{
 const current=(await client.query("SELECT id FROM analytics_fact_runs WHERE site_id=$1 AND query_version=2 AND status='published' ORDER BY generation DESC,created_at DESC LIMIT 1",[siteId])).rows[0]?.id??null;
 // The newest snapshot also backs a partial retained hour, which deliberately has no full-hour pointer.
 await client.query(`DELETE FROM analytics_fact_runs r WHERE site_id=$1 AND status<>'staging' AND id IS DISTINCT FROM $2::uuid AND NOT EXISTS(SELECT 1 FROM analytics_relational_buckets p WHERE p.run_id=r.id) AND NOT ${carryRunReferenced}`,[siteId,current]);
 for(const table of ['analytics_effect_facts','analytics_vital_samples'])await client.query(`DELETE FROM ${table} e USING analytics_fact_runs r WHERE e.run_id=r.id AND r.site_id=$1 AND r.id IS DISTINCT FROM $2::uuid AND r.status='published' AND NOT EXISTS(SELECT 1 FROM analytics_relational_buckets p WHERE p.run_id=r.id AND p.hour=date_trunc('hour',e.event_ts AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') AND NOT (${table==='analytics_effect_facts'?carryEffectReferenced:carryVitalReferenced})`,[siteId,current]);
 // Older V2 runs are queried through provenance, not duplicate hourly/daily compatibility sets.
 for(const table of ['analytics_numeric_facts','analytics_member_facts','analytics_vitals_facts'])await client.query(`DELETE FROM ${table} f USING analytics_fact_runs r WHERE f.run_id=r.id AND r.site_id=$1 AND r.id IS DISTINCT FROM $2::uuid AND r.query_version=2 AND r.status='published'`,[siteId,current]);
 await client.query("DELETE FROM analytics_session_facts f USING analytics_fact_runs r WHERE f.run_id=r.id AND r.site_id=$1 AND r.id IS DISTINCT FROM $2::uuid AND r.query_version=2 AND r.status='published' AND NOT EXISTS(SELECT 1 FROM analytics_effect_facts e WHERE e.run_id=f.run_id AND e.session_id=f.session_id) AND NOT EXISTS(SELECT 1 FROM analytics_fact_store_members m WHERE m.run_id=f.run_id AND m.kind='effects' AND m.session_id=f.session_id)",[siteId,current]);
}
