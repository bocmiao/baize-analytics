import {isolatedTestConnectionString} from '../support/database-url.js';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdtemp,readdir,copyFile,rm} from 'node:fs/promises';
import {migrate,transaction,lockSite} from '../../src/server/db.js';
import {reserveAiBudget,settleAiReservation,expireAiReservations} from '../../src/server/ai-budget.js';

describe.skipIf(!process.env.TEST_DATABASE_URL)('durable AI reservation ledger actual PG max1 and crashed child',()=>{
 let migrationDir:string;const legacySite=randomUUID(),legacyCall=randomUUID();
 const schema='ai_budget_'+randomUUID().replaceAll('-',''),site=randomUUID(),month='2026-10-01';
 const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:isolatedTestConnectionString(),options:`-c search_path=${schema}`,max:1,connectionTimeoutMillis:1500});
 const gated=<T>(fn:(client:import('pg').PoolClient)=>Promise<T>)=>transaction(pool,async c=>{await lockSite(c,site);return fn(c);});
 beforeAll(async()=>{await admin.query(`CREATE SCHEMA ${schema}`);migrationDir=await mkdtemp('/tmp/ai-pre035-');for(const name of await readdir('db/migrations'))if(/^\d+.*\.sql$/.test(name)&&name<'035')await copyFile('db/migrations/'+name,migrationDir+'/'+name);await migrate(pool,migrationDir);await pool.query("INSERT INTO sites(id,name,domain,salt_secret) VALUES($1,'legacyquota','example.test','salt')",[legacySite]);await pool.query('INSERT INTO ai_budget(site_id,month,reserved,used) VALUES($1,$2,40,10)',[legacySite,month]);await pool.query("INSERT INTO ai_calls(id,site_id,purpose,status,evidence,answer) VALUES($1,$2,'question','reserved','{}','')",[legacyCall,legacySite]);await migrate(pool);await pool.query("INSERT INTO sites(id,name,domain,salt_secret) VALUES($1,'budget','example.test','salt')",[site]);});
 afterAll(async()=>{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();if(migrationDir)await rm(migrationDir,{recursive:true,force:true});});
 it('forward migration preserves legacy aggregate reserve as expired upper bound without inventing usage or retaining unfinished answer',async()=>{
  expect((await pool.query('SELECT status FROM ai_calls WHERE id=$1',[legacyCall])).rows[0].status).toBe('failed');expect((await pool.query('SELECT amount,status FROM ai_reservations WHERE site_id=$1',[legacySite])).rows[0]).toEqual({amount:'40',status:'active'});
  await transaction(pool,async c=>{await lockSite(c,legacySite);expect((await expireAiReservations(c,legacySite)).expired).toBe(1);});expect((await pool.query('SELECT used,reserved FROM ai_budget WHERE site_id=$1',[legacySite])).rows[0]).toEqual({used:'50',reserved:'0'});await migrate(pool);expect((await pool.query('SELECT count(*) FROM ai_reservations WHERE site_id=$1',[legacySite])).rows[0].count).toBe('1');
 });
 it('concurrent reservations respect cap; settlement CAS consumes once without borrowing another connection',async()=>{
  const ids=[randomUUID(),randomUUID()],at=new Date('2026-10-01T00:00:00Z');
  const result=await Promise.allSettled(ids.map(callId=>gated(c=>reserveAiBudget(c,{siteId:site,callId,month,amount:60,budget:100,at}))));expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(result.filter(r=>r.status==='rejected')).toHaveLength(1);
  const id=(await pool.query("SELECT call_id FROM ai_reservations WHERE status='active' AND site_id=$1",[site])).rows[0].call_id;
  expect(await gated(c=>settleAiReservation(c,site,id,7,new Date(+at+1000)))).toEqual({settled:true});expect(await gated(c=>settleAiReservation(c,site,id,7,new Date(+at+2000)))).toEqual({settled:false});expect((await pool.query('SELECT used,reserved FROM ai_budget WHERE site_id=$1',[site])).rows[0]).toEqual({used:'7',reserved:'0'});expect(pool.waitingCount).toBe(0);
 });
 it('actual SIGKILL after committed reserve survives privacy call deletion; expiry/late settlement cannot charge twice or revive prose',async()=>{
  const call=randomUUID();
  await pool.query("INSERT INTO ai_calls(id,site_id,purpose,status,evidence,answer) VALUES($1,$2,'question','reserved','{}','')",[call,site]);
  const code=`import {Pool} from 'pg';import {reserveAiBudget} from './src/server/ai-budget.ts';import {lockSite} from './src/server/db.ts';const p=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:'-c search_path='+process.env.AI_BUDGET_SCHEMA,max:1});const c=await p.connect();await c.query('BEGIN');await lockSite(c,process.env.AI_BUDGET_SITE);await reserveAiBudget(c,{siteId:process.env.AI_BUDGET_SITE,callId:process.env.AI_BUDGET_CALL,month:'2026-10-01',amount:60,budget:1000});await c.query('COMMIT');c.release();process.stdout.write('RESERVED\\n');setInterval(()=>{},1000);`;
  const child=spawn(process.execPath,['--import','tsx','--input-type=module','-e',code],{cwd:process.cwd(),env:{...process.env,TEST_DATABASE_URL:isolatedTestConnectionString(),AI_BUDGET_SCHEMA:schema,AI_BUDGET_SITE:site,AI_BUDGET_CALL:call},stdio:['ignore','pipe','pipe']});
  let stderr='';child.stderr.on('data',part=>{stderr+=String(part);});
  await new Promise<void>((resolve,reject)=>{child.once('error',reject);child.once('exit',()=>reject(Error('child exited before reserve: '+stderr)));child.stdout.on('data',part=>{if(String(part).includes('RESERVED'))resolve();});});
  const exited=new Promise<void>(resolve=>child.once('exit',(_code,signal)=>{expect(signal).toBe('SIGKILL');resolve();}));child.kill('SIGKILL');await exited;
  await pool.query('DELETE FROM ai_calls WHERE id=$1',[call]);expect((await pool.query('SELECT 1 FROM ai_reservations WHERE call_id=$1',[call])).rowCount).toBe(1);
  const expiredAt=new Date(Date.now()+16*60000);const results=await Promise.all([gated(c=>expireAiReservations(c,site,expiredAt)),gated(c=>expireAiReservations(c,site,expiredAt))]);expect(results.reduce((n,r)=>n+r.expired,0)).toBe(1);
  expect(await gated(c=>settleAiReservation(c,site,call,4,expiredAt))).toEqual({settled:false});expect((await pool.query('SELECT used,reserved FROM ai_budget WHERE site_id=$1',[site])).rows[0]).toEqual({used:'67',reserved:'0'});expect((await pool.query('SELECT status,settled_tokens FROM ai_reservations WHERE call_id=$1',[call])).rows[0]).toEqual({status:'expired',settled_tokens:'60'});expect((await pool.query('SELECT 1 FROM ai_calls WHERE id=$1',[call])).rowCount).toBe(0);expect(pool.waitingCount).toBe(0);
 },10000);
});
