import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {beforeAll,afterAll,beforeEach,describe,it,expect} from 'vitest';
import {migrate} from '../../src/server/db.js';
import {runWorkerOnce} from '../../src/server/worker.js';
import {runRestoreRebuild} from '../../scripts/restore-rebuild.js';
describe.skipIf(!process.env.TEST_DATABASE_URL)('restore persisted rebuild gate (real PostgreSQL)',()=>{
 const schema=`restore_gate_${randomUUID().replaceAll('-','')}`,site=randomUUID();
 const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`});
 beforeAll(async()=>{await admin.query(`CREATE SCHEMA ${schema}`);await migrate(pool);await pool.query("INSERT INTO sites(id,name,domain,salt_secret) VALUES($1,'restore','example.test','salt')",[site]);await pool.query('INSERT INTO aggregation_state(site_id,generation) VALUES($1,1)',[site]);});
 afterAll(async()=>{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
 beforeEach(async()=>{await pool.query('UPDATE aggregation_state SET generation=generation+1,processed_generation=0,attempts=0,last_error=NULL,dead_letter_at=NULL,lease_owner=NULL,lease_until=NULL');});
 it('rebuilds real dirty state and verifies equal generations with no errors or lease',async()=>{expect(await runRestoreRebuild(pool)).toMatchObject({verified:true,sites:1});const state=(await pool.query('SELECT * FROM aggregation_state')).rows[0];expect(state.processed_generation).toBe(state.generation);expect(state.last_error).toBeNull();expect(state.lease_owner).toBeNull();});
 it('does not accept false-return dirty work or a lost lease as complete',async()=>{await expect(runRestoreRebuild(pool,async()=>false,{maxRounds:2})).rejects.toThrow('bounded retry exhausted');});
 it('retries a persisted transient worker failure rather than treating false as success',async()=>{let rounds=0;const result=await runRestoreRebuild(pool,async p=>{if(rounds++===0){await p.query("UPDATE aggregation_state SET attempts=1,last_error='WORKER_FAILURE'");return false;}return runWorkerOnce(p);});expect(result).toMatchObject({verified:true,rounds:2});});
 it('fails closed on actual worker SQL failures reaching dead-letter',async()=>{await pool.query('ALTER TABLE goals RENAME TO goals_unavailable');try{await expect(runRestoreRebuild(pool)).rejects.toThrow('dead-letter');const state=(await pool.query('SELECT attempts,last_error,dead_letter_at FROM aggregation_state')).rows[0];expect(state.attempts).toBe(3);expect(state.last_error).toBe('42P01');expect(state.dead_letter_at).not.toBeNull();}finally{await pool.query('ALTER TABLE goals_unavailable RENAME TO goals');}});
 it('rejects dirty rows hidden behind an active lease',async()=>{await pool.query("UPDATE aggregation_state SET lease_owner=gen_random_uuid(),lease_until=now()+interval '1 minute'");await expect(runRestoreRebuild(pool,undefined,{maxRounds:2})).rejects.toThrow('bounded retry exhausted');});
});
