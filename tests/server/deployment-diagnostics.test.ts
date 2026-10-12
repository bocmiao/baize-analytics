import {it,expect} from 'vitest';
import {mkdtemp,rm,access} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {DatabaseSync} from 'node:sqlite';
import {hashToken} from '../../src/server/security.js';
import type {FastifyInstance} from 'fastify';
import {bareLiteHttp,syntheticInstallationNonce} from './lite-http-fixture.js';
import {createApp,fixtureInstallationNonce} from '../helpers/install-fixture.js';

async function diagnosticContract(app:FastifyInstance,nonce:string,keyDir:string,profile:string,viewer:()=>Promise<string>){
 const request=(payload:Record<string,unknown>,cookie?:string)=>app.inject({method:'POST',url:'/api/setup/diagnostics',payload,headers:cookie?{cookie}:undefined});
 expect((await request({})).statusCode).toBe(403);
 expect((await request({installationNonce:'0'.repeat(64)})).statusCode).toBe(403);
 const result=await request({installationNonce:nonce});expect(result.statusCode,result.body).toBe(200);
 expect(result.json()).toMatchObject({profile,storage:{available:true},directories:{keys:{available:true,private:true}},transport:{certificateVerified:false},supervision:{managedByThisWebPage:false}});
 expect(result.body).not.toContain(nonce);expect(result.body).not.toContain(keyDir);expect(result.body).not.toContain('nonce_hash');
 for(const origin of [undefined,'https://evil.invalid'])expect((await app.inject({method:'POST',url:'/api/setup/diagnostics',headers:{authorization:'Bearer synthetic-not-a-real-token',...(origin?{origin}:{})},payload:{installationNonce:nonce}})).statusCode).toBe(403);
 for(const options of [{url:'/api/setup/diagnostics?installationNonce='+nonce,payload:{}},{url:'/api/setup/diagnostics',headers:{'x-installation-nonce':nonce},payload:{}}])expect((await app.inject({method:'POST',remoteAddress:'127.0.0.2',...options})).statusCode).toBe(403);
 expect((await app.inject({method:'POST',url:'/api/setup/diagnostics',remoteAddress:'127.0.0.2',payload:{installationNonce:nonce,path:'/private-synthetic'}})).statusCode).toBe(400);
 await access(join(keyDir,'install-nonce.json'));expect((await app.inject({url:'/api/setup'})).json()).toMatchObject({required:true,state:'pending'});
 expect((await app.inject({method:'POST',url:'/api/setup/diagnostics',headers:{origin:'https://evil.invalid'},payload:{installationNonce:nonce}})).statusCode).toBe(403);
 const setup=await app.inject({method:'POST',url:'/api/setup',payload:{installationNonce:nonce,email:'diagnostic-owner@example.test',password:'DiagnosticOwner2026!',name:'Diagnostic'}});expect(setup.statusCode,setup.body).toBe(200);const cookie=setup.cookies.map(row=>row.name+'='+row.value).join('; ');
 expect((await request({installationNonce:nonce})).statusCode).toBe(403);
 expect((await request({},cookie)).statusCode).toBe(200);
 expect((await request({},await viewer())).statusCode).toBe(403);
 expect((await app.inject({method:'POST',url:'/api/setup/diagnostics',headers:{cookie,authorization:'Bearer synthetic-not-a-real-token'},payload:{}})).statusCode).toBe(403);
}
it('real Lite guarded diagnostics do not claim the owner or disclose private state',async()=>{const fixture=await bareLiteHttp();try{await diagnosticContract(fixture.app,syntheticInstallationNonce,fixture.keyDir,'lite',async()=>{const db=new DatabaseSync(join(fixture.dataDir,'lite.sqlite'));try{const id=randomUUID(),token='diagnostic-viewer-synthetic';db.prepare('INSERT INTO users VALUES(?,?,?,?,0,?)').run(id,'viewer@example.test','Viewer','unused',Date.now());db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(hashToken(token),id,Date.now()+60000);return 'baize_session='+token;}finally{db.close();}});}finally{await fixture.close();}});
it.runIf(!!process.env.TEST_DATABASE_URL)('real PostgreSQL guarded diagnostics retain pending authority then require admin cookie',async()=>{
 const root=await mkdtemp(join(tmpdir(),'baize-diagnostic-pg-')),schema='diag_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:'-c search_path='+schema+',public'});let runtime:Awaited<ReturnType<typeof createApp>>|undefined;
 try{await admin.query('CREATE SCHEMA '+schema);runtime=await createApp({pool,redis:null,background:false,clickhouse:null,dataDir:join(root,'data'),keyDir:join(root,'keys'),publicUrl:'http://localhost:3000'});await diagnosticContract(runtime.app,fixtureInstallationNonce,join(root,'keys'),'standard',async()=>{const id=randomUUID(),token='diagnostic-viewer-synthetic';await pool.query("INSERT INTO users(id,email,name,password_hash,is_admin) VALUES($1,'viewer@example.test','Viewer','unused',false)",[id]);await pool.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 minute')",[hashToken(token),id]);return 'baize_session='+token;});}finally{await runtime?.app.close();await pool.end();await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await admin.end();await rm(root,{recursive:true,force:true});}
});
