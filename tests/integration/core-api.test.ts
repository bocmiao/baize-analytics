import {fixtureInstallationNonce} from '../helpers/install-fixture.js';
import { beforeAll,afterAll,describe,it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { createApp } from '../helpers/install-fixture.js';
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
  beforeAll(async()=>{await admin.query(`CREATE SCHEMA ${schema}`);pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`});dir=await mkdtemp(join(tmpdir(),'baize-core-'));runtime=await createApp({pool,redis:null,dataDir:dir,keyDir:join(dir,'keys'),background:false});await runtime.app.ready();});
  afterAll(async()=>{await runtime?.app.close();await pool?.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();if(dir)await rm(dir,{recursive:true,force:true});});
  it('initializes exactly one admin atomically and protects authenticated management',async()=>{
    expect((await runtime.app.inject('/api/setup')).json().required).toBe(true);
    const attempts=await Promise.all([1,2].map(i=>runtime.app.inject({method:'POST',url:'/api/setup',payload:{installationNonce:fixtureInstallationNonce,email:`owner${i}@example.test`,password:'Acceptance-password-123!',name:'管理员'}})));
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
  it('accepts safelisted text/plain beacon JSON and keeps origin/body/schema safeguards',async()=>{
    const payload=JSON.stringify({protocol_version:1,site_id:site,sdk:'tracker.js/1.0.0',sent_at:Date.now(),events:[wire({path:'/beacon'})]});
    const result=await runtime.app.inject({method:'POST',url:'/api/collect',headers:{'content-type':'text/plain;charset=UTF-8',origin:'https://example.test','user-agent':'Firefox'},payload});
    expect(result.statusCode).toBe(202);expect(result.json().accepted).toBe(1);expect((await pool.query("SELECT count(*)::int n FROM events WHERE site_id=$1 AND path='/beacon'",[site])).rows[0].n).toBe(1);
    expect((await runtime.app.inject({method:'POST',url:'/api/collect',headers:{'content-type':'text/plain',origin:'https://other.test'},payload})).statusCode).toBe(403);
    expect((await runtime.app.inject({method:'POST',url:'/api/collect',headers:{'content-type':'text/plain'},payload:'{' })).statusCode).toBe(400);
    expect((await runtime.app.inject({method:'POST',url:'/api/collect',headers:{'content-type':'text/plain'},payload:'x'.repeat(1024*1024+1)})).statusCode).toBe(413);
  });
  it('rechecks privacy configuration after acquiring the intake lock',async()=>{
    const created=await runtime.app.inject({method:'POST',url:'/api/v1/sites',headers:{cookie},payload:{name:'privacy race',domain:'example.test',timezone:'UTC'}});const id=created.json().site.id;
    const holder=await pool.connect();let pending:ReturnType<typeof collect>|undefined;
    try{
      await holder.query('BEGIN');await holder.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[id]);const pid=(await holder.query('SELECT pg_backend_pid() pid')).rows[0].pid;
      pending=collect([wire({type:'identify',user_id:'same-account'}),wire({user_id:'same-account',props:{active:true}})],id);
      let waiting=false;for(let attempt=0;attempt<200;attempt++){const blocked=await holder.query(`SELECT EXISTS(SELECT 1 FROM pg_locks h JOIN pg_locks w ON h.locktype=w.locktype AND h.database=w.database AND h.classid=w.classid AND h.objid=w.objid AND h.objsubid=w.objsubid WHERE h.pid=$1 AND h.locktype='advisory' AND h.granted AND NOT w.granted) waiting`,[pid]);if(blocked.rows[0].waiting){waiting=true;break;}await new Promise(resolve=>setTimeout(resolve,5));}
      expect(waiting).toBe(true);await holder.query("UPDATE sites SET privacy_mode='daily_salt' WHERE id=$1",[id]);await holder.query('COMMIT');
      const response=await pending;expect(response.statusCode).toBe(202);expect(response.json()).toMatchObject({accepted:1,rejected:[{reason:'identify_unsupported_in_daily_salt'}]});
      const rows=(await pool.query('SELECT payload,dimensions FROM events WHERE site_id=$1',[id])).rows;expect(rows).toHaveLength(1);expect(rows[0].payload.user_id).toBeUndefined();expect(rows[0].dimensions.ip_truncated).toBeNull();expect((await pool.query('SELECT count(*)::int n FROM identity_bindings WHERE site_id=$1',[id])).rows[0].n).toBe(0);
    }finally{await holder.query('ROLLBACK');holder.release();await pending;}
  });
  it('persists editable source rules and all UTM dimensions on real collection',async()=>{
    const changed=await runtime.app.inject({method:'PATCH',url:`/api/v1/sites/${site}`,headers:{cookie},payload:{config:{channel_rules:[{name:'partner',channel:'paid',referrer_host:'partner.test',include_subdomains:true,utm_source:'campaign'}],ai_referrer_hosts:['model.test']}}});expect(changed.statusCode,changed.body).toBe(200);
    const event=wire({type:'event',event_name:'source-rule',referrer:'https://sub.partner.test/page?q=private',utm_source:'campaign',utm_term:'keyword',utm_content:'link'});expect((await collect([event])).json().accepted).toBe(1);
    const row=(await pool.query('SELECT dimensions,payload FROM events WHERE site_id=$1 AND event_id=$2',[site,event.event_id])).rows[0];expect(row.dimensions).toMatchObject({channel:'paid',referrer:'sub.partner.test',utm_source:'campaign',utm_term:'keyword',utm_content:'link'});expect(row.payload.referrer).toBe('https://sub.partner.test/page');
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
