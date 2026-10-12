import {fixtureInstallationNonce} from '../helpers/install-fixture.js';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {Pool,Client} from 'pg';
import {it,expect} from 'vitest';
import {createApp} from '../helpers/install-fixture.js';
import {claimSite,rebuildSite} from '../../src/server/worker.js';
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
for(const fault of ['rollback','lease','deletion_epoch'] as const)it.skipIf(!process.env.TEST_DATABASE_URL||!process.env.CLICKHOUSE_TEST_URL||!CANONICAL_ACTIVATION_READY)(`strict delta ${fault} after CH ACK leaves published owners intact`,async()=>{
 const schema='incremental_publish_'+randomUUID().replaceAll('-',''),site=randomUUID(),visitor=randomUUID(),page=randomUUID(),dir=await mkdtemp('/tmp/baize-strict-facts-'),admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:isolatedTestConnectionString(),max:1,options:`-c search_path=${schema}`});let runtime:Awaited<ReturnType<typeof createApp>>|undefined;let observer:Client|undefined;let base='',cookie='';const http=async(path:string,payload?:unknown)=>{const r=await fetch(base+path,{method:payload===undefined?'GET':'POST',headers:{cookie,origin:path==='/api/collect'?'https://example.test':'http://localhost','content-type':'application/json'},body:payload===undefined?undefined:JSON.stringify(payload)});const text=await r.text();return {status:r.status,headers:r.headers,text,json:()=>JSON.parse(text)};};
 const config={url:process.env.CLICKHOUSE_TEST_URL!,username:'baize',password:'local-test-only'},canonical=new CanonicalClickHouse(config),headers=new ClickHouseSessionHeaderStore(config),facts=new ClickHouseFactStore(config),remaining=new ClickHouseRemainingFactStore(config),cache=new ClickHouseCacheStore(config),key=randomBytes(32),now=Date.now()-60000;
 await admin.query(`CREATE SCHEMA ${schema}`);
 try{
  runtime=await createApp({pool,redis:null,background:false,dataDir:dir,keyDir:dir,publicUrl:'http://localhost',canonical});base=await runtime.app.listen({host:'127.0.0.1',port:0});const setup=await http('/api/setup',{installationNonce:fixtureInstallationNonce,email:'strict-identities@example.invalid',password:'Local-private-123456789!'});expect(setup.status,setup.text).toBe(200);cookie=setup.headers.get('set-cookie')!.split(';')[0]!;await pool.query("INSERT INTO sites(id,name,domain,salt_secret,timezone) VALUES($1,'strict','example.test','strict-test-secret','UTC')",[site]);await pool.query('INSERT INTO aggregation_state(site_id) VALUES($1)',[site]);await pool.query('INSERT INTO site_members(site_id,user_id,role) SELECT $1,id,\'admin\' FROM users',[site]);
  let eventSequence=0;const untouched=randomUUID();
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
  try{
   delete process.env.BAIZE_INCREMENTAL_SESSIONS;
   const bEvent=randomUUID();const initialB=await http('/api/collect',{protocol_version:1,site_id:site,sdk:'publication-fault',sent_at:Date.now(),events:[{event_id:bEvent,page_id:randomUUID(),visitor_id:untouched,ts:now+10000,type:'pageview',path:'/immutable-B',url:'https://example.test/immutable-B'}]});expect(initialB.status,initialB.text).toBe(202);await run();
   const bVisitor=(await pool.query('SELECT visitor_id FROM event_keys WHERE site_id=$1 AND event_id=$2',[site,bEvent])).rows[0].visitor_id;
   const bHeads=async()=>(await pool.query('SELECT session_id::text,run_id::text,epoch::text,generation::text FROM analytics_session_contribution_heads WHERE site_id=$1 AND visitor_id=$2 ORDER BY session_id',[site,bVisitor])).rows;
   const bReceipts=async()=>(await pool.query('SELECT b.id::text,b.attempt_id::text,m.row_key,m.body_hash FROM analytics_fact_store_members m JOIN analytics_fact_store_batches b ON b.id=m.batch_id WHERE b.site_id=$1 AND m.visitor_id=$2 ORDER BY b.id,m.row_key',[site,bVisitor])).rows;
   const chRows=async(query:string,params:Record<string,string>)=>{const url=new URL(config.url);url.searchParams.set('query',query+' FORMAT JSON');for(const [name,value]of Object.entries(params))url.searchParams.set('param_'+name,value);const response=await fetch(url,{method:'POST',headers:{'X-ClickHouse-User':config.username,'X-ClickHouse-Key':config.password}});expect(response.ok).toBe(true);const text=await response.text();expect(Buffer.byteLength(text)).toBeLessThan(16*1024*1024);const parsed=JSON.parse(text);expect(parsed.exception??'').toBe('');return parsed.data as Record<string,string>[];};
   const bPhysical=async()=>chRows('SELECT toString(run_id) run_id,toString(attempt_id) attempt_id,row_key,body_hash,body FROM baize_derived_facts_v1 WHERE site_id={site:String} AND visitor_id={visitor:String} ORDER BY run_id,attempt_id,row_key',{site,visitor:bVisitor});
   const beforeHeads=await bHeads(),beforeReceipts=await bReceipts(),beforePhysical=await bPhysical();expect(beforeHeads.length).toBeGreaterThan(0);expect(beforePhysical.length).toBeGreaterThan(0);
   const beforeState=(await pool.query('SELECT processed_generation::text,watermark,epoch::text FROM aggregation_state WHERE site_id=$1',[site])).rows[0];
   process.env.BAIZE_INCREMENTAL_SESSIONS='1';await collect('/dirty-A-publication');const claim=await claimSite(pool);expect(claim).not.toBeNull();let failedRun='';observer=new Client(pool.options);await observer.connect();
   if(fault==='rollback'){await pool.query("CREATE FUNCTION reject_delta_publication() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='published' AND OLD.status<>'published' THEN RAISE EXCEPTION 'injected publication rollback'; END IF; RETURN NEW; END $$");await pool.query('CREATE TRIGGER delta_publication_failure BEFORE UPDATE ON analytics_fact_runs FOR EACH ROW EXECUTE FUNCTION reject_delta_publication()');}
   const operation=rebuildSite(pool,claim!,{afterSnapshot:async()=>{const ready=(await observer!.query("SELECT r.id::text,p.mode FROM analytics_fact_runs r JOIN analytics_incremental_run_plans p ON p.run_id=r.id WHERE r.site_id=$1 AND r.status='ready' ORDER BY r.generation DESC LIMIT 1",[site])).rows[0];expect(ready.mode).toBe('visitor_delta');failedRun=ready.id;
    const uploaded=await chRows('SELECT count() n FROM baize_derived_facts_v1 WHERE site_id={site:String} AND run_id={run:UUID}',{site,run:failedRun});expect(Number(uploaded[0]!.n)).toBeGreaterThan(0);
    if(fault==='lease')await observer!.query('UPDATE aggregation_state SET lease_owner=NULL,lease_until=NULL WHERE site_id=$1',[site]);
    // Explicit publication-fence fault injection; this is not a deletion API acceptance claim.
    if(fault==='deletion_epoch')await observer!.query('UPDATE canonical_event_authority SET deletion_epoch=deletion_epoch+1 WHERE site_id=$1',[site]);
   }});
   if(fault==='rollback')await expect(operation).rejects.toThrow('injected publication rollback');else await expect(operation).rejects.toThrow(fault==='lease'?'FACT_PUBLICATION_FENCE':'INCREMENTAL_PLAN_PUBLICATION_FENCE');
   expect(failedRun).not.toBe('');expect(await bHeads()).toEqual(beforeHeads);expect(await bReceipts()).toEqual(beforeReceipts);expect(await bPhysical()).toEqual(beforePhysical);
   const after=(await pool.query('SELECT processed_generation::text,watermark,epoch::text,generation>processed_generation AS dirty FROM aggregation_state WHERE site_id=$1',[site])).rows[0];expect(after.processed_generation).toBe(beforeState.processed_generation);expect(after.watermark).toEqual(beforeState.watermark);expect(after.epoch).toBe(beforeState.epoch);expect(after.dirty).toBe(true);expect((await pool.query("SELECT count(*)::int n FROM outbox WHERE site_id=$1 AND status='queued'",[site])).rows[0].n).toBeGreaterThan(0);
   expect((await pool.query('SELECT 1 FROM analytics_fact_runs WHERE id=$1',[failedRun])).rowCount).toBe(0);expect((await pool.query('SELECT 1 FROM analytics_fact_store_batches WHERE run_id=$1',[failedRun])).rowCount).toBe(0);
   expect(Number((await chRows('SELECT count() n FROM baize_derived_facts_v1 WHERE site_id={site:String} AND run_id={run:UUID}',{site,run:failedRun}))[0]!.n)).toBeGreaterThan(0);
   const reader=await pool.connect();try{await reader.query('BEGIN');await expect(facts.streamRunRows(reader,site,failedRun,'effects').next()).rejects.toThrow('FACT_STORE_SOURCE_FENCE');await reader.query('ROLLBACK');}finally{reader.release();}expect(pool.waitingCount).toBe(0);
  }finally{if(originalOptIn===undefined)delete process.env.BAIZE_INCREMENTAL_SESSIONS;else process.env.BAIZE_INCREMENTAL_SESSIONS=originalOptIn;}
 }finally{await observer?.end();const cleanup=await pool.connect();try{await cleanup.query('BEGIN');await cache.invalidateSite(cleanup,site);const visitors=(await cleanup.query('SELECT DISTINCT m.visitor_id FROM analytics_remaining_fact_members m JOIN analytics_fact_runs r ON r.id=m.run_id WHERE r.site_id=$1',[site])).rows.map(row=>({visitorId:row.visitor_id}));if(visitors.length){await remaining.eraseSegments(cleanup,site,visitors);await facts.eraseSegments(cleanup,site,visitors);await headers.eraseSegments(cleanup,site,visitors);await canonical.deleteSegments(cleanup,site,visitors,async()=>{});}await cleanup.query('COMMIT');}finally{await cleanup.query('ROLLBACK');cleanup.release();}await runtime?.app.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();await rm(dir,{recursive:true,force:true});}
},90000);
