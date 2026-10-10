import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {migrate,transaction} from '../../src/server/db.js';
import {CanonicalClickHouse,canonicalEventBody,canonicalEventChecksum} from '../../src/server/canonical-clickhouse.js';
import type {StoredEvent} from '../../src/server/clickhouse-store.js';
import {shadowCanonicalBatch,verifyCanonicalShadow} from '../../src/server/canonical-migration.js';
describe.skipIf(!process.env.TEST_DATABASE_URL||!process.env.CLICKHOUSE_TEST_URL)('shadow verification actual PG/CH max1',()=>{
 const schema='shadow_verify_'+randomUUID().replaceAll('-',''),site=randomUUID(),epoch=randomUUID(),event=randomUUID(),visitor=randomUUID();
 const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1,options:`-c search_path=${schema}`});
 const store=new CanonicalClickHouse({url:process.env.CLICKHOUSE_TEST_URL!,username:'baize',password:'local-test-only'});
 beforeAll(async()=>{await admin.query(`CREATE SCHEMA ${schema}`);await migrate(pool);await store.initialize();await pool.query("INSERT INTO sites(id,name,domain,salt_secret) VALUES($1,'shadow','example.test','salt')",[site]);await pool.query('INSERT INTO aggregation_state(site_id) VALUES($1)',[site]);await pool.query('INSERT INTO event_keys(site_id,event_id,hash,ts,visitor_id) VALUES($1,$2,\'accepted\',now(),$3)',[site,event,visitor]);await pool.query("INSERT INTO events(site_id,event_id,visitor_id,page_id,ts,type,path,payload,dimensions) VALUES($1,$2,$3,$4,now(),'event','/', $5,'{}')",[site,event,visitor,randomUUID(),{event_name:'purchase',props:{flag:true}}]);});
 afterAll(async()=>{await store.eraseEventID(site,event);await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
 it('checks body against committed PG, repairs identity rewrite, then records exact fenced validation',async()=>{
  await transaction(pool,c=>shadowCanonicalBatch(c,store,site,epoch));
  const before=await transaction(pool,c=>verifyCanonicalShadow(c,store,site));expect(before.verified).toBe(1);
  await pool.query("UPDATE events SET payload=payload||'{\"user_id\":\"changed\"}'::jsonb WHERE site_id=$1",[site]);
  await expect(transaction(pool,c=>verifyCanonicalShadow(c,store,site))).rejects.toThrow('CHECKSUM_FENCE');
  expect(await transaction(pool,c=>shadowCanonicalBatch(c,store,site,epoch))).toMatchObject({repaired:1,copied:1});
  expect(await transaction(pool,c=>verifyCanonicalShadow(c,store,site))).toMatchObject({verified:1,epoch});
  expect((await store.readAnyVerifiedEvent(site,event))?.payload.user_id).toBe('changed');
  expect(pool.waitingCount).toBe(0);
 });
 it('does not let an uncommitted same-hash orphan authorize verification; shadow repairs the missing committed attempt',async()=>{
  const row=(await pool.query('SELECT * FROM events WHERE site_id=$1 AND event_id=$2',[site,event])).rows[0] as StoredEvent;
  const old=(await pool.query('SELECT attempt_id FROM canonical_event_batches b JOIN canonical_event_members m USING(site_id,batch_id) WHERE m.site_id=$1 AND m.event_id=$2',[site,event])).rows[0].attempt_id;
  const request=async(query:string,params:Record<string,string>={},body?:string)=>{const url=new URL(process.env.CLICKHOUSE_TEST_URL!);url.searchParams.set('query',query);for(const [key,value] of Object.entries(params))url.searchParams.set('param_'+key,value);const response=await fetch(url,{method:'POST',headers:{'X-ClickHouse-User':'baize','X-ClickHouse-Key':'local-test-only'},body});expect(response.ok,await response.text()).toBe(true);};
  await request('ALTER TABLE baize_canonical_batches_v1 DELETE WHERE site_id={site:String} AND attempt_id={attempt:UUID} SETTINGS mutations_sync=2',{site,attempt:old});
  await request('INSERT INTO baize_canonical_batches_v1 FORMAT JSONEachRow',{},JSON.stringify({site_id:site,attempt_id:randomUUID(),event_id:event,ts:new Date(row.ts).toISOString().replace('T',' ').replace('Z',''),visitor_id:row.visitor_id,body:canonicalEventBody(row),body_hash:canonicalEventChecksum(row)}));
  expect((await store.readAnyVerifiedEvent(site,event))?.event_id).toBe(event);
  await expect(transaction(pool,c=>verifyCanonicalShadow(c,store,site))).rejects.toThrow('CANONICAL_UNAVAILABLE');
  expect(await transaction(pool,c=>shadowCanonicalBatch(c,store,site,epoch))).toMatchObject({repaired:1});
  expect(await transaction(pool,c=>verifyCanonicalShadow(c,store,site))).toMatchObject({verified:1});
 });
 it('removes expired shadow bodies with physical acknowledgement before accepting an empty verified snapshot',async()=>{
  await pool.query('DELETE FROM events WHERE site_id=$1',[site]);
  await expect(transaction(pool,c=>verifyCanonicalShadow(c,store,site))).rejects.toThrow('SHADOW_STALE');
  expect(await transaction(pool,c=>shadowCanonicalBatch(c,store,site,epoch))).toMatchObject({removed:1});
  expect(await store.readAnyVerifiedEvent(site,event)).toBeNull();
  expect(await transaction(pool,c=>verifyCanonicalShadow(c,store,site))).toMatchObject({verified:0});
 });
});
