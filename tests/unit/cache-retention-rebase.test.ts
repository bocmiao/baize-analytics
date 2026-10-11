import {it,expect,vi} from 'vitest';
import type {PoolClient} from 'pg';
import {rebaseCacheAfterRawRetention} from '../../src/server/cache-retention-rebase.js';
const old={canonicalEpoch:'00000000-0000-4000-8000-000000000001',aggregationEpoch:'00000000-0000-4000-8000-000000000002',deletionEpoch:'7'};
it('only rebases complete exact live-fence owners and leaves immutable source columns untouched',async()=>{
 const query=vi.fn().mockResolvedValueOnce({rows:[{present:'analytics_cache_owners'}]}).mockResolvedValueOnce({rowCount:2});
 expect(await rebaseCacheAfterRawRetention({query} as unknown as PoolClient,'site',old,'8')).toBe(2);
 const [sql,params]=query.mock.calls[1]!;expect(params).toEqual(['site',old.canonicalEpoch,'7',old.aggregationEpoch,'8']);
 expect(sql).toContain("o.state='complete'");expect(sql).toContain('o.live_deletion_epoch=$3');expect(sql).toContain('o.live_canonical_epoch=$2');expect(sql).toContain('o.aggregation_epoch=$4');expect(sql).toContain('x.deletion_epoch=$5');
 expect(sql.split('FROM')[0]).toBe('UPDATE analytics_cache_owners o SET live_deletion_epoch=$5::bigint\n ');
});
it('does not touch pre-cache schema',async()=>{const query=vi.fn().mockResolvedValue({rows:[{present:null}]});expect(await rebaseCacheAfterRawRetention({query} as unknown as PoolClient,'site',old,'8')).toBe(0);expect(query).toHaveBeenCalledTimes(1);});
it('rejects skipped or unchanged deletion epochs before any SQL',async()=>{const query=vi.fn();for(const next of ['7','9','bad'])await expect(rebaseCacheAfterRawRetention({query} as unknown as PoolClient,'site',old,next)).rejects.toThrow('CACHE_RETENTION_REBASE_FENCE');expect(query).not.toHaveBeenCalled();});
