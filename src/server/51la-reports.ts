import type {FastifyInstance} from 'fastify';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import type {AppContext} from './context.js';
import {queryStats} from './analytics.js';
import {contentFilterSchema,dayOf,eventMatchesFilters,sessionTimeoutMs,type AnalyticsEvent,type ContentFilters} from './analytics-core.js';
import {readSiteEvents} from './event-store.js';
import {withStatsReadSnapshot} from './stats-read-snapshot.js';
import {ApplicationError} from '../shared/error-codes.js';
import {buildLiveTraffic,buildTrafficReport,filterVisits,visitorCounts,trafficDimensions,type VisitorCounts} from './51la-report-model.js';
import {countIPIdentities} from './network-ip.js';
import {query51laHistory} from './51la-history-summary.js';
import {buildForecastHistory,buildTrafficForecast,forecastCalendar} from './traffic-forecast.js';

const trafficRangeBase=contentFilterSchema.extend({from:z.iso.datetime().optional(),to:z.iso.datetime().optional(),trendDimension:z.enum(trafficDimensions).optional(),trendLabel:z.string().max(2048).optional(),trendLabels:z.preprocess(value=>typeof value==='string'?[value]:value,z.array(z.string().max(2048)).min(1).max(5)).optional()});
function validateTrendSelection(query:{trendDimension?:string;trendLabel?:string;trendLabels?:string[]},ctx:z.RefinementCtx){
 if(query.trendLabel!==undefined&&query.trendLabels!==undefined)ctx.addIssue({code:'custom',path:['trendLabels'],message:'选择一个趋势项目或一组趋势项目'});
 const labels=query.trendLabels??(query.trendLabel!==undefined?[query.trendLabel]:[]);
 if(labels.length&&!query.trendDimension)ctx.addIssue({code:'custom',path:['trendDimension'],message:'请选择趋势维度'});
 if(query.trendDimension==='ip'&&labels.some(value=>!/^[a-f0-9]{24}$/.test(value)))ctx.addIssue({code:'custom',path:['trendLabels'],message:'无效的 IP 报表标识'});
}
export const trafficRangeSchema=trafficRangeBase.superRefine(validateTrendSelection);
const rangeSchema=trafficRangeSchema;
const visitsSchema=trafficRangeBase.extend({page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(25),visitorType:z.enum(['new','returning','unknown']).optional(),referrer:z.string().max(253).optional(),city:z.string().max(200).optional(),entry:z.string().max(2048).optional(),visitorKey:z.string().max(256).optional(),ipPrefix:z.string().max(128).optional(),ipKey:z.string().regex(/^[a-f0-9]{24}$/).optional(),ipLabel:z.string().max(160).optional(),isp:z.string().max(128).optional(),keyword:z.string().max(128).optional(),browser:z.string().max(200).optional()}).superRefine(validateTrendSelection);
interface Site {timezone:string;privacy_mode:string;retention_days:number;config:Record<string,unknown>}
const iso=(value:Date|string|number)=>new Date(value).toISOString();
const unavailableVisitors=(status:string):VisitorCounts=>({new:null,returning:null,unknown:null,status});
function selectedRange(query:{from?:string;to?:string},now:number){const to=query.to||iso(now),from=query.from||iso(+new Date(to)-7*86400000);if(+new Date(to)<=+new Date(from)||+new Date(to)-+new Date(from)>366*86400000)throw Object.assign(new Error('请选择不超过 366 天的有效时间范围'),{statusCode:400});return {from,to,effectiveTo:iso(Math.min(now,+new Date(to)))};}
async function getSite(client:PoolClient,siteId:string):Promise<Site>{const site=(await client.query('SELECT timezone,privacy_mode,retention_days,config FROM sites WHERE id=$1',[siteId])).rows[0];if(!site)throw Object.assign(new Error('站点不存在'),{statusCode:404});return site;}
async function firstSeen(client:PoolClient,siteId:string,events:AnalyticsEvent[],privacy:boolean){
 const ids=privacy?[]:[...new Set(events.filter(e=>e.type==='pageview').map(e=>e.visitor_id))];if(!ids.length)return new Map<string,string>();
 const rows=(await client.query('SELECT visitor_id,first_date::text AS first_date FROM visitor_first_seen WHERE site_id=$1 AND visitor_id=ANY($2::text[]) AND NOT EXISTS(SELECT 1 FROM tombstones t WHERE t.site_id=visitor_first_seen.site_id AND t.visitor_id=visitor_first_seen.visitor_id)',[siteId,ids])).rows;
 return new Map<string,string>(rows.map(row=>[row.visitor_id,row.first_date]));
}
/** Raw-detail reports fail closed when exact event bodies have expired. Aggregate
 * facts remain available through queryStats; marginal counts cannot reconstruct visits. */
async function readDetail(ctx:AppContext,client:PoolClient,siteId:string,from:string,to:string,lookbackMs=0){
 if(+new Date(from)>=+new Date(to))return {events:[] as AnalyticsEvent[],coverage:0,status:'future_only',sessionContextComplete:false,storage:{}};
 const requestedStart=+new Date(from)-lookbackMs;
 const frontier=(await client.query('SELECT retired_before FROM analytics_raw_retirement_frontiers WHERE site_id=$1',[siteId])).rows[0]?.retired_before as Date|undefined;
 if(frontier&&+new Date(frontier)>+new Date(from))return {events:[] as AnalyticsEvent[],coverage:0,status:'raw_detail_retired',sessionContextComplete:false,storage:{retiredBefore:iso(frontier)}};
 const raw=await readSiteEvents(ctx.pool,siteId,{from:new Date(Math.max(requestedStart,frontier?+new Date(frontier):Number.NEGATIVE_INFINITY)),to:new Date(to),limit:100000,order:'asc',client,statsMirrorRead:true});
 const {events,...storage}=raw;
 const cutoff=raw.retentionBoundary?+new Date(raw.retentionBoundary):Number.NEGATIVE_INFINITY;
 const sessionContextComplete=requestedStart>=cutoff&&(!frontier||requestedStart>=+new Date(frontier));
 const contextOnly=raw.rangeStatus==='outside_raw_retention'&&+new Date(from)>=cutoff;
 const status=raw.truncated?'detail_limit_exceeded':+new Date(from)<cutoff?'outside_raw_retention':raw.coverage<1&&!contextOnly?'detail_unavailable':'complete';
 return {events:status==='complete'?events:[],coverage:status==='complete'?1:0,status,sessionContextComplete,storage};
}
function boundResponse<T>(value:T):T {if(Buffer.byteLength(JSON.stringify(value))>8*1024*1024)throw new ApplicationError('analytics_query_limit');return value;}
function liveUnavailable(asOf:string,status:string){return {from:iso(+new Date(asOf)-30*60000),to:asOf,active:{5:null,15:null,30:null},pageviews:[],pages:[],coverage:0,status,method:'pageview_or_heartbeat_distinct'};}
async function liveRead(ctx:AppContext,client:PoolClient,siteId:string,site:Site,asOf:string,filters:ContentFilters){const raw=await readDetail(ctx,client,siteId,iso(+new Date(asOf)-30*60000),asOf);return raw.coverage===1?buildLiveTraffic(raw.events,asOf,site.timezone,site.privacy_mode!=='standard',filters):liveUnavailable(asOf,raw.status);}
function modelMetadata(site:Site,from:string,to:string,detail:Awaited<ReturnType<typeof readDetail>>,filters:ContentFilters={}){const events=detail.events.filter(e=>e.type==='pageview'&&+new Date(e.ts)>=+new Date(from)&&+new Date(e.ts)<+new Date(to)&&eventMatchesFilters(e,filters)),ip=countIPIdentities(events,site.privacy_mode!=='standard'),knownProviders=events.filter(e=>e.dimensions.isp&&e.dimensions.isp!=='unknown').length;return {from,to,timezone:site.timezone,coverage:detail.coverage,status:detail.status,storage:detail.storage,sessionStatus:detail.sessionContextComplete?'complete':'partial_session_context',sessionMethod:'session_started_in_range_activity_clipped_to_range_end',ipStatus:detail.coverage===1?ip.ipStatus:detail.status,ipCoverage:detail.coverage===1?ip.ipCoverage:0,ipPrefixStatus:site.privacy_mode==='standard'?'anonymized_prefix_only':'unsupported_in_this_mode',providerStatus:detail.coverage!==1?detail.status:!events.length?'no_data':knownProviders===events.length?'complete':knownProviders?'partial':'not_collected',providerCoverage:detail.coverage!==1?0:events.length?knownProviders/events.length:1,uvStatus:site.privacy_mode!=='standard'&&dayOf(from,site.timezone)!==dayOf(new Date(Math.max(+new Date(from),+new Date(to)-1)),site.timezone)?'unsupported_in_this_mode':'supported'};}

export async function register51laReports(app:FastifyInstance,ctx:AppContext){
 app.get('/api/v1/sites/:siteId/traffic-report',async req=>{
  const {siteId}=req.params as {siteId:string};await ctx.authorize(req,siteId);const query=rangeSchema.parse(req.query),range=selectedRange(query,Date.now()),filters=contentFilterSchema.parse(query);
  const snapshot=await withStatsReadSnapshot(ctx,siteId,range.from,range.effectiveTo,async client=>{
   const site=await getSite(client,siteId),privacy=site.privacy_mode!=='standard',timeoutMs=sessionTimeoutMs(site.config);
   const detail=await readDetail(ctx,client,siteId,range.from,range.effectiveTo,timeoutMs);
   const seen=await firstSeen(client,siteId,detail.events,privacy);
   const {visits:_visits,...report}=buildTrafficReport(detail.events,{from:range.from,to:range.effectiveTo,timezone:site.timezone,privacy,timeoutMs,firstSeen:seen,filters,sessionContextComplete:detail.sessionContextComplete,...query.trendDimension?{trendDimensions:[query.trendDimension],trendLabel:query.trendLabel,trendLabels:query.trendLabels}:{}});
   return {...modelMetadata(site,range.from,range.effectiveTo,detail,filters),requestedTo:range.to,filters,...report,...(detail.coverage===1?{}:{totals:{pv:null,uv:null,ips:null,sessions:null,bounceRate:null,averageDuration:null},visitors:unavailableVisitors(detail.status),groups:{},days:[],hours:[],dimensionTrend:{channel:[],page:[],visitorType:[]},engagement:{depth:[],duration:[]}})};
  });return boundResponse({...snapshot.value,aggregationPending:snapshot.dirty});
 });
 app.get('/api/v1/sites/:siteId/visits',async req=>{
  const {siteId}=req.params as {siteId:string};await ctx.authorize(req,siteId);const query=visitsSchema.parse(req.query),now=Date.now(),range=selectedRange(query,now),filters=contentFilterSchema.parse(query),asOf=iso(now);
  const snapshot=await withStatsReadSnapshot(ctx,siteId,iso(Math.min(+new Date(range.from),now-30*60000)),asOf,async client=>{
   const site=await getSite(client,siteId),privacy=site.privacy_mode!=='standard',timeoutMs=sessionTimeoutMs(site.config),detail=await readDetail(ctx,client,siteId,range.from,range.effectiveTo,timeoutMs),seen=await firstSeen(client,siteId,detail.events,privacy);
   const model=buildTrafficReport(detail.events,{from:range.from,to:range.effectiveTo,timezone:site.timezone,privacy,timeoutMs,firstSeen:seen,filters,sessionContextComplete:detail.sessionContextComplete,...query.trendDimension?{trendDimensions:[query.trendDimension],trendLabel:query.trendLabel,trendLabels:query.trendLabels}:{}});
   const {visitorType,referrer,city,entry,visitorKey,ipPrefix,ipKey,ipLabel,isp,keyword,browser}=query;
   const rows=filterVisits(model.visits,{visitorType,referrer,city,entry,visitorKey,ipPrefix,ipKey,ipLabel,isp,keyword,browser});
   const complete=detail.coverage===1&&detail.sessionContextComplete;
   return {...modelMetadata(site,range.from,range.effectiveTo,detail,filters),requestedTo:range.to,rows:complete?rows.slice((query.page-1)*query.pageSize,query.page*query.pageSize):[],total:complete?rows.length:null,page:query.page,pageSize:query.pageSize,coverage:complete?1:0,status:complete?'complete':detail.coverage===1?'partial_session_context':detail.status,live:await liveRead(ctx,client,siteId,site,asOf,filters)};
  });return boundResponse({...snapshot.value,aggregationPending:snapshot.dirty});
 });
 app.get('/api/v1/sites/:siteId/overview-summary',async req=>{
  const {siteId}=req.params as {siteId:string};await ctx.authorize(req,siteId);const query=contentFilterSchema.extend({extended:z.enum(['0','1']).optional()}).parse(req.query),filters=contentFilterSchema.parse(query),now=Date.now(),asOf=iso(now);
  // Covers 14 site-calendar days, today's elapsed time and the maximum 24-hour
  // session lookback, before the site's time zone has been read in this snapshot.
  const snapshot=await withStatsReadSnapshot(ctx,siteId,iso(now-17*86400000),asOf,async client=>{
   const site=await getSite(client,siteId),privacy=site.privacy_mode!=='standard',timeoutMs=sessionTimeoutMs(site.config);
   // Use the same civil-day and ambiguous-clock policy for the summary and
   // training data. A SQL midnight cast may choose the second repeated midnight.
   const calendar=forecastCalendar(asOf,site.timezone);
   const {dayStart:todayStart,historyStart,yesterdayStart,yesterdayCutoff:yesterdaySame}=calendar;
   // Each period has its own coverage: expired or busy yesterday must not hide
   // today's complete visitor data. Reuse yesterday only when it is complete.
   const todayRaw=await readDetail(ctx,client,siteId,todayStart,asOf);
   const yesterdayRaw=await readDetail(ctx,client,siteId,yesterdayStart,todayStart);
   const sameTimeRaw=yesterdayRaw.coverage===1||yesterdaySame===todayStart||yesterdaySame===yesterdayStart?yesterdayRaw:await readDetail(ctx,client,siteId,yesterdayStart,yesterdaySame);
   const seen=await firstSeen(client,siteId,[...todayRaw.events,...yesterdayRaw.events,...(sameTimeRaw===yesterdayRaw?[]:sameTimeRaw.events)],privacy);
   const period=async(from:string,to:string,raw:Awaited<ReturnType<typeof readDetail>>)=>{
    if(from===to)return {from,to,totals:{pv:0,uv:0,ips:privacy?null:0,sessions:0,bounceRate:0,averageDuration:0},coverage:1,rangeStatus:'complete',visitors:privacy?unavailableVisitors('unsupported_in_this_mode'):{new:0,returning:0,unknown:0,status:'complete'}};
    const stats=await queryStats(ctx,siteId,from,to,filters,{client});
    const ip=raw.coverage===1?countIPIdentities(raw.events.filter(e=>e.type==='pageview'&&+new Date(e.ts)>=+new Date(from)&&+new Date(e.ts)<+new Date(to)&&eventMatchesFilters(e,filters)),privacy):{ips:null,ipCoverage:0,ipStatus:raw.status};
    return {from,to,totals:{...stats.totals,ips:ip.ips},ipCoverage:ip.ipCoverage,ipStatus:ip.ipStatus,coverage:stats.coverage,rangeStatus:stats.rangeStatus,uvStatus:stats.uvStatus,watermark:stats.watermark,visitors:raw.coverage===1?visitorCounts(raw.events.filter(e=>eventMatchesFilters(e,filters)),{from,to,timezone:site.timezone,privacy,firstSeen:seen}):unavailableVisitors(raw.status)};
   };
   const today=await period(todayStart,asOf,todayRaw),yesterday=await period(yesterdayStart,todayStart,yesterdayRaw),yesterdaySameTime=await period(yesterdayStart,yesterdaySame,sameTimeRaw);
   const historyRaw=await readDetail(ctx,client,siteId,historyStart,todayStart,timeoutMs);
   const history=buildForecastHistory(historyRaw.events,{...calendar,historyFrom:historyStart,historyCoverage:historyRaw.coverage,privacy,sessionContextComplete:historyRaw.sessionContextComplete,timeoutMs,filters});
   const forecast={...buildTrafficForecast({...calendar,today,history:history.history,yesterday,yesterdaySameTime}),historyCoverage:historyRaw.coverage,historyStatus:historyRaw.status};
   const metadata=modelMetadata(site,todayStart,asOf,todayRaw,filters);
   const live=await liveRead(ctx,client,siteId,site,asOf,filters);
   const extended=query.extended==='1'?await query51laHistory(ctx,client,siteId,asOf,site,filters):undefined;
   return {asOf,timezone:site.timezone,filters,today,yesterday,yesterdaySameTime,live,active15:{from:iso(now-15*60000),to:asOf,visitors:live.active[15],pageviews:live.coverage===1?live.pageviews.slice(15).reduce((a,b)=>a+b,0):null,coverage:live.coverage,status:live.active[15]===null&&live.coverage===1?'unsupported_in_this_mode':live.status,method:live.method},forecast,ipStatus:metadata.ipStatus,ipCoverage:metadata.ipCoverage,providerStatus:metadata.providerStatus,providerCoverage:metadata.providerCoverage,...(extended?{extended}:{})};
  });
  const value=snapshot.value;if(snapshot.dirty){for(const period of [value.today,value.yesterday,value.yesterdaySameTime])period.coverage=0;value.forecast={...value.forecast,...buildTrafficForecast({asOf:value.asOf,timezone:value.timezone,dayStart:value.forecast.dayStart,dayEnd:value.forecast.dayEnd,today:value.today}),status:'aggregation_pending'};if(value.extended){value.extended.thisMonth.coverage=0;value.extended.total.coverage=0;value.extended.peaks.coverage=0;value.extended.total.status='aggregation_pending';value.extended.peaks.status='aggregation_pending';}}return boundResponse({...value,aggregationPending:snapshot.dirty});
 });
}
