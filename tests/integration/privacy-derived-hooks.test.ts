import {Pool} from 'pg';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {beforeAll,afterAll,it,expect} from 'vitest';
import {migrate} from '../../src/server/db.js';
import {replayDeletionJournal} from '../../src/server/deletion.js';
const database=process.env.TEST_DATABASE_URL??'postgresql://baize_dev@127.0.0.1:5432/baize_dev';
const schema='derived_hooks_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:database}),pool=new Pool({connectionString:database,max:1,options:`-c search_path=${schema},public`});
let dir:string;
beforeAll(async()=>{dir=await mkdtemp(join(tmpdir(),'derived-hooks-'));await admin.query(`CREATE SCHEMA ${schema}`);await migrate(pool);});
afterAll(async()=>{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();await rm(dir,{recursive:true,force:true});});
it('replay clears restored AI and all fact projections even with existing tombstones and no remaining raw events, using a one-connection pool',async()=>{
 const sites=[randomUUID(),randomUUID()],runs=[randomUUID(),randomUUID()];
 for(let i=0;i<sites.length;i++){
  const site=sites[i]!,run=runs[i]!;await pool.query("INSERT INTO sites(id,name,domain,salt_secret) VALUES($1,'derived','example.test','safe')",[site]);
  await pool.query("INSERT INTO ai_calls(id,site_id,purpose,status,evidence) VALUES($1,$2,'question','complete','{}')",[randomUUID(),site]);
  await pool.query("INSERT INTO analytics_fact_runs(id,site_id,epoch,generation,outbox_high_watermark,status) VALUES($1,$2,$3,1,0,'published')",[run,site,randomUUID()]);
  const session=randomUUID();await pool.query("INSERT INTO analytics_session_facts VALUES($1,$2,'visitor','{}')",[run,session]);
  await pool.query("INSERT INTO analytics_numeric_facts VALUES($1,'daily','2026-01-01',$2,'pv','[]',1)",[run,session]);
  await pool.query("INSERT INTO analytics_member_facts VALUES($1,'daily','2026-01-01',$2,'active','[]','visitor')",[run,session]);
  await pool.query("INSERT INTO analytics_vitals_facts VALUES($1,'daily','2026-01-01','/','LCP','{}',1)",[run]);
 }
 await pool.query("INSERT INTO tombstones(site_id,visitor_id,source) VALUES($1,'already-deleted','test')",[sites[0]]);
 const journal=JSON.stringify({site_id:sites[0],visitor_id:'already-deleted',user_id:null,deleted_at:new Date().toISOString(),source:'test'})+'\n';
 await writeFile(join(dir,'tombstones.jsonl'),journal);await writeFile(join(dir,'tombstones.watermark.json'),JSON.stringify({records:1,sha256:createHash('sha256').update(journal).digest('hex')}));
 expect(await replayDeletionJournal(pool,dir)).toMatchObject({records:1,sites:[sites[0]]});expect(pool.waitingCount).toBe(0);
 expect((await pool.query('SELECT site_id FROM ai_calls')).rows).toEqual([{site_id:sites[1]}]);
 expect((await pool.query('SELECT site_id FROM analytics_fact_runs')).rows).toEqual([{site_id:sites[1]}]);
 for(const table of ['analytics_session_facts','analytics_numeric_facts','analytics_member_facts','analytics_vitals_facts'])expect((await pool.query(`SELECT run_id FROM ${table}`)).rows).toEqual([{run_id:runs[1]}]);
},10000);
