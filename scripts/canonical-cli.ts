import {loadVerifiedCanonicalRawBackup} from '../src/server/canonical-raw-backup-readiness.js';
import {createPool,transaction,lockSite} from '../src/server/db.js';
import {CanonicalClickHouse,installCanonicalStore} from '../src/server/canonical-clickhouse.js';
import {canonicalActions,canonicalStatus,runCanonicalOperation,type CanonicalAction} from '../src/server/canonical-operations.js';
import {installSessionHeaderStore} from '../src/server/session-header-store.js';
import {installFactStore} from '../src/server/fact-store.js';
import {installRemainingFactStore} from '../src/server/remaining-fact-store.js';
import {installCacheStore} from '../src/server/cache-store.js';
import {readOpsStableKey} from '../src/server/ops-stable-key.js';
import {loadVerifiedFactBackup} from '../src/server/fact-backup-readiness.js';
import {activateStrictFactBodies} from '../src/server/strict-fact-storage.js';
import {migratePublishedFactClosure} from '../src/server/fact-closure-migration.js';
import {migratePublishedHeaderClosure} from '../src/server/session-header-publication.js';
import {migratePublishedCacheClosure} from '../src/server/cache-closure-migration.js';
// Uses existing private operator configuration. Never prints credentials or URLs.
const [action,siteId,packageDirectory,journalDir]=process.argv.slice(2);
if(!siteId||!['status','migrate-facts','strict',...canonicalActions].includes(action)||!process.env.DATABASE_URL||!process.env.CLICKHOUSE_URL||(action==='strict'||action==='prune')&&(!packageDirectory||!journalDir))throw Error('CANONICAL_CLI_CONFIGURATION_REQUIRED');
const pool=createPool(),store=new CanonicalClickHouse({url:process.env.CLICKHOUSE_URL,username:process.env.CLICKHOUSE_USER??'default',password:process.env.CLICKHOUSE_PASSWORD??''});
let stableKey:Buffer|undefined;
try{
 if(action!=='status')await store.initialize();installCanonicalStore(pool,store);
 let result:unknown;
 if(action==='strict'||action==='migrate-facts'){
  const headers=await store.createSessionHeaderStore(),facts=await store.createFactStore(),remaining=await store.createRemainingFactStore(),cache=await store.createCacheStore();
  await headers.initialize();await facts.initialize();await remaining.initialize();await cache.initialize();
  installSessionHeaderStore(pool,headers);installFactStore(pool,facts);installRemainingFactStore(pool,remaining);installCacheStore(pool,cache);
  if(action==='strict')stableKey=await readOpsStableKey();
  result=await transaction(pool,async c=>{
   await lockSite(c,siteId);
   const state=(await c.query('SELECT epoch,generation::text,generation=processed_generation AS clean,lease_until>clock_timestamp() AS leased FROM aggregation_state WHERE site_id=$1 FOR UPDATE',[siteId])).rows[0];
   if(!state?.clean||state.leased)throw Error('FACT_STRICT_CUTOVER_FENCE');
   if(action==='migrate-facts'){
    const fence={expectedAggregationEpoch:state.epoch,expectedGeneration:state.generation,verifyLiveFence:async()=>{const current=(await c.query('SELECT epoch,generation::text,lease_until>clock_timestamp() AS leased FROM aggregation_state WHERE site_id=$1',[siteId])).rows[0];if(current?.epoch!==state.epoch||current.generation!==state.generation||current.leased)throw Error('FACT_STRICT_CUTOVER_FENCE');}};
    const headersResult=await migratePublishedHeaderClosure(c,headers,siteId,fence),factsResult=await migratePublishedFactClosure(c,siteId,{headers,facts,remaining},fence),cacheResult=await migratePublishedCacheClosure(c,cache,siteId,fence,{pool});
    const value={headers:headersResult,facts:factsResult,cache:cacheResult,pruned:false,strict:false};
    await c.query('INSERT INTO audit_logs(actor_id,site_id,action,target)VALUES(NULL,$1,$2,$3)',[siteId,'canonical.migrate-facts',JSON.stringify(value)]);return value;
   }
   const proof=await loadVerifiedFactBackup(c,{packageDirectory,journalDir,key:stableKey!,stores:{headers,facts,remaining,cache},scope:'all'});
   const value=await activateStrictFactBodies(c,siteId,proof,{facts,remaining});
   await c.query('INSERT INTO audit_logs(actor_id,site_id,action,target)VALUES(NULL,$1,$2,$3)',[siteId,'canonical.strict',JSON.stringify(value)]);return value;
  });
 }else if(action==='prune'){stableKey=await readOpsStableKey();result=await transaction(pool,async c=>{await lockSite(c,siteId);const proof=await loadVerifiedCanonicalRawBackup(c,{siteId,packageDirectory,journalDir,key:stableKey!,store});return runCanonicalOperation(c,pool,siteId,'prune',null,proof);});}else result=await transaction(pool,c=>action==='status'?canonicalStatus(c,siteId):runCanonicalOperation(c,pool,siteId,action as CanonicalAction,null));
 console.log(JSON.stringify(result));
}catch(error){const code=error instanceof Error&&/^(?:CANONICAL|SHADOW_PROVENANCE|REPLAY_BACKFILL|FACT_BACKUP|FACT_STRICT|CACHE)_[A-Z_]+$/.test(error.message)?error.message:'CANONICAL_OPERATION_FAILED';console.error(JSON.stringify({error:code}));process.exitCode=1;}
finally{stableKey?.fill(0);await pool.end();}
