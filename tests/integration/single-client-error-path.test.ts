import {fixtureInstallationNonce} from '../helpers/install-fixture.js';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {createApp} from '../helpers/install-fixture.js';
import {migrate} from '../../src/server/db.js';
import {claimSite,rebuildSite} from '../../src/server/worker.js';
import {runGovernance} from '../../src/server/governance-worker.js';
import type {AppContext} from '../../src/server/context.js';
describe.skipIf(!process.env.TEST_DATABASE_URL)('real max1 error-path client reuse',()=>{
 const schema=`singleclient_${randomUUID().replaceAll('-','')}`;
 const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1});
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`,application_name:schema,max:1,connectionTimeoutMillis:800});
 let directory:string;const site='single-client-site';
 beforeAll(async()=>{await admin.query(`CREATE SCHEMA ${schema}`);await migrate(pool);directory=await mkdtemp(join(tmpdir(),'baize-single-client-'));await pool.query("INSERT INTO sites(id,name,domain,salt_secret) VALUES($1,'test','example.invalid','fixture')",[site]);await pool.query('INSERT INTO aggregation_state(site_id,generation) VALUES($1,1)',[site]);},30000);
 afterAll(async()=>{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();if(directory)await rm(directory,{recursive:true,force:true});});
 const guarded=async<T>(operation:()=>Promise<T>)=>{
  // Emergency termination is restricted to this test's unique application_name;
  // normal regression completion (or the pool's 800ms timeout) clears it first.
  const watchdog=setTimeout(()=>{void admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name=$1 AND pid<>pg_backend_pid()',[schema]);},3000);
  try{return await operation();}finally{clearTimeout(watchdog);}
 };
 it('expired publication fence returns false and clears owned lease without borrowing a second client',async()=>{
  const claim=await claimSite(pool);expect(claim).not.toBeNull();
  const value=await guarded(()=>rebuildSite(pool,claim!,{afterSnapshot:async()=>{await pool.query("UPDATE aggregation_state SET lease_until=now()-interval '1 second' WHERE site_id=$1",[site]);}}));
  expect(value).toBe(false);expect((await pool.query('SELECT lease_owner,lease_until FROM aggregation_state WHERE site_id=$1',[site])).rows[0]).toEqual({lease_owner:null,lease_until:null});expect(pool.waitingCount).toBe(0);
 });
 it('actual export filesystem failure persists failed status and releases the sole client',async()=>{
  const dataDir=join(directory,'not-a-directory');await writeFile(dataDir,'intentional filesystem failure');const id=randomUUID();await pool.query("INSERT INTO export_jobs(id,site_id,format) VALUES($1,$2,'json')",[id,site]);
  const ctx={pool,redis:null,config:{dataDir,masterKey:randomBytes(32),publicUrl:'http://example.invalid'}} as AppContext;
  await guarded(()=>runGovernance(ctx));expect((await pool.query('SELECT status,error FROM export_jobs WHERE id=$1',[id])).rows[0]).toEqual({status:'failed',error:'export_failed'});expect(pool.waitingCount).toBe(0);
  expect(Number((await admin.query("SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a USING(pid) WHERE a.application_name=$1 AND l.locktype='advisory'",[schema])).rows[0].count)).toBe(0);
 });
 it('actual max1 invite register and accept persist audit with membership, and audit failure rolls all writes back',async()=>{
  const instance=await createApp({pool,redis:null,background:false,clickhouse:null,dataDir:join(directory,'app-data'),keyDir:join(directory,'keys'),masterKey:randomBytes(32)});
  try{
   const setup=await instance.app.inject({method:'POST',url:'/api/setup',payload:{installationNonce:fixtureInstallationNonce,email:'invite-owner@example.invalid',password:'Actual-invite-password'}});expect(setup.statusCode).toBe(200);const cookie=String(setup.headers['set-cookie']).split(';')[0];
   const owner=setup.json().user.id;await pool.query("INSERT INTO site_members(site_id,user_id,role) VALUES($1,$2,'owner')",[site,owner]);
   const invite=async(email:string)=>{const response=await instance.app.inject({method:'POST',url:`/api/v1/sites/${site}/invites`,headers:{cookie},payload:{email,role:'viewer'}});expect(response.statusCode).toBe(200);return response.json();};
   const registration=await invite('invite-new@example.invalid');const registered=await guarded(()=>instance.app.inject({method:'POST',url:`/api/v1/invites/${registration.token}/register`,payload:{name:'New member',password:'Actual-member-password'}}));expect(registered.statusCode).toBe(200);
   const acceptance=await invite('invite-owner@example.invalid');const accepted=await guarded(()=>instance.app.inject({method:'POST',url:`/api/v1/invites/${acceptance.token}/accept`,headers:{cookie}}));expect(accepted.statusCode).toBe(200);
   expect((await pool.query("SELECT count(*)::int n FROM audit_logs WHERE action='invite.accept'")).rows[0].n).toBe(2);
   const failed=await invite('invite-rollback@example.invalid');await pool.query("CREATE FUNCTION reject_invite_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='invite.accept' THEN RAISE EXCEPTION 'audit fixture rejection'; END IF; RETURN NEW; END $$");await pool.query('CREATE TRIGGER reject_invite_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_invite_audit()');
   const rejected=await guarded(()=>instance.app.inject({method:'POST',url:`/api/v1/invites/${failed.token}/register`,payload:{name:'Rollback member',password:'Actual-rollback-password'}}));expect(rejected.statusCode).toBe(500);
   expect((await pool.query("SELECT count(*)::int n FROM users WHERE email='invite-rollback@example.invalid'")).rows[0].n).toBe(0);expect((await pool.query('SELECT accepted_at FROM site_invites WHERE id=$1',[failed.id])).rows[0].accepted_at).toBeNull();
   await pool.query('DROP TRIGGER reject_invite_audit ON audit_logs');await pool.query('DROP FUNCTION reject_invite_audit()');expect(pool.waitingCount).toBe(0);
  }finally{await instance.app.close();}
 });
});
