import {randomUUID} from 'node:crypto';
import {mkdtemp,readdir,copyFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {Pool} from 'pg';
import {expect,it} from 'vitest';
import {migrate} from '../../src/server/db.js';
import {registerAnalytics} from '../../src/server/analytics.js';
import {authFunctions} from '../../src/server/auth.js';
import {hashToken} from '../../src/server/security.js';
import type {AppContext} from '../../src/server/context.js';

it.skipIf(!process.env.TEST_DATABASE_URL)('actual upgrade unknown-origin jobs status is explicit and administrator-only',async()=>{
 const schema='origin_jobs_'+randomUUID().replaceAll('-',''),site=randomUUID(),adminUser=randomUUID(),viewer=randomUUID(),adminToken=randomUUID(),viewerToken=randomUUID();
 const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1,options:`-c search_path=${schema}`}),dir=await mkdtemp('/tmp/baize-origin-jobs-'),app=Fastify();
 await admin.query(`CREATE SCHEMA ${schema}`);
 try{
  for(const file of await readdir('db/migrations'))if(file.endsWith('.sql')&&Number(file.slice(0,3))<=58)await copyFile(join('db/migrations',file),join(dir,file));
  await migrate(pool,dir);await pool.query("INSERT INTO sites(id,name,domain,salt_secret) VALUES($1,'legacy','example.test','unit-private')",[site]);await pool.query('INSERT INTO aggregation_state(site_id) VALUES($1)',[site]);await migrate(pool);
  expect((await pool.query('SELECT classification FROM analytics_raw_retirement_origins WHERE site_id=$1',[site])).rows[0].classification).toBe('legacy_unknown');
  for(const [id,token,role]of [[adminUser,adminToken,'admin'],[viewer,viewerToken,'viewer']]){await pool.query("INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,'jobs','unused')",[id,id+'@example.invalid']);await pool.query('INSERT INTO site_members(site_id,user_id,role) VALUES($1,$2,$3)',[site,id,role]);await pool.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[hashToken(token!),id]);}
  await app.register(cookie);await registerAnalytics(app,{pool,redis:null,...authFunctions(pool)} as unknown as AppContext);
  const before=(await pool.query('SELECT * FROM analytics_raw_retirement_origins WHERE site_id=$1',[site])).rows[0];
  const response=await app.inject({method:'GET',url:`/api/v1/sites/${site}/jobs`,headers:{cookie:`baize_session=${adminToken}`}});expect(response.statusCode).toBe(200);
  expect(response.json().rawRetirement).toMatchObject({classification:'legacy_unknown',blocked:true,error:'FACT_RAW_RETIREMENT_ORIGIN_UNKNOWN',recovery:{action:'preserve_or_new_site',inPlaceRepairSupported:false}});
  expect(JSON.stringify(response.json())).not.toContain('unit-private');expect(response.json().rawRetirement).not.toHaveProperty('seal');
  expect((await app.inject({method:'GET',url:`/api/v1/sites/${site}/jobs`,headers:{cookie:`baize_session=${viewerToken}`}})).statusCode).toBe(403);
  expect((await app.inject({method:'GET',url:`/api/v1/sites/${site}/jobs`})).statusCode).toBe(401);
  expect((await pool.query('SELECT * FROM analytics_raw_retirement_origins WHERE site_id=$1',[site])).rows[0]).toEqual(before);expect(pool.waitingCount).toBe(0);
 }finally{await app.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();await rm(dir,{recursive:true,force:true});}
},20000);
