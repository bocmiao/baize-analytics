import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {Pool} from 'pg';
import {expect,it} from 'vitest';
import {createApp} from '../../src/server/app.js';
import {claimSite,rebuildSite} from '../../src/server/worker.js';
import {queryStats} from '../../src/server/analytics.js';
import {deleteVisitor,replayDeletionJournal} from '../../src/server/deletion.js';
import {verifySessionEventHeaderRecords,type SessionEventHeaderRecord} from '../../src/server/session-event-headers.js';
import {visitorHash} from '../../src/server/security.js';

it.skipIf(!process.env.TEST_DATABASE_URL)('native collection and durable identity deletion split an expired session while preserving B, properties and vitals',async()=>{
 const schema=`headerdelete_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`,max:1}),dir=await mkdtemp('/tmp/baize-header-delete-');let runtime:Awaited<ReturnType<typeof createApp>>|undefined;
 await admin.query(`CREATE SCHEMA ${schema}`);
 try{
  runtime=await createApp({pool,redis:null,background:false,dataDir:dir,keyDir:dir});const site=randomUUID(),boundary=Date.now()-86400000,pageA=randomUUID(),pageB=randomUUID(),wireA=randomUUID(),wireB=randomUUID(),bridgeTs=boundary-15*60000;
  await pool.query("INSERT INTO sites(id,name,domain,salt_secret,retention_days,timezone) VALUES($1,'topology','example.test','test',2,'UTC')",[site]);await pool.query('INSERT INTO aggregation_state(site_id) VALUES($1)',[site]);
  const run=async()=>{const claim=await claimSite(pool);expect(claim).not.toBeNull();return rebuildSite(pool,claim!);};
  const base=await runtime.app.listen({host:'127.0.0.1',port:0}),events=[[-31*60000,'A','pageview','/entry',{}],[-30*60000-1000,'A','event','/entry',{event_name:'click',props:{plan:'免费'}}],[-30*60000,'A','vitals','/entry',{vitals:{lcp:100}}],[-15*60000,'A','heartbeat','/entry',{interval_start:0,interval_end:1000,visible_ms:700}],[60000,'A','pageview','/tail',{}],[120000,'A','pageview','/later',{}],[-3600000,'B','pageview','/b',{}]] as [number,string,string,string,Record<string,unknown>][];
  const response=await fetch(`${base}/api/collect`,{method:'POST',headers:{'content-type':'application/json',origin:'https://example.test','user-agent':'Mozilla/5.0 Chrome/120.0'},body:JSON.stringify({protocol_version:1,site_id:site,sdk:'header-reconstruction-test',sent_at:Date.now(),events:events.map(([offset,visitor,type,path,payload])=>({event_id:randomUUID(),page_id:visitor==='A'?pageA:pageB,visitor_id:visitor==='A'?wireA:wireB,ts:boundary+offset,type,url:`https://example.test${path}`,path,...payload}))})});expect(response.status).toBe(202);expect((await response.json()).accepted).toBe(7);
  expect(await run()).toBe(true);await pool.query('UPDATE sites SET retention_days=1 WHERE id=$1',[site]);await pool.query('UPDATE aggregation_state SET generation=generation+1 WHERE site_id=$1',[site]);expect(await run()).toBe(true);
  await pool.query('DELETE FROM events WHERE site_id=$1 AND ts<$2',[site,new Date(boundary)]);
  const visitor=(await pool.query("SELECT visitor_id FROM sessions WHERE site_id=$1 AND entry_path='/entry'",[site])).rows[0].visitor_id;
  await pool.query('INSERT INTO identity_bindings(site_id,visitor_id,user_id,started_at,ended_at) VALUES($1,$2,$3,$4,$5)',[site,visitor,visitorHash('test','identity','deleted-user',''),new Date(bridgeTs),new Date(bridgeTs+1000)]);
  const deleted=await deleteVisitor(runtime.ctx,site,{user_id:'deleted-user'},null);expect(deleted.journal).toBe('durable');expect((await pool.query('SELECT count(*)::int n FROM analytics_session_event_headers WHERE event_ts>=$1 AND event_ts<$2',[new Date(bridgeTs),new Date(bridgeTs+1000)])).rows[0].n).toBe(0);
  const claim=await claimSite(pool);expect(claim).not.toBeNull();expect(await rebuildSite(pool,claim!)).toBe(true);const stats=await queryStats(runtime.ctx,site,new Date(boundary-7200000).toISOString(),new Date(boundary+3600000).toISOString());
  expect(stats.totals.pv).toBe(4);expect(stats.totals.uv).toBe(2);expect(stats.totals.sessions).toBe(3);expect(stats.totals.visibleSeconds).toBe(0);expect(stats.coverage).toBe(1);expect(stats.vitals.find(v=>v.metric==='lcp')).toMatchObject({sampleCount:1,p75:100});expect(stats.events.find(e=>e.name==='click')?.properties.plan).toEqual({'免费':1});
  expect((await pool.query("SELECT entry_path,pageviews FROM sessions WHERE site_id=$1 AND visitor_id=$2 ORDER BY started_at",[site,visitor])).rows).toEqual([{entry_path:'/entry',pageviews:1},{entry_path:'/tail',pageviews:2}]);expect(pool.waitingCount).toBe(0);
  expect((await pool.query('SELECT count(*)::int n FROM analytics_session_rebuild_requests WHERE site_id=$1',[site])).rows[0].n).toBe(0);
  await replayDeletionJournal(pool,dir);await pool.query('UPDATE aggregation_state SET generation=generation+1 WHERE site_id=$1',[site]);expect(await run()).toBe(true);const replayed=await queryStats(runtime.ctx,site,new Date(boundary-7200000).toISOString(),new Date(boundary+3600000).toISOString());expect(replayed.totals).toMatchObject({pv:4,uv:2,sessions:3,visibleSeconds:0});expect(replayed.coverage).toBe(1);
  const sealed=(await pool.query('SELECT * FROM analytics_session_event_headers WHERE visitor_id=$1 LIMIT 1',[visitor])).rows[0] as SessionEventHeaderRecord;const verifier=await pool.connect();try{await expect(verifySessionEventHeaderRecords(verifier,site,[{...sealed,reducer_payload:{...sealed.reducer_payload,props:{email:'private@example.test'}}}])).rejects.toThrow('SESSION_HEADER_SEAL_INVALID');}finally{verifier.release();}
  const processed=(await pool.query('SELECT processed_generation::text n FROM aggregation_state WHERE site_id=$1',[site])).rows[0].n;
  await pool.query("UPDATE analytics_session_event_headers SET event_path='/forged' WHERE visitor_id=$1 AND event_type='pageview' AND event_ts<$2",[visitor,new Date(boundary)]);await pool.query('UPDATE aggregation_state SET generation=generation+1 WHERE site_id=$1',[site]);
  await expect(run()).rejects.toThrow('SESSION_HEADER_SEAL_INVALID');expect((await pool.query('SELECT processed_generation::text n FROM aggregation_state WHERE site_id=$1',[site])).rows[0].n).toBe(processed);
 }finally{await runtime?.app.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();await rm(dir,{recursive:true,force:true});}
},30000);
