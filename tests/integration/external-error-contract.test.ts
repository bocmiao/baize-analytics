import {fixtureInstallationNonce} from '../helpers/install-fixture.js';
import {API_ERRORS} from '../../src/shared/error-codes.js';
import {it,expect} from 'vitest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {createApp} from '../helpers/install-fixture.js';
import {ExternalError} from '../../src/server/external-errors.js';

it.skipIf(!process.env.TEST_DATABASE_URL)('actual app returns stable localized connector codes and hides untrusted provider errors',async()=>{
 const schema='error_contract_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:process.env.TEST_DATABASE_URL});await admin.query(`CREATE SCHEMA ${schema}`);
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`}),dir=await mkdtemp('/tmp/baize-error-contract-');let runtime:Awaited<ReturnType<typeof createApp>>|undefined;
 try{
  runtime=await createApp({pool,redis:null,dataDir:dir,background:false,clickhouse:null});
  runtime.app.get('/fixture/provider-fault',async()=>{throw new Error('provider raw credential not-for-public-2026');});
  runtime.app.get('/fixture/provider-timeout',async()=>{throw new ExternalError('external_timeout');});
  const setup=await runtime.app.inject({method:'POST',url:'/api/setup',payload:{installationNonce:fixtureInstallationNonce,email:'error-contract@example.test',password:'ErrorContract2026!',name:'错误契约验收'}});
  expect(setup.statusCode,setup.body).toBe(200);const cookie=String(setup.headers['set-cookie']).split(';')[0]!;
  const created=await runtime.app.inject({method:'POST',url:'/api/v1/sites',headers:{cookie},payload:{name:'错误契约站点',domain:'error-contract.example.test'}});expect(created.statusCode).toBe(201);const site=created.json().site.id;
  const missing=await runtime.app.inject({method:'POST',url:`/api/sites/${site}/ai/test`,headers:{cookie}});
  expect(missing.statusCode).toBe(409);expect(missing.json()).toEqual({error:'connector_missing',message:'请先配置连接器'});
  const configure=await runtime.app.inject({method:'PUT',url:`/api/sites/${site}/external`,headers:{cookie},payload:{kind:'ai',settings:{endpoint:'https://provider.example/v1',model:'fixture',enabled:false}}});
  expect(configure.statusCode).toBe(400);expect(configure.json().error).toBe('connector_secret_required');
  const fault=await runtime.app.inject('/fixture/provider-fault');expect(fault.statusCode).toBe(500);expect(fault.json()).toEqual({error:'internal_error',message:API_ERRORS.internal_error.zh});expect(fault.body).not.toContain('not-for-public');
  const timeout=await runtime.app.inject('/fixture/provider-timeout');expect(timeout.statusCode).toBe(504);expect(timeout.json()).toEqual({error:'external_timeout',message:'外部服务请求超时，请稍后重试'});
 }finally{await runtime?.app.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();await rm(dir,{recursive:true,force:true});}
},30000);
