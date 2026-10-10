import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {lockSite} from './db.js';
import {getCanonicalStore} from './canonical-clickhouse.js';
import {CANONICAL_ACTIVATION_READY,shadowCanonicalBatch,verifyCanonicalShadow,activateCanonicalAuthority,pruneCanonicalBatch} from './canonical-migration.js';
import {assertCanonicalShadowProvenance} from './canonical-shadow-provenance.js';
import {backfillPgReplayKeys} from './canonical-replay-backfill.js';
export const canonicalActions=['shadow','verify','activate','prune'] as const;
export type CanonicalAction=typeof canonicalActions[number];
export async function canonicalStatus(client:PoolClient,siteId:string){
 const result=(await client.query('SELECT a.authority,a.epoch::text,a.deletion_epoch::text,a.raw_pruned,a.body_mode,p.phase,p.validated_generation::text,p.validated_deletion_epoch::text,p.validated_rows::text,p.validated_at FROM canonical_event_authority a LEFT JOIN canonical_migration_progress p USING(site_id) WHERE a.site_id=$1',[siteId])).rows[0];
 return {activationReady:CANONICAL_ACTIVATION_READY,state:result??null};
}
/** A single explicit local/operator action. No implicit switch or unbounded RAM;
 * ingestion/deletion cannot race the verification or metadata publication. */
export async function runCanonicalOperation(client:PoolClient,pool:Pool,siteId:string,action:CanonicalAction,actorId:string|null){
 await lockSite(client,siteId);
 if(!(await client.query('SELECT 1 FROM sites WHERE id=$1',[siteId])).rowCount)throw Error('CANONICAL_SITE_REQUIRED');
 const store=getCanonicalStore(pool);if(!store)throw Error('CANONICAL_STORE_REQUIRED');
 let result:unknown;
 if(action==='shadow'||action==='verify'){
  await assertCanonicalShadowProvenance(client,siteId);
  await backfillPgReplayKeys(client,siteId);
 }
 if(action==='shadow'){
  const state=(await client.query('SELECT epoch::text FROM canonical_event_authority WHERE site_id=$1',[siteId])).rows[0];
  result=await shadowCanonicalBatch(client,store,siteId,state?.epoch??randomUUID());
 }else if(action==='verify')result=await verifyCanonicalShadow(client,store,siteId);
 else if(action==='activate')result=await activateCanonicalAuthority(client,siteId);
 else{const state=(await client.query('SELECT epoch::text FROM canonical_event_authority WHERE site_id=$1',[siteId])).rows[0];if(!state)throw Error('CANONICAL_AUTHORITY_REQUIRED');result=await pruneCanonicalBatch(client,siteId,state.epoch,store);}
 await client.query('INSERT INTO audit_logs(actor_id,site_id,action,target) VALUES($1,$2,$3,$4)',[actorId,siteId,'canonical.'+action,JSON.stringify(result)]);
 return result;
}
