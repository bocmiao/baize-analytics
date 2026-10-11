import {it,expect,vi} from 'vitest';
import {withPerformanceObservation,getPerformanceScopeId,withPerformanceChPhase,measurePerformanceStage,type PerformanceObservation} from '../../src/server/performance-observation.js';
it('isolates concurrent scopes and nested operations without leaking arbitrary metadata',async()=>{const observations:PerformanceObservation[]=[];const sink=(row:PerformanceObservation)=>{observations.push(row);};let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});await Promise.all([withPerformanceObservation('http_request',sink,async()=>{await gate;await measurePerformanceStage('pool_acquire',()=>1,{rows:3,bytes:-1,batches:Infinity});await withPerformanceObservation('operator',sink,()=>measurePerformanceStage('site_lock',()=>2));await measurePerformanceStage('json_serialize',()=>3);}),withPerformanceObservation('background_worker',sink,async()=>{await measurePerformanceStage('temp_fill',()=>4);release();})]);const http=observations.filter(row=>row.operation==='http_request');expect(http).toHaveLength(2);expect(http[0]!.correlationId).toBe(http[1]!.correlationId);expect(new Set(observations.map(row=>row.correlationId)).size).toBe(3);expect(http[0]!.rows).toBe(3);expect(http[0]).not.toHaveProperty('bytes');expect(http[0]).not.toHaveProperty('batches');for(const row of observations){expect(row.durationMs).toBeGreaterThanOrEqual(0);expect(Object.isFrozen(row)).toBe(true);expect(Object.keys(row).every(key=>['operation','stage','correlationId','durationMs','startedAtMs','endedAtMs','result','rows'].includes(key))).toBe(true);}});
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

it('records finite monotonic boundaries around success and failure with a trusted route',async()=>{
 const rows:PerformanceObservation[]=[];const sink=(row:PerformanceObservation)=>{rows.push(row);};let scope:string|undefined;const before=performance.now();
 await withPerformanceObservation('http_request',sink,async()=>{scope=getPerformanceScopeId();await measurePerformanceStage('site_lock',async()=>{await new Promise(resolve=>setTimeout(resolve,2));});const error=new Error('business');await expect(measurePerformanceStage('authentication',()=>{throw error;})).rejects.toBe(error);},'stats');
 const after=performance.now();expect(scope).toMatch(/^[a-f0-9-]{36}$/);expect(getPerformanceScopeId()).toBeUndefined();expect(rows).toHaveLength(2);
 for(const row of rows){expect(row.route).toBe('stats');expect(row.correlationId).toBe(scope);expect(Number.isFinite(row.startedAtMs)&&Number.isFinite(row.endedAtMs)).toBe(true);expect(row.startedAtMs).toBeGreaterThanOrEqual(before);expect(row.endedAtMs).toBeGreaterThanOrEqual(row.startedAtMs);expect(row.endedAtMs).toBeLessThanOrEqual(after);expect(row.durationMs).toBe(row.endedAtMs-row.startedAtMs);}expect(rows[1]?.result).toBe('failure');
});
it('isolates route and random scope across parallel work and rejects arbitrary route labels',async()=>{
 const rows:PerformanceObservation[]=[];const sink=(row:PerformanceObservation)=>{rows.push(row);};const gate:Promise<void>=Promise.resolve();
 await Promise.all([withPerformanceObservation('http_request',sink,async()=>{await gate;await measurePerformanceStage('temp_fill',()=>1);},'collect'),withPerformanceObservation('http_request',sink,async()=>{await gate;await measurePerformanceStage('temp_fill',()=>2);},'stats')]);
 expect(rows.map(r=>r.route).sort()).toEqual(['collect','stats']);expect(new Set(rows.map(r=>r.correlationId)).size).toBe(2);
 await withPerformanceObservation('operator',sink,()=>measurePerformanceStage('site_lock',()=>3),'private/path' as never);expect(rows[2]).not.toHaveProperty('route');expect(JSON.stringify(rows)).not.toContain('private/path');
 expect(withPerformanceObservation('operator',undefined,()=>getPerformanceScopeId(),'collect')).toBeUndefined();
});

it('never emits non-finite or out-of-range diagnostic clock values',async()=>{
 const rows:PerformanceObservation[]=[];const clock=vi.spyOn(performance,'now').mockReturnValueOnce(Infinity).mockReturnValueOnce(Number.NaN);
 try{expect(await withPerformanceObservation('operator',row=>{rows.push(row);},()=>measurePerformanceStage('aggregate_sql',()=>42),'other')).toBe(42);expect(rows[0]).toMatchObject({startedAtMs:0,endedAtMs:0,durationMs:0});}finally{clock.mockRestore();}
});

it('observes shared site wait and authenticated snapshot hold as separate fixed stages',async()=>{
 const rows:PerformanceObservation[]=[];await withPerformanceObservation('http_request',row=>{rows.push(row);},async()=>{await measurePerformanceStage('site_shared_lock',()=>1);await measurePerformanceStage('stats_snapshot_hold',()=>2);},'stats');
 expect(rows.map(row=>row.stage)).toEqual(['site_shared_lock','stats_snapshot_hold']);expect(rows.every(row=>row.route==='stats')).toBe(true);expect(new Set(rows.map(row=>row.correlationId)).size).toBe(1);
});
