import {beforeEach,it,expect,vi} from 'vitest';
import type {Pool,PoolClient} from 'pg';
const mocks=vi.hoisted(()=>({ordinary:vi.fn(),witness:vi.fn(),closure:vi.fn(),hydrate:vi.fn()}));
vi.mock('../../src/server/fact-range-backing.js',()=>({assertCurrentFactRangeBacking:mocks.ordinary}));
vi.mock('../../src/server/fact-coverage-witness.js',()=>({verifyFactCoverageWitness:mocks.witness}));
vi.mock('../../src/server/fact-run-closure.js',()=>({assertFactRunClosure:mocks.closure}));
vi.mock('../../src/server/remaining-fact-source.js',()=>({withRemainingFactReadSource:mocks.hydrate}));
import {bindFactReadRelations} from '../../src/server/fact-read-context.js';
import {assertCacheSnapshotRangeBacking} from '../../src/server/cache-range-backing.js';
const c={} as PoolClient,pool={} as Pool,from='2026-10-10T00:00:00.000Z',to='2026-10-12T00:00:00.000Z';
beforeEach(()=>{vi.resetAllMocks();mocks.ordinary.mockRejectedValue(Error('FACT_RANGE_BACKING_UNAVAILABLE'));mocks.closure.mockResolvedValue(undefined);mocks.hydrate.mockImplementation(async(_c,_pool,_site,read)=>read());});
it('preserves ordinary retained coverage without needing a historical witness',async()=>{const result={covered:true,method:'complete_retained_accepted_snapshot'};mocks.ordinary.mockResolvedValue(result);expect(await assertCacheSnapshotRangeBacking(c,pool,'site',from,to)).toBe(result);expect(mocks.witness).not.toHaveBeenCalled();});
it('authenticates historical witness and all source bodies on the same client; future padding stays as-of',async()=>{
 const witness={covered:true,from,requestedTo:to,effectiveTo:'2026-10-11T10:00:00.000Z',observedAt:'2026-10-11T10:00:00.000Z',method:'authenticated_accepted_snapshot_witness'};mocks.witness.mockResolvedValue(witness);
 expect(await assertCacheSnapshotRangeBacking(c,pool,'site',from,to)).toBe(witness);
 expect(mocks.witness).toHaveBeenCalledWith(c,'site',{from,to,bucketSnapshot:true});expect(mocks.closure).toHaveBeenCalledWith(c,'site');expect(mocks.hydrate).toHaveBeenCalledWith(c,pool,'site',expect.any(Function),{hydration:'complete'});expect(witness.effectiveTo).not.toBe(to);
 expect(mocks.witness.mock.invocationCallOrder[0]).toBeLessThan(mocks.hydrate.mock.invocationCallOrder[0]!);
});
it.each(['FACT_COVERAGE_UNAVAILABLE','FACT_COVERAGE_RANGE_UNAVAILABLE','FACT_COVERAGE_SEAL_INVALID'])('missing or invalid history refuses rather than manufacturing empty coverage: %s',async(code)=>{mocks.witness.mockRejectedValue(Error(code));await expect(assertCacheSnapshotRangeBacking(c,pool,'site',from,to)).rejects.toThrow(code);expect(mocks.hydrate).not.toHaveBeenCalled();});
it.each(['FACT_RANGE_BACKING_SCOPE','CACHE_SEAL_INVALID','REMAINING_FACT_CH_UNAVAILABLE'])('never falls back on a non-coverage failure: %s',async(code)=>{mocks.ordinary.mockRejectedValue(Error(code));await expect(assertCacheSnapshotRangeBacking(c,pool,'site',from,to)).rejects.toThrow(code);expect(mocks.witness).not.toHaveBeenCalled();});
it('authenticated metadata does not replace missing or corrupt source-body validation',async()=>{mocks.witness.mockResolvedValue({covered:true});mocks.hydrate.mockRejectedValue(Error('FACT_BODY_UNAVAILABLE'));await expect(assertCacheSnapshotRangeBacking(c,pool,'site',from,to)).rejects.toThrow('FACT_BODY_UNAVAILABLE');});
it('broken selected closure refuses before any body result',async()=>{mocks.witness.mockResolvedValue({covered:true});mocks.closure.mockRejectedValue(Error('FACT_RUN_CLOSURE_UNAVAILABLE'));await expect(assertCacheSnapshotRangeBacking(c,pool,'site',from,to)).rejects.toThrow('FACT_RUN_CLOSURE_UNAVAILABLE');expect(mocks.hydrate).not.toHaveBeenCalled();});

it('inherits selected only from a bound authenticated context and restores complete default',async()=>{
 mocks.witness.mockResolvedValue({covered:true});
 const restore=bindFactReadRelations(c,{effectsRelation:'trusted_effects',vitalsRelation:'trusted_vitals',hydration:'selected'});
 try{await assertCacheSnapshotRangeBacking(c,pool,'site',from,to);expect(mocks.hydrate).toHaveBeenLastCalledWith(c,pool,'site',expect.any(Function),{hydration:'selected'});}finally{restore();}
 await assertCacheSnapshotRangeBacking(c,pool,'site',from,to);expect(mocks.hydrate).toHaveBeenLastCalledWith(c,pool,'site',expect.any(Function),{hydration:'complete'});
});
