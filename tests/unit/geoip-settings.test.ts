import {afterEach,it,expect,vi} from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {AppContext} from '../../src/server/context.js';
import {registerGeoIPSettings,configuredGeoCredentials} from '../../src/server/geoip-settings.js';

const cleanups:(()=>Promise<void>)[]=[];
afterEach(async()=>{for(const cleanup of cleanups.splice(0))await cleanup();});
async function setup(){
 const dataDir=await mkdtemp(join(tmpdir(),'baize-geo-settings-'));let stored:{encrypted:unknown;settings:Record<string,unknown>}|undefined;
 const query=async(sql:string,args:unknown[]=[])=>{
  if(sql.startsWith('INSERT INTO instance_settings'))stored={encrypted:args[0],settings:args[1] as Record<string,unknown>};
  return {rows:sql.startsWith('SELECT')&&sql.includes('instance_settings')&&stored?[stored]:[]};
 };
 const reload=vi.fn(async()=>{}),audit=vi.fn(async()=>{});
 const ctx={pool:{query,connect:async()=>({query,release(){}})},redis:null,config:{dataDir,masterKey:Buffer.alloc(32,7),publicUrl:'https://example.test'},user:async()=>({id:'owner',email:'owner@example.test',name:'Owner',is_admin:true}),geoReload:reload,audit} as unknown as AppContext;
 const app=Fastify();await app.register(cookie);
 await registerGeoIPSettings(app,ctx,async()=>({status:200,headers:{},text:'0'.repeat(64),bytes:Buffer.from('invalid artifact fixture')}));
 cleanups.push(async()=>{await app.close();await rm(dataDir,{recursive:true,force:true});});
 return {app,ctx,reload,audit,headers:{cookie:'baize_session=test-session'}};
}
it('requires an administrator cookie and enables the offline provider without a vendor credential',async()=>{
 const {app,ctx,reload,headers}=await setup();
 expect((await app.inject({method:'PUT',url:'/api/admin/geoip',payload:{provider:'ip2region',enabled:true}})).statusCode).toBe(403);
 expect((await app.inject({method:'PUT',url:'/api/admin/geoip',headers:{...headers,authorization:'Bearer fixture'},payload:{provider:'ip2region',enabled:true}})).statusCode).toBe(403);
 expect((await app.inject({method:'PUT',url:'/api/admin/geoip',headers,payload:{provider:'ip2region',enabled:true}})).statusCode).toBe(200);
 expect(await configuredGeoCredentials(ctx)).toEqual({provider:'ip2region',enabled:true});expect(reload).toHaveBeenCalledWith(true);
 const status=(await app.inject({url:'/api/admin/geoip',headers})).json();expect(status.provider).toBe('ip2region');expect(status.hasCredentials).toBe(false);expect(status.database.configured).toBe(false);expect(status.availableSnapshot.revision).toMatch(/^[a-f0-9]{40}$/);
});
it('preserves encrypted MaxMind credentials across provider switches without returning them',async()=>{
 const {app,ctx,headers}=await setup();
 expect((await app.inject({method:'PUT',url:'/api/admin/geoip',headers,payload:{accountId:'123',licenseKey:'private-fixture-license',enabled:true}})).statusCode).toBe(200);
 expect((await configuredGeoCredentials(ctx))?.provider).toBe('maxmind');
 await app.inject({method:'PUT',url:'/api/admin/geoip',headers,payload:{provider:'ip2region',enabled:true}});
 await app.inject({method:'PUT',url:'/api/admin/geoip',headers,payload:{provider:'maxmind',enabled:true}});
 expect((await configuredGeoCredentials(ctx))?.licenseKey).toBe('private-fixture-license');
 const status=await app.inject({url:'/api/admin/geoip',headers});expect(status.body).not.toContain('private-fixture-license');expect(status.json().credentialFingerprint).toHaveLength(12);
});
it('refuses invalid downloads and disabled-provider refresh without advertising ready data',async()=>{
 const {app,headers,reload}=await setup();
 const download=await app.inject({method:'POST',url:'/api/admin/geoip/refresh',headers});expect(download.statusCode).toBe(502);expect(reload).not.toHaveBeenCalled();
 await app.inject({method:'PUT',url:'/api/admin/geoip',headers,payload:{provider:'ip2region',enabled:false}});
 expect((await app.inject({method:'POST',url:'/api/admin/geoip/refresh',headers})).statusCode).toBe(409);
 const status=(await app.inject({url:'/api/admin/geoip',headers})).json();expect(status.enabled).toBe(false);expect(status.database.configured).toBe(false);
});
