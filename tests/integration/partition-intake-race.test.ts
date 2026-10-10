import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Pool} from 'pg';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {createApp} from '../../src/server/app.js';
import {lockPartitionWrites,lockSite,beginPartitionSnapshot} from '../../src/server/db.js';
import {dropEmptyHistoricalPartitions} from '../../src/server/partitions.js';
/** Real waiting advisory locks coordinate races; no sleep-based assumption of ordering. */
describe.skipIf(!process.env.TEST_DATABASE_URL)('schema partition gate actual HTTP/PG races',()=>{
 const schema=`gate_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:process.env.TEST_DATABASE_URL});
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`,application_name:schema,max:12});
 let instance:Awaited<ReturnType<typeof createApp>>,temporary:string,address:string,site:string;
 beforeAll(async()=>{
  await admin.query(`CREATE SCHEMA ${schema}`);temporary=await mkdtemp(join(tmpdir(),'baize-partition-gate-'));
  instance=await createApp({pool,redis:null,background:false,clickhouse:null,dataDir:join(temporary,'data'),keyDir:join(temporary,'keys'),masterKey:randomBytes(32)});address=await instance.app.listen({host:'127.0.0.1',port:0});
  const setup=await fetch(`${address}/api/setup`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'partition-gate@example.invalid',password:'Actual-partition-gate-password'})});expect(setup.status).toBe(200);const cookie=setup.headers.get('set-cookie')!.split(';')[0];
  const response=await fetch(`${address}/api/v1/sites`,{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({name:'Gate test',domain:'gate.example.invalid',timezone:'UTC'})});expect(response.status).toBe(201);site=(await response.json() as {site:{id:string}}).site.id;
 },30000);
 afterAll(async()=>{await instance?.app.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();if(temporary)await rm(temporary,{recursive:true,force:true});});
 const collect=()=>fetch(`${address}/api/collect`,{method:'POST',headers:{origin:'https://gate.example.invalid','user-agent':'Mozilla/5.0 Chrome/145.0.0.0','content-type':'application/json'},body:JSON.stringify({protocol_version:1,site_id:site,sdk:'partition-race',sent_at:Date.now(),events:[{event_id:randomUUID(),visitor_id:randomUUID(),page_id:randomUUID(),ts:Date.now(),type:'pageview',url:'https://gate.example.invalid/a',path:'/a',props:{flag:true}}]})});
 const waitForLocks=async(mode:string,minimum=1)=>{
  const end=Date.now()+5000;
  while(Date.now()<end){const count=Number((await admin.query("SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.application_name=$1 AND l.locktype='advisory' AND NOT l.granted AND l.mode=$2",[schema,mode])).rows[0].count);if(count>=minimum)return;await new Promise(r=>setTimeout(r,10));}
  throw new Error(`Expected ${minimum} actual waiting ${mode} gate locks`);
 };
 it('holds DDL exclusive gate/relation locks, proves actual HTTP intake waits, then returns 202 after release',async()=>{
  const holder=await pool.connect();let response:Promise<Response>|undefined;
  try{await holder.query('BEGIN');await lockPartitionWrites(holder,true);await holder.query('LOCK TABLE events,event_data IN ACCESS EXCLUSIVE MODE');response=collect();await waitForLocks('ShareLock');expect((await holder.query('SELECT count(*)::int AS count FROM events')).rows[0].count).toBe(0);await holder.query('COMMIT');const result=await response;expect(result.status).toBe(202);expect((await result.json() as {accepted:number}).accepted).toBe(1);}
  finally{await holder.query('ROLLBACK');holder.release();if(response)await response;}
 });
 it('holds actual collector shared gate/site/FK locks; production partition drop waits and both intake/DDL complete',async()=>{
  const holder=await pool.connect();let dropping:ReturnType<typeof dropEmptyHistoricalPartitions>|undefined,response:Promise<Response>|undefined;
  try{
   await holder.query('BEGIN');await lockSite(holder,site);await holder.query('SELECT * FROM sites WHERE id=$1 FOR KEY SHARE',[site]);
   dropping=dropEmptyHistoricalPartitions(pool);await waitForLocks('ExclusiveLock');response=collect();await waitForLocks('ShareLock');await holder.query('COMMIT');const result=await response;expect(result.status).toBe(202);expect((await result.json() as {accepted:number}).accepted).toBe(1);expect((await dropping).dropped).toBeGreaterThan(0);
  }finally{await holder.query('ROLLBACK');holder.release();if(response)await response;if(dropping)await dropping;}
  expect((await pool.query('SELECT count(*)::int AS count FROM events')).rows[0].count).toBe(2);expect((await pool.query("SELECT count(*)::int AS count FROM event_data WHERE data_key='flag' AND boolean_value" )).rows[0].count).toBe(2);
 });
 it('coordinates two production drops with the same stale catalog list; second rechecks missing partitions without deadlock',async()=>{
  // recreate empty old partitions using production DDL before freezing both drop catalog snapshots
  const {ensureMonthPartition}=await import('../../src/server/partitions.js');await ensureMonthPartition(pool,new Date('2020-03-15T00:00:00Z'));
  const holder=await pool.connect();let first:ReturnType<typeof dropEmptyHistoricalPartitions>|undefined,second:ReturnType<typeof dropEmptyHistoricalPartitions>|undefined;
  try{await holder.query('BEGIN');await lockPartitionWrites(holder,true);first=dropEmptyHistoricalPartitions(pool);second=dropEmptyHistoricalPartitions(pool);await waitForLocks('ExclusiveLock',2);await holder.query('COMMIT');const results=await Promise.all([first,second]);expect(results.reduce((sum,result)=>sum+result.dropped,0)).toBe(1);expect((await pool.query("SELECT to_regclass(current_schema()||'.events_2020_03') AS relation")).rows[0].relation).toBe(null);expect((await pool.query('SELECT count(*)::int AS count FROM events')).rows[0].count).toBe(2);}
  finally{await holder.query('ROLLBACK');holder.release();if(first)await first;if(second)await second;}
 });
 it('waits for DDL before pinning RR, then sees relocated default events and boolean EAV in the new partition',async()=>{
  const eventId=randomUUID(),timestamp='2020-04-15T00:00:00Z';
  await pool.query("INSERT INTO events(site_id,event_id,ts,visitor_id,page_id,type,path,payload) VALUES($1,$2,$3,'relocation', $4,'pageview','/old','{}')",[site,eventId,timestamp,randomUUID()]);
  await pool.query("INSERT INTO event_data(site_id,event_id,ts,data_key,data_type,boolean_value) VALUES($1,$2,$3,'flag','b',true)",[site,eventId,timestamp]);
  const ddl=await pool.connect(),reader=await pool.connect();let snapshot:Promise<void>|undefined;
  try{
   await ddl.query('BEGIN');await lockPartitionWrites(ddl,true);await ddl.query('LOCK TABLE events,event_data IN ACCESS EXCLUSIVE MODE');
   snapshot=beginPartitionSnapshot(reader);await waitForLocks('ShareLock');
   // Same row-relocation ordering as production ensureMonthPartition, held open to force the RR race.
   await ddl.query("CREATE TEMP TABLE race_events ON COMMIT DROP AS SELECT * FROM events_default WHERE ts>='2020-04-01' AND ts<'2020-05-01'");
   await ddl.query("CREATE TEMP TABLE race_properties ON COMMIT DROP AS SELECT * FROM event_data WHERE ts>='2020-04-01' AND ts<'2020-05-01'");
   await ddl.query("DELETE FROM events_default WHERE ts>='2020-04-01' AND ts<'2020-05-01'");
   await ddl.query("CREATE TABLE events_2020_04 PARTITION OF events FOR VALUES FROM ('2020-04-01') TO ('2020-05-01')");
   await ddl.query("CREATE TABLE event_data_2020_04 PARTITION OF event_data FOR VALUES FROM ('2020-04-01') TO ('2020-05-01')");
   await ddl.query('INSERT INTO events SELECT * FROM race_events');await ddl.query('INSERT INTO event_data SELECT * FROM race_properties');await ddl.query('COMMIT');await snapshot;
   const result=await reader.query('SELECT e.tableoid::regclass::text AS partition,d.boolean_value FROM events e JOIN event_data d USING(site_id,event_id,ts) WHERE e.site_id=$1 AND e.event_id=$2',[site,eventId]);
   expect(result.rows).toEqual([{partition:'events_2020_04',boolean_value:true}]);expect((await reader.query('SELECT count(*)::int AS count FROM events')).rows[0].count).toBe(3);await reader.query('COMMIT');
  }finally{await ddl.query('ROLLBACK');await reader.query('ROLLBACK');ddl.release();reader.release();if(snapshot)await snapshot;}
 });

});
