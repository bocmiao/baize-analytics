import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtemp,mkdir,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {Pool} from 'pg';
import {it,expect} from 'vitest';
import {createApp} from '../../src/server/app.js';
import {claimSite,rebuildSite} from '../../src/server/worker.js';
import {replayDeletionJournal} from '../../src/server/deletion.js';
import {backupHistoryNamespaces} from '../../src/server/history-namespace-backup.js';
import {HistoryStore} from '../../src/server/history-store.js';
import {lockSite} from '../../src/server/db.js';
import {CanonicalClickHouse} from '../../src/server/canonical-clickhouse.js';
import {installCanonicalEventStore} from '../../src/server/event-store.js';
import {CANONICAL_ACTIVATION_READY,shadowCanonicalBatch,verifyCanonicalShadow} from '../../src/server/canonical-migration.js';
import {isolatedTestConnectionString} from '../support/database-url.js';
import {ClickHouseSessionHeaderStore,installSessionHeaderStore} from '../../src/server/session-header-store.js';
import {ClickHouseFactStore,installFactStore} from '../../src/server/fact-store.js';
import {ClickHouseRemainingFactStore,installRemainingFactStore} from '../../src/server/remaining-fact-store.js';
import {ClickHouseCacheStore,installCacheStore} from '../../src/server/cache-store.js';
import {migratePublishedHeaderClosure} from '../../src/server/session-header-publication.js';
import {migratePublishedFactClosure} from '../../src/server/fact-closure-migration.js';
import {migratePublishedCacheClosure} from '../../src/server/cache-closure-migration.js';
import {activateStrictFactBodies} from '../../src/server/strict-fact-storage.js';
import {backupSessionHeaders} from '../../src/server/session-header-backup.js';
import {backupFactBodies} from '../../src/server/fact-body-backup.js';
import {backupRemainingBodies} from '../../src/server/remaining-body-backup.js';
import {backupCacheBodies} from '../../src/server/cache-body-backup.js';
import {backupCanonical} from '../../src/server/canonical-backup.js';
import {loadVerifiedCanonicalRawBackup} from '../../src/server/canonical-raw-backup-readiness.js';
import {runCanonicalOperation} from '../../src/server/canonical-operations.js';
import {loadVerifiedFactBackup,type VerifiedFactBackup} from '../../src/server/fact-backup-readiness.js';
it.skipIf(!process.env.TEST_DATABASE_URL||!process.env.CLICKHOUSE_TEST_URL||!CANONICAL_ACTIVATION_READY)('deletion purges mixed delta positive visitor metadata and signed namespaces without removing B',async()=>{
 const schema='incremental_sessions_'+randomUUID().replaceAll('-',''),site=randomUUID(),visitor=randomUUID(),page=randomUUID(),dir=await mkdtemp('/tmp/baize-strict-facts-'),admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:isolatedTestConnectionString(),max:1,options:`-c search_path=${schema}`});let runtime:Awaited<ReturnType<typeof createApp>>|undefined;let base='',cookie='';const http=async(path:string,payload?:unknown)=>{const r=await fetch(base+path,{method:payload===undefined?'GET':'POST',headers:{cookie,origin:path==='/api/collect'?'https://example.test':'http://localhost','content-type':'application/json'},body:payload===undefined?undefined:JSON.stringify(payload)});const text=await r.text();return {status:r.status,headers:r.headers,text,json:()=>JSON.parse(text)};};
 const config={url:process.env.CLICKHOUSE_TEST_URL!,username:'baize',password:'local-test-only'},canonical=new CanonicalClickHouse(config),headers=new ClickHouseSessionHeaderStore(config),facts=new ClickHouseFactStore(config),remaining=new ClickHouseRemainingFactStore(config),cache=new ClickHouseCacheStore(config),key=randomBytes(32),now=Date.now()-60000;
 await admin.query(`CREATE SCHEMA ${schema}`);
 try{
  runtime=await createApp({pool,redis:null,background:false,dataDir:dir,keyDir:dir,publicUrl:'http://localhost',canonical});base=await runtime.app.listen({host:'127.0.0.1',port:0});const setup=await http('/api/setup',{email:'strict-identities@example.invalid',password:'Local-private-123456789!'});expect(setup.status,setup.text).toBe(200);cookie=setup.headers.get('set-cookie')!.split(';')[0]!;await pool.query("INSERT INTO sites(id,name,domain,salt_secret,timezone) VALUES($1,'strict','example.test','strict-test-secret','UTC')",[site]);await pool.query('INSERT INTO aggregation_state(site_id) VALUES($1)',[site]);await pool.query('INSERT INTO site_members(site_id,user_id,role) SELECT $1,id,\'admin\' FROM users',[site]);
  let eventSequence=0;const untouched=randomUUID(),start=Math.floor(now/3600000)*3600000-3*3600000;
  const collect=async(path:string,type='pageview',extra:Record<string,unknown>={})=>{const r=await fetch(base+'/api/collect',{method:'POST',headers:{origin:'https://example.test','user-agent':'Mozilla/5.0 Chrome/120.0','content-type':'application/json'},body:JSON.stringify({protocol_version:1,site_id:site,sdk:'strict-native',sent_at:Date.now(),events:[{event_id:randomUUID(),visitor_id:visitor,page_id:page,ts:now+eventSequence++,type,url:'https://example.test'+path,path,...extra}]})});expect(r.status,await r.text()).toBe(202);};
  const run=async()=>{const claim=await claimSite(pool);expect(claim).not.toBeNull();expect(await rebuildSite(pool,claim!)).toBe(true);};
  await collect('/entry');await run();
  for(const store of [canonical,headers,facts,remaining,cache])await store.initialize();installCanonicalEventStore(pool,canonical);installSessionHeaderStore(pool,headers);installFactStore(pool,facts);installRemainingFactStore(pool,remaining);installCacheStore(pool,cache);
  const c=await pool.connect();try{await c.query('BEGIN');await lockSite(c,site);await shadowCanonicalBatch(c,canonical,site,randomUUID());expect((await verifyCanonicalShadow(c,canonical,site)).verified).toBe(1);const state=(await c.query('SELECT a.epoch,c.epoch canonical,c.deletion_epoch::text deletion,a.generation::text generation FROM aggregation_state a JOIN canonical_event_authority c USING(site_id) WHERE a.site_id=$1',[site])).rows[0],fence={expectedAggregationEpoch:state.epoch,expectedCanonicalEpoch:state.canonical,expectedDeletionEpoch:state.deletion,expectedGeneration:state.generation,verifyLiveFence:async()=>{}};
   await migratePublishedHeaderClosure(c,headers,site,fence);await migratePublishedFactClosure(c,site,{facts,remaining},fence);await c.query('COMMIT');
  }finally{await c.query('ROLLBACK');c.release();}
  const activated=await http(`/api/v1/sites/${site}/canonical`,{action:'activate'});expect(activated.status,activated.text).toBe(200);await run();const pruned=await http(`/api/v1/sites/${site}/canonical`,{action:'prune'});expect(pruned.status,pruned.text).toBe(409);expect(pruned.json().error).toBe('canonical_backup_required');
  const b=await pool.connect();try{await b.query('BEGIN');await lockSite(b,site);const s=(await b.query('SELECT a.epoch,c.epoch canonical,c.deletion_epoch::text deletion,a.generation::text generation FROM aggregation_state a JOIN canonical_event_authority c USING(site_id) WHERE a.site_id=$1',[site])).rows[0],fence={expectedAggregationEpoch:s.epoch,expectedCanonicalEpoch:s.canonical,expectedDeletionEpoch:s.deletion,expectedGeneration:s.generation,verifyLiveFence:async()=>{}};
   await migratePublishedHeaderClosure(b,headers,site,fence);await migratePublishedFactClosure(b,site,{facts,remaining},fence);await migratePublishedCacheClosure(b,cache,site,fence);
   const packages=join(dir,'packages');await mkdir(packages,{recursive:true});await backupSessionHeaders(b,headers,join(packages,'headers'),key);await backupFactBodies(b,facts,join(packages,'facts'),key);await backupRemainingBodies(b,remaining,join(packages,'remaining'),key);await backupCacheBodies(b,cache,join(packages,'caches'),key);
   await backupCanonical(b,canonical,site,join(packages,'canonical'),runtime.ctx.config.dataDir,{key});
   const rawProof=await loadVerifiedCanonicalRawBackup(b,{siteId:site,packageDirectory:join(packages,'canonical'),journalDir:runtime.ctx.config.dataDir,key,store:canonical});
   await runCanonicalOperation(b,pool,site,'prune',null,rawProof);
   const strictPackages=join(dir,'strict-packages');await mkdir(strictPackages);
   await backupSessionHeaders(b,headers,join(strictPackages,'headers'),key);await backupFactBodies(b,facts,join(strictPackages,'facts'),key);await backupRemainingBodies(b,remaining,join(strictPackages,'remaining'),key);await backupCacheBodies(b,cache,join(strictPackages,'caches'),key);
   const proof=await loadVerifiedFactBackup(b,{packageDirectory:strictPackages,journalDir:runtime.ctx.config.dataDir,key,stores:{headers,facts,remaining,cache},scope:'all'});
   await expect(activateStrictFactBodies(b,site,{verified:true,scope:'all'} as VerifiedFactBackup,{facts,remaining})).rejects.toThrow('PROOF_INVALID');
   expect(await activateStrictFactBodies(b,site,proof,{facts,remaining})).toMatchObject({strict:true,authority:'clickhouse'});await b.query('COMMIT');
  }finally{await b.query('ROLLBACK');b.release();}

  const originalOptIn=process.env.BAIZE_INCREMENTAL_SESSIONS;
  const batch=async(events:Record<string,unknown>[])=>{const response=await http('/api/collect',{protocol_version:1,site_id:site,sdk:'actual-incremental-differential',sent_at:Date.now(),events:events.map(e=>({event_id:randomUUID(),page_id:randomUUID(),url:'https://example.test'+String(e.path),...e}))});expect(response.status,response.text).toBe(202);expect(response.json().accepted).toBe(events.length);};
  try{
   delete process.env.BAIZE_INCREMENTAL_SESSIONS;
   await batch([{visitor_id:visitor,ts:start,type:'pageview',path:'/A'},{visitor_id:untouched,ts:start+1000,type:'pageview',path:'/B'}]);await run();
   process.env.BAIZE_INCREMENTAL_SESSIONS='1';
   await batch([{visitor_id:visitor,ts:start+2000,type:'pageview',path:'/A2'},{visitor_id:untouched,ts:start+3000,type:'pageview',path:'/B2'}]);await run();
   const delta=(await pool.query("SELECT p.run_id FROM analytics_incremental_run_plans p JOIN analytics_fact_runs r ON r.id=p.run_id WHERE p.site_id=$1 AND p.mode='visitor_delta' ORDER BY r.generation DESC LIMIT 1",[site])).rows[0];expect(delta).toBeDefined();
   const scopes=async()=>(await pool.query('SELECT visitor_id FROM analytics_incremental_run_visitors WHERE run_id=$1 ORDER BY visitor_id',[delta.run_id])).rows.map(r=>r.visitor_id);
   const before=await scopes();expect(before).toHaveLength(2);
   // Determine A from authenticated effects, never guess the derived visitor ID.
   const sourceClient=await pool.connect();let victim='';try{await sourceClient.query('BEGIN');for await(const rows of facts.streamRunRows(sourceClient,site,delta.run_id,'effects'))for(const row of rows){if(row.row.event_path==='/A'||row.row.event_path==='/A2')victim=row.visitorId;}}finally{await sourceClient.query('ROLLBACK');sourceClient.release();}
   expect(before).toContain(victim);const survivor=before.find((v:string)=>v!==victim)!;
   const deleted=await http(`/api/v1/sites/${site}/delete-visitor`,{visitor_id:victim});expect(deleted.status,deleted.text).toBe(200);
   expect(await scopes()).toEqual([survivor]);
   expect((await pool.query('SELECT 1 FROM analytics_session_contribution_heads WHERE site_id=$1 AND visitor_id=$2 AND run_id=$3',[site,survivor,delta.run_id])).rowCount).toBeGreaterThan(0);
   const preserved=await pool.connect();let survivorPages=0;try{await preserved.query('BEGIN');for await(const rows of facts.streamRunRows(preserved,site,delta.run_id,'effects'))for(const row of rows){expect(row.visitorId).not.toBe(victim);if(row.visitorId===survivor&&row.row.metric==='pv')survivorPages+=row.row.value;}}finally{await preserved.query('ROLLBACK');preserved.release();}expect(survivorPages).toBe(2);
   // Simulate a restored positive scope only: the durable tombstone already exists
   // and no victim raw body remains, so both replays exercise changed=false cleanup.
   for(let attempt=0;attempt<2;attempt++){await pool.query('INSERT INTO analytics_incremental_run_visitors(run_id,visitor_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[delta.run_id,victim]);await replayDeletionJournal(pool,dir);expect(await scopes()).toEqual([survivor]);}
   const history=new HistoryStore(config);const c=await pool.connect();const signed=join(dir,'metadata-signed');try{await c.query('BEGIN');await lockSite(c,site);await backupHistoryNamespaces(c,history,signed,'isolated-metadata-source',dir,{key});await c.query('COMMIT');}finally{await c.query('ROLLBACK');c.release();}
   const metadata=await readFile(join(signed,'facts.ndjson'),'utf8');expect(metadata).not.toContain(victim);expect(metadata).toContain(survivor);expect(JSON.parse(await readFile(join(signed,'manifest.json'),'utf8')).mac).toMatch(/^[a-f0-9]{64}$/);
  }finally{if(originalOptIn===undefined)delete process.env.BAIZE_INCREMENTAL_SESSIONS;else process.env.BAIZE_INCREMENTAL_SESSIONS=originalOptIn;}
 }finally{const cleanup=await pool.connect();try{await cleanup.query('BEGIN');await cache.invalidateSite(cleanup,site);const visitors=(await cleanup.query('SELECT DISTINCT m.visitor_id FROM analytics_remaining_fact_members m JOIN analytics_fact_runs r ON r.id=m.run_id WHERE r.site_id=$1',[site])).rows.map(row=>({visitorId:row.visitor_id}));if(visitors.length){await remaining.eraseSegments(cleanup,site,visitors);await facts.eraseSegments(cleanup,site,visitors);await headers.eraseSegments(cleanup,site,visitors);await canonical.deleteSegments(cleanup,site,visitors,async()=>{});}await cleanup.query('COMMIT');}finally{await cleanup.query('ROLLBACK');cleanup.release();}await runtime?.app.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();await rm(dir,{recursive:true,force:true});}
},90000);
