import {randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {Client,Pool} from 'pg';
import {describe,it,expect} from 'vitest';
import {migrate,transaction} from '../../src/server/db.js';
import {stageSessionEventHeaders,type SessionEventHeaderRecord} from '../../src/server/session-event-headers.js';
import {ClickHouseSessionHeaderStore,cleanupSessionHeaderOrphans,installSessionHeaderStore} from '../../src/server/session-header-store.js';

describe.skipIf(!process.env.TEST_DATABASE_URL||!process.env.CLICKHOUSE_TEST_URL)('durable CH header orphan reclamation, actual PG/CH',()=>{
 it('reclaims an uncommitted attempt in a still-live run, preserves its committed body and records retry failure',async()=>{
  const schema='header_gc_'+randomUUID().replaceAll('-',''),site=randomUUID(),epoch=randomUUID(),run=randomUUID(),visitor=randomUUID();
  const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1,options:`-c search_path=${schema}`});
  const lease=new Client({...pool.options}),store=new ClickHouseSessionHeaderStore({url:process.env.CLICKHOUSE_TEST_URL!,username:'baize',password:'local-test-only'});
  const count=async()=>{const url=new URL(process.env.CLICKHOUSE_TEST_URL!);url.searchParams.set('query','SELECT count() n FROM baize_session_headers_v1 WHERE site_id={site:String} FORMAT JSON');url.searchParams.set('param_site',site);const response=await fetch(url,{method:'POST',headers:{'X-ClickHouse-User':'baize','X-ClickHouse-Key':'local-test-only'}});expect(response.ok).toBe(true);return Number((await response.json() as {data:{n:string}[]}).data[0]?.n);};
  await admin.query(`CREATE SCHEMA ${schema}`);
  try{
   await migrate(pool);await lease.connect();await store.initialize();installSessionHeaderStore(pool,store);
   await pool.query("INSERT INTO sites(id,name,domain,salt_secret) VALUES($1,'orphan test','example.test','producer-test')",[site]);
   await pool.query('INSERT INTO aggregation_state(site_id,epoch,generation,processed_generation) VALUES($1,$2,1,1)',[site,epoch]);
   await pool.query("INSERT INTO analytics_fact_runs(id,site_id,epoch,generation,outbox_high_watermark,status,query_version,retained_from) VALUES($1,$2,$3,1,0,'staging',2,'2026-01-01')",[run,site,epoch]);
   const c=await pool.connect();let rows:SessionEventHeaderRecord[]=[];
   const fence={expectedAggregationEpoch:epoch,verifyLiveFence:async()=>{expect((await lease.query('SELECT epoch FROM aggregation_state WHERE site_id=$1',[site])).rows[0].epoch).toBe(epoch);}};
   try{
    await c.query('BEGIN');await stageSessionEventHeaders(c,site,run,[{sessionId:randomUUID(),event:{site_id:site,event_id:randomUUID(),visitor_id:visitor,page_id:randomUUID(),ts:'2026-10-10T10:00:00.000Z',type:'pageview',path:'/real',dimensions:{device:'desktop'},payload:{}}}]);
    rows=(await c.query('SELECT * FROM analytics_session_event_headers WHERE run_id=$1',[run])).rows;
    await store.stageRows(c,site,run,rows,fence);await c.query('ROLLBACK');
    expect(await count()).toBe(1);expect((await c.query('SELECT count(*)::int n FROM analytics_header_batches WHERE site_id=$1',[site])).rows[0].n).toBe(0);
    await c.query('BEGIN');await store.stageRows(c,site,run,rows,fence);
    const producerCount=async()=>{let n=0;for await(const batch of store.streamCompletedProducerRows(c,site,run,fence))n+=batch.length;return n;};
    await expect(producerCount()).rejects.toThrow('SESSION_HEADER_PRODUCER_SOURCE_FENCE');
    await expect(store.completeRun(c,site,run,0,fence)).rejects.toThrow('SESSION_HEADER_COMPLETION_COUNT');await store.completeRun(c,site,run,1,fence);
    expect(await producerCount()).toBe(1);let ordinaryVisible=0;for await(const batch of store.streamRows(c,site,run))ordinaryVisible+=batch.length;expect(ordinaryVisible).toBe(0);
    await c.query("UPDATE analytics_fact_runs SET status='published' WHERE id=$1",[run]);await expect(producerCount()).rejects.toThrow('SESSION_HEADER_PRODUCER_SOURCE_FENCE');await c.query('COMMIT');
    expect(await count()).toBe(2);expect(pool.waitingCount).toBe(0);
   }finally{await c.query('ROLLBACK');c.release();}
   expect(await transaction(pool,c=>store.pruneOrphans(c,site))).toMatchObject({removedAttempts:1,remaining:false});expect(await count()).toBe(1);
   let seen=0;await transaction(pool,async c=>{for await(const batch of store.streamRows(c,site,run))seen+=batch.length;});expect(seen).toBe(1);
   // Zero topology is explicitly certified by its completed producer cursor.
   const emptyRun=randomUUID();await pool.query("INSERT INTO analytics_fact_runs(id,site_id,epoch,generation,outbox_high_watermark,status,query_version,retained_from) VALUES($1,$2,$3,1,0,'staging',2,'2026-01-01')",[emptyRun,site,epoch]);
   expect((await pool.query('SELECT count(*)::int n FROM analytics_header_runs WHERE run_id=$1',[emptyRun])).rows[0].n).toBe(0);
   await transaction(pool,async c=>{const actual=Number((await c.query('SELECT count(*)::text n FROM analytics_session_event_headers WHERE run_id=$1',[emptyRun])).rows[0].n);await store.completeRun(c,site,emptyRun,actual,fence);await c.query("UPDATE analytics_fact_runs SET status='published' WHERE id=$1",[emptyRun]);});
   expect((await pool.query('SELECT state,row_count::text,aggregation_epoch FROM analytics_header_runs WHERE run_id=$1',[emptyRun])).rows[0]).toEqual({state:'complete',row_count:'0',aggregation_epoch:epoch});
   // Reserve and close a genuine local TCP endpoint, not a fabricated fetch result.
   const server=createServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const port=(server.address() as {port:number}).port;await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
   installSessionHeaderStore(pool,new ClickHouseSessionHeaderStore({url:`http://127.0.0.1:${port}`,username:'baize',password:'local-test-only',timeoutMs:1000}));
   expect(await cleanupSessionHeaderOrphans(pool)).toMatchObject({failed:true});expect((await pool.query('SELECT next_attempt_id,last_error_code FROM analytics_header_gc WHERE site_id=$1',[site])).rows[0]).toMatchObject({next_attempt_id:null,last_error_code:'session_header_gc_failed'});expect(await count()).toBe(1);
   installSessionHeaderStore(pool,store);expect(await cleanupSessionHeaderOrphans(pool)).toMatchObject({removedAttempts:0});expect((await pool.query('SELECT last_error_code,last_success_at IS NOT NULL succeeded FROM analytics_header_gc WHERE site_id=$1',[site])).rows[0]).toEqual({last_error_code:null,succeeded:true});
  }finally{
   await transaction(pool,c=>store.eraseSegments(c,site,[{visitorId:visitor}]));await lease.end();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();
  }
 });
});
