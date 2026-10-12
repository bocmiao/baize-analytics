import {fixtureInstallationNonce,prepareInstallationFixture} from '../helpers/install-fixture.js';
import {createServer,type Server} from 'node:http';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {Pool} from 'pg';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {migrate} from '../../src/server/db.js';
import {authFunctions,registerAuth} from '../../src/server/auth.js';
import {registerSites} from '../../src/server/sites.js';
import {registerExternal} from '../../src/server/external.js';
import {safeFetch,type Transport} from '../../src/server/outbound.js';
import type {AppContext} from '../../src/server/context.js';
/** Registered fixture transport maps one invented HTTPS host; production safeFetch remains unchanged. */
describe.skipIf(!process.env.TEST_DATABASE_URL)('actual local HTTP crawler/PG suggestion/recheck',()=>{
 const schema=`seohttp_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:process.env.TEST_DATABASE_URL});
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`});
 const app=Fastify({logger:false}),origin='https://seo-fixture.example.invalid';
 const requests:{path:string;ua:string;at:number}[]=[];let fixed=false,server:Server,local:string,temporary:string,address:string,ownerCookie:string,site:string;
 const html=(path:string)=>fixed?`<!doctype html><html><head><title>${path==='/'?'首页':'修复-'+path}</title><meta name="description" content="真实本地整改"><meta name="viewport" content="width=device-width"><link rel="canonical" href="${origin}${path}"><meta property="og:title" content="修复"></head><body><h1>实际整改页面</h1><img src="/image.png" alt="图示">${path==='/'?'<a href="/article">文章</a><a href="/missing">已修复</a><a href="/blocked">禁止页面</a><a href="https://outside.example.invalid/">外站</a><a href="/query?private=fixture">查询页</a>':''}</body></html>`:`<html><head><title>${path==='/missing'?'':'重复标题'}</title></head><body><img src="/image.png">${path==='/'?'<a href="/article">文章</a><a href="/missing">断链</a><a href="/blocked">禁止页面</a><a href="https://outside.example.invalid/">外站</a><a href="/query?private=fixture">查询页</a>':''}</body></html>`;
 const transport:Transport=async(input,options={})=>{
  const target=new URL(input);if(target.origin!==origin||options.allowedOrigin!==origin||target.username||target.password||target.search)throw new Error('Unregistered SEO fixture destination');
  const response=await fetch(`${local}${target.pathname}`,{method:options.method??'GET',headers:options.headers,redirect:'manual',signal:AbortSignal.timeout(5000)});
  // No redirect escapes the fixture. This is an injected test adapter, never a production private-IP exception.
  if(response.status>=300&&response.status<400)throw new Error('Fixture redirects disabled');const text=await response.text();if(Buffer.byteLength(text)>(options.maxBytes??100000))throw new Error('Fixture body limit');return {status:response.status,headers:Object.fromEntries(response.headers.entries()),text};
 };
 const api=async(path:string,method='GET',body?:unknown,authenticated=true)=>{const response=await fetch(`${address}${path}`,{method,headers:{'content-type':'application/json',...(authenticated?{cookie:ownerCookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json()};};
 beforeAll(async()=>{
  await admin.query(`CREATE SCHEMA ${schema}`);await migrate(pool);temporary=await mkdtemp(join(tmpdir(),'baize-seo-http-'));
  server=createServer((req,res)=>{const path=req.url??'/';requests.push({path,ua:String(req.headers['user-agent']??''),at:Date.now()});if(path==='/robots.txt'){res.writeHead(200,{'content-type':'text/plain'});res.end('User-agent: *\nDisallow: /blocked\n');return;}res.writeHead(path==='/missing'&&!fixed?404:200,{'content-type':'text/html; charset=utf-8'});res.end(html(path));});server.listen(0,'127.0.0.1');await once(server,'listening');local=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const ctx:AppContext={pool,redis:null,config:{dataDir:temporary,keyDir:join(temporary,'keys'),masterKey:randomBytes(32),publicUrl:'http://127.0.0.1'},...authFunctions(pool),audit:async(actorId,siteId,action,target)=>{await pool.query('INSERT INTO audit_logs(actor_id,site_id,action,target) VALUES($1,$2,$3,$4)',[actorId,siteId,action,JSON.stringify(target)]);}};
  await prepareInstallationFixture(ctx.config.keyDir!);await app.register(cookie);await registerAuth(app,ctx);await registerSites(app,ctx);await registerExternal(app,ctx,transport);address=await app.listen({host:'127.0.0.1',port:0});
  const setup=await fetch(`${address}/api/setup`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({installationNonce:fixtureInstallationNonce,email:'seo-http@example.invalid',password:'Actual-seo-local-password'})});expect(setup.status).toBe(200);ownerCookie=setup.headers.get('set-cookie')!.split(';')[0];const created=await api('/api/v1/sites','POST',{name:'Local SEO fixture',domain:new URL(origin).hostname,timezone:'UTC'});expect(created.status).toBe(201);site=created.body.site.id;
 },30000);
 afterAll(async()=>{await app.close();if(server)await new Promise<void>((done,error)=>server.close(e=>e?error(e):done()));await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();if(temporary)await rm(temporary,{recursive:true,force:true});});
 it('crawls actual robots/HTML at production cadence, stores issues, then fresh rechecks a repaired local site with immutable evidence',async()=>{
  expect((await api(`/api/sites/${site}/seo/scan`,'POST',{},false)).status).toBe(401);
  const scan=await api(`/api/sites/${site}/seo/scan`,'POST',{});expect(scan.status).toBe(200);expect(scan.body.results).toHaveLength(3);
  expect(scan.body.results.filter((page:{issues:string[]})=>page.issues.includes('重复 title'))).toHaveLength(2);expect(scan.body.results.find((page:{url:string})=>page.url.endsWith('/missing')).issues).toContain('HTTP 404');expect(scan.body.results[0].issues).toContain('图片缺少 alt');
  const requestedHTML=requests.filter(request=>request.path!=='/robots.txt');expect(requestedHTML.map(request=>request.path)).toEqual(['/','/article','/missing']);expect(requestedHTML[1].at-requestedHTML[0].at).toBeGreaterThanOrEqual(1800);expect(requestedHTML[2].at-requestedHTML[1].at).toBeGreaterThanOrEqual(1800);expect(requests.every(request=>request.ua.startsWith('BaizeBot/'))).toBe(true);
  const stored=(await pool.query('SELECT results FROM seo_scans WHERE id=$1 AND site_id=$2',[scan.body.id,site])).rows[0];expect(stored.results).toEqual(scan.body.results);
  const start=new Date(Date.now()-2*86400000).toISOString().slice(0,10),end=new Date(Date.now()-86400000).toISOString().slice(0,10);
  const evidence=await api(`/api/sites/${site}/evidence`,'POST',{start,end});expect(evidence.status).toBe(200);expect(evidence.body).toMatchObject({aiCalled:false,tokens:0});expect(evidence.body.evidence.seo.scanId).toBe(scan.body.id);
  const created=await api(`/api/sites/${site}/suggestions`,'POST',{evidenceId:evidence.body.id,title:'修复重复标题与断链',category:'seo'});expect(created.status).toBe(200);const suggestion=created.body.id;
  for(const status of ['accepted','in-progress','pending-recheck'])expect((await api(`/api/sites/${site}/suggestions/${suggestion}`,'PATCH',{status,...(status==='pending-recheck'?{implementedAt:end+'T00:00:00Z'}:{})})).status).toBe(200);
  fixed=true;const recheck=await api(`/api/sites/${site}/suggestions/${suggestion}/recheck`,'POST',{start:end,end,confounders:['本地fixture整改；不证明真实搜索排名收益']});expect(recheck.status).toBe(200);expect(recheck.body.seoRecheck.source).toBe('fresh-authorized-crawl');expect(recheck.body.seoRecheck.scanId).not.toBe(scan.body.id);expect(recheck.body.seoRecheck.comparedWith).toBe(scan.body.id);expect(recheck.body.seoRecheck.results.every((page:{issues:string[]})=>page.issues.length===0)).toBe(true);
  expect((await pool.query('SELECT results FROM seo_scans WHERE id=$1',[scan.body.id])).rows[0].results).toEqual(stored.results);
  expect((await api(`/api/sites/${site}/suggestions/${suggestion}`,'PATCH',{status:'verified'})).status).toBe(200);expect((await pool.query('SELECT status,recheck FROM ai_suggestions WHERE id=$1',[suggestion])).rows[0]).toMatchObject({status:'verified',recheck:{seoRecheck:{scanId:recheck.body.seoRecheck.scanId}}});
  await expect(safeFetch(local)).rejects.toThrow();await expect(safeFetch(local.replace('http:','https:'))).rejects.toThrow();await expect(transport('https://outside.example.invalid/',{allowedOrigin:origin})).rejects.toThrow('Unregistered');
 },20000);
});
