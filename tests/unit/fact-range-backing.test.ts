import {it,expect,vi,beforeEach} from 'vitest';
import type {Pool,PoolClient} from 'pg';
const mocks=vi.hoisted(()=>({closure:vi.fn(),hydrate:vi.fn()}));
vi.mock('../../src/server/fact-run-closure.js',()=>({assertFactRunClosure:mocks.closure}));
vi.mock('../../src/server/remaining-fact-source.js',()=>({withRemainingFactReadSource:mocks.hydrate}));
import {assertCurrentFactRangeBacking} from '../../src/server/fact-range-backing.js';
import {bindFactReadRelations} from '../../src/server/fact-read-context.js';
const from='2026-10-10T00:00:00Z',to='2026-10-11T00:00:00Z',pool={} as Pool;
function client(){return {query:vi.fn().mockResolvedValueOnce({rows:[{id:'published-run',retained_from:from,generation:'9',watermark:to}]}).mockResolvedValue({rowCount:0,rows:[]})} as unknown as PoolClient;}
beforeEach(()=>{vi.resetAllMocks();mocks.hydrate.mockImplementation(async(_c,_p,_s,read)=>read());});
it.each(['complete','selected'] as const)('proof inherits bound %s without consuming or upgrading projection',async(hydration)=>{
 const c=client(),restore=bindFactReadRelations(c,{effectsRelation:'authenticated_effects',vitalsRelation:'authenticated_vitals',hydration});
 try{const proof=await assertCurrentFactRangeBacking(c,pool,'site',from,to);expect(proof).toMatchObject({covered:true,runId:'published-run',generation:'9',method:'complete_retained_accepted_snapshot'});expect(mocks.closure).toHaveBeenCalledWith(c,'site');expect(mocks.hydrate).toHaveBeenCalledWith(c,pool,'site',expect.any(Function),{hydration});}finally{restore();}
});
it('unbound proof still requires complete authentication and propagates body failure',async()=>{const c=client();mocks.hydrate.mockRejectedValue(Error('FACT_STORE_BODY_UNAVAILABLE'));await expect(assertCurrentFactRangeBacking(c,pool,'site',from,to)).rejects.toThrow('FACT_STORE_BODY_UNAVAILABLE');expect(mocks.hydrate).toHaveBeenCalledWith(c,pool,'site',expect.any(Function),{hydration:'complete'});});
it('missing range proof cannot be rescued by selected projection',async()=>{const c={query:vi.fn().mockResolvedValue({rows:[]})} as unknown as PoolClient;await expect(assertCurrentFactRangeBacking(c,pool,'site',from,to)).rejects.toThrow('FACT_RANGE_BACKING_UNAVAILABLE');expect(mocks.hydrate).not.toHaveBeenCalled();});
