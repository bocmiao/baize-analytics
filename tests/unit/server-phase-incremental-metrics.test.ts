import {describe,it,expect} from 'vitest';
import {createServerPhaseMetrics} from '../../scripts/benchmark/server-phase-metrics';
import type {PerformanceObservation} from '../../src/server/performance-observation';
describe('bounded incremental plan counters',()=>{
 it('accumulates repeated work and preserves unmeasured fields',()=>{
  const metrics=createServerPhaseMetrics(new Set());
  const event={operation:'background_worker',stage:'incremental_session_reuse',correlationId:'00000000-0000-0000-0000-000000000001',durationMs:3,result:'success',dirtyVisitors:2,reusedSessions:8,reusedOwnerHeads:9,rebuiltSessions:2,producedEffectRows:4,hydratedEffectRows:12,inputEvents:20,fullPlans:0,deltaPlans:1,fallbackPlans:0} as PerformanceObservation;
  metrics.sink(event);metrics.sink(event);
  const report=metrics.snapshot(),aggregate=report.aggregates[0]!;
  expect(report.invalidObservations).toBe(0);expect(aggregate.dirtyVisitors).toBe(4);expect(aggregate.reusedSessions).toBe(16);expect(aggregate.reusedOwnerHeads).toBe(18);expect(aggregate.producedEffectRows).toBe(8);expect(aggregate.hydratedEffectRows).toBe(24);expect(aggregate.deltaPlans).toBe(2);expect(aggregate.fullPlans).toBe(0);expect(aggregate.inputEventsMeasuredCalls).toBe(2);expect(aggregate.requests).toBeNull();expect(report.incrementalCountMeaning).toContain('not distinct');
 });
 it('rejects negative counters without adding observations',()=>{
  const metrics=createServerPhaseMetrics(new Set());
  metrics.sink({operation:'background_worker',stage:'incremental_session_reuse',correlationId:'00000000-0000-0000-0000-000000000001',durationMs:1,result:'success',dirtyVisitors:-1} as PerformanceObservation);
  expect(metrics.snapshot().invalidObservations).toBe(1);expect(metrics.snapshot().aggregates).toHaveLength(0);
 });
 it('counts only fixed fallback codes and rejects arbitrary strings',()=>{
  const metrics=createServerPhaseMetrics(new Set());
  const base={operation:'background_worker',stage:'incremental_session_reuse',correlationId:'00000000-0000-0000-0000-000000000001',durationMs:1,result:'success'};
  metrics.sink({...base,incrementalFallback:'missing_baseline',fallbackPlans:1} as PerformanceObservation);
  metrics.sink({...base,incrementalFallback:'archived_dirty_owner',fallbackPlans:1} as PerformanceObservation);
  metrics.sink({...base,incrementalFallback:'visitor-private-value'} as PerformanceObservation);
  const report=metrics.snapshot();expect(report.incrementalFallbackReasons.find(row=>row.reason==='missing_baseline')?.plans).toBe(1);expect(report.incrementalFallbackReasons.find(row=>row.reason==='archived_dirty_owner')?.plans).toBe(1);expect(report.incrementalFallbackReasons).toHaveLength(14);expect(report.invalidObservations).toBe(1);expect(JSON.stringify(report)).not.toContain('visitor-private-value');
 });

});
