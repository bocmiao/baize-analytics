import {describe,it,expect} from 'vitest';
import {createRemainingFactDeleteFixture} from '../fixtures/remaining-fact-delete.js';
import {ClickHouseRemainingFactStore,installRemainingFactStore} from '../../src/server/remaining-fact-store.js';
import {deleteVisitor,replayDeletionJournal} from '../../src/server/deletion.js';
import {queryStats} from '../../src/server/analytics.js';
const kinds=['sessions','numerics','members','carry_checkpoints','carry_keys'] as const;
describe.skipIf(!process.env.TEST_DATABASE_URL||!process.env.CLICKHOUSE_TEST_URL)('047 actual full visitor physical privacy deletion',()=>{
 it('publishes real five-kind worker state, rolls back PG after CH ACK, retries and preserves the other visitor',async()=>{
 const f=await createRemainingFactDeleteFixture(),store=new ClickHouseRemainingFactStore({url:process.env.CLICKHOUSE_TEST_URL!,username:'baize',password:'local-test-only'});
 try{
 await store.initialize();installRemainingFactStore(f.pool,store);await f.pool.query('UPDATE sites SET retention_days=1 WHERE id=$1',[f.siteId]);await f.pool.query('UPDATE aggregation_state SET generation=generation+1 WHERE site_id=$1',[f.siteId]);await f.runWorker();
 const selected=(await f.pool.query("SELECT id FROM analytics_fact_runs WHERE site_id=$1 AND status='published' ORDER BY generation DESC LIMIT 1",[f.siteId])).rows[0].id;
 const reader=await f.pool.connect();try{await reader.query('BEGIN');for(const kind of kinds){let n=0;for await(const batch of store.streamRunRows(reader,f.siteId,selected,kind))n+=batch.length;expect(n,kind).toBeGreaterThan(0);}await reader.query('COMMIT');}finally{await reader.query('ROLLBACK');reader.release();}
 const count=async(visitor:string)=>{const url=new URL(process.env.CLICKHOUSE_TEST_URL!);url.searchParams.set('query','SELECT count() n FROM baize_remaining_facts_v1 WHERE site_id={site:String} AND visitor_id={visitor:String} FORMAT JSON');url.searchParams.set('param_site',f.siteId);url.searchParams.set('param_visitor',visitor);const result=await fetch(url,{headers:{'X-ClickHouse-User':'baize','X-ClickHouse-Key':'local-test-only'}});expect(result.ok).toBe(true);return Number((await result.json()).data[0].n);};
 const beforeB=await count(f.otherVisitorId);expect(beforeB).toBeGreaterThan(0);
 await f.armRollback();await expect(deleteVisitor(f.runtime.ctx,f.siteId,{visitor_id:f.visitorId},null)).rejects.toThrow('remaining physical ACK PG rollback');expect(await count(f.visitorId)).toBe(0);expect((await f.pool.query('SELECT count(*)::int n FROM analytics_remaining_fact_members WHERE visitor_id=$1',[f.visitorId])).rows[0].n).toBeGreaterThan(0);expect(await count(f.otherVisitorId)).toBe(beforeB);await f.clearRollback();
 await deleteVisitor(f.runtime.ctx,f.siteId,{visitor_id:f.visitorId},null);expect(await count(f.visitorId)).toBe(0);expect(await count(f.otherVisitorId)).toBe(beforeB);expect((await f.pool.query('SELECT count(*)::int n FROM analytics_remaining_fact_members WHERE visitor_id=$1',[f.visitorId])).rows[0].n).toBe(0);await f.runWorker();
 const stats=await queryStats(f.runtime.ctx,f.siteId,new Date(f.boundary-7200000).toISOString(),new Date(f.boundary+3600000).toISOString());expect(stats.totals).toMatchObject({pv:1,uv:1,sessions:1});expect(stats.coverage).toBe(1);
 await replayDeletionJournal(f.pool,f.dir);await f.runWorker();expect(await count(f.visitorId)).toBe(0);expect((await queryStats(f.runtime.ctx,f.siteId,new Date(f.boundary-7200000).toISOString(),new Date(f.boundary+3600000).toISOString())).totals).toMatchObject({pv:1,uv:1,sessions:1});expect(f.pool.waitingCount).toBe(0);
 }finally{const c=await f.pool.connect();try{await c.query('BEGIN');await store.eraseSegments(c,f.siteId,[{visitorId:f.visitorId},{visitorId:f.otherVisitorId}]);await c.query('COMMIT');}finally{await c.query('ROLLBACK');c.release();}installRemainingFactStore(f.pool,null);await f.close();}
 },30000);
});
