import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {Pool} from 'pg';
import {it,expect} from 'vitest';
import {createApp} from '../../src/server/app.js';
it.skipIf(!process.env.TEST_DATABASE_URL)('actual HTTP serves the referenced full MIT text without exposing other source files',async()=>{
 const schema='license_http_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:process.env.TEST_DATABASE_URL});
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`});
 const directory=await mkdtemp('/tmp/baize-license-http-');let runtime:Awaited<ReturnType<typeof createApp>>|undefined;
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);
  runtime=await createApp({pool,redis:null,background:false,clickhouse:null,history:null,dataDir:directory,keyDir:join(directory,'keys'),masterKey:randomBytes(32)});
  const address=await runtime.app.listen({host:'127.0.0.1',port:0});
  const fullLicense=(await readFile('packages/tracker/LICENSE','utf8')).trim().replace(/\s+/g,' ');
  const script=await fetch(address+'/tracker.js',{headers:{'accept-encoding':'identity'}});expect(script.status).toBe(200);expect(script.headers.get('content-type')).toContain('application/javascript');const text=await script.text();expect(text).toContain(fullLicense);expect(script.headers.get('content-encoding')).toBeNull();
  const compressed=await fetch(address+'/tracker.js',{headers:{'accept-encoding':'gzip'}});expect(compressed.headers.get('content-encoding')).toBe('gzip');expect(compressed.headers.get('content-type')).toContain('application/javascript');expect(compressed.headers.get('vary')).toContain('Accept-Encoding');expect(Number(compressed.headers.get('content-length'))).toBe((await readFile('public/tracker.js.gz')).length);expect(Number(compressed.headers.get('content-length'))).toBeLessThanOrEqual(5120);expect(await compressed.text()).toBe(text);
  const refused=await fetch(address+'/tracker.js',{headers:{'accept-encoding':'gzip;q=0'}});expect(refused.headers.get('content-encoding')).toBeNull();expect(await refused.text()).toBe(text);
  const license=await fetch(address+'/tracker.LICENSE.txt');expect(license.status).toBe(200);expect(license.headers.get('content-type')).toMatch(/^text\/plain(?:;|$)/);expect(await license.text()).toBe(await readFile('packages/tracker/LICENSE','utf8'));
  for(const path of ['/packages/tracker/LICENSE','/LICENSE']){const response=await fetch(address+path);expect(await response.text()).not.toBe(await readFile('packages/tracker/LICENSE','utf8'));expect(response.headers.get('content-type')).not.toMatch(/^text\/plain(?:;|$)/);}
 }finally{await runtime?.app.close();await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();await rm(directory,{recursive:true,force:true});}
},30000);
