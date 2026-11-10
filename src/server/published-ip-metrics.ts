import type {PoolClient} from 'pg';
import type {ContentFilters} from './analytics-core.js';
import {factReadSql} from './fact-read-context.js';
import {factSelection,publishedFactPredicate} from './fact-member-query.js';
import {summarizeIPIdentities,type IPMetrics} from './network-ip.js';
import {ApplicationError} from '../shared/error-codes.js';

export interface PublishedIPMetric extends IPMetrics {pageviews:number;knownPageviews:number}
export interface PublishedIPSummary {total:PublishedIPMetric;recent:PublishedIPMetric;days:Map<string,PublishedIPMetric>}
/** Read in the same fenced snapshot as numeric history. Numeric PV effects keep
 * event dimensions after raw expiry, and share the existing owner/deletion rules.
 * Legacy PV without event ownership stays unknown; an IP prefix is never an ID. */
export async function queryPublishedIPMetrics(client:PoolClient,siteId:string,from:string,to:string,timezone:string,privacy:boolean,recentFrom:string,filters:ContentFilters={}):Promise<PublishedIPSummary>{
 const selected=factSelection(from,to,filters),params:unknown[]=[siteId,...selected.values],zone=params.length+1,recent=zone+1;
 const hasFilters=Object.values(filters).some(value=>value!==undefined);
 const identity="CASE WHEN e.dimensions->>'client_ip_id' ~ '^v1:[a-f0-9]{64}$' THEN e.dimensions->>'client_ip_id' ELSE NULL END";
 const source=`SELECT e.event_ts AS ts,e.value AS pv,${privacy?'NULL::text':identity} AS identity FROM analytics_effect_facts e WHERE ${publishedFactPredicate} AND NOT e.member AND e.metric='pv' AND ${selected.sql}
  AND NOT EXISTS(SELECT 1 FROM tombstones t WHERE t.site_id=$1 AND t.visitor_id=e.visitor_id)
  AND NOT EXISTS(SELECT 1 FROM identity_tombstones t WHERE t.site_id=$1 AND t.visitor_id=e.visitor_id AND t.started_at<=e.event_ts AND t.ended_at>e.event_ts)
  UNION ALL SELECT h.hour,COALESCE((h.data->>'pv')::numeric,0),NULL::text FROM stats_hourly h WHERE h.site_id=$1 AND h.hour>=$2::timestamptz AND h.hour+interval '1 hour'<=$3::timestamptz AND NOT(h.data ? 'relationalVersion')${hasFilters?' AND false':''}`;
 const rows=(await client.query(factReadSql(client,`WITH ip_source AS (${source}) SELECT (ts AT TIME ZONE $${zone})::date::text AS day,COALESCE(sum(pv),0)::text AS pv,COALESCE(sum(pv) FILTER(WHERE identity IS NOT NULL),0)::text AS known,count(DISTINCT identity)::text AS ips,COALESCE(sum(pv) FILTER(WHERE ts>=$${recent}::timestamptz),0)::text AS recent_pv,COALESCE(sum(pv) FILTER(WHERE ts>=$${recent}::timestamptz AND identity IS NOT NULL),0)::text AS recent_known,count(DISTINCT identity) FILTER(WHERE ts>=$${recent}::timestamptz)::text AS recent_ips FROM ip_source GROUP BY GROUPING SETS((),((ts AT TIME ZONE $${zone})::date)) ORDER BY day NULLS FIRST LIMIT 36602`),[...params,timezone,recentFrom])).rows;
 if(rows.length>36601)throw new ApplicationError('analytics_query_limit');
 const result=(pv:unknown,known:unknown,ips:unknown):PublishedIPMetric=>({pageviews:Number(pv),knownPageviews:Number(known),...summarizeIPIdentities(Number(pv),Number(known),Number(ips),privacy)});
 const all=rows.find(row=>row.day===null)!;
 return {total:result(all.pv,all.known,all.ips),recent:result(all.recent_pv,all.recent_known,all.recent_ips),days:new Map(rows.filter(row=>row.day!==null).map(row=>[row.day,result(row.pv,row.known,row.ips)]))};
}
