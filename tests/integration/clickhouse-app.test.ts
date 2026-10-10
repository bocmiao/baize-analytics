import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Pool} from 'pg';
import {createApp} from '../../src/server/app.js';
import {ClickHouseStore,type SnapshotIdentity} from '../../src/server/clickhouse-store.js';
import {EventStore} from '../../src/server/event-store.js';

const configured=Boolean(process.env.TEST_DATABASE_URL&&process.env.CLICKHOUSE_TEST_URL);
describe.skipIf(!configured)('full application ClickHouse startup and upgraded privacy barrier',()=>{
 async function fixture(run:(value:{pool:Pool;store:ClickHouseStore;dataDir:string;options:Parameters<typeof createApp>[0];runtime:Awaited<ReturnType<typeof createApp>>;cookie:string})=>Promise<void>){
  const schema='ch_app_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:process.env.TEST_DATABASE_URL});
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`}),dataDir=await mkdtemp(join(tmpdir(),'baize-ch-app-'));
  const store=new ClickHouseStore({url:process.env.CLICKHOUSE_TEST_URL!,username:'baize',password:'local-test-only'});
  const options={pool,redis:null,dataDir,keyDir:join(dataDir,'keys'),background:false,clickhouse:store};
  let runtime:Awaited<ReturnType<typeof createApp>>|undefined;
  try{
   runtime=await createApp(options);
   const setup=await runtime.app.inject({method:'POST',url:'/api/setup',payload:{email:'ch-app@example.test',password:'CH-App-actual-2026!',name:'CH集成管理员'}});
   expect(setup.statusCode,setup.body).toBe(200);
   await run({pool,store,dataDir,options,runtime,cookie:String(setup.headers['set-cookie']).split(';')[0]!});
  }finally{
   await runtime?.app.close();
   for(const row of (await pool.query('SELECT id FROM sites')).rows)await store.deleteScope(row.id,{all:true});
   await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();await rm(dataDir,{recursive:true,force:true});
  }
 }
 async function seed(value:Parameters<Parameters<typeof fixture>[0]>[0],privacy_mode:'standard'|'daily_salt'){
  const {runtime,cookie,pool}=value;
  const created=await runtime.app.inject({method:'POST',url:'/api/v1/sites',headers:{cookie},payload:{name:'实际CH应用',domain:'ch-app.example.test',timezone:'UTC',privacy_mode}});
  expect(created.statusCode,created.body).toBe(201);const siteId=created.json().site.id;
  const ts=Date.now()-120000,visitor=randomUUID(),page=randomUUID();
  const collect=await runtime.app.inject({method:'POST',url:'/api/collect',headers:{origin:'https://ch-app.example.test','user-agent':'Mozilla/5.0 Chrome/145.0'},payload:{protocol_version:1,site_id:siteId,sdk:'app-ch-proof',sent_at:Date.now(),events:[{event_id:randomUUID(),visitor_id:visitor,page_id:page,ts,type:'pageview',url:'https://ch-app.example.test/actual',path:'/actual'}]}});
  expect(collect.statusCode,collect.body).toBe(202);expect(collect.json().accepted).toBe(1);
  const selected=await runtime.app.inject({method:'PUT',url:`/api/v1/sites/${siteId}/storage`,headers:{cookie},payload:{mode:'prefer_clickhouse'}});
  expect(selected.statusCode,selected.body).toBe(200);expect(await runtime.ctx.clickhouseMirror!.runOnce()).toBe(true);
  const state=(await pool.query('SELECT snapshot_id,snapshot_epoch,snapshot_generation::text FROM event_store_state WHERE site_id=$1',[siteId])).rows[0];
  const pointer:SnapshotIdentity={siteId,snapshotId:state.snapshot_id,epoch:state.snapshot_epoch,generation:state.snapshot_generation};
  return {siteId,pointer,ts};
 }
 it('wires actual authenticated selection and preserves a standard-mode replica across app restarts',()=>fixture(async value=>{
  const {runtime,options,cookie,store}=value,{siteId,pointer,ts}=await seed(value,'standard');
  const url=`/api/v1/sites/${siteId}/content?from=${new Date(ts-1000).toISOString()}&to=${new Date(ts+60000).toISOString()}`;
  const result=await runtime.app.inject({method:'GET',url,headers:{cookie}});
  expect(result.statusCode,result.body).toBe(200);expect(result.json().storage.source).toBe('clickhouse');
  await runtime.app.close();const restarted=await createApp(options);
  try{expect(await store.countSnapshot(pointer)).toBe(1);const fresh=await restarted.app.inject({method:'GET',url,headers:{cookie}});expect(fresh.statusCode,fresh.body).toBe(200);expect(fresh.json().storage.source).toBe('clickhouse');}finally{await restarted.app.close();}
 }),30000);
 it('fails closed on upgraded privacy replica cleanup errors, then removes expired legacy aliases before queries reopen',()=>fixture(async value=>{
  const {runtime,options,pool,store}=value,{siteId,pointer}=await seed(value,'daily_salt');
  const clean=await store.readSnapshot(pointer);expect(clean).toHaveLength(1);
  // Reproduce a pre-upgrade replica containing a known stable alias after PG detail expiry.
  await store.deleteSnapshot(siteId,pointer.snapshotId);
  await store.writeSnapshot(pointer,clean.map(e=>({...e,payload:{...e.payload,props:{customer_id:'historical-customer-must-disappear',plan:'free'}}})));
  await pool.query('DELETE FROM events WHERE site_id=$1',[siteId]);
  await pool.query("UPDATE sites SET config=config||'{\"privacy_cleanup_version\":4}'::jsonb WHERE id=$1",[siteId]);
  await runtime.app.close();
  const failing=new ClickHouseStore({url:process.env.CLICKHOUSE_TEST_URL!,username:'baize',password:'local-test-only',fetch:async()=>new Response('injected unavailable replica',{status:503})});
  await expect(createApp({...options,clickhouse:failing})).rejects.toThrow('CLICKHOUSE_HTTP_FAILURE');
  expect(await store.countSnapshot(pointer)).toBe(1);
  expect((await pool.query('SELECT snapshot_id FROM event_store_state WHERE site_id=$1',[siteId])).rows[0].snapshot_id).toBe(pointer.snapshotId);
  const restarted=await createApp(options);
  try{
   expect(await store.countSnapshot(pointer)).toBe(0);
   expect((await pool.query('SELECT snapshot_id FROM event_store_state WHERE site_id=$1',[siteId])).rows[0].snapshot_id).toBeNull();
   const read=await new EventStore(pool,store).readSiteEvents(siteId);expect(read.source).toBe('postgres');expect(read.events).toEqual([]);expect(JSON.stringify(read)).not.toContain('historical-customer');
  }finally{await restarted.app.close();}
 }),30000);
});
