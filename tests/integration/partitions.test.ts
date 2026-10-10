import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {migrate} from '../../src/server/db.js';
import {ensureMonthPartition,dropEmptyHistoricalPartitions} from '../../src/server/partitions.js';
import {enforceRetention} from '../../src/server/worker.js';
describe.skipIf(!process.env.TEST_DATABASE_URL)('real partition relocation and per-site retention',()=>{
 const schema='part_'+randomUUID().replaceAll('-','');const admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});let pool:pg.Pool;
 beforeAll(async()=>{await admin.query(`CREATE SCHEMA ${schema}`);pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`});await migrate(pool);for(const [id,days] of [['short',1],['long',3650]] as const){await pool.query('INSERT INTO sites(id,name,domain,salt_secret,retention_days) VALUES($1,$1,$1,$1,$2)',[id,days]);await pool.query('INSERT INTO aggregation_state(site_id) VALUES($1)',[id]);}});
 afterAll(async()=>{await pool?.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
 it('moves populated default rows and boolean EAV atomically, preserving partition PK semantics',async()=>{
  const ts='2020-04-15T00:00:00Z',id=randomUUID(),page=randomUUID();
  for(const site of ['short','long']){await pool.query("INSERT INTO events(site_id,event_id,ts,visitor_id,page_id,type,path,payload) VALUES($1,$2,$3,'visitor',$4,'event','/old','{}')",[site,id,ts,page]);await pool.query("INSERT INTO event_data(site_id,event_id,ts,data_key,data_type,boolean_value) VALUES($1,$2,$3,'paid','b',true)",[site,id,ts]);}
  expect(await ensureMonthPartition(pool,new Date(ts))).toBe(true);expect(await ensureMonthPartition(pool,new Date(ts))).toBe(false);
  expect((await pool.query('SELECT tableoid::regclass::text relation FROM events')).rows.every(r=>r.relation.endsWith('events_2020_04'))).toBe(true);
  expect((await pool.query('SELECT boolean_value FROM event_data')).rows).toEqual([{boolean_value:true},{boolean_value:true}]);
  await expect(pool.query("INSERT INTO events(site_id,event_id,ts,visitor_id,page_id,type,path,payload) VALUES('long',$1,$2,'visitor',$3,'event','/old','{}')",[id,ts,page])).rejects.toMatchObject({code:'23505'});
 });
 it('retains another site in a shared partition and drops it only after the last site expires',async()=>{
  expect(await enforceRetention(pool)).toBe(1);expect((await pool.query('SELECT site_id FROM events')).rows).toEqual([{site_id:'long'}]);
  expect((await dropEmptyHistoricalPartitions(pool)).dropped).toBe(0);expect((await pool.query('SELECT count(*)::int n FROM event_data')).rows[0].n).toBe(1);
  await pool.query("UPDATE sites SET retention_days=1 WHERE id='long'");expect(await enforceRetention(pool)).toBe(1);expect((await dropEmptyHistoricalPartitions(pool)).dropped).toBe(1);
  expect((await pool.query("SELECT to_regclass(current_schema()||'.events_2020_04') relation")).rows[0].relation).toBe(null);
 });
});
