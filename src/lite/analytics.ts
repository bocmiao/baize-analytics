import {aggregate,dayOf,mergeBuckets,sessionize,sessionTimeoutMs,singleCurrencyAmount,quantile,type GoalDefinition} from '../server/analytics-core.js';
import type {LiteSnapshot} from './types.js';
// Shared schema/matcher are added to analytics-core; no SQL adapter is imported here.
import {contentFilterSchema,eventMatchesFilters,goalDefinitionSchema,type ContentFilters} from '../server/analytics-core.js';
export const liteGoalSchema=goalDefinitionSchema;
/** A complete bounded raw snapshot; retained history is never silently sampled. */
export function computeLiteStats(snapshot:LiteSnapshot,from:string,to:string,filters:ContentFilters={},now=Date.now()) {
 const begin=+new Date(from),requestedEnd=+new Date(to);
 if(!Number.isFinite(begin)||!Number.isFinite(requestedEnd)||requestedEnd<=begin)throw Object.assign(new Error('invalid_range'),{statusCode:400});
 const parsed=contentFilterSchema.parse(filters),hasFilters=Object.values(parsed).some(v=>v!==undefined);
 if(snapshot.events.length>100000||Buffer.byteLength(JSON.stringify(snapshot))>32*1024*1024)throw Object.assign(new Error('analytics_query_limit'),{statusCode:413});
 const retired=Number(snapshot.site.config.lite_retention_cutoff);
 const cutoff=Math.max(now-snapshot.site.retention_days*86400000,Number.isFinite(retired)&&retired<=now?retired:-Infinity),end=Math.min(now,requestedEnd),futureOnly=begin>=now;
 const goals=snapshot.goals.map(goal=>({...liteGoalSchema.parse({...goal,name:goal.name??goal.id}),id:String(goal.id)})) as GoalDefinition[];
 const raw=snapshot.events.filter(e=>e.site_id===snapshot.site.id&&+new Date(e.ts)>=cutoff&&+new Date(e.ts)<=now);
 const unique=[...new Map(raw.map(e=>[e.event_id,e])).values()].sort((a,b)=>+new Date(a.ts)-+new Date(b.ts)||a.event_id.localeCompare(b.event_id));
 const timeout=sessionTimeoutMs(snapshot.site.config);
 // Retirement can remove a session's first page and attribution. Only an observed
 // inactivity gap (or the entire timeout after cutoff) proves a fresh context.
 const contexts=new Map<string,{last:number;uncertain:boolean}>();let uncertainSessionScope=false;
 for(const event of unique){const ts=+new Date(event.ts),key=event.visitor_id+(snapshot.site.privacy_mode==='daily_salt'?dayOf(event.ts,snapshot.site.timezone):'');const prior=contexts.get(key);const uncertain=prior&&ts-prior.last<=timeout?prior.uncertain:!prior&&ts<cutoff+timeout;contexts.set(key,{last:ts,uncertain});if(uncertain&&ts>=begin&&ts<end&&eventMatchesFilters(event,parsed))uncertainSessionScope=true;}
 const sessions=sessionize(unique,snapshot.site.timezone,snapshot.site.privacy_mode!=='standard',sessionTimeoutMs(snapshot.site.config));
 const bucketMap=futureOnly?new Map():aggregate(unique,sessions,e=>{const ts=+new Date(e.ts);return ts>=begin&&ts<end&&eventMatchesFilters(e,parsed)?String(Math.floor(ts/3600000)*3600000):'excluded';},goals);
 const selected=[...bucketMap].filter(([key])=>key!=='excluded').map(([hour,data])=>({hour:Number(hour),data}));
 const unavailableHours:string[]=[];
 if(!futureOnly&&begin<cutoff){
  if(hasFilters)unavailableHours.push('filtered_raw_history_outside_retention');
  else {
   for(const archived of snapshot.archivedBuckets??[]){if(archived.hour+3600000<=cutoff&&archived.hour>=begin&&archived.hour+3600000<=end)selected.push(archived);}
   // Missing history cannot be distinguished from zero without a coverage witness.
   unavailableHours.push('historical_raw_window_unavailable');
  }
 }
 selected.sort((a,b)=>a.hour-b.hour);const b=mergeBuckets(selected.map(row=>row.data));const dailyTrendBins=end-begin>2*86400000;const trendBins=dailyTrendBins?(()=>{const byDay=new Map<string,Parameters<typeof mergeBuckets>[0]>();for(const row of selected){const day=dayOf(new Date(row.hour),snapshot.site.timezone);const list=byDay.get(day);if(list)list.push(row.data);else byDay.set(day,[row.data]);}return [...byDay.entries()].sort((x,y)=>x[0]<y[0]?-1:1).map(([day,rows])=>({time:`${day}T00:00:00Z`,merged:mergeBuckets(rows)}));})():selected.map(r=>({time:new Date(r.hour).toISOString(),merged:r.data}));
 const dailyUVUnsupported=!futureOnly&&snapshot.site.privacy_mode==='daily_salt'&&dayOf(from,snapshot.site.timezone)!==dayOf(new Date(end-1),snapshot.site.timezone);
 const revenueCurrencyStatus=b.legacyCurrencyUnsupported?'unsupported_legacy_currency':'supported';const revenueCurrencyCoverage=b.legacyCurrencyUnsupported?'partial':'complete';
 const result={sessionMetricsStatus:'supported',from,to,requestedFrom:from,requestedTo:to,effectiveFrom:futureOnly?new Date(end).toISOString():from,effectiveTo:new Date(end).toISOString(),futureClamped:requestedEnd>now,rangeStatus:futureOnly?'future_only':unavailableHours.length?'partial_unavailable':requestedEnd>now?'future_clamped':'complete',coverage:futureOnly||unavailableHours.length?0:1,unavailableHours,retentionBoundary:new Date(cutoff).toISOString(),precision:'exact',distinctMethod:'exact_set',uvStatus:dailyUVUnsupported?'unsupported_in_this_mode':'supported',watermark:unique.length?new Date(Math.max(...unique.map(e=>+new Date(e.ts)))).toISOString():null,generation:snapshot.generation,epoch:snapshot.epoch,storage:{rollups:'sqlite',rawReads:[]},revenueCurrencyStatus,revenueCurrencyCoverage,limitations:['Visible duration uses received foreground heartbeat intervals only.',...(unavailableHours.length?['Historical raw events needed for exact reconstruction are unavailable.']:[])],
totals:{pv:b.pv,uv:dailyUVUnsupported?null:b.visitors.length,sessions:b.sessions,bounceRate:b.sessions?b.bounces/b.sessions:0,averageDuration:b.sessions?b.duration_s/b.sessions:0,visibleSeconds:b.visible_ms/1000,revenueCurrencyStatus,revenueCurrencyCoverage,revenue:b.legacyCurrencyUnsupported?null:singleCurrencyAmount(b.revenueByCurrency),revenueByCurrency:b.revenueByCurrency,conversions:Object.values(b.goals).reduce((n,count)=>n+count,0)},trend:trendBins.map(({time,merged:m})=>({time,pv:m.pv,uv:m.visitors.length,sessions:m.sessions,revenueByCurrency:m.revenueByCurrency||{},revenueAttribution:m.revenueAttribution||{}})),pages:Object.entries(b.pages).map(([path,p])=>({path,...p,uv:dailyUVUnsupported?null:p.visitors.length,averageDuration:p.pv?p.visible_ms/p.pv/1000:0,bounceRate:p.entries?p.bounces/p.entries:0,completionRate:p.pv?p.completed/p.pv:0,visitors:undefined})),revenueAttributionRows:Object.entries(b.revenueAttribution).map(([key,item])=>({...JSON.parse(key),...item})),goalAttributionRows:Object.entries(b.goalAttribution).map(([key,conversions])=>({...JSON.parse(key),conversions})),sources:Object.entries(b.sources).map(([channel,pv])=>({channel,pv})),audience:b.audience,dimensionRows:Object.entries(b.segments).map(([key,v])=>({dimensions:JSON.parse(key),pv:v.pv,uv:dailyUVUnsupported?null:v.visitors.length,revenueCurrencyStatus:v.legacyCurrencyUnsupported?'unsupported_legacy_currency':'supported',revenue:v.legacyCurrencyUnsupported?null:singleCurrencyAmount(v.revenueByCurrency),revenueByCurrency:v.revenueByCurrency,sessions:v.sessions,conversions:Object.values(v.goals).reduce((a,n)=>a+n,0),goals:v.goals})),events:Object.entries(b.events).map(([name,e])=>({name,count:e.count,uv:dailyUVUnsupported?null:e.visitors.length,properties:e.properties})),vitals:Object.entries(b.vitals).map(([key,d])=>{const[path,metric]=(JSON.parse(key) as string[]);return {path,metric,quantileMethod:'weighted_centroid_type7',quantileStatus:'approximate_tdigest_centroid_means',p75:quantile([d],.75),p90:quantile([d],.9),sampleCount:d.reduce((n,c)=>n+c.n,0)};}),paths:Object.entries(b.paths).map(([key,count])=>{const[source,target]=(JSON.parse(key) as string[]);return {source,target,count};}).sort((a,b)=>b.count-a.count).slice(0,20),goals:b.goals,funnelStatus:dailyUVUnsupported?'unsupported_in_this_mode':'supported',funnels:Object.fromEntries(Object.entries(dailyUVUnsupported?{}:b.funnels).map(([id,steps])=>[id,steps.map(v=>v.length)])),cohorts:{status:'unsupported_in_lite'},retention:[],capabilities:{funnels:false}};
 if(!uncertainSessionScope)return result;
 return {...result,sessionMetricsStatus:'unavailable_retention_prefix',limitations:[...result.limitations,'Retired session prefixes prevent exact session starts, bounce/duration, goal completion and attribution in this scope.'],
  totals:{...result.totals,sessions:null,bounceRate:null,averageDuration:null,visibleSeconds:null,conversions:null},
  trend:result.trend.map(row=>({...row,sessions:null})),
  pages:result.pages.map(row=>({...row,entries:null,exits:null,bounces:null,completed:null,averageDuration:null,bounceRate:null,completionRate:null,visible_ms:null})),
  dimensionRows:result.dimensionRows.map(row=>({...row,sessions:null,conversions:null,goals:Object.fromEntries(Object.keys(row.goals).map(id=>[id,null]))})),
  goals:Object.fromEntries(Object.keys(result.goals).map(id=>[id,null])),goalAttributionRows:[],revenueAttributionRows:[],paths:[],funnels:{},funnelStatus:'unavailable_retention_prefix',attributionStatus:'unavailable_retention_prefix',pathStatus:'unavailable_retention_prefix'};
}

