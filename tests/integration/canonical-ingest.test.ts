import {Pool} from 'pg';
import {mkdtemp,rm} from 'node:fs/promises';
import {createApp} from '../../src/server/app.js';
import {randomUUID} from 'node:crypto';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {migrate,transaction,lockSite} from '../../src/server/db.js';
import {CanonicalClickHouse} from '../../src/server/canonical-clickhouse.js';
import {installCanonicalIngestStore,publishCanonicalIngest} from '../../src/server/canonical-ingest.js';
import type {StoredEvent} from '../../src/server/clickhouse-store.js';

describe.skipIf(!process.env.TEST_DATABASE_URL||!process.env.CLICKHOUSE_TEST_URL)('canonical ingestion staged real PG CH, activation closed',()=>{
 const schema='canonical_ingest_'+randomUUID().replaceAll('-',''),site=randomUUID(),epoch=randomUUID(),visitor=randomUUID();
 const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`,max:1});
 const store=new CanonicalClickHouse({url:process.env.CLICKHOUSE_TEST_URL!,username:'baize',password:'local-test-only'});let runtime:Awaited<ReturnType<typeof createApp>>,dir:string,base:string;
 const event=():StoredEvent=>({site_id:site,event_id:randomUUID(),ts:new Date(),visitor_id:visitor,page_id:randomUUID(),type:'event',path:'/clean',payload:{event_name:'boolean',props:{ok:true}},dimensions:{country:'unknown'},is_bot:false});
 const stage=async(e:StoredEvent,ch=store)=>transaction(pool,async c=>{await lockSite(c,site);await c.query('INSERT INTO event_keys(site_id,event_id,hash,ts,visitor_id) VALUES($1,$2,$3,$4,$5)',[site,e.event_id,'wire-hash',e.ts,visitor]);await c.query('INSERT INTO outbox(site_id,event_id,ts,visitor_id) VALUES($1,$2,$3,$4)',[site,e.event_id,e.ts,visitor]);await publishCanonicalIngest(c,site,{store:ch,epoch},[{event:e,acceptedHash:'wire-hash'}]);});
 beforeAll(async()=>{await admin.query(`CREATE SCHEMA ${schema}`);await migrate(pool);await store.initialize();await pool.query("INSERT INTO sites(id,name,domain,salt_secret) VALUES($1,'ingest','example.test','salt')",[site]);dir=await mkdtemp('/tmp/canonical-ingest-');runtime=await createApp({pool,redis:null,skipMigrate:true,background:false,clickhouse:null,history:null,dataDir:dir,keyDir:dir+'/keys',masterKey:Buffer.alloc(32)});base=await runtime.app.listen({host:'127.0.0.1',port:0});installCanonicalIngestStore(pool,store);});
 afterAll(async()=>{const c=await pool.connect();try{await c.query('BEGIN');await store.deleteSegments(c,site,[{visitorId:visitor}],async()=>{});await c.query('COMMIT');}finally{c.release();}await runtime?.app.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();if(dir)await rm(dir,{recursive:true,force:true});});
 it('default PG collection unchanged, canonical authority refuses202 while integration unready',async()=>{
  const wire={event_id:randomUUID(),page_id:randomUUID(),visitor_id:visitor,type:'pageview',ts:Date.now(),url:'https://example.test/?token=private',path:'/',props:{email:'private',ok:true}};
  const send=()=>fetch(base+'/api/collect',{method:'POST',headers:{origin:'https://example.test','user-agent':'Mozilla/5.0 Chrome/128.0.0.0 Safari/537.36','content-type':'application/json'},body:JSON.stringify({protocol_version:1,site_id:site,sdk:'test',sent_at:Date.now(),events:[wire]})});
  expect((await send()).status).toBe(202);expect((await pool.query('SELECT payload FROM events WHERE site_id=$1',[site])).rows[0].payload).not.toHaveProperty('props.email');
  await pool.query("INSERT INTO canonical_event_authority(site_id,epoch,authority) VALUES($1,$2,'clickhouse')",[site,epoch]);wire.event_id=randomUUID();const denied=await send();expect(denied.status).toBe(503);expect((await denied.json()).error).toBe('canonical_unavailable');expect((await pool.query('SELECT 1 FROM event_keys WHERE site_id=$1 AND event_id=$2',[site,wire.event_id])).rowCount).toBe(0);
 });
 it('CH unavailable rolls back keys/outbox/manifest, never key-only reliable ACK',async()=>{
  const e=event(),bad=new CanonicalClickHouse({url:process.env.CLICKHOUSE_TEST_URL!,username:'baize',password:'local-test-only',fetch:async()=>new Response('',{status:503})});await expect(stage(e,bad)).rejects.toMatchObject({code:'canonical_unavailable',statusCode:503});
  for(const table of ['event_keys','outbox','canonical_event_members'])expect((await pool.query(`SELECT 1 FROM ${table} WHERE site_id=$1 AND event_id=$2`,[site,e.event_id])).rowCount).toBe(0);
 });
 it('post-body PG rollback leaves invisible orphan; committed metadata reads actual CH body with PG body absent',async()=>{
  const e=event();await expect(transaction(pool,async c=>{await lockSite(c,site);await c.query('INSERT INTO event_keys(site_id,event_id,hash,ts,visitor_id) VALUES($1,$2,$3,$4,$5)',[site,e.event_id,'wire-hash',e.ts,visitor]);await publishCanonicalIngest(c,site,{store,epoch},[{event:e,acceptedHash:'wire-hash'}]);await c.query("SELECT 1/0");})).rejects.toThrow();
  const before=await pool.connect();try{await before.query('BEGIN');const visible=[];for await(const rows of store.streamCommitted(before,site))visible.push(...rows);expect(visible).toEqual([]);await before.query('COMMIT');}finally{before.release();}
  await stage(e);expect((await pool.query('SELECT 1 FROM events WHERE site_id=$1 AND event_id=$2',[site,e.event_id])).rowCount).toBe(0);expect((await pool.query('SELECT 1 FROM event_data WHERE site_id=$1 AND event_id=$2',[site,e.event_id])).rowCount).toBe(0);expect((await pool.query('SELECT 1 FROM outbox WHERE site_id=$1 AND event_id=$2',[site,e.event_id])).rowCount).toBe(1);
  const c=await pool.connect();try{await c.query('BEGIN');const actual=[];for await(const rows of store.streamCommitted(c,site))actual.push(...rows);expect(actual).toHaveLength(1);expect(actual[0]).toMatchObject({event_id:e.event_id,payload:{event_name:'boolean',props:{ok:true}},is_bot:false});await c.query('COMMIT');}finally{c.release();}
 });
});
