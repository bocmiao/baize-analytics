import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import type {AppContext} from './context.js';
import {dayOf,funnelVisitors,lastClick,sessionize,sessionTimeoutMs,type AnalyticsEvent,type FunnelDefinition,type Session} from './analytics.js';
import {readSiteEvents} from './event-store.js';
import {lockSite,transaction} from './db.js';
import {stableIdentityKey} from '../../packages/tracker/src/privacy.js';
export const FUNNEL_EVENT_LIMIT=100000;
const range=z.object({from:z.iso.datetime(),to:z.iso.datetime(),property:z.string().min(1).max(64).refine(key=>!stableIdentityKey(key),'身份属性不能作为流失维度').optional()});
const top=(values:Map<string,number>)=>[...values].map(([value,count])=>({value,count})).sort((a,b)=>b.count-a.count||a.value.localeCompare(b.value)).slice(0,10);
/** A visitor completing in any eligible session is never also counted as lost. */
export function funnelDropoff(sessions:Session[],funnel:FunnelDefinition,property?:string){
 const sets=funnelVisitors(sessions,funnel.steps,funnel.strict).map(visitors=>new Set(visitors));
 const ordered=[...sessions].sort((a,b)=>a.started_at.localeCompare(b.started_at)||a.id.localeCompare(b.id));
 const features=sets.map(()=>new Map<string,{source:string;device:string;property?:string;propertyType?:string}>());
 for(const session of ordered){
  // Use the production matcher for strict/loose progress, including multi-tab event-time order.
  const progress=funnelVisitors([session],funnel.steps,funnel.strict);
  let cursor=0;
  for(let index=0;index<funnel.steps.length;index++){
   if(!progress[index]?.length)break;const step=funnel.steps[index]!;
   const matched=session.events.findIndex((event,i)=>i>=cursor&&(step.type==='page'?event.type==='pageview'&&event.path===step.value:event.type==='event'&&event.payload.event_name===step.value));
   if(matched<0)break;cursor=matched+1;const event=session.events[matched]!;
   const props=event.payload.props as Record<string,unknown>|undefined;const value=property?props?.[property]:undefined;
   const safe=typeof value==='boolean'||typeof value==='number'||typeof value==='string'&&value.length<=128&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)?String(value):undefined;
   if(!features[index]!.has(session.visitor_id))features[index]!.set(session.visitor_id,{source:lastClick(session,event).channel,device:event.dimensions.device||session.dimensions.device||'unknown',property:safe,propertyType:safe===undefined?undefined:typeof value});
  }
 }
 return sets.map((visitors,index)=>{
  const next=sets[index+1];const lost=next?[...visitors].filter(visitor=>!next.has(visitor)):[];
  const sources=new Map<string,number>(),devices=new Map<string,number>(),properties=new Map<string,number>();let propertySamples=0;
  for(const visitor of lost){const feature=features[index]!.get(visitor)!;sources.set(feature.source,(sources.get(feature.source)||0)+1);devices.set(feature.device,(devices.get(feature.device)||0)+1);if(feature.property!==undefined){propertySamples++;const key=JSON.stringify([feature.propertyType,feature.property]);properties.set(key,(properties.get(key)||0)+1);}}
  return {step:index,definition:funnel.steps[index],entered:visitors.size,completed:next?.size??visitors.size,lost:lost.length,lossRate:next&&visitors.size?lost.length/visitors.size:0,sources:top(sources),devices:top(devices),...(property?{property,propertySamples,missingPropertySamples:lost.length-propertySamples,properties:top(properties).map(row=>{const [type,value]=JSON.parse(row.value) as [string,string];return {type,value,count:row.count};})}:{}),sampleRate:1};
 });
}
export async function queryFunnelAnalysis(ctx:AppContext,siteId:string,funnelId:string,from:string,to:string,property?:string){
 const now=Date.now(),start=+new Date(from),end=+new Date(to);if(end<=start||end-start>90*86400000||end>now)throw Object.assign(new Error('漏斗明细查询须在过去90天范围内且不得查询未来'),{statusCode:400});
 return transaction(ctx.pool,async client=>{
  await lockSite(client,siteId);
  const site=(await client.query('SELECT timezone,privacy_mode,retention_days,config FROM sites WHERE id=$1',[siteId])).rows[0];if(!site)throw Object.assign(new Error('站点不存在'),{statusCode:404});
  const funnel=(await client.query('SELECT * FROM funnels WHERE site_id=$1 AND id=$2',[siteId,funnelId])).rows[0] as FunnelDefinition|undefined;if(!funnel)throw Object.assign(new Error('漏斗不存在'),{statusCode:404});
  const state=(await client.query('SELECT watermark,generation,processed_generation FROM aggregation_state WHERE site_id=$1',[siteId])).rows[0];
  const base={from,to,funnelId,strict:funnel.strict,watermark:state?.watermark??null,eventLimit:FUNNEL_EVENT_LIMIT,dimensionLimit:10,sampleRate:1,steps:[] as ReturnType<typeof funnelDropoff>,truncated:false};
  if(site.privacy_mode!=='standard'&&dayOf(from,site.timezone)!==dayOf(new Date(end-1),site.timezone))return {...base,status:'unsupported_in_this_mode',coverage:0};
  const retentionCutoff=now-Number(site.retention_days)*86400000;const loadFrom=Math.max(retentionCutoff,now-90*86400000);
  if(start<loadFrom)return {...base,status:start<retentionCutoff?'outside_raw_retention':'outside_bounded_context',coverage:0};
  // Count only live non-bot events; shared site lock coordinates all intake/deletion races.
  const bounded=(await client.query('SELECT count(*)::int AS count FROM (SELECT 1 FROM events e WHERE e.site_id=$1 AND e.ts>=$2 AND e.ts<$3 AND NOT e.is_bot AND NOT EXISTS(SELECT 1 FROM tombstones t WHERE t.site_id=e.site_id AND t.visitor_id=e.visitor_id) AND NOT EXISTS(SELECT 1 FROM identity_tombstones t WHERE t.site_id=e.site_id AND t.visitor_id=e.visitor_id AND t.started_at<=e.ts AND t.ended_at>e.ts) LIMIT $4) bounded',[siteId,new Date(loadFrom),new Date(now),FUNNEL_EVENT_LIMIT+1])).rows[0].count;
  if(bounded>FUNNEL_EVENT_LIMIT)return {...base,status:'event_limit_exceeded',coverage:0,truncated:true,observedEventsAtLeast:bounded};
  const {events,...storage}=await readSiteEvents(ctx.pool,siteId,{from:new Date(loadFrom),to:new Date(now),client});
  const sessions=sessionize(events as AnalyticsEvent[],site.timezone,site.privacy_mode!=='standard',sessionTimeoutMs(site.config));
  const cohort=sessions.filter(session=>+new Date(session.started_at)>=start&&+new Date(session.started_at)<end);
  // The very first loaded session can be left-censored by the bounded context frontier.
  const censored=cohort.some(session=>+new Date(session.started_at)<loadFrom+sessionTimeoutMs(site.config));
  if(censored)return {...base,status:'partial_session_context',coverage:0,storage};
  return {...base,status:'supported',coverage:storage.coverage,storage,contextFrom:new Date(loadFrom).toISOString(),contextTo:new Date(now).toISOString(),observedEvents:events.length,steps:funnelDropoff(cohort,funnel,property),limitations:['访客级去重；每步流失为已到该步但从未到下一步的访客。维度归属首次到达该步的会话/事件。','仅使用最多90天完整明细上下文；超过事件上限不返回截断样本，Top维度最多10项。','会话入组按首个页面事件时间；后续步骤包含该会话保留的后续事件，不拼接不同会话。']};
 });
}
export async function registerFunnelAnalysis(app:FastifyInstance,ctx:AppContext){
 app.get('/api/v1/sites/:siteId/funnels/:funnelId/analysis',async req=>{const {siteId,funnelId}=req.params as {siteId:string;funnelId:string};await ctx.authorize(req,siteId);z.uuid().parse(funnelId);const q=range.parse(req.query);return queryFunnelAnalysis(ctx,siteId,funnelId,q.from,q.to,q.property);});
}
