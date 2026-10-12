import {fixtureInstallationNonce} from '../helpers/install-fixture.js';
import {pruneRawViaSignedCli} from '../support/canonical-raw-prune.js';
import {Pool} from 'pg';
import {createServer,type AddressInfo} from 'node:net';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {describe,it,expect} from 'vitest';
import {createApp} from '../helpers/install-fixture.js';
import {CanonicalClickHouse,installCanonicalStore} from '../../src/server/canonical-clickhouse.js';
import {CANONICAL_ACTIVATION_READY} from '../../src/server/canonical-migration.js';
import {runWorkerOnce} from '../../src/server/worker.js';
import {isolatedTestConnectionString} from '../support/database-url.js';

// Explicitly not acceptance until production readiness is enabled by the root
// after every identity/replay/delete/restore/retention contract is integrated.
describe.skipIf(!process.env.TEST_DATABASE_URL||!process.env.CLICKHOUSE_TEST_URL||!CANONICAL_ACTIVATION_READY)('canonical new revenue: accepted-event metadata ownership',()=>{
 it('accepts new CH revenue without PG raw and preserves currency/order receipt conflicts',async()=>{
  const schema='canonicalorder_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:isolatedTestConnectionString(),options:`-c search_path=${schema},public`,max:1}),store=new CanonicalClickHouse({url:process.env.CLICKHOUSE_TEST_URL!,username:'baize',password:'local-test-only'}),visitor=randomUUID(),dir=await mkdtemp('/tmp/baize-canonical-flow-');let runtime:Awaited<ReturnType<typeof createApp>>|undefined,base='',cookie='',site='';
  const day=new Date(Date.now()-86400000).toISOString().slice(0,10),start=Date.parse(day+'T12:00:00Z');
  async function http(path:string,payload?:unknown,method=payload===undefined?'GET':'POST'){const response=await fetch(base+path,{method,headers:{cookie,origin:'http://localhost','content-type':'application/json'},body:payload===undefined?undefined:JSON.stringify(payload)});const text=await response.text();return {status:response.status,headers:response.headers,text,json:()=>JSON.parse(text)};}
  const wire=(offset:number,path:string,type='pageview',user_id?:string)=>({event_id:randomUUID(),visitor_id:visitor,page_id:randomUUID(),type,ts:start+offset,url:'https://canonical.example.invalid'+path,path,...(user_id?{user_id}:{})});
  async function collect(events:unknown[]){const response=await fetch(base+'/api/collect',{method:'POST',headers:{origin:'https://canonical.example.invalid','user-agent':'Mozilla/5.0 Chrome/128.0.0.0 Safari/537.36','content-type':'application/json'},body:JSON.stringify({protocol_version:1,site_id:site,sdk:'native-canonical-flow',sent_at:Date.now(),events})});return {status:response.status,json:await response.json()};}
  async function action(action:string){const result=await http(`/api/v1/sites/${site}/canonical`,{action});expect(result.status,result.text).toBe(200);return result.json();}
  try{await admin.query(`CREATE SCHEMA ${schema}`);runtime=await createApp({pool,redis:null,background:false,clickhouse:null,canonical:store,history:null,dataDir:dir,keyDir:dir+'/keys',publicUrl:'http://localhost'});base=await runtime.app.listen({host:'127.0.0.1',port:0});const setup=await http('/api/setup',{installationNonce:fixtureInstallationNonce,email:'canonical-flow@example.invalid',password:'Isolated-local-fixture-123456!'});expect(setup.status,setup.text).toBe(200);cookie=setup.headers.get('set-cookie')!.split(';')[0]!;const created=await http('/api/v1/sites',{name:'canonical real flow',domain:'canonical.example.invalid',timezone:'UTC'});expect(created.status,created.text).toBe(201);site=created.json().site.id;
   const initial={...wire(0,'/order','revenue'),order_id:'receipt-order',currency:'CNY',revenue:19.95};const pg=await collect([initial]);expect(pg.status).toBe(202);expect(pg.json.accepted).toBe(1);expect(await runWorkerOnce(pool)).toBe(true);expect((await pool.query('SELECT count(*) FROM events WHERE site_id=$1',[site])).rows[0].count).toBe('1');
   let copiedComplete=false;for(let i=0;i<10;i++){const copied=await action('shadow');if(!copied.remaining){copiedComplete=true;break;}}expect(copiedComplete).toBe(true);await action('verify');expect((await action('activate')).authority).toBe('clickhouse');expect(await runWorkerOnce(pool)).toBe(true);
   const denied=await http(`/api/v1/sites/${site}/canonical`,{action:'prune'});expect(denied.status).toBe(409);
   const pruned=await pruneRawViaSignedCli(pool,store,site,dir);expect(pruned.remaining).toBe(false);
   expect((await pool.query('SELECT count(*) n FROM events WHERE site_id=$1',[site])).rows[0].n).toBe('0');
   expect((await pool.query('SELECT count(*) n FROM revenue_orders WHERE site_id=$1',[site])).rows[0].n).toBe('1');
   expect((await collect([{...initial,event_id:randomUUID()}])).json).toMatchObject({accepted:1,duplicates:1});
   const revenue={...wire(2000,'/new-order','revenue'),order_id:'new-canonical-order',currency:'USD',revenue:7.25};
   const fresh=await collect([revenue]);expect(fresh.status).toBe(202);expect(fresh.json).toMatchObject({accepted:1,duplicates:0});
   expect((await pool.query('SELECT 1 FROM events WHERE site_id=$1 AND event_id=$2',[site,revenue.event_id])).rowCount).toBe(0);
   expect((await pool.query('SELECT currency,amount::text FROM revenue_orders WHERE site_id=$1 AND event_id=$2',[site,revenue.event_id])).rows).toEqual([{currency:'USD',amount:'7.25'}]);
   const conflicting=await collect([{...revenue,event_id:randomUUID(),currency:'CNY'}]);expect(conflicting.status).toBe(202);expect(conflicting.json).toMatchObject({accepted:0,rejected:[{reason:'order_id_conflict'}]});
   expect(await runWorkerOnce(pool)).toBe(true);
   const constraints=await pool.query("SELECT confrelid::regclass::text target FROM pg_constraint WHERE conrelid='revenue_orders'::regclass AND conname='revenue_orders_event_receipt_fkey'");expect(constraints.rows[0].target).toMatch(/event_keys$/);

   const alias={...revenue,event_id:randomUUID()};expect((await collect([alias])).json).toMatchObject({accepted:1,duplicates:1});expect((await pool.query('SELECT count(*) n FROM revenue_orders WHERE site_id=$1',[site])).rows[0].n).toBe('2');
   await store.eraseEventID(site,revenue.event_id);const missingAlias={...revenue,event_id:randomUUID()};const missing=await collect([missingAlias]);expect(missing.status).toBe(503);expect(missing.json.error).toBe('canonical_unavailable');expect((await pool.query('SELECT 1 FROM event_keys WHERE site_id=$1 AND event_id=$2',[site,missingAlias.event_id])).rowCount).toBe(0);
   const refused=createServer();await new Promise<void>(resolve=>refused.listen(0,'127.0.0.1',resolve));const refusedPort=(refused.address() as AddressInfo).port;await new Promise<void>((resolve,reject)=>refused.close(error=>error?reject(error):resolve()));installCanonicalStore(pool,new CanonicalClickHouse({url:`http://127.0.0.1:${refusedPort}`,username:'baize',password:'local-test-only',timeoutMs:1000}));const unreadableAlias={...revenue,event_id:randomUUID()};const unreadable=await collect([unreadableAlias]);expect(unreadable.status).toBe(503);expect((await pool.query('SELECT 1 FROM event_keys WHERE site_id=$1 AND event_id=$2',[site,unreadableAlias.event_id])).rowCount).toBe(0);expect(pool.waitingCount).toBe(0);
   await pool.query('DELETE FROM event_keys WHERE site_id=$1 AND event_id=$2',[site,revenue.event_id]);
   expect((await pool.query('SELECT event_id FROM revenue_orders WHERE site_id=$1',[site])).rows).toEqual([{event_id:initial.event_id}]);
  }finally{installCanonicalStore(pool,store);if(site){const c=await pool.connect();try{await c.query('BEGIN');await store.deleteSegments(c,site,[{visitorId:visitor}],async()=>{});await c.query('COMMIT');}finally{c.release();}}await runtime?.app.close();await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();await rm(dir,{recursive:true,force:true});}
 },30000);
});
