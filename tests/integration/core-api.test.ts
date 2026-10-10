import { beforeAll,afterAll,describe,it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { createApp } from '../../src/server/app.js';
import { runWorkerOnce } from '../../src/server/worker.js';
import { replayDeletionJournal } from '../../src/server/deletion.js';
import { gunzipSync,gzipSync } from 'node:zlib';
const enabled=Boolean(process.env.TEST_DATABASE_URL);
describe.skipIf(!enabled)('real PostgreSQL application API acceptance',()=>{
  const schema='core_'+randomUUID().replaceAll('-','');const admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});
  let pool:pg.Pool;let runtime:Awaited<ReturnType<typeof createApp>>;let dir:string;let cookie='';let site='';
  const visitor=randomUUID(),page=randomUUID();
  const wire=(extra:Record<string,unknown>={})=>({event_id:randomUUID(),type:'pageview',ts:Date.now()-10000,visitor_id:visitor,page_id:page,url:'https://example.test/a?password=private',path:'/a',...extra});
  const collect=(events:unknown[],siteId=site)=>runtime.app.inject({method:'POST',url:'/api/collect',headers:{'user-agent':'Firefox/120','origin':'https://example.test'},remoteAddress:'203.0.113.17',payload:{protocol_version:1,site_id:siteId,sdk:'tracker.js/1.0.0',sent_at:Date.now(),events}});
  beforeAll(async()=>{await admin.query(`CREATE SCHEMA ${schema}`);pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`});dir=await mkdtemp(join(tmpdir(),'baize-core-'));runtime=await createApp({pool,redis:null,dataDir:dir,background:false});await runtime.app.ready();});
  afterAll(async()=>{await runtime?.app.close();await pool?.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();if(dir)await rm(dir,{recursive:true,force:true});});
  it('initializes exactly one admin atomically and protects authenticated management',async()=>{
    expect((await runtime.app.inject('/api/setup')).json().required).toBe(true);
    const attempts=await Promise.all([1,2].map(i=>runtime.app.inject({method:'POST',url:'/api/setup',payload:{email:`owner${i}@example.test`,password:'Acceptance-password-123!',name:'管理员'}})));
    expect(attempts.map(x=>x.statusCode).sort()).toEqual([200,409]);cookie=attempts.find(x=>x.statusCode===200)!.headers['set-cookie']!.toString().split(';')[0]!;
    expect((await runtime.app.inject('/api/me')).statusCode).toBe(401);
    const create=await runtime.app.inject({method:'POST',url:'/api/v1/sites',headers:{cookie},payload:{name:'真实站点',domain:'example.test',timezone:'UTC'}});expect(create.statusCode).toBe(201);site=create.json().site.id;
    const csrf=await runtime.app.inject({method:'POST',url:'/api/v1/sites',headers:{cookie,origin:'https://attacker.example'},payload:{name:'攻击',domain:'bad.test'}});expect(csrf.statusCode).toBe(403);
    expect((await runtime.app.inject({url:'/api/v1/sites',headers:{cookie}})).json().sites).toHaveLength(1);
  });
  it('persists before 202, keeps bool attributes, anonymizes IP/URL and rejects conflicting retry',async()=>{
    const e=wire({type:'event',event_name:'signup',props:{active:true,plan:'free',password:'private'}});
    const first=await collect([e,{bad:true}]);expect(first.statusCode).toBe(202);expect(first.json()).toMatchObject({accepted:1,rejected:[{index:1,reason:'invalid_event'}]});
    const duplicate=await collect([e]);expect(duplicate.json()).toMatchObject({accepted:1,duplicates:1});
    expect((await collect([{...e,ts:e.ts+1}])).json().rejected[0].reason).toBe('event_id_conflict');
    const rows=await pool.query('SELECT payload,dimensions FROM events WHERE site_id=$1',[site]);expect(rows.rows).toHaveLength(1);expect(rows.rows[0].payload.props).toEqual({active:true,plan:'free'});expect(rows.rows[0].payload.url).toBe('https://example.test/a');expect(rows.rows[0].dimensions.ip_truncated).toBe('203.0.113.0');expect(JSON.stringify(rows.rows)).not.toContain('203.0.113.17');
    expect((await pool.query("SELECT boolean_value FROM event_data WHERE site_id=$1 AND data_key='active'",[site])).rows[0].boolean_value).toBe(true);
    expect((await pool.query('SELECT count(*)::int n FROM outbox WHERE site_id=$1',[site])).rows[0].n).toBe(1);
    expect((await collect([wire()],site+'missing')).statusCode).toBe(404);
  });
  it('collects page instances, reconstructs visible intervals, fences and reads real metrics',async()=>{
    const time=Date.now()-40000;
    await collect([wire({ts:time}),wire({type:'heartbeat',ts:time+15000,interval_start:time,interval_end:time+15000,visible_ms:15000}),wire({type:'heartbeat',ts:time+15000,interval_start:time,interval_end:time+15000,visible_ms:15000})]);
    expect(await runWorkerOnce(pool)).toBe(true);
    const stats=await runtime.app.inject({url:`/api/v1/sites/${site}/stats?from=${new Date(time-3600000).toISOString()}&to=${new Date(time+3600000).toISOString()}`,headers:{cookie}});
    expect(stats.statusCode).toBe(200);expect(stats.json().totals.pv).toBe(1);expect(stats.json().totals.uv).toBe(1);
    expect((await pool.query('SELECT visible_ms FROM sessions WHERE site_id=$1',[site])).rows[0].visible_ms).toBe(15000);
  });
  it('supports gzipped envelopes with a bounded decoder and real database transaction',async()=>{
    const body=gzipSync(Buffer.from(JSON.stringify({protocol_version:1,site_id:site,sdk:'tracker.js/1.0.0',sent_at:Date.now(),events:[wire({path:'/gzip'})]})));
    expect(gunzipSync(body).length).toBeGreaterThan(0);
    const response=await runtime.app.inject({method:'POST',url:'/api/collect',headers:{'content-type':'application/json','content-encoding':'gzip','user-agent':'Firefox'},payload:body});expect(response.statusCode).toBe(202);expect(response.json().accepted).toBe(1);
  });
  it('journals deletion durably, serializes intake races, rejects worker resurrection and restore replay',async()=>{
    const race=await Promise.all([runtime.app.inject({method:'POST',url:`/api/v1/sites/${site}/delete-visitor`,headers:{cookie},payload:{visitor_id:visitor}}),collect([wire({path:'/race'})])]);expect(race[0].statusCode).toBe(200);expect(race[0].json().journal).toBe('durable');
    expect((await pool.query('SELECT count(*)::int n FROM events WHERE site_id=$1 AND visitor_id=$2',[site,visitor])).rows[0].n).toBe(0);
    expect((await collect([wire()])).json().rejected[0].reason).toBe('deleted_visitor');
    const journal=await readFile(join(dir,'tombstones.jsonl'),'utf8');expect(JSON.parse(journal.trim()).visitor_id).toBe(visitor);expect(await runWorkerOnce(pool)).toBe(true);
    // Simulate an older DB snapshot that predates the tombstone while preserving its independent journal.
    await pool.query('DELETE FROM tombstones WHERE site_id=$1',[site]);await pool.query("INSERT INTO events(site_id,event_id,ts,visitor_id,page_id,type,path,payload,dimensions,is_bot) VALUES($1,$2,now(),$3,$4,'pageview','/resurrect','{}','{}',false)",[site,randomUUID(),visitor,page]);
    await replayDeletionJournal(pool,dir);expect((await pool.query('SELECT count(*)::int n FROM events WHERE site_id=$1',[site])).rows[0].n).toBe(0);expect((await pool.query('SELECT count(*)::int n FROM tombstones WHERE site_id=$1',[site])).rows[0].n).toBe(1);
  });
});
