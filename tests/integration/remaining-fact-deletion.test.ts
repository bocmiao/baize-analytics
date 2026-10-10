import {describe,it,expect} from 'vitest';
import {createRemainingFactDeleteFixture} from '../fixtures/remaining-fact-delete.js';
import {deleteVisitor,replayDeletionJournal} from '../../src/server/deletion.js';
import {queryStats} from '../../src/server/analytics.js';
/** 047 session/member/numeric/carry physical assertions are added when its
 * adapter contract exists. This test verifies the real common 043/044 source
 * and post-physical-ACK rollback barrier; it does not claim 047 acceptance. */
describe.skipIf(!process.env.TEST_DATABASE_URL||!process.env.CLICKHOUSE_TEST_URL)('remaining derived privacy native source fixture',()=>{
 it('collects real A→B identities, keeps B after exact interval deletion and retries a post-ACK PG rollback',async()=>{
 const f=await createRemainingFactDeleteFixture();try{
 expect(f.snapshot.length).toBeGreaterThan(0);expect(f.events).toHaveLength(9);
 const before=await queryStats(f.runtime.ctx,f.siteId,new Date(f.boundary-7200000).toISOString(),new Date(f.boundary+3600000).toISOString());expect(before.totals).toMatchObject({pv:4,uv:2});
 await f.armRollback();await expect(deleteVisitor(f.runtime.ctx,f.siteId,{user_id:'deleted-A'},null)).rejects.toThrow('remaining physical ACK PG rollback');await f.clearRollback();
 expect((await poolRows(f,"SELECT count(*)::int n FROM identity_tombstones WHERE site_id=$1")).rows[0].n).toBe(0);
 await deleteVisitor(f.runtime.ctx,f.siteId,{user_id:'deleted-A'},null);await f.runWorker();
 const after=await queryStats(f.runtime.ctx,f.siteId,new Date(f.boundary-7200000).toISOString(),new Date(f.boundary+3600000).toISOString());expect(after.totals).toMatchObject({pv:4,uv:2,visibleSeconds:0});expect(after.coverage).toBe(1);
 await replayDeletionJournal(f.pool,f.dir);await f.runWorker();const replayed=await queryStats(f.runtime.ctx,f.siteId,new Date(f.boundary-7200000).toISOString(),new Date(f.boundary+3600000).toISOString());expect(replayed.totals).toMatchObject({pv:4,uv:2,visibleSeconds:0});expect(f.pool.waitingCount).toBe(0);
 }finally{await f.close();}
 },30000);
});
function poolRows(f:Awaited<ReturnType<typeof createRemainingFactDeleteFixture>>,sql:string){return f.pool.query(sql,[f.siteId]);}
