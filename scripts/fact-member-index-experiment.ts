/** Isolated actual-DDL PostgreSQL receipt lookup experiment, not CH/auth/SLO. */
import {Pool} from 'pg';
import {randomUUID,createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {writeFile} from 'node:fs/promises';
import {migrate} from '../src/server/db.js';
if(!process.env.TEST_DATABASE_URL)throw Error('Explicit TEST_DATABASE_URL required');
const schema='member_index_'+randomUUID().replaceAll('-',''),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1}),c=await pool.connect();
const output=process.argv.find(v=>v.startsWith('--output='))?.slice(9)??'/tmp/baize-member-index-experiment.json';
const results:unknown[]=[];let created=false;
try{
 await c.query(`CREATE SCHEMA ${schema}`);created=true;await c.query(`SET search_path=${schema}`);await migrate({connect:async()=>({query:c.query.bind(c),release:()=>{}})} as unknown as Pool);
 await c.query('DROP INDEX IF EXISTS analytics_fact_store_members_batch_key,analytics_remaining_fact_members_batch_key');
 const site=randomUUID(),run=randomUUID(),epoch=randomUUID();await c.query("INSERT INTO sites(id,name,domain,salt_secret)VALUES($1,'isolated index experiment','example.invalid','local-only')",[site]);await c.query("INSERT INTO analytics_fact_runs(id,site_id,epoch,generation,outbox_high_watermark,status)VALUES($1,$2,$3,1,0,'published')",[run,site,epoch]);
 for(const count of [25000,50000])for(const remaining of [false,true]){
  const prefix=remaining?'analytics_remaining_fact':'analytics_fact_store',kind=remaining?'members':'effects',table=`${prefix}_members`;
  await c.query(`INSERT INTO ${prefix}_runs(run_id,site_id,kind,state,aggregation_epoch,source_aggregation_epoch)VALUES($1,$2,$3,'complete',$4,$4) ON CONFLICT DO NOTHING`,[run,site,kind,epoch]);
  await c.query(`DELETE FROM ${prefix}_batches`);
  await c.query(`INSERT INTO ${prefix}_batches(id,run_id,site_id,kind,attempt_id,aggregation_epoch,source_aggregation_epoch,row_count,checksum) SELECT md5($1||'batch'||n)::uuid,$1::uuid,$2,$3,md5($1||'attempt'||n)::uuid,$4::uuid,$4::uuid,100,'pending' FROM generate_series(0,$5::int/100-1)n`,[run,site,kind,epoch,count]);
  const common="SELECT $1::uuid,$2,lpad(n::text,64,'0'),md5($1||'batch'||((n-1)/100))::uuid,md5(n::text), 'synthetic-visitor',";
  const tail=remaining?"md5(n::text)::uuid,'2026-01-01'::timestamptz,'2026-01-01'::timestamptz FROM generate_series(1,$3::int)n":"'2026-01-01'::timestamptz,md5(n::text)::uuid,md5(n::text)::uuid FROM generate_series(1,$3::int)n";
  await c.query(`INSERT INTO ${table}(run_id,kind,row_key,batch_id,body_hash,visitor_id,${remaining?'session_id,interval_from,interval_to':'event_ts,session_id,event_id'}) ${common}${tail}`,[run,kind,count]);
  const batches=(await c.query(`SELECT id FROM ${prefix}_batches ORDER BY id`)).rows;
  const runLoop=async()=>{const start=performance.now(),digest=createHash('sha256');let bytes=0,rows=0;for(const batch of batches){const found=(await c.query(`SELECT * FROM ${table} WHERE batch_id=$1 ORDER BY row_key`,[batch.id])).rows;if(found.length!==100)throw Error('EXPERIMENT_EXACT_COUNT');let previous='';for(const row of found){if(row.batch_id!==batch.id||row.row_key<=previous)throw Error('EXPERIMENT_SCOPE_ORDER');previous=row.row_key;}const serialized=JSON.stringify(found);bytes+=Buffer.byteLength(serialized);rows+=found.length;digest.update(serialized);}return {ms:performance.now()-start,rows,bytes,requests:batches.length,digest:digest.digest('hex')};};
  const analyzeStart=performance.now();await c.query(`ANALYZE ${table}`);const baselineAnalyzeMs=performance.now()-analyzeStart;
  const beforePlan=(await c.query(`EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON)SELECT * FROM ${table} WHERE batch_id=$1 ORDER BY row_key`,[batches[0]!.id])).rows[0]['QUERY PLAN'];const before=await runLoop();
  const constraintsBefore=(await c.query('SELECT conname,contype,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid=$1::regclass ORDER BY conname',[table])).rows;
  const start=performance.now();await c.query(`CREATE INDEX experiment_batch_key ON ${table}(batch_id,row_key)`);const indexBuildMs=performance.now()-start;
  const analyze=performance.now();await c.query(`ANALYZE ${table}`);const afterAnalyzeMs=performance.now()-analyze;
  const afterPlan=(await c.query(`EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON)SELECT * FROM ${table} WHERE batch_id=$1 ORDER BY row_key`,[batches[0]!.id])).rows[0]['QUERY PLAN'];const after=await runLoop();if(before.digest!==after.digest||before.rows!==after.rows||before.bytes!==after.bytes)throw Error('EXPERIMENT_ORACLE_MISMATCH');
  const constraintsAfter=(await c.query('SELECT conname,contype,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid=$1::regclass ORDER BY conname',[table])).rows;if(JSON.stringify(constraintsBefore)!==JSON.stringify(constraintsAfter))throw Error('EXPERIMENT_CONSTRAINT_CHANGED');
  results.push({constraintsUnchanged:true,table,count,batchRows:100,baselineAnalyzeMs,indexBuildMs,afterAnalyzeMs,beforePlan,afterPlan,before,after});await c.query('DROP INDEX experiment_batch_key');
 }
}finally{if(created)await c.query(`DROP SCHEMA ${schema} CASCADE`);c.release();await pool.end();}
await writeFile(output,JSON.stringify({sourceCommit:'5ee7afea783918c242321a50e1aaf1dfb7c41f1f',scope:'Actual DDL, synthetic receipt metadata only; no CH/EOF/body authentication/application performance measurement.',results,cleanup:true},null,2)+'\n');
