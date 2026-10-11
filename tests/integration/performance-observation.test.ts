import {it,expect} from 'vitest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../../src/server/app.js';
import type {PerformanceObservation} from '../../src/server/performance-observation.js';

it.skipIf(!process.env.TEST_DATABASE_URL)('actual Fastify concurrent collector scopes preserve safe PG timing isolation on max-one pool',async()=>{
 const schema='perf_scope_'+randomUUID().replaceAll('-','');
 const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1});
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1,options:`-c search_path=${schema},public`});
 const dir=await mkdtemp(join(tmpdir(),'baize-performance-scope-'));
 let runtime:Awaited<ReturnType<typeof createApp>>|undefined;
 const observations:Readonly<PerformanceObservation>[]=[];
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);
  runtime=await createApp({pool,redis:null,clickhouse:null,canonical:null,history:null,dataDir:dir,keyDir:join(dir,'keys'),masterKey:Buffer.alloc(32,9),background:false,performanceSink:value=>{if(observations.length<1000)observations.push(value);}});
  const app=runtime.app;
  const setup=await app.inject({method:'POST',url:'/api/setup',payload:{email:'perf-owner@example.test',password:'PerformanceScopeAcceptance2026!'}});
  expect(setup.statusCode).toBe(200);
  const cookie=setup.cookies.map(c=>`${c.name}=${c.value}`).join('; ');
  const created=await app.inject({method:'POST',url:'/api/v1/sites',headers:{cookie},payload:{name:'Actual performance scope',domain:'performance.example.test',timezone:'UTC'}});
  expect(created.statusCode).toBe(201);
  const site=created.json().site.id,visitor=randomUUID();
  observations.length=0;
  const replies=await Promise.all(Array.from({length:2},(_,index)=>app.inject({method:'POST',url:'/api/collect',headers:{'user-agent':'Mozilla/5.0 real local performance acceptance'},payload:{protocol_version:1,site_id:site,sdk:'performance-scope-test',sent_at:Date.now(),events:[{event_id:randomUUID(),visitor_id:visitor,page_id:randomUUID(),ts:Date.now()-1000-index,type:'pageview',path:'/local',url:'https://performance.example.test/local'}]}})));
  expect(replies.map(reply=>reply.statusCode)).toEqual([202,202]);
  expect((await pool.query('SELECT count(*)::int n FROM events WHERE site_id=$1',[site])).rows[0].n).toBe(2);
  const groups=new Map<string,Readonly<PerformanceObservation>[]>();
  for(const observation of observations){
   expect(observation.operation).toBe('http_request');expect(observation.durationMs).toBeGreaterThanOrEqual(0);expect(observation.result).toBe('success');
   const items=groups.get(observation.correlationId)??[];items.push(observation);groups.set(observation.correlationId,items);
   expect(Object.keys(observation).sort()).toEqual(['correlationId','durationMs','endedAtMs','operation','result','route','stage','startedAtMs']);
  }
  expect(groups.size).toBe(2);for(const reply of replies){const scope=reply.headers['x-baize-performance-scope'];expect(typeof scope).toBe('string');expect(groups.has(String(scope))).toBe(true);}for(const group of groups.values())expect(group.every(event=>event.route==='collect'&&event.endedAtMs>=event.startedAtMs)).toBe(true);
  for(const group of groups.values())expect(new Set(group.map(event=>event.stage))).toEqual(new Set(['pool_acquire','partition_lock','site_lock']));
  const serialized=JSON.stringify(observations);for(const sensitive of [visitor,site,'perf-owner@example.test','performance.example.test','SELECT','password'])expect(serialized).not.toContain(sensitive);
  observations.length=0;const stats=await app.inject({method:'GET',url:`/api/v1/sites/${site}/stats?from=${encodeURIComponent(new Date(Date.now()-60000).toISOString())}&to=${encodeURIComponent(new Date().toISOString())}`,headers:{cookie,'x-baize-performance-scope':'spoofed-client-value'}});expect(stats.statusCode).toBe(200);expect(stats.headers['x-baize-performance-scope']).not.toBe('spoofed-client-value');expect(observations.some(o=>o.route==='stats'&&o.stage==='site_shared_lock')).toBe(true);expect(observations.some(o=>o.route==='stats'&&o.stage==='stats_snapshot_hold')).toBe(true);expect(pool.waitingCount).toBe(0);
 }finally{
  await runtime?.app.close();await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();await rm(dir,{recursive:true,force:true});
 }
},30000);

it.skipIf(!process.env.TEST_DATABASE_URL)('default application never emits diagnostic scope headers or trusts a client supplied scope',async()=>{
 const schema='perf_default_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`}),dir=await mkdtemp(join(tmpdir(),'baize-performance-default-'));let runtime:Awaited<ReturnType<typeof createApp>>|undefined;
 try{await admin.query(`CREATE SCHEMA ${schema}`);runtime=await createApp({pool,redis:null,clickhouse:null,canonical:null,history:null,dataDir:dir,keyDir:join(dir,'keys'),masterKey:Buffer.alloc(32,9),background:false});const reply=await runtime.app.inject({url:'/healthz',headers:{'x-baize-performance-scope':'spoofed-client-value'}});expect(reply.statusCode).toBe(200);expect(reply.headers['x-baize-performance-scope']).toBeUndefined();}
 finally{await runtime?.app.close();await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();await rm(dir,{recursive:true,force:true});}
},30000);
