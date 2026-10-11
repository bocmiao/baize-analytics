import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {Pool,type PoolClient} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {migrate} from '../../src/server/db.js';
import {factCoverageMetadataDigest} from '../../src/server/fact-coverage-witness.js';
import {ClickHouseFactStore} from '../../src/server/fact-store.js';
import {publishRunFactBodies} from '../../src/server/fact-store-publication.js';

/** Actual CH-sealed body remains fully read/authenticated. This experiment only
 * compares identical PG metadata digests and scoped SQL cost; it is not an SLO. */
describe.skipIf(!process.env.TEST_DATABASE_URL||!process.env.CLICKHOUSE_TEST_URL)('single-closure selected-run SQL reuse real PG CH oracle',()=>{
 const rowOption=process.env.BAIZE_COVERAGE_MICRO_ROWS??'130';
 if(!['130','10000'].includes(rowOption))throw Error('BAIZE_COVERAGE_MICRO_ROWS must be 130 or 10000');
 const microRows=Number(rowOption);
 const pairOption=process.env.BAIZE_COVERAGE_MICRO_PAIRS??'1';
 if(!['1','3'].includes(pairOption))throw Error('BAIZE_COVERAGE_MICRO_PAIRS must be 1 or 3');
 const microPairs=Number(pairOption);
 if(microRows===10000&&!process.env.BAIZE_COVERAGE_MICRO_OUTPUT)throw Error('10000-row micro requires BAIZE_COVERAGE_MICRO_OUTPUT');
 const schema='coverage_selected_'+randomUUID().replaceAll('-',''),site=randomUUID(),epoch=randomUUID(),old=randomUUID(),empty=randomUUID(),head=randomUUID(),session=randomUUID(),retired=randomUUID(),visitor='coverage-oracle-'+randomUUID();
 const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1,options:`-c search_path=${schema}`});
 const facts=new ClickHouseFactStore({url:process.env.CLICKHOUSE_TEST_URL!,username:'baize',password:'local-test-only'}),fence={expectedAggregationEpoch:epoch,verifyLiveFence:async()=>{}};
 async function tx(fn:(c:PoolClient)=>Promise<void>,commit=false){const c=await pool.connect();try{await c.query(commit?'BEGIN':'BEGIN ISOLATION LEVEL REPEATABLE READ');await fn(c);await c.query(commit?'COMMIT':'ROLLBACK');}catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}}
 beforeAll(async()=>{
  await admin.query(`CREATE SCHEMA ${schema}`);await migrate(pool);await facts.initialize();await pool.query("INSERT INTO sites(id,name,domain,salt_secret) VALUES($1,'digest oracle','example.test','test-private')",[site]);await pool.query('INSERT INTO aggregation_state(site_id,epoch,generation,processed_generation) VALUES($1,$2,2,2)',[site,epoch]);
  await tx(async c=>{
   for(const [run,version,generation]of [[old,2,1],[empty,1,1],[head,2,2]] as const)await c.query("INSERT INTO analytics_fact_runs(id,site_id,epoch,generation,outbox_high_watermark,status,query_version,retained_from) VALUES($1,$2,$3,$4,0,'staging',$5,'2026-10-01T00:00:00Z')",[run,site,epoch,generation,version]);
   for(let i=0;i<microRows;i++)await c.query("INSERT INTO analytics_effect_facts VALUES($1,$2,'2026-10-01T10:00:00Z',$3,$4,'/unicode/路径','{\"channel\":\"direct\"}','pv','[]',1,false)",[old,randomUUID(),session,visitor]);
   for(const run of [old,empty,head]){await publishRunFactBodies(c,facts,site,run,fence);await c.query("UPDATE analytics_fact_runs SET status='published' WHERE id=$1",[run]);}
   await c.query('INSERT INTO analytics_session_contribution_heads VALUES($1,$2,$3,$4,$5,1)',[site,session,visitor,old,epoch]);await c.query('INSERT INTO analytics_session_contribution_heads VALUES($1,$2,$3,$4,$5,1)',[site,retired,visitor,empty,epoch]);
   await c.query('DELETE FROM analytics_effect_facts WHERE run_id=$1',[old]);
  },true);
 });
 afterAll(async()=>{await tx(async c=>{await facts.eraseSegments(c,site,[{visitorId:visitor}]);},true);await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
 async function measured(c:PoolClient,reuse:boolean){
  const query=c.query.bind(c),stats={calls:0,sqlMs:0,selectedPopulationCalls:0};
  const tables=['analytics_session_contribution_heads','analytics_carry_heads','analytics_relational_buckets','analytics_session_rebuild_requests','analytics_fact_runs','analytics_header_runs','analytics_header_batches','analytics_header_members','analytics_fact_store_runs','analytics_fact_store_batches','analytics_fact_store_members','analytics_remaining_fact_runs','analytics_remaining_fact_batches','analytics_remaining_fact_members'] as const;
  const perTable=Object.fromEntries(tables.map(table=>[table,{declareCalls:0,declareMs:0,fetchCalls:0,fetchMs:0,fetchRows:0,closeMs:0}]));
  const cursors=new Map<string,(typeof tables)[number]>();
  c.query=((sql:string,args?:unknown[])=>{
   const start=performance.now();stats.calls++;if(sql.startsWith('INSERT INTO coverage_selected_'))stats.selectedPopulationCalls++;
   const declaration=/^DECLARE (\w+) .*?FROM (analytics_\w+) t/.exec(sql);
   if(declaration&&tables.includes(declaration[2] as (typeof tables)[number]))cursors.set(declaration[1],declaration[2] as (typeof tables)[number]);
   const cursor=/^(?:DECLARE|CLOSE) (\w+)|^FETCH FORWARD 100 FROM (\w+)/.exec(sql),table=cursor?cursors.get(cursor[1]??cursor[2]):undefined;
   return query(sql,args).then(result=>{if(table&&sql.startsWith('FETCH')){expect(result.rows.length).toBeLessThanOrEqual(100);perTable[table].fetchRows+=result.rows.length;}return result;}).finally(()=>{
    const ms=performance.now()-start;stats.sqlMs+=ms;
    if(table){const item=perTable[table];if(sql.startsWith('DECLARE')){item.declareCalls++;item.declareMs+=ms;}else if(sql.startsWith('FETCH')){item.fetchCalls++;item.fetchMs+=ms;}else if(sql.startsWith('CLOSE'))item.closeMs+=ms;}
   });
  }) as PoolClient['query'];
  const start=performance.now();try{const digest=await factCoverageMetadataDigest(c,site,{selectedRunReuse:reuse});return {digest,wallMs:performance.now()-start,...stats,perTable};}finally{c.query=query;}
 }
 async function bodyOracle(c:PoolClient){let n=0;for await(const rows of facts.streamRunRows(c,site,old,'effects')){expect(rows.length).toBeLessThanOrEqual(100);n+=rows.length;}expect(n).toBe(microRows);}
 it('preserves every digest byte/count and empty retired owner with real pruned sealed facts, including timezone restoration',async()=>{
  await tx(async c=>{await bodyOracle(c);const before=(await c.query('SELECT * FROM analytics_fact_store_batches WHERE run_id=$1 ORDER BY id',[old])).rows;await c.query("SET LOCAL TimeZone='Asia/Tokyo'");const pairs=[];for(let pair=0;pair<microPairs;pair++){const order=pair%2===0?'baseline_candidate':'candidate_baseline';const first=await measured(c,pair%2!==0),second=await measured(c,pair%2===0);const baseline=pair%2===0?first:second,candidate=pair%2===0?second:first;expect(candidate.digest).toEqual(baseline.digest);expect(candidate.selectedPopulationCalls).toBe(1);expect(baseline.selectedPopulationCalls).toBe(0);pairs.push({order,digestEqual:true,baseline,candidate});}const {baseline,candidate}=pairs[0];expect(candidate.digest).toEqual(baseline.digest);expect(candidate.selectedPopulationCalls).toBe(1);expect(baseline.selectedPopulationCalls).toBe(0);expect((await c.query('SHOW TimeZone')).rows[0].TimeZone).toBe('Asia/Tokyo');expect((await c.query('SELECT * FROM analytics_fact_store_batches WHERE run_id=$1 ORDER BY id',[old])).rows).toEqual(before);expect((await c.query("SELECT count(*)::int n FROM pg_class WHERE relnamespace=pg_my_temp_schema() AND relname LIKE 'coverage_selected_%'")).rows[0].n).toBe(0);expect(pool.waitingCount).toBe(0);await bodyOracle(c);const report={experiment:'coverage-selected-runs-micro',sourceCommit:null,sealedEffectRows:microRows,logicalBatchLimit:100,bodyAuthenticationPassed:true,digestEqual:true,pairs,baseline,candidate};console.info('coverage-selected-micro',JSON.stringify(report));if(process.env.BAIZE_COVERAGE_MICRO_OUTPUT)await writeFile(process.env.BAIZE_COVERAGE_MICRO_OUTPUT,JSON.stringify(report,null,2)+'\n',{flag:'wx'});});
 });
 it('recomputes after owner mutations instead of reusing a prior capture closure',async()=>{
  await tx(async c=>{const before=await factCoverageMetadataDigest(c,site,{selectedRunReuse:true});await c.query('UPDATE aggregation_state SET generation=3 WHERE site_id=$1',[site]);await c.query('UPDATE analytics_fact_runs SET generation=3 WHERE id=$1',[head]);await c.query("INSERT INTO analytics_session_rebuild_requests VALUES($1,$2,$3,$4,'identity_interval')",[site,empty,retired,visitor]);await c.query('UPDATE analytics_session_contribution_heads SET run_id=$2,generation=3 WHERE site_id=$1 AND session_id=$3',[site,head,retired]);const baseline=await factCoverageMetadataDigest(c,site),candidate=await factCoverageMetadataDigest(c,site,{selectedRunReuse:true});expect(candidate).toEqual(baseline);expect(candidate.digest).not.toBe(before.digest);await bodyOracle(c);});
 });
 it('retains original invalid-owner rejection and cleans failed scopes without pool reuse leakage',async()=>{
  await tx(async c=>{await c.query('UPDATE analytics_session_contribution_heads SET epoch=$2 WHERE site_id=$1',[site,randomUUID()]);await expect(factCoverageMetadataDigest(c,site)).rejects.toThrow('FACT_RUN_CLOSURE_UNAVAILABLE');await expect(factCoverageMetadataDigest(c,site,{selectedRunReuse:true})).rejects.toThrow('FACT_RUN_CLOSURE_UNAVAILABLE');});
  await tx(async c=>{expect(await factCoverageMetadataDigest(c,site,{selectedRunReuse:true})).toEqual(await factCoverageMetadataDigest(c,site));await bodyOracle(c);expect(pool.waitingCount).toBe(0);});
 });
});
