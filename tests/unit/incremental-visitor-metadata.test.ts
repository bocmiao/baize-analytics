import {expect,it,vi} from 'vitest';
import type {PoolClient} from 'pg';
import {purgeIncrementalVisitorMetadata} from '../../src/server/identity.js';
it('old schemas and empty scopes do not issue a DELETE',async()=>{
 const query=vi.fn().mockResolvedValue({rows:[{relation:null}],rowCount:0});const client={query} as unknown as PoolClient;
 expect(await purgeIncrementalVisitorMetadata(client,'site',[])).toBe(0);expect(query).not.toHaveBeenCalled();
 expect(await purgeIncrementalVisitorMetadata(client,'site',['A'])).toBe(0);expect(query).toHaveBeenCalledTimes(1);
});
it('removes only deduplicated positive scope rows through the authorised site run',async()=>{
 const query=vi.fn().mockResolvedValueOnce({rows:[{relation:'analytics_incremental_run_visitors'}]}).mockResolvedValueOnce({rowCount:2});
 expect(await purgeIncrementalVisitorMetadata({query} as unknown as PoolClient,'site',['A','A'])).toBe(2);
 const [sql,args]=query.mock.calls[1]!;expect(sql).toContain('r.id=v.run_id AND r.site_id=$1');expect(sql).toContain('v.visitor_id=ANY($2::text[])');expect(args).toEqual(['site',['A']]);expect(sql).not.toMatch(/DELETE FROM analytics_(?:fact_runs|session_contribution_heads|carry_heads)/);
});
