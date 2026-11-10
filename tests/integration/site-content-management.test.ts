import {randomUUID} from 'node:crypto';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {Pool} from 'pg';
import {ZodError} from 'zod';
import {beforeAll,afterAll,describe,expect,it} from 'vitest';
import {migrate} from '../../src/server/db.js';
import {authFunctions} from '../../src/server/auth.js';
import {hashToken} from '../../src/server/security.js';
import {registerSiteContentManagement,siteContentLimits} from '../../src/server/site-content-management.js';
import type {AppContext} from '../../src/server/context.js';

describe.skipIf(!process.env.TEST_DATABASE_URL)('site content resources on real PostgreSQL',()=>{
 const schema='site_content_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`}),app=Fastify();
 const owner=randomUUID(),viewer=randomUUID(),ownerSession=randomUUID(),viewerSession=randomUUID(),headers={cookie:'baize_session='+ownerSession},viewerHeaders={cookie:'baize_session='+viewerSession};
 const input=()=>({name:'推广 '+randomUUID(),targetUrl:'https://example.test/landing?keep=1#section',parameters:{utm_source:'社群',utm_campaign:'发布',utm_medium:'social',utm_content:'A',utm_term:''}});
 async function newSite(member=true){const id=randomUUID();await pool.query("INSERT INTO sites(id,name,domain,salt_secret,timezone,config) VALUES($1,'content fixture','example.test','test-only-salt','UTC',$2)",[id,{replay:true,unrelated:{preserve:true}}]);if(member){await pool.query("INSERT INTO site_members(site_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'viewer')",[id,owner,viewer]);}return id;}
 function call(siteId:string,resource:string,method:'GET'|'POST'|'PATCH'|'DELETE'='GET',payload?:Record<string,unknown>,requestHeaders:Record<string,string>=headers){return app.inject({method,url:`/api/v1/sites/${siteId}/${resource}`,headers:requestHeaders,...payload?{payload}:{}});}
 beforeAll(async()=>{await admin.query(`CREATE SCHEMA ${schema}`);await migrate(pool);for(const [id,email,session] of [[owner,'owner@content.test',ownerSession],[viewer,'viewer@content.test',viewerSession]]){await pool.query('INSERT INTO users(id,email,name,password_hash,is_admin) VALUES($1,$2,\'fixture\',\'unused\',false)',[id,email]);await pool.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')",[hashToken(session!),id]);}await app.register(cookie);app.setErrorHandler((error,_request,reply)=>reply.status(error instanceof ZodError?400:(error as {statusCode?:number}).statusCode||500).send({error:error instanceof Error?error.message:'error'}));await registerSiteContentManagement(app,{pool,...authFunctions(pool)} as AppContext);});
 afterAll(async()=>{await app.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
 it('persists directory CRUD independently and leaves unrelated configuration untouched',async()=>{
  const site=await newSite(),create=await call(site,'directory-rules','POST',{name:'文档',path:'/docs',match:'prefix',enabled:true});expect(create.statusCode,create.body).toBe(201);const item=create.json().item;
  expect((await call(site,'directory-rules')).json().items).toEqual([item]);
  const patch=await call(site,'directory-rules/'+item.id,'PATCH',{name:'技术文档',enabled:false});expect(patch.statusCode,patch.body).toBe(200);expect(patch.json().item).toMatchObject({name:'技术文档',enabled:false,createdAt:item.createdAt,path:'/docs'});
  expect((await call(site,'directory-rules/'+item.id,'DELETE')).statusCode).toBe(204);expect((await call(site,'directory-rules')).json().items).toEqual([]);
  const config=(await pool.query('SELECT config FROM sites WHERE id=$1',[site])).rows[0].config;expect(config).toMatchObject({replay:true,unrelated:{preserve:true}});expect((await pool.query('SELECT action FROM audit_logs WHERE site_id=$1 ORDER BY created_at',[site])).rows.map(row=>row.action)).toEqual(['directory_rules.create','directory_rules.update','directory_rules.delete']);
 });
 it('serializes duplicate directory creation, validates path and only updates allowed metadata',async()=>{
  const site=await newSite(),body={name:'同名',path:'/docs',match:'prefix',enabled:true};const responses=await Promise.all([call(site,'directory-rules','POST',body),call(site,'directory-rules','POST',body)]);expect(responses.map(response=>response.statusCode).sort()).toEqual([201,409]);
  expect((await call(site,'directory-rules','POST',{...body,name:'坏路径',path:'//outside.test/path'})).statusCode).toBe(400);expect((await call(site,'directory-rules','POST',{...body,name:'未分组'})).statusCode).toBe(409);
  const id=responses.find(response=>response.statusCode===201)!.json().item.id;expect((await call(site,'directory-rules/'+id,'PATCH',{id:randomUUID()})).statusCode).toBe(400);expect((await call(site,'directory-rules/'+randomUUID(),'DELETE')).statusCode).toBe(404);
 });
 it('saves and edits links, stores all parameter suggestions, and deleting suggestions preserves links',async()=>{
  const site=await newSite(),body=input(),created=await call(site,'campaign-links','POST',body);expect(created.statusCode,created.body).toBe(201);const item=created.json().item,url=new URL(item.url);expect(url.searchParams.get('utm_source')).toBe('社群');expect(url.searchParams.get('keep')).toBe('1');expect(url.hash).toBe('#section');
  const parameters=(await call(site,'campaign-parameters')).json().items;expect(parameters).toHaveLength(4);expect((await call(site,'campaign-parameters','POST',{field:'utm_term',value:'统计'})).statusCode).toBe(201);
  expect((await call(site,'campaign-parameters/'+parameters[0].id,'DELETE')).statusCode).toBe(204);expect((await call(site,'campaign-links')).json().items).toHaveLength(1);
  const edited=await call(site,'campaign-links/'+item.id,'PATCH',{name:'新的推广',parameters:{...body.parameters,utm_source:'newsletter'}});expect(edited.statusCode,edited.body).toBe(200);expect(new URL(edited.json().item.url).searchParams.get('utm_source')).toBe('newsletter');
  expect((await call(site,'campaign-links/'+item.id,'DELETE')).statusCode).toBe(204);expect((await call(site,'campaign-links')).json().items).toEqual([]);expect((await call(site,'campaign-parameters')).json().items.length).toBeGreaterThan(0);
 });
 it('validates safe URLs and rolls back link creation when its parameter library would exceed its limit',async()=>{
  const site=await newSite(),body=input();expect((await call(site,'campaign-links','POST',{...body,targetUrl:'javascript:alert(1)'})).statusCode).toBe(400);
  const parameters=Array.from({length:siteContentLimits.campaign_parameters},(_,index)=>({id:randomUUID(),field:'utm_source',value:'source'+index,createdAt:new Date().toISOString()}));await pool.query("UPDATE sites SET config=config||jsonb_build_object('campaign_parameters',$2::jsonb) WHERE id=$1",[site,JSON.stringify(parameters)]);
  expect((await call(site,'campaign-links','POST',body)).statusCode).toBe(409);expect((await call(site,'campaign-links')).json().items).toEqual([]);expect((await call(site,'campaign-parameters')).json().items).toHaveLength(siteContentLimits.campaign_parameters);
 });
 it('requires site access for every resource and admin for writes without exposing other sites',async()=>{
  const a=await newSite(),b=await newSite(false);for(const resource of ['directory-rules','campaign-links','campaign-parameters']){
   expect((await call(a,resource,'GET',undefined,{})).statusCode).toBe(401);expect((await call(b,resource)).statusCode).toBe(403);expect((await call(a,resource,'GET',undefined,viewerHeaders)).statusCode).toBe(200);
   for(const method of ['POST','PATCH','DELETE'] as const)expect((await call(a,resource+(method==='POST'?'':'/'+randomUUID()),method,method==='DELETE'?undefined:{name:'denied'},viewerHeaders)).statusCode).toBe(403);
  }
 });
});
