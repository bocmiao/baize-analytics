import {Pool,type PoolClient} from 'pg';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {migrate,transaction,lockSite,beginPartitionSnapshot} from '../../src/server/db.js';
import {CanonicalClickHouse} from '../../src/server/canonical-clickhouse.js';
import {installCanonicalEventStore,readSiteEvents} from '../../src/server/event-store.js';
import {beginGovernanceSnapshot,runGovernance} from '../../src/server/governance-worker.js';
import {governanceEventUsage,ingestGovernance,readCanonicalReplay,canonicalReplayExport,beginGovernanceSiteRead} from '../../src/server/governance.js';
import type {AppContext} from '../../src/server/context.js';
import type {StoredEvent} from '../../src/server/clickhouse-store.js';

describe.skipIf(!process.env.TEST_DATABASE_URL||!process.env.CLICKHOUSE_TEST_URL)('governance canonical authority real PG CH, activation remains closed',()=>{
 const schema='governance_canonical_'+randomUUID().replaceAll('-',''),site=randomUUID(),epoch=randomUUID(),visitor=randomUUID(),page=randomUUID();
 const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`,max:1});
 const store=new CanonicalClickHouse({url:process.env.CLICKHOUSE_TEST_URL!,username:'baize',password:'local-test-only'});
 const ctx={pool,redis:null,config:{dataDir:'',publicUrl:'http://localhost',masterKey:randomBytes(32)}} as AppContext,settings={id:site,privacy_mode:'standard',config:{replay:true}};
 const time=Date.now()-10000,replay=[{type:2,timestamp:time,data:{node:{type:2,tagName:'div',attributes:{},childNodes:[]}}}];
 const wire:StoredEvent={site_id:site,event_id:randomUUID(),ts:new Date(time),visitor_id:visitor,page_id:page,type:'replay',path:'/actual',payload:{seq:0,replay},dimensions:{},is_bot:false};
 async function stage(c:PoolClient,event:StoredEvent){await c.query('INSERT INTO event_keys(site_id,event_id,hash,ts,visitor_id) VALUES($1,$2,$3,$4,$5)',[site,event.event_id,'accepted',event.ts,visitor]);await store.publishBatch(c,site,randomUUID(),epoch,[{event,acceptedHash:'accepted'}]);await ingestGovernance(c,settings,event as unknown as Record<string,unknown>,visitor,{canonical:true});}
 async function snapshot<T>(f:(c:PoolClient)=>Promise<T>){const c=await pool.connect();try{await beginPartitionSnapshot(c);await lockSite(c,site);const result=await f(c);await c.query('COMMIT');return result;}catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}}
 beforeAll(async()=>{ctx.config.dataDir=await mkdtemp('/tmp/governance-canonical-');await admin.query(`CREATE SCHEMA ${schema}`);await migrate(pool);await store.initialize();await pool.query("INSERT INTO sites(id,name,domain,salt_secret,config) VALUES($1,'canonical replay','example.test','salt','{\"replay\":true}')",[site]);await pool.query("INSERT INTO canonical_event_authority(site_id,epoch,authority) VALUES($1,$2,'clickhouse')",[site,epoch]);installCanonicalEventStore(pool,store);});
 afterAll(async()=>{installCanonicalEventStore(pool,store);await transaction(pool,c=>store.deleteSegments(c,site,[{visitorId:visitor}],async()=>{}));await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();await rm(ctx.config.dataDir,{recursive:true,force:true});});
 it('canonical ingest stores metadata only and real CH replay is reconstructed with max1 same-client reads',async()=>{
  await transaction(pool,async c=>{await lockSite(c,site);await stage(c,wire);});
  expect((await pool.query('SELECT count(*) n FROM replay_chunks WHERE site_id=$1',[site])).rows[0].n).toBe('0');
  expect((await pool.query('SELECT payload_hash,record_started_at FROM replay_chunk_keys WHERE site_id=$1',[site])).rows).toHaveLength(1);
  expect(await snapshot(c=>readCanonicalReplay(ctx,site,c,{limit:10}))).toEqual([expect.objectContaining({session_id:visitor+':'+page,seq:0,page_id:page,path:'/actual',payload:replay,event_count:1})]);
  expect(await snapshot(c=>governanceEventUsage(ctx,site,c))).toMatchObject({event_count:1,bytes:null,source:'clickhouse',byte_method:'canonical_serialized_json',coverage:1});
  expect(await snapshot(async c=>canonicalReplayExport(c,site,(await readSiteEvents(pool,site,{client:c,includeBots:true,limit:100})).events))).toEqual([expect.objectContaining({site_id:site,seq:0,payload:replay,created_at:null})]);
 });
 it('actual full export worker includes CH replay body and canonical manifest while PG body remains absent',async()=>{
  const job=randomUUID();await pool.query("INSERT INTO export_jobs(id,site_id,format,full_export) VALUES($1,$2,'json',true)",[job,site]);await runGovernance(ctx);const row=(await pool.query('SELECT status,path,error FROM export_jobs WHERE id=$1',[job])).rows[0];expect(row.error).toBeNull();expect(row.status).toBe('complete');const content=JSON.parse(await readFile(row.path,'utf8'));expect(content.replay_chunks).toEqual([expect.objectContaining({seq:0,payload:replay,created_at:null})]);expect(content.export_manifest[0].table_read_metadata.replay_chunks).toMatchObject({source:'clickhouse',method:'canonical_committed_replay',coverage:1});expect((await pool.query('SELECT count(*) n FROM replay_chunks WHERE site_id=$1',[site])).rows[0].n).toBe('0');
 });
 it('duplicate sequence chooses first accepted chunk and rejects unmasked or disabled input',async()=>{
  await transaction(pool,async c=>{await lockSite(c,site);await stage(c,{...wire,event_id:randomUUID(),payload:{seq:0,replay:[{type:2,timestamp:time+1,data:{text:'***'}}]}});});
  expect(await snapshot(c=>readCanonicalReplay(ctx,site,c,{limit:10}))).toHaveLength(1);
  await expect(transaction(pool,c=>ingestGovernance(c,settings,{...wire,payload:{seq:1,replay:[{type:2,timestamp:time,data:{text:'private input'}}]}},visitor,{canonical:true}))).rejects.toThrow();
  await expect(transaction(pool,c=>ingestGovernance(c,{...settings,config:{}},wire as unknown as Record<string,unknown>,visitor,{canonical:true}))).rejects.toThrow();
 });
 it('canonical provider failure is unavailable even with empty filter, never a PG zero fallback',async()=>{
  const broken=new CanonicalClickHouse({url:process.env.CLICKHOUSE_TEST_URL!,username:'baize',password:'local-test-only',fetch:async()=>new Response('',{status:503})});installCanonicalEventStore(pool,broken);
  try{await expect(snapshot(c=>readCanonicalReplay(ctx,site,c,{path:'/absent',limit:10}))).rejects.toMatchObject({code:'canonical_unavailable'});await expect(snapshot(c=>governanceEventUsage(ctx,site,c))).rejects.toMatchObject({code:'canonical_unavailable'});}finally{installCanonicalEventStore(pool,store);}
 });
 it.each(['alerts','site'] as const)('governance %s fixes RR after a pending deletion gate, not before waiting',async kind=>{
  const deletionSite=randomUUID(),channel=randomUUID(),rule=randomUUID(),name='gov_snapshot_'+randomUUID();await pool.query("INSERT INTO sites(id,name,domain,salt_secret) VALUES($1,'deletion snapshot','example.test','salt')",[deletionSite]);await pool.query("INSERT INTO notification_channels VALUES($1,$2,'webhook','unused')",[channel,deletionSite]);await pool.query("INSERT INTO alert_rules(id,site_id,kind,config,channel_id) VALUES($1,$2,'storage','{}',$3)",[rule,deletionSite,channel]);await pool.query("INSERT INTO events(site_id,event_id,ts,visitor_id,page_id,type,path,payload,dimensions) VALUES($1,$2,now()-interval '1 minute','old',$3,'pageview','/before-delete','{}','{}')",[deletionSite,randomUUID(),randomUUID()]);
  const blocker=await admin.connect(),reader=await pool.connect();let pending:Promise<number>|undefined;
  try{await blocker.query('BEGIN');await blocker.query(`SET LOCAL search_path=${schema}`);await lockSite(blocker,deletionSite);await reader.query('SELECT set_config($1,$2,false)',['application_name',name]);pending=(async()=>{if(kind==='alerts')await beginGovernanceSnapshot(reader,'alerts');else await beginGovernanceSiteRead(reader,deletionSite);const n=Number((await reader.query('SELECT count(*) n FROM events WHERE site_id=$1',[deletionSite])).rows[0].n);await reader.query('COMMIT');return n;})();
   let waiting=false;for(let i=0;i<200;i++){waiting=(await admin.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event='advisory'",[name])).rowCount===1;if(waiting)break;await new Promise(resolve=>setTimeout(resolve,5));}expect(waiting).toBe(true);await blocker.query('DELETE FROM events WHERE site_id=$1',[deletionSite]);await blocker.query('COMMIT');expect(await pending).toBe(0);
   const locks=(await reader.query('SELECT count(*) n FROM pg_locks WHERE pid=pg_backend_pid() AND locktype=$1',['advisory'])).rows[0];expect(Number(locks.n)).toBe(0);
  }finally{await blocker.query('ROLLBACK').catch(()=>{});await pending?.catch(()=>{});await reader.query('ROLLBACK').catch(()=>{});reader.release();blocker.release();await pool.query('DELETE FROM sites WHERE id=$1',[deletionSite]);}
 });
 it('whole-visitor tombstone suppresses canonical replay and usage without consulting empty PG events',async()=>{
  await pool.query('INSERT INTO tombstones(site_id,visitor_id) VALUES($1,$2)',[site,visitor]);
  expect(await snapshot(c=>readCanonicalReplay(ctx,site,c,{limit:10}))).toEqual([]);
  expect(await snapshot(async c=>canonicalReplayExport(c,site,(await readSiteEvents(pool,site,{client:c,includeBots:true,limit:100})).events))).toEqual([]);
  expect(await snapshot(c=>governanceEventUsage(ctx,site,c))).toMatchObject({event_count:0,source:'clickhouse'});
 });
});
