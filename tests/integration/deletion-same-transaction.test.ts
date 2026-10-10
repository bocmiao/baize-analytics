import {it,expect} from 'vitest';
import {createRemainingFactDeleteFixture} from '../fixtures/remaining-fact-delete.js';
import {deleteVisitor,readVerifiedDeletionRecords,replayVerifiedDeletionRecordsInTransaction} from '../../src/server/deletion.js';
it.skipIf(!process.env.TEST_DATABASE_URL||!process.env.CLICKHOUSE_TEST_URL)('restore journal replay shares max-one target transaction and rejects invented scopes',async()=>{
 const f=await createRemainingFactDeleteFixture();try{
 await f.armRollback();await expect(deleteVisitor(f.runtime.ctx,f.siteId,{user_id:'deleted-A'},null)).rejects.toThrow('remaining physical ACK PG rollback');await f.clearRollback();const records=await readVerifiedDeletionRecords(f.dir);
 const c=await f.pool.connect();try{await c.query('BEGIN');await expect(replayVerifiedDeletionRecordsInTransaction(c,f.pool,f.dir,records.map(r=>({...r,deleted_at:new Date(Date.parse(r.deleted_at)+1).toISOString()})))).rejects.toThrow('DELETION_AUTHORIZATION_JOURNAL_REQUIRED');expect(f.pool.waitingCount).toBe(0);await replayVerifiedDeletionRecordsInTransaction(c,f.pool,f.dir,records);expect(f.pool.waitingCount).toBe(0);expect((await c.query('SELECT count(*)::int n FROM identity_tombstones WHERE site_id=$1',[f.siteId])).rows[0].n).toBeGreaterThan(0);await c.query('COMMIT');}finally{await c.query('ROLLBACK');c.release();}
 }finally{await f.close();}
},30000);
