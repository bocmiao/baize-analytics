import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Pool} from 'pg';
import Fastify from 'fastify';
import {migrate,transaction,lockSite} from '../../src/server/db.js';
import {ClickHouseStore} from '../../src/server/clickhouse-store.js';
import {ClickHouseMirror,setReplicaMode} from '../../src/server/clickhouse-mirror.js';
import {EventStore,installEventStore} from '../../src/server/event-store.js';
import {registerCollect} from '../../src/server/collect.js';
import {registerAnalytics} from '../../src/server/analytics.js';
import type {AppContext} from '../../src/server/context.js';

describe.skipIf(!process.env.TEST_DATABASE_URL||!process.env.CLICKHOUSE_TEST_URL)('stats scoped real replica budget with max1',()=>{
 const schema='stats_replica_'+randomUUID().replaceAll('-','');
 const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL});
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1,options:`-c search_path=${schema}`});
 let ch:ClickHouseStore,mirror:ClickHouseMirror,reader:EventStore;const app=Fastify();let directory:string;
 beforeAll(async()=>{ch=new ClickHouseStore({url:process.env.CLICKHOUSE_TEST_URL!,username:'baize',password:'local-test-only'});mirror=new ClickHouseMirror(pool,ch,{minIntervalMs:0});reader=new EventStore(pool,ch);await admin.query(`CREATE SCHEMA ${schema}`);await migrate(pool);directory=await mkdtemp(join(tmpdir(),'stats-replica-'));installEventStore(pool,reader);await ch.initialize();const ctx={pool,redis:null,config:{dataDir:directory,masterKey:Buffer.alloc(32,1),publicUrl:'http://localhost'},authorize:async()=>({id:randomUUID(),is_admin:true}),audit:async()=>{}} as unknown as AppContext;await registerCollect(app,ctx);await registerAnalytics(app,ctx);});
 afterAll(async()=>{await app.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();await rm(directory,{recursive:true,force:true});});
 async function scoped(run:(id:string)=>Promise<void>){const id=randomUUID();await pool.query("INSERT INTO sites(id,name,domain,salt_secret,timezone) VALUES($1,'test','example.test','test','UTC')",[id]);await pool.query('INSERT INTO aggregation_state(site_id) VALUES($1)',[id]);try{await run(id);expect(pool.waitingCount).toBe(0);}finally{await ch.deleteScope(id,{all:true});await pool.query('DELETE FROM sites WHERE id=$1',[id]);}}
 async function collect(id:string,ts:number){const r=await app.inject({method:'POST',url:'/api/collect',headers:{origin:'https://example.test','user-agent':'Mozilla/5.0 Chrome/120.0'},payload:{protocol_version:1,sdk:'replica-budget-test',site_id:id,sent_at:Date.now(),events:[{event_id:randomUUID(),visitor_id:randomUUID(),page_id:randomUUID(),type:'pageview',ts,path:'/same',url:'https://example.test/same'}]}});expect(r.statusCode).toBe(202);}
 async function stats(id:string,from:number,to:number,compare=false){const r=await app.inject(`/api/v1/sites/${id}/stats?from=${new Date(from).toISOString()}&to=${new Date(to).toISOString()}${compare?'&compare=previous':''}`);expect(r.statusCode).toBe(200);return r.json();}
 it('reads a current actual mirror through the stats scoped max1 connection',()=>scoped(async id=>{const ts=Date.now()-7200000;await collect(id,ts);await setReplicaMode(pool,id,'prefer_clickhouse');expect(await mirror.runOnce()).toBe(true);const s=await stats(id,ts-1000,ts+1000);expect(s.totals.pv).toBe(1);expect(s.storage.rawReads[0].source).toBe('clickhouse');}));
 it('falls back honestly when snapshot generation is behind',()=>scoped(async id=>{const ts=Date.now()-7200000;await collect(id,ts);await setReplicaMode(pool,id,'prefer_clickhouse');expect(await mirror.runOnce()).toBe(true);await collect(id,ts+100);const s=await stats(id,ts-1000,ts+1000);expect(s.totals.pv).toBe(2);expect(s.storage.rawReads[0]).toMatchObject({source:'postgres',fallbackReason:'mirror_behind'});}));
 it('shares an incremental replica plus captured PG tail across both comparison windows',()=>scoped(async id=>{const ts=Date.now()-7200000;await collect(id,ts-500);await setReplicaMode(pool,id,'prefer_clickhouse','incremental_v1');expect(await mirror.runOnce()).toBe(true);await collect(id,ts+100);const s=await stats(id,ts,ts+1000,true);expect(s.totals.pv).toBe(1);expect(s.comparison.totals.pv).toBe(1);expect(s.storage.rawReads[0].source).toBe('hybrid');}));
 it('keeps an arbitrary worker-provided client authoritative PG without stats capability',()=>scoped(async id=>{await collect(id,Date.now()-7200000);await setReplicaMode(pool,id,'prefer_clickhouse');expect(await mirror.runOnce()).toBe(true);await transaction(pool,async client=>{await lockSite(client,id);const r=await reader.readSiteEvents(id,{client,statsMirrorRead:true});expect(r.source).toBe('postgres');expect(r.fallbackReason).toBe('transaction_snapshot_requires_postgres');expect(r.events).toHaveLength(1);});}));
});
