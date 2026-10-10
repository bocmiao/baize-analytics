/** Isolated planner experiment. Synthetic exact relations, not CH/HMAC or
 * production performance acceptance. No production tables or policy changes. */
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {performance} from 'node:perf_hooks';
import {shouldAnalyzeTempRows} from '../src/server/temp-analyze-policy.js';
const flag=(name:string,fallback:string)=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
if(!process.env.TEST_DATABASE_URL)throw Error('Explicit TEST_DATABASE_URL required');
const sizes=flag('rows','100,10000').split(',').map(Number),threshold=Number(flag('threshold','1000'));
if(sizes.some(n=>!Number.isSafeInteger(n)||n<1||n>100000))throw Error('EXPERIMENT_ROWS_INVALID');
const output=resolve(flag('output','/tmp/baize-temp-analyze.json')),schema='temp_analyze_'+randomUUID().replaceAll('-',''),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1}),c=await pool.connect();
const results:Record<string,unknown>[]=[];let created=false;
try{await c.query(`CREATE SCHEMA ${schema}`);created=true;await c.query(`SET search_path TO ${schema}`);
 for(const rows of sizes){const began=performance.now();await c.query('BEGIN');
  await c.query('CREATE TEMP TABLE effects(event_id integer,session_id integer,visitor_id integer,event_ts timestamptz,metric text,value double precision,PRIMARY KEY(event_id,metric)) ON COMMIT DROP');
  await c.query('CREATE TEMP TABLE owners(session_id integer PRIMARY KEY,visitor_id integer,priority integer) ON COMMIT DROP');
  await c.query("INSERT INTO owners SELECT n,n,0 FROM generate_series(1,$1::int)n",[Math.ceil(rows/50)]);
  await c.query("INSERT INTO effects SELECT n,((n-1)/50)+1,((n-1)/50)+1,'2026-01-01'::timestamptz+n*interval '1 millisecond','pv',1 FROM generate_series(1,$1::int)n",[rows]);
  const sql='SELECT count(*)::int AS pv,count(DISTINCT e.visitor_id)::int AS uv,sum(e.value)::float8 AS total FROM effects e JOIN owners o ON o.session_id=e.session_id AND o.visitor_id=e.visitor_id WHERE o.priority=0 AND e.metric=\'pv\'';
  const beforeStart=performance.now(),before=(await c.query('EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) '+sql)).rows[0]['QUERY PLAN'],beforeMs=performance.now()-beforeStart,oracle=(await c.query(sql)).rows;
  const analyzeStart=performance.now(),enabled=shouldAnalyzeTempRows(rows,threshold);if(enabled){await c.query('ANALYZE effects');await c.query('ANALYZE owners');}const analyzeMs=performance.now()-analyzeStart;
  const afterStart=performance.now(),after=(await c.query('EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) '+sql)).rows[0]['QUERY PLAN'],afterMs=performance.now()-afterStart,result=(await c.query(sql)).rows;
  if(JSON.stringify(result)!==JSON.stringify(oracle)||result[0].pv!==rows||result[0].uv!==Math.ceil(rows/50)||result[0].total!==rows)throw Error('EXPERIMENT_EXACT_ORACLE_MISMATCH');
  const cleanupStart=performance.now();await c.query('COMMIT');const cleanupMs=performance.now()-cleanupStart;
  if((await c.query("SELECT to_regclass('pg_temp.effects') AS remaining")).rows[0].remaining!==null||pool.waitingCount!==0)throw Error('EXPERIMENT_CLEANUP_FAILED');
  results.push({rows,threshold,analyzeEnabled:enabled,oracle:result,before,after,beforeQueryMs:beforeMs,analyzeMs,afterQueryMs:afterMs,afterWithAnalyzeMs:analyzeMs+afterMs,cleanupMs,totalFixtureMs:performance.now()-began});
 }
}finally{await c.query('ROLLBACK');if(created)await c.query(`DROP SCHEMA ${schema} CASCADE`);c.release();await pool.end();}
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify({scope:'synthetic exact TEMP join planner experiment; not production bridge/CH authentication proof',maxPool:1,productionChanges:false,thresholdExperimental:true,orderCaveat:'before then after shares warm caches; no causal speedup inference from one run',results},null,2)+'\n');
