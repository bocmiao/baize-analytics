import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {Pool} from 'pg';
import {createApp} from '../../src/server/app.js';
import {claimSite,rebuildSite} from '../../src/server/worker.js';
import {CanonicalClickHouse} from '../../src/server/canonical-clickhouse.js';
import {installCanonicalEventStore} from '../../src/server/event-store.js';
import {ClickHouseSessionHeaderStore,installSessionHeaderStore} from '../../src/server/session-header-store.js';
import {ClickHouseFactStore,installFactStore} from '../../src/server/fact-store.js';
/** Actual HTTP collector -> controlled 038 source -> actual immutable 043/044
 * worker publication. Authority selection below is explicit fixture setup,
 * not a claim that production activation/047 cutover has been validated. */
export async function createRemainingFactDeleteFixture(options:{deletedAnchor?:boolean;emptyPrefix?:boolean;archivedB?:boolean}={}){
 if(!process.env.TEST_DATABASE_URL||!process.env.CLICKHOUSE_TEST_URL)throw Error('REAL_PG_CH_REQUIRED');
 const schema='remaining_delete_'+randomUUID().replaceAll('-',''),siteId=randomUUID(),admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1,options:`-c search_path=${schema}`}),dir=await mkdtemp('/tmp/baize-remaining-delete-');
 const config={url:process.env.CLICKHOUSE_TEST_URL,username:'baize',password:'local-test-only'},canonical=new CanonicalClickHouse(config),headers=new ClickHouseSessionHeaderStore(config),facts=new ClickHouseFactStore(config);
 await admin.query(`CREATE SCHEMA ${schema}`);const runtime=await createApp({pool,redis:null,background:false,dataDir:dir,keyDir:dir}),boundary=Date.now()-86400000,bridge=boundary-15*60000,visitorId=randomUUID(),otherVisitorId=randomUUID(),pageId=randomUUID(),otherPageId=randomUUID();
 const runWorker=async()=>{const claim=await claimSite(pool);if(!claim)throw Error('EXPECTED_DIRTY_CLAIM');if(!await rebuildSite(pool,claim))throw Error('REBUILD_NOT_PUBLISHED');};
 await pool.query("INSERT INTO sites(id,name,domain,salt_secret,retention_days,timezone) VALUES($1,'remaining-delete','example.test','trusted-fixture',2,'UTC')",[siteId]);await pool.query('INSERT INTO aggregation_state(site_id) VALUES($1)',[siteId]);
 const base=await runtime.app.listen({host:'127.0.0.1',port:0});
 const events=[
 {type:'pageview',ts:boundary-31*60000,path:'/before'},
 {type:'event',ts:boundary-30*60000-1000,path:'/before',event_name:'public-click',props:{plan:'免费'}},
 {type:'vitals',ts:boundary-30*60000,path:'/before',vitals:{lcp:100}},
 {type:'identify',ts:options.deletedAnchor?boundary-32*60000:bridge-1000,path:'/before',user_id:'deleted-A'},
 {type:'heartbeat',ts:bridge,path:'/before',visible_ms:700,interval_start:bridge-1000,interval_end:bridge},
 {type:'identify',ts:options.emptyPrefix?boundary+1000:bridge+1000,path:'/before',user_id:'retained-B'},
 ...(options.archivedB?[{type:'pageview',ts:boundary-5*60000,path:'/b-archive'}]:[]),
 {type:'pageview',ts:boundary+60000,path:'/after'},
 {type:'pageview',ts:boundary+120000,path:'/later'},
 {type:'pageview',ts:boundary-3600000,path:'/other',visitor_id:otherVisitorId,page_id:otherPageId},
 ].map(event=>({event_id:randomUUID(),visitor_id:visitorId,page_id:pageId,url:'https://example.test'+event.path,...event}));
 const response=await fetch(base+'/api/collect',{method:'POST',headers:{'content-type':'application/json',origin:'https://example.test','user-agent':'Mozilla/5.0 Chrome/120.0'},body:JSON.stringify({protocol_version:1,site_id:siteId,sdk:'remaining-fact-native-fixture',sent_at:Date.now(),events})});
 if(response.status!==202||(await response.json() as {accepted:number}).accepted!==events.length)throw Error('NATIVE_COLLECTION_NOT_ACCEPTED');
 await canonical.initialize();await headers.initialize();await facts.initialize();installCanonicalEventStore(pool,canonical);installSessionHeaderStore(pool,headers);installFactStore(pool,facts);
 const authorityEpoch=randomUUID();await pool.query("INSERT INTO canonical_event_authority(site_id,epoch,authority) VALUES($1,$2,'clickhouse')",[siteId,authorityEpoch]);
 const uploader=await pool.connect();try{await uploader.query('BEGIN');const accepted=(await uploader.query('SELECT e.*,k.hash FROM events e JOIN event_keys k ON k.site_id=e.site_id AND k.event_id=e.event_id WHERE e.site_id=$1',[siteId])).rows;await canonical.publishBatch(uploader,siteId,randomUUID(),authorityEpoch,accepted.map(({hash,...event})=>({event,acceptedHash:hash})));await uploader.query('COMMIT');}finally{await uploader.query('ROLLBACK');uploader.release();}
 await runWorker();
 const snapshot:Record<string,unknown>[]=[];const reader=await pool.connect();try{await reader.query('BEGIN');const runs=(await reader.query("SELECT id FROM analytics_fact_runs WHERE site_id=$1 AND status='published' ORDER BY generation DESC",[siteId])).rows;for(const run of runs)for await(const batch of facts.streamRunRows(reader,siteId,run.id,'effects')){snapshot.push(...batch as unknown as Record<string,unknown>[]);if(snapshot.length>1000)throw Error('FIXTURE_SNAPSHOT_BUDGET');}await reader.query('COMMIT');}finally{await reader.query('ROLLBACK');reader.release();}
 /** Real PG trigger intentionally fails after CH physical ACK, before commit.
  * The caller must assert CH victim absent and PG receipt still present, then
  * clear this fault and retry the same durable journal scope. */
 // Use session-local fixture value through a parameterized setup table instead
 // of interpolating any body/site/user strings into executable SQL.
 const armRollback=async()=>{await pool.query('CREATE TABLE remaining_delete_fault(visitor_id text PRIMARY KEY)');await pool.query('INSERT INTO remaining_delete_fault VALUES($1)',[visitorId]);await pool.query("CREATE FUNCTION fail_remaining_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM remaining_delete_fault WHERE visitor_id=OLD.visitor_id) THEN RAISE EXCEPTION 'remaining physical ACK PG rollback'; END IF; RETURN OLD; END $$");await pool.query('CREATE TRIGGER remaining_delete_fault BEFORE DELETE ON canonical_shadow_provenance FOR EACH ROW EXECUTE FUNCTION fail_remaining_delete()');};
 const clearRollback=async()=>{await pool.query('DROP TRIGGER IF EXISTS remaining_delete_fault ON canonical_shadow_provenance');await pool.query('DROP FUNCTION IF EXISTS fail_remaining_delete()');await pool.query('DROP TABLE IF EXISTS remaining_delete_fault');};
 const close=async()=>{await clearRollback();const c=await pool.connect();try{await c.query('BEGIN');const scope=[{visitorId},{visitorId:otherVisitorId}];await facts.eraseSegments(c,siteId,scope);await headers.eraseSegments(c,siteId,scope);await canonical.deleteSegments(c,siteId,scope,async()=>{});await c.query('COMMIT');}finally{await c.query('ROLLBACK');c.release();}await runtime.app.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();await rm(dir,{recursive:true,force:true});};
 return {pool,runtime,siteId,visitorId,otherVisitorId,boundary,bridge,dir,events,canonical,headers,facts,snapshot,runWorker,armRollback,clearRollback,close};
}
