import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Pool} from 'pg';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {createApp} from '../../src/server/app.js';
import {runGovernance} from '../../src/server/governance-worker.js';
import {dropEmptyHistoricalPartitions,ensureMonthPartition} from '../../src/server/partitions.js';
import {runWorkerOnce} from '../../src/server/worker.js';
import {seal} from '../../src/server/keyring.js';
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};};
describe.skipIf(!process.env.TEST_DATABASE_URL)('actual max10 governance/DDL/eight HTTP pool coordination',()=>{
 const schema=`poolrace_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1});
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`,application_name:schema,max:10});
 let instance:Awaited<ReturnType<typeof createApp>>,temporary:string,address:string,site:string,schedule:string;
 const end=new Date(Math.floor(Date.now()/3600000)*3600000);
 const collect=(historical=false)=>fetch(`${address}/api/collect`,{method:'POST',headers:{origin:'https://pool-race.example.invalid','user-agent':'Mozilla/5.0 Chrome/145.0.0.0','content-type':'application/json'},body:JSON.stringify({protocol_version:1,site_id:site,sdk:'max10-race',sent_at:Date.now(),events:[{event_id:randomUUID(),visitor_id:randomUUID(),page_id:randomUUID(),ts:historical?+end-3600000:Date.now(),type:'pageview',url:`https://pool-race.example.invalid/${historical?'baseline':'concurrent'}`,path:historical?'/baseline':'/concurrent',props:{flag:true}}]})});
 const until=async(predicate:()=>Promise<boolean>,message:string)=>{const deadline=Date.now()+5000;while(Date.now()<deadline){if(await predicate())return;await new Promise(r=>setTimeout(r,10));}throw new Error(message);};
 const waitLocks=(mode:string,count:number)=>until(async()=>Number((await admin.query("SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a USING(pid) WHERE a.application_name=$1 AND l.locktype='advisory' AND NOT l.granted AND l.mode=$2",[schema,mode])).rows[0].count)>=count,`Expected ${count} waiting ${mode} advisory locks`);
 beforeAll(async()=>{
  await admin.query(`CREATE SCHEMA ${schema}`);temporary=await mkdtemp(join(tmpdir(),'baize-pool-race-'));instance=await createApp({pool,redis:null,background:false,clickhouse:null,dataDir:join(temporary,'data'),keyDir:join(temporary,'keys'),masterKey:randomBytes(32)});address=await instance.app.listen({host:'127.0.0.1',port:0});
  const setup=await fetch(`${address}/api/setup`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'pool-race@example.invalid',password:'Actual-pool-race-password'})});expect(setup.status).toBe(200);const cookie=setup.headers.get('set-cookie')!.split(';')[0];
  const response=await fetch(`${address}/api/v1/sites`,{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({name:'pool race',domain:'pool-race.example.invalid',timezone:'UTC'})});expect(response.status).toBe(201);site=(await response.json() as {site:{id:string}}).site.id;
  expect((await collect(true)).status).toBe(202);expect(await runWorkerOnce(pool)).toBe(true);
  const report=randomUUID(),channel=randomUUID();schedule=randomUUID();
  await pool.query("INSERT INTO reports(id,site_id,name,dsl) VALUES($1,$2,'Actual report',$3)",[report,site,{from:new Date(+end-86400000).toISOString(),to:end.toISOString(),path:'/baseline'}]);
  // No external message is sent: deliberately incomplete SMTP fixture fails locally before transport creation.
  await pool.query("INSERT INTO notification_channels(id,site_id,kind,encrypted_config) VALUES($1,$2,'smtp',$3)",[channel,site,seal({},instance.ctx.config)]);
  await pool.query("INSERT INTO report_schedules(id,site_id,report_id,channel_id,cadence,next_at) VALUES($1,$2,$3,$4,'daily',$5)",[schedule,site,report,channel,end]);
 },30000);
 afterAll(async()=>{await instance?.app.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();if(temporary)await rm(temporary,{recursive:true,force:true});});
 const coordinated=async(throws=false)=>{
  const entered=deferred(),resume=deferred();
  const governance=runGovernance(instance.ctx,{beforeStats:async()=>{entered.resolve();await resume.promise;if(throws)throw new Error('Injected beforeStats rollback verification');}});
  // Attach a rejection observer immediately, without replacing the genuine production error path.
  const governanceOutcome=governance.then(()=>({ok:true}),error=>({ok:false,error}));await entered.promise;
  const ddl=dropEmptyHistoricalPartitions(pool);await waitLocks('ExclusiveLock',1);
  const requests=Array.from({length:8},()=>collect());await waitLocks('ShareLock',8);
  expect(pool.totalCount).toBe(10);expect(pool.idleCount).toBe(0);
  // An actual eleventh query proves the pool is exhausted while G still owns its gate/connection.
  const sentinel=pool.query('SELECT 1 AS resumed');await until(async()=>pool.waitingCount===1,'Expected actual pool waitingCount=1');resume.resolve();
  const [outcome,dropped,responses,resumed]=await Promise.all([governanceOutcome,ddl,Promise.all(requests),sentinel]);
  expect(outcome.ok).toBe(!throws);if(throws)expect('error' in outcome&&String(outcome.error)).toContain('Injected beforeStats rollback');
  expect(dropped.dropped).toBeGreaterThan(0);expect(resumed.rows).toEqual([{resumed:1}]);for(const response of responses){expect(response.status).toBe(202);expect((await response.json() as {accepted:number}).accepted).toBe(1);}
  expect(pool.waitingCount).toBe(0);
  expect(Number((await admin.query("SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a USING(pid) WHERE a.application_name=$1 AND l.locktype='advisory'",[schema])).rows[0].count)).toBe(0);
 };
 it('completes real filtered report with the same G client, DDL and eight HTTP intakes despite an exhausted pool',async()=>{
  await coordinated();const jobs=(await pool.query('SELECT body FROM notification_jobs WHERE site_id=$1',[site])).rows;expect(jobs).toHaveLength(1);expect(jobs[0].body).toMatchObject({stats:{pv:1,uv:1,sessions:1},filters:{path:'/baseline'},coverage:1});expect(jobs[0].body.filters.client).toBeUndefined();expect((await pool.query('SELECT count(*)::int AS count FROM events WHERE site_id=$1',[site])).rows[0].count).toBe(9);
 },15000);
 it('rolls back an injected scheduling error and releases G/shared locks so real DDL and all HTTP collectors still finish',async()=>{
  await pool.query('UPDATE report_schedules SET next_at=$2 WHERE id=$1',[schedule,end]);await ensureMonthPartition(pool,new Date('2020-02-15T00:00:00Z'));await coordinated(true);
  expect((await pool.query('SELECT next_at FROM report_schedules WHERE id=$1',[schedule])).rows[0].next_at).toEqual(end);
  expect((await pool.query('SELECT count(*)::int AS count FROM notification_jobs WHERE site_id=$1',[site])).rows[0].count).toBe(1);expect((await pool.query('SELECT count(*)::int AS count FROM events WHERE site_id=$1',[site])).rows[0].count).toBe(17);
 },15000);
});
