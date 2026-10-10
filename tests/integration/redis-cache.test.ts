import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import pg from 'pg';
import {Redis} from 'ioredis';
import {createApp} from '../../src/server/app.js';
import {runWorkerOnce} from '../../src/server/worker.js';
describe.skipIf(!process.env.TEST_DATABASE_URL||!process.env.REDIS_URL)('real Redis cache with authoritative PostgreSQL deletion fencing',()=>{
 const schema='cache_'+randomUUID().replaceAll('-','');const admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});let pool:pg.Pool;let redis:Redis;let dir:string;let runtime:Awaited<ReturnType<typeof createApp>>;let cookie:string;let site:string;
 beforeAll(async()=>{await admin.query(`CREATE SCHEMA ${schema}`);pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`});redis=new Redis(process.env.REDIS_URL!);dir=await mkdtemp(join(tmpdir(),'baize-cache-'));runtime=await createApp({pool,redis,dataDir:dir,keyDir:join(dir,'keys'),background:false});const setup=await runtime.app.inject({method:'POST',url:'/api/setup',payload:{email:'cache@example.test',name:'cache',password:'Cache-acceptance-123!'}});cookie=String(setup.headers['set-cookie']).split(';')[0]!;site=(await runtime.app.inject({method:'POST',url:'/api/v1/sites',headers:{cookie},payload:{name:'cache',domain:'example.test',timezone:'UTC'}})).json().site.id;});
 afterAll(async()=>{await runtime?.app.close();if(redis&&site){const keys=await redis.keys(`*${site}*`);if(keys.length)await redis.del(...keys);}await redis?.quit();await pool?.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();if(dir)await rm(dir,{recursive:true,force:true});});
 it('publishes changed generations, deletes site cache and never serves cached deleted events',async()=>{
  expect(await redis.ping()).toBe('PONG');const visitor=randomUUID(),page=randomUUID(),ts=Date.now()-60000;const event={event_id:randomUUID(),type:'pageview',ts,visitor_id:visitor,page_id:page,url:'https://example.test/a',path:'/a'};
  const post=()=>runtime.app.inject({method:'POST',url:'/api/collect',headers:{'user-agent':'Firefox'},remoteAddress:'203.0.113.55',payload:{protocol_version:1,site_id:site,sdk:'test',sent_at:Date.now(),events:[event]}});
  expect((await post()).statusCode).toBe(202);await runWorkerOnce(pool);
  const url=`/api/v1/sites/${site}/stats?${new URLSearchParams({from:new Date(ts-3600000).toISOString(),to:new Date(ts+3600000).toISOString()})}`;const stats=()=>runtime.app.inject({url,headers:{cookie}});
  expect((await stats()).json().totals.pv).toBe(1);const initialKeys=await redis.keys(`analytics:${site}:*`);expect(initialKeys).toHaveLength(1);expect(await redis.ttl(initialKeys[0]!)).toBeGreaterThan(0);
  expect((await stats()).json().totals.pv).toBe(1);
  const removed=await runtime.app.inject({method:'POST',url:`/api/v1/sites/${site}/delete-visitor`,headers:{cookie},payload:{visitor_id:visitor}});expect(removed.statusCode,removed.body).toBe(200);expect(await redis.keys(`analytics:${site}:*`)).toHaveLength(0);
  await runWorkerOnce(pool);expect((await stats()).json().totals.pv).toBe(0);expect((await post()).json().rejected[0].reason).toBe('deleted_visitor');
  expect(JSON.stringify(await redis.keys(`baize:rate:${site}:*`))).not.toContain('203.0.113.55');
 });
});
