import {factReadRelations} from './fact-read-context.js';
import type {PoolClient} from 'pg';
import {readSessionCarry,streamCarryKeys,type CarryCheckpoint} from './session-carry.js';
import {prefixDefinitionsHash,type PrefixOptions} from './session-prefix-reducer.js';
import type {AnalyticsEvent} from './analytics.js';

export interface PrefixGoalTarget {event:AnalyticsEvent;channel?:string;path?:string}
export interface SessionPrefixSeed {checkpoint:CarryCheckpoint;runId:string;firstPage?:AnalyticsEvent;lastPage?:AnalyticsEvent;goals:Map<string,PrefixGoalTarget>;funnels:{at:number;broken:boolean}[]}

/** Load only bounded definition summaries. Page/heartbeat/order cardinality remains SQL-resident. */
export async function loadSessionPrefixSeed(client:PoolClient,options:PrefixOptions,first:AnalyticsEvent,localDay:string):Promise<SessionPrefixSeed|null>{
 const hash=prefixDefinitionsHash({goals:options.goals,funnels:options.funnels,timezone:options.timezone,timeoutMs:options.timeoutMs,privacyMode:options.privacyMode});
 const seed=await readSessionCarry(client,options.siteId,options.visitorId,options.privacyMode,localDay,hash,options.runId);
 if(!seed)return null;
 // A proven event-time timeout starts an independent session even when an older
 // irreducible prefix was invalidated by deletion or configuration changes.
 if(+new Date(first.ts)-+new Date(seed.state.lastActive)>options.timeoutMs)return null;
 if(seed.status==='unavailable'){
  if(seed.privacyMode==='daily_salt'&&seed.localDay!==localDay&&seed.definitionsHash===hash)return null;
  throw Error('CARRY_PREFIX_UNAVAILABLE');
 }
 if(+new Date(first.ts)<=+new Date(seed.through))throw Error('CARRY_SOURCE_BOUNDARY_OVERLAP');
 const goals=new Map<string,PrefixGoalTarget>(),funnels=options.funnels.map(()=>({at:0,broken:false}));
 const goalIds=new Set(options.goals.map(g=>g.id)),funnelIndex=new Map(options.funnels.map((f,i)=>[f.id,i]));
 for await(const chunk of streamCarryKeys(client,seed.runId,options.visitorId))for(const key of chunk){
  if(key.kind==='goal'&&goalIds.has(key.key)){
   const state=key.state;if(typeof state.eventId!=='string'||typeof state.ts!=='string'||typeof state.eventPath!=='string'||typeof state.dimensions!=='string')throw Error('CARRY_GOAL_TARGET_INCOMPLETE');
   const event:AnalyticsEvent={...first,event_id:state.eventId,ts:state.ts,path:state.eventPath,page_id:String(state.pageId),payload:{},dimensions:JSON.parse(state.dimensions) as Record<string,string>};
   goals.set(key.key,{event,channel:String(state.channel),path:String(state.path)});
  }
  if(key.kind==='funnel'){const index=funnelIndex.get(key.key);if(index!==undefined)funnels[index]={at:Number(key.state.at),broken:key.state.broken===true};}
 }
 const checkpoint:CarryCheckpoint=seed;
 if(seed.state.hasPage&&(!seed.state.firstPageAt||!seed.state.firstPageId||!seed.state.lastPageAt||!seed.state.lastPageId))throw Error('CARRY_PAGE_TARGET_INCOMPLETE');
 const firstPage=seed.state.hasPage?{...first,event_id:seed.state.firstPageId!,ts:seed.state.firstPageAt!,type:'pageview',page_id:seed.state.firstPageInstance!,path:seed.state.entryPath,dimensions:seed.state.entryDimensions,payload:{}}:undefined;
 const lastPage=seed.state.hasPage?{...first,event_id:seed.state.lastPageId!,ts:seed.state.lastPageAt!,type:'pageview',page_id:seed.state.lastPageInstance!,path:seed.state.exitPath,dimensions:seed.state.exitDimensions??seed.state.entryDimensions}:undefined;
 return {checkpoint,runId:seed.runId,firstPage,lastPage,goals,funnels};
}

/** The target table name must be generated internally, never supplied by an HTTP request. */
export async function seedExactSessionKeys(client:PoolClient,targetTable:string,newSessionId:string,seed:SessionPrefixSeed){
 if(!/^[a-z_][a-z0-9_]*$/.test(targetTable))throw Error('CARRY_TEMP_IDENTIFIER');
 await client.query(`INSERT INTO ${targetTable}(session_id,kind,key) SELECT $1::uuid,CASE WHEN kind='heartbeat' THEN 'heartbeat' ELSE 'completion' END,CASE WHEN kind='heartbeat' THEN key ELSE substring(key from 12) END FROM ${factReadRelations(client).carryKeysRelation??'analytics_carry_keys'} WHERE run_id=$2 AND visitor_id=$3 AND (kind='heartbeat' OR (kind='page' AND key LIKE 'completion:%')) ON CONFLICT DO NOTHING`,[newSessionId,seed.runId,seed.checkpoint.visitorId]);
}

/** A previously page-less component may acquire a page after the cutoff. Its received heartbeat
 * contributions were intentionally removed by the old orphan reducer; recover their exact provenance
 * from SQL keys once it becomes a real session, rather than inventing duration or dropping visibility.
 */
export async function restorePrefixOrphanVisibility(client:PoolClient,seed:SessionPrefixSeed,template:AnalyticsEvent,emit:(event:AnalyticsEvent,metric:string,key:string[],value:number)=>Promise<void>){
 if(seed.checkpoint.state.hasPage)return;
 for await(const chunk of streamCarryKeys(client,seed.runId,seed.checkpoint.visitorId))for(const key of chunk){if(key.kind!=='heartbeat')continue;const state=key.state;
  if(typeof state.eventId!=='string'||typeof state.ts!=='string'||typeof state.path!=='string'||typeof state.dimensions!=='string'||typeof state.visibleMs!=='number')throw Error('CARRY_HEARTBEAT_TARGET_INCOMPLETE');
  const event:AnalyticsEvent={...template,event_id:state.eventId,ts:state.ts,page_id:String(state.pageId),path:state.path,type:'heartbeat',payload:{},dimensions:JSON.parse(state.dimensions) as Record<string,string>};
  await emit(event,'visible_ms',[],state.visibleMs);await emit(event,'page',[event.path,'visible_ms'],state.visibleMs);
 }
}
