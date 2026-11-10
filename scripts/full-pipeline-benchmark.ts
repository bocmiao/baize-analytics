/** Real local HTTP/Redis/PostgreSQL acceptance. Never alters production limits. */
import {execFileSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,mkdtemp,rm,writeFile,statfs} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import pg from 'pg';
import Redis from 'ioredis';
import {createApp} from '../src/server/app.js';
import {runWorkerOnce} from '../src/server/worker.js';
import {queryStats} from '../src/server/analytics.js';
const arg=(name:string,fallback:string)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.split('=')[1]??fallback;
const events=Number(arg('events','100000')),sitesCount=Number(arg('sites','40'));
if(!Number.isInteger(events)||events<50||events>1000000||!Number.isInteger(sitesCount)||sitesCount<20||sitesCount>40||events%(50*sitesCount))throw new Error('Require 20–40 sites and events divisible by 50*sites, at most 1M');
const rounds=events/(50*sitesCount),schema=`bench_${randomBytes(8).toString('hex')}`;
const connectionString=process.env.TEST_DATABASE_URL??process.env.DATABASE_URL??'postgresql://baize_dev@127.0.0.1:5432/baize_dev';
const admin=new pg.Pool({connectionString,max:1});
const pool=new pg.Pool({connectionString,max:10,options:`-c search_path=${schema},public`});
const redis=new Redis(process.env.REDIS_URL??'redis://127.0.0.1:6379',{maxRetriesPerRequest:1,enableOfflineQueue:false});
redis.on('error',()=>{});
const temporary=await mkdtemp(join(tmpdir(),'baize-benchmark-'));
const artifact=resolve(arg('output',`.baize/test-evidence/full-pipeline-${events}.json`));
const results:Record<string,unknown>={status:'running',events,sites:sitesCount,rounds,batchSize:50,rate:'at most one batch per site per second',background:false,storage:'PostgreSQL; ClickHouse explicitly disabled',startedAt:new Date().toISOString(),sourceHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceBoundary:'Working tree may contain uncommitted changes; startup HEAD is not a complete source snapshot',schema};
let instance:Awaited<ReturnType<typeof createApp>>|undefined,peakRss=process.memoryUsage().rss;
const sampler=setInterval(()=>{peakRss=Math.max(peakRss,process.memoryUsage().rss);},100);sampler.unref();
const latencies:number[]=[];const workerLatencies:number[]=[];
const percentiles=(values:number[])=>{const sorted=[...values].sort((a,b)=>a-b);const at=(p:number)=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]??0;return {count:sorted.length,p50Ms:at(.5),p95Ms:at(.95),p99Ms:at(.99),maxMs:sorted.at(-1)??0};};
const check=(condition:unknown,message:string)=>{if(!condition)throw new Error(message);};
try{
 const directory=String((await admin.query('SHOW data_directory')).rows[0].data_directory);
 const disk=await statfs(directory).catch(()=>statfs(process.cwd()));results.diskProbe='PostgreSQL data directory if locally accessible, otherwise workspace filesystem (container backing storage must be separately verified)';const available=Number(disk.bavail)*Number(disk.bsize);results.diskAvailableBeforeBytes=available;
 check(available>(events>100000?5:1)*1024**3,'Insufficient PostgreSQL filesystem free space for this benchmark');
 await redis.ping();await admin.query(`CREATE SCHEMA ${schema}`);
 instance=await createApp({pool,redis,background:false,clickhouse:null,dataDir:join(temporary,'data'),keyDir:join(temporary,'keys'),masterKey:randomBytes(32),publicUrl:'http://127.0.0.1'});
 const address=await instance.app.listen({host:'127.0.0.1',port:0});results.httpAddress=address;
 const setup=await fetch(`${address}/api/setup`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'benchmark@example.invalid',password:randomBytes(24).toString('hex'),name:'隔离规模验收'})});
 check(setup.ok,'HTTP admin setup failed');const cookie=setup.headers.get('set-cookie')?.split(';')[0];check(cookie,'Setup cookie missing');
 const siteIds:string[]=[];
 for(let i=0;i<sitesCount;i++){const response=await fetch(`${address}/api/v1/sites`,{method:'POST',headers:{'content-type':'application/json',cookie:cookie!},body:JSON.stringify({name:`Benchmark ${i}`,domain:'benchmark.example.invalid',timezone:'UTC',privacy_mode:'standard'})});check(response.status===201,`Site setup HTTP ${response.status}`);siteIds.push((await response.json() as {site:{id:string}}).site.id);}
 const hour=Math.floor(Date.now()/3600000)*3600000-3600000;
 const intakeStart=performance.now();let accepted=0;
 for(let round=0;round<rounds;round++){
  const roundStart=performance.now();
  await Promise.all(siteIds.map(async(siteId)=>{
   const visitor=randomUUID();const batch=Array.from({length:50},(_,i)=>({event_id:randomUUID(),type:'pageview',ts:hour+1000+round*100+i,visitor_id:visitor,page_id:randomUUID(),url:`https://benchmark.example.invalid/page/${i%10}`,path:`/page/${i%10}`,screen:'1920x1080',language:'zh-CN'}));
   const start=performance.now();const response=await fetch(`${address}/api/collect`,{method:'POST',headers:{'content-type':'application/json',origin:'https://benchmark.example.invalid','user-agent':'Mozilla/5.0 Chrome/145.0.0.0'},body:JSON.stringify({protocol_version:1,site_id:siteId,sdk:'pipeline-benchmark',sent_at:Date.now(),events:batch})});latencies.push(performance.now()-start);
   check(response.status===202,`Collector HTTP ${response.status}; rate/bot limits were not bypassed`);
   const body=await response.json() as {accepted:number;duplicates:number;rejected:unknown[]};check(body.accepted===50&&body.duplicates===0&&body.rejected.length===0,'Collector did not accept exactly 50 unique events');accepted+=body.accepted;
  }));
  if((round+1)%10===0)process.stdout.write(JSON.stringify({phase:'collect',round:round+1,rounds,accepted,elapsedMs:performance.now()-intakeStart})+'\n');
  if(round+1<rounds)await new Promise(r=>setTimeout(r,Math.max(0,1000-(performance.now()-roundStart))));
 }
 results.accepted=accepted;results.intakeMs=performance.now()-intakeStart;results.httpBatchLatency=percentiles(latencies);
 const before=(await pool.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE status='queued')::int AS queued FROM outbox")).rows[0];results.outboxBeforeWorker=before;check(before.total===events&&before.queued===events,'Intake did not leave all durable outbox rows queued');
 const workerStart=performance.now();let processed=0;
 while(processed<sitesCount){const start=performance.now();check(await runWorkerOnce(pool),'Worker failed or skipped a dirty site');workerLatencies.push(performance.now()-start);processed++;process.stdout.write(JSON.stringify({phase:'worker',processed,sites:sitesCount,elapsedMs:performance.now()-workerStart})+'\n');}
 results.workerMs=performance.now()-workerStart;results.workerSiteLatency=percentiles(workerLatencies);
 const state=(await pool.query("SELECT count(*)::int AS sites,count(*) FILTER(WHERE generation<>processed_generation)::int AS dirty,count(*) FILTER(WHERE processed_generation=0 OR watermark IS NULL)::int AS uncovered,sum(attempts)::int AS attempts FROM aggregation_state")).rows[0];results.aggregationState=state;check(state.sites===sitesCount&&state.dirty===0&&state.uncovered===0&&state.attempts===0,'Worker high-water/generation reconciliation failed');
 const outbox=(await pool.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE status='queued')::int AS queued,count(*) FILTER(WHERE status='done')::int AS done FROM outbox")).rows[0];results.outboxAfterWorker=outbox;check(outbox.queued===0,'Pending durable outbox rows remain');
 const raw=(await pool.query('SELECT count(*)::int AS pv,count(DISTINCT (site_id,visitor_id))::int AS uv FROM events')).rows[0];
 const sessions=Number((await pool.query('SELECT count(*) FROM sessions')).rows[0].count);results.sql={...raw,sessions};check(raw.pv===events&&raw.uv===events/50&&sessions===events/50,'Raw SQL/session totals mismatch');
 const queryStart=performance.now();let pv=0,uv=0,sessionTotal=0;
 for(const siteId of siteIds){const stats=await queryStats(instance.ctx,siteId,new Date(hour).toISOString(),new Date(hour+3600000).toISOString());check(stats.coverage===1,'Stats coverage is incomplete');check(stats.totals.pv===rounds*50&&stats.totals.uv===rounds&&stats.totals.sessions===rounds,'Per-site queryStats totals mismatch');pv+=stats.totals.pv;uv+=stats.totals.uv!;sessionTotal+=stats.totals.sessions;}
 results.queryMs=performance.now()-queryStart;results.queryStatsTotals={pv,uv,sessions:sessionTotal};
 results.schemaBytes=Number((await pool.query("SELECT coalesce(sum(pg_total_relation_size(c.oid)),0)::text AS bytes FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind IN('r','m')",[schema])).rows[0].bytes);
 results.status='passed';
}catch(error){results.status='failed';results.error=error instanceof Error?error.message:'Benchmark failed';process.exitCode=1;}
finally{
 clearInterval(sampler);results.peakNodeRssBytes=peakRss;results.finishedAt=new Date().toISOString();
 await instance?.app.close();redis.disconnect();await pool.end();
 await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();await rm(temporary,{recursive:true,force:true});results.isolatedSchemaRemoved=true;
 await mkdir(resolve(artifact,'..'),{recursive:true});await writeFile(artifact,JSON.stringify(results,null,2)+'\n');process.stdout.write(JSON.stringify({artifact,...results})+'\n');
}
