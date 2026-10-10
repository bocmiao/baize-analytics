import {beginPartitionSnapshot} from './db.js';
import {withFactReadSource} from './fact-store-source.js';
import {factReadSql} from './fact-read-context.js';
import {publishedMemberSource} from './fact-member-query.js';
import type {PoolClient} from 'pg';
import type {AppContext} from './context.js';
import {readSiteEvents} from './event-store.js';

export interface RetentionObservation {returned:number|null;rate:number|null;status:string;coverage:number;from:string;to:string}
export interface RetentionCohort {size:number;days:Record<string,number|null>;observations:Record<string,RetentionObservation>}
/** Exact calendar-day retention. Incomplete observations are unavailable, never zero. */
export async function queryRetention(ctx:Pick<AppContext,'pool'>,siteId:string,from:string,to:string,filters:Record<string,unknown>={},options:{client?:PoolClient}={}) {
 if(options.client)return withFactReadSource(options.client,ctx.pool,siteId,()=>queryRetentionRead(ctx,siteId,from,to,filters,{client:options.client!}));
 const client=await ctx.pool.connect();try{await beginPartitionSnapshot(client);const result=await withFactReadSource(client,ctx.pool,siteId,()=>queryRetentionRead(ctx,siteId,from,to,filters,{client}));await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
async function queryRetentionRead(ctx:Pick<AppContext,'pool'>,siteId:string,from:string,to:string,filters:Record<string,unknown>,options:{client:PoolClient}) {
 const db=options.client;
 const requestedFrom=+new Date(from),requestedTo=+new Date(to),now=Date.now();
 if(!Number.isFinite(requestedFrom)||!Number.isFinite(requestedTo)||requestedFrom>=requestedTo)throw Object.assign(new Error('invalid_retention_range'),{statusCode:400});
 const site=(await db.query('SELECT timezone,privacy_mode,retention_days FROM sites WHERE id=$1',[siteId])).rows[0];
 if(!site)throw Object.assign(new Error('site_not_found'),{statusCode:404});
 const effectiveTo=Math.min(now,requestedTo),cutoff=now-Number(site.retention_days)*86400000;
 const calendar=(await db.query("SELECT ($1::timestamptz AT TIME ZONE $3)::date::text AS first_day, (($2::timestamptz-interval '1 millisecond') AT TIME ZONE $3)::date::text AS last_day",[from,to,site.timezone])).rows[0];
 const metadata={status:'complete',coverage:1,observationFrom:from,observationTo:new Date(effectiveTo).toISOString(),requestedTo:to,timezone:site.timezone as string,retentionBoundary:new Date(cutoff).toISOString(),cohortFrom:calendar.first_day as string,cohortTo:calendar.last_day as string,maxDay:30,method:'first_visit_calendar_day_exact_pageview_sets',denominator:'all_first_visitors_in_selected_local_cohort_date'};
 if(requestedTo-requestedFrom>366*86400000)return {cohorts:{status:'range_limit_exceeded'},retention:{...metadata,status:'range_limit_exceeded',coverage:0}};
 if(site.privacy_mode!=='standard')return {cohorts:{status:'unsupported_in_this_mode'},retention:{...metadata,status:'unsupported_in_this_mode',coverage:0}};
 if(Object.values(filters).some(value=>value!==undefined&&value!==''))return {cohorts:{status:'unsupported_filters'},retention:{...metadata,status:'unsupported_filters',coverage:0}};
 const before=(await db.query('SELECT generation::text,processed_generation::text,epoch::text FROM aggregation_state WHERE site_id=$1',[siteId])).rows[0];
 const members=(await db.query('SELECT f.first_date::text AS day,f.visitor_id FROM visitor_first_seen f WHERE f.site_id=$1 AND f.first_date BETWEEN $2::date AND $3::date AND NOT EXISTS(SELECT 1 FROM tombstones t WHERE t.site_id=f.site_id AND t.visitor_id=f.visitor_id) ORDER BY f.first_date,f.visitor_id LIMIT 100001',[siteId,calendar.first_day,calendar.last_day])).rows as {day:string;visitor_id:string}[];
 if(members.length>100000)return {cohorts:{status:'truncated'},retention:{...metadata,status:'truncated',coverage:0}};
 const raw=await readSiteEvents(ctx.pool,siteId,{from:new Date(Math.max(cutoff,requestedFrom)),to:new Date(Math.max(Math.max(cutoff,requestedFrom),effectiveTo)),type:'pageview',limit:100000,client:options.client});
 const dayFormat=new Intl.DateTimeFormat('en-CA',{timeZone:site.timezone,year:'numeric',month:'2-digit',day:'2-digit'});
 const activities=new Map<string,Set<string>>();for(const event of raw.events){const day=dayFormat.format(new Date(event.ts));const set=activities.get(day)??new Set<string>();set.add(event.visitor_id);activities.set(day,set);}
 const archived=(await db.query('SELECT hour,data FROM stats_hourly WHERE site_id=$1 AND hour >= $2 AND hour < $3 ORDER BY hour',[siteId,new Date(Math.floor(requestedFrom/3600000)*3600000),new Date(Math.ceil(effectiveTo/3600000)*3600000)])).rows;
 const unavailableArchiveHours=new Set<number>(archived.filter(row=>row.data?.relationalUnavailable).map(row=>+new Date(row.hour)));
 const archivedHours=new Map<number,string[]>();for(const row of archived)if(Array.isArray(row.data?.activity))archivedHours.set(+new Date(row.hour),row.data.activity);
 const relational=((await db.query("SELECT 1 FROM analytics_fact_runs WHERE site_id=$1 AND status='published' AND query_version=2 LIMIT 1",[siteId])).rowCount??0)>0;
 const archiveReturns=new Map<string,number>();
 if(relational){const source=publishedMemberSource(siteId,from,new Date(effectiveTo).toISOString());const first=source.values.length+1,last=first+1,zone=last+1;
  const counts=(await db.query(`SELECT f.first_date::text AS cohort_day,((e.event_ts AT TIME ZONE $${zone})::date-f.first_date)::int AS n,count(DISTINCT e.visitor_id)::int AS returned FROM (${factReadSql(db,source.sql)}) e JOIN visitor_first_seen f ON f.site_id=$1 AND f.visitor_id=e.visitor_id WHERE e.metric='visitors' AND f.first_date BETWEEN $${first}::date AND $${last}::date AND NOT EXISTS(SELECT 1 FROM tombstones t WHERE t.site_id=f.site_id AND t.visitor_id=f.visitor_id) AND NOT EXISTS(SELECT 1 FROM identity_tombstones t WHERE t.site_id=f.site_id AND t.visitor_id=f.visitor_id AND t.started_at<=e.event_ts AND t.ended_at>e.event_ts) GROUP BY f.first_date,((e.event_ts AT TIME ZONE $${zone})::date-f.first_date)`,[...source.values,calendar.first_day,calendar.last_day,site.timezone])).rows;
  for(const row of counts)archiveReturns.set(JSON.stringify([row.cohort_day,String(row.n)]),Number(row.returned));
 }
 const deletedSegments=(await db.query('SELECT visitor_id,started_at,ended_at FROM identity_tombstones WHERE site_id=$1 AND started_at<$3 AND ended_at>$2',[siteId,from,new Date(effectiveTo)])).rows;
 const boundaries=(await db.query("SELECT d::date::text AS cohort_day,n,(d::date+n)::timestamp AT TIME ZONE $3 AS begin_at,(d::date+n+1)::timestamp AT TIME ZONE $3 AS end_at FROM generate_series($1::date,$2::date,interval '1 day') d CROSS JOIN generate_series(1,30) n",[calendar.first_day,calendar.last_day,site.timezone])).rows;
 const cohorts:Record<string,RetentionCohort>={};const membership=new Map<string,Set<string>>();for(const member of members){const set=membership.get(member.day)??new Set<string>();set.add(member.visitor_id);membership.set(member.day,set);}
 const after=(await db.query('SELECT generation::text,processed_generation::text,epoch::text FROM aggregation_state WHERE site_id=$1',[siteId])).rows[0];
 const changed=before?.generation!==after?.generation||before?.epoch!==after?.epoch;const pending=!before||before.generation!==before.processed_generation;
 let available=0,total=0;
 for(const row of boundaries){const visitors=membership.get(row.cohort_day);if(!visitors)continue;const cohort=cohorts[row.cohort_day]??={size:visitors.size,days:{},observations:{}};const begin=+new Date(row.begin_at),end=+new Date(row.end_at),day=String(row.n);let status='complete';let observed=activities.get(dayFormat.format(new Date(begin)))??new Set<string>();
  if(end>now)status='not_mature';else if(begin<requestedFrom||end>effectiveTo)status='outside_observation_window';else if(changed)status='source_changed';else if(pending)status='aggregation_pending';else if(begin<cutoff){
   const hours=Array.from({length:Math.ceil((end-begin)/3600000)},(_,i)=>Math.floor(begin/3600000)*3600000+i*3600000);
   if(begin%3600000!==0||end%3600000!==0||!hours.every(hour=>archivedHours.has(hour)))status='outside_retention';
   else if(hours.some(hour=>unavailableArchiveHours.has(hour)))status='unavailable_archive';
   else if(!relational&&deletedSegments.some(segment=>+new Date(segment.started_at)<end&&(segment.ended_at===Infinity||segment.ended_at==='infinity'?Infinity:+new Date(segment.ended_at))>begin))status='unavailable_archive';
   else {observed=new Set(hours.flatMap(hour=>archivedHours.get(hour)!));}
  }else if(raw.truncated||raw.coverage===0)status='truncated';
  const returned=status==='complete'?(begin<cutoff&&relational?(archiveReturns.get(JSON.stringify([row.cohort_day,day]))??0):[...visitors].filter(visitor=>observed.has(visitor)).length):null;cohort.days[day]=returned;cohort.observations[day]={returned,rate:returned===null?null:returned/visitors.size,status,coverage:returned===null?0:1,from:new Date(begin).toISOString(),to:new Date(end).toISOString()};total++;if(returned!==null)available++;
 }
 return {cohorts,retention:{...metadata,status:changed?'source_changed':pending?'aggregation_pending':available<total?'partial_unavailable':'complete',coverage:changed||pending?0:total?available/total:1,storage:{source:raw.source,mode:raw.mode,truncated:raw.truncated,coverage:raw.coverage}}};
}
