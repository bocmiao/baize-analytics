import {it,expect} from 'vitest';
import {measurePerformanceStage,withPerformanceObservation,type PerformanceCounts,type PerformanceObservation} from '../../src/server/performance-observation.js';
import {createServerPhaseMetrics,discoverLiteralPerformanceStages} from '../../scripts/benchmark/server-phase-metrics.js';

it('collects coverage witness elapsed stage once without leaking identifiers or adding it to transport views',async()=>{
 const stages=new Set(discoverLiteralPerformanceStages("measurePerformanceStage('coverage_witness_wall',fn)"));expect(stages.has('coverage_witness_wall')).toBe(true);
 const metrics=createServerPhaseMetrics(stages),observations:PerformanceObservation[]=[];
 const sensitive={adapter:'facts',rows:3,siteId:'private-site',visitorId:'private-person',sql:'SELECT private_data',token:'private-token'} as PerformanceCounts;
 const value=await withPerformanceObservation('background_worker',row=>{observations.push(row);metrics.sink(row);},()=>measurePerformanceStage('coverage_witness_wall',()=>42,sensitive));
 expect(value).toBe(42);expect(observations).toHaveLength(1);expect(observations[0]).toMatchObject({stage:'coverage_witness_wall',operation:'background_worker',rows:3,result:'success'});
 for(const text of ['private-site','private-person','SELECT private_data','private-token'])expect(JSON.stringify(observations)).not.toContain(text);
 const snapshot=metrics.snapshot();expect(snapshot.invalidObservations).toBe(0);expect(snapshot.stageStatus.find(row=>row.stage==='coverage_witness_wall')?.status).toBe('observed');expect(snapshot.aggregates).toHaveLength(1);expect(snapshot.aggregates[0]?.calls).toBe(1);expect(snapshot.chPhaseAggregates).toHaveLength(0);
 expect(JSON.stringify(snapshot)).not.toContain(observations[0]!.correlationId);expect(snapshot.timing).toContain('No child sums');
});
