import {it,expect} from 'vitest';
import {createServer,type AddressInfo} from 'node:net';
import {createRemainingFactDeleteFixture} from '../fixtures/remaining-fact-delete.js';
import {ClickHouseRemainingFactStore,installRemainingFactStore} from '../../src/server/remaining-fact-store.js';
import {deleteVisitor,replayDeletionJournal,readVerifiedDeletionRecords} from '../../src/server/deletion.js';
import {queryStats} from '../../src/server/analytics.js';
it.skipIf(!process.env.TEST_DATABASE_URL||!process.env.CLICKHOUSE_TEST_URL)('47 TCP refusal fails closed before metadata/proof trimming and actual durable journal recovery preserves B',async()=>{
 const f=await createRemainingFactDeleteFixture(),store=new ClickHouseRemainingFactStore({url:process.env.CLICKHOUSE_TEST_URL!,username:'baize',password:'local-test-only'});
 try{
 await store.initialize();installRemainingFactStore(f.pool,store);await f.pool.query('UPDATE sites SET retention_days=1 WHERE id=$1',[f.siteId]);await f.pool.query('UPDATE aggregation_state SET generation=generation+1 WHERE site_id=$1',[f.siteId]);await f.runWorker();
 const state=(await f.pool.query('SELECT epoch,generation FROM aggregation_state WHERE site_id=$1',[f.siteId])).rows[0],receipt=(await f.pool.query("SELECT body_hash FROM analytics_remaining_fact_members m JOIN analytics_fact_runs r ON r.id=m.run_id WHERE r.site_id=$1 ORDER BY m.run_id,m.kind,m.row_key",[f.siteId])).rows;
 expect(receipt.length).toBeGreaterThan(0);
 const socket=createServer();await new Promise<void>(resolve=>socket.listen(0,'127.0.0.1',resolve));const deadPort=(socket.address() as AddressInfo).port;await new Promise<void>((resolve,reject)=>socket.close(error=>error?reject(error):resolve()));
 installRemainingFactStore(f.pool,new ClickHouseRemainingFactStore({url:`http://127.0.0.1:${deadPort}`,username:'baize',password:'local-test-only',timeoutMs:100}));
 await expect(deleteVisitor(f.runtime.ctx,f.siteId,{user_id:'deleted-A'},null)).rejects.toMatchObject({statusCode:503,message:'remaining_fact_delete_unavailable'});
 expect((await f.pool.query('SELECT epoch,generation FROM aggregation_state WHERE site_id=$1',[f.siteId])).rows[0]).toEqual(state);expect((await f.pool.query("SELECT body_hash FROM analytics_remaining_fact_members m JOIN analytics_fact_runs r ON r.id=m.run_id WHERE r.site_id=$1 ORDER BY m.run_id,m.kind,m.row_key",[f.siteId])).rows).toEqual(receipt);expect((await f.pool.query('SELECT count(*)::int n FROM identity_tombstones WHERE site_id=$1',[f.siteId])).rows[0].n).toBe(0);expect((await readVerifiedDeletionRecords(f.dir)).filter(r=>r.source==='identity-segment')).toHaveLength(1);
 installRemainingFactStore(f.pool,store);const c=await f.pool.connect();let count=0;try{await c.query('BEGIN');const runs=(await c.query("SELECT r.id FROM analytics_fact_runs r WHERE site_id=$1 AND status='published' AND (SELECT count(*) FROM analytics_remaining_fact_runs m WHERE m.run_id=r.id AND m.state='complete')=5",[f.siteId])).rows;for(const run of runs)for await(const batch of store.streamRunRows(c,f.siteId,run.id))count+=batch.length;await c.query('COMMIT');}finally{await c.query('ROLLBACK');c.release();}expect(count).toBe(receipt.length);
 await replayDeletionJournal(f.pool,f.dir);await f.runWorker();expect((await queryStats(f.runtime.ctx,f.siteId,new Date(f.boundary-7200000).toISOString(),new Date(f.boundary+3600000).toISOString())).totals).toMatchObject({pv:4,uv:2});expect(f.pool.waitingCount).toBe(0);
 }finally{installRemainingFactStore(f.pool,store);const c=await f.pool.connect();try{await c.query('BEGIN');await store.eraseSegments(c,f.siteId,[{visitorId:f.visitorId},{visitorId:f.otherVisitorId}]);await c.query('COMMIT');}finally{await c.query('ROLLBACK');c.release();}installRemainingFactStore(f.pool,null);await f.close();}
},30000);
