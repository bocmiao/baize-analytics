import {it,expect} from 'vitest';
import {withPerformanceObservation,withPerformanceChPhase,measurePerformanceStage,type PerformanceObservation} from '../../src/server/performance-observation.js';
it('isolates concurrent scopes and nested operations without leaking arbitrary metadata',async()=>{const observations:PerformanceObservation[]=[];const sink=(row:PerformanceObservation)=>{observations.push(row);};let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});await Promise.all([withPerformanceObservation('http_request',sink,async()=>{await gate;await measurePerformanceStage('pool_acquire',()=>1,{rows:3,bytes:-1,batches:Infinity});await withPerformanceObservation('operator',sink,()=>measurePerformanceStage('site_lock',()=>2));await measurePerformanceStage('json_serialize',()=>3);}),withPerformanceObservation('background_worker',sink,async()=>{await measurePerformanceStage('temp_fill',()=>4);release();})]);const http=observations.filter(row=>row.operation==='http_request');expect(http).toHaveLength(2);expect(http[0]!.correlationId).toBe(http[1]!.correlationId);expect(new Set(observations.map(row=>row.correlationId)).size).toBe(3);expect(http[0]!.rows).toBe(3);expect(http[0]).not.toHaveProperty('bytes');expect(http[0]).not.toHaveProperty('batches');for(const row of observations){expect(row.durationMs).toBeGreaterThanOrEqual(0);expect(Object.isFrozen(row)).toBe(true);expect(Object.keys(row).every(key=>['operation','stage','correlationId','durationMs','result','rows'].includes(key))).toBe(true);}});
it('preserves exact callback result and thrown error and records only failure status',async()=>{const rows:PerformanceObservation[]=[];const error=new Error('private error must never enter observation');await expect(withPerformanceObservation('operator',row=>{rows.push(row);},()=>measurePerformanceStage('authentication',()=>{throw error;}))).rejects.toBe(error);expect(rows[0]!.result).toBe('failure');expect(JSON.stringify(rows)).not.toContain(error.message);const value={ok:true};expect(withPerformanceObservation('operator',undefined,()=>value)).toBe(value);expect(await measurePerformanceStage('aggregate_sql',()=>value)).toBe(value);});
it('does not let synchronous or asynchronous observer failures change business outcomes',async()=>{for(const sink of [()=>{throw Error('observer');},async()=>{throw Error('observer');}]){expect(await withPerformanceObservation('operator',sink,()=>measurePerformanceStage('ch_transport',()=>42))).toBe(42);const original=new Error('business');await expect(withPerformanceObservation('operator',sink,()=>measurePerformanceStage('ch_transport',()=>{throw original;}))).rejects.toBe(original);}await new Promise(resolve=>setTimeout(resolve,0));});

it('classifies each transport once and restores concurrent/nested phase scopes',async()=>{
 const observations:PerformanceObservation[]=[];const sink=(row:PerformanceObservation)=>{observations.push(row);};
 await withPerformanceObservation('background_worker',sink,async()=>{await Promise.all([
  withPerformanceChPhase('input_read',async()=>{await new Promise(resolve=>setTimeout(resolve,5));await measurePerformanceStage('ch_transport',()=>1,{requests:1,requestBodyBytes:0,responseBodyBytes:9});}),
  withPerformanceChPhase('publication_insert',async()=>{await measurePerformanceStage('ch_transport',()=>2);await withPerformanceChPhase('publication_readback',()=>measurePerformanceStage('ch_transport',()=>3));await measurePerformanceStage('ch_transport',()=>4);})
 ]);await measurePerformanceStage('ch_transport',()=>5);});
 expect(observations).toHaveLength(5);expect(observations.map(row=>row.chPhase)).toEqual(['publication_insert','publication_readback','publication_insert','input_read','other']);expect(new Set(observations.map(row=>row.correlationId)).size).toBe(1);
 expect(observations.find(row=>row.chPhase==='input_read')).toMatchObject({requests:1,requestBodyBytes:0,responseBodyBytes:9});
});

it('selected hydration captures finite post-callback counts without leaking supplied scopes',async()=>{
 const rows:PerformanceObservation[]=[];const counts={adapter:'facts' as const,authenticatedRows:100,selectedHydratedRows:0,siteId:'private-site',visitorId:'private-visitor'};
 await withPerformanceObservation('http_request',row=>{rows.push(row);},()=>measurePerformanceStage('temp_fill',()=>{counts.selectedHydratedRows=7;return true;},counts));
 expect(rows[0]).toMatchObject({stage:'temp_fill',authenticatedRows:100,selectedHydratedRows:7});expect(JSON.stringify(rows)).not.toContain('private');
 await withPerformanceObservation('http_request',row=>{rows.push(row);},()=>measurePerformanceStage('temp_fill',()=>true,{authenticatedRows:-1,selectedHydratedRows:Infinity}));
 expect(rows[1]).not.toHaveProperty('authenticatedRows');expect(rows[1]).not.toHaveProperty('selectedHydratedRows');
});

it('does not add selected hydration counters to authentication or unrelated adapters',async()=>{
 const rows:PerformanceObservation[]=[];for(const [stage,adapter]of [['authentication','facts'],['temp_fill','remaining']] as const)await withPerformanceObservation('operator',row=>{rows.push(row);},()=>measurePerformanceStage(stage,()=>true,{adapter,authenticatedRows:100,selectedHydratedRows:5}));for(const row of rows){expect(row).not.toHaveProperty('authenticatedRows');expect(row).not.toHaveProperty('selectedHydratedRows');}
});
