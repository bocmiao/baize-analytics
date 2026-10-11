import type {PerformanceSink,PerformanceStage,PerformanceOperation,PerformanceAdapter,PerformanceChPhase,PerformanceObservation} from '../../src/server/performance-observation.js';
export const serverStages=['pool_acquire','partition_lock','site_lock','ch_transport','authentication','temp_fill','aggregate_sql','json_serialize','manifest_sql','worker_facts_wall','publication_readback_wall','session_build_wall','remaining_ownership_wall','remaining_members_wall','remaining_complete_wall','incremental_session_reuse','coverage_witness_wall','page_path_lookup'] as const;
export function discoverLiteralPerformanceStages(source:string){return serverStages.filter(stage=>new RegExp(`measurePerformanceStage\\(\\s*['"]${stage}['"]`).test(source));}
const adapters=['canonical','facts','session_headers','remaining','cache','mirror','other'] as const;
const operations=['http_request','background_worker','database_migration','operator'] as const;
const chPhases=['input_read','publication_insert','publication_readback','other'] as const;
const countFields=['rows','batches','bytes','requests','requestBodyBytes','responseBodyBytes','queryTextBytes','dirtyVisitors','reusedSessions','reusedOwnerHeads','rebuiltSessions','producedEffectRows','hydratedEffectRows','lookupInputRows','lookupReturnedRows','inputEvents','fullPlans','deltaPlans','fallbackPlans'] as const;
type CountField=typeof countFields[number];
type Counts=Record<CountField,number>&Record<`${CountField}MeasuredCalls`,number>;
type Aggregate=Counts&{operation:PerformanceOperation;stage:PerformanceStage;calls:number;failed:number;totalMs:number;maxMs:number;histogram:number[]};
const incrementalFallbacks=['not_strict','feature_disabled','missing_baseline','source_fence','non_event_change','configuration_change','no_queued_visitors','unknown_visitor','session_rebuild_request','missing_retained_boundary','retirement_boundary_crossed','incomplete_session_owners','unowned_topology_component','archived_dirty_owner'] as const;
const bounds=[1,5,10,50,100,500,1000,5000,Infinity];
const add=(a:number,b:number)=>Math.min(Number.MAX_SAFE_INTEGER,a+b);
const createCounts=()=>Object.fromEntries(countFields.flatMap(field=>[[field,0],[`${field}MeasuredCalls`,0]])) as Counts;
const summarize=<T extends Aggregate>(entry:T)=>({...entry,...Object.fromEntries(countFields.map(field=>[field,entry[`${field}MeasuredCalls`]?entry[field]:null])),histogram:[...entry.histogram],upperBoundsMs:bounds.map(value=>Number.isFinite(value)?value:null)});
export function createServerPhaseMetrics(instrumentedStages:ReadonlySet<PerformanceStage>){
 const metrics=new Map<string,Aggregate>();
 const fallbackCounts=new Map<string,number>();
 const adapterMetrics=new Map<string,Aggregate&{adapter:PerformanceAdapter}>();
 const chPhaseMetrics=new Map<string,Aggregate&{adapter:PerformanceAdapter;chPhase:PerformanceChPhase}>();
 const scopes=new Map<PerformanceOperation,Set<string>>();const truncatedScopes=new Set<PerformanceOperation>();const samples:{operation:PerformanceOperation;stage:PerformanceStage;durationMs:number;result:string}[]=[];let invalidObservations=0,samplesTruncated=false;
 const update=(entry:Aggregate,observation:Readonly<PerformanceObservation>)=>{entry.calls=add(entry.calls,1);entry.failed=add(entry.failed,Number(observation.result==='failure'));entry.totalMs=add(entry.totalMs,observation.durationMs);entry.maxMs=Math.max(entry.maxMs,observation.durationMs);const bucket=bounds.findIndex(value=>observation.durationMs<=value);entry.histogram[bucket]=add(entry.histogram[bucket]!,1);for(const field of countFields){const value=observation[field];if(value!==undefined){entry[field]=add(entry[field],value);entry[`${field}MeasuredCalls`]=add(entry[`${field}MeasuredCalls`],1);}}};
 const create=(observation:Readonly<PerformanceObservation>):Aggregate=>({...createCounts(),operation:observation.operation,stage:observation.stage,calls:0,failed:0,totalMs:0,maxMs:0,histogram:bounds.map(()=>0)});
 const sink:PerformanceSink=observation=>{try{
  if(!operations.includes(observation.operation)||!serverStages.includes(observation.stage)||!Number.isFinite(observation.durationMs)||observation.durationMs<0||!['success','failure'].includes(observation.result)||typeof observation.correlationId!=='string'||!/^[-a-f0-9]{36}$/i.test(observation.correlationId))throw Error('INVALID_OBSERVATION');
  const fallback=observation.incrementalFallback;
  if(fallback!==undefined&&(observation.stage!=='incremental_session_reuse'||!incrementalFallbacks.some(code=>code===fallback)))throw Error('INVALID_INCREMENTAL_FALLBACK');
  if(observation.adapter!==undefined&&!adapters.includes(observation.adapter))throw Error('INVALID_ADAPTER');
  if(observation.chPhase!==undefined&&(observation.stage!=='ch_transport'||!chPhases.includes(observation.chPhase)))throw Error('INVALID_CH_PHASE');
  if((observation.lookupInputRows!==undefined||observation.lookupReturnedRows!==undefined)&&observation.stage!=='page_path_lookup')throw Error('INVALID_LOOKUP_SCOPE');
  for(const field of countFields){const value=observation[field];if(value!==undefined&&(!Number.isSafeInteger(value)||value<0))throw Error('INVALID_COUNT');}
  if(fallback!==undefined)fallbackCounts.set(fallback,add(fallbackCounts.get(fallback)??0,1));
  const known=scopes.get(observation.operation)??new Set<string>();if(known.size<1024)known.add(observation.correlationId);else if(!known.has(observation.correlationId))truncatedScopes.add(observation.operation);scopes.set(observation.operation,known);
  const key=observation.operation+':'+observation.stage;const entry=metrics.get(key)??create(observation);update(entry,observation);metrics.set(key,entry);
  const adapter=observation.adapter??'other';const adapterKey=adapter+':'+key;const byAdapter=adapterMetrics.get(adapterKey)??{...create(observation),adapter};update(byAdapter,observation);adapterMetrics.set(adapterKey,byAdapter);
  if(observation.stage==='ch_transport'){const chPhase=observation.chPhase??'other',phaseKey=adapter+':'+observation.operation+':'+chPhase;const byPhase=chPhaseMetrics.get(phaseKey)??{...create(observation),adapter,chPhase};update(byPhase,observation);chPhaseMetrics.set(phaseKey,byPhase);}
  if(samples.length<256)samples.push({operation:entry.operation,stage:entry.stage,durationMs:observation.durationMs,result:observation.result});else samplesTruncated=true;
 }catch{invalidObservations=add(invalidObservations,1);}};
 return {sink,snapshot(){return {
  incrementalFallbackReasons:incrementalFallbacks.map(reason=>({reason,plans:fallbackCounts.get(reason)??0})),incrementalFallbackMeaning:'fixed allowlisted reason counters, cumulative observed reason events (feature_disabled/not_strict are full-plan reasons, not actual fallbacks); not unique people or IDs; arbitrary text rejected',
  adapterAggregates:[...adapterMetrics.values()].map(summarize),adapterAggregationBound:adapters.length*operations.length*serverStages.length,
  adapterMeaning:'fixed store label; other includes unlabelled observations; original operation/stage aggregate remains unchanged',
  chPhaseAggregates:[...chPhaseMetrics.values()].map(summarize),chPhaseAggregationBound:adapters.length*operations.length*chPhases.length,
  chPhaseMeaning:'disjoint classification of the SAME ch_transport leaf events; never add phase view to adapter/stage view. calls=timed attempts; requests=actual fetch dispatches only when instrumented; null means unmeasured',
  pagePathLookupMeaning:'page_path_lookup is the actual path-lookup SQL leaf elapsed duration nested in session_build_wall; calls count queries, lookupInputRows/lookupReturnedRows count cumulative inputs/returned rows including repeats, not unique events. Never sum this leaf with inclusive build wall.',
  incrementalCountMeaning:'dirtyVisitors/reusedSessions/reusedOwnerHeads/rebuiltSessions/producedEffectRows/hydratedEffectRows/inputEvents are cumulative observed counts across plan invocations, including repeat work; not distinct people or unique effects. fullPlans/deltaPlans/fallbackPlans are emitted numeric plan indicators; unmeasured counts remain null. Only separately allowlisted fallback reason codes are emitted, never arbitrary text or identity',
  byteMeaning:'requestBodyBytes=UTF8 POST body; responseBodyBytes=actual body chunks read, including partial failure; queryTextBytes=UTF8 SQL only, not parameters. Excludes URLs, headers, compression, TLS and network wire overhead. bytes retains historical adapter-specific definition; do not sum it with new byte fields',
  stageStatus:serverStages.map(stage=>({stage,status:[...metrics.values()].some(value=>value.stage===stage)?'observed':instrumentedStages.has(stage)?'instrumented_no_event':'not_instrumented'})),
  aggregates:[...metrics.values()].map(summarize),scopes:operations.map(operation=>({operation,uniqueObservedScopes:scopes.get(operation)?.size??0,countStatus:truncatedScopes.has(operation)?'lower_bound_capped_1024':'exact_observed',scopeMeaning:'one ALS invocation with at least one stage event; not all requests/worker ticks'})),
  samples:samples.map(sample=>({...sample})),samplesTruncated,invalidObservations,
  timing:'totalMs is cumulative inclusive call duration across invocations; maxMs is maximum individual call. worker_facts_wall is each rebuild invocation elapsed time, includes PG/CH/authentication/waits. publication_readback_wall includes its leaf transfer plus parsing/hash/checksum verification, excludes following live fence; do not add it to leaf transport. session_build_wall covers buildSessionFacts reduction; remaining_ownership_wall covers original ownership/provenance loops, remaining_members_wall covers publication receipt/member PG inserts, remaining_complete_wall covers completeKind checks. These are inclusive elapsed timings, not query-only CPU. No child sums, overlapping requests or views establish CPU or elapsed proportions',
  synchronousSink:true,identityRetention:'bounded correlation set in memory only; no correlation IDs emitted'
 };}};
}
