import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {describe,it,expect} from 'vitest';
const enabled=Boolean(process.env.TEST_DATABASE_URL);
describe.skipIf(!enabled)('experiment conversion forward migration',()=>{
 it('backfills retained facts and marks missing legacy histories unavailable',async()=>{
 const schema='experiment_migration_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:process.env.TEST_DATABASE_URL});let pool:Pool|undefined;
 try{await admin.query(`CREATE SCHEMA ${schema}`);pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`});for(const name of (await readdir('db/migrations')).filter(name=>name.endsWith('.sql')&&name<'019').sort())await pool.query(await readFile('db/migrations/'+name,'utf8'));
 const site='migration-'+randomUUID(),retained=randomUUID(),missing=randomUUID();await pool.query("INSERT INTO sites(id,name,domain,salt_secret) VALUES($1,'migration','example.test','salt')",[site]);await pool.query("INSERT INTO experiments(id,site_id,name,variants,goal) VALUES($1,$3,'retained','[\"A\",\"B\"]','signup'),($2,$3,'missing','[\"A\",\"B\"]','signup')",[retained,missing,site]);await pool.query("INSERT INTO experiment_assignments VALUES($1,'retained-visitor','A',true),($2,'missing-visitor','A',true)",[retained,missing]);await pool.query("INSERT INTO events(site_id,event_id,ts,visitor_id,page_id,type,path,payload,dimensions) VALUES($1,$2,now(),'retained-visitor',$3,'event','/signup','{\"event_name\":\"signup\"}','{}')",[site,randomUUID(),randomUUID()]);await pool.query(await readFile('db/migrations/019_experiment_contributions.sql','utf8'));
 expect((await pool.query('SELECT count(*)::int n FROM experiment_contributions WHERE experiment_id=$1',[retained])).rows[0].n).toBe(1);expect((await pool.query('SELECT conversion_history_status FROM experiments WHERE id=$1',[retained])).rows[0].conversion_history_status).toBe('complete');expect((await pool.query('SELECT conversion_history_status FROM experiments WHERE id=$1',[missing])).rows[0].conversion_history_status).toBe('partial_unavailable');expect((await pool.query('SELECT converted FROM experiment_assignments WHERE experiment_id=$1',[missing])).rows[0].converted).toBe(false);
 }finally{await pool?.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
 });
});
