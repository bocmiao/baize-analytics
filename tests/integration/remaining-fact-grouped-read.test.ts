import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {expect,it} from 'vitest';
import {migrate} from '../../src/server/db.js';
import {ClickHouseRemainingFactStore,type RemainingFactRecord,type RemainingFactFence} from '../../src/server/remaining-fact-store.js';
import {stageSessionCarry,stageCarryKey} from '../../src/server/session-carry.js';
import {publishRemainingFactBodies} from '../../src/server/remaining-fact-publication.js';
import {consumeClickHouseCommand} from '../../src/server/clickhouse-command-response.js';
it.skipIf(!process.env.TEST_DATABASE_URL||!process.env.CLICKHOUSE_TEST_URL)('real grouped remaining receipts preserve five kinds, mixed tails and last-attempt fail closed under max1',async()=>{
 const schema='remaining_group_'+randomUUID().replaceAll('-',''),site=randomUUID(),run=randomUUID(),epoch=randomUUID(),visitor='grouped-owned',from=new Date(Date.now()-10000).toISOString(),to=new Date(Date.now()-1000).toISOString();
 const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`,max:1}),config={url:process.env.CLICKHOUSE_TEST_URL!,username:'baize',password:'local-test-only'};
 let reads=0;const observedFetch:typeof fetch=(url,init)=>{if(new URL(String(url)).searchParams.get('query')?.startsWith('SELECT'))reads++;return fetch(url,init);};
 const scalar=new ClickHouseRemainingFactStore({...config,fetch:observedFetch,readReceiptBatchSize:1}),grouped=new ClickHouseRemainingFactStore({...config,fetch:observedFetch,readReceiptBatchSize:3});let created=false;
 const fence:RemainingFactFence={expectedAggregationEpoch:epoch,verifyLiveFence:async()=>{}};
 const sessions=Array.from({length:301},(_,i)=>{const id=randomUUID();return {id,visitor_id:visitor,started_at:from,last_active:to,entry_path:'/路径/😀/'+i,exit_path:'/终点',pageviews:1,duration_s:9,visible_ms:100,bounced:true,dimensions:{nullable:null,consent:true,width:1280,...(i===0?{large:'😀/'.repeat(5000)}:{})}};});
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);created=true;await migrate(pool);await scalar.initialize();await pool.query("INSERT INTO sites(id,name,domain,salt_secret) VALUES($1,'group','example.test','group-secret')",[site]);await pool.query('INSERT INTO aggregation_state(site_id,epoch) VALUES($1,$2)',[site,epoch]);await pool.query("INSERT INTO analytics_fact_runs(id,site_id,epoch,generation,outbox_high_watermark,status)VALUES($1,$2,$3,1,0,'ready')",[run,site,epoch]);
  const c=await pool.connect();try{
   await c.query('BEGIN');for(const data of sessions)await c.query('INSERT INTO analytics_session_facts VALUES($1,$2,$3,$4)',[run,data.id,visitor,data]);const session=sessions[0]!.id;
   await c.query("INSERT INTO analytics_numeric_facts VALUES($1,'hourly',$2,$3,'pv',$4,1)",[run,from,session,JSON.stringify([null,true,1280])]);await c.query("INSERT INTO analytics_member_facts VALUES($1,'daily',$2,$3,'uv','[]',$4)",[run,from.slice(0,10),session,visitor]);
   await stageSessionCarry(c,site,run,{visitorId:visitor,sessionId:session,anchorEventId:randomUUID(),through:to,lastEventId:randomUUID(),privacyMode:'standard',localDay:from.slice(0,10),definitionsHash:'group-definitions',state:{startedAt:from,lastActive:to,entryPath:'/a',exitPath:'/b',pageviews:1,visibleMs:100,entryDimensions:{channel:'direct'}},status:'valid'});await stageCarryKey(c,run,visitor,{kind:'page',key:'/a',state:{seen:true},first:from,last:to});await publishRemainingFactBodies(c,scalar,site,run,fence);await c.query("UPDATE analytics_fact_runs SET status='published' WHERE id=$1",[run]);await c.query('COMMIT');
   await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ');const before=(await c.query('SELECT * FROM analytics_remaining_fact_batches WHERE run_id=$1 ORDER BY kind,id',[run])).rows;const collect=async(store:ClickHouseRemainingFactStore,kind?:'sessions')=>{const batches:RemainingFactRecord[][]=[];for await(const batch of store.streamRunRows(c,site,run,kind)){expect(batch.length).toBeLessThanOrEqual(100);batches.push(batch);}return batches;};
   reads=0;const original=await collect(scalar);const scalarReads=reads;reads=0;const candidate=await collect(grouped);expect(candidate).toEqual(original);expect(new Set(candidate.flat().map(r=>(r as RemainingFactRecord&{kind:string}).kind)).size).toBe(5);expect(reads).toBeLessThan(scalarReads);expect(pool.waitingCount).toBe(0);expect((await c.query('SELECT * FROM analytics_remaining_fact_batches WHERE run_id=$1 ORDER BY kind,id',[run])).rows).toEqual(before);
   reads=0;const sessionBatches=await collect(grouped,'sessions');expect(sessionBatches.map(b=>b.length).sort((a,b)=>a-b)).toEqual([1,100,100,100]);expect(reads).toBe(2);
   await c.query('SAVEPOINT bad_fence');await c.query('UPDATE analytics_remaining_fact_batches SET aggregation_epoch=$2 WHERE id=$1',[before.find(b=>b.kind==='sessions')!.id,randomUUID()]);await expect(collect(grouped,'sessions')).rejects.toThrow('REMAINING_FACT_SOURCE_FENCE');await c.query('ROLLBACK TO SAVEPOINT bad_fence');await c.query('COMMIT');
   // Delete only the third committed attempt body: receipts stay unchanged, no first/second batch may escape.
   const victim=before.filter(b=>b.kind==='sessions')[2]!;const url=new URL(config.url);url.searchParams.set('query','ALTER TABLE baize_remaining_facts_v1 DELETE WHERE site_id={site:String} AND run_id={run:UUID} AND attempt_id={attempt:UUID} SETTINGS mutations_sync=2');url.searchParams.set('param_site',site);url.searchParams.set('param_run',run);url.searchParams.set('param_attempt',victim.attempt_id);await consumeClickHouseCommand(await fetch(url,{method:'POST',headers:{'X-ClickHouse-User':config.username,'X-ClickHouse-Key':config.password}}),'test_delete_failure');
   await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ');await expect(grouped.streamRunRows(c,site,run,'sessions').next()).rejects.toThrow('REMAINING_FACT_BODY_UNAVAILABLE');expect((await c.query('SELECT * FROM analytics_remaining_fact_batches WHERE run_id=$1 ORDER BY kind,id',[run])).rows).toEqual(before);await c.query('ROLLBACK');
  }finally{await c.query('ROLLBACK').catch(()=>undefined);c.release();}
 }finally{
  if(created){const c=await pool.connect();try{await c.query('BEGIN');await scalar.eraseSegments(c,site,[{visitorId:visitor}]);await c.query('COMMIT');}finally{await c.query('ROLLBACK').catch(()=>undefined);c.release();}}
  await pool.end();if(created)await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();
 }
});
