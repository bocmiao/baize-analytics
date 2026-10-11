import {it,expect,vi} from 'vitest';
import type {PoolClient} from 'pg';
import {insertRemainingFactMembers,type RemainingFactMember} from '../../src/server/remaining-fact-members.js';
it('rejects >100 before any PG dispatch and treats empty batch as no operation',async()=>{const query=vi.fn();const c={query} as unknown as PoolClient;await expect(insertRemainingFactMembers(c,Array.from({length:101},()=>({}) as RemainingFactMember))).rejects.toMatchObject({code:'REMAINING_FACT_MEMBER_SCOPE'});await insertRemainingFactMembers(c,[]);expect(query).not.toHaveBeenCalled();});
it('rejects an unexpected affected count without reporting successful publication',async()=>{const query=vi.fn().mockResolvedValue({rowCount:0});await expect(insertRemainingFactMembers({query} as unknown as PoolClient,[{} as RemainingFactMember])).rejects.toMatchObject({code:'REMAINING_FACT_MEMBER_COUNT'});expect(query).toHaveBeenCalledTimes(1);});
