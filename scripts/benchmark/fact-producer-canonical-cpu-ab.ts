import {createHash,randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {isAbsolute,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import type {PoolClient} from 'pg';
import type {ClickHouseFactStore,FactStoreRecord} from '../../src/server/fact-store.js';
import {canonical} from '../../src/server/security.js';

// SIMULATED diagnostic only: no PostgreSQL connection, HTTP request or ClickHouse instance.
const baselineRoot=process.env.BAIZE_PUBLICATION_BASELINE_ROOT,candidateRoot=process.env.BAIZE_PUBLICATION_CANDIDATE_ROOT;
if(!baselineRoot||!candidateRoot||!isAbsolute(baselineRoot)||!isAbsolute(candidateRoot))throw Error('Absolute trusted baseline/candidate roots required');
const baseline=await import(pathToFileURL(resolve(baselineRoot,'src/server/fact-store.ts')).href),candidate=await import(pathToFileURL(resolve(candidateRoot,'src/server/fact-store.ts')).href);
const site=randomUUID(),run=randomUUID(),epoch=randomUUID(),session=randomUUID(),visitor='simulated-cpu-fixture',salt='same-private-producer-cpu-fixture';
const rows:FactStoreRecord[]=Array.from({length:10000},(_,i)=>({visitorId:visitor,sessionId:session,row:{run_id:run,event_id:`00000000-0000-7000-8000-${String(i+1).padStart(12,'0')}`,event_ts:'2026-10-10T12:00:00.000Z',session_id:session,visitor_id:visitor,event_path:`/cpu-fixture/${i%17}`,dimensions:{channel:i%2?'direct':'email',device:'desktop',test_boolean:true},metric:'pv',key:['same-shape',i%5,true,null],value:1,member:false}}));
const batches=Array.from({length:100},(_,i)=>rows.slice(i*100,i*100+100));
const trials:Record<string,unknown>[]=[];let expectedDigest:string|undefined;
try{
 for(const sourceKind of ['baseline','candidate','baseline','candidate'] as const){
  let pgQueries=0,insertBatches=0,insertRows=0,readbacks=0,memberRows=0,receiptRows=0,fenceChecks=0;
  const attempts=new Map<string,{row_key:string;body:string;body_hash:string}[]>(),emitted:{row_key:string;body:string;body_hash:string}[]=[];
  const query=async(sql:string,args:unknown[]=[])=>{pgQueries++;
   if(sql.startsWith('SELECT pg_advisory_xact_lock('))return {rows:[],rowCount:1};
   if(sql.startsWith('SELECT r.epoch::text,r.status,s.salt_secret FROM analytics_fact_runs'))return {rows:[{epoch,status:'staging',salt_secret:salt}],rowCount:1};
   if(sql.startsWith('SELECT * FROM analytics_fact_store_runs WHERE run_id=$1 AND kind=$2'))return {rows:[],rowCount:0};
   if(sql.startsWith('INSERT INTO analytics_fact_store_runs('))return {rows:[],rowCount:1};
   if(sql.startsWith('SELECT row_key,body_hash FROM analytics_fact_store_members'))return {rows:[],rowCount:0};
   if(sql.startsWith('INSERT INTO analytics_fact_store_batches(')){if(args[9]!==100)throw Error('SIMULATED_RECEIPT_BOUND');receiptRows++;return {rows:[],rowCount:1};}
   if(sql.startsWith('INSERT INTO analytics_fact_store_members(')){const members=JSON.parse(String(args[0])) as unknown[];if(members.length!==100)throw Error('SIMULATED_MEMBER_BOUND');memberRows+=members.length;return {rows:[],rowCount:members.length};}
   throw Error('SIMULATED_UNEXPECTED_PG_QUERY');
  };
  const transport:typeof fetch=async(input,init)=>{const url=new URL(String(input)),sql=url.searchParams.get('query')??'';
   if(sql==='INSERT INTO baize_derived_facts_v1 FORMAT JSONEachRow'){
    const uploaded=String(init?.body).split('\n').map(line=>JSON.parse(line) as {attempt_id:string;row_key:string;body:string;body_hash:string});if(uploaded.length!==100)throw Error('SIMULATED_UPLOAD_BOUND');insertBatches++;insertRows+=uploaded.length;const normalized=uploaded.map(({row_key,body,body_hash})=>({row_key,body,body_hash}));attempts.set(uploaded[0]!.attempt_id,normalized);emitted.push(...normalized);return new Response('',{status:200});
   }
   if(sql.startsWith('SELECT row_key,body,body_hash FROM baize_derived_facts_v1 ')&&sql.endsWith('ORDER BY row_key LIMIT 101 FORMAT JSON')){readbacks++;const attempt=url.searchParams.get('param_attempt');if(!attempt||!attempts.has(attempt))throw Error('SIMULATED_UNKNOWN_ATTEMPT');return new Response(JSON.stringify({data:attempts.get(attempt)!.slice().sort((a,b)=>a.row_key.localeCompare(b.row_key))}),{status:200});}
   throw Error('SIMULATED_UNEXPECTED_CH_QUERY');
  };
  const Store=sourceKind==='baseline'?baseline.ClickHouseFactStore:candidate.ClickHouseFactStore;
  const store:ClickHouseFactStore=new Store({url:'http://simulated.invalid',username:'simulated',password:'simulated',fetch:transport});
  const client={query} as unknown as PoolClient,fence={expectedAggregationEpoch:epoch,verifyLiveFence:async()=>{fenceChecks++;}};
  const cpuStart=process.cpuUsage(),start=performance.now();for(let i=0;i<batches.length;i+=2)await store.stageBatches(client,site,run,'effects',batches.slice(i,i+2),fence,{concurrency:2});await store.completeRunKind(client,site,run,'effects',fence);await store.completeRunKind(client,site,run,'vitals',fence);const wallMs=performance.now()-start,cpu=process.cpuUsage(cpuStart);
  if(insertBatches!==100||insertRows!==10000||readbacks!==100||memberRows!==10000||receiptRows!==100)throw Error('SIMULATED_COUNT_MISMATCH');
  const digest=createHash('sha256').update(emitted.map(row=>canonical(row)).sort().join('\n')).digest('hex');if(expectedDigest&&digest!==expectedDigest)throw Error('SIMULATED_SEMANTIC_MISMATCH');expectedDigest=digest;
  trials.push({sourceKind,width:2,wallMs,cpuUserMs:cpu.user/1000,cpuSystemMs:cpu.system/1000,cpuTotalMs:(cpu.user+cpu.system)/1000,pgQueries,insertBatches,insertRows,readbacks,memberRows,receiptRows,fenceChecks,digest});
 }
 const result={kind:'SIMULATED_producer_canonical_CPU_microbench',status:'passed',sourceOrder:['baseline','candidate','baseline','candidate'],rows:10000,logicalBatchRows:100,trials,boundary:'Zero-latency simulated PG/CH transport; actual source classes execute canonicalization, HMAC and readback hash verification. Not real PG/CH acceptance, throughput, application scale or SLO.'};const json=JSON.stringify(result,null,2)+'\n';if(process.env.BAIZE_PUBLICATION_AB_OUTPUT)await writeFile(process.env.BAIZE_PUBLICATION_AB_OUTPUT,json,{mode:0o600});process.stdout.write(json);
}catch(error){if(process.env.BAIZE_PUBLICATION_AB_OUTPUT)await writeFile(process.env.BAIZE_PUBLICATION_AB_OUTPUT,JSON.stringify({kind:'SIMULATED_producer_canonical_CPU_microbench',status:'failed',trials,error:error instanceof Error?error.message:'unknown'},null,2)+'\n',{mode:0o600});throw error;}
