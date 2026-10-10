import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Pool} from 'pg';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {migrate,transaction} from '../../src/server/db.js';
import {createApp} from '../../src/server/app.js';
import {CanonicalClickHouse} from '../../src/server/canonical-clickhouse.js';
import type {StoredEvent} from '../../src/server/clickhouse-store.js';
describe.skipIf(!process.env.TEST_DATABASE_URL||!process.env.CLICKHOUSE_TEST_URL)('canonical privacy startup real app PG/CH max1',()=>{
 const schema='startup_privacy_'+randomUUID().replaceAll('-',''),site=randomUUID(),epoch=randomUUID(),visitor=randomUUID(),eventId=randomUUID();let dir:string;
 const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1,options:`-c search_path=${schema}`});
 const store=new CanonicalClickHouse({url:process.env.CLICKHOUSE_TEST_URL!,username:'baize',password:'local-test-only'});
 beforeAll(async()=>{dir=await mkdtemp(join(tmpdir(),'baize-startup-privacy-'));await admin.query(`CREATE SCHEMA ${schema}`);await migrate(pool);await store.initialize();await pool.query("INSERT INTO sites(id,name,domain,salt_secret,privacy_mode,config) VALUES($1,'privacy','example.test','salt','daily_salt','{\"privacy_cleanup_version\":24}')",[site]);await pool.query('INSERT INTO aggregation_state(site_id) VALUES($1)',[site]);await pool.query("INSERT INTO canonical_event_authority(site_id,epoch,authority,raw_pruned) VALUES($1,$2,'clickhouse',true)",[site,epoch]);const event:StoredEvent={site_id:site,event_id:eventId,page_id:randomUUID(),visitor_id:visitor,ts:new Date(),type:'event',path:'/',payload:{event_name:'purchase',props:{customer_id:'secret',accepted:true}},dimensions:{}};await transaction(pool,async c=>{await c.query("INSERT INTO event_keys(site_id,event_id,hash,ts,visitor_id) VALUES($1,$2,'accepted',$3,$4)",[site,eventId,event.ts,visitor]);await store.publishBatch(c,site,randomUUID(),epoch,[{event,acceptedHash:'accepted'}]);});});
 afterAll(async()=>{await transaction(pool,c=>store.deleteSegments(c,site,[{visitorId:visitor}],async()=>{}));await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();await rm(dir,{recursive:true,force:true});});
 it('boots without erasing authoritative raw, removes known aliases physically and stays valid on restart',async()=>{
  for(let attempt=0;attempt<2;attempt++){
   const {app}=await createApp({pool,redis:null,dataDir:dir,keyDir:join(dir,'keys'),masterKey:Buffer.alloc(32,1),background:false,skipMigrate:true,clickhouse:null,canonical:store,history:null});
   try{expect((await app.inject('/healthz')).statusCode).toBe(200);const c=await pool.connect();try{await c.query('BEGIN');const rows=[];for await(const batch of store.streamCommitted(c,site))rows.push(...batch);expect(rows).toHaveLength(1);expect(rows[0]?.payload).toEqual({event_name:'purchase',props:{accepted:true}});await c.query('COMMIT');}finally{c.release();}expect(await store.readAnyVerifiedEvent(site,eventId)).toBeNull();expect(pool.waitingCount).toBe(0);
    if(attempt===0)await pool.query("INSERT INTO ai_calls(id,site_id,purpose,status,evidence,answer) VALUES($1,$2,'question','complete','{}','safe post-cleanup answer')",[randomUUID(),site]);
    else expect((await pool.query('SELECT answer FROM ai_calls WHERE site_id=$1',[site])).rows.map(row=>row.answer)).toEqual(['safe post-cleanup answer']);
   }finally{await app.close();}
  }
 });
});
