import {factReadRelations} from './fact-read-context.js';
import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import {dayOf,heartbeatSegment,heartbeatVisible,type AnalyticsEvent,type GoalDefinition,type FunnelDefinition} from './analytics.js';
import {canonical} from './security.js';
import {readSessionCarry,stageSessionCarry,stageCarryKey,type CarryCheckpoint,type CarryState} from './session-carry.js';

export interface PrefixOptions {siteId:string;runId:string;visitorId:string;timezone:string;privacyMode:'standard'|'daily_salt';timeoutMs:number;goals:GoalDefinition[];funnels:FunnelDefinition[];ignorePublishedSeed?:boolean}
export function prefixDefinitionsHash(options:Pick<PrefixOptions,'goals'|'funnels'|'timezone'|'timeoutMs'|'privacyMode'>){return createHash('sha256').update(canonical(options)).digest('hex');}
function sessionId(key:string){const h=createHash('sha256').update(key).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;}
export interface PrefixEffect {event:AnalyticsEvent;sessionId:string;kind:'pageview'|'heartbeat'|'completion'|'goal'|'funnel';key:string;value:number}

/** Single visitor, globally event-time ordered source. All cardinality-bearing state lives in SQL keys.
 * The caller stages this run and owns its source snapshot; publishing is a separate fresh fenced transaction.
 * This reducer does not yet replace the production facts reducer or its contribution ownership queries.
 */
export async function reduceSessionPrefix(client:PoolClient,options:PrefixOptions,events:AsyncIterable<AnalyticsEvent>,onEffect?:(effect:PrefixEffect)=>Promise<void>,onClosed?:(checkpoint:CarryCheckpoint)=>Promise<void>){
 if(options.goals.length+options.funnels.length>1000||!Number.isFinite(options.timeoutMs)||options.timeoutMs<=0)throw Error('CARRY_DEFINITION_BUDGET');
 const hash=prefixDefinitionsHash({goals:options.goals,funnels:options.funnels,timezone:options.timezone,timeoutMs:options.timeoutMs,privacyMode:options.privacyMode});
 let current:CarryCheckpoint|null=null,loaded=false,priorOrder:string|undefined,processed=0;
 const once=async(kind:'page'|'heartbeat'|'goal',key:string,e:AnalyticsEvent,state:Record<string,string|number|boolean|null>)=>{
  const result=await client.query('INSERT INTO analytics_carry_keys VALUES($1,$2,$3,$4,$5,$6,$7,$7) ON CONFLICT DO NOTHING RETURNING key',[options.runId,options.visitorId,current!.sessionId,kind,key,state,e.ts]);return Boolean(result.rowCount);
 };
 const effect=async(e:AnalyticsEvent,kind:PrefixEffect['kind'],key:string,value:number)=>{await onEffect?.({event:e,sessionId:current!.sessionId,kind,key,value});};
 for await(const e of events){
  if(e.site_id!==options.siteId||e.visitor_id!==options.visitorId)throw Error('CARRY_SOURCE_SCOPE');
  const ts=new Date(e.ts).toISOString(),order=`${ts}/${e.event_id}`,localDay=dayOf(ts,options.timezone);
  if(priorOrder&&order<priorOrder)throw Error('CARRY_SOURCE_ORDER');priorOrder=order;
  if(!loaded){loaded=true;const seed=options.ignorePublishedSeed?null:await readSessionCarry(client,options.siteId,options.visitorId,options.privacyMode,localDay,hash);if(seed?.status==='unavailable'&&!(seed.privacyMode==='daily_salt'&&seed.localDay!==localDay&&seed.definitionsHash===hash))throw Error('CARRY_PREFIX_UNAVAILABLE');if(seed?.status==='valid'){const {runId,...checkpoint}=seed;current=checkpoint;await stageSessionCarry(client,options.siteId,options.runId,current);await client.query(`INSERT INTO analytics_carry_keys SELECT $1,visitor_id,session_id,kind,key,state,first_ts,last_ts FROM ${factReadRelations(client).carryKeysRelation??'analytics_carry_keys'} WHERE run_id=$2 AND visitor_id=$3 ON CONFLICT DO NOTHING`,[options.runId,runId,options.visitorId]);}}
  if(current&&order<=`${current.through}/${current.lastEventId}`)continue;
  if(!current||+new Date(ts)-+new Date(current.state.lastActive)>options.timeoutMs||(options.privacyMode==='daily_salt'&&current.localDay!==localDay)){
   if(current)await onClosed?.(structuredClone(current));
   const state:CarryState={startedAt:ts,lastActive:ts,anchorPageId:e.page_id,entryPath:'',exitPath:'',pageviews:0,visibleMs:0,entryDimensions:{},hasPage:false};
   current={visitorId:options.visitorId,sessionId:sessionId(`${options.siteId}:${options.visitorId+(options.privacyMode==='daily_salt'?localDay:'')}:${e.event_id}`),anchorEventId:e.event_id,through:ts,lastEventId:e.event_id,privacyMode:options.privacyMode,localDay,definitionsHash:hash,state,status:'valid'};
  }
  const state=current.state;state.lastActive=ts;current.through=ts;current.lastEventId=e.event_id;current.localDay=localDay;
  await stageSessionCarry(client,options.siteId,options.runId,current);
  if(e.type==='pageview'){
   if(!state.hasPage){state.hasPage=true;state.entryPath=e.path;state.entryDimensions=e.dimensions;state.firstPageAt=ts;state.firstPageId=e.event_id;state.firstPageInstance=e.page_id;}
   state.exitPath=e.path;state.exitDimensions=e.dimensions;state.lastPageAt=ts;state.lastPageId=e.event_id;state.lastPageInstance=e.page_id;state.previousPath=e.path;state.pageviews++;
   if(e.dimensions.channel&&e.dimensions.channel!=='direct'&&e.dimensions.channel!=='unknown')state.lastNonDirect={channel:e.dimensions.channel,path:e.path};
   await stageCarryKey(client,options.runId,options.visitorId,{kind:'page',key:e.page_id,state:{path:e.path},first:ts,last:ts});await effect(e,'pageview',e.path,1);
  }
  if(e.type==='heartbeat'&&await once('heartbeat',JSON.stringify([e.page_id,heartbeatSegment(e)]),e,{visibleMs:heartbeatVisible(e),eventId:e.event_id,ts,pageId:e.page_id,path:e.path,dimensions:canonical(e.dimensions)})){const visible=heartbeatVisible(e);state.visibleMs+=visible;await effect(e,'heartbeat',e.path,visible);}
  if((e.type==='scroll'||e.payload.event_name==='scroll')&&Number((e.payload.props as Record<string,unknown>)?.depth)===100&&await once('page',`completion:${e.page_id}`,e,{}))await effect(e,'completion',e.path,1);
  for(const goal of options.goals){const matched=goal.type==='duration'?(+new Date(ts)-+new Date(state.startedAt))/1000>=Number(goal.config.seconds):goal.type==='page'?e.type==='pageview'&&e.path===goal.config.path:e.type==='event'&&e.payload.event_name===goal.config.event_name;if(matched&&await once('goal',goal.id,e,{eventId:e.event_id,ts,eventPath:e.path,pageId:e.page_id,dimensions:canonical(e.dimensions),channel:state.lastNonDirect?.channel??state.entryDimensions.channel??'direct',path:state.previousPath??e.path}))await effect(e,'goal',goal.id,1);}
  if(e.type==='pageview'||e.type==='event')for(const definition of options.funnels){
   const prior=(await client.query("SELECT state FROM analytics_carry_keys WHERE run_id=$1 AND visitor_id=$2 AND kind='funnel' AND key=$3",[options.runId,options.visitorId,definition.id])).rows[0]?.state??{at:0,broken:false};const at=Number(prior.at),step=definition.steps[at];if(prior.broken||!step)continue;
   const matches=step.type==='page'?e.type==='pageview'&&e.path===step.value:e.type==='event'&&e.payload.event_name===step.value;
   const next={at:at+Number(matches),broken:!matches&&definition.strict&&at>0};await stageCarryKey(client,options.runId,options.visitorId,{kind:'funnel',key:definition.id,state:next,first:ts,last:ts});if(matches)await effect(e,'funnel',`${definition.id}:${at}`,1);
  }
  await stageSessionCarry(client,options.siteId,options.runId,current);processed++;
 }
 return {checkpoint:current,processed};
}
