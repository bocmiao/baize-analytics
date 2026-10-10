import {describe,it,expect,vi} from 'vitest';
import type {PoolClient} from 'pg';
import {insertRemainingOwnerBatch} from '../../src/server/remaining-owner-batch.js';
const relations={owners:'test_owners',carryOwners:'test_carry_owners'},run='00000000-0000-4000-8000-000000000001';
const rows=Array.from({length:100},()=>({sessionId:run,visitorId:'constructor',from:'2026-03-08T01:59:00Z',to:'2026-03-09T02:01:00Z'}));
const client=(query:ReturnType<typeof vi.fn>)=>({query}) as unknown as Pick<PoolClient,'query'>;
describe('bounded exact owner batch SQL',()=>{
 it('uses one session statement and preserves every row including duplicate-looking values',async()=>{const query=vi.fn().mockResolvedValue({rowCount:0});await insertRemainingOwnerBatch(client(query),relations,run,'sessions',rows);expect(query).toHaveBeenCalledTimes(1);expect(JSON.parse(query.mock.calls[0]![1][1])).toEqual(rows);expect(query.mock.calls[0]![0]).not.toContain('ON CONFLICT');});
 it('uses two checkpoint inserts and one exact key anti-join',async()=>{const query=vi.fn().mockResolvedValue({rowCount:0});await insertRemainingOwnerBatch(client(query),relations,run,'carry_checkpoints',rows);expect(query).toHaveBeenCalledTimes(2);query.mockClear();await insertRemainingOwnerBatch(client(query),relations,run,'carry_keys',rows);expect(query).toHaveBeenCalledTimes(1);expect(query.mock.calls[0]![0]).toContain('p.visitor_id=x."visitorId" AND p.session_id=x."sessionId"');});
 it('rejects any missing owner and propagates uniqueness errors',async()=>{const missing=vi.fn().mockResolvedValue({rowCount:1});await expect(insertRemainingOwnerBatch(client(missing),relations,run,'carry_keys',rows)).rejects.toThrow('REMAINING_CARRY_OWNER_MISSING');const duplicate=vi.fn().mockRejectedValue(Error('23505'));await expect(insertRemainingOwnerBatch(client(duplicate),relations,run,'sessions',rows)).rejects.toThrow('23505');});
 it('accepts zero and rejects 101 before SQL',async()=>{const query=vi.fn();await insertRemainingOwnerBatch(client(query),relations,run,'sessions',[]);await expect(insertRemainingOwnerBatch(client(query),relations,run,'sessions',[...rows,rows[0]!])).rejects.toThrow('REMAINING_FACT_BATCH_LIMIT');expect(query).not.toHaveBeenCalled();});
});
