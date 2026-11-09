import type {PoolClient} from 'pg';
import type {AppContext} from './context.js';
import type {ContentFilters} from './analytics-core.js';
import {dayOf} from './analytics-core.js';
import {queryStats} from './analytics.js';
import {withCacheReadSource} from './cache-store-source.js';
import {factReadSql} from './fact-read-context.js';
import {factSelection,publishedFactPredicate,publishedMemberSource} from './fact-member-query.js';
import {ApplicationError} from '../shared/error-codes.js';

const historyStart='0001-01-01T00:00:00.000Z';
export interface HistoryDay {day:string;pv:number;sessions:number;bounces:number;duration:number;uv:number|null;newVisitors:number|null}
export interface HistoryTotals {pv:number|null;uv:number|null;ips:null;newVisitors:number|null;sessions:number|null;bounceRate:number|null;averageDuration:number|null;averagePages:number|null}
const unavailable=():HistoryTotals=>({pv:null,uv:null,ips:null,newVisitors:null,sessions:null,bounceRate:null,averageDuration:null,averagePages:null});
export type PeakMetric='pv'|'uv'|'ips'|'newVisitors'|'sessions'|'bounceRate'|'averageDuration'|'averagePages';
const peakMetrics:PeakMetric[]=['pv','uv','ips','newVisitors','sessions','bounceRate','averageDuration','averagePages'];
function dailyMetrics(row:HistoryDay):HistoryTotals{return {pv:row.pv,uv:row.uv,ips:null,newVisitors:row.newVisitors,sessions:row.sessions,bounceRate:row.sessions?row.bounces/row.sessions:0,averageDuration:row.sessions?row.duration/row.sessions:0,averagePages:row.sessions?row.pv/row.sessions:0};}

/** Whole-history UV is supplied by a DISTINCT SQL query; daily UV must never be summed. */
export function summarizePublishedHistory(days:HistoryDay[],distinct:{uv:number|null;newVisitors:number|null},status='complete'){
 const peaks=Object.fromEntries(peakMetrics.map(key=>[key,{value:null as number|null,date:null as string|null}])) as Record<PeakMetric,{value:number|null;date:string|null}>;
 if(status!=='complete')return {totals:unavailable(),peaks:{...peaks,coverage:0,status}};
 const sum=days.reduce((all,row)=>({pv:all.pv+row.pv,sessions:all.sessions+row.sessions,bounces:all.bounces+row.bounces,duration:all.duration+row.duration}),{pv:0,sessions:0,bounces:0,duration:0});
 const totals:HistoryTotals={...dailyMetrics({day:'',...sum,...distinct}),...distinct};
 for(const row of [...days].sort((a,b)=>a.day.localeCompare(b.day))){const metrics=dailyMetrics(row);for(const key of peakMetrics){const value=metrics[key];if(value!==null&&(peaks[key].value===null||value>=peaks[key].value!))peaks[key]={value,date:row.day};}}
 return {totals,peaks:{...peaks,coverage:1,status:days.length?'complete':'empty'}};
}

/** Optional expansion reads authenticated published facts and legacy aggregate
 * caches. It deliberately does not start at the raw-event retention cutoff. */
export async function query51laHistory(ctx:AppContext,client:PoolClient,siteId:string,asOf:string,site:{timezone:string;privacy_mode:string},filters:ContentFilters={}){
 const calendar=(await client.query("SELECT (date_trunc('month',$1::timestamptz AT TIME ZONE $2) AT TIME ZONE $2) AS month_start",[asOf,site.timezone])).rows[0];
 const monthStart=new Date(calendar.month_start).toISOString(),month=await queryStats(ctx,siteId,monthStart,asOf,filters,{client}),privacy=site.privacy_mode!=='standard';
 const monthBase={from:monthStart,to:asOf,coverage:month.coverage,status:month.rangeStatus,totals:{...month.totals,ips:null,newVisitors:null as number|null,averagePages:month.totals.sessions?month.totals.pv/month.totals.sessions:0}};
 return withCacheReadSource(client,ctx.pool,siteId,async()=>{
  const read=(sql:string,values:unknown[])=>client.query(factReadSql(client,sql),values);
  const state=(await client.query('SELECT generation::text,processed_generation::text FROM aggregation_state WHERE site_id=$1',[siteId])).rows[0];
  const selected=factSelection(historyStart,asOf,filters),params:unknown[]=[siteId,...selected.values],zone=params.length+1;
  const hasFilters=Object.values(filters).some(value=>value!==undefined);
  const unavailableArchive=(await read("SELECT 1 FROM stats_hourly h WHERE site_id=$1 AND h.hour<$2::timestamptz AND ((h.data ? 'relationalUnavailable') OR (h.data ? 'relationalVersion' AND NOT EXISTS(SELECT 1 FROM analytics_relational_buckets p WHERE p.site_id=h.site_id AND p.hour=h.hour))) LIMIT 1",[siteId,asOf])).rowCount;
  const legacy=(await read("SELECT count(*)::int AS n,bool_or(hour+interval '1 hour'>$2::timestamptz) AS partial_end,bool_or((hour AT TIME ZONE $3)::date<>((hour+interval '1 hour'-interval '1 millisecond') AT TIME ZONE $3)::date) AS crosses_day FROM stats_hourly WHERE site_id=$1 AND hour<$2::timestamptz AND NOT(data ? 'relationalVersion')",[siteId,asOf,site.timezone])).rows[0];
  // A non-hour-aligned retained boundary can leave a full legacy hour beside
  // a published tail/carry contribution for that same hour. Neither side can
  // safely replace the other without proving complete event coverage.
  const overlap=(await read(`SELECT min(h.hour) AS first_hour,max(h.hour) AS last_hour FROM stats_hourly h WHERE h.site_id=$1 AND NOT(h.data ? 'relationalVersion') AND h.hour<$3::timestamptz AND EXISTS(SELECT 1 FROM analytics_effect_facts e WHERE ${publishedFactPredicate} AND NOT e.member AND e.metric IN('pv','sessions','bounces','duration_s') AND ${selected.sql} AND e.event_ts>=h.hour AND e.event_ts<h.hour+interval '1 hour')`,params)).rows[0];
  const overlapping=Boolean(overlap.first_hour),monthOverlapping=overlapping&&+new Date(overlap.last_hour)+3600000>+new Date(monthStart);
  let status=!state||state.generation!==state.processed_generation?'aggregation_pending':unavailableArchive?'unavailable_archive':overlapping?'overlapping_legacy_history':hasFilters&&Number(legacy.n)>0?'filtered_legacy_history_unavailable':legacy.partial_end?'partial_legacy_boundary':legacy.crosses_day?'legacy_timezone_boundary':'complete';
  const numericSource=`SELECT e.event_ts AS ts,e.metric,e.value FROM analytics_effect_facts e WHERE ${publishedFactPredicate} AND NOT e.member AND e.metric IN('pv','sessions','bounces','duration_s') AND ${selected.sql}
   UNION ALL SELECT h.hour,m.metric,COALESCE((h.data->>m.metric)::numeric,0) FROM stats_hourly h CROSS JOIN (VALUES('pv'),('sessions'),('bounces'),('duration_s')) m(metric) WHERE h.site_id=$1 AND h.hour>=$2::timestamptz AND h.hour+interval '1 hour'<=$3::timestamptz AND NOT(h.data ? 'relationalVersion')${hasFilters?' AND false':''}`;
  const numeric=(await read(`SELECT (ts AT TIME ZONE $${zone})::date::text AS day,min(ts) AS first_ts,COALESCE(sum(value) FILTER(WHERE metric='pv'),0)::text AS pv,COALESCE(sum(value) FILTER(WHERE metric='sessions'),0)::text AS sessions,COALESCE(sum(value) FILTER(WHERE metric='bounces'),0)::text AS bounces,COALESCE(sum(value) FILTER(WHERE metric='duration_s'),0)::text AS duration FROM (${numericSource}) n GROUP BY 1 ORDER BY 1 LIMIT 36601`,[...params,site.timezone])).rows;
  if(numeric.length>36600)throw new ApplicationError('analytics_query_limit');
  const from=numeric.length?new Date(numeric[0].first_ts).toISOString():null;
  const member=publishedMemberSource(siteId,historyStart,asOf,filters),memberZone=member.values.length+1;
  const safeMembers=`SELECT e.* FROM (${member.sql}) e WHERE e.metric='visitors' AND NOT EXISTS(SELECT 1 FROM tombstones t WHERE t.site_id=$1 AND t.visitor_id=e.visitor_id) AND NOT EXISTS(SELECT 1 FROM identity_tombstones t WHERE t.site_id=$1 AND t.visitor_id=e.visitor_id AND t.started_at<=e.event_ts AND t.ended_at>e.event_ts)`;
  const daily=(await read(`SELECT (e.event_ts AT TIME ZONE $${memberZone})::date::text AS day,count(DISTINCT e.visitor_id)::int AS uv,${privacy?'NULL::integer':`count(DISTINCT e.visitor_id) FILTER(WHERE f.first_date=(e.event_ts AT TIME ZONE $${memberZone})::date)::int`} AS new_visitors FROM (${safeMembers}) e LEFT JOIN visitor_first_seen f ON f.site_id=$1 AND f.visitor_id=e.visitor_id GROUP BY 1 ORDER BY 1 LIMIT 36601`,[...member.values,site.timezone])).rows;
  if(daily.length>36600)throw new ApplicationError('analytics_query_limit');
  const firstDay=from?dayOf(from,site.timezone):dayOf(asOf,site.timezone),monthDay=dayOf(monthStart,site.timezone);
  const exact=(await read(`SELECT count(DISTINCT e.visitor_id)::int AS uv,count(DISTINCT e.visitor_id) FILTER(WHERE f.first_date>=$${memberZone+1}::date AND f.first_date<=(e.event_ts AT TIME ZONE $${memberZone})::date)::int AS new_visitors,count(DISTINCT e.visitor_id) FILTER(WHERE e.event_ts>=$${memberZone+2}::timestamptz AND f.first_date>=$${memberZone+3}::date AND f.first_date<=(e.event_ts AT TIME ZONE $${memberZone})::date)::int AS month_new_visitors,count(DISTINCT e.visitor_id) FILTER(WHERE f.first_date IS NULL OR f.first_date>(e.event_ts AT TIME ZONE $${memberZone})::date)::int AS unknown_visitors FROM (${safeMembers}) e LEFT JOIN visitor_first_seen f ON f.site_id=$1 AND f.visitor_id=e.visitor_id`,[...member.values,site.timezone,firstDay,monthStart,monthDay])).rows[0];
  const membersByDay=new Map<string,{uv:number;new_visitors:number|null}>(daily.map(row=>[row.day,row]));
  const days:HistoryDay[]=numeric.map(row=>({day:row.day,pv:Number(row.pv),sessions:Number(row.sessions),bounces:Number(row.bounces),duration:Number(row.duration),uv:membersByDay.get(row.day)?.uv??0,newVisitors:privacy?null:membersByDay.get(row.day)?.new_visitors??0}));
  const unknown=Number(exact.unknown_visitors)>0;
  const numericDays=new Set(numeric.map(row=>row.day));if(daily.some(row=>!numericDays.has(row.day)))status='incomplete_numeric_history';
  const summary=summarizePublishedHistory(days,{uv:privacy?null:Number(exact.uv),newVisitors:privacy||unknown?null:Number(exact.new_visitors)},status);
  if(unknown){summary.peaks.newVisitors={value:null,date:null};}
  const thisMonth=monthOverlapping?{...monthBase,totals:unavailable(),coverage:0,status:'overlapping_legacy_history'}:{...monthBase,totals:{...monthBase.totals,newVisitors:privacy||unknown||status!=='complete'?null:Number(exact.month_new_visitors)}};
  return {thisMonth,total:{from,to:asOf,totals:summary.totals,coverage:status==='complete'?1:0,status:status==='complete'&&!days.length?'empty':status},peaks:summary.peaks,history:{from,to:asOf,timezone:site.timezone,scope:'available_published_history',source:'authenticated_fact_and_legacy_cache',visitorStatus:privacy?'unsupported_in_this_mode':unknown?'partial_first_seen':'complete',ipStatus:'not_collected',overlap:overlapping?{from:new Date(overlap.first_hour).toISOString(),to:new Date(+new Date(overlap.last_hour)+3600000).toISOString()}:null},dailyCount:days.length};
 },{kinds:['hourly_rollup']});
}
