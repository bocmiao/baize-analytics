import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {CanonicalClickHouse,installCanonicalStore,getCanonicalStore,type CanonicalInput} from './canonical-clickhouse.js';
import {CANONICAL_ACTIVATION_READY} from './canonical-migration.js';
import {ApplicationError} from '../shared/error-codes.js';

/** Infrastructure registration does not activate authority or bypass integration readiness. */
export function installCanonicalIngestStore(pool:Pool,store:CanonicalClickHouse|null){
  installCanonicalStore(pool,store);
}
export interface CanonicalIngestTarget {store:CanonicalClickHouse;epoch:string}
/** Caller holds the site gate. A manually changed authority must fail closed too. */
export async function resolveCanonicalIngest(pool:Pool,client:PoolClient,siteId:string):Promise<CanonicalIngestTarget|null>{
  const authority=(await client.query('SELECT authority,epoch::text FROM canonical_event_authority WHERE site_id=$1 FOR UPDATE',[siteId])).rows[0];
  if(!authority||authority.authority==='postgres')return null;
  const store=getCanonicalStore(pool);
  if(!CANONICAL_ACTIVATION_READY||!store)throw new ApplicationError('canonical_unavailable');
  return {store,epoch:authority.epoch};
}
/** Stages only sanitized bodies. Caller inserts metadata/keys under its site gate and
 * owns COMMIT. Successful return is not an ACK: a rollback leaves an invisible CH orphan.
 * Exported separately for actual PG/CH verification while activation remains disabled. */
export async function publishCanonicalIngest(client:PoolClient,siteId:string,target:CanonicalIngestTarget,input:CanonicalInput[]){
  if(!input.length)return;
  try{await target.store.publishBatch(client,siteId,randomUUID(),target.epoch,input);}
  catch{throw new ApplicationError('canonical_unavailable');}
}

/** Same-client retry receipt, after wire-hash and identity/tombstone checks.
 * A privacy replacement is not permission to ACK an absent durable body. */
export async function verifyCanonicalRetryReceipt(client:PoolClient,siteId:string,target:CanonicalIngestTarget,eventId:string):Promise<void>{
 const seen=new Set<string>();let current=eventId;
 try{
  for(let depth=0;depth<64;depth++){
   if(seen.has(current))throw Error('REPLACEMENT_LOOP');seen.add(current);
   const member=await client.query('SELECT 1 FROM canonical_event_members m JOIN canonical_event_batches b USING(site_id,batch_id) WHERE m.site_id=$1 AND m.event_id=$2 AND b.epoch=$3::uuid',[siteId,current,target.epoch]);
   if(member.rowCount){if(!await target.store.readPublishedEvent(client,siteId,current))throw Error('RECEIPT_BODY_MISSING');return;}
   const next=await client.query('SELECT replacement_event_id FROM canonical_provenance_replacements WHERE site_id=$1 AND original_event_id=$2 LIMIT 2',[siteId,current]);
   if(next.rowCount!==1)throw Error('REPLACEMENT_CHAIN_INVALID');current=next.rows[0].replacement_event_id;
  }
  throw Error('REPLACEMENT_CHAIN_LIMIT');
 }catch{throw new ApplicationError('canonical_unavailable');}
}
