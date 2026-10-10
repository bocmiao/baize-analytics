import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';
export type PerformanceOperation='http_request'|'background_worker'|'database_migration'|'operator';
export type PerformanceStage='pool_acquire'|'partition_lock'|'site_lock'|'ch_transport'|'authentication'|'temp_fill'|'aggregate_sql'|'json_serialize'|'manifest_sql';
export type PerformanceAdapter='canonical'|'facts'|'session_headers'|'remaining'|'cache'|'mirror'|'other';
const adapters=new Set(['canonical','facts','session_headers','remaining','cache','mirror','other']);
export interface PerformanceCounts {adapter?:PerformanceAdapter;rows?:number;batches?:number;bytes?:number}
export interface PerformanceObservation extends PerformanceCounts {operation:PerformanceOperation;stage:PerformanceStage;correlationId:string;durationMs:number;result:'success'|'failure'}
export type PerformanceSink=(observation:Readonly<PerformanceObservation>)=>void|Promise<void>;
const context=new AsyncLocalStorage<{operation:PerformanceOperation;sink:PerformanceSink;correlationId:string}>();
const operations=new Set(['http_request','background_worker','database_migration','operator']);
const stages=new Set(['pool_acquire','partition_lock','site_lock','ch_transport','authentication','temp_fill','aggregate_sql','json_serialize','manifest_sql']);
/** No identifier from the request or database is accepted as correlation metadata. */
export function withPerformanceObservation<T>(operation:PerformanceOperation,sink:PerformanceSink|undefined,fn:()=>T):T {
  if(!sink||!operations.has(operation))return fn();
  return context.run({operation,sink,correlationId:randomUUID()},fn);
}
/** Timed callback preserves the original result/error; observers never decide business success. */
export async function measurePerformanceStage<T>(stage:PerformanceStage,fn:()=>T|Promise<T>,counts?:PerformanceCounts):Promise<T>{
  const active=context.getStore();if(!active||!stages.has(stage))return await fn();
  const started=performance.now();let result:'success'|'failure'='failure';
  try{const value=await fn();result='success';return value;}
  finally{
    const safe:PerformanceCounts={};for(const key of ['rows','batches','bytes'] as const){const value=counts?.[key];if(Number.isSafeInteger(value)&&value!>=0)safe[key]=value;}
    if(counts?.adapter&&adapters.has(counts.adapter))safe.adapter=counts.adapter;
    const observation=Object.freeze({operation:active.operation,stage,correlationId:active.correlationId,durationMs:Math.max(0,performance.now()-started),result,...safe});
    try{const emitted=active.sink(observation);if(emitted&&typeof emitted.then==='function')void emitted.catch(()=>{});}catch{/* Diagnostic sinks cannot change business behavior. */}
  }
}
