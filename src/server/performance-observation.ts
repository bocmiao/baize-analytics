import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';
export type PerformanceOperation='http_request'|'background_worker'|'database_migration'|'operator';
export type PerformanceStage='pool_acquire'|'partition_lock'|'site_lock'|'ch_transport'|'authentication'|'temp_fill'|'aggregate_sql'|'json_serialize'|'manifest_sql'|'worker_facts_wall'|'publication_readback_wall'|'session_build_wall'|'remaining_ownership_wall'|'remaining_members_wall'|'remaining_complete_wall'|'incremental_session_reuse'|'coverage_witness_wall';
export type PerformanceChPhase='input_read'|'publication_insert'|'publication_readback'|'other';
export type PerformanceAdapter='canonical'|'facts'|'session_headers'|'remaining'|'cache'|'mirror'|'other';
const adapters=new Set(['canonical','facts','session_headers','remaining','cache','mirror','other']);
export interface PerformanceCounts {dirtyVisitors?:number;reusedSessions?:number;reusedOwnerHeads?:number;rebuiltSessions?:number;producedEffectRows?:number;hydratedEffectRows?:number;inputEvents?:number;fullPlans?:number;deltaPlans?:number;fallbackPlans?:number;incrementalFallback?:string;adapter?:PerformanceAdapter;chPhase?:PerformanceChPhase;rows?:number;batches?:number;bytes?:number;requests?:number;requestBodyBytes?:number;responseBodyBytes?:number;queryTextBytes?:number}
export interface PerformanceObservation extends PerformanceCounts {operation:PerformanceOperation;stage:PerformanceStage;correlationId:string;durationMs:number;result:'success'|'failure'}
export type PerformanceSink=(observation:Readonly<PerformanceObservation>)=>void|Promise<void>;
const context=new AsyncLocalStorage<{operation:PerformanceOperation;sink:PerformanceSink;correlationId:string;chPhase?:PerformanceChPhase}>();
export function hasPerformanceObservation(){return Boolean(context.getStore());}
const operations=new Set(['http_request','background_worker','database_migration','operator']);
const stages=new Set(['pool_acquire','partition_lock','site_lock','ch_transport','authentication','temp_fill','aggregate_sql','json_serialize','manifest_sql','worker_facts_wall','publication_readback_wall','session_build_wall','remaining_ownership_wall','remaining_members_wall','remaining_complete_wall','incremental_session_reuse','coverage_witness_wall']);
const chPhases=new Set(['input_read','publication_insert','publication_readback','other']);
const incrementalFallbacks=new Set(['not_strict','feature_disabled','missing_baseline','source_fence','non_event_change','configuration_change','no_queued_visitors','unknown_visitor','session_rebuild_request','missing_retained_boundary','retirement_boundary_crossed','incomplete_session_owners','unowned_topology_component','archived_dirty_owner']);
/** No identifier from the request or database is accepted as correlation metadata. */
export function withPerformanceObservation<T>(operation:PerformanceOperation,sink:PerformanceSink|undefined,fn:()=>T):T {
  if(!sink||!operations.has(operation))return fn();
  return context.run({operation,sink,correlationId:randomUUID()},fn);
}
/** Classifies the existing leaf transport event, never emits another timer. */
export function withPerformanceChPhase<T>(phase:PerformanceChPhase,fn:()=>T):T {
  const active=context.getStore();if(!active||!chPhases.has(phase))return fn();
  return context.run({...active,chPhase:phase},fn);
}
/** Timed callback preserves the original result/error; observers never decide business success. */
export async function measurePerformanceStage<T>(stage:PerformanceStage,fn:()=>T|Promise<T>,counts?:PerformanceCounts):Promise<T>{
  const active=context.getStore();if(!active||!stages.has(stage))return await fn();
  const started=performance.now();let result:'success'|'failure'='failure';
  try{const value=await fn();result='success';return value;}
  finally{
    const safe:PerformanceCounts={};for(const key of ['rows','batches','bytes','requests','requestBodyBytes','responseBodyBytes','queryTextBytes','dirtyVisitors','reusedSessions','reusedOwnerHeads','rebuiltSessions','producedEffectRows','hydratedEffectRows','inputEvents','fullPlans','deltaPlans','fallbackPlans'] as const){const value=counts?.[key];if(Number.isSafeInteger(value)&&value!>=0)safe[key]=value;}
    if(counts?.adapter&&adapters.has(counts.adapter))safe.adapter=counts.adapter;
    if(stage==='incremental_session_reuse'&&counts?.incrementalFallback&&incrementalFallbacks.has(counts.incrementalFallback))safe.incrementalFallback=counts.incrementalFallback;
    if(stage==='ch_transport')safe.chPhase=counts?.chPhase&&chPhases.has(counts.chPhase)?counts.chPhase:active.chPhase??'other';
    const observation=Object.freeze({operation:active.operation,stage,correlationId:active.correlationId,durationMs:Math.max(0,performance.now()-started),result,...safe});
    try{const emitted=active.sink(observation);if(emitted&&typeof emitted.then==='function')void emitted.catch(()=>{});}catch{/* Diagnostic sinks cannot change business behavior. */}
  }
}
