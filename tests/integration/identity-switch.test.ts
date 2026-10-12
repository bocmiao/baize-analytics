import {fixtureInstallationNonce} from '../helpers/install-fixture.js';
import {it,expect} from 'vitest';
import pg from 'pg';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {createApp} from '../helpers/install-fixture.js';
import {replayDeletionJournal} from '../../src/server/deletion';
import {runWorkerOnce} from '../../src/server/worker';
import {visitorHash} from '../../src/server/security';

it('event-time A -> B -> delete A preserves B, old A retries and restored A cannot revive',async()=>{
 const schema='identity_'+randomBytes(6).toString('hex'),connectionString=process.env.DATABASE_URL??'postgresql://baize_dev@127.0.0.1:5432/baize_dev';const admin=new pg.Pool({connectionString});await admin.query(`CREATE SCHEMA ${schema}`);const pool=new pg.Pool({connectionString,options:`-c search_path=${schema},public`});const dir=await mkdtemp('/tmp/baize-identity-');let app:Awaited<ReturnType<typeof createApp>>|undefined;
 try{
  app=await createApp({pool,redis:null,dataDir:dir,background:false});const setup=await app.app.inject({method:'POST',url:'/api/setup',payload:{installationNonce:fixtureInstallationNonce,email:'identity@example.test',password:'IdentitySwitch2026!',name:'身份测试'}});expect(setup.statusCode).toBe(200);const cookie=String(setup.headers['set-cookie']).split(';')[0]!;const created=await app.app.inject({method:'POST',url:'/api/v1/sites',headers:{cookie},payload:{name:'身份时间段',domain:'identity.example.test',timezone:'UTC'}});expect(created.statusCode).toBe(201);const site=created.json().site.id as string;const visitor=randomUUID(),page=randomUUID(),base=Date.now()-120000;
  function event(type:string,offset:number,extra:Record<string,unknown>={}){return {event_id:randomUUID(),visitor_id:visitor,page_id:page,type,ts:base+offset,url:'https://identity.example.test/'+type,path:'/'+type,...extra};}
  async function collect(events:Record<string,unknown>[]){return app!.app.inject({method:'POST',url:'/api/collect',headers:{'user-agent':'IdentityRealIntegration/1.0'},payload:{protocol_version:1,site_id:site,sdk:'identity-integration/1.0.0',sent_at:Date.now(),events}});}
  const anonymous=event('pageview',0),identifyZ=event('identify',500,{user_id:'account-Z'}),eventZ=event('event',750,{event_name:'before_A'}),identifyA=event('identify',1000,{user_id:'account-A'}),pvA=event('pageview',1500),identifyB=event('identify',2000,{user_id:'account-B'}),pvB=event('pageview',2500),lateA=event('event',1200,{event_name:'late_A'});
  expect((await collect([anonymous,identifyZ,eventZ,identifyA,pvA,identifyB,pvB])).json().rejected).toEqual([]);expect((await collect([lateA])).json().rejected).toEqual([]);
  const secret=(await pool.query('SELECT salt_secret FROM sites WHERE id=$1',[site])).rows[0].salt_secret;const userA=visitorHash(secret,'identity','account-A',''),userB=visitorHash(secret,'identity','account-B','');const episodes=(await pool.query('SELECT * FROM identity_bindings ORDER BY started_at')).rows;expect(episodes).toHaveLength(3);expect(+episodes[1].ended_at).toBe(base+2000);expect(episodes[2].user_id).toBe(userB);expect((await pool.query('SELECT payload FROM events WHERE event_id=$1',[anonymous.event_id])).rows[0].payload.user_id).toBeUndefined();expect((await pool.query('SELECT payload FROM events WHERE event_id=$1',[lateA.event_id])).rows[0].payload.user_id).toBe(userA);expect((await pool.query('SELECT payload FROM events WHERE event_id=$1',[pvB.event_id])).rows[0].payload.user_id).toBe(userB);
  expect((await collect([event('identify',2000,{user_id:'account-C'})])).json().rejected[0].reason).toBe('identity_time_conflict');
  const oldA=(await pool.query('SELECT * FROM events WHERE payload->>\'user_id\'=$1',[userA])).rows;const oldKeys=(await pool.query('SELECT * FROM event_keys WHERE event_id=ANY($1::uuid[])',[oldA.map(e=>e.event_id)])).rows;const oldOutbox=(await pool.query('SELECT * FROM outbox WHERE event_id=ANY($1::uuid[])',[oldA.map(e=>e.event_id)])).rows;
  const deletion=await app.app.inject({method:'POST',url:`/api/v1/sites/${site}/delete-visitor`,headers:{cookie},payload:{user_id:'account-A'}});expect(deletion.statusCode).toBe(200);expect(deletion.json().journal).toBe('durable');const retained=(await pool.query('SELECT event_id FROM events')).rows.map(r=>r.event_id);expect(new Set(retained)).toEqual(new Set([anonymous.event_id,identifyZ.event_id,eventZ.event_id,identifyB.event_id,pvB.event_id]));expect((await pool.query('SELECT user_id FROM identity_map')).rows[0].user_id).toBe(userB);expect(Number((await pool.query('SELECT count(*) FROM event_keys')).rows[0].count)).toBe(5);expect(Number((await pool.query('SELECT count(*) FROM outbox')).rows[0].count)).toBe(5);
  const retry=await collect([lateA,event('event',1300,{event_name:'old_anonymous_retry'}),event('identify',3000,{user_id:'account-A'})]);expect(retry.json().accepted).toBe(0);expect(retry.json().rejected.map((r:{reason:string})=>r.reason)).toEqual(['deleted_visitor','deleted_visitor','deleted_visitor']);expect((await collect([event('event',3000,{event_name:'still_B'})])).json().accepted).toBe(1);
  expect(await runWorkerOnce(pool)).toBe(true);expect(Number((await pool.query('SELECT sum(pageviews) AS count FROM sessions')).rows[0].count)).toBe(2);
  const journal=await readFile(dir+'/tombstones.jsonl','utf8');expect(journal).toContain('identity-segment');expect(journal).toContain('started_at');expect(journal).toContain('ended_at');
  // Simulate restoring a pre-deletion backup while the independent fsync journal survives.
  await pool.query('DELETE FROM tombstones');await pool.query('DELETE FROM identity_tombstones');
  await pool.query('INSERT INTO identity_bindings(site_id,visitor_id,user_id,started_at,ended_at) VALUES($1,$2,$3,$4,$5)',[site,visitor,userA,new Date(base+1000),new Date(base+2000)]);
  for(const row of oldA)await pool.query('INSERT INTO events(site_id,event_id,ts,visitor_id,page_id,type,path,payload,dimensions,is_bot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[row.site_id,row.event_id,row.ts,row.visitor_id,row.page_id,row.type,row.path,row.payload,row.dimensions,row.is_bot]);for(const row of oldKeys)await pool.query('INSERT INTO event_keys VALUES($1,$2,$3,$4,$5)',[row.site_id,row.event_id,row.hash,row.ts,row.visitor_id]);for(const row of oldOutbox)await pool.query('INSERT INTO outbox(site_id,event_id,ts,visitor_id) VALUES($1,$2,$3,$4)',[row.site_id,row.event_id,row.ts,row.visitor_id]);
  const replay=await replayDeletionJournal(pool,dir);expect(replay.records).toBeGreaterThan(0);expect(Number((await pool.query('SELECT count(*) FROM events WHERE payload->>\'user_id\'=$1',[userA])).rows[0].count)).toBe(0);expect(Number((await pool.query('SELECT count(*) FROM events WHERE payload->>\'user_id\'=$1',[userB])).rows[0].count)).toBe(3);expect((await collect([lateA])).json().rejected[0].reason).toBe('deleted_visitor');
  // Adding a later identity cannot extend an earlier owner's closed period across the deleted A gap.
  expect((await collect([event('identify',4000,{user_id:'account-C'})])).json().accepted).toBe(1);expect((await pool.query('SELECT started_at FROM identity_bindings WHERE user_id=$1',[userB])).rows.map(r=>+r.started_at)).toEqual([base+2000]);expect((await collect([event('identify',800,{user_id:'account-D'})])).json().accepted).toBe(1);const userD=visitorHash(secret,'identity','account-D','');expect(+(await pool.query('SELECT ended_at FROM identity_bindings WHERE user_id=$1',[userD])).rows[0].ended_at).toBe(base+1000);
  // Identity reuse is local to one event: the next event observes a preceding identify.
  const freshVisitor=randomUUID();
  const freshAnonymous=event('pageview',5000,{visitor_id:freshVisitor});
  const freshIdentify=event('identify',5100,{visitor_id:freshVisitor,user_id:'account-fresh'});
  const freshClaimed=event('pageview',5200,{visitor_id:freshVisitor,user_id:'account-fresh'});
  const freshMismatch=event('pageview',5300,{visitor_id:freshVisitor,user_id:'another-account'});
  const freshAttributed=event('pageview',5400,{visitor_id:freshVisitor});
  const localIdentity=await collect([freshAnonymous,freshIdentify,freshClaimed,freshMismatch,freshAttributed]);
  expect(localIdentity.statusCode).toBe(202);
  expect(localIdentity.json()).toMatchObject({accepted:4,duplicates:0,rejected:[{index:3,event_id:freshMismatch.event_id,reason:'identity_mismatch'}]});
  const freshHash=visitorHash(secret,'identity','account-fresh','');
  expect((await pool.query('SELECT payload FROM events WHERE event_id=$1',[freshAnonymous.event_id])).rows[0].payload.user_id).toBeUndefined();
  for(const accepted of [freshClaimed,freshAttributed])expect((await pool.query('SELECT payload FROM events WHERE event_id=$1',[accepted.event_id])).rows[0].payload.user_id).toBe(freshHash);
  const unboundClaim=event('pageview',5500,{visitor_id:randomUUID(),user_id:'account-fresh'});
  expect((await collect([unboundClaim])).json()).toMatchObject({accepted:0,rejected:[{index:0,event_id:unboundClaim.event_id,reason:'identity_mismatch'}]});
  for(const table of ['events','event_keys','outbox'])expect(Number((await pool.query(`SELECT count(*) FROM ${table} WHERE event_id=ANY($1::uuid[])`,[[freshMismatch.event_id,unboundClaim.event_id]])).rows[0].count)).toBe(0);
 }finally{await app?.app.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();await rm(dir,{recursive:true,force:true});}
},40000);
