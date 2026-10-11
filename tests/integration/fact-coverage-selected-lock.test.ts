import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {expect,it} from 'vitest';
import {lockSite,migrate} from '../../src/server/db.js';
import {factCoverageMetadataDigest} from '../../src/server/fact-coverage-witness.js';
import {isolatedTestConnectionString} from '../support/database-url.js';

it.skipIf(!process.env.TEST_DATABASE_URL)('READ COMMITTED site gate preserves closure selection until the competing writer commits',async()=>{
 const schema='coverage_lock_'+randomUUID().replaceAll('-',''),site=randomUUID(),epoch=randomUUID(),old=randomUUID(),replacement=randomUUID(),session=randomUUID();
 const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1}),pool=new Pool({connectionString:isolatedTestConnectionString(),max:3,options:`-c search_path=${schema}`});
 let writerWork:Promise<void>|undefined;
 await admin.query(`CREATE SCHEMA ${schema}`);
 try{
  await migrate(pool);await pool.query("INSERT INTO sites(id,name,domain,salt_secret) VALUES($1,'lock oracle','example.test','local-fixture-secret')",[site]);await pool.query('INSERT INTO aggregation_state(site_id,epoch,generation,processed_generation) VALUES($1,$2,2,2)',[site,epoch]);
  for(const run of [old,replacement])await pool.query("INSERT INTO analytics_fact_runs(id,site_id,epoch,generation,outbox_high_watermark,status,query_version,retained_from) VALUES($1,$2,$3,2,0,'published',1,'2026-10-01T00:00:00Z')",[run,site,epoch]);
  await pool.query('INSERT INTO analytics_session_contribution_heads VALUES($1,$2,$3,$4,$5,2)',[site,session,'fixture-visitor',old,epoch]);
  const reader=await pool.connect(),writer=await pool.connect(),observer=await pool.connect();
  try{
   await reader.query('BEGIN ISOLATION LEVEL READ COMMITTED');await lockSite(reader,site);
   const before=await factCoverageMetadataDigest(reader,site);
   await writer.query('BEGIN ISOLATION LEVEL READ COMMITTED');const pid=Number((await writer.query('SELECT pg_backend_pid() pid')).rows[0].pid);
   writerWork=(async()=>{await lockSite(writer,site);await writer.query('UPDATE analytics_session_contribution_heads SET run_id=$2 WHERE site_id=$1',[site,replacement]);await writer.query('COMMIT');})();void writerWork.catch(()=>undefined);
   let blocked=false;const deadline=Date.now()+5000;
   while(Date.now()<deadline){blocked=!!(await observer.query("SELECT 1 FROM pg_locks WHERE pid=$1 AND locktype='advisory' AND NOT granted LIMIT 1",[pid])).rowCount;if(blocked)break;}
   expect(blocked).toBe(true);expect((await reader.query('SELECT run_id FROM analytics_session_contribution_heads WHERE site_id=$1',[site])).rows[0].run_id).toBe(old);
   expect(await factCoverageMetadataDigest(reader,site,{selectedRunReuse:true})).toEqual(before);
   await reader.query('COMMIT');await writerWork;
   await reader.query('BEGIN ISOLATION LEVEL READ COMMITTED');await lockSite(reader,site);
   const after=await factCoverageMetadataDigest(reader,site);expect(after.digest).not.toBe(before.digest);expect(await factCoverageMetadataDigest(reader,site,{selectedRunReuse:true})).toEqual(after);expect((await reader.query('SELECT run_id FROM analytics_session_contribution_heads WHERE site_id=$1',[site])).rows[0].run_id).toBe(replacement);
   expect((await reader.query("SELECT count(*)::integer n FROM pg_class WHERE relnamespace=pg_my_temp_schema() AND relname LIKE 'coverage_selected_%'")).rows[0].n).toBe(0);expect((await reader.query("SELECT count(*)::integer n FROM pg_cursors WHERE name LIKE 'coverage_%'")).rows[0].n).toBe(0);await reader.query('COMMIT');
  }finally{await reader.query('ROLLBACK');await writerWork?.catch(()=>undefined);await writer.query('ROLLBACK');reader.release();writer.release();observer.release();}
 }finally{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
},30000);
