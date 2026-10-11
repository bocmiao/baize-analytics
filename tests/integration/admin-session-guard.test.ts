import {it,expect} from 'vitest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {createApp} from '../../src/server/app.js';
import {isolatedTestConnectionString} from '../support/database-url.js';

it.skipIf(!process.env.TEST_DATABASE_URL)('real admin browser sessions exclusively authorize key rotation, SSO and GeoIP (no permission stubs)',async()=>{
 const schema='admin_guard_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:isolatedTestConnectionString()}),dir=await mkdtemp('/tmp/baize-admin-session-');
 const pool=new Pool({connectionString:isolatedTestConnectionString(),options:`-c search_path=${schema},public`,max:1});let runtime:Awaited<ReturnType<typeof createApp>>|undefined;
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);runtime=await createApp({pool,redis:null,background:false,clickhouse:null,dataDir:dir,keyDir:dir+'/keys',publicUrl:'http://localhost'});const app=runtime.app;
  const setup=await app.inject({method:'POST',url:'/api/setup',payload:{email:'guard-owner@example.test',password:'GuardOwner2026Strong!',name:'Owner'}});expect(setup.statusCode,setup.body).toBe(200);const ownerCookie=String(setup.headers['set-cookie']).split(';')[0]!;
  const siteResponse=await app.inject({method:'POST',url:'/api/v1/sites',headers:{cookie:ownerCookie},payload:{name:'Guard test',domain:'guard.example.test'}});expect(siteResponse.statusCode,siteResponse.body).toBe(201);const site=siteResponse.json().site.id;
  const tokens:string[]=[];for(const scopes of [['read'],['admin']]){const token=await app.inject({method:'POST',url:`/api/v1/sites/${site}/tokens`,headers:{cookie:ownerCookie},payload:{scopes}});expect(token.statusCode,token.body).toBe(200);tokens.push(token.json().token);}
  const invitation=await app.inject({method:'POST',url:`/api/v1/sites/${site}/invites`,headers:{cookie:ownerCookie},payload:{email:'guard-member@example.test',role:'admin'}});expect(invitation.statusCode,invitation.body).toBe(200);
  const registered=await app.inject({method:'POST',url:`/api/v1/invites/${invitation.json().token}/register`,payload:{name:'Member',password:'GuardMember2026Strong!'}});expect(registered.statusCode,registered.body).toBe(200);
  const login=await app.inject({method:'POST',url:'/api/login',payload:{email:'guard-member@example.test',password:'GuardMember2026Strong!'}});expect(login.statusCode,login.body).toBe(200);const memberCookie=String(login.headers['set-cookie']).split(';')[0]!;
  const baseline={keyring:(await pool.query('SELECT * FROM instance_keyring')).rows,files:(await readdir(dir+'/keys')).sort(),sso:(await pool.query('SELECT * FROM sso_config')).rows,mappings:(await pool.query('SELECT * FROM sso_mappings')).rows};
  const sso={corpId:'fixture-corp',agentId:'100001',secret:'private-test-secret',enabled:false,mappings:[]};
  const operations=[{method:'POST' as const,url:'/api/admin/keys/rotate'},{method:'GET' as const,url:'/api/admin/sso/wecom'},{method:'PUT' as const,url:'/api/admin/sso/wecom',payload:sso},{method:'GET' as const,url:'/api/admin/geoip'},{method:'PUT' as const,url:'/api/admin/geoip',payload:{accountId:'123',licenseKey:'private-geoip-key',enabled:false}}];
  for(const headers of [{authorization:`Bearer ${tokens[0]}`},{authorization:`Bearer ${tokens[1]}`},{cookie:ownerCookie,authorization:`Bearer ${tokens[0]}`},{cookie:memberCookie},{}]){
   for(const operation of operations){const response=await app.inject({...operation,headers});expect(response.statusCode,`${operation.method} ${operation.url}: ${response.body}`).toBe(403);expect(response.json().error).toBe(headers.cookie===memberCookie?'instance_admin_required':'admin_cookie_required');}
   expect((await pool.query('SELECT * FROM instance_keyring')).rows).toEqual(baseline.keyring);expect((await readdir(dir+'/keys')).sort()).toEqual(baseline.files);expect((await pool.query('SELECT * FROM sso_config')).rows).toEqual(baseline.sso);expect((await pool.query('SELECT * FROM sso_mappings')).rows).toEqual(baseline.mappings);expect((await pool.query("SELECT count(*) FROM instance_settings WHERE name='geoip'")).rows[0].count).toBe('0');
  }
  const saved=await app.inject({method:'PUT',url:'/api/admin/sso/wecom',headers:{cookie:ownerCookie},payload:sso});expect(saved.statusCode,saved.body).toBe(200);
  const read=await app.inject({method:'GET',url:'/api/admin/sso/wecom',headers:{cookie:ownerCookie}});expect(read.statusCode).toBe(200);expect(read.json().config.settings.corpId).toBe('fixture-corp');expect(read.body).not.toContain('private-test-secret');
  const rotation=await app.inject({method:'POST',url:'/api/admin/keys/rotate',headers:{cookie:ownerCookie}});expect(rotation.statusCode,rotation.body).toBe(200);expect(rotation.json().version).toBe(2);expect((await readdir(dir+'/keys')).sort()).toContain('master.v2.key');
 }finally{await runtime?.app.close();await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();await rm(dir,{recursive:true,force:true});}
},60000);
