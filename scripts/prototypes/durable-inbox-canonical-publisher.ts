/** Isolated research adapter. Prepared-row SHA receipts are NOT production wire
 * receipts or daily identity provenance. No collect route imports this module. */
import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import {canonical} from '../../src/server/security.js';
import {CanonicalClickHouse,canonicalEventChecksum,normalizeCanonicalEvent} from '../../src/server/canonical-clickhouse.js';
import {publishCanonicalIngest} from '../../src/server/canonical-ingest.js';
import type {ClickHouseStoreConfig,StoredEvent} from '../../src/server/clickhouse-store.js';
import {InboxError,type PreparedEventRow,type DeletionSegment} from './durable-inbox.js';
export interface PreparedCanonicalPublicationContext{
 client:PoolClient;site:string;sourceEpoch:string;deletionEpoch:string;
 /** Original inbox claim/lease/digest/tombstone checks under its P/site gate. */
 verifyFreshClaim:()=>Promise<void>;
}
const allowed=new Set(['pageview','event','heartbeat','vitals']);
export function preparedCanonicalPublisher(config:ClickHouseStoreConfig){
 return async(rows:ReadonlyArray<PreparedEventRow>,signal:AbortSignal,context:PreparedCanonicalPublicationContext)=>{
  if(!context?.client||!context.verifyFreshClaim||!rows.length||rows.length>100||rows.some(row=>!allowed.has(row.type)||Object.values(row.dimensions).some(value=>typeof value!=='string'))||new Set(rows.map(row=>row.event_id.toLowerCase())).size!==rows.length)throw new InboxError('canonical_prepared_scope',400);
  const {client,site,sourceEpoch,deletionEpoch}=context;
  const verifyAuthority=async()=>{signal.throwIfAborted();const state=(await client.query('SELECT a.authority,a.epoch::text,a.deletion_epoch::text,s.privacy_mode FROM canonical_event_authority a JOIN sites s ON s.id=a.site_id WHERE a.site_id=$1 FOR UPDATE OF a',[site])).rows[0];if(!state||state.authority!=='clickhouse'||state.privacy_mode!=='standard'||state.epoch!==sourceEpoch||state.deletion_epoch!==deletionEpoch)throw new InboxError('canonical_prepared_fence',409);};
  await context.verifyFreshClaim();await verifyAuthority();
  // Use the existing adapter's EOF/hash/receipt whitelist protocol. Cancellation
  // supplements its original transport timeout; never replace either signal.
  const store=new CanonicalClickHouse({...config,fetch:(url,init)=>{const signals=[signal];if(init?.signal)signals.push(init.signal);return (config.fetch??fetch)(url,{...init,signal:AbortSignal.any(signals)});}});
  const fresh=[];
  for(const row of rows){
   const acceptedHash=createHash('sha256').update(canonical(row)).digest('hex');
   const event=normalizeCanonicalEvent({...row,site_id:site,is_bot:false} as StoredEvent);
   const deleted=await client.query('SELECT 1 FROM tombstones WHERE site_id=$1 AND visitor_id=$2 UNION ALL SELECT 1 FROM identity_tombstones WHERE site_id=$1 AND visitor_id=$2 AND started_at<=$3 AND ended_at>$3',[site,event.visitor_id,event.ts]);if(deleted.rowCount)throw new InboxError('deleted_event',410);
   const existing=(await client.query('SELECT hash FROM event_keys WHERE site_id=$1 AND event_id=$2',[site,event.event_id])).rows[0];
   if(existing){if(existing.hash!==acceptedHash)throw new InboxError('canonical_prepared_conflict',409);let published:StoredEvent|null;try{published=await store.readPublishedEvent(client,site,event.event_id);}catch{throw new InboxError('canonical_prepared_body_unavailable',503);}if(!published||canonicalEventChecksum(published)!==canonicalEventChecksum(event))throw new InboxError('canonical_prepared_body_unavailable',503);continue;}
   await client.query('INSERT INTO event_keys(site_id,event_id,hash,ts,visitor_id) VALUES($1,$2,$3,$4,$5)',[site,event.event_id,acceptedHash,event.ts,event.visitor_id]);fresh.push({event,acceptedHash});
  }
  await publishCanonicalIngest(client,site,{store,epoch:sourceEpoch},fresh);
  await context.verifyFreshClaim();await verifyAuthority();
  // Caller alone updates inbox published and commits. Returning is not an ACK.
 };
}

export interface PreparedCanonicalDeletionContext{
 client:PoolClient;site:string;sourceEpoch:string;deletionEpoch:string;
 /** Checks only this prototype transaction's staged PG journal, NOT independent fsync. */
 verifyJournalStaged:()=>Promise<void>;
}
/** Research deletion: caller commits prototype journal/negative state with these
 * PG members. CH ACK followed by PG rollback is NOT cross-database atomic;
 * missing old bodies must fail closed until a successful controlled retry. */
export function preparedCanonicalDeletion(config:ClickHouseStoreConfig){
 return async(segments:ReadonlyArray<DeletionSegment>,context:PreparedCanonicalDeletionContext):Promise<{physicalAck:true}>=>{
  if(!context?.client||!context.verifyJournalStaged||!segments.length||segments.length>1000||segments.some(s=>!s.visitorId||s.from&&!Number.isFinite(Date.parse(s.from))||s.to&&!Number.isFinite(Date.parse(s.to))||s.from&&s.to&&Date.parse(s.from)>=Date.parse(s.to)))throw new InboxError('deletion_scope',400);
  const {client,site,sourceEpoch,deletionEpoch}=context;
  const before=(await client.query('SELECT a.authority,a.epoch::text,a.deletion_epoch::text,s.privacy_mode FROM canonical_event_authority a JOIN sites s ON s.id=a.site_id WHERE a.site_id=$1 FOR UPDATE OF a',[site])).rows[0];if(!before||before.authority!=='clickhouse'||before.privacy_mode!=='standard'||before.epoch!==sourceEpoch||before.deletion_epoch!==deletionEpoch)throw new InboxError('canonical_prepared_fence',409);
  const store=new CanonicalClickHouse(config);const result=await store.deleteSegments(client,site,segments.map(s=>({...s})),context.verifyJournalStaged);if(result.physicalAck!==true)throw new InboxError('canonical_delete_not_acknowledged',503);
  const after=(await client.query('SELECT epoch::text,deletion_epoch::text FROM canonical_event_authority WHERE site_id=$1',[site])).rows[0];if(!after||after.epoch!==sourceEpoch||BigInt(after.deletion_epoch)!==BigInt(deletionEpoch)+1n)throw new InboxError('canonical_prepared_fence',409);
  return {physicalAck:true};
 };
}
