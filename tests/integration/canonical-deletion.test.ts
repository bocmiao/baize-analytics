import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Pool} from 'pg';
import {beforeAll,afterAll,it,expect,describe} from 'vitest';
import {migrate} from '../../src/server/db.js';
import {CanonicalClickHouse,installCanonicalStore} from '../../src/server/canonical-clickhouse.js';
import {deleteVisitor,replayDeletionJournal} from '../../src/server/deletion.js';
import type {AppContext} from '../../src/server/context.js';
import type {StoredEvent} from '../../src/server/clickhouse-store.js';
describe.skipIf(!process.env.CLICKHOUSE_TEST_URL)('application deletion with real canonical PG CH',()=>{
 const database=process.env.TEST_DATABASE_URL??'postgresql://baize_dev@127.0.0.1:5432/baize_dev',schema='canonical_del_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:database}),pool=new Pool({connectionString:database,max:1,options:`-c search_path=${schema},public`});const site=randomUUID(),epoch=randomUUID();let dir:string;
 const ch=new CanonicalClickHouse({url:process.env.CLICKHOUSE_TEST_URL!,username:'baize',password:'local-test-only'});
 beforeAll(async()=>{dir=await mkdtemp(join(tmpdir(),'canonical-del-'));await admin.query(`CREATE SCHEMA ${schema}`);await migrate(pool);await ch.initialize();installCanonicalStore(pool,ch);await pool.query("INSERT INTO sites(id,name,domain,salt_secret) VALUES($1,'canonical','example.test','safe')",[site]);await pool.query('INSERT INTO aggregation_state(site_id) VALUES($1)',[site]);await pool.query("INSERT INTO canonical_event_authority(site_id,epoch,authority,raw_pruned) VALUES($1,$2,'clickhouse',true)",[site,epoch]);});
 afterAll(async()=>{const client=await pool.connect();try{await client.query('BEGIN');await ch.deleteSegments(client,site,[{visitorId:'A'},{visitorId:'B'}],async()=>{});await client.query('COMMIT');}finally{client.release();}await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();await rm(dir,{recursive:true,force:true});});
 it('fsynced application journal deletes A without mirror-all or loss of B; replay remains exact and missing adapter fails closed',async()=>{
  const events=['A','B'].map(visitor_id=>({site_id:site,event_id:randomUUID(),page_id:randomUUID(),visitor_id,ts:new Date().toISOString(),type:'pageview',path:'/',payload:{},dimensions:{}} as StoredEvent));const client=await pool.connect();try{await client.query('BEGIN');for(const event of events)await client.query('INSERT INTO event_keys(site_id,event_id,hash,ts,visitor_id) VALUES($1,$2,$3,$4,$5)',[site,event.event_id,'accepted',event.ts,event.visitor_id]);await ch.publishBatch(client,site,randomUUID(),epoch,events.map(event=>({event,acceptedHash:'accepted'})));await client.query('COMMIT');}finally{client.release();}
  const ctx={pool,config:{dataDir:dir},redis:null,audit:async()=>{},clickhouseMirror:{withDeletionBarrier:async()=>{throw Error('must not erase authority');}}} as unknown as AppContext;
  expect(await deleteVisitor(ctx,site,{visitor_id:'A'},null)).toMatchObject({deleted:true,journal:'durable'});expect((await pool.query('SELECT visitor_id FROM canonical_event_members')).rows).toEqual([{visitor_id:'B'}]);
  await replayDeletionJournal(pool,dir,undefined,async()=>{throw Error('must not erase authority on replay');});
  const reader=await pool.connect();try{await reader.query('BEGIN');const actual:StoredEvent[]=[];for await(const batch of ch.streamCommitted(reader,site))actual.push(...batch);expect(actual.map(e=>e.visitor_id)).toEqual(['B']);await reader.query('COMMIT');}finally{reader.release();}
  installCanonicalStore(pool,null);await expect(deleteVisitor(ctx,site,{visitor_id:'B'},null)).rejects.toMatchObject({statusCode:503});installCanonicalStore(pool,ch);expect((await pool.query('SELECT visitor_id FROM canonical_event_members')).rows).toEqual([{visitor_id:'B'}]);
 },10000);
});
